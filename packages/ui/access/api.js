// Fetch facade — wraps fetch for server communication
import * as Browser from './browser.js'

async function request(path, opts = {}) {
  const headers = { ...opts.headers }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const base = getServer()
  const url = base ? base + path : path

  const res = await fetch(url, { ...opts, headers })
  if (!res.ok) {
    let msg = res.statusText
    try { const data = await res.json(); if (data.error) msg = data.error } catch { }
    throw new Error(msg)
  }
  return res.json()
}

// --- Server management ---

export function getServer() {
  return Browser.storageGet('my_sqlite_server')
}

export function setServer(url) {
  Browser.storageSet('my_sqlite_server', url)
}

export function getServers() {
  try { return JSON.parse(Browser.storageGet('my_sqlite_servers') || '[]') } catch { return [] }
}

export function addServer(url, token) {
  const servers = getServers()
  if (!servers.find(s => s.url === url)) {
    servers.push({ url, token })
    Browser.storageSet('my_sqlite_servers', JSON.stringify(servers))
  }
}

export function removeServer(url) {
  const servers = getServers().filter(s => s.url !== url)
  Browser.storageSet('my_sqlite_servers', JSON.stringify(servers))
  if (getServer() === url) setServer('')
}

// --- Token (per-server) ---

function tokenKey() {
  const server = getServer()
  return server ? 'my_sqlite_token_' + server : 'my_sqlite_token'
}

export function getToken() {
  return Browser.storageGet(tokenKey())
}

export function setToken(token) {
  Browser.storageSet(tokenKey(), token)
}

export async function fetchConfig() {
  try {
    const res = await fetch('/admin/config')
    if (!res.ok) return {}
    return res.json()
  } catch { return {} }
}

export function mergeServers(configServers) {
  for (const s of configServers) {
    addServer(s.url, s.token)
  }
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

export async function fetchCount(dbName, collection, filterStr) {
  const filter = filterStr ? JSON.parse(filterStr) : {}
  filter.$count = true
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

export async function dropDatabase(dbName) {
  return request(`/api/${dbName}`, { method: 'DELETE' })
}

export async function setMeta(dbName, collection, meta) {
  return request(`/api/${dbName}/${collection}`, {
    method: 'OPTIONS',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta)
  })
}
