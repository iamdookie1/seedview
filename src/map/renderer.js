import { state } from '../state.js'
import { TileManager } from './tiles.js'
import { drawOverlays } from './overlays.js'
import { drawStructures } from '../ui/structures.js'

export class Renderer {
  constructor(canvas, workerUrl) {
    this.canvas   = canvas
    this.ctx      = canvas.getContext('2d')
    this.tiles    = new TileManager(workerUrl)
    this._raf     = null
    this._dirty   = true
    this._workerUrl = workerUrl

    this._setupResize()
    this._setupPointer()
  }

  // Get any worker for one-off messages (structures, biome names)
  get worker() { return this.tiles.workers[0] }

  markDirty() { this._dirty = true }

  start() {
    const loop = () => {
      if (this._dirty) { this._draw(); this._dirty = false }
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  stop() { cancelAnimationFrame(this._raf) }

  _draw() {
    const { canvas, ctx } = this
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    if (!state.wasmReady) return

    const zoom = state.zoom, camX = state.camX, camZ = state.camZ
    const halfW = W/2/zoom, halfH = H/2/zoom
    const wx0 = camX-halfW, wz0 = camZ-halfH
    const wx1 = camX+halfW, wz1 = camZ+halfH

    const tb = this.tiles.tileBlocks
    const tileScreenPx = tb * zoom
    const tileX0 = Math.floor(wx0/tb), tileZ0 = Math.floor(wz0/tb)
    const tileX1 = Math.ceil(wx1/tb),  tileZ1 = Math.ceil(wz1/tb)

    // Background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, W, H)

    if (state.showBiomes) {
      for (let tz = tileZ0; tz <= tileZ1; tz++) {
        for (let tx = tileX0; tx <= tileX1; tx++) {
          const tile = this.tiles.get(tx, tz)
          if (tile) {
            const sx = (tx*tb - camX)*zoom + W/2
            const sz = (tz*tb - camZ)*zoom + H/2
            ctx.imageSmoothingEnabled = zoom < 1
            ctx.drawImage(tile, sx, sz, tileScreenPx, tileScreenPx)
          } else {
            this.tiles.request(tx, tz, () => { this._dirty = true })
          }
        }
      }
    }

    drawOverlays(ctx, W, H, camX, camZ, zoom)

    if (state.showStructures) {
      drawStructures(ctx, W, H, camX, camZ, zoom, wx0, wz0, wx1, wz1, this)
    }

    this._drawSpawn(ctx, W, H, camX, camZ, zoom)
  }

  _drawSpawn(ctx, W, H, camX, camZ, zoom) {
    const sx = (0-camX)*zoom + W/2
    const sz = (0-camZ)*zoom + H/2
    const r  = Math.max(6, 8*zoom)
    ctx.save()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth   = 1.5
    ctx.beginPath()
    ctx.moveTo(sx-r,sz); ctx.lineTo(sx+r,sz)
    ctx.moveTo(sx,sz-r); ctx.lineTo(sx,sz+r)
    ctx.stroke()
    if (zoom > 0.1) {
      ctx.fillStyle = 'rgba(0,0,0,.5)'
      ctx.font = '11px Inter,sans-serif'
      ctx.fillText('Spawn', sx+6, sz-3)
      ctx.fillStyle = '#fff'
      ctx.fillText('Spawn', sx+5, sz-4)
    }
    ctx.restore()
  }

  _setupResize() {
    const ro = new ResizeObserver(() => this._onResize())
    ro.observe(this.canvas.parentElement)
    this._onResize()
  }

  _onResize() {
    const p = this.canvas.parentElement
    this.canvas.width  = p.clientWidth
    this.canvas.height = p.clientHeight
    this._dirty = true
  }

  _setupPointer() {
    const el = this.canvas
    let dragging = false, lastX = 0, lastY = 0

    el.addEventListener('mousedown', e => { dragging=true; lastX=e.clientX; lastY=e.clientY })
    window.addEventListener('mouseup', () => { dragging=false })
    window.addEventListener('mousemove', e => {
      if (!dragging) { this._updateCoords(e); return }
      state.camX -= (e.clientX-lastX)/state.zoom
      state.camZ -= (e.clientY-lastY)/state.zoom
      lastX=e.clientX; lastY=e.clientY
      this._dirty=true
    })

    el.addEventListener('wheel', e => {
      e.preventDefault()
      const f = e.deltaY < 0 ? 1.2 : 1/1.2
      const nz = Math.min(32, Math.max(0.02, state.zoom*f))
      const rect = el.getBoundingClientRect()
      const mx = e.clientX-rect.left, my = e.clientY-rect.top
      const wx = state.camX+(mx-el.width/2)/state.zoom
      const wz = state.camZ+(my-el.height/2)/state.zoom
      state.camX = wx-(mx-el.width/2)/nz
      state.camZ = wz-(my-el.height/2)/nz
      state.zoom = nz
      this._dirty=true
    }, { passive:false })

    let lastDist=null
    el.addEventListener('touchstart', e => {
      if(e.touches.length===1){ dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY }
    })
    el.addEventListener('touchend', () => { dragging=false; lastDist=null })
    el.addEventListener('touchmove', e => {
      e.preventDefault()
      if(e.touches.length===2){
        dragging=false
        const dx=e.touches[0].clientX-e.touches[1].clientX
        const dy=e.touches[0].clientY-e.touches[1].clientY
        const dist=Math.sqrt(dx*dx+dy*dy)
        if(lastDist) state.zoom=Math.min(32,Math.max(0.02,state.zoom*dist/lastDist))
        lastDist=dist; this._dirty=true
      } else if(dragging&&e.touches.length===1){
        state.camX-=(e.touches[0].clientX-lastX)/state.zoom
        state.camZ-=(e.touches[0].clientY-lastY)/state.zoom
        lastX=e.touches[0].clientX; lastY=e.touches[0].clientY
        this._dirty=true
      }
    }, { passive:false })
  }

  _updateCoords(e) {
    const rect = this.canvas.getBoundingClientRect()
    const wx = Math.round(state.camX+(e.clientX-rect.left-this.canvas.width/2)/state.zoom)
    const wz = Math.round(state.camZ+(e.clientY-rect.top-this.canvas.height/2)/state.zoom)
    document.getElementById('coords-display').textContent = `X: ${wx}  Z: ${wz}`
  }

  jumpTo(x, z) { state.camX=x; state.camZ=z; this._dirty=true }
  invalidateTiles() { this.tiles.clear(); this._dirty=true }
}
