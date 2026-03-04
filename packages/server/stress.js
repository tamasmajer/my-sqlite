// Stress test — sequential and concurrent throughput benchmarks
const BASE = process.argv[2] || 'http://localhost:3001'
const TOKEN = process.argv[3] || ''
const DB = 'stressdb'
const COLL = 'items'
const EP = `${BASE}/api/${DB}/${COLL}`

async function req(path, opts = {}) {
  const headers = { ...opts.headers }
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`
  const res = await fetch(path, { ...opts, headers })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

function put(doc) {
  return req(EP, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) })
}

function get(filter = {}) {
  return req(EP + '?' + encodeURIComponent(JSON.stringify(filter)))
}

function del(filter) {
  const qs = filter !== undefined ? '?' + encodeURIComponent(JSON.stringify(filter)) : ''
  return req(EP + qs, { method: 'DELETE' })
}

async function timed(label, fn) {
  const start = performance.now()
  const result = await fn()
  const ms = (performance.now() - start).toFixed(1)
  console.log(`  ${label}: ${ms}ms`, result ? `(${typeof result === 'number' ? result : ''})` : '')
  return { ms: parseFloat(ms), result }
}

async function timedParallel(label, count, fn) {
  const start = performance.now()
  const results = await Promise.all(Array.from({ length: count }, (_, i) => fn(i)))
  const ms = (performance.now() - start).toFixed(1)
  const errors = results.filter(r => r instanceof Error).length
  console.log(`  ${label}: ${ms}ms (${count} requests, ${errors} errors, ${(ms / count).toFixed(1)}ms avg)`)
  return { ms: parseFloat(ms), errors }
}

async function safeFetch(fn) {
  try { return await fn() } catch (e) { return e }
}

async function run() {
  // Cleanup
  await del().catch(() => {})

  // --- 1. Sequential writes ---
  console.log('\n--- Sequential PUT (100 docs) ---')
  await timed('100 single puts', async () => {
    for (let i = 0; i < 100; i++) {
      await put({ id: `s${i}`, name: `user${i}`, age: 20 + (i % 50), tags: ['a', 'b'] })
    }
    return 100
  })

  // --- 2. Batch write ---
  console.log('\n--- Batch PUT ---')
  const batch1k = Array.from({ length: 1000 }, (_, i) => ({ id: `b${i}`, name: `batch${i}`, age: 18 + (i % 60), score: Math.random() * 100 }))
  await timed('1,000 docs batch', () => put(batch1k))

  const batch10k = Array.from({ length: 10000 }, (_, i) => ({ id: `t${i}`, name: `ten${i}`, age: 18 + (i % 60), score: Math.random() * 100 }))
  await timed('10,000 docs batch', () => put(batch10k))

  // --- 3. Sequential reads ---
  console.log('\n--- Sequential GET ---')
  await timed('get all (limit 50)', () => get({ $limit: 50 }))
  await timed('get by id', () => get({ id: 'b500' }))
  await timed('filter + sort', () => get({ age: { $gte: 40 }, $sort: { score: -1 }, $limit: 20 }))
  await timed('$in query', () => get({ id: { $in: ['b1', 'b50', 'b100', 'b500', 'b999'] } }))

  // --- 4. Concurrent reads ---
  console.log('\n--- Concurrent GET ---')
  await timedParallel('50 concurrent reads', 50, () => safeFetch(() => get({ $limit: 10 })))
  await timedParallel('200 concurrent reads', 200, () => safeFetch(() => get({ age: { $gte: 30 }, $limit: 5 })))
  await timedParallel('500 concurrent reads', 500, () => safeFetch(() => get({ id: 'b100' })))

  // --- 5. Concurrent writes ---
  console.log('\n--- Concurrent PUT ---')
  await timedParallel('50 concurrent puts', 50, (i) => safeFetch(() => put({ id: `c${i}`, name: `conc${i}`, age: i })))
  await timedParallel('200 concurrent puts', 200, (i) => safeFetch(() => put({ id: `d${i}`, name: `conc${i}`, age: i })))

  // --- 6. Mixed read/write ---
  console.log('\n--- Mixed concurrent (50 reads + 50 writes) ---')
  await timedParallel('100 mixed', 100, (i) => safeFetch(() =>
    i % 2 === 0 ? get({ $limit: 5 }) : put({ id: `m${i}`, name: `mix${i}`, age: i })
  ))

  // --- 7. Large document ---
  console.log('\n--- Large documents ---')
  const bigDoc = { id: 'big1', data: 'x'.repeat(10000), nested: { a: Array.from({ length: 100 }, (_, i) => ({ k: i, v: 'test' })) } }
  await timed('put 10KB doc', () => put(bigDoc))
  await timed('get 10KB doc', () => get({ id: 'big1' }))

  const hugeDoc = { id: 'huge1', data: 'x'.repeat(1000000) }
  await timed('put 1MB doc', () => put(hugeDoc))
  await timed('get 1MB doc', () => get({ id: 'huge1' }))

  // --- 8. Many columns ---
  console.log('\n--- Wide document (100 columns) ---')
  const wide = { id: 'wide1' }
  for (let i = 0; i < 100; i++) wide[`col${i}`] = `val${i}`
  await timed('put 100-col doc', () => put(wide))
  await timed('get 100-col doc', () => get({ id: 'wide1' }))

  // --- 9. Rapid fire ---
  console.log('\n--- Rapid fire (1000 sequential GETs) ---')
  await timed('1000 sequential gets', async () => {
    for (let i = 0; i < 1000; i++) await get({ id: `b${i}` })
    return 1000
  })

  // --- 10. Multi-collection batch PUT ---
  console.log('\n--- Batch PUT (multi-collection) ---')
  const DB_EP = `${BASE}/api/${DB}`
  await timed('batch put 3 collections x 100 docs', () => req(DB_EP, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch_users: Array.from({ length: 100 }, (_, i) => ({ id: `bu${i}`, name: `user${i}`, age: 20 + i })),
      batch_orders: Array.from({ length: 100 }, (_, i) => ({ id: `bo${i}`, userId: `bu${i % 50}`, total: i * 10 })),
      batch_logs: Array.from({ length: 100 }, (_, i) => ({ id: `bl${i}`, msg: `event${i}`, ts: Date.now() })),
    })
  }))

  await timed('batch put 3 x 1000 docs', () => req(DB_EP, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch_users: Array.from({ length: 1000 }, (_, i) => ({ id: `bu${i}`, name: `user${i}`, score: Math.random() * 100 })),
      batch_orders: Array.from({ length: 1000 }, (_, i) => ({ id: `bo${i}`, userId: `bu${i % 500}`, total: i })),
      batch_logs: Array.from({ length: 1000 }, (_, i) => ({ id: `bl${i}`, msg: `log${i}` })),
    })
  }))

  // --- 11. Mixed batch POST ---
  console.log('\n--- Batch POST (mixed ops) ---')
  await timed('mixed ops: put+patch+delete across 2 colls', () => req(DB_EP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch_users: [
        { PUT: Array.from({ length: 50 }, (_, i) => ({ id: `mp${i}`, name: `new${i}`, role: 'tester' })) },
        { PATCH: Array.from({ length: 20 }, (_, i) => ({ id: `bu${i}`, verified: true })) },
        { DELETE: { role: 'tester' } },
      ],
      batch_orders: [
        { PUT: Array.from({ length: 50 }, (_, i) => ({ id: `mo${i}`, item: `product${i}`, qty: i + 1 })) },
      ],
    })
  }))

  // --- 12. Batch vs sequential comparison ---
  console.log('\n--- Batch vs Sequential (10 collections x 100 docs) ---')
  await timed('sequential: 10 puts to 10 colls', async () => {
    for (let c = 0; c < 10; c++) {
      const collEp = `${DB_EP}/seq_coll${c}`
      await req(collEp, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, val: i }))) })
    }
  })
  // clean seq collections
  for (let c = 0; c < 10; c++) await req(`${DB_EP}/seq_coll${c}`, { method: 'DELETE' }).catch(() => {})

  const batchBody = {}
  for (let c = 0; c < 10; c++) batchBody[`batch_coll${c}`] = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, val: i }))
  await timed('batch: 1 put to 10 colls', () => req(DB_EP, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batchBody)
  }))

  // --- 14. Delete stress (separate collection) ---
  console.log('\n--- Delete ---')
  const DEL_EP = `${BASE}/api/${DB}/del_test`
  const delPut = (doc) => req(DEL_EP, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) })
  const delGet = (f = {}) => req(DEL_EP + '?' + encodeURIComponent(JSON.stringify(f)))
  const delDel = (f) => { const qs = f !== undefined ? '?' + encodeURIComponent(JSON.stringify(f)) : ''; return req(DEL_EP + qs, { method: 'DELETE' }) }
  await delPut(Array.from({ length: 500 }, (_, i) => ({ id: `del${i}`, age: 18 + (i % 60) })))
  await timed('delete by query (age < 25)', () => delDel({ age: { $lt: 25 } }))
  await timed('count remaining', () => delGet({ $limit: 1 }))
  await timed('truncate (delete all)', () => delDel({}))
  await timed('drop collection', () => delDel())

  console.log('\n--- Done (data kept in stressdb/items) ---')
}

run().catch(err => { console.error('FATAL:', err); process.exit(1) })
