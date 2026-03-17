// View — HTML rendering functions (pure, no side effects)

function safeParseJson(s) {
  try { return JSON.parse(s) } catch { return {} }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderSidebar(currentServer, servers, localDb) {
  const items = [
    ...(localDb ? [`<a href="#" class="server-item ${!currentServer ? 'active' : ''}" data-server="">This Server</a>`] : []),
    ...servers.map(s => {
      const label = s.url.replace(/^https?:\/\//, '')
      const certUrl = s.url.replace(/\/?$/, '/api')
      return `<div class="server-entry">` +
        `<a href="#" class="server-item ${s.url === currentServer ? 'active' : ''}" data-server="${esc(s.url)}">${esc(label)}</a>` +
        `<a href="${esc(certUrl)}" target="_blank" class="server-link" title="Open (accept cert)">↗</a>` +
        `<button class="btn-del server-remove" data-server="${esc(s.url)}">✕</button>` +
        `</div>`
    })
  ].join('')

  return `
    <aside class="sidebar">
      <div class="sidebar-title">Servers</div>
      <div class="server-list">${items}</div>
      <form id="add-server-form" class="sidebar-form">
        <input name="url" placeholder="host:port">
        <input name="token" type="password" placeholder="token">
        <button type="submit">Add</button>
      </form>
    </aside>
  `
}

export function layout(sidebar, content) {
  return `<div class="app-layout">${sidebar}<main class="main-content">${content}</main></div>`
}

function nav(crumbs) {
  const links = crumbs.map(c => c.href
    ? `<a href="${c.href}">${c.label}</a>`
    : `<span class="current">${c.label}</span>`
  ).join(' <span class="sep">/</span> ')
  return `<nav class="breadcrumb">${links}</nav>`
}

function badge(text, cls = '') {
  return `<span class="badge ${cls}">${text}</span>`
}

export function renderLogin(error = '') {
  return `
    <div class="login-card">
      <h1>my-sqlite</h1>
      <p class="subtitle">Admin Console</p>
      ${error ? `<div class="error-msg">${error}</div>` : ''}
      <form id="login-form">
        <input type="password" name="token" placeholder="Enter token..." autofocus>
        <button type="submit">Login</button>
      </form>
    </div>
  `
}

export function renderDatabases(dbs) {
  const cards = dbs.length
    ? dbs.map(d => `
        <a href="/admin/${d}" class="card">
          <div class="card-icon">🗄</div>
          <div class="card-label">${d}</div>
        </a>
      `).join('')
    : '<p class="empty">No databases yet. Create one below or insert data via the API.</p>'

  return nav([{ label: 'admin' }]) + `
    <div class="header">
      <h1>Databases</h1>
      ${badge(dbs.length + ' total', 'muted')}
    </div>
    <div class="card-grid">${cards}</div>
    <div class="panel">
      <h3>Open Database</h3>
      <form id="create-db-form" class="inline-form">
        <input name="db" required placeholder="database name">
        <button type="submit">Go</button>
      </form>
    </div>
  `
}

export function renderCollections(dbName, collections) {
  const entries = (collections || []).map(c => [c.id, c])

  const crumbs = nav([{ label: 'admin', href: '/admin' }, { label: dbName }])

  if (!entries.length) {
    return crumbs + `
      <div class="header"><h1>${dbName}</h1></div>
      <p class="empty">No collections. Insert data via PUT to create one.</p>
      ${renderPutForm(dbName)}
      <div class="panel danger-panel">
        <h3>Danger Zone</h3>
        <div class="danger-actions">
          <button class="btn-danger" id="drop-db-btn" data-db="${dbName}">Drop Database</button>
        </div>
      </div>
    `
  }

  const rows = entries.map(([name, info]) => {
    const cols = info.columns.join(', ')
    const idx = info.index.length ? info.index.map(i => badge(i, 'idx')).join(' ') : '<span class="muted">none</span>'
    const search = info.search && info.search.length ? info.search.map(i => badge(i, 'search')).join(' ') : '<span class="muted">none</span>'
    const key = info.key || 'id'
    return `<tr>
      <td><a href="/admin/${dbName}/${name}">${name}</a></td>
      <td class="mono">${cols}</td>
      <td>${idx}</td>
      <td>${search}</td>
      <td class="mono">${key}</td>
    </tr>`
  }).join('')

  const table = `
    <table>
      <thead><tr><th>Collection</th><th>Columns</th><th>Indexes</th><th>Search</th><th>Key</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `

  return crumbs + `
    <div class="header">
      <h1>${dbName}</h1>
      ${badge(entries.length + ' collections', 'muted')}
    </div>
    ${table}
    ${renderPutForm(dbName)}
    <div class="panel danger-panel">
      <h3>Danger Zone</h3>
      <div class="danger-actions">
        <button class="btn-danger" id="drop-db-btn" data-db="${dbName}">Drop Database</button>
      </div>
    </div>
  `
}

function renderPutForm(dbName) {
  return `
    <div class="panel">
      <h3>Insert Data</h3>
      <form id="put-form" data-db="${dbName}">
        <div class="inline-form" style="margin-bottom:8px">
          <input name="collection" required placeholder="collection name" style="max-width:200px">
        </div>
        <textarea name="payload" rows="4" placeholder='[{"id":"1","name":"Alice","age":30}]'></textarea>
        <button type="submit">PUT</button>
      </form>
    </div>
  `
}

export function renderData(dbName, collName, rows, info, q, skip, limit, totalCount) {
  const crumbs = nav([
    { label: 'admin', href: '/admin' },
    { label: dbName, href: `/admin/${dbName}` },
    { label: collName }
  ])

  const filterForm = `
    <form id="filter-form" data-db="${dbName}" data-coll="${collName}" class="filter-bar">
      <input name="q" value="${esc(q)}" placeholder='{"age":{"$gte":30},"$sort":{"age":-1}}'>
      <button type="submit">Query</button>
    </form>
  `

  const cols = info.columns || []
  const idxCols = info.index || []
  const searchCols = info.search || []
  const keyField = info.key || 'id'

  const curFilter = safeParseJson(q)
  const curSort = curFilter.$sort || {}

  let table = '<p class="empty">No rows match the query.</p>'
  if (rows.length) {
    const ths = cols.map(c => {
      let markers = ''
      if (c === keyField || (Array.isArray(keyField) && keyField.includes(c))) markers += ' 🔑'
      if (idxCols.includes(c)) markers += ' ⚡'
      const dir = curSort[c]
      const arrow = dir === 1 ? ' ▲' : dir === -1 ? ' ▼' : ''
      const nextDir = dir === 1 ? -1 : dir === -1 ? 0 : 1
      const nextFilter = { ...curFilter }
      if (nextDir === 0) { delete nextFilter.$sort }
      else { nextFilter.$sort = { [c]: nextDir } }
      const href = `/admin/${dbName}/${collName}?q=${encodeURIComponent(JSON.stringify(nextFilter))}&skip=0`
      return `<th><a href="${href}" class="sort-header">${c}${markers}${arrow}</a></th>`
    }).join('') + '<th class="actions-col"></th>'

    const trs = rows.map(r => {
      const tds = cols.map(c => {
        const v = r[c]
        if (v === null || v === undefined) return `<td class="null-val">null</td>`
        const display = (typeof v === 'object') ? JSON.stringify(v) : v
        return `<td data-copy="${esc(String(display))}">${esc(display)}</td>`
      }).join('')
      const idVal = typeof keyField === 'string' ? r[keyField] : null
      const delBtn = idVal != null
        ? `<td class="actions-col"><button class="btn-del" data-db="${dbName}" data-coll="${collName}" data-id="${esc(idVal)}">✕</button></td>`
        : '<td></td>'
      return `<tr>${tds}${delBtn}</tr>`
    }).join('')

    table = `<div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
  }

  const rowCount = rows.length
  const total = totalCount != null ? totalCount : 0
  const rangeEnd = skip + rowCount
  const showing = rowCount > 0 ? `${skip + 1}–${rangeEnd} of ${total}` : `0 of ${total}`

  let pager = `<div class="pager"><span class="muted">Showing ${showing}</span>`
  if (skip > 0) {
    const prev = Math.max(0, skip - limit)
    pager += ` <a href="/admin/${dbName}/${collName}?q=${encodeURIComponent(q)}&skip=${prev}">← Prev</a>`
  }
  if (rangeEnd < total) {
    pager += ` <a href="/admin/${dbName}/${collName}?q=${encodeURIComponent(q)}&skip=${skip + limit}">Next →</a>`
  }
  pager += '</div>'

  const putForm = `
    <div class="panel">
      <h3>Insert / Upsert</h3>
      <form id="put-coll-form" data-db="${dbName}" data-coll="${collName}">
        <textarea name="payload" rows="3" placeholder='{"id":"new1","name":"Bob","age":25}'></textarea>
        <button type="submit">PUT</button>
      </form>
    </div>
  `

  const schemaInfo = `
    <div class="panel schema-panel">
      <h3>Schema</h3>
      <div class="schema-row"><span class="label">Key:</span> <code>${keyField}</code></div>
      <div class="schema-row"><span class="label">Columns:</span> <code>${cols.join(', ')}</code></div>
      <div class="schema-row"><span class="label">Indexes:</span> ${idxCols.length ? idxCols.map(i => badge(i, 'idx')).join(' ') : '<span class="muted">none</span>'}</div>
      <div class="schema-row"><span class="label">Search:</span> ${searchCols.length ? searchCols.map(i => badge(i, 'search')).join(' ') : '<span class="muted">none</span>'}</div>
      <form id="index-form" data-db="${dbName}" data-coll="${collName}" class="inline-form" style="margin-top:8px">
        <input name="indexFields" placeholder="col1, col2" value="${idxCols.join(', ')}">
        <button type="submit">Set Indexes</button>
      </form>
      <form id="search-form" data-db="${dbName}" data-coll="${collName}" class="inline-form" style="margin-top:8px">
        <input name="searchFields" placeholder="col1, col2" value="${searchCols.join(', ')}">
        <button type="submit">Set Search</button>
      </form>
    </div>
  `

  const dangerZone = `
    <div class="panel danger-panel">
      <h3>Danger Zone</h3>
      <div class="danger-actions">
        <button class="btn-danger" id="truncate-btn" data-db="${dbName}" data-coll="${collName}">Delete All Data</button>
        <button class="btn-danger" id="drop-btn" data-db="${dbName}" data-coll="${collName}">Drop Collection</button>
      </div>
    </div>
  `

  return crumbs + `
    <div class="header">
      <h1>${collName}</h1>
      ${badge(total + ' rows', 'muted')}
    </div>
    ${filterForm}
    ${table}
    ${pager}
    ${putForm}
    ${schemaInfo}
    ${dangerZone}
  `
}
