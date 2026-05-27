import { getBiomeAt, getStructuresInRegion, biomeColor, setModule } from './cubiomes.js'

let ready = false

async function init() {
  try {
    console.log('[worker] fetching /wasm/cubiomes.js...')
    const res = await fetch('/wasm/cubiomes.js')
    console.log('[worker] fetch status:', res.status, res.headers.get('content-type'))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    console.log('[worker] script length:', text.length, 'first 80 chars:', text.slice(0, 80))

    // Wrap in an IIFE that returns the function, works regardless of eval scope
    const factory = new Function(text + '\nreturn CubiomesModule;')
    const CubiomesModuleFn = factory()
    console.log('[worker] factory done, CubiomesModuleFn type:', typeof CubiomesModuleFn)

    const mod = await CubiomesModuleFn({
      locateFile(path) {
        console.log('[worker] locateFile called for:', path)
        return '/wasm/' + path
      },
      onAbort(reason) {
        console.error('[worker] WASM aborted:', reason)
      }
    })
    console.log('[worker] module instantiated, _getBiomeAt:', typeof mod._getBiomeAt)
    setModule(mod)
    console.log('[worker] WASM fully ready')
  } catch (e) {
    console.warn('[worker] WASM failed:', e.message, e.stack)
  }
  ready = true
  self.postMessage({ type: 'ready' })
}

init()

self.onmessage = function({ data }) {
  if (!ready) return
  const { type, id, payload } = data

  if (type === 'renderTile') {
    const { seed, edition, version, dimension, tileX, tileZ, canvasSize, highlightBiome } = payload
    const size = canvasSize
    const blockPerPx = 256 / size
    const buf = new Uint8ClampedArray(size * size * 4)

    // Debug first tile only
    if (tileX === 0 && tileZ === 0) {
      const testBiome = getBiomeAt(seed, edition, version, dimension, 0, 0)
      console.log('[worker] test getBiomeAt(0,0):', testBiome, 'stub?', !self._cubiomesModule)
    }

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const bx = Math.floor(tileX + px * blockPerPx)
        const bz = Math.floor(tileZ + py * blockPerPx)
        const biomeId = getBiomeAt(seed, edition, version, dimension, bx, bz)
        let [r, g, b] = biomeColor(biomeId)
        if (highlightBiome && String(biomeId) !== String(highlightBiome)) {
          r = Math.round(r * 0.25)
          g = Math.round(g * 0.25)
          b = Math.round(b * 0.25)
        }
        const i = (py * size + px) * 4
        buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = 255
      }
    }
    self.postMessage({ type: 'tileReady', id, result: { tileX, tileZ, buf } }, [buf.buffer])
    return
  }

  if (type === 'getStructures') {
    const { seed, edition, version, dimension, x0, z0, x1, z1 } = payload
    const result = getStructuresInRegion(seed, edition, version, dimension, x0, z0, x1, z1)
    self.postMessage({ type: 'structuresReady', id, result })
    return
  }

  if (type === 'getBiomeName') {
    const { seed, edition, version, dimension, blockX, blockZ } = payload
    const biomeId = getBiomeAt(seed, edition, version, dimension, blockX, blockZ)
    self.postMessage({ type: 'biomeNameReady', id, result: biomeId })
    return
  }
}
