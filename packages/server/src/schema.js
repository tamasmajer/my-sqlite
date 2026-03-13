// Schema — database and table lifecycle, indexes, metadata
import * as Sql from './access/sqlite.js'
import * as Fs from './access/fs.js'
import * as Query from './query.js'

export function openDb(datadir, name) {
  Fs.ensureDir(datadir)
  const path = Fs.joinPath(datadir, name + '.sqlite')
  return Sql.open(path)
}

export function listCollections(db) {
  const tables = Sql.tables(db)
  const names = new Set()
  for (const name of tables) {
    if (name === '_meta') continue
    if (isFtsTable(name)) continue
    names.add(name)
  }
  if (tables.includes('_meta')) {
    const rows = Sql.all(db, `SELECT collection FROM _meta`)
    for (const row of rows) {
      if (row && row.collection) names.add(row.collection)
    }
  }
  return [...names].map(name => getMeta(db, name))
}

// --- Meta ---

export function getMeta(db, collection) {
  const hasTable = tableExists(db, collection)
  const cols = hasTable ? Sql.columns(db, collection).map(c => c.name) : []
  const idxList = hasTable ? Sql.indexes(db, collection) : []
  const indexed = []
  for (const idx of idxList) {
    if (!idx.name.startsWith('idx_')) continue
    const idxCols = Sql.indexColumns(db, idx.name)
    indexed.push(...idxCols)
  }
  const storedIndex = getIndexFields(db, collection)
  const index = indexed.length ? indexed : storedIndex
  const key = getKeyFields(db, collection)
  const search = getSearchFields(db, collection)
  return { id: collection, columns: cols, index, search, key }
}

export function setMeta(db, collection, meta) {
  if (meta.index) {
    ensureMetaTable(db)
    const fields = Array.isArray(meta.index) ? meta.index : [meta.index]
    const indexVal = fields.join(',')
    const existing = Sql.get(db, `SELECT * FROM _meta WHERE collection = ?`, [collection])
    if (existing) {
      Sql.run(db, `UPDATE _meta SET index_fields = ? WHERE collection = ?`, [indexVal, collection])
    } else {
      Sql.run(db, `INSERT INTO _meta (collection, key_fields, search_fields, index_fields) VALUES (?, ?, ?, ?)`, [collection, '', '', indexVal])
    }
    const tables = Sql.tables(db)
    if (tables.includes(collection)) {
      setIndexes(db, collection, fields)
    }
  }
  if (meta.search !== undefined) {
    ensureMetaTable(db)
    if (meta.search === 'drop' || meta.search === null || (Array.isArray(meta.search) && meta.search.length === 0)) {
      dropFts(db, collection)
      const existing = Sql.get(db, `SELECT * FROM _meta WHERE collection = ?`, [collection])
      if (existing) {
        Sql.run(db, `UPDATE _meta SET search_fields = ? WHERE collection = ?`, ['', collection])
      } else {
        Sql.run(db, `INSERT INTO _meta (collection, key_fields, search_fields, index_fields) VALUES (?, ?, ?, ?)`, [collection, '', '', ''])
      }
    } else {
      const fields = Array.isArray(meta.search) ? meta.search : [meta.search]
      const searchVal = fields.join(',')
      const existing = Sql.get(db, `SELECT * FROM _meta WHERE collection = ?`, [collection])
      if (existing) {
        Sql.run(db, `UPDATE _meta SET search_fields = ? WHERE collection = ?`, [searchVal, collection])
      } else {
        Sql.run(db, `INSERT INTO _meta (collection, key_fields, search_fields, index_fields) VALUES (?, ?, ?, ?)`, [collection, '', searchVal, ''])
      }
      if (tableExists(db, collection) && fields.length) {
        Query.ensureFts(db, collection, fields)
      }
    }
  }
  if (meta.fts === 'drop') {
    dropFts(db, collection)
  } else if (meta.fts === 'rebuild') {
    rebuildFts(db, collection)
  }
  if (meta.key) {
    // Key can only be set before data exists or by recreating the table
    // For now, store in _meta table for reference
    ensureMetaTable(db)
    const keyVal = Array.isArray(meta.key) ? meta.key.join(',') : meta.key
    const existing = Sql.get(db, `SELECT * FROM _meta WHERE collection = ?`, [collection])
    if (existing) {
      Sql.run(db, `UPDATE _meta SET key_fields = ? WHERE collection = ?`, [keyVal, collection])
    } else {
      Sql.run(db, `INSERT INTO _meta (collection, key_fields, search_fields, index_fields) VALUES (?, ?, ?, ?)`, [collection, keyVal, '', ''])
    }
  }
}

function ensureMetaTable(db) {
  Sql.run(db, `CREATE TABLE IF NOT EXISTS _meta (collection TEXT PRIMARY KEY, key_fields TEXT, search_fields TEXT, index_fields TEXT)`)
  try { Sql.run(db, `ALTER TABLE _meta ADD COLUMN search_fields TEXT`) } catch { }
  try { Sql.run(db, `ALTER TABLE _meta ADD COLUMN index_fields TEXT`) } catch { }
}

function getKeyFields(db, collection) {
  const tables = Sql.tables(db)
  if (tables.includes('_meta')) {
    const row = Sql.get(db, `SELECT key_fields FROM _meta WHERE collection = ?`, [collection])
    if (row && row.key_fields) {
      const fields = row.key_fields.split(',')
      return fields.length === 1 ? fields[0] : fields
    }
  }
  return 'id'
}

// Returns key fields as an array (always)
export function getKeyFieldsArray(db, collection) {
  const key = getKeyFields(db, collection)
  return Array.isArray(key) ? key : [key]
}

// --- Table management ---

