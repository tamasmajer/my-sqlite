// Entry point — wires facades, router, and views together
import * as Api from './access/api.js'
import * as Browser from './access/env/browser.js'
import * as Routes from './access/routes.js'
import * as Views from './access/views.js'

let _config = {}

function page(app, content) {
  const sidebar = Views.renderSidebar(Api.getServer(), Api.getServers(), _config.localDb)
  Browser.setHtml(app, Views.layout(sidebar, content))
}

// Cell value popover
let _pop = null
function showPopover(td) {
  if (!_pop) {
    _pop = Browser.createElement('div', 'cell-popover')
    Browser.appendToBody(_pop)
  }
  Browser.setText(_pop, Browser.getDataAttr(td, 'copy'))
  Browser.setStyle(_pop, 'display', 'block')
  const r = Browser.getRect(td)
  Browser.setStyle(_pop, 'left', Math.min(r.left, Browser.innerWidth() - 520) + 'px')
  const below = Browser.innerHeight() - r.bottom
  if (below > 100 || below > r.top) {
    Browser.setStyle(_pop, 'top', (r.bottom + 6) + 'px')
    Browser.setStyle(_pop, 'bottom', 'auto')
  } else {
    Browser.setStyle(_pop, 'bottom', (Browser.innerHeight() - r.top + 6) + 'px')
    Browser.setStyle(_pop, 'top', 'auto')
  }
}
function hidePopover() { if (_pop) Browser.setStyle(_pop, 'display', 'none') }
Browser.onKeydown(e => { if (e.key === 'Escape') hidePopover() })

async function render() {
  const app = Browser.getById('app')
  const r = Routes.parse()

  if (!_config.localDb && !Api.getServer() && !Api.getToken()) {
    page(app, Views.renderLogin())
    return
  }
  if (Api.getServer() && !Api.getToken()) {
    page(app, Views.renderLogin())
    return
  }

  try {
    if (!r.db) {
      const dbs = await Api.fetchDatabases()
      page(app, Views.renderDatabases(dbs || []))
    } else if (!r.collection) {
      const cols = await Api.fetchCollections(r.db)
      page(app, Views.renderCollections(r.db, cols))
    } else {
      const [schema, rows, total] = await Promise.all([
        Api.fetchSchema(r.db, r.collection),
        Api.fetchQuery(r.db, r.collection, r.q, r.skip, r.limit),
        Api.fetchCount(r.db, r.collection, r.q),
      ])
      page(app, Views.renderData(r.db, r.collection, rows, schema, r.q, r.skip, r.limit, total.count))
    }
  } catch (err) {
    if (err.message === 'Unauthorized') {
      Api.setToken('')
      page(app, Views.renderLogin('Unauthorized'))
    } else {
      page(app, `<div class="error-page"><h1>Error</h1><p>${err.message}</p><a href="/admin">← Back</a></div>`)
    }
  }
}

// Global click delegation for SPA links
Browser.onClick(e => {
  // Hide popover on any outside click
  if (_pop && !Browser.contains(_pop, e.target)) hidePopover()

  // Click on data cell — show popover with full value
  const td = Browser.closest(e.target, 'td[data-copy]')
  if (td) {
    showPopover(td)
    return
  }

  // Switch server
  const serverItem = Browser.closest(e.target, '.server-item')
  if (serverItem) {
    e.preventDefault()
    const url = Browser.getAttr(serverItem, 'data-server')
    Api.setServer(url)
    // Set token from saved servers
    if (url) {
      const server = Api.getServers().find(s => s.url === url)
      if (server && server.token) Api.setToken(server.token)
    }
    Routes.navigate('/admin')
    return
  }

  // Remove server
  if (Browser.hasClass(e.target, 'server-remove')) {
    const url = Browser.getAttr(e.target, 'data-server')
    Api.removeServer(url)
    render()
    return
  }

  // SPA links
  const a = Browser.closest(e.target, 'a')
  if (a && a.href && a.href.startsWith(Browser.getOrigin() + '/admin')) {
    e.preventDefault()
    Routes.navigate(a.href)
    return
  }

  // Delete single row button
  if (Browser.hasClass(e.target, 'btn-del')) {
    const db = Browser.getAttr(e.target, 'data-db')
    const coll = Browser.getAttr(e.target, 'data-coll')
    const id = Browser.getAttr(e.target, 'data-id')
    if (confirm(`Delete ${id}?`)) {
      Api.deleteDocs(db, coll, JSON.stringify({ id })).then(render).catch(err => alert(err.message))
    }
  }

  // Truncate button
  if (e.target.id === 'truncate-btn') {
    const db = Browser.getAttr(e.target, 'data-db')
    const coll = Browser.getAttr(e.target, 'data-coll')
    if (confirm(`Delete ALL data from ${coll}? Schema will be preserved.`)) {
      Api.deleteDocs(db, coll, '{}').then(render).catch(err => alert(err.message))
    }
  }

  // Drop collection button
  if (e.target.id === 'drop-btn') {
    const db = Browser.getAttr(e.target, 'data-db')
    const coll = Browser.getAttr(e.target, 'data-coll')
    if (confirm(`DROP collection ${coll}? This cannot be undone.`)) {
      Api.deleteDocs(db, coll, '').then(() => Routes.navigate(`/admin/${db}`)).catch(err => alert(err.message))
    }
  }

  // Drop database button
  if (e.target.id === 'drop-db-btn') {
    const db = Browser.getAttr(e.target, 'data-db')
    if (confirm(`DROP database ${db}? All collections will be deleted.`)) {
      Api.dropDatabase(db).then(() => Routes.navigate('/admin')).catch(err => alert(err.message))
    }
  }
})

