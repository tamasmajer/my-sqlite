// Entry point — wires facades, router, and views together
import * as Api from './access/api.js'
import * as Browser from './access/browser.js'
import * as Router from './router.js'
import * as View from './view.js'

async function render() {
  const app = Browser.getById('app')
  const r = Router.parse()

  if (!Api.getToken()) {
    Browser.setHtml(app, View.renderLogin())
    return
  }

  try {
    if (!r.db) {
      const dbs = await Api.fetchDatabases()
      Browser.setHtml(app, View.renderDatabases(dbs || []))
    } else if (!r.collection) {
      const cols = await Api.fetchCollections(r.db)
      Browser.setHtml(app, View.renderCollections(r.db, cols))
    } else {
      const schema = await Api.fetchSchema(r.db, r.collection)
      const rows = await Api.fetchQuery(r.db, r.collection, r.q, r.skip, r.limit)
      Browser.setHtml(app, View.renderData(r.db, r.collection, rows, schema, r.q, r.skip, r.limit))
    }
  } catch (err) {
    if (err.message === 'Unauthorized') {
      Api.setToken('')
      Browser.setHtml(app, View.renderLogin('Unauthorized'))
    } else {
      Browser.setHtml(app, `<div class="error-page"><h1>Error</h1><p>${err.message}</p><a href="/admin">← Back</a></div>`)
    }
  }
}

// Global click delegation for SPA links
Browser.onClick(e => {
  const a = Browser.closest(e.target, 'a')
  if (a && a.href && a.href.startsWith(Browser.getOrigin() + '/admin')) {
    e.preventDefault()
    Router.navigate(a.href)
  }

  // Delete single row button
  if (e.target.classList && e.target.classList.contains('btn-del')) {
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
      Api.deleteDocs(db, coll, '').then(() => Router.navigate(`/admin/${db}`)).catch(err => alert(err.message))
    }
  }
})

// Global form submission delegation
Browser.onSubmit(async e => {
  e.preventDefault()
  const form = e.target
  const fd = Browser.getFormData(form)

  if (form.id === 'login-form') {
    Api.setToken(fd.token)
    render()
  } else if (form.id === 'create-db-form') {
    Router.navigate('/admin/' + encodeURIComponent(fd.db))
  } else if (form.id === 'filter-form') {
    const db = Browser.getAttr(form, 'data-db')
    const coll = Browser.getAttr(form, 'data-coll')
    Router.navigate(`/admin/${db}/${coll}?q=${encodeURIComponent(fd.q)}&skip=0`)
  } else if (form.id === 'put-form') {
    const db = Browser.getAttr(form, 'data-db')
    try {
      const payload = JSON.parse(fd.payload || '[]')
      await Api.putDocs(db, fd.collection, payload)
      Router.navigate(`/admin/${db}/${fd.collection}`)
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
  }
})

Browser.onPopState(render)
render()
