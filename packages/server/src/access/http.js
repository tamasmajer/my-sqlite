// HTTP facade — wraps node:http and node:https server creation
import { createServer } from 'node:http'
import { createServer as createTlsServer } from 'node:https'
import { readFileSync } from 'node:fs'

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
