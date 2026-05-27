import { state } from '../state.js'
import { BIOME_NAMES } from '../core/cubiomes.js'

const HISTORY_KEY = 'seedview_history'
const MAX_HISTORY = 20

export function initSidebar(onOverlayChange) {

  // ── Overlay toggles ────────────────────────────────────────────────────
  const tog = (id, key) => {
    const el = document.getElementById(id)
    el.checked = state[key]
    el.addEventListener('change', () => {
      state[key] = el.checked
      onOverlayChange()
    })
  }

  tog('tog-biomes',     'showBiomes')
  tog('tog-slime',      'showSlime')
  tog('tog-chunks',     'showChunkBorders')
  tog('tog-structures', 'showStructures')

  // ── Biome highlight ────────────────────────────────────────────────────
  const biomeSelect = document.getElementById('biome-highlight-select')

  function populateBiomes() {
    biomeSelect.innerHTML = '<option value="">None (show all)</option>'
    for (const [id, name] of Object.entries(BIOME_NAMES)) {
      const opt = document.createElement('option')
      opt.value = id
      opt.textContent = name
      if (String(id) === String(state.highlightBiome)) opt.selected = true
      biomeSelect.appendChild(opt)
    }
  }

  populateBiomes()

  biomeSelect.addEventListener('change', () => {
    state.highlightBiome = biomeSelect.value
    onOverlayChange()
  })

  state.onChange(() => {
    biomeSelect.value = state.highlightBiome || ''
  })
}

// ── Seed history ─────────────────────────────────────────────────────────────

export function addToHistory(seed, edition, version) {
  const history = loadHistory()
  const entry = { seed, edition, version, ts: Date.now() }
  const filtered = history.filter(h => h.seed !== seed || h.edition !== edition)
  filtered.unshift(entry)
  if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY
  saveHistory(filtered)
  renderHistory()
}

export function renderHistory(onSelect) {
  const list = document.getElementById('seed-history-list')
  const history = loadHistory()
  list.innerHTML = ''

  if (history.length === 0) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:12px">No recent seeds</li>'
    return
  }

  for (const entry of history) {
    const li = document.createElement('li')
    li.title = `${entry.edition} ${entry.version}`
    li.textContent = entry.seed
    li.addEventListener('click', () => {
      if (onSelect) onSelect(entry)
    })
    list.appendChild(li)
  }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? [] }
  catch { return [] }
}

function saveHistory(arr) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr))
}
