// Fetch facade — HTTP methods returning parsed JSON
export async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers })
  return res.json()
}

export async function putJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function patchJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function deleteWithQuery(url, headers = {}) {
  const res = await fetch(url, { method: 'DELETE', headers })
  return res.json()
}

export async function optionsJson(url, body, headers = {}) {
  const opts = { method: 'OPTIONS', headers: { ...headers } }
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(url, opts)
  return res.json()
}
