import { renderTileToBuffer, getStructuresInRegion, getBiomeAt, setModule, BIOME_NAMES } from './cubiomes-core.js'

let ready = false

async function init() {
  try {
    const res = await fetch('/wasm/cubiomes.js')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const factory = new Function(text + '\nreturn CubiomesModule;')
    const mod = await factory()({ locateFile: p => '/wasm/' + p })
    setModule(mod)
    console.log('[worker] WASM ready, _getBiomeAt:', typeof mod._getBiomeAt)
  } catch(e) {
    console.warn('[worker] WASM failed, using stubs:', e.message)
  }
  ready = true
  self.postMessage({ type:'ready' })
}

init()

self.onmessage = function({ data }) {
  if (!ready) return
  const { type, id, payload } = data

  if (type === 'renderTile') {
    const { seed, edition, version, dimension, tileX, tileZ, tileBlocks, bufSize, highlightBiome } = payload
    const buf = renderTileToBuffer(seed, edition, version, dimension, tileX, tileZ, tileBlocks, bufSize, highlightBiome)
    self.postMessage({ type:'tileReady', id, result:{ tileX, tileZ, tileBlocks, buf } }, [buf.buffer])
    return
  }

  if (type === 'getStructures') {
    const { seed, edition, version, dimension, x0, z0, x1, z1 } = payload
    const result = getStructuresInRegion(seed, edition, version, dimension, x0, z0, x1, z1)
    self.postMessage({ type:'structuresReady', id, result })
    return
  }

  if (type === 'getBiomeName') {
    const { seed, edition, version, dimension, blockX, blockZ } = payload
    const biomeId = getBiomeAt(seed, edition, version, dimension, blockX, blockZ)
    const name = BIOME_NAMES[biomeId] ?? `Biome ${biomeId}`
    self.postMessage({ type:'biomeNameReady', id, result:{ biomeId, name } })
    return
  }
}
