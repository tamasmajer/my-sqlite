export async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers })
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
