import * as Crypto from './access/crypto.js'

const sessions = new Map()

export function createSession() {
  const id = Crypto.token(24)
  sessions.set(id, { created: Date.now() })
  return id
}

export function validSession(id) {
  return sessions.has(id)
}

export function parseCookie(header) {
  if (!header) return {}
  const result = {}
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=')
    if (k && v) result[k] = v
  }
  return result
}

export function checkApiAuth(req, token) {
  if (!token) return true
  return req.headers.authorization === `Bearer ${token}`
}

export function checkAdminAuth(req, token) {
  if (!token) return true
  const cookies = parseCookie(req.headers.cookie)
  return validSession(cookies.session)
}
