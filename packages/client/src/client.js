import * as Fetch from './access/fetch.js'

export function connect(connectionString) {
  const url = new URL(connectionString)
  const token = url.searchParams.get('token')
  const db = url.pathname.replace(/^\//, '')
  const base = `${url.protocol}//${url.host}`
  return { base, db, token }
}

export async function get(conn, query) {
  const [collection] = Object.keys(query)
  const filter = query[collection]
  const qs = Object.keys(filter).length ? '?' + encodeURIComponent(JSON.stringify(filter)) : ''
  const headers = authHeaders(conn)
  return Fetch.getJson(`${conn.base}/api/${conn.db}/${collection}${qs}`, headers)
}

export async function post(conn, body) {
  return Fetch.postJson(`${conn.base}/api/${conn.db}`, body, authHeaders(conn))
}

export async function list(conn) {
  return Fetch.getJson(`${conn.base}/api/${conn.db}`, authHeaders(conn))
}


function authHeaders(conn) {
  return conn.token ? { authorization: `Bearer ${conn.token}` } : {}
}
