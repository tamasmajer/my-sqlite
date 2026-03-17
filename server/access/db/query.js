// Query — MongoDB-style JSON filter to SQL compiler
import * as Sql from '../env/sqlite.js'
import * as Parse from '../http/parse.js'

// Parse JSON filter string into SQL components
// Input: raw query string (JSON), e.g. '{"age":{"$gte":30},"$sort":{"age":-1},"$limit":10}'
// Returns: { where, params, order, limit, offset }
export function parseFilter(filterStr) {
  if (!filterStr) return { where: '', params: [], order: '', limit: null, offset: null, search: null }
  const filter = Parse.parseQuery(filterStr)
  return buildFilter(filter)
}

export function parseQuery(filterStr) {
  return Parse.parseQuery(filterStr)
}

// Build SQL WHERE/ORDER/LIMIT from a filter object
// Exported for reuse in data.js
export function buildFilter(filter) {
  const params = []
  const conditions = []
  let limit = null
  let offset = null
  let order = ''
  let search = null

  for (const key of Object.keys(filter)) {
    if (key === '$limit') { limit = filter[key]; continue }
    if (key === '$skip') { offset = filter[key]; continue }
    if (key === '$sort') { order = parseSortValue(filter[key]); continue }
    if (key === '$count') { continue }
    if (key === '$search') { search = filter[key]; continue }

    const val = filter[key]
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      for (const op of Object.keys(val)) {
        const { sql, param } = opToSql(key, op, val[op])
        conditions.push(sql)
        if (param !== undefined) {
          if (Array.isArray(param)) params.push(...param)
          else params.push(param)
        }
      }
    } else {
      conditions.push(`"${key}" = ?`)
      params.push(val)
    }
  }

  return {
    where: conditions.length ? conditions.join(' AND ') : '',
    params,
    order,
    limit,
    offset,
    search,
  }
}

// Execute a query on a collection using a parsed filter
export function exec(db, collection, filterStr) {
  const filter = Parse.parseQuery(filterStr)
  return execParsed(db, collection, filter)
}

// Execute a count query on a collection using a parsed filter
export function count(db, collection, filterStr) {
  const filter = Parse.parseQuery(filterStr)
  return countParsed(db, collection, filter)
}

// Check if filter has $count flag
export function isCount(filterStr) {
  if (!filterStr) return false
  try {
    const filter = Parse.parseQuery(filterStr)
    return filter.$count === true
  } catch { return false }
}

// Execute a query on a collection using a parsed filter object
export function execParsed(db, collection, filter) {
  const { where, params, order, limit, offset, search } = buildFilter(filter || {})

  if (search) {
    if (typeof search === 'string') throw new Error('Search fields required')
    return execFts(db, collection, search, where, params, order, limit, offset)
  }

  let sql = `SELECT * FROM "${collection}"`
  if (where) sql += ` WHERE ${where}`
  if (order) sql += ` ORDER BY ${order}`
  if (limit != null) sql += ` LIMIT ${limit}`
  if (offset != null) sql += ` OFFSET ${offset}`

  return Sql.all(db, sql, params)
}

// Execute a count query on a collection using a parsed filter object
export function countParsed(db, collection, filter) {
  const { where, params, search } = buildFilter(filter || {})

  if (search) {
    if (typeof search === 'string') throw new Error('Search fields required')
    return countFts(db, collection, search, where, params)
  }

  let sql = `SELECT COUNT(*) as count FROM "${collection}"`
  if (where) sql += ` WHERE ${where}`

  return Sql.get(db, sql, params)
}

// --- FTS5 ---

const ftsReady = new Set()

export function clearFtsCache(collection) {
  for (const key of ftsReady) {
    if (key.startsWith(collection + ':')) ftsReady.delete(key)
  }
}

