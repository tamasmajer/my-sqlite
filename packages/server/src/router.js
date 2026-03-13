// Router — HTTP request dispatch for API, admin UI, and static files
import * as Schema from './schema.js'
import * as Data from './data.js'
import * as Query from './query.js'
import * as Auth from './auth.js'
import * as Sql from './access/sqlite.js'
import * as Http from './access/http.js'
import * as Fs from './access/fs.js'
import * as Parse from './parse.js'

export function route(req, res, config) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  // CORS preflight — must respond before auth check
  if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
    Http.respond(res, 204, corsHeaders(), '')
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

  Http.respond(res, 404, {}, 'not found')
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

    // /api/:db — list, drop, collections config, batch
    if (!collection) {
      if (method === 'GET') {
        const db = Schema.openDb(config.datadir, dbName)
        json(res, 200, Schema.listCollections(db))
      } else if (method === 'DELETE') {
        if (filterStr) {
          const filter = Parse.parseQuery(filterStr)
          const collId = filter.id
          if (!collId) {
            json(res, 400, { ok: 0, error: 'Missing collection id' })
            return
          }
          const db = Schema.openDb(config.datadir, dbName)
          Schema.dropCollection(db, collId)
          if (Schema.isDbEmpty(db)) Schema.dropDb(config.datadir, dbName)
          json(res, 200, { ok: 1, dropped: true })
        } else {
          Schema.dropDb(config.datadir, dbName)
          json(res, 200, { ok: 1, dropped: true })
        }
      } else if (method === 'PUT') {
        readBody(req, body => {
          try {
            const db = Schema.openDb(config.datadir, dbName)
            const result = Schema.setCollectionConfig(db, body)
            json(res, 200, result)
          } catch (err) { json(res, 500, { ok: 0, error: err.message }) }
        })
      } else if (method === 'POST') {
        readBody(req, body => {
          try {
            if (typeof body !== 'string') {
              json(res, 400, { ok: 0, error: 'Batch body must be text/plain' })
              return
            }
            handleBatch(req, res, config, dbName, body)
          } catch (err) { json(res, 500, { ok: 0, error: err.message }) }
        })
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
    if (!Schema.tableExists(db, collection)) {
      json(res, 200, Query.isCount(filterStr) ? { count: 0 } : [])
      return
    }
    if (Query.isCount(filterStr)) {
      json(res, 200, Data.count(db, collection, filterStr))
      return
    }
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
    Http.respond(res, 200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' }, data)
  } catch (e) {
    Http.respond(res, 404, {}, 'not found')
  }
}

// --- Helpers ---

function readBody(req, cb) {
  Http.readBody(req, raw => {
    const ct = req.headers['content-type'] || ''
    if (ct.includes('text/plain')) {
      cb(raw)
      return
    }
    if (ct.includes('json')) {
      cb(JSON.parse(raw))
      return
    }
    if (ct.includes('application/x-www-form-urlencoded')) {
      cb(Object.fromEntries(new URLSearchParams(raw)))
      return
    }
    cb(raw)
  })
}

function json(res, status, data) {
  Http.respond(res, status, { 'content-type': 'application/json', ...corsHeaders() }, JSON.stringify(data))
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
    'access-control-allow-methods': 'GET, PUT, PATCH, DELETE, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  }
}

function handleBatch(req, res, config, dbName, body) {
  const db = Schema.openDb(config.datadir, dbName)
  const lines = body.split(/\r?\n/)
  const commands = []
  for (let i = 0; i < lines.length; i++) {
    try {
      const cmd = Parse.parseBatchLine(lines[i])
      if (!cmd) continue
      commands.push({ ...cmd, _line: i + 1 })
    } catch (err) {
      err._line = i + 1
      throw err
    }
  }
  try {
    const results = []
    Sql.transaction(db, () => {
      for (const cmd of commands) {
        try {
          results.push(execBatchCommand(db, cmd))
        } catch (err) {
          err._line = cmd._line
          throw err
        }
      }
    })
    json(res, 200, results)
  } catch (err) {
    const line = err._line || null
    json(res, 400, { ok: 0, error: err.message, line })
  }
}

function execBatchCommand(db, cmd) {
  const coll = cmd.collection
  switch (cmd.method) {
    case 'GET': {
      if (cmd.filter && cmd.filter.$count === true) {
        return Data.countParsed(db, coll, cmd.filter)
      }
      const rows = Data.queryParsed(db, coll, cmd.filter)
      const jsonCols = Schema.jsonColumns(db, coll)
      return Data.fromSqlRows(rows, jsonCols)
    }
    case 'PUT':
      return Data.upsert(db, coll, cmd.body)
    case 'PATCH':
      return Data.patch(db, coll, cmd.body)
    case 'DELETE':
      return Data.removeParsed(db, coll, cmd.filter)
    default:
      return { ok: 0, error: `Unknown op: ${cmd.method}` }
  }
}
