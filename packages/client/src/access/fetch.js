// Fetch facade — HTTP methods returning parsed JSON

async function jsonOrThrow(res) {
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers })
  return jsonOrThrow(res)
}

export async function putJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function postText(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', ...headers },
    body: body ?? '',
  })
  return jsonOrThrow(res)
}

export async function patchJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function deleteWithQuery(url, headers = {}) {
  const res = await fetch(url, { method: 'DELETE', headers })
  return jsonOrThrow(res)
}

export async function optionsJson(url, body, headers = {}) {
  const opts = { method: 'OPTIONS', headers: { ...headers } }
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(url, opts)
  return jsonOrThrow(res)
}
