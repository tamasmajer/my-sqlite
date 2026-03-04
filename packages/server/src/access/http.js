// HTTP facade — wraps node:http and node:https server creation
import { createServer } from 'node:http'
import { createServer as createTlsServer } from 'node:https'
import { readFileSync } from 'node:fs'

export function readBody(req, cb) {
  let data = ''
  req.on('data', chunk => { data += chunk })
  req.on('end', () => cb(data))
}

export function respond(res, status, headers, body) {
  res.writeHead(status, headers)
  res.end(body)
}

export function listen(opts, handler) {
  const { port, host, tls, cert, key } = opts
  const server = tls
    ? createTlsServer({ cert: readFileSync(cert), key: readFileSync(key) }, handler)
    : createServer(handler)
  server.listen(port, host, () => {
    const proto = tls ? 'https' : 'http'
    console.log(`${proto}://${host}:${port}`)
  })
  return server
}
