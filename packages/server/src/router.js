import * as Schema from './schema.js'
import * as Data from './data.js'
import * as Query from './query.js'
import * as Auth from './auth.js'
import * as Html from './html.js'
import * as Fs from './access/fs.js'

export function route(req, res, config) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  if (path.startsWith('/api/')) {
    if (!Auth.checkApiAuth(req, config.token)) {
      json(res, 401, { ok: 0, error: 'Unauthorized' })
      return
    }
    handleApi(req, res, config, url)
    return
  }

  if (path.startsWith('/admin')) {
    handleAdmin(req, res, config, url)
    return
  }

  res.writeHead(404)
  res.end('not found')
}

// --- API ---

function handleApi(req, res, config, url) {
  const parts = url.pathname.replace('/api/', '').split('/').filter(Boolean)
  const dbName = parts[0]
  const collection = parts[1]

  if (!dbName) { json(res, 400, { ok: 0, error: 'Missing database name' }); return }

  if (req.method === 'GET') {
    try {
      handleGet(res, config, dbName, collection, url.search?.slice(1))
    } catch (err) {
      json(res, 500, { ok: 0, error: err.message })
    }
  } else if (req.method === 'POST') {
    readBody(req, body => {
      try {
        handlePost(res, config, dbName, body)
      } catch (err) {
        json(res, 500, { ok: 0, error: err.message })
      }
    })
  } else {
    json(res, 405, { ok: 0, error: 'Method not allowed' })
  }
}

function handleGet(res, config, dbName, collection, queryStr) {
  const db = Schema.openDb(config.datadir, dbName)
  if (!collection) {
    json(res, 200, Schema.listCollections(db))
    return
  }
  const rows = Query.execQuery(db, collection, queryStr)
  json(res, 200, { [collection]: rows })
}

function handlePost(res, config, dbName, body) {
  const db = Schema.openDb(config.datadir, dbName)
  const results = {}

  for (const [name, payload] of Object.entries(body)) {
    if (payload === null) {
      Schema.dropCollection(db, name)
      results[name] = { dropped: true }
    } else if (Array.isArray(payload)) {
      results[name] = Data.processBatch(db, name, payload)
    } else if (typeof payload === 'object') {
      if (payload.index) {
        const tables = Schema.listCollections(db)
        if (!tables[name]) {
          results[name] = { ok: 0, error: 'Collection does not exist. Insert data first.' }
          continue
        }
        Schema.setIndexes(db, name, payload.index)
      }
      results[name] = { ok: 1 }
    }
  }

  json(res, 200, results)
}

// --- Admin ---

function handleAdmin(req, res, config, url) {
  const path = url.pathname

  // POST /admin/login
  if (req.method === 'POST' && path === '/admin/login') {
    readBody(req, body => {
      if (!config.token || body.token === config.token) {
        const sid = Auth.createSession()
        res.writeHead(302, {
          location: '/admin',
          'set-cookie': `session=${sid}; Path=/; HttpOnly; SameSite=Strict`,
        })
        res.end()
      } else {
        html(res, 401, loginPage('Invalid token'))
      }
    })
    return
  }

  // login page (no auth needed)
  if (path === '/admin/login') {
    html(res, 200, loginPage())
    return
  }

  // all other admin pages require auth
  if (!Auth.checkAdminAuth(req, config.token)) {
    res.writeHead(302, { location: '/admin/login' })
    res.end()
    return
  }

  // admin routes
  const parts = path.replace('/admin', '').split('/').filter(Boolean)
  const dbName = parts[0]
  const collName = parts[1]

  try {
    if (!dbName) {
      // GET /admin — list databases
      const dbs = Fs.listFiles(config.datadir, '.sqlite')
      html(res, 200, Html.dbListPage(dbs))
    } else if (!collName) {
      // GET /admin/:db — list collections
      const db = Schema.openDb(config.datadir, dbName)
      html(res, 200, Html.collectionListPage(dbName, Schema.listCollections(db)))
    } else {
      // GET /admin/:db/:coll — data table
      const db = Schema.openDb(config.datadir, dbName)
      const filterStr = url.searchParams.get('q') || ''
      const skip = Number(url.searchParams.get('skip')) || 0
      const pageLimit = 50

      // get total count
      const countRow = Query.execQuery(db, collName, '')
      const total = countRow.length

      // build filter with pagination
      const filter = filterStr ? JSON.parse(filterStr) : {}
      filter.$limit = pageLimit
      filter.$skip = skip
      const queryStr = JSON.stringify(filter)

      const rows = Query.execQuery(db, collName, encodeURIComponent(queryStr))
      const info = Schema.getCollectionInfo(db, collName)
      html(res, 200, Html.dataPage(dbName, collName, rows, info.columns, filterStr, skip, pageLimit, total))
    }
  } catch (err) {
    html(res, 500, `<h1>Error</h1><p>${err.message}</p>`)
  }
}

function loginPage(error) {
  return `<!DOCTYPE html>
<html><head><title>my-sqlite admin</title>
<style>body{font-family:system-ui;max-width:400px;margin:80px auto;padding:0 20px}
input,button{display:block;width:100%;padding:8px;margin:8px 0;box-sizing:border-box}
.err{color:red}</style></head>
<body><h1>my-sqlite</h1>
${error ? `<p class="err">${error}</p>` : ''}
<form method="POST" action="/admin/login">
<label>Token<input type="password" name="token" autofocus></label>
<button type="submit">Login</button>
</form></body></html>`
}

// --- Helpers ---

function readBody(req, cb) {
  let data = ''
  req.on('data', chunk => { data += chunk })
  req.on('end', () => {
    const ct = req.headers['content-type'] || ''
    if (ct.includes('json')) {
      cb(JSON.parse(data))
    } else {
      // form-encoded
      cb(Object.fromEntries(new URLSearchParams(data)))
    }
  })
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

function html(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html' })
  res.end(body)
}
