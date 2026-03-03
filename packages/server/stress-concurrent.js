// Stress test: concurrent operations on same table/rows
// Goal: break SQLite, find data corruption, lost updates, deadlocks

const BASE = process.argv[2] || 'http://localhost:3001'
const TOKEN = process.argv[3] || ''
const DB = 'stressdb'
const COLL = 'race'
const EP = `${BASE}/api/${DB}/${COLL}`

async function req(path, opts = {}) {
  const headers = { ...opts.headers }
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`
  const res = await fetch(path, { ...opts, headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${body}`)
  }
  return res.json()
}

function put(doc) {
  return req(EP, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) })
}

function patch(doc) {
  return req(EP, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) })
}

function get(f = {}) {
  return req(EP + '?' + encodeURIComponent(JSON.stringify(f)))
}

function del(f) {
  const qs = f !== undefined ? '?' + encodeURIComponent(JSON.stringify(f)) : ''
  return req(EP + qs, { method: 'DELETE' })
}

async function collect(label, count, fn) {
  const start = performance.now()
  const results = await Promise.all(Array.from({ length: count }, (_, i) => fn(i).then(r => ({ ok: true, r })).catch(e => ({ ok: false, e: e.message }))))
  const ms = (performance.now() - start).toFixed(1)
  const ok = results.filter(r => r.ok).length
  const fail = results.filter(r => !r.ok).length
  const errors = [...new Set(results.filter(r => !r.ok).map(r => r.e))]
  console.log(`  ${label}: ${ms}ms — ${ok} ok, ${fail} failed`)
  if (errors.length) errors.forEach(e => console.log(`    ERROR: ${e.slice(0, 120)}`))
  return { ok, fail, ms: parseFloat(ms), results }
}

async function run() {
  await del().catch(() => {})

  // --- 1. Same row, concurrent upserts ---
  console.log('\n=== 1. 200 concurrent PUTs to SAME row ===')
  await put({ id: 'row1', counter: 0 })
  await collect('same-row upsert', 200, (i) => put({ id: 'row1', counter: i }))
  const row1 = await get({ id: 'row1' })
  console.log(`  Final state: counter=${row1[0]?.counter} (last writer wins)`)

  // --- 2. Concurrent PATCHes to same row ---
  console.log('\n=== 2. 200 concurrent PATCHes to SAME row ===')
  await put({ id: 'row2', a: 0, b: 0, c: 0 })
  await collect('same-row patch', 200, (i) => patch({ id: 'row2', [`f${i % 3}`]: i }))
  const row2 = await get({ id: 'row2' })
  console.log(`  Final state:`, JSON.stringify(row2[0]))

  // --- 3. Concurrent writes to DIFFERENT rows ---
  console.log('\n=== 3. 500 concurrent PUTs to DIFFERENT rows ===')
  await collect('different-row puts', 500, (i) => put({ id: `d${i}`, val: i }))
  const count = await get({})
  console.log(`  Rows created: ${count.length} (expected: 502 incl row1,row2)`)

  // --- 4. Read-while-write: concurrent reads + writes on same data ---
  console.log('\n=== 4. 200 reads + 200 writes simultaneously ===')
  await collect('read-while-write', 400, (i) =>
    i < 200
      ? get({ id: `d${i % 100}` })
      : put({ id: `d${i % 100}`, val: i, updated: true })
  )

  // --- 5. Concurrent deletes + writes (same rows) ---
  console.log('\n=== 5. 100 deletes + 100 writes on overlapping rows ===')
  await collect('delete-while-write', 200, (i) =>
    i < 100
      ? del({ id: `d${i}` })
      : put({ id: `d${i - 100}`, val: 'resurrected' })
  )
  const afterConflict = await get({ id: { $in: ['d0', 'd1', 'd2', 'd3', 'd4'] } })
  console.log(`  Sample rows after conflict:`, afterConflict.map(r => `${r.id}=${r.val}`).join(', '))

  // --- 6. Concurrent batch writes (multiple large batches) ---
  console.log('\n=== 6. 10 concurrent batch PUTs of 1000 docs each ===')
  await collect('concurrent batches', 10, (i) => {
    const docs = Array.from({ length: 1000 }, (_, j) => ({ id: `batch${i}_${j}`, src: i, val: j }))
    return put(docs)
  })
  const batchCount = await get({ $limit: 1 })
  console.log(`  (checking data exists)`)

  // --- 7. Rapid create-read-delete cycles ---
  console.log('\n=== 7. 100 concurrent create-read-delete cycles ===')
  await collect('create-read-delete', 100, async (i) => {
    const id = `cycle${i}`
    await put({ id, step: 'created' })
    const rows = await get({ id })
    if (!rows.length) throw new Error(`Row ${id} missing after put!`)
    await del({ id })
    const after = await get({ id })
    if (after.length) throw new Error(`Row ${id} still exists after delete!`)
    return 'ok'
  })

  // --- 8. Schema mutation under load (add columns while writing) ---
  console.log('\n=== 8. Concurrent writes with different schemas ===')
  await del().catch(() => {})
  await del({}).catch(() => {})
  await collect('schema mutation', 200, (i) => {
    const doc = { id: `schema${i}` }
    // Each write adds different columns
    for (let j = 0; j < 5; j++) doc[`col_${i}_${j}`] = `val${j}`
    return put(doc)
  })
  // Check how many columns the table has now
  const schemaReq = await req(EP, { method: 'OPTIONS' })
  console.log(`  Columns created: ${schemaReq.columns?.length}`)

  console.log('\n=== Done (data kept in stressdb/race) ===')
}

run().catch(e => { console.error('FATAL:', e); process.exit(1) })
