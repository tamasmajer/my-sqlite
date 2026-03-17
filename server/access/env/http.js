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
  let server
  if (tls) {
    server = createTlsServer({ cert: readFileSync(cert), key: readFileSync(key) }, handler)
    server.listen(port, host, () => {
      const proto = 'https'
      const displayHost = (host === '0.0.0.0' || host === '::') ? 'localhost' : host
      const bind = `${proto}://${host}:${port}`
      const hint = `${proto}://${displayHost}:${port}`
      if (bind !== hint) console.log(`${bind} (open ${hint})`)
      else console.log(bind)
    })

    const httpServer = createServer(handler)
    httpServer.listen(port - 1, '127.0.0.1', () => {
      console.log(`http://127.0.0.1:${port - 1} (local)`)
    })
    server._httpServer = httpServer
  } else {
    server = createServer(handler)
    server.listen(port, host, () => {
      const proto = 'http'
      const displayHost = (host === '0.0.0.0' || host === '::') ? 'localhost' : host
      const bind = `${proto}://${host}:${port}`
      const hint = `${proto}://${displayHost}:${port}`
      if (bind !== hint) console.log(`${bind} (open ${hint})`)
      else console.log(bind)
    })
  }
  return server
}
