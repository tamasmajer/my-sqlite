// Query parsing — supports strict JSON, lazy JSON, and URL-native formats

export function parseQuery(input) {
  if (!input) return {}
  const decoded = decodeQueryInput(input)
  const trimmed = decoded.trim()
  if (!trimmed) return {}

  if (trimmed.startsWith('{')) {
    if (trimmed.includes('"')) {
      return JSON.parse(trimmed)
    }
    return parseLazyJson(trimmed)
  }
  return parseUrlNative(trimmed)
}

export function parseBatchLine(line) {
  const trimmed = (line || '').trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const match = trimmed.match(/^(GET|PUT|PATCH|DELETE)\s+\/(\S+)\s*(.*)$/i)
  if (!match) throw new Error('Invalid batch line')

  const method = match[1].toUpperCase()
  const collection = match[2]
  const rest = (match[3] || '').trim()

  if (method === 'GET' || method === 'DELETE') {
    return { method, collection, filter: parseQuery(rest) }
  }

  if (method === 'PUT' || method === 'PATCH') {
    if (!rest.startsWith('{') && !rest.startsWith('[')) {
      throw new Error('Invalid batch body')
    }
    const body = rest.includes('"') ? JSON.parse(rest) : parseLazyJson(rest)
    return { method, collection, body }
  }

  throw new Error(`Unknown batch method: ${method}`)
}

function decodeQueryInput(input) {
  const withSpaces = String(input).replace(/\+/g, ' ')
  try { return decodeURIComponent(withSpaces) } catch { return withSpaces }
}

// --- URL-native ---

function parseUrlNative(input) {
  const result = {}
  const pairs = splitTopLevel(input, [',', '&'], true)

  for (const pair of pairs) {
    if (!pair) continue
    const [rawKey, rawVal] = splitFirst(pair, ['=', ':'])
    const key = (rawKey || '').trim()
    const val = (rawVal || '').trim()
    if (!key) continue

    if (key.startsWith('$')) {
      result[key] = parseModifierValue(key, val)
      continue
    }

    const opPos = key.indexOf('$')
    if (opPos !== -1) {
      const field = key.slice(0, opPos)
      const op = '$' + key.slice(opPos + 1)
      const value = parseValue(val)
      if (!result[field] || typeof result[field] !== 'object' || Array.isArray(result[field])) {
        result[field] = {}
      }
      result[field][op] = value
      continue
    }

    result[key] = parseValue(val)
  }

  return result
}

function parseModifierValue(mod, raw) {
  if (mod === '$limit' || mod === '$skip') {
    const n = parseInt(raw, 10)
    return Number.isNaN(n) ? 0 : n
  }
  if (mod === '$count') {
    return raw === 'true' || raw === '1'
  }
  if (mod === '$sort') return parseSortValue(raw)
  if (mod === '$search') return parseSearchValue(raw)
  return parseValue(raw)
}

function parseSortValue(raw) {
  const trimmed = (raw || '').trim()
  const fields = (trimmed.startsWith('(') || trimmed.startsWith('['))
    ? splitTopLevel(trimmed.slice(1, -1), [','])
    : [trimmed]
  const out = {}
  for (const f of fields) {
    const field = f.trim()
    if (!field) continue
    if (field.startsWith('-')) out[field.slice(1)] = -1
    else out[field] = 1
  }
  return out
}

function parseSearchValue(raw) {
  const trimmed = (raw || '').trim()
  const mParen = trimmed.match(/^\(([^)]+)\)\s*:\s*(.+)$/)
  const mBrack = trimmed.match(/^\[([^\]]+)\]\s*:\s*(.+)$/)
  const m = mParen || mBrack
  if (m) {
    const fields = m[1].split(',').map(s => s.trim()).filter(Boolean)
    const terms = m[2].trim().split(/\s+/).filter(Boolean)
    return { fields, terms }
  }
  return trimmed
}

// --- Lazy JSON ---

function parseLazyJson(input) {
  const tokens = tokenizeLazy(input)
  const state = { idx: 0, tokens }
  const value = parseLazyValue(state)
  return value
}

function tokenizeLazy(input) {
  const tokens = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ':' || ch === ',') {
      tokens.push({ type: ch, value: ch })
      i++
      continue
    }
    if (ch === '(') { tokens.push({ type: '[', value: '[' }); i++; continue }
    if (ch === ')') { tokens.push({ type: ']', value: ']' }); i++; continue }
    if (ch === '"') {
      const { value, next } = readQuoted(input, i)
      tokens.push({ type: 'string', value })
      i = next
      continue
    }
    const { value, next } = readBare(input, i)
    if (value.length) tokens.push({ type: 'bare', value })
    i = next
  }
  return tokens
}

