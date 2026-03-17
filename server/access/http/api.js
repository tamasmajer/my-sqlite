// API routes — document CRUD, batch, database/collection management
import * as Schema from '../db/schema.js'
import * as Data from '../db/data.js'
import * as Query from '../db/query.js'
import * as Sql from '../env/sqlite.js'
import * as Fs from '../env/fs.js'
import * as Auth from './auth.js'
import * as Parse from './parse.js'
import * as H from './helpers.js'

export function route(req, res, config) {
  if (H.corsPreflight(req, res)) return

  if (!Auth.checkApiAuth(req, config.token)) {
    H.json(res, 401, { ok: 0, error: 'Unauthorized' })
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const dbName = parts[0]
  const collection = parts[1]
  const method = req.method
  const filterStr = url.search ? url.search.slice(1) : ''

  try {
    if (!dbName) {
      if (method === 'GET') H.json(res, 200, Fs.listFiles(config.datadir, '.sqlite'))
      else H.json(res, 405, { ok: 0, error: 'Method not allowed' })
      return
    }

    if (!collection) {
      handleDb(req, res, config, dbName, method, filterStr)
      return
    }

    handleCollection(req, res, config, dbName, collection, method, filterStr)
  } catch (err) {
    H.json(res, 500, { ok: 0, error: err.message })
  }
}

function handleDb(req, res, config, dbName, method, filterStr) {
  if (method === 'GET') {
    const db = Schema.openDb(config.datadir, dbName)
    H.json(res, 200, Schema.listCollections(db))
  } else if (method === 'DELETE') {
    if (filterStr) {
      const filter = Parse.parseQuery(filterStr)
      const collId = filter.id
      if (!collId) {
        H.json(res, 400, { ok: 0, error: 'Missing collection id' })
        return
      }
      const db = Schema.openDb(config.datadir, dbName)
      Schema.dropCollection(db, collId)
      if (Schema.isDbEmpty(db)) Schema.dropDb(config.datadir, dbName)
      H.json(res, 200, { ok: 1, dropped: true })
    } else {
      Schema.dropDb(config.datadir, dbName)
      H.json(res, 200, { ok: 1, dropped: true })
    }
  } else if (method === 'PUT') {
    H.readBody(req, body => {
      try {
        const db = Schema.openDb(config.datadir, dbName)
        const result = Schema.setCollectionConfig(db, body)
        H.json(res, 200, result)
      } catch (err) { H.json(res, 500, { ok: 0, error: err.message }) }
    })
  } else if (method === 'POST') {
    H.readBody(req, body => {
      try {
        if (typeof body !== 'string') {
          H.json(res, 400, { ok: 0, error: 'Batch body must be text/plain' })
          return
        }
        handleBatch(req, res, config, dbName, body)
      } catch (err) { H.json(res, 500, { ok: 0, error: err.message }) }
    })
  } else {
    H.json(res, 405, { ok: 0, error: 'Method not allowed' })
  }
}

function handleCollection(req, res, config, dbName, collection, method, filterStr) {
  if (method === 'GET') {
    const db = Schema.openDb(config.datadir, dbName)
    if (!Schema.tableExists(db, collection)) {
      H.json(res, 200, Query.isCount(filterStr) ? { count: 0 } : [])
      return
    }
    if (Query.isCount(filterStr)) {
      H.json(res, 200, Data.count(db, collection, filterStr))
      return
    }
    const rows = Data.query(db, collection, filterStr)
    const jsonCols = Schema.jsonColumns(db, collection)
    H.json(res, 200, Data.fromSqlRows(rows, jsonCols))
    return
  }

  if (method === 'DELETE') {
    const db = Schema.openDb(config.datadir, dbName)
    if (!filterStr) {
      Schema.dropCollection(db, collection)
      if (Schema.isDbEmpty(db)) Schema.dropDb(config.datadir, dbName)
      H.json(res, 200, { ok: 1, dropped: true })
    } else {
      Data.remove(db, collection, filterStr)
      H.json(res, 200, { ok: 1 })
    }
    return
  }

  if (method === 'PUT') {
    H.readBody(req, body => {
      try {
        const db = Schema.openDb(config.datadir, dbName)
        H.json(res, 200, Data.upsert(db, collection, body))
      } catch (err) {
        H.json(res, 500, { ok: 0, error: err.message })
      }
    })
    return
  }

  if (method === 'PATCH') {
    H.readBody(req, body => {
      try {
        const db = Schema.openDb(config.datadir, dbName)
        H.json(res, 200, Data.patch(db, collection, body))
      } catch (err) {
        H.json(res, 500, { ok: 0, error: err.message })
      }
    })
    return
  }

  H.json(res, 405, { ok: 0, error: 'Method not allowed' })
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
    H.json(res, 200, results)
  } catch (err) {
    const line = err._line || null
    H.json(res, 400, { ok: 0, error: err.message, line })
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
