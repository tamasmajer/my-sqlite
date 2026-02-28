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
  // Support hash fragment, basic-auth, query param, or env var
  const token = (url.hash ? url.hash.slice(1) : '') || url.username || url.password || url.searchParams.get('token') || (typeof process !== 'undefined' ? process?.env?.MY_SQLITE_TOKEN : '')
  const endpoint = url.origin + url.pathname.replace(/\/$/, '')

  const conn = { endpoint, token }
  connectionCache.set(connectionString, conn)
  return conn
}

export async function get(conn, query) {
  if (typeof conn === 'string') conn = connect(conn)
  if (!query) {
    return Fetch.getJson(conn.endpoint, authHeaders(conn))
  }
  const [collection] = Object.keys(query)
  const filter = query[collection]
  const qs = Object.keys(filter).length ? '?' + encodeURIComponent(JSON.stringify(filter)) : ''
  const headers = authHeaders(conn)
  return Fetch.getJson(`${conn.endpoint}/${collection}${qs}`, headers)
}

export async function post(conn, body) {
  if (typeof conn === 'string') conn = connect(conn)
  return Fetch.postJson(conn.endpoint, body, authHeaders(conn))
}


function authHeaders(conn) {
  return conn.token ? { authorization: `Bearer ${conn.token}` } : {}
}
