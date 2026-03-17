// UI server — admin panel only (no local database)
import * as Service from './service.js'
import * as Admin from './http/admin.js'

export function start(configOverrides) { Service.start(configOverrides, Admin.route) }
export function stop() { Service.stop() }
export function isRunning() { return Service.isRunning() }
export function ensureRunning(configOverrides) { Service.ensureRunning(configOverrides, Admin.route) }
export function getUrl() { return Service.getUrl() }
