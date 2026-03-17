// Service — generic server lifecycle (start, stop, isRunning, shutdown)
import * as Http from './env/http.js'
import * as Fs from './env/fs.js'
import * as Proc from './env/process.js'
import * as Config from './env/config.js'

let _server = null
let _config = null
let _pidFile = null
let _cleanup = null

export function start(configOverrides, handler, cleanup) {
  _config = { ...Config.load(), ...configOverrides }
  _cleanup = cleanup || (() => {})

  Fs.ensureDir(_config.datadir)
  _pidFile = Fs.joinPath(_config.datadir, '.pid')

  if (Fs.exists(_pidFile)) {
    const pid = Number(Fs.readFile(_pidFile).trim())
    if (Proc.isAlive(pid)) {
      console.error(`Server already running (pid ${pid})`)
      Proc.exit(1)
    }
    Fs.remove(_pidFile)
  }

  _server = Http.listen(_config, (req, res) => handler(req, res, _config))
  Fs.writeFile(_pidFile, String(Proc.pid()))

  Proc.onSignal('SIGINT', shutdown)
  Proc.onSignal('SIGTERM', shutdown)
}

export function stop() {
  if (_cleanup) _cleanup()
  if (_server) { _server.close(); _server = null }
  if (_pidFile) { Fs.remove(_pidFile); _pidFile = null }
  _config = null
  _cleanup = null
}

export function isRunning() {
  const config = _config || Config.load()
  const pidFile = Fs.joinPath(config.datadir, '.pid')
  if (!Fs.exists(pidFile)) return false
  const pid = Number(Fs.readFile(pidFile).trim())
  return Proc.isAlive(pid)
}

export function ensureRunning(configOverrides, handler, cleanup) {
  if (!isRunning()) start(configOverrides, handler, cleanup)
}

export function getUrl() {
  const config = _config || Config.load()
  const proto = config.tls ? 'https' : 'http'
  return `${proto}://localhost:${config.port}`
}

function shutdown() {
  if (_cleanup) _cleanup()
  if (_server) _server.close()
  if (_pidFile) Fs.remove(_pidFile)
  Proc.exit(0)
}
