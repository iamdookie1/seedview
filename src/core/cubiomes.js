// Browser-side loader — imports core logic and adds the DOM-based WASM loader.
// The worker imports cubiomes-core.js directly and loads WASM via fetch+eval.

export {
  setModule, isReady, parseSeed,
  getBiomeAt, getStructuresInRegion, getStructureTypesForDimension,
  biomeColor, BIOME_COLORS, BIOME_NAMES,
} from './cubiomes-core.js'

import { setModule } from './cubiomes-core.js'

export async function loadCubiomes() {
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/wasm/cubiomes.js'
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
    const mod = await window.CubiomesModule({ locateFile: p => '/wasm/' + p })
    setModule(mod)
    console.log('[cubiomes] main thread WASM loaded OK')
  } catch (e) {
    console.warn('[cubiomes] main thread WASM not found:', e.message)
  }
}
