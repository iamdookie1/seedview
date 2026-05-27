// Web Worker — runs all cubiomes queries off the main thread.
// Receives messages: { type, id, payload }
// Sends back:        { type, id, result }

import { loadCubiomes, getBiomeAt, getStructuresInRegion, biomeColor } from './cubiomes.js'

let ready = false

async function init() {
  await loadCubiomes()
  ready = true
  self.postMessage({ type: 'ready' })
}

init()

self.onmessage = function({ data }) {
  if (!ready) return

  const { type, id, payload } = data

  if (type === 'renderTile') {
    // Render a 256×256 pixel tile covering tileSize × tileSize blocks
    const { seed, edition, version, dimension, tileX, tileZ, tileBlockSize, canvasSize, highlightBiome } = payload
    const size = canvasSize // pixel size of the tile image
    const blockPerPx = tileBlockSize / size

    const buf = new Uint8ClampedArray(size * size * 4)

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const bx = Math.floor(tileX + px * blockPerPx)
        const bz = Math.floor(tileZ + py * blockPerPx)
        const biomeId = getBiomeAt(seed, edition, version, dimension, bx, bz)
        let [r, g, b] = biomeColor(biomeId)

        // Dim non-highlighted biomes
        if (highlightBiome && String(biomeId) !== String(highlightBiome)) {
          r = Math.round(r * 0.25)
          g = Math.round(g * 0.25)
          b = Math.round(b * 0.25)
        }

        const i = (py * size + px) * 4
        buf[i]     = r
        buf[i + 1] = g
        buf[i + 2] = b
        buf[i + 3] = 255
      }
    }

    self.postMessage({ type: 'tileReady', id, result: { tileX, tileZ, tileBlockSize, buf } }, [buf.buffer])
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
