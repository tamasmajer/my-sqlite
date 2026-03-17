# my-sqlite

A thin REST layer over SQLite. Store and query JSON documents in Mongo-like collections using REST operations — tables and columns are created automatically. Data is organised as databases and collections (`/api/:db/:collection`), with one SQLite file per database. Each document requires an `id` primary key; additional indexes and search fields can be added.

| Method | Endpoint | Body / Params | Description |
|--------|----------|---------------|-------------|
| `GET` | `/api` | — | List databases |
| `GET` | `/api/:db` | — | List collections in a database (array of configs) |
| `PUT` | `/api/:db` | `{ id, index, search, key }` | Upsert a collection config |
| `DELETE` | `/api/:db?{id}` | — | Drop a collection |
| `DELETE` | `/api/:db` | — | Drop database |
| `POST` | `/api/:db` | `text/plain` | Batch protocol (one command per line) |
| `GET` | `/api/:db/:coll` | `?filter` | Query documents |
| `PUT` | `/api/:db/:coll` | `{ id, ...fields }` | Upsert a document |
| `PATCH` | `/api/:db/:coll` | `{ id, ...fields }` | Partial update |
| `DELETE` | `/api/:db/:coll` | `?filter` / `?{}` / *(none)* | Delete matching / delete all docs / drop collection |

## Quick Start

```bash
cd server
npm install
```

Start the server (API + Admin UI):
```bash
npm start
```
*Admin UI at [http://localhost:3111/admin](http://localhost:3111/admin), API at [http://localhost:3111/api](http://localhost:3111/api)*

DB only (no UI):
```bash
npm run db-only
```

UI only (no local database — connects to remote servers):
```bash
npm run ui-only
```

Stop a running server:
```bash
npm run stop
```

## How it works

Every operation targets a collection URL, e.g. `/api/mydb/users`:

```js
import * as Db from 'my-sqlite-client'

const users = 'localhost:3111/api/mydb/users'

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
await Db.get(users, { age: { $gte: 25 }, $count: true })                      // → { count: 42 }
```

Supported operators:
- **Comparison:** `$gt`, `$lt`, `$gte`, `$lte`, `$ne`
- **Array:** `$in`, `$nin`
- **String:** `$like`
- **Modifiers:** `$sort` (object, e.g. `{ age: -1 }` for DESC), `$limit`, `$skip`, `$count`

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

// Define search fields for $search:
await Db.options(users, { search: ['name', 'bio'] })

// Read the current collection config:
const schema = await Db.options(users)

// Delete all records but keep the table and indexes:
await Db.del(users, {})

// Drop the entire collection permanently:
await Db.del(users)
```

### Batch Operations

Batch calls reduce network round-trips by sending multiple operations in a single request. All operations within a batch run in a single SQLite transaction.

**Text batch** — `POST /api/:db` with `Content-Type: text/plain`:
```text
PUT /users {id:u1,name:Alice}
PUT /users {id:u2,name:Bob}
GET /users age$gte=25&$sort=-age
PATCH /users {id:u1,age:31}
DELETE /users id=u2
GET /users $count=true
```

## Admin UI

A built-in web UI is served at `/admin`. It lets you browse databases and collections, query and filter documents, insert/upsert data, manage indexes, and delete or drop collections — all without writing code.

When running `npm start` (db + ui together), the UI talks to the local database directly — no token needed. When running `npm run ui-only`, the UI connects to remote servers configured in the sidebar.

## Raw HTTP API

Each client method maps to a standard HTTP verb. Use `cURL` or any HTTP client directly:

```bash
# Save a document (PUT)
curl -X PUT localhost:3111/api/mydb/users \
  -H 'Content-Type: application/json' \
  -d '{"id":"u1","name":"Alice","age":30}'

# Query documents (URL-native)
curl 'localhost:3111/api/mydb/users?age$gte=25&$sort=-age'
```

## Query Formats

Queries accept strict JSON, lazy JSON, or URL-native syntax. See `QUERY_PROTOCOL.md` for the full spec and examples.

## Service File (systemd)

Example service (DB only) with `.env`:
```ini
[Unit]
Description=my-sqlite REST API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/my-sqlite/server
ExecStart=/usr/local/bin/node api.js --port 9443 --host 0.0.0.0 --tls on --cert cert.pem --key key.pem
Restart=always
RestartSec=5
StandardOutput=append:/path/to/my-sqlite/server/logs/systemd.log
StandardError=append:/path/to/my-sqlite/server/logs/systemd-error.log

[Install]
WantedBy=multi-user.target
```

`.env` should contain:
```
MY_SQLITE_TOKEN=...
MY_SQLITE_SERVERS=host:port#token,host2:port2#token
```

## Server Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `3111` | Server listening port |
| `--host` | `localhost` | Bind address |
| `--datadir` | `./data` | Directory to store SQLite `.db` files |
| `--token` | `$MY_SQLITE_TOKEN` | Authentication token for the API |
| `--tls` | `off` | Enable TLS (`on` or `off`) |
| `--cert` | | Path to TLS certificate |
| `--key` | | Path to TLS key |
| `--env-file` | *(optional)* | Path to a `.env` file |

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
node api.js \
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

## Project Structure

```
my-sqlite/
  client/                   JS client library
    access/
      client.js               get, put, patch, del, options, batch
      fetch.js                wraps global fetch
    package.json
  server/                   HTTP server + SQLite engine
    access/
      service.js              generic server lifecycle
      server.js               pre-wired: DB + Admin UI
      api-server.js           pre-wired: DB only
      ui-server.js            pre-wired: Admin UI only
      db/
        data.js               CRUD operations
        query.js              filter → SQL compiler
        schema.js             table lifecycle, indexes, FTS
      http/
        api.js                API route tree
        admin.js              Admin UI route tree
        auth.js               token authentication
        parse.js              query parsing
        helpers.js            shared HTTP helpers
      env/
        http.js               wraps node:http
        sqlite.js             wraps better-sqlite3
        fs.js                 wraps node:fs
        crypto.js             wraps node:crypto
        process.js            wraps process.*
        config.js             reads CLI flags + .env
    public/                 Admin web UI (SPA)
      access/
        api.js                server communication
        views.js              HTML rendering
        routes.js             client-side URL state
        env/
          browser.js          wraps DOM, localStorage
      init.js                 entry script
      index.html
      style.css
    server.js               entry: DB + Admin UI
    api.js                  entry: DB only
    ui.js                   entry: Admin UI only
    stop.js                 entry: stop running server
    data/                   SQLite databases
    package.json
```

Entry scripts are 2 lines — all logic lives in `access/`. Each entry point has its own import tree: `ui.js` never loads database code, `api.js` never loads UI code.
