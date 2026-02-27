import * as Fs from './access/fs.js'
import { join } from 'node:path'

const args = process.argv.slice(2)
const i = args.indexOf('--datadir')
const datadir = i !== -1 ? args[i + 1] : './data'
const pidFile = join(datadir, '.pid')

if (!Fs.exists(pidFile)) {
  console.log('No running server found')
  process.exit(1)
}

const pid = Number(Fs.readFile(pidFile).trim())
try {
  process.kill(pid, 'SIGTERM')
  console.log(`Stopped server (pid ${pid})`)
} catch (err) {
  console.log(`Process ${pid} not found`)
}
Fs.remove(pidFile)
