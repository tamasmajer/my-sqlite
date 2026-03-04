// Query — MongoDB-style JSON filter to SQL compiler
import * as Sql from './access/sqlite.js'

// Parse JSON filter string into SQL components
// Input: raw query string (JSON), e.g. '{"age":{"$gte":30},"$sort":{"age":-1},"$limit":10}'
// Returns: { where, params, order, limit, offset }
export function parseFilter(filterStr) {
  if (!filterStr) return { where: '', params: [], order: '', limit: null, offset: null }
  const filter = JSON.parse(decodeURIComponent(filterStr))
  return buildFilter(filter)
}

// Build SQL WHERE/ORDER/LIMIT from a filter object
// Exported for reuse in data.js
export function buildFilter(filter) {
  const params = []
  const conditions = []
  let limit = null
  let offset = null
  let order = ''

  for (const key of Object.keys(filter)) {
    if (key === '$limit') { limit = filter[key]; continue }
    if (key === '$skip') { offset = filter[key]; continue }
    if (key === '$sort') { order = parseSortValue(filter[key]); continue }

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
  }
}

// Execute a query on a collection using a parsed filter
export function exec(db, collection, filterStr) {
  const { where, params, order, limit, offset } = parseFilter(filterStr)

  let sql = `SELECT * FROM "${collection}"`
  if (where) sql += ` WHERE ${where}`
  if (order) sql += ` ORDER BY ${order}`
  if (limit != null) sql += ` LIMIT ${limit}`
  if (offset != null) sql += ` OFFSET ${offset}`

  return Sql.all(db, sql, params)
}

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
  return Object.entries(val).map(([field, dir]) =>
    `"${field}" ${dir === -1 ? 'DESC' : 'ASC'}`
  ).join(', ')
}
