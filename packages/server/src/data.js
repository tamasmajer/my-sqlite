// Data — CRUD operations (upsert, query, patch, remove)
import * as Sql from './access/sqlite.js'
import * as Schema from './schema.js'
import * as Query from './query.js'

// --- Query ---

export function query(db, collection, filterStr) {
  return Query.exec(db, collection, filterStr)
}

// --- Upsert (INSERT OR REPLACE) ---

export function upsert(db, collection, docsOrDoc) {
  const docs = Array.isArray(docsOrDoc) ? docsOrDoc : [docsOrDoc]
  if (docs.length === 0) return { ok: 1 }

  Sql.transaction(db, () => {
    for (const doc of docs) {
      execUpsert(db, collection, doc)
    }
  })
  return { ok: 1 }
}

function execUpsert(db, collection, doc) {
  Schema.ensureTable(db, collection, doc)
  const keys = Object.keys(doc)
  const cols = keys.map(k => `"${k}"`).join(', ')
  const placeholders = keys.map(() => '?').join(', ')
  const values = keys.map(k => toSqlValue(doc[k]))
  Sql.run(db, `INSERT OR REPLACE INTO "${collection}" (${cols}) VALUES (${placeholders})`, values)
}

// --- Patch (partial update) ---

export function patch(db, collection, docsOrDoc) {
  const docs = Array.isArray(docsOrDoc) ? docsOrDoc : [docsOrDoc]
  if (docs.length === 0) return { ok: 1 }

  const keyFields = Schema.getKeyFieldsArray(db, collection)

  Sql.transaction(db, () => {
    for (const doc of docs) {
      execPatch(db, collection, doc, keyFields)
    }
  })
  return { ok: 1 }
}

function execPatch(db, collection, doc, keyFields) {
  Schema.ensureColumns(db, collection, doc)
  const updateFields = Object.keys(doc).filter(k => !keyFields.includes(k))
  if (updateFields.length === 0) return

  const sets = updateFields.map(k => `"${k}" = ?`).join(', ')
  const values = updateFields.map(k => toSqlValue(doc[k]))
  const whereParts = keyFields.map(k => `"${k}" = ?`)
  const whereValues = keyFields.map(k => doc[k])

  Sql.run(db, `UPDATE "${collection}" SET ${sets} WHERE ${whereParts.join(' AND ')}`, [...values, ...whereValues])
}

// --- Remove ---

export function remove(db, collection, filterStr) {
  const { where, params } = Query.parseFilter(filterStr)
  if (!where) {
    // empty filter {} = delete all data, keep table
    Sql.run(db, `DELETE FROM "${collection}"`)
  } else {
    Sql.run(db, `DELETE FROM "${collection}" WHERE ${where}`, params)
  }
  return { ok: 1 }
}

// --- Value conversion ---

export function toSqlValue(v) {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return JSON.stringify(v)
  return v
}

export function fromSqlRows(rows, jsonCols) {
  if (!jsonCols || jsonCols.length === 0) return rows
  return rows.map(row => fromSqlRow(row, jsonCols))
}

function fromSqlRow(row, jsonCols) {
  if (!row) return row
  const result = { ...row }
  for (const col of jsonCols) {
    if (typeof result[col] === 'string') {
      try { result[col] = JSON.parse(result[col]) } catch { /* keep as string */ }
    }
  }
  return result
}