export function ensureFts(db, collection, fields) {
  const ftsTable = `${collection}_fts`
  const key = `${collection}:${fields.join(',')}`
  if (ftsReady.has(key)) return ftsTable

  const exists = Sql.get(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [ftsTable])
  if (!exists) {
    const cols = fields.map(f => `"${f}"`).join(', ')
    Sql.run(db, `CREATE VIRTUAL TABLE "${ftsTable}" USING fts5(${cols}, content="${collection}", content_rowid=rowid)`)

    // Populate from existing data
    Sql.run(db, `INSERT INTO "${ftsTable}"("${ftsTable}") VALUES('rebuild')`)

    // Triggers to keep in sync
    const newVals = fields.map(f => `new."${f}"`).join(', ')
    const oldVals = fields.map(f => `old."${f}"`).join(', ')
    Sql.run(db, `CREATE TRIGGER IF NOT EXISTS "${ftsTable}_ai" AFTER INSERT ON "${collection}" BEGIN INSERT INTO "${ftsTable}"(rowid, ${cols}) VALUES (new.rowid, ${newVals}); END`)
    Sql.run(db, `CREATE TRIGGER IF NOT EXISTS "${ftsTable}_ad" AFTER DELETE ON "${collection}" BEGIN INSERT INTO "${ftsTable}"("${ftsTable}", rowid, ${cols}) VALUES('delete', old.rowid, ${oldVals}); END`)
    Sql.run(db, `CREATE TRIGGER IF NOT EXISTS "${ftsTable}_au" AFTER UPDATE ON "${collection}" BEGIN INSERT INTO "${ftsTable}"("${ftsTable}", rowid, ${cols}) VALUES('delete', old.rowid, ${oldVals}); INSERT INTO "${ftsTable}"(rowid, ${cols}) VALUES (new.rowid, ${newVals}); END`)
  }

  ftsReady.add(key)
  return ftsTable
}

function buildMatchExpr(terms) {
  // Each term becomes a prefix query, AND'd together
  // "mr" "beast" → "mr" * AND "beast" *
  return terms.map(t => {
    const escaped = t.replace(/"/g, '""')
    return `"${escaped}" *`
  }).join(' AND ')
}

function execFts(db, collection, search, where, params, order, limit, offset) {
  const { fields, terms } = search
  const ftsTable = ensureFts(db, collection, fields)
  const matchExpr = buildMatchExpr(terms)

  let sql = `SELECT "${collection}".* FROM "${collection}" JOIN "${ftsTable}" ON "${collection}".rowid = "${ftsTable}".rowid WHERE "${ftsTable}" MATCH ?`
  const allParams = [matchExpr, ...params]

  if (where) sql += ` AND ${where}`
  if (order) sql += ` ORDER BY ${order}`
  if (limit != null) sql += ` LIMIT ${limit}`
  if (offset != null) sql += ` OFFSET ${offset}`

  return Sql.all(db, sql, allParams)
}

function countFts(db, collection, search, where, params) {
  const { fields, terms } = search
  const ftsTable = ensureFts(db, collection, fields)
  const matchExpr = buildMatchExpr(terms)

  let sql = `SELECT COUNT(*) as count FROM "${collection}" JOIN "${ftsTable}" ON "${collection}".rowid = "${ftsTable}".rowid WHERE "${ftsTable}" MATCH ?`
  const allParams = [matchExpr, ...params]

  if (where) sql += ` AND ${where}`

  return Sql.get(db, sql, allParams)
}

// --- Operators ---

const OPS = {
  $gt:  '>',
  $lt:  '<',
  $gte: '>=',
  $lte: '<=',
  $ne:  '!=',
}

function opToSql(field, op, value) {
  if (OPS[op]) return { sql: `"${field}" ${OPS[op]} ?`, param: value }

  if (op === '$in') {
    const ph = value.map(() => '?').join(', ')
    return { sql: `"${field}" IN (${ph})`, param: value }
  }
  if (op === '$nin') {
    const ph = value.map(() => '?').join(', ')
    return { sql: `"${field}" NOT IN (${ph})`, param: value }
  }
  if (op === '$like') {
    return { sql: `"${field}" LIKE ?`, param: value + '%' }
  }

  throw new Error(`Unknown operator: ${op}`)
}

function parseSortValue(val) {
  if (!val || typeof val !== 'object') return ''
  return Object.entries(val).map(([field, dir]) =>
    `"${field}" ${dir === -1 ? 'DESC' : 'ASC'}`
  ).join(', ')
}
