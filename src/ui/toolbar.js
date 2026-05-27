import { state } from '../state.js'
import { JAVA_VERSIONS, BEDROCK_VERSIONS } from '../core/cubiomes-core.js'

export function initToolbar(onSeedLoad, onDimensionChange, renderer) {
  const seedInput  = document.getElementById('seed-input')
  const seedGo     = document.getElementById('seed-go')
  const editionSel = document.getElementById('edition-select')
  const versionSel = document.getElementById('version-select')
  const dimSel     = document.getElementById('dimension-select')
  const coordX     = document.getElementById('coord-x')
  const coordZ     = document.getElementById('coord-z')
  const coordGo    = document.getElementById('coord-go')

  // Populate versions
  function populateVersions() {
    const versions = state.edition === 'java' ? JAVA_VERSIONS : BEDROCK_VERSIONS
    versionSel.innerHTML = versions.map(v =>
      `<option value="${v}" ${v === state.version ? 'selected' : ''}>${v}</option>`
    ).join('')
  }

  // Restore state to UI
  seedInput.value       = state.seed
  editionSel.value      = state.edition
  dimSel.value          = state.dimension
  populateVersions()
  versionSel.value      = state.version

  // Seed load
  function loadSeed() {
    const val = seedInput.value.trim()
    if (!val) return
    state.seed = val
    onSeedLoad()
  }

  seedGo.addEventListener('click', loadSeed)
  seedInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSeed() })

  // Edition change
  editionSel.addEventListener('change', () => {
    state.edition = editionSel.value
    populateVersions()
    state.version = versionSel.value
    onSeedLoad()
  })

  // Version change
  versionSel.addEventListener('change', () => {
    state.version = versionSel.value
    onSeedLoad()
  })

  // Dimension change
  dimSel.addEventListener('change', () => {
    state.dimension = dimSel.value
    onDimensionChange()
  })

  // Coord jump
  coordGo.addEventListener('click', () => {
    const x = parseInt(coordX.value) || 0
    const z = parseInt(coordZ.value) || 0
    renderer.jumpTo(x, z)
    state.camX = x
    state.camZ = z
  })
  coordX.addEventListener('keydown', e => { if (e.key === 'Enter') coordGo.click() })
  coordZ.addEventListener('keydown', e => { if (e.key === 'Enter') coordGo.click() })
}
