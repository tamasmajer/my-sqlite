// Server — full server (API + admin UI)
import * as Service from './service.js'
import * as Api from './http/api.js'
import * as Admin from './http/admin.js'
import * as Sql from './env/sqlite.js'
import * as H from './http/helpers.js'

function route(req, res, config) {
  const path = new URL(req.url, `http://${req.headers.host}`).pathname
  if (path === '/api' || path.startsWith('/api/')) { Api.route(req, res, config); return }
  if (path.startsWith('/admin') || path === '/') { Admin.route(req, res, config); return }
  H.notFound(res)
}

export function start(configOverrides) { Service.start({ localDb: true, ...configOverrides }, route, Sql.closeAll) }
export function stop() { Service.stop() }
export function isRunning() { return Service.isRunning() }
export function ensureRunning(configOverrides) { Service.ensureRunning({ localDb: true, ...configOverrides }, route, Sql.closeAll) }
export function getUrl() { return Service.getUrl() }
