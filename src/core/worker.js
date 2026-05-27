// Web Worker — runs all cubiomes queries off the main thread.

import { getBiomeAt, getStructuresInRegion, biomeColor, setModule } from './cubiomes.js'

let ready = false

async function init() {
  try {
    // Fetch the Emscripten JS glue, inject it via a classic blob worker
    // then get the module back. This is the only reliable way in a module worker.
    const res = await fetch('/wasm/cubiomes.js')
    if (!res.ok) throw new Error('fetch failed')
    const text = await res.text()

    // Create a temporary classic worker from a blob to run the Emscripten init
    // Then communicate the WASM exports back via a SharedArrayBuffer isn't needed —
    // instead we just eval in this context using an indirect eval
    const indirectEval = eval  // indirect eval runs in global scope
    indirectEval(text)

    // After eval, CubiomesModule should be on self (globalThis)
    if (typeof self.CubiomesModule === 'function') {
      const mod = await self.CubiomesModule()
      setModule(mod)
      console.log('[worker] WASM ready')
    } else {
      throw new Error('CubiomesModule not found after eval')
    }
  } catch (e) {
    console.warn('[worker] WASM not available, using stubs:', e.message)
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
