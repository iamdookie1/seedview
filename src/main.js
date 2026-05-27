import './style.css'
import { state } from './state.js'
import { decodeURL, pushURL, shareURL } from './core/url.js'
import { Renderer } from './map/renderer.js'
import { initToolbar } from './ui/toolbar.js'
import { initSidebar, addToHistory, renderHistory } from './ui/sidebar.js'
import { initTheme } from './ui/theme.js'
import { buildStructureToggles, onStructuresReady, invalidateStructures } from './ui/structures.js'

decodeURL()
initTheme()

const workerUrl = new URL('./core/worker.js', import.meta.url)
const renderer  = new Renderer(document.getElementById('map-canvas'), workerUrl)

// Wait for all workers ready
let readyCount = 0
for (const w of renderer.tiles.workers) {
  w.addEventListener('message', ({ data }) => {
    if (data.type === 'ready') {
      readyCount++
      if (readyCount === renderer.tiles.workers.length) {
        state.wasmReady = true
        document.getElementById('loading-overlay').classList.add('hidden')
        renderer.markDirty()
      }
    }
    if (data.type === 'structuresReady') {
      onStructuresReady(data.id, data.result)
      renderer.markDirty()
    }
  })
}

function onSeedLoad() {
  renderer.invalidateTiles()
  invalidateStructures()
  addToHistory(state.seed, state.edition, state.version)
  renderHistory(entry => {
    state.seed    = entry.seed
    state.edition = entry.edition
    state.version = entry.version
    document.getElementById('seed-input').value     = entry.seed
    document.getElementById('edition-select').value = entry.edition
    onSeedLoad()
  })
  pushURL()
  renderer.markDirty()
}

function onDimensionChange() {
  buildStructureToggles()
  invalidateStructures()
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

renderHistory(entry => {
  state.seed    = entry.seed
  state.edition = entry.edition
  state.version = entry.version
  document.getElementById('seed-input').value     = entry.seed
  document.getElementById('edition-select').value = entry.edition
  onSeedLoad()
})

document.getElementById('share-btn').addEventListener('click', shareURL)
state.onChange(() => { pushURL(); renderer.markDirty() })
renderer.start()

// Fallback if WASM never loads
setTimeout(() => {
  if (!state.wasmReady) {
    document.getElementById('loading-text').textContent = 'Using stub data — see README to compile cubiomes WASM'
    state.wasmReady = true
    document.getElementById('loading-overlay').classList.add('hidden')
    renderer.markDirty()
  }
}, 5000)
