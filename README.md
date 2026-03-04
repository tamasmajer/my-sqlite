# my-sqlite

A thin REST layer over SQLite. Store and query JSON documents in Mongo-like collections using REST operations — tables and columns are created automatically. Data is organised as databases and collections (`/api/:db/:collection`), with one SQLite file per database. Each document requires an `id` primary key; additional indexes can be added.

| Method | Endpoint | Body / Params | Description |
|--------|----------|---------------|-------------|
| Method | Endpoint | Body / Params | Description |
|--------|----------|---------------|-------------|
| `GET` | `/api` | — | List databases |
| `GET` | `/api/:db` | — | List collections in a database |
| `DELETE` | `/api/:db` | — | Drop database |
| `PUT` | `/api/:db` | `{ coll: [docs], ... }` | Multi-collection upsert |
| `POST` | `/api/:db` | `{ coll: [ops], ... }` | Mixed batch operations |
| `GET` | `/api/:db/:coll` | `?{filter}` | Query documents |
| `PUT` | `/api/:db/:coll` | `{ id, ...fields }` | Upsert a document |
| `PATCH` | `/api/:db/:coll` | `{ id, ...fields }` | Partial update |
| `DELETE` | `/api/:db/:coll` | `?{ id }` / `?{}` / *(none)* | Delete matching / delete all docs / drop collection |
| `OPTIONS` | `/api/:db/:coll` | `{ index: [...] }` / *(none)* | Set indexes / read schema |

## Quick Start

