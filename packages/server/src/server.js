// Server — entry point, CLI flags, starts HTTP/HTTPS listener
import * as Http from './access/http.js'
import * as Sql from './access/sqlite.js'
import * as Fs from './access/fs.js'
import * as Router from './router.js'

const args = process.argv.slice(2)

function flag(name, fallback) {
  const i = args.indexOf('--' + name)
  if (i === -1) return fallback
  return args[i + 1] ?? true
}

const envFile = flag('env-file', null)
if (envFile) {
  loadEnvFile(envFile)
} else if (!process.env.MY_SQLITE_SERVERS && !process.env.MY_SERVER_IP && !process.env.MY_SQLITE_TOKEN) {
  loadEnvFile(Fs.joinPath(process.cwd(), '.env'))
}

const config = {
  port: Number(flag('port', 3000)),
  host: flag('host', 'localhost'),
  datadir: flag('datadir', './data'),
  mode: flag('mode', 'both'),
  tls: args.includes('--tls'),
  cert: flag('cert', undefined),
  key: flag('key', undefined),
  token: flag('token', process.env.MY_SQLITE_TOKEN || null),
  servers: flag('servers', process.env.MY_SQLITE_SERVERS || process.env.MY_SERVER_IP || null),
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

if (!['api', 'ui', 'both'].includes(String(config.mode).toLowerCase())) {
  console.error(`Invalid mode: ${config.mode}`)
  process.exit(1)
}

const server = Http.listen(config, (req, res) => Router.route(req, res, config))
Fs.writeFile(pidFile, String(process.pid))

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function loadEnvFile(filePath) {
  if (!Fs.exists(filePath)) return
  const raw = Fs.readFile(filePath)
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}
