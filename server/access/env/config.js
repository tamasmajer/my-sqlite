// Config — reads CLI flags + .env file, returns config object
import * as Proc from './process.js'
import * as Fs from './fs.js'

export function flag(args, name, fallback) {
  const i = args.indexOf('--' + name)
  if (i === -1) return fallback
  return args[i + 1] ?? true
}

export function hasFlag(args, name) {
  return args.includes('--' + name)
}

export function loadEnvFile(filePath) {
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
    Proc.setEnv(key, val)
  }
}

export function load() {
  const args = Proc.argv()

  const envFile = flag(args, 'env-file', null)
  if (envFile) {
    loadEnvFile(envFile)
  } else if (!Proc.env('MY_SQLITE_SERVERS') && !Proc.env('MY_SERVER_IP') && !Proc.env('MY_SQLITE_TOKEN')) {
    loadEnvFile(Fs.joinPath(Proc.cwd(), '.env'))
  }

  return {
    port: Number(flag(args, 'port', 3111)),
    host: flag(args, 'host', 'localhost'),
    datadir: flag(args, 'datadir', './data'),
    tls: hasFlag(args, 'tls'),
    cert: flag(args, 'cert', undefined),
    key: flag(args, 'key', undefined),
    token: flag(args, 'token', Proc.env('MY_SQLITE_TOKEN') || null),
    servers: flag(args, 'servers', Proc.env('MY_SQLITE_SERVERS') || null),
  }
}
