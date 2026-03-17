// HTTP helpers — shared by api.js and admin.js
import * as Http from '../env/http.js'

export function readBody(req, cb) {
  Http.readBody(req, raw => {
    const ct = req.headers['content-type'] || ''
    if (ct.includes('text/plain')) { cb(raw); return }
    if (ct.includes('json')) { cb(JSON.parse(raw)); return }
    if (ct.includes('application/x-www-form-urlencoded')) {
      cb(Object.fromEntries(new URLSearchParams(raw)))
      return
    }
    cb(raw)
  })
}

export function json(res, status, data) {
  Http.respond(res, status, { 'content-type': 'application/json', ...corsHeaders() }, JSON.stringify(data))
}

export function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, PATCH, DELETE, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  }
}

export function corsPreflight(req, res) {
  if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
    Http.respond(res, 204, corsHeaders(), '')
    return true
  }
  return false
}

export function notFound(res) {
  Http.respond(res, 404, {}, 'not found')
}
