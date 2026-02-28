// View — HTML rendering functions (pure, no side effects)

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function nav(crumbs) {
  const links = crumbs.map(c => c.href
    ? `<a href="${c.href}">${c.label}</a>`
    : `<span>${c.label}</span>`
  ).join(' / ')
  return `<div class="nav">${links}</div>`
}

export function renderLogin(error = '') {
  return `
    <h1>my-sqlite admin</h1>
    ${error ? `<p style="color:red;margin-bottom:8px">${error}</p>` : ''}
    <form id="login-form">
      <label>Token: <input type="password" name="token" autofocus></label>
      <button type="submit">Login</button>
    </form>
  `
}

export function renderDatabases(dbs) {
  const list = dbs.length
    ? dbs.map(d => `<li><a href="/admin/${d}">${d}</a></li>`).join('')
    : '<li>No databases yet</li>'

  const postForm = `
    <hr style="margin:24px 0;border:0;border-top:1px solid #ddd">
    <form id="create-db-form">
      <h3 style="margin-bottom:8px">Create Database</h3>
      <div class="flex">
        <input name="db" required placeholder="e.g. mydb">
        <button type="submit">Go to Database</button>
      </div>
    </form>
  `

  return nav([{ label: 'admin' }]) + `<h1>Databases</h1><ul>${list}</ul>` + postForm
}

export function renderCollections(dbName, collections) {
  const entries = Object.entries(collections || {})

  const postForm = `
    <hr style="margin:24px 0;border:0;border-top:1px solid #ddd">
    <form id="post-batch-db-form" data-db="${dbName}">
      <h3 style="margin-bottom:8px">Post to <code>${dbName}</code></h3>
      <textarea name="payload" rows="5" placeholder='{"new_collection": [{"name":"Bob"}], "existing": {"index":["name"]}}'></textarea>
      <button type="submit">Post</button>
    </form>
  `

  if (!entries.length) {
    return nav([{ label: 'admin', href: '/admin' }, { label: dbName }]) + `<h1>${dbName}</h1><p>No collections</p>` + postForm
  }

  const rows = entries.map(([name, info]) => {
    const cols = info.columns.join(', ')
    const idx = info.index.length ? info.index.join(', ') : '-'
    return `<tr><td><a href="/admin/${dbName}/${name}">${name}</a></td><td>${cols}</td><td>${idx}</td></tr>`
  }).join('')

  const table = `<table><tr><th>Collection</th><th>Columns</th><th>Indexes</th></tr>${rows}</table>`

  return nav([{ label: 'admin', href: '/admin' }, { label: dbName }]) + `<h1>${dbName}</h1>` + table + postForm
}

export function renderData(dbName, collName, data, info, q, skip, limit) {
  const rows = data[collName] || []
  const filterForm = `
    <form id="filter-form" data-db="${dbName}" data-coll="${collName}">
      <div class="flex">
        <input name="q" value="${esc(q)}" placeholder='{"age":{"$gte":30},"$sort":"-age","$limit":20}'>
        <button type="submit">Get</button>
      </div>
    </form>
  `

  const cols = info.columns || []
  let table = '<p>No rows</p>'
  if (rows.length) {
    const ths = cols.map(c => `<th>${c}</th>`).join('')
    const trs = rows.map(r => {
      const tds = cols.map(c => `<td>${esc(r[c])}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')
    table = `<table><tr>${ths}</tr>${trs}</table>`
  }

  let pager = '<div class="pager" style="margin-top:12px">'
  if (skip > 0) {
    const prev = Math.max(0, skip - limit)
    pager += `<a href="/admin/${dbName}/${collName}?q=${encodeURIComponent(q)}&skip=${prev}">Prev</a>`
  }
  const hasMore = rows.length === limit
  if (hasMore) {
    pager += `<a href="/admin/${dbName}/${collName}?q=${encodeURIComponent(q)}&skip=${skip + limit}">Next</a>`
  }
  pager += '</div>'

  const postForm = `
    <hr style="margin:24px 0;border:0;border-top:1px solid #ddd">
    <form id="post-batch-coll-form" data-db="${dbName}" data-coll="${collName}">
      <h3 style="margin-bottom:8px">Post to <code>${collName}</code></h3>
      <textarea name="payload" rows="5" placeholder='[{"name":"Bob"}, {"id":5,"name":"Alice"}]'></textarea>
      <button type="submit">Post</button>
    </form>
  `

  return nav([{ label: 'admin', href: '/admin' }, { label: dbName, href: `/admin/${dbName}` }, { label: collName }]) +
    `<h1>${collName}</h1>` + filterForm + table + pager + postForm
}