// Global form submission delegation
Browser.onSubmit(async e => {
  e.preventDefault()
  const form = e.target
  const fd = Browser.getFormData(form)

  if (form.id === 'add-server-form') {
    const url = fd.url.replace(/\/+$/, '')
    if (url) {
      Api.addServer(url, fd.token)
      Api.setServer(url)
      Api.setToken(fd.token)
      Routes.navigate('/admin')
    }
  } else if (form.id === 'login-form') {
    Api.setToken(fd.token)
    render()
  } else if (form.id === 'create-db-form') {
    Routes.navigate('/admin/' + encodeURIComponent(fd.db))
  } else if (form.id === 'filter-form') {
    const db = Browser.getAttr(form, 'data-db')
    const coll = Browser.getAttr(form, 'data-coll')
    Routes.navigate(`/admin/${db}/${coll}?q=${encodeURIComponent(fd.q)}&skip=0`)
  } else if (form.id === 'put-form') {
    const db = Browser.getAttr(form, 'data-db')
    try {
      const payload = JSON.parse(fd.payload || '[]')
      await Api.putDocs(db, fd.collection, payload)
      Routes.navigate(`/admin/${db}/${fd.collection}`)
    } catch (err) {
      alert(err.message)
    }
  } else if (form.id === 'put-coll-form') {
    const db = Browser.getAttr(form, 'data-db')
    const coll = Browser.getAttr(form, 'data-coll')
    try {
      const payload = JSON.parse(fd.payload || '{}')
      await Api.putDocs(db, coll, payload)
      render()
    } catch (err) {
      alert(err.message)
    }
  } else if (form.id === 'index-form') {
    const db = Browser.getAttr(form, 'data-db')
    const coll = Browser.getAttr(form, 'data-coll')
    try {
      const fields = fd.indexFields.split(',').map(s => s.trim()).filter(Boolean)
      await Api.setMeta(db, coll, { index: fields })
      render()
    } catch (err) {
      alert(err.message)
    }
  } else if (form.id === 'search-form') {
    const db = Browser.getAttr(form, 'data-db')
    const coll = Browser.getAttr(form, 'data-coll')
    try {
      const fields = fd.searchFields.split(',').map(s => s.trim()).filter(Boolean)
      await Api.setMeta(db, coll, { search: fields })
      render()
    } catch (err) {
      alert(err.message)
    }
  }
})

Browser.onPopState(render)
Api.fetchConfig().then(cfg => {
  _config = cfg || {}
  if (cfg.servers) Api.mergeServers(cfg.servers)
  const current = Api.getServer()
  if (cfg.servers && cfg.servers.length) {
    if (current) {
      const s = cfg.servers.find(x => x.url === current)
      if (s && s.token) Api.setToken(s.token)
    } else {
      const s = cfg.servers[0]
      if (s && s.url) {
        Api.setServer(s.url)
        if (s.token) Api.setToken(s.token)
      }
    }
  }
  render()
})