function readQuoted(input, start) {
  let i = start + 1
  let out = ''
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\\') {
      const next = input[i + 1]
      if (next === '"' || next === '\\') { out += next; i += 2; continue }
      if (next === 'n') { out += '\n'; i += 2; continue }
      if (next === 't') { out += '\t'; i += 2; continue }
      out += next
      i += 2
      continue
    }
    if (ch === '"') return { value: out, next: i + 1 }
    out += ch
    i++
  }
  return { value: out, next: i }
}

function readBare(input, start) {
  let i = start
  let out = ''
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch) || ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === '(' || ch === ')' || ch === ':' || ch === ',') {
      break
    }
    out += ch
    i++
  }
  return { value: out.trim(), next: i }
}

function parseLazyValue(state) {
  const tok = state.tokens[state.idx]
  if (!tok) return null
  if (tok.type === '{') return parseLazyObject(state)
  if (tok.type === '[') return parseLazyArray(state)
  if (tok.type === 'string') { state.idx++; return tok.value }
  if (tok.type === 'bare') { state.idx++; return autotype(tok.value) }
  throw new Error('Invalid lazy JSON')
}

function parseLazyObject(state) {
  const obj = {}
  state.idx++ // skip {
  while (state.idx < state.tokens.length) {
    const tok = state.tokens[state.idx]
    if (tok.type === '}') { state.idx++; break }
    if (tok.type !== 'string' && tok.type !== 'bare') throw new Error('Invalid object key')
    const key = tok.value
    state.idx++
    const colon = state.tokens[state.idx]
    if (!colon || colon.type !== ':') throw new Error('Missing colon')
    state.idx++
    const val = parseLazyValue(state)
    obj[key] = val
    const next = state.tokens[state.idx]
    if (next && next.type === ',') { state.idx++; continue }
    if (next && next.type === '}') { state.idx++; break }
  }
  return obj
}

function parseLazyArray(state) {
  const arr = []
  state.idx++ // skip [
  while (state.idx < state.tokens.length) {
    const tok = state.tokens[state.idx]
    if (tok.type === ']') { state.idx++; break }
    const val = parseLazyValue(state)
    arr.push(val)
    const next = state.tokens[state.idx]
    if (next && next.type === ',') { state.idx++; continue }
    if (next && next.type === ']') { state.idx++; break }
  }
  return arr
}

// --- Common ---

function parseValue(raw) {
  if (raw === undefined || raw === null) return ''
  const trimmed = String(raw).trim()
  if (trimmed === '') return ''
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return readQuoted(trimmed, 0).value
  }
  if (trimmed.startsWith('(') || trimmed.startsWith('[')) {
    const end = trimmed.endsWith(')') || trimmed.endsWith(']')
    if (!end) return autotype(trimmed)
    const inner = trimmed.slice(1, -1).trim()
    if (hasTopLevelPair(inner)) {
      return parseUrlNative(inner)
    }
    const parts = splitTopLevel(inner, [','])
    return parts.map(p => parseValue(p))
  }
  return autotype(unescapeBare(trimmed))
}

function autotype(s) {
  if (/^-?\d+$/.test(s)) return parseInt(s, 10)
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s)
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null
  return s
}

function splitTopLevel(input, delimiters, splitOnSpace = false) {
  const result = []
  let current = ''
  let depth = 0
  let inQuote = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inQuote) {
      current += ch
      if (ch === '"' && input[i - 1] !== '\\') inQuote = false
      continue
    }
    if (ch === '"') { inQuote = true; current += ch; continue }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; current += ch; continue }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; current += ch; continue }
    if (depth === 0) {
      if (delimiters.includes(ch)) {
        result.push(current.trim())
        current = ''
        continue
      }
      if (splitOnSpace && /\s/.test(ch)) {
        if (current.trim()) {
          result.push(current.trim())
          current = ''
        }
        continue
      }
    }
    current += ch
  }
  if (current.trim()) result.push(current.trim())
  return result
}

function splitFirst(input, seps) {
  for (let i = 0; i < input.length; i++) {
    if (seps.includes(input[i])) {
      return [input.slice(0, i), input.slice(i + 1)]
    }
  }
  return [input, '']
}

function unescapeBare(s) {
  return s.replace(/\\(.)/g, '$1')
}

function hasTopLevelPair(input) {
  let depth = 0
  let inQuote = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inQuote) {
      if (ch === '"' && input[i - 1] !== '\\') inQuote = false
      continue
    }
    if (ch === '"') { inQuote = true; continue }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; continue }
    if (depth === 0 && (ch === '=' || ch === ':')) return true
  }
  return false
}
