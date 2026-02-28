// Fetch facade — wraps fetch for server communication
import * as Browser from './browser.js'

async function request(path, opts = {}) {
  const headers = { ...opts.headers }
  const token = Browser.storageGet('my_sqlite_token')
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...opts, headers })
  if (!res.ok) {
    let msg = res.statusText
    try { const data = await res.json(); if (data.error) msg = data.error } catch { }
    throw new Error(msg)
  }
  return res.json()
}

export function getToken() {
  return Browser.storageGet('my_sqlite_token')
}

export function setToken(token) {
  Browser.storageSet('my_sqlite_token', token)
}

export async function fetchDatabases() {
  return request('/api')
}

export async function fetchCollections(dbName) {
  return request(`/api/${dbName}`)
}

export async function fetchQuery(dbName, collection, filterStr, skip = 0, limit = 50) {
  const filter = filterStr ? JSON.parse(filterStr) : {}
  filter.$limit = limit
  filter.$skip = skip
  const qs = '?' + encodeURIComponent(JSON.stringify(filter))
  return request(`/api/${dbName}/${collection}${qs}`)
}

export async function postBatch(dbName, payload) {
  return request(`/api/${dbName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}
