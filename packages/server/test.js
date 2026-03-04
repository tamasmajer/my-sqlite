// Test — integration tests for the API via the client library
import * as Db from '../client/src/client.js'

const db = 'localhost:3001/api/testdb2'
const users = db + '/users'

async function run() {
  console.log('--- PUT: upsert single ---')
  console.log(await Db.put(users, { id: 'u1', name: 'Alice', age: 30 }))

  console.log('--- PUT: upsert batch ---')
  console.log(await Db.put(users, [
    { id: 'u2', name: 'Bob', age: 25 },
    { id: 'u3', name: 'Eve', age: 35 },
  ]))

  console.log('--- GET: all ---')
  console.log(await Db.get(users, {}))

  console.log('--- GET: by id ---')
  console.log(await Db.get(users, 'u1'))

  console.log('--- GET: filter + sort ---')
  console.log(await Db.get(users, { age: { $gte: 30 }, $sort: { age: -1 } }))

  console.log('--- PATCH: partial update ---')
  console.log(await Db.patch(users, { id: 'u1', age: 31 }))
  console.log(await Db.get(users, 'u1'))

  console.log('--- DELETE: by id ---')
  console.log(await Db.del(users, 'u3'))
  console.log(await Db.get(users, {}))

  console.log('--- DELETE: by query ---')
  console.log(await Db.del(users, { age: { $lt: 30 } }))
  console.log(await Db.get(users, {}))

  console.log('--- PUT: re-add for index test ---')
  console.log(await Db.put(users, [
    { id: 'u2', name: 'Bob', age: 25 },
    { id: 'u3', name: 'Eve', age: 35 },
  ]))

  console.log('--- OPTIONS: set index ---')
  console.log(await Db.options(users, { index: ['name', 'age'] }))

  console.log('--- OPTIONS: read schema ---')
  console.log(await Db.options(users))

  console.log('--- GET: list collections ---')
  console.log(await Db.get(db))

  console.log('--- GET: list databases ---')
  console.log(await Db.get('localhost:3001/api'))

  console.log('--- DELETE: all data, keep schema ---')
  console.log(await Db.del(users, {}))
  console.log(await Db.get(users, {}))
  console.log(await Db.options(users))

  console.log('--- DELETE: drop collection ---')
  console.log(await Db.del(users))
  console.log(await Db.get(db))
}

run().catch(err => { console.error(err); process.exit(1) })
