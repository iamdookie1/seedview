// Tile-based Canvas 2D renderer.
// WebGL can be added later as an upgrade — for now Canvas 2D with
// ImageData is already very fast because the heavy work is in the Worker.

import { state } from '../state.js'
import { TileManager } from './tiles.js'
import { drawOverlays } from './overlays.js'
import { drawStructures } from '../ui/structures.js'
import { BIOME_NAMES } from '../core/cubiomes.js'

const TILE_PX = 256        // pixel size of each tile texture
const TILE_BLOCKS = 256    // how many blocks a tile covers at zoom=1

export class Renderer {
  constructor(canvas, worker) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')
    this.worker = worker
    this.tiles  = new TileManager(worker)
    this._raf   = null
    this._dirty = true

    this._setupResize()
    this._setupPointer()
  }

  markDirty() { this._dirty = true }

  start() {
    const loop = () => {
      if (this._dirty) {
        this._draw()
        this._dirty = false
      }
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  stop() {
    cancelAnimationFrame(this._raf)
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  _draw() {
    const { canvas, ctx } = this
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    if (!state.wasmReady) return

    // Determine visible world block range
    const zoom     = state.zoom         // pixels per block
    const camX     = state.camX         // world block at canvas center
    const camZ     = state.camZ
    const halfW    = W / 2 / zoom
    const halfH    = H / 2 / zoom
    const worldX0  = camX - halfW
    const worldZ0  = camZ - halfH
    const worldX1  = camX + halfW
    const worldZ1  = camZ + halfH

    // Tile block size at this zoom (each tile covers this many blocks)
    // We want tiles to be TILE_PX pixels on screen.
    const tileBlocks = TILE_BLOCKS / zoom  // not quite right — let's keep tiles at TILE_BLOCKS blocks always
    // Actually tiles are always TILE_BLOCKS blocks wide, we scale the pixels
    const tileScreenPx = TILE_BLOCKS * zoom

    const tileX0 = Math.floor(worldX0 / TILE_BLOCKS)
    const tileZ0 = Math.floor(worldZ0 / TILE_BLOCKS)
    const tileX1 = Math.ceil(worldX1  / TILE_BLOCKS)
    const tileZ1 = Math.ceil(worldZ1  / TILE_BLOCKS)

    if (state.showBiomes) {
      for (let tz = tileZ0; tz <= tileZ1; tz++) {
        for (let tx = tileX0; tx <= tileX1; tx++) {
          const tile = this.tiles.get(tx, tz)
          if (tile) {
            // World position of tile origin
            const wx = tx * TILE_BLOCKS
            const wz = tz * TILE_BLOCKS
            // Screen position
            const sx = (wx - camX) * zoom + W / 2
            const sz = (wz - camZ) * zoom + H / 2
            ctx.drawImage(tile, sx, sz, tileScreenPx, tileScreenPx)
          } else {
            // Request tile from worker
            this.tiles.request(tx, tz, () => { this._dirty = true })
          }
        }
      }
    } else {
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, W, H)
    }

    // Overlays (chunk borders, slime)
    drawOverlays(ctx, W, H, camX, camZ, zoom)

    // Structures
    if (state.showStructures) {
      drawStructures(ctx, W, H, camX, camZ, zoom, worldX0, worldZ0, worldX1, worldZ1, this.worker)
    }

    // Spawn cross
    this._drawSpawn(ctx, W, H, camX, camZ, zoom)
  }

  _drawSpawn(ctx, W, H, camX, camZ, zoom) {
    const sx = (0 - camX) * zoom + W / 2
    const sz = (0 - camZ) * zoom + H / 2
    const r  = Math.max(6, 10 * zoom)
    ctx.save()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx - r, sz); ctx.lineTo(sx + r, sz)
    ctx.moveTo(sx, sz - r); ctx.lineTo(sx, sz + r)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = '11px Inter, sans-serif'
    ctx.fillText('Spawn', sx + 6, sz - 4)
    ctx.restore()
  }

  // ── Resize ───────────────────────────────────────────────────────────────

  _setupResize() {
    const ro = new ResizeObserver(() => this._onResize())
    ro.observe(this.canvas.parentElement)
    this._onResize()
  }

  _onResize() {
    const parent = this.canvas.parentElement
    this.canvas.width  = parent.clientWidth
    this.canvas.height = parent.clientHeight
    this._dirty = true
  }

  // ── Pan & Zoom ───────────────────────────────────────────────────────────

  _setupPointer() {
    const el = this.canvas
    let dragging = false
    let lastX = 0, lastZ = 0

    el.addEventListener('mousedown', e => {
      dragging = true
      lastX = e.clientX
      lastZ = e.clientY
    })

    window.addEventListener('mouseup', () => { dragging = false })

    window.addEventListener('mousemove', e => {
      if (!dragging) {
        this._updateCoordsDisplay(e)
        return
      }
      const dx = e.clientX - lastX
      const dy = e.clientY - lastZ
      lastX = e.clientX
      lastZ = e.clientY
      state.camX -= dx / state.zoom
      state.camZ -= dy / state.zoom
      this._dirty = true
    })

    el.addEventListener('wheel', e => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : (1 / 1.15)
      const newZoom = Math.min(32, Math.max(0.03, state.zoom * factor))
      // Zoom toward mouse cursor
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const worldX = state.camX + (mx - el.width  / 2) / state.zoom
      const worldZ = state.camZ + (my - el.height / 2) / state.zoom
      state.camX = worldX - (mx - el.width  / 2) / newZoom
      state.camZ = worldZ - (my - el.height / 2) / newZoom
      state.zoom = newZoom
      this._dirty = true
    }, { passive: false })

    // Touch support
    let lastTouchDist = null
    el.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        dragging = true
        lastX = e.touches[0].clientX
        lastZ = e.touches[0].clientY
      }
    })
    el.addEventListener('touchend', () => { dragging = false; lastTouchDist = null })
    el.addEventListener('touchmove', e => {
      e.preventDefault()
      if (e.touches.length === 2) {
        dragging = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx*dx + dy*dy)
        if (lastTouchDist !== null) {
          const factor = dist / lastTouchDist
          state.zoom = Math.min(32, Math.max(0.03, state.zoom * factor))
          this._dirty = true
        }
        lastTouchDist = dist
      } else if (dragging && e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastX
        const dy = e.touches[0].clientY - lastZ
        lastX = e.touches[0].clientX
        lastZ = e.touches[0].clientY
        state.camX -= dx / state.zoom
        state.camZ -= dy / state.zoom
        this._dirty = true
      }
    }, { passive: false })
  }

  _updateCoordsDisplay(e) {
    const rect = this.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const wx = Math.round(state.camX + (mx - this.canvas.width  / 2) / state.zoom)
    const wz = Math.round(state.camZ + (my - this.canvas.height / 2) / state.zoom)
    document.getElementById('coords-display').textContent = `X: ${wx}  Z: ${wz}`
  }

  jumpTo(x, z) {
    state.camX = x
    state.camZ = z
    this._dirty = true
  }

  invalidateTiles() {
    this.tiles.clear()
    this._dirty = true
  }
}
