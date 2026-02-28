// DOM facade — wraps browser APIs

export function getById(id) {
  return document.getElementById(id)
}

export function setHtml(el, html) {
  el.innerHTML = html
}

export function onClick(handler) {
  document.addEventListener('click', handler)
}

export function onSubmit(handler) {
  document.addEventListener('submit', handler)
}

export function onPopState(handler) {
  window.addEventListener('popstate', handler)
}

export function pushState(path) {
  window.history.pushState({}, '', path)
}

export function firePopState() {
  window.dispatchEvent(new Event('popstate'))
}

export function getPath() {
  return window.location.pathname
}

export function getSearch() {
  return window.location.search
}

export function getOrigin() {
  return window.location.origin
}

export function getFormData(form) {
  return Object.fromEntries(new FormData(form))
}

export function getAttr(el, name) {
  return el.getAttribute(name)
}

export function closest(el, selector) {
  return el.closest(selector)
}

export function storageGet(key) {
  return localStorage.getItem(key) || ''
}

export function storageSet(key, value) {
  localStorage.setItem(key, value)
}
