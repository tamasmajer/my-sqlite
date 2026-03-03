import * as Schema from './schema.js'
import * as Data from './data.js'
import * as Auth from './auth.js'
import * as Fs from './access/fs.js'

export function route(req, res, config) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  // CORS preflight — must respond before auth check
  if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }

  if (path === '/api' || path.startsWith('/api/')) {
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
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const dbName = parts[0]
  const collection = parts[1]
  const method = req.method
  const filterStr = url.search ? url.search.slice(1) : ''

  try {
    // /api — list databases
    if (!dbName) {
      if (method === 'GET') json(res, 200, Fs.listFiles(config.datadir, '.sqlite'))
      else json(res, 405, { ok: 0, error: 'Method not allowed' })
      return
    }

    // /api/:db — list or drop database
    if (!collection) {
      if (method === 'GET') {
        const db = Schema.openDb(config.datadir, dbName)
        json(res, 200, Schema.listCollections(db))
      } else if (method === 'DELETE') {
        Schema.dropDb(config.datadir, dbName)
        json(res, 200, { ok: 1, dropped: true })
      } else {
        json(res, 405, { ok: 0, error: 'Method not allowed' })
      }
      return
    }

    // /api/:db/:coll — document operations
    handleCollection(req, res, config, dbName, collection, method, filterStr)
  } catch (err) {
    json(res, 500, { ok: 0, error: err.message })
  }
}

function handleCollection(req, res, config, dbName, collection, method, filterStr) {
  if (method === 'GET') {
    const db = Schema.openDb(config.datadir, dbName)
    if (!Schema.tableExists(db, collection)) { json(res, 200, []); return }
    const rows = Data.query(db, collection, filterStr)
    const jsonCols = Schema.jsonColumns(db, collection)
    json(res, 200, Data.fromSqlRows(rows, jsonCols))
    return
  }

  if (method === 'DELETE') {
    const db = Schema.openDb(config.datadir, dbName)
    if (!filterStr) {
      // No query string = drop collection
      Schema.dropCollection(db, collection)
      if (Schema.isDbEmpty(db)) Schema.dropDb(config.datadir, dbName)
      json(res, 200, { ok: 1, dropped: true })
    } else {
      Data.remove(db, collection, filterStr)
      json(res, 200, { ok: 1 })
    }
    return
  }

  if (method === 'PUT') {
    readBody(req, body => {
      try {
        const db = Schema.openDb(config.datadir, dbName)
        json(res, 200, Data.upsert(db, collection, body))
      } catch (err) {
        json(res, 500, { ok: 0, error: err.message })
      }
    })
    return
  }

  if (method === 'PATCH') {
    readBody(req, body => {
      try {
        const db = Schema.openDb(config.datadir, dbName)
        json(res, 200, Data.patch(db, collection, body))
      } catch (err) {
        json(res, 500, { ok: 0, error: err.message })
      }
    })
    return
  }

  if (method === 'OPTIONS') {
    const db = Schema.openDb(config.datadir, dbName)
    const ct = req.headers['content-type'] || ''
    if (ct.includes('json')) {
      readBody(req, body => {
        try {
          Schema.setMeta(db, collection, body)
          json(res, 200, Schema.getMeta(db, collection))
        } catch (err) {
          json(res, 500, { ok: 0, error: err.message })
        }
      })
    } else {
      json(res, 200, Schema.getMeta(db, collection))
    }
    return
  }

  json(res, 405, { ok: 0, error: 'Method not allowed' })
}

// --- Admin ---

function handleAdmin(req, res, config, url) {
  let relPath = url.pathname.replace(/^\/admin/, '') || '/'
  const uiDir = Fs.joinPath(process.cwd(), 'packages', 'ui')

  if (relPath === '/config') {
    const servers = parseServersFlag(config.servers)
    json(res, 200, { servers })
    return
  }

  if (relPath === '/') relPath = '/index.html'

  let filePath = Fs.joinPath(uiDir, relPath)
  let ext = filePath.split('.').pop()

  if (!Fs.exists(filePath)) {
    filePath = Fs.joinPath(uiDir, 'index.html')
    ext = 'html'
  }

  try {
    const data = Fs.readFile(filePath)
    const mime = ext === 'js' ? 'text/javascript' : ext === 'css' ? 'text/css' : 'text/html'
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' })
    res.end(data)
  } catch (e) {
    res.writeHead(404)
    res.end('not found')
  }
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
      cb(Object.fromEntries(new URLSearchParams(data)))
    }
  })
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json', ...corsHeaders() })
  res.end(JSON.stringify(data))
}

function parseServersFlag(val) {
  if (!val) return []
  return val.split(',').map(s => {
    const [url, token] = s.trim().split('#')
    return { url, token: token || '' }
  }).filter(s => s.url)
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  }
}
