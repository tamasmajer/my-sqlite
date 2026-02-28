import * as Schema from './schema.js'
import * as Data from './data.js'
import * as Query from './query.js'
import * as Auth from './auth.js'
import * as Fs from './access/fs.js'

export function route(req, res, config) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

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
  const parts = url.pathname.replace('/api/', '').split('/').filter(Boolean)
  const dbName = parts[0]
  const collection = parts[1]

  if (!dbName) {
    if (req.method === 'GET') json(res, 200, Fs.listFiles(config.datadir, '.sqlite'))
    else json(res, 400, { ok: 0, error: 'Missing database name' })
    return
  }

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
  let relPath = url.pathname.replace(/^\/admin/, '') || '/'
  const uiDir = Fs.joinPath(process.cwd(), 'packages', 'ui')

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
    res.writeHead(200, { 'Content-Type': mime })
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
      // form-encoded
      cb(Object.fromEntries(new URLSearchParams(data)))
    }
  })
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}
