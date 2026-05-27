// Multi-worker tile manager with LOD (level of detail).
// Uses 4 workers in parallel. Zoomed-out views use larger tiles (fewer WASM calls).

import { state } from '../state.js'

const WORKER_COUNT = 4
const BUF_SIZE     = 128   // pixels per tile (128x128 is fast, looks fine)
const CACHE_LIMIT  = 400
let   _msgId       = 0

export class TileManager {
  constructor(workerUrl) {
    // Spawn worker pool
    this.workers  = Array.from({ length: WORKER_COUNT }, () =>
      new Worker(workerUrl, { type:'module' })
    )
    this.readyCount = 0
    this.onAllReady = null

    this.cache     = new Map()
    this.pending   = new Set()
    this.callbacks = new Map()
    this._rr       = 0  // round-robin index

    for (const w of this.workers) {
      w.addEventListener('message', e => this._onMessage(e.data))
    }
  }

  // Returns the tile block size for current zoom (LOD)
  _tileBlocks() {
    const z = state.zoom
    if (z >= 0.5)  return 256
    if (z >= 0.15) return 512
    if (z >= 0.05) return 1024
    return 2048
  }

  _key(tx, tz, tileBlocks) {
    return `${state.seed}:${state.edition}:${state.version}:${state.dimension}:${tileBlocks}:${tx}:${tz}:${state.highlightBiome}`
  }

  get(tx, tz) {
    const tb = this._tileBlocks()
    return this.cache.get(this._key(tx, tz, tb)) ?? null
  }

  request(tx, tz, onReady) {
    const tb  = this._tileBlocks()
    const key = this._key(tx, tz, tb)
    if (this.cache.has(key) || this.pending.has(key)) return
    this.pending.add(key)

    const id = ++_msgId
    this.callbacks.set(id, { key, onReady })

    // Round-robin across workers
    const w = this.workers[this._rr % WORKER_COUNT]
    this._rr++

    w.postMessage({
      type: 'renderTile',
      id,
      payload: {
        seed: state.seed, edition: state.edition,
        version: state.version, dimension: state.dimension,
        tileX: tx * tb, tileZ: tz * tb,
        tileBlocks: tb, bufSize: BUF_SIZE,
        highlightBiome: state.highlightBiome,
      }
    })
  }

  async _onMessage(data) {
    if (data.type === 'ready') {
      this.readyCount++
      if (this.readyCount === WORKER_COUNT && this.onAllReady) this.onAllReady()
      return
    }

    if (data.type === 'tileReady') {
      const { id, result } = data
      const entry = this.callbacks.get(id)
      if (!entry) return
      this.callbacks.delete(id)

      const { tileX, tileZ, tileBlocks, buf } = result
      const tb  = tileBlocks
      const tx  = tileX / tb
      const tz  = tileZ / tb
      const key = this._key(tx, tz, tb)

      const imageData = new ImageData(buf, BUF_SIZE, BUF_SIZE)
      const bitmap    = await createImageBitmap(imageData)

      this.cache.set(key, bitmap)
      this.pending.delete(key)

      if (this.cache.size > CACHE_LIMIT) {
        this.cache.delete(this.cache.keys().next().value)
      }

      if (entry.onReady) entry.onReady()
      return
    }

    // Forward all other messages (structures, biome names) to callbacks too
    if (data.id && this.callbacks.has(data.id)) {
      const entry = this.callbacks.get(data.id)
      this.callbacks.delete(data.id)
      if (entry.onReady) entry.onReady(data)
    }
  }

  postToWorker(msg) {
    const w = this.workers[this._rr % WORKER_COUNT]
    this._rr++
    w.postMessage(msg)
  }

  clear() {
    this.cache.clear()
    this.pending.clear()
  }

  get tileBlocks() { return this._tileBlocks() }
}
