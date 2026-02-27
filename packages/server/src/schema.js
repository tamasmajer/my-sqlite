import * as Sql from './access/sqlite.js'
import * as Fs from './access/fs.js'
import { join } from 'node:path'

export function openDb(datadir, name) {
  Fs.ensureDir(datadir)
  const path = join(datadir, name + '.sqlite')
  return Sql.open(path)
}

export function listCollections(db) {
  const names = Sql.tables(db)
  const result = {}
  for (const name of names) {
    result[name] = getCollectionInfo(db, name)
  }
  return result
}

export function getCollectionInfo(db, name) {
  const cols = Sql.columns(db, name).map(c => c.name)
  const idxList = Sql.indexes(db, name)
  const indexed = []
  for (const idx of idxList) {
    if (!idx.name.startsWith('idx_')) continue
    const idxCols = Sql.indexColumns(db, idx.name)
    indexed.push(...idxCols)
  }
  return { columns: cols, index: indexed }
}

export function ensureTable(db, name, row) {
  const existing = Sql.tables(db)
  if (existing.includes(name)) {
    ensureColumns(db, name, row)
    return
  }
  const keys = Object.keys(row).filter(k => k !== 'id')
  const colDefs = keys.map(k => `"${k}" ${inferType(row[k])}`)
  const sql = `CREATE TABLE "${name}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs.join(', ')})`
  Sql.run(db, sql)
}

export function ensureColumns(db, name, row) {
  const existing = Sql.columns(db, name).map(c => c.name)
  const keys = Object.keys(row).filter(k => k !== 'id')
  for (const k of keys) {
    if (!existing.includes(k)) {
      Sql.run(db, `ALTER TABLE "${name}" ADD COLUMN "${k}" ${inferType(row[k])}`)
    }
  }
}

export function setIndexes(db, name, indexedFields) {
  // drop all existing idx_ indexes for this table
  const idxList = Sql.indexes(db, name)
  for (const idx of idxList) {
    if (idx.name.startsWith('idx_')) {
      Sql.run(db, `DROP INDEX "${idx.name}"`)
    }
  }
  // create new ones
  for (const field of indexedFields) {
    Sql.run(db, `CREATE INDEX "idx_${name}_${field}" ON "${name}"("${field}")`)
  }
}

export function dropCollection(db, name) {
  Sql.run(db, `DROP TABLE IF EXISTS "${name}"`)
}

function inferType(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL'
  if (typeof value === 'boolean') return 'INTEGER'
  return 'TEXT'
}
