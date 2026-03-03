# my-sqlite

A lightweight REST API over SQLite. NoSQL-like collections backed by real SQL columns. HTTP method = intent.

## Quick Start

```bash
npm install
node packages/server/src/server.js --port 3000
```

Admin UI at `http://localhost:3000/admin`

## API

### Endpoints

| Endpoint | GET | PUT | PATCH | DELETE | OPTIONS |
|----------|-----|-----|-------|--------|---------|
| `/api` | list dbs | | | | |
| `/api/:db` | list collections | | | | |
| `/api/:db/:coll` | query | upsert | merge update | delete / drop | schema |

### Examples

```bash
# Upsert
curl -X PUT localhost:3000/api/mydb/users \
  -H 'Content-Type: application/json' \
  -d '{"id":"u1","name":"Alice","age":30}'

# Query
curl 'localhost:3000/api/mydb/users?{"age":{"$gte":25},"$sort":"-age","$limit":10}'

# Partial update
curl -X PATCH localhost:3000/api/mydb/users \
  -H 'Content-Type: application/json' \
  -d '{"id":"u1","age":31}'

# Delete by query
curl -X DELETE 'localhost:3000/api/mydb/users?{"id":"u1"}'

# Set indexes
curl -X OPTIONS localhost:3000/api/mydb/users \
  -H 'Content-Type: application/json' \
  -d '{"index":["name","age"]}'

# Read schema
curl -X OPTIONS localhost:3000/api/mydb/users
```

### Query Syntax

JSON in query string: `?{"field":{"$op":value},"$sort":"-field","$limit":N}`

**Filters:** `$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$in`, `$nin`, `$like`
**Modifiers:** `$sort` (`-` prefix = DESC), `$limit`, `$skip`

### DELETE Semantics

- `?{"id":"u1"}` — delete matching docs
- `?{}` — delete all data, keep table + indexes
- *(no query)* — drop collection entirely

## Client Library

```js
import * as Db from 'my-sqlite-client'

const users = 'localhost:3000/api/mydb/users'

await Db.get(users, { age: { $gte: 30 }, $sort: '-age' })
await Db.get(users, 'u1')
await Db.get(users, {})
await Db.put(users, { id: Db.createId(), name: 'Alice', age: 30 })
await Db.patch(users, { id: 'u1', age: 31 })
await Db.del(users, 'u1')
await Db.del(users, {})            // truncate
await Db.del(users)                 // drop
await Db.options(users, { index: ['age'] })
await Db.options(users)             // read schema
```

## Server Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `3000` | Port |
| `--host` | `localhost` | Bind address |
| `--datadir` | `./data` | SQLite files directory |
| `--token` | `$MY_SQLITE_TOKEN` | Auth token |
| `--tls` | `off` | Enable TLS |
| `--cert` | | TLS cert path |
| `--key` | | TLS key path |
