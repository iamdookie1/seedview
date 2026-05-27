import './style.css'
import { state } from './state.js'
import { decodeURL, pushURL, shareURL } from './core/url.js'
import { Renderer } from './map/renderer.js'
import { initToolbar } from './ui/toolbar.js'
import { initSidebar, addToHistory, renderHistory } from './ui/sidebar.js'
import { initTheme } from './ui/theme.js'
import { buildStructureToggles, onStructuresReady } from './ui/structures.js'

// ── Bootstrap ────────────────────────────────────────────────────────────────

// Restore state from URL if present
decodeURL()

// Theme
initTheme()

// Spawn Web Worker (runs cubiomes WASM)
const worker = new Worker(new URL('./core/worker.js', import.meta.url), { type: 'module' })

// Canvas renderer
const canvas   = document.getElementById('map-canvas')
const renderer = new Renderer(canvas, worker)

// ── Worker message routing ────────────────────────────────────────────────────

worker.addEventListener('message', ({ data }) => {
  if (data.type === 'ready') {
    state.wasmReady = true
    hideLoading()
    renderer.markDirty()
    return
  }
  if (data.type === 'structuresReady') {
    onStructuresReady(data.id, data.result)
    renderer.markDirty()
    return
  }
  // tileReady is handled inside TileManager
})

// ── UI wiring ─────────────────────────────────────────────────────────────────

function onSeedLoad() {
  renderer.invalidateTiles()
  addToHistory(state.seed, state.edition, state.version)
  renderHistory(entry => {
    state.seed    = entry.seed
    state.edition = entry.edition
    state.version = entry.version
    document.getElementById('seed-input').value    = entry.seed
    document.getElementById('edition-select').value = entry.edition
    onSeedLoad()
  })
  pushURL()
  renderer.markDirty()
}

function onDimensionChange() {
  buildStructureToggles()
  renderer.invalidateTiles()
  pushURL()
  renderer.markDirty()
}

function onOverlayChange() {
  pushURL()
  renderer.markDirty()
}

initToolbar(onSeedLoad, onDimensionChange, renderer)
initSidebar(onOverlayChange)
buildStructureToggles()

// Seed history click
renderHistory(entry => {
  state.seed    = entry.seed
  state.edition = entry.edition
  state.version = entry.version
  document.getElementById('seed-input').value     = entry.seed
  document.getElementById('edition-select').value = entry.edition
  onSeedLoad()
})

// Share button
document.getElementById('share-btn').addEventListener('click', shareURL)

// Keep URL in sync as user pans
state.onChange(() => pushURL())

// State changes → redraw
state.onChange(() => renderer.markDirty())

// Start render loop
renderer.start()

// ── Loading overlay ──────────────────────────────────────────────────────────

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden')
}

// Timeout fallback — if WASM never loads (no compiled binary yet), show a note
setTimeout(() => {
  if (!state.wasmReady) {
    document.getElementById('loading-text').textContent =
      'WASM not found — showing stub data. See README to compile cubiomes.'
    // Still start with stub data
    state.wasmReady = true
    hideLoading()
    renderer.markDirty()
  }
}, 3000)
