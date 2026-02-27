const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;padding:20px;max-width:960px;margin:0 auto;color:#222}
h1{margin-bottom:16px}
a{color:#0066cc;text-decoration:none}
a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{text-align:left;padding:6px 10px;border:1px solid #ddd}
th{background:#f5f5f5}
tr:hover{background:#fafafa}
.nav{margin-bottom:16px;font-size:14px;color:#666}
.nav a{margin-right:8px}
form.filter{margin:12px 0;display:flex;gap:8px}
form.filter input{flex:1;padding:6px;font-family:monospace}
form.filter button{padding:6px 16px}
.meta{font-size:13px;color:#888;margin-bottom:8px}
.pager{margin:12px 0;font-size:14px}
.pager a{margin-right:12px}
`

function layout(title, breadcrumbs, body) {
  const nav = breadcrumbs.map(b => b.href
    ? `<a href="${b.href}">${b.label}</a>`
    : `<span>${b.label}</span>`
  ).join(' / ')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} - my-sqlite</title>
<style>${CSS}</style></head>
<body>
<div class="nav">${nav}</div>
<h1>${title}</h1>
${body}
</body></html>`
}

// GET /admin — database list (scan datadir for .sqlite files)
export function dbListPage(databases) {
  const rows = databases.length
    ? databases.map(d => `<li><a href="/admin/${d}">${d}</a></li>`).join('')
    : '<li>No databases yet</li>'

  return layout('Databases', [{ label: 'admin' }],
    `<ul>${rows}</ul>`)
}

// GET /admin/:db — collection list
export function collectionListPage(dbName, collections) {
  const entries = Object.entries(collections)
  if (!entries.length) {
    return layout(dbName, [
      { label: 'admin', href: '/admin' },
      { label: dbName },
    ], '<p>No collections</p>')
  }

  const rows = entries.map(([name, info]) => {
    const cols = info.columns.join(', ')
    const idx = info.index.length ? info.index.join(', ') : '-'
    return `<tr><td><a href="/admin/${dbName}/${name}">${name}</a></td><td>${cols}</td><td>${idx}</td></tr>`
  }).join('')

  return layout(dbName, [
    { label: 'admin', href: '/admin' },
    { label: dbName },
  ], `<table><tr><th>Collection</th><th>Columns</th><th>Indexes</th></tr>${rows}</table>`)
}

// GET /admin/:db/:collection — data table
export function dataPage(dbName, collName, rows, columns, filterStr, skip, limit, total) {
  const breadcrumbs = [
    { label: 'admin', href: '/admin' },
    { label: dbName, href: `/admin/${dbName}` },
    { label: collName },
  ]

  const filterForm = `<form class="filter" method="GET">
<input name="q" value="${esc(filterStr || '')}" placeholder='{"age":{"$gte":30},"$sort":"-age","$limit":20}'>
<button type="submit">Filter</button></form>`

  let table = ''
  if (rows.length) {
    const ths = columns.map(c => `<th>${c}</th>`).join('')
    const trs = rows.map(row => {
      const tds = columns.map(c => `<td>${esc(String(row[c] ?? ''))}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')
    table = `<table><tr>${ths}</tr>${trs}</table>`
  } else {
    table = '<p>No rows</p>'
  }

  const meta = `<div class="meta">${total} row${total !== 1 ? 's' : ''} total, showing ${skip + 1}-${Math.min(skip + rows.length, total)}</div>`

  let pager = '<div class="pager">'
  if (skip > 0) {
    const prev = Math.max(0, skip - limit)
    pager += `<a href="?q=${encodeURIComponent(filterStr || '')}&skip=${prev}">Prev</a>`
  }
  if (skip + rows.length < total) {
    pager += `<a href="?q=${encodeURIComponent(filterStr || '')}&skip=${skip + limit}">Next</a>`
  }
  pager += '</div>'

  return layout(collName, breadcrumbs, filterForm + meta + table + pager)
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
