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

export async function fetchSchema(dbName, collection) {
  return request(`/api/${dbName}/${collection}`, { method: 'OPTIONS' })
}

export async function putDocs(dbName, collection, docs) {
  return request(`/api/${dbName}/${collection}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(docs)
  })
}

export async function patchDoc(dbName, collection, doc) {
  return request(`/api/${dbName}/${collection}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc)
  })
}

export async function deleteDocs(dbName, collection, filterStr) {
  const qs = filterStr ? '?' + encodeURIComponent(filterStr) : ''
  return request(`/api/${dbName}/${collection}${qs}`, { method: 'DELETE' })
}

export async function setMeta(dbName, collection, meta) {
  return request(`/api/${dbName}/${collection}`, {
    method: 'OPTIONS',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta)
  })
}
