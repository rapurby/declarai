import { authAPI } from '../services/api.js'

export async function login(email, password) {
  const res = await authAPI.login({ email, password })
  const { access_token, user_id, full_name, role, email: userEmail } = res.data
  const user = { id: user_id, name: full_name, role, email: userEmail }
  localStorage.setItem('declarai_token', access_token)
  localStorage.setItem('declarai_user', JSON.stringify(user))
  return user
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('declarai_user') || 'null')
  } catch { return null }
}

export function getToken() {
  return localStorage.getItem('declarai_token')
}

export function logout() {
  localStorage.removeItem('declarai_user')
  localStorage.removeItem('declarai_token')
}

export function isAuthenticated() {
  const token = getToken()
  const user = getUser()
  if (!token || !user) return false
  // Decode JWT expiry without a library
  try {
    // JWT uses URL-safe Base64 (- and _ instead of + and /); pad to multiple of 4
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(
      Math.ceil(token.split('.')[1].length / 4) * 4, '='
    )
    const payload = JSON.parse(atob(b64))
    return payload.exp * 1000 > Date.now()
  } catch { return false }
}

export function hasPermission(role, action) {
  const PERMISSIONS = {
    admin:    ['view_dashboard', 'upload', 'view_declarations', 'submit', 'use_simulator', 'manage_users'],
    operator: ['view_dashboard', 'upload', 'view_declarations', 'submit', 'use_simulator'],
    viewer:   ['view_dashboard', 'view_declarations'],
  }
  return PERMISSIONS[role]?.includes(action) ?? false
}
