import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE_URL + '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('declarai_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('declarai_user')
      localStorage.removeItem('declarai_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const declarationAPI = {
  upload: (file, onProgress, sessionId) => {
    const fd = new FormData()
    fd.append('file', file)
    if (sessionId) fd.append('session_id', sessionId)
    return api.post('/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round(e.loaded * 100 / e.total)),
    })
  },
  uploadBatch: (files) => {
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    return api.post('/upload/batch', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  list: (params) => api.get('/declarations', { params }),
  get: (id) => api.get(`/declarations/${id}`),
  update: (id, data) => api.patch(`/declarations/${id}`, data),
  submit: (id) => api.post(`/declarations/${id}/submit`),
  delete: (id) => api.delete(`/declarations/${id}`),
  stats: () => api.get('/declarations/stats'),
  status: (id) => api.get(`/status/${id}`),
  audit: (id) => api.get(`/declarations/${id}/audit`),
}

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
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
