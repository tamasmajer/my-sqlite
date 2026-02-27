# my-sqlite

Lightweight REST API over SQLite with database/collection semantics. Real SQL columns (not JSON blobs). Shape determines intent: array = data, object = config.

## Quick start

```bash
npm install
node packages/server/src/server.js --port 3000
```

## API

### POST /api/:db — write data or configure collections

```js
// array = data (batch, one transaction)
{ "users": [{ "name": "Alice", "age": 30 }] }           // insert (no id)
{ "users": [{ "id": 5, "age": 31 }] }                   // merge update
{ "users": [{ "id": 5 }] }                               // delete

// object = config
{ "users": { "index": ["name", "age"] } }                // set indexes
{ "users": null }                                         // drop collection
```

Data rules (in one SQLite transaction):
- No `id` → INSERT
- `id` + fields → UPDATE SET only provided fields
- `id` only → DELETE

### GET /api/:db/:collection — query

```
GET /api/mydb/users?{"age":{"$gte":30},"$sort":"-age","$limit":5}
```

Operators: `$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$in`, `$nin`, `$like`
Modifiers: `$limit`, `$skip`, `$sort` (prefix `-` for DESC)

### GET /api/:db — list collections

Returns `{ "users": { "columns": [...], "index": [...] } }`

## Admin UI

Browse databases and collections at `/admin`. Requires session cookie when `--token` is set.

## Client library

```js
import * as Db from 'my-sqlite-client'

const db = Db.connect('http://localhost:3000/mydb?token=secret')

const { users } = await Db.get(db, { users: { age: { $gte: 30 } } })
await Db.post(db, { users: [{ name: 'Alice', age: 30 }] })
await Db.list(db)
```

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | 3000 | Listen port |
| `--host` | localhost | Bind address |
| `--datadir` | ./data | SQLite file directory |
| `--token` | (none) | Enable auth |
| `--tls` | off | Enable TLS |
| `--cert` | - | TLS certificate path |
| `--key` | - | TLS key path |

## Server management

```bash
node packages/server/src/server.js --port 3000    # start (writes data/.pid)
node packages/server/src/stop.js                   # stop
```
