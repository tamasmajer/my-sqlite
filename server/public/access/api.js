// Fetch facade — wraps fetch for server communication
import * as Browser from './env/browser.js'

async function request(path, opts = {}) {
  const headers = { ...opts.headers }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const base = normalizeServerUrl(getServer())
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
  Browser.storageSet('my_sqlite_server', normalizeServerUrl(url))
}

export function getServers() {
  try {
    const list = JSON.parse(Browser.storageGet('my_sqlite_servers') || '[]')
    const map = new Map()
    for (const s of list) {
      const url = normalizeServerUrl(s.url)
      if (!url) continue
      if (!map.has(url)) map.set(url, { url, token: s.token || '' })
      else if (s.token) map.get(url).token = s.token
    }
    return [...map.values()]
  } catch { return [] }
}

export function addServer(url, token) {
  const servers = getServers()
  const norm = normalizeServerUrl(url)
  if (!servers.find(s => s.url === norm)) {
    servers.push({ url: norm, token })
    Browser.storageSet('my_sqlite_servers', JSON.stringify(servers))
  }
}

export function removeServer(url) {
  const norm = normalizeServerUrl(url)
  const servers = getServers().filter(s => s.url !== norm)
  Browser.storageSet('my_sqlite_servers', JSON.stringify(servers))
  if (getServer() === norm) setServer('')
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
  const current = getServers()
  const map = new Map(current.map(s => [s.url, { ...s }]))
  for (const s of configServers || []) {
    const url = normalizeServerUrl(s.url)
    if (!url) continue
    if (!map.has(url)) map.set(url, { url, token: s.token || '' })
    else if (s.token) map.get(url).token = s.token
  }
  Browser.storageSet('my_sqlite_servers', JSON.stringify([...map.values()]))
}

function normalizeServerUrl(url) {
  const raw = (url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '')
  const isLocal = raw.includes('localhost') || raw.startsWith('127.0.0.1')
  const proto = isLocal ? 'http://' : 'https://'
  return (proto + raw).replace(/\/+$/, '')
}

export async function fetchDatabases() {
  return request('/api')
}

export async function fetchCollections(dbName) {
  return request(`/api/${dbName}`)
}

export async function fetchQuery(dbName, collection, filterStr, skip = 0, limit = 50) {
  if (!filterStr) {
    const qs = '?' + encodeURIComponent(JSON.stringify({ $limit: limit, $skip: skip }))
    return request(`/api/${dbName}/${collection}${qs}`)
  }
  try {
    const filter = JSON.parse(filterStr)
    filter.$limit = limit
    filter.$skip = skip
    const qs = '?' + encodeURIComponent(JSON.stringify(filter))
    return request(`/api/${dbName}/${collection}${qs}`)
  } catch {
    const base = filterStr.trim()
    const qs = '?' + base + (base ? '&' : '') + `$limit=${limit}&$skip=${skip}`
    return request(`/api/${dbName}/${collection}${qs}`)
  }
}

export async function fetchCount(dbName, collection, filterStr) {
  if (!filterStr) {
    const qs = '?' + encodeURIComponent(JSON.stringify({ $count: true }))
    return request(`/api/${dbName}/${collection}${qs}`)
  }
  try {
    const filter = JSON.parse(filterStr)
    filter.$count = true
    const qs = '?' + encodeURIComponent(JSON.stringify(filter))
    return request(`/api/${dbName}/${collection}${qs}`)
  } catch {
    const base = filterStr.trim()
    const qs = '?' + base + (base ? '&' : '') + `$count=true`
    return request(`/api/${dbName}/${collection}${qs}`)
  }
}

export async function fetchSchema(dbName, collection) {
  const cols = await fetchCollections(dbName)
  return (cols || []).find(c => c.id === collection) || { id: collection, columns: [], index: [], search: [], key: 'id' }
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
  return request(`/api/${dbName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: collection, ...meta })
  })
}
