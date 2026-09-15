import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE_URL + '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Railway spins the backend container down when it's idle. The first request
// after that hits a container still booting (RapidOCR model load takes a
// while), so it fails at the network layer before the app can answer —
// which the browser then reports as a CORS error, since a response that
// never arrived carries no Access-Control-Allow-Origin header.
// Retrying transparently turns that first-click failure into a slightly
// slower first click instead of a visible error.
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2500

// Only retry when the server never answered (cold start, dropped connection)
// or answered with a gateway-level error. A real 4xx/5xx from the app itself
// is a genuine result and must surface to the caller unchanged.
const isColdStartFailure = (err) => {
  if (err.response) return [502, 503, 504].includes(err.response.status)
  return err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK' || !err.status
}

// Never retry anything that changes state — a POST that actually reached the
// server and timed out on the way back would otherwise run twice.
const isRetryableMethod = (cfg) => {
  const method = (cfg?.method || 'get').toLowerCase()
  if (['get', 'head', 'options'].includes(method)) return true
  return cfg?.url?.includes('/auth/login')  // login is safe to repeat
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('declarai_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('declarai_user')
      localStorage.removeItem('declarai_token')
      window.location.href = '/login'
      return Promise.reject(err)
    }

    const cfg = err.config
    if (cfg && isColdStartFailure(err) && isRetryableMethod(cfg)) {
      cfg._retryCount = cfg._retryCount || 0
      if (cfg._retryCount < MAX_RETRIES) {
        cfg._retryCount += 1
        await sleep(RETRY_DELAY_MS * cfg._retryCount)  // 2.5s, then 5s
        return api(cfg)
      }
    }

    return Promise.reject(err)
  }
)

export const declarationAPI = {
  upload: (file, onProgress, sessionId, docName) => {
    const fd = new FormData()
    fd.append('file', file)
    if (sessionId) fd.append('session_id', sessionId)
    if (docName) fd.append('doc_name', docName)
    return api.post('/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round(e.loaded * 100 / e.total)),
    })
  },
  getFileUrl: (id) => {
    const token = localStorage.getItem('declarai_token')
    return `${BASE_URL}/api/v1/declarations/${id}/file?t=${encodeURIComponent(token)}`
  },
  uploadBatch: (files, onProgress) => {
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    return api.post('/upload/batch', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round(e.loaded * 100 / e.total)),
    })
  },
  list: (params) => api.get('/declarations', { params }),
  get: (id) => api.get(`/declarations/${id}`),
  update: (id, data) => api.patch(`/declarations/${id}`, data),
  submit: (id) => api.post(`/declarations/${id}/submit`),
  delete: (id) => api.delete(`/declarations/${id}`),
  stats: () => api.get('/declarations/stats'),
  status: (id) => api.get(`/status/${id}`),
  audit: (id) => api.get(`/declarations/${id}/audit`),
  exportAjuExcel: (id) => api.get(`/declarations/${id}/export-aju-excel`, { responseType: 'blob' }),
}

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }),
  updateProfile: (full_name) =>
    api.patch('/auth/me', { full_name }),
}

export const adminAPI = {
  listUsers: () => api.get('/admin/users'),
  approveUser: (id) => api.patch(`/admin/users/${id}/approve`),
  deactivateUser: (id) => api.patch(`/admin/users/${id}/deactivate`),
  changeRole: (id, role) => api.patch(`/admin/users/${id}/role`, null, { params: { role } }),
}

export const scanAPI = {
  createSession: () => api.post('/scan/session'),
  getSession: (token) => api.get(`/scan/session/${token}`),
  uploadScan: (token, files, docName) => {
    const fd = new FormData()
    const arr = Array.isArray(files) ? files : [files]
    arr.forEach(f => fd.append('files', f))
    if (docName) fd.append('doc_name', docName)
    return api.post(`/scan/upload/${token}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

export const simulatorAPI = {
  submit: (payload) => api.post('/simulator/submit', payload),
  schema: () => api.get('/simulator/schema'),
}

export const getWsUrl = (path) => {
  const base = (import.meta.env.VITE_API_URL || window.location.origin).replace(/^http/, 'ws')
  return `${base}${path}`
}

export default api
