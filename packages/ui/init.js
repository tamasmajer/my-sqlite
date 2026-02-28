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
      const cols = await Api.fetchCollections(r.db)
      const data = await Api.fetchQuery(r.db, r.collection, r.q, r.skip, r.limit)
      const info = cols[r.collection] || { columns: [], index: [] }
      Browser.setHtml(app, View.renderData(r.db, r.collection, data, info, r.q, r.skip, r.limit))
    }
  } catch (err) {
    if (err.message === 'Unauthorized') {
      Api.setToken('')
      Browser.setHtml(app, View.renderLogin('Unauthorized'))
    } else {
      Browser.setHtml(app, `<h1>Error</h1><p>${err.message}</p><a href="/admin">Back to Admin</a>`)
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
  } else if (form.id === 'post-batch-db-form') {
    const db = Browser.getAttr(form, 'data-db')
    try {
      const payload = JSON.parse(fd.payload || '{}')
      await Api.postBatch(db, payload)
      render()
    } catch (err) {
      alert(err.message)
    }
  } else if (form.id === 'post-batch-coll-form') {
    const db = Browser.getAttr(form, 'data-db')
    const coll = Browser.getAttr(form, 'data-coll')
    try {
      const payload = JSON.parse(fd.payload || '[]')
      await Api.postBatch(db, { [coll]: payload })
      render()
    } catch (err) {
      alert(err.message)
    }
  }
})

Browser.onPopState(render)
render()