Start the server:
```bash
npm install
node packages/server/src/server.js --port 3000
```
*The Admin UI will be available at [http://localhost:3000/admin](http://localhost:3000/admin)*

## How it works

Every operation targets a collection URL, e.g. `/api/mydb/users`:

```js
import * as Db from 'my-sqlite-client'

const users = 'localhost:3000/api/mydb/users'

// 1. Save a document (creates table & columns automatically)
await Db.put(users, { id: 'u1', name: 'Alice', age: 30 })

// 2. Query documents (Mongo-like syntax)
const adults = await Db.get(users, { age: { $gte: 25 }, $sort: { age: -1 } })

// 3. Update specific fields
await Db.patch(users, { id: 'u1', age: 31 })

// 4. Delete a document
await Db.del(users, 'u1')
```

## Core Concepts

### Querying Data

Pass a JSON filter object to `Db.get`. Fields and operators work like MongoDB:

```js
await Db.get(users, 'u1')                                                       // by id
await Db.get(users, { role: 'admin', $sort: { createdAt: -1 }, $limit: 10 })   // filter
```

Supported operators:
- **Comparison:** `$gt`, `$lt`, `$gte`, `$lte`, `$ne`
- **Array:** `$in`, `$nin`
- **String:** `$like`
- **Modifiers:** `$sort` (object, e.g. `{ age: -1 }` for DESC), `$limit`, `$skip`

### Inserting and Updating

**Upsert:** `id` is the default document key. If a record with that `id` exists it is replaced; otherwise a new one is created. Any new fields automatically become new columns.
```js
await Db.put(users, { id: Db.createId(), name: 'Bob', email: 'bob@example.com' })
```

**Partial update:** Send only the fields to change, along with the `id`.
```js
await Db.patch(users, { id: 'u1', status: 'active' })
```

### JSON Fields

Array and object values are stored as JSON text and automatically deserialized on read. Columns are typed as `JSON` in the schema so the server knows which fields to parse — no guessing.

```js
await Db.put(users, { id: 'u1', tags: ['admin', 'dev'], prefs: { theme: 'dark' } })
const user = await Db.get(users, 'u1')  // tags is an array, prefs is an object
```

### Managing Collections

```js
// Define indexes for faster queries:
await Db.options(users, { index: ['age', 'email'] })

// Read the current auto-generated schema:
const schema = await Db.options(users)

// Delete all records but keep the table and indexes:
await Db.del(users, {})

// Drop the entire collection permanently:
await Db.del(users)
```

### Batch Operations

Batch calls reduce network round-trips by sending multiple operations in a single request. All operations within a batch run in a single SQLite transaction.

**Multi-collection upsert** — `PUT /api/:db`:
```js
const db = 'localhost:3000/api/mydb'
await Db.put(db, {
  users:  [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }],
  orders: [{ id: 'o1', userId: 'u1', total: 50 }]
})
// → { ok: 1, users: { ok: 1 }, orders: { ok: 1 } }
```

**Mixed batch** — `POST /api/:db` — combine PUT, PATCH, and DELETE across collections:
```js
await Db.post(db, {
  users: [
    { PUT: [{ id: 'u3', name: 'Charlie' }] },
    { PATCH: [{ id: 'u1', age: 31 }] },
    { DELETE: { id: 'u2' } }
  ],
  orders: [
    { PUT: [{ id: 'o2', userId: 'u3', total: 75 }] }
  ]
})
// → { ok: 1, users: [{ ok: 1 }, { ok: 1 }, { ok: 1 }], orders: [{ ok: 1 }] }
```

## Admin UI

A built-in web UI is served at `/admin`. It lets you browse databases and collections, query and filter documents, insert/upsert data, manage indexes, and delete or drop collections — all without writing code. If a `--token` is set, the UI will prompt for it on first visit.

## Raw HTTP API

Each client method maps to a standard HTTP verb. Use `cURL` or any HTTP client directly:

```bash
# Save a document (PUT)
curl -X PUT localhost:3000/api/mydb/users \
  -H 'Content-Type: application/json' \
  -d '{"id":"u1","name":"Alice","age":30}'

# Query documents (GET with JSON in the query string)
curl 'localhost:3000/api/mydb/users?{"age":{"$gte":25},"$sort":{"age":-1}}'
```

## Server Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `3000` | Server listening port |
| `--host` | `localhost` | Bind address |
| `--datadir` | `./data` | Directory to store SQLite `.db` files |
| `--token` | `$MY_SQLITE_TOKEN` | Authentication token for the API |
| `--tls` | `off` | Enable TLS (`on` or `off`) |
| `--cert` | | Path to TLS certificate |
| `--key` | | Path to TLS key |

## Auth & Remote Access

When `--token` is set, every request must include it as a `Bearer` token. The client reads the token from the connection string — no extra config needed:

```js
// Token in the URL hash (recommended)
const users = 'myserver.com/api/mydb/users#my-secret-token'

// Or via environment variable MY_SQLITE_TOKEN (picked up automatically)
const users = 'myserver.com/api/mydb/users'
```

For raw HTTP requests, pass it in the `Authorization` header:
```bash
curl -H 'Authorization: Bearer my-secret-token' \
  'https://myserver.com/api/mydb/users?{"age":{"$gte":25}}'
```

### TLS Setup

For remote access over the internet, enable TLS. Without it the token is sent in plaintext.

**Self-signed certificate** (for private servers / development):
```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout key.pem -out cert.pem -days 365 \
  -subj '/CN=my-sqlite' \
  -addext 'subjectAltName=IP:YOUR_SERVER_IP'
```
Replace `YOUR_SERVER_IP` with the actual IP. The `-addext` line is needed for browsers to accept the cert when accessing by IP. On first visit you'll need to accept the self-signed cert in your browser.

**Start with TLS:**
```bash
node packages/server/src/server.js \
  --port 9443 --host 0.0.0.0 --tls on \
  --cert cert.pem --key key.pem \
  --token $(openssl rand -hex 24)
```

For production, use a proper certificate from Let's Encrypt or your CA instead of self-signed.

## Stress Test Results

Tested over HTTPS from a remote client against a minimal VPS:

**Server:** 1 vCPU (AMD EPYC 7282), 1 GB RAM, Ubuntu 24.04, Node.js, ~47ms network latency

### Throughput

| Operation | Time | Notes |
|-----------|------|-------|
| Sequential PUT (100 docs) | 5,285ms | ~53ms/req (network-bound) |
| Batch PUT 1,000 docs | 144ms | Single request |
| Batch PUT 10,000 docs | 764ms | Single request |
| Batch PUT 3 colls × 1,000 docs | 200ms | Multi-collection |
| Sequential 10 colls × 100 docs | 508ms | 10 requests |
| Batch 10 colls × 100 docs | 91ms | 1 request — **5.6× faster** |
| Mixed POST (put+patch+del) | 53ms | Single transaction |
| 1,000 sequential GETs | 46,632ms | ~47ms/req (network-bound) |

### Concurrency

| Operation | Time | Errors |
|-----------|------|--------|
| 50 concurrent reads | 212ms (4.2ms avg) | 0 |
| 200 concurrent reads | 447ms (2.2ms avg) | 0 |
| 500 concurrent reads | 724ms (1.4ms avg) | 0 |
| 200 concurrent PUTs (same row) | 477ms | 0 |
| 500 concurrent PUTs (diff rows) | 682ms | 0 |
| 400 reads + writes simultaneous | 234ms | 0 |
| 200 deletes + writes (overlapping) | 132ms | 0 |
| 10 × 1,000-doc batch PUTs | 1,016ms | 0 |
| 100 create-read-delete cycles | 240ms | 0 |
| 200 concurrent schema mutations | 1,238ms | 0 |

Zero errors across all tests. SQLite concurrency is safe because better-sqlite3 is synchronous and Node.js is single-threaded — writes are effectively serialized. The main bottleneck is network latency; batch calls are the best way to improve throughput.

## Coding Conventions

This project uses **static JS references** — no classes, no `this`, no method calls on objects. Every function call looks like `Module.function(data)`, so you can always tell where a function is defined just by reading the call site.

```js
import * as Schema from './schema.js'
import * as Data from './data.js'

// ✓ Static: Module.function() — you know exactly where to find these
Schema.openDb(datadir, name)
Data.upsert(db, coll, docs)

// ✗ Not flat: obj.method() — which class? which prototype? which override?
db.prepare(sql).run(params)
```

State is plain objects passed as arguments, not instances with methods. External dependencies (SQLite, fs, DOM) are wrapped in thin `access/*.js` facade modules so business logic never imports npm or Node directly.

### Project structure

```
packages/
  server/          HTTP server + SQLite engine
    src/
      server.js      Entry point, CLI flags
      router.js      HTTP routing, request dispatch
      schema.js      DB/table lifecycle, indexes, metadata
      data.js        CRUD operations (upsert, query, patch, remove)
      query.js       MongoDB-style query → SQL compiler
      auth.js        Token authentication
      access/        Facades (sqlite, fs, http, crypto)
  client/          JS client library
    src/
      client.js      get, put, patch, del, post, options
      access/        Facades (fetch)
  ui/              Admin web UI (SPA)
    init.js          Entry point, event delegation
    view.js          HTML rendering (pure functions)
    router.js        Client-side URL state
    access/          Facades (api, browser)
```
