import * as Sql from './access/sqlite.js'

// Parse JSON filter from query string into SQL SELECT
// Filter: { age: 50, name: { $gt: 'A' }, $limit: 5, $skip: 10, $sort: '-age' }
export function execQuery(db, collection, filterStr) {
  const filter = filterStr ? JSON.parse(decodeURIComponent(filterStr)) : {}
  const { where, params, limit, skip, sort } = buildQuery(filter)

  let sql = `SELECT * FROM "${collection}"`
  if (where) sql += ` WHERE ${where}`
  if (sort) sql += ` ORDER BY ${sort}`
  if (limit != null) sql += ` LIMIT ${limit}`
  if (skip != null) sql += ` OFFSET ${skip}`

  return Sql.all(db, sql, params)
}

function buildQuery(filter) {
  const params = []
  const conditions = []
  let limit = null
  let skip = null
  let sort = null

  for (const key of Object.keys(filter)) {
    if (key === '$limit') { limit = filter[key]; continue }
    if (key === '$skip') { skip = filter[key]; continue }
    if (key === '$sort') { sort = parseSortValue(filter[key]); continue }

    const val = filter[key]
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      // operator object: { $gt: 50, $lt: 100 }
      for (const op of Object.keys(val)) {
        const { sql, param } = opToSql(key, op, val[op])
        conditions.push(sql)
        if (param !== undefined) {
          if (Array.isArray(param)) params.push(...param)
          else params.push(param)
        }
      }
    } else {
      // equality
      conditions.push(`"${key}" = ?`)
      params.push(val)
    }
  }

  return {
    where: conditions.length ? conditions.join(' AND ') : '',
    params,
    limit,
    skip,
    sort,
  }
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
  // "-age" → age DESC, "name" → name ASC
  const parts = Array.isArray(val) ? val : [val]
  return parts.map(s => {
    if (s.startsWith('-')) return `"${s.slice(1)}" DESC`
    return `"${s}" ASC`
  }).join(', ')
}
