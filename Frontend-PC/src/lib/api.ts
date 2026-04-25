export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export function fullUrl(path: string) {
  return path.startsWith('http') ? path : `${API_BASE}${path}`
}
