# my-sqlite

A lightweight REST API over SQLite. It provides NoSQL-like collections but stores data under the hood in real SQL columns. 

## 🚀 Quick Start

Start the server:

```bash
npm install
cp .env.example .env

# Edit .env to set MY_SQLITE_TOKEN, then start the server:
node --env-file=.env packages/server/src/server.js --port 3000
```

> **Tip:** You can browse your databases and collections via the Admin UI at `http://localhost:3000/admin`. *(Requires a session cookie if started with `--token`)*

---

## 💻 Client Library

The easiest way to interact with your database is using the client library.

```js
import * as Db from 'my-sqlite-client'

// The URL specifies the host and database name (we omit the token since we set it in .env)
// (Automatically uses http:// for localhost and https:// for remote domains)
const mydb = 'localhost:3000/api/mydb'

// 1. Insert data (Analogous to POST /api/:db)
await Db.post(mydb, { 
  users: [{ name: 'Alice', age: 30 }] 
})

// 2. Query data (Analogous to GET /api/:db/:collection)
const { users } = await Db.get(mydb, { 
  users: { age: { $gte: 30 } } 
})

// 3. List all collections (Analogous to GET /api/:db)
await Db.get(mydb)
```

---

## 🔌 REST API Basics

If you prefer raw HTTP requests, the API is intuitive and JSON-based.

### Writing Data (POST `/api/:db`)

Send an array of records to insert, update, or delete. Everything in one request runs in a single SQLite transaction!

```json
{
  "users": [
    { "name": "Bob", "age": 25 },       // Insert (no id)
    { "id": 5, "age": 31 },             // Update (has id + fields)
    { "id": 6 }                         // Delete (only has id)
  ]
}
```

*Need to configure a collection (e.g., adding an index)? Send an object instead of an array: `{ "users": { "index": ["age"] } }` (or `{ "users": null }` to drop it).*

### Querying Data (GET `/api/:db/:collection`)

Pass a JSON query in the URL to filter, sort, and paginate:

```http
GET /api/mydb/users?{"age":{"$gte":30},"$sort":"-age","$limit":5}
```

- **Filter Operators:** `$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$in`, `$nin`, `$like`
- **Modifiers:** `$limit`, `$skip`, `$sort` (use `-` prefix for descending)

---

## ⚙️ Server Management

Configure your server using CLI flags:

| Flag        | Default    | Description                 |
| ----------- | ---------- | --------------------------- |
| `--port`    | `3000`     | Port to listen on           |
| `--host`    | `localhost`| Bind address                |
| `--datadir` | `./data`   | SQLite files directory      |
| `--token`   | `$MY_SQLITE_TOKEN` | Require a token for API access |
| `--tls`     | `off`      | Enable TLS                  |
| `--cert`    | *(none)*   | TLS certificate path        |
| `--key`     | *(none)*   | TLS key path                |

To gracefully stop the server:
```bash
node --env-file=.env packages/server/src/server.js --port 3000   # start (writes data/.pid)
node packages/server/src/stop.js                                 # gracefully stop
```
