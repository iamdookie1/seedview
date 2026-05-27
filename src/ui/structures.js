// Draws structure icons on the canvas and builds the sidebar toggle list.

import { state } from '../state.js'
import { getStructureTypesForDimension, getStructuresInRegion } from '../core/cubiomes.js'

// Cache of fetched structures: key → [{x, z, type}]
const _structCache = new Map()
let _pendingKey = null

export function drawStructures(ctx, W, H, camX, camZ, zoom, wx0, wz0, wx1, wz1, worker) {
  const key = `${state.seed}:${state.edition}:${state.version}:${state.dimension}:${Math.floor(wx0/512)}:${Math.floor(wz0/512)}`

  if (!_structCache.has(key) && _pendingKey !== key) {
    _pendingKey = key
    // Request from worker
    worker.postMessage({
      type: 'getStructures',
      id: key,
      payload: {
        seed: state.seed, edition: state.edition, version: state.version,
        dimension: state.dimension,
        x0: Math.floor(wx0) - 512, z0: Math.floor(wz0) - 512,
        x1: Math.ceil(wx1)  + 512, z1: Math.ceil(wz1)  + 512,
      }
    })
  }

  const structs = _structCache.get(key) ?? []
  const types   = getStructureTypesForDimension(state.dimension)
  const typeMap  = Object.fromEntries(types.map(t => [t.type, t]))

  ctx.save()
  ctx.font = `${Math.max(14, Math.min(24, zoom * 8))}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const s of structs) {
    if (state.structureVisibility[s.type] === false) continue
    const sx = (s.x - camX) * zoom + W / 2
    const sz = (s.z - camZ) * zoom + H / 2
    if (sx < -32 || sx > W + 32 || sz < -32 || sz > H + 32) continue

    const icon = typeMap[s.type]?.icon ?? '?'
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,.6)'
    ctx.fillText(icon, sx + 1, sz + 1)
    // Icon
    ctx.fillStyle = '#fff'
    ctx.fillText(icon, sx, sz)
  }
  ctx.restore()
}

// Called by the worker message handler in main.js
export function onStructuresReady(id, results) {
  _structCache.set(id, results)
  if (_pendingKey === id) _pendingKey = null
}

// Build structure toggle checkboxes in the sidebar
export function buildStructureToggles() {
  const container = document.getElementById('structure-toggles')
  container.innerHTML = ''

  const types = getStructureTypesForDimension(state.dimension)

  for (const { type, label, icon } of types) {
    // Default to visible
    if (state.structureVisibility[type] === undefined) {
      state.structureVisibility[type] = true
    }

    const row = document.createElement('label')
    row.className = 'toggle-row'
    row.innerHTML = `
      <input type="checkbox" data-struct="${type}" ${state.structureVisibility[type] ? 'checked' : ''} />
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