export function ensureTable(db, collection, row) {
  const existing = Sql.tables(db)
  if (existing.includes(collection)) {
    ensureColumns(db, collection, row)
    return
  }
  const keyFields = getKeyFieldsArray(db, collection)
  const keys = Object.keys(row)
  const colDefs = keys.map(k => {
    if (keyFields.includes(k)) return null // handled in PK constraint
    return `"${k}" ${inferType(row[k])}`
  }).filter(Boolean)

  const keyColDefs = keyFields.map(k => `"${k}" ${inferType(row[k] !== undefined ? row[k] : '')}`)
  const allCols = [...keyColDefs, ...colDefs]
  const pkClause = keyFields.map(k => `"${k}"`).join(', ')

  const sql = `CREATE TABLE "${collection}" (${allCols.join(', ')}, PRIMARY KEY (${pkClause}))`
  Sql.run(db, sql)

  const searchFields = getSearchFields(db, collection)
  if (searchFields.length) {
    Query.ensureFts(db, collection, searchFields)
  }
  const indexFields = getIndexFields(db, collection)
  if (indexFields.length) {
    setIndexes(db, collection, indexFields)
  }
}

export function ensureColumns(db, collection, row) {
  const existing = Sql.columns(db, collection).map(c => c.name)
  const keys = Object.keys(row)
  for (const k of keys) {
    if (!existing.includes(k)) {
      Sql.run(db, `ALTER TABLE "${collection}" ADD COLUMN "${k}" ${inferType(row[k])}`)
    }
  }
}

export function setIndexes(db, collection, indexedFields) {
  const idxList = Sql.indexes(db, collection)
  for (const idx of idxList) {
    if (idx.name.startsWith('idx_')) {
      Sql.run(db, `DROP INDEX "${idx.name}"`)
    }
  }
  for (const field of indexedFields) {
    Sql.run(db, `CREATE INDEX "idx_${collection}_${field}" ON "${collection}"("${field}")`)
  }
}

export function dropCollection(db, collection) {
  dropFts(db, collection)
  Sql.run(db, `DROP TABLE IF EXISTS "${collection}"`)
  // Clean up _meta entry
  const tables = Sql.tables(db)
  if (tables.includes('_meta')) {
    Sql.run(db, `DELETE FROM _meta WHERE collection = ?`, [collection])
  }
}

export function dropDb(datadir, name) {
  const base = Fs.joinPath(datadir, name + '.sqlite')
  // Close cached connection if open
  const db = Sql.open(base)
  Sql.close(db)
  Fs.remove(base)
  Fs.remove(base + '-wal')
  Fs.remove(base + '-shm')
}

export function tableExists(db, collection) {
  return Sql.tables(db).includes(collection)
}

export function isDbEmpty(db) {
  const tables = Sql.tables(db).filter(n => n !== '_meta' && !n.endsWith('_fts'))
  return tables.length === 0
}

export function jsonColumns(db, collection) {
  return Sql.columns(db, collection).filter(c => c.type === 'JSON').map(c => c.name)
}

export function getSearchFields(db, collection) {
  const tables = Sql.tables(db)
  if (tables.includes('_meta')) {
    const row = Sql.get(db, `SELECT search_fields FROM _meta WHERE collection = ?`, [collection])
    if (row && row.search_fields) {
      return row.search_fields.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  const fts = getFtsIndexes(db, collection)
  if (fts.length) return fts[0]
  return []
}

export function getIndexFields(db, collection) {
  const tables = Sql.tables(db)
  if (tables.includes('_meta')) {
    const row = Sql.get(db, `SELECT index_fields FROM _meta WHERE collection = ?`, [collection])
    if (row && row.index_fields) {
      return row.index_fields.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  return []
}

export function setCollectionConfig(db, config) {
  if (!config || !config.id) throw new Error('Missing collection id')
  const meta = {}
  if (config.index) meta.index = config.index
  if (config.search !== undefined) meta.search = config.search
  if (config.key) meta.key = config.key
  setMeta(db, config.id, meta)
  return getMeta(db, config.id)
}

function isFtsTable(name) {
  return /_fts($|_)/.test(name)
}

// --- FTS ---

export function getFtsIndexes(db, collection) {
  const prefix = collection + '_fts'
  const rows = Sql.all(db, `SELECT name, sql FROM sqlite_master WHERE type='table' AND name LIKE ?`, [prefix + '%'])
  const result = []
  for (const row of rows) {
    // Only match exact fts tables, not sub-tables like _fts_data
    if (row.name !== prefix) continue
    // Extract column names from CREATE VIRTUAL TABLE ... fts5(col1, col2, content=..., content_rowid=...)
    const match = row.sql.match(/fts5\((.+)\)/)
    if (match) {
      const fields = match[1].split(',')
        .map(s => s.trim().replace(/^"|"$/g, ''))
        .filter(s => !s.startsWith('content'))
      result.push(fields)
    }
  }
  return result
}

export function dropFts(db, collection) {
  const prefix = collection + '_fts'
  // Drop triggers
  for (const suffix of ['_ai', '_ad', '_au']) {
    Sql.run(db, `DROP TRIGGER IF EXISTS "${prefix}${suffix}"`)
  }
  // Drop FTS table (and its shadow tables)
  Sql.run(db, `DROP TABLE IF EXISTS "${prefix}"`)
  Query.clearFtsCache(collection)
}

export function rebuildFts(db, collection) {
  const prefix = collection + '_fts'
  const exists = Sql.get(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [prefix])
  if (exists) {
    Sql.run(db, `INSERT INTO "${prefix}"("${prefix}") VALUES('rebuild')`)
  }
}

function inferType(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL'
  if (typeof value === 'boolean') return 'INTEGER'
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return 'JSON'
  return 'TEXT'
}
