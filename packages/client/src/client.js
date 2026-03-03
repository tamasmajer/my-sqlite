import * as Fetch from './access/fetch.js'

const connectionCache = new Map()

function connect(connectionString) {
  if (connectionCache.has(connectionString)) {
    return connectionCache.get(connectionString)
  }

  let formattedString = connectionString
  if (!/^[a-zA-Z]+:\/\//.test(formattedString)) {
    const isLocal = formattedString.includes('localhost') || formattedString.startsWith('127.0.0.1')
    formattedString = (isLocal ? 'http://' : 'https://') + formattedString
  }
  const url = new URL(formattedString)
  const token = (url.hash ? url.hash.slice(1) : '') || url.username || url.password || url.searchParams.get('token') || (typeof process !== 'undefined' ? process?.env?.MY_SQLITE_TOKEN : '')
  const endpoint = url.origin + url.pathname.replace(/\/$/, '')

  const conn = { endpoint, token }
  connectionCache.set(connectionString, conn)
  return conn
}

// GET — query docs
// get(conn, {filter})  → query by filter
// get(conn, 'id')      → get by id
// get(conn, ['id1','id2']) → get by ids
// get(conn, {})        → get all
// get(conn)            → list (collections or dbs depending on URL)
export async function get(conn, queryOrId) {
  if (typeof conn === 'string') conn = connect(conn)
  if (queryOrId === undefined) {
    return Fetch.getJson(conn.endpoint, authHeaders(conn))
  }
  const filter = toFilter(queryOrId)
  const qs = '?' + encodeURIComponent(JSON.stringify(filter))
  return Fetch.getJson(conn.endpoint + qs, authHeaders(conn))
}

// PUT — upsert (full replace)
export async function put(conn, docOrDocs) {
  if (typeof conn === 'string') conn = connect(conn)
  return Fetch.putJson(conn.endpoint, docOrDocs, authHeaders(conn))
}

// PATCH — partial update
export async function patch(conn, docOrDocs) {
  if (typeof conn === 'string') conn = connect(conn)
  return Fetch.patchJson(conn.endpoint, docOrDocs, authHeaders(conn))
}

// DELETE — delete docs or drop collection
// del(conn)                  → drop collection
// del(conn, 'id')            → delete by id
// del(conn, ['id1','id2'])   → delete by ids
// del(conn, {filter})        → delete by query
// del(conn, {})              → delete all data, keep schema
export async function del(conn, filterOrId) {
  if (typeof conn === 'string') conn = connect(conn)
  if (filterOrId === undefined) {
    return Fetch.deleteWithQuery(conn.endpoint, authHeaders(conn))
  }
  const filter = toFilter(filterOrId)
  const qs = '?' + encodeURIComponent(JSON.stringify(filter))
  return Fetch.deleteWithQuery(conn.endpoint + qs, authHeaders(conn))
}

// OPTIONS — read or set schema
// options(conn)        → read schema
// options(conn, meta)  → set schema (indexes, key)
export async function options(conn, meta) {
  if (typeof conn === 'string') conn = connect(conn)
  return Fetch.optionsJson(conn.endpoint, meta, authHeaders(conn))
}

// ID helper
export function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

// --- Helpers ---

function toFilter(queryOrId) {
  if (typeof queryOrId === 'string' || typeof queryOrId === 'number') {
    return { id: queryOrId }
  }
  if (Array.isArray(queryOrId)) {
    return { id: { $in: queryOrId } }
  }
  return queryOrId
}

function authHeaders(conn) {
  return conn.token ? { authorization: `Bearer ${conn.token}` } : {}
}
