import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs'

export function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

export function exists(path) {
  return existsSync(path)
}

export function listFiles(dir, ext) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith(ext)).map(f => f.slice(0, -ext.length))
}

export function writeFile(path, content) {
  writeFileSync(path, content)
}

export function readFile(path) {
  return readFileSync(path, 'utf-8')
}

export function remove(path) {
  if (existsSync(path)) unlinkSync(path)
}
