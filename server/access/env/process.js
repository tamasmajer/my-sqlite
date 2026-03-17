// Process facade — wraps process.* globals

export function argv() {
  return process.argv.slice(2)
}

export function env(key) {
  return process.env[key] || ''
}

export function setEnv(key, value) {
  if (!process.env[key]) process.env[key] = value
}

export function pid() {
  return process.pid
}

export function exit(code = 0) {
  process.exit(code)
}

export function kill(pid, signal = 'SIGTERM') {
  process.kill(pid, signal)
}

export function isAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

export function onSignal(signal, handler) {
  process.on(signal, handler)
}

export function cwd() {
  return process.cwd()
}
