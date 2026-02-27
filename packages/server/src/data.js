import * as Sql from './access/sqlite.js'
import * as Schema from './schema.js'

// Process a batch of rows for a collection in one transaction.
// Rules: no id → INSERT, id + fields → UPDATE (merge), id only → DELETE
export function processBatch(db, collection, rows) {
  const ops = rows.map(row => classify(row))

  Sql.transaction(db, () => {
    for (const op of ops) {
      switch (op.type) {
        case 'insert': execInsert(db, collection, op.row); break
        case 'update': execUpdate(db, collection, op.id, op.fields); break
        case 'delete': execDelete(db, collection, op.id); break
      }
    }
  })

  return { ok: 1 }
}

function classify(row) {
  const keys = Object.keys(row)
  if (!('id' in row)) return { type: 'insert', row }
  if (keys.length === 1) return { type: 'delete', id: row.id }
  const fields = {}
  for (const k of keys) { if (k !== 'id') fields[k] = row[k] }
  return { type: 'update', id: row.id, fields }
}

function execInsert(db, collection, row) {
  Schema.ensureTable(db, collection, row)
  const keys = Object.keys(row).filter(k => k !== 'id')
  const placeholders = keys.map(() => '?').join(', ')
  const values = keys.map(k => toSqlValue(row[k]))
  Sql.run(db, `INSERT INTO "${collection}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})`, values)
}

function execUpdate(db, collection, id, fields) {
  Schema.ensureColumns(db, collection, fields)
  const keys = Object.keys(fields)
  const sets = keys.map(k => `"${k}" = ?`).join(', ')
  const values = keys.map(k => toSqlValue(fields[k]))
  values.push(id)
  Sql.run(db, `UPDATE "${collection}" SET ${sets} WHERE id = ?`, values)
}

function execDelete(db, collection, id) {
  Sql.run(db, `DELETE FROM "${collection}" WHERE id = ?`, [id])
}

function toSqlValue(v) {
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}
