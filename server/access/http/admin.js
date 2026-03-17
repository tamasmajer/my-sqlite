// Admin routes — serves UI static files + config endpoint
import * as Http from '../env/http.js'
import * as Fs from '../env/fs.js'
import * as Proc from '../env/process.js'
import * as H from './helpers.js'

export function route(req, res, config) {
  if (H.corsPreflight(req, res)) return

  const url = new URL(req.url, `http://${req.headers.host}`)
  let relPath = url.pathname.replace(/^\/admin/, '') || '/'
  const uiDir = Fs.joinPath(Proc.cwd(), 'public')

  if (relPath === '/config') {
    const servers = parseServersFlag(config.servers)
    H.json(res, 200, { servers, localDb: !!config.localDb })
    return
  }

  if (relPath === '/') relPath = '/index.html'

  let filePath = Fs.joinPath(uiDir, relPath)
  let ext = filePath.split('.').pop()

  if (!Fs.exists(filePath)) {
    filePath = Fs.joinPath(uiDir, 'index.html')
    ext = 'html'
  }

  try {
    const data = Fs.readFile(filePath)
    const mime = ext === 'js' ? 'text/javascript' : ext === 'css' ? 'text/css' : ext === 'html' ? 'text/html' : 'application/octet-stream'
    Http.respond(res, 200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' }, data)
  } catch (e) {
    Http.respond(res, 404, {}, 'not found')
  }
}

function parseServersFlag(val) {
  if (!val) return []
  return val.split(',').map(s => {
    const [url, token] = s.trim().split('#')
    return { url, token: token || '' }
  }).filter(s => s.url)
}
