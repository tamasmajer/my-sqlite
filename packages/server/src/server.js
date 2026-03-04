// Server — entry point, CLI flags, starts HTTP/HTTPS listener
import * as Http from './access/http.js'
import * as Sql from './access/sqlite.js'
import * as Fs from './access/fs.js'
import { route } from './router.js'


const args = process.argv.slice(2)

function flag(name, fallback) {
  const i = args.indexOf('--' + name)
  if (i === -1) return fallback
  return args[i + 1] ?? true
}

const config = {
  port: Number(flag('port', 3000)),
  host: flag('host', 'localhost'),
  datadir: flag('datadir', './data'),
  tls: args.includes('--tls'),
  cert: flag('cert', undefined),
  key: flag('key', undefined),
  token: flag('token', process.env.MY_SQLITE_TOKEN || null),
  servers: flag('servers', null),
}

Fs.ensureDir(config.datadir)

const pidFile = Fs.joinPath(config.datadir, '.pid')

if (Fs.exists(pidFile)) {
  const pid = Number(Fs.readFile(pidFile).trim())
  let alive = false
  try { process.kill(pid, 0); alive = true } catch { }
  if (alive) {
    console.error(`Server already running (pid ${pid})`)
    process.exit(1)
  }
  Fs.remove(pidFile)
}

function shutdown() {
  Sql.closeAll()
  server.close()
  Fs.remove(pidFile)
  process.exit(0)
}

const server = Http.listen(config, (req, res) => route(req, res, config))
Fs.writeFile(pidFile, String(process.pid))

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
