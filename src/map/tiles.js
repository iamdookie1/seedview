// Manages tile requests to the worker and caches rendered tiles as ImageBitmap.

import { state } from '../state.js'

const TILE_PX     = 256
const CACHE_LIMIT = 512   // max tiles to keep in memory
let   _msgId      = 0

export class TileManager {
  constructor(worker) {
    this.worker    = worker
    this.cache     = new Map()   // key → ImageBitmap
    this.pending   = new Set()   // keys currently in-flight
    this.callbacks = new Map()   // msgId → callback

    worker.addEventListener('message', e => this._onMessage(e.data))
  }

  _key(tx, tz) {
    return `${state.seed}:${state.edition}:${state.version}:${state.dimension}:${tx}:${tz}:${state.highlightBiome}`
  }

  get(tx, tz) {
    return this.cache.get(this._key(tx, tz)) ?? null
  }

  request(tx, tz, onReady) {
    const key = this._key(tx, tz)
    if (this.cache.has(key) || this.pending.has(key)) return
    this.pending.add(key)

    const id = ++_msgId
    this.callbacks.set(id, onReady)

    this.worker.postMessage({
      type: 'renderTile',
      id,
      payload: {
        seed:          state.seed,
        edition:       state.edition,
        version:       state.version,
        dimension:     state.dimension,
        tileX:         tx * 256,
        tileZ:         tz * 256,
        tileBlockSize: 256,
        canvasSize:    TILE_PX,
        highlightBiome: state.highlightBiome,
      }
    })
  }

  async _onMessage(data) {
    if (data.type !== 'tileReady') return

    const { id, result } = data
    const { tileX, tileZ, tileBlockSize, buf } = result
    const tx = tileX / 256
    const tz = tileZ / 256
    const key = `${state.seed}:${state.edition}:${state.version}:${state.dimension}:${tx}:${tz}:${state.highlightBiome}`

    // Convert raw RGBA buffer → ImageBitmap
    const imageData = new ImageData(buf, TILE_PX, TILE_PX)
    const bitmap    = await createImageBitmap(imageData)

    this.cache.set(key, bitmap)
    this.pending.delete(key)

    // Evict oldest if over limit
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      this.cache.delete(oldest)
    }

    const cb = this.callbacks.get(id)
    if (cb) { cb(); this.callbacks.delete(id) }
  }

  clear() {
    this.cache.clear()
    this.pending.clear()
  }
}
