// API server — database only (no admin UI)
import * as Service from './service.js'
import * as Api from './http/api.js'
import * as Sql from './env/sqlite.js'

export function start(configOverrides) { Service.start(configOverrides, Api.route, Sql.closeAll) }
export function stop() { Service.stop() }
export function isRunning() { return Service.isRunning() }
export function ensureRunning(configOverrides) { Service.ensureRunning(configOverrides, Api.route, Sql.closeAll) }
export function getUrl() { return Service.getUrl() }
