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

export function createElement(tag, className) {
  const el = document.createElement(tag)
  if (className) el.className = className
  return el
}

export function appendToBody(el) {
  document.body.appendChild(el)
}

export function setText(el, text) {
  el.textContent = text
}

export function setStyle(el, prop, val) {
  el.style[prop] = val
}

export function getRect(el) {
  return el.getBoundingClientRect()
}

export function getDataAttr(el, name) {
  return el.dataset[name]
}

export function hasClass(el, cls) {
  return el.classList && el.classList.contains(cls)
}

export function contains(el, child) {
  return el.contains(child)
}

export function onKeydown(handler) {
  document.addEventListener('keydown', handler)
}

export function innerWidth() {
  return window.innerWidth
}

export function innerHeight() {
  return window.innerHeight
}

export function storageGet(key) {
  return localStorage.getItem(key) || ''
}

export function storageSet(key, value) {
  localStorage.setItem(key, value)
}
