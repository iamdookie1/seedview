import { state } from '../state.js'
import { getStructureTypesForDimension } from '../core/cubiomes-core.js'

// Cache structures by seed+dimension+version (not by viewport)
const _cache = new Map()
const _pending = new Set()

function cacheKey() {
  return `${state.seed}:${state.edition}:${state.version}:${state.dimension}`
}

export function drawStructures(ctx, W, H, camX, camZ, zoom, wx0, wz0, wx1, wz1, renderer) {
  const key = cacheKey()

  if (!_cache.has(key) && !_pending.has(key)) {
    _pending.add(key)
    const PAD = 4096  // fetch a large area so panning doesn't re-request
    const id = ++_sid
    _sidToKey.set(id, key)
    renderer.worker.postMessage({
      type: 'getStructures',
      id,
      payload: {
        seed: state.seed, edition: state.edition,
        version: state.version, dimension: state.dimension,
        x0: -8192, z0: -8192, x1: 8192, z1: 8192,
      }
    })
  }

  const structs = _cache.get(key) ?? []
  const types   = getStructureTypesForDimension(state.dimension)
  const typeMap = Object.fromEntries(types.map(t => [t.type, t]))

  // Icon size scales with zoom but clamps
  const iconSize = Math.max(16, Math.min(28, zoom * 16 + 14))
  ctx.save()
  ctx.font = `${iconSize}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const s of structs) {
    if (state.structureVisibility[s.type] === false) continue
    const sx = (s.x - camX) * zoom + W/2
    const sz = (s.z - camZ) * zoom + H/2
    if (sx < -40 || sx > W+40 || sz < -40 || sz > H+40) continue

    const def  = typeMap[s.type]
    if (!def) continue
    const icon = def.icon

    // Background circle
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.arc(sx, sz, iconSize*0.7, 0, Math.PI*2)
    ctx.fill()

    // Icon
    ctx.fillStyle = '#fff'
    ctx.fillText(icon, sx, sz)

    // Label at higher zoom
    if (zoom > 0.3) {
      ctx.font = '11px Inter,sans-serif'
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillText(def.label, sx+1, sz+iconSize+1)
      ctx.fillStyle = '#fff'
      ctx.fillText(def.label, sx, sz+iconSize)
      ctx.font = `${iconSize}px serif`
    }
  }
  ctx.restore()
}

let _sid = 0
const _sidToKey = new Map()

export function onStructuresReady(id, results) {
  const key = _sidToKey.get(id)
  if (!key) return
  _sidToKey.delete(id)
  _pending.delete(key)
  _cache.set(key, results)
}

export function invalidateStructures() {
  _cache.clear()
  _pending.clear()
}

export function buildStructureToggles() {
  const container = document.getElementById('structure-toggles')
  container.innerHTML = ''
  const types = getStructureTypesForDimension(state.dimension)
  for (const { type, label, icon } of types) {
    if (state.structureVisibility[type] === undefined)
      state.structureVisibility[type] = true
    const row = document.createElement('label')
    row.className = 'toggle-row'
    row.innerHTML = `
      <input type="checkbox" data-struct="${type}" ${state.structureVisibility[type]?'checked':''} />
      <span class="struct-icon">${icon}</span>
      <span class="toggle-label">${label}</span>
    `
    row.querySelector('input').addEventListener('change', e => {
      state.structureVisibility[type] = e.target.checked
      state.notify()
    })
    container.appendChild(row)
  }
}
