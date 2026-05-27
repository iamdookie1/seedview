// Encodes/decodes all shareable state into the URL hash.
// Format: #seed=VALUE&e=java&v=1.21&d=overworld&x=0&z=0&zoom=1

import { state } from '../state.js'

export function encodeURL() {
  const params = new URLSearchParams({
    seed: state.seed,
    e:    state.edition,
    v:    state.version,
    d:    state.dimension,
    x:    Math.round(state.camX),
    z:    Math.round(state.camZ),
    zoom: state.zoom.toFixed(3),
  })

  // Encode structure visibility overrides (only off ones, to keep URL short)
  const hidden = Object.entries(state.structureVisibility)
    .filter(([, v]) => !v)
    .map(([k]) => k)
    .join(',')
  if (hidden) params.set('hidden', hidden)
  if (state.highlightBiome) params.set('hb', state.highlightBiome)

  return '#' + params.toString()
}

export function decodeURL() {
  const hash = location.hash.slice(1)
  if (!hash) return false

  const params = new URLSearchParams(hash)

  if (params.has('seed'))  state.seed      = params.get('seed')
  if (params.has('e'))     state.edition   = params.get('e')
  if (params.has('v'))     state.version   = params.get('v')
  if (params.has('d'))     state.dimension = params.get('d')
  if (params.has('x'))     state.camX      = parseFloat(params.get('x')) || 0
  if (params.has('z'))     state.camZ      = parseFloat(params.get('z')) || 0
  if (params.has('zoom'))  state.zoom      = parseFloat(params.get('zoom')) || 1
  if (params.has('hb'))    state.highlightBiome = params.get('hb')

  if (params.has('hidden')) {
    const hidden = params.get('hidden').split(',').filter(Boolean)
    for (const key of hidden) {
      state.structureVisibility[key] = false
    }
  }

  return true
}

export function pushURL() {
  history.replaceState(null, '', encodeURL())
}

export function shareURL() {
  const url = location.origin + location.pathname + encodeURL()
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied!')
  }).catch(() => {
    prompt('Copy this link:', url)
  })
}

function showToast(msg) {
  const t = document.createElement('div')
  t.textContent = msg
  Object.assign(t.style, {
    position: 'fixed', bottom: '24px', right: '24px',
    background: '#3b82f6', color: '#fff',
    padding: '8px 16px', borderRadius: '6px',
    fontSize: '13px', fontFamily: 'Inter, sans-serif',
    zIndex: 9999, pointerEvents: 'none',
    transition: 'opacity .3s',
  })
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity = '0' }, 1500)
  setTimeout(() => t.remove(), 1900)
}
