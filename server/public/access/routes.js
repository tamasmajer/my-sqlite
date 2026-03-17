// Router — client-side URL state
import * as Browser from './env/browser.js'

export function navigate(path) {
  Browser.pushState(path)
  Browser.firePopState()
}

export function parse() {
  const path = Browser.getPath()
  const params = new URLSearchParams(Browser.getSearch())
  const parts = path.replace('/admin', '').split('/').filter(Boolean)

  return {
    path,
    db: parts[0] || null,
    collection: parts[1] || null,
    q: params.get('q') || '',
    skip: Number(params.get('skip')) || 0,
    limit: 50
  }
}
