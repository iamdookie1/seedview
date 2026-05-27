// Draws chunk borders and slime chunk overlays directly onto the canvas.

import { state } from '../state.js'

const CHUNK = 16

export function drawOverlays(ctx, W, H, camX, camZ, zoom) {
  if (state.showChunkBorders) drawChunkBorders(ctx, W, H, camX, camZ, zoom)
  if (state.showSlime)        drawSlimeChunks(ctx, W, H, camX, camZ, zoom)
}

function drawChunkBorders(ctx, W, H, camX, camZ, zoom) {
  const pxPerChunk = CHUNK * zoom
  if (pxPerChunk < 4) return

  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 0.5

  const startCX = Math.floor((camX - W / 2 / zoom) / CHUNK)
  const startCZ = Math.floor((camZ - H / 2 / zoom) / CHUNK)
  const endCX   = Math.ceil((camX + W / 2 / zoom) / CHUNK)
  const endCZ   = Math.ceil((camZ + H / 2 / zoom) / CHUNK)

  for (let cx = startCX; cx <= endCX; cx++) {
    const sx = (cx * CHUNK - camX) * zoom + W / 2
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke()
  }
  for (let cz = startCZ; cz <= endCZ; cz++) {
    const sz = (cz * CHUNK - camZ) * zoom + H / 2
    ctx.beginPath(); ctx.moveTo(0, sz); ctx.lineTo(W, sz); ctx.stroke()
  }
  ctx.restore()
}

function drawSlimeChunks(ctx, W, H, camX, camZ, zoom) {
  const pxPerChunk = CHUNK * zoom
  if (pxPerChunk < 3) return

  const seed = parseInt(state.seed) || 0
  const startCX = Math.floor((camX - W / 2 / zoom) / CHUNK)
  const startCZ = Math.floor((camZ - H / 2 / zoom) / CHUNK)
  const endCX   = Math.ceil((camX + W / 2 / zoom) / CHUNK)
  const endCZ   = Math.ceil((camZ + H / 2 / zoom) / CHUNK)

  ctx.save()
  for (let cx = startCX; cx <= endCX; cx++) {
    for (let cz = startCZ; cz <= endCZ; cz++) {
      if (isSlimeChunk(seed, cx, cz)) {
        const sx = (cx * CHUNK - camX) * zoom + W / 2
        const sz = (cz * CHUNK - camZ) * zoom + H / 2
        ctx.fillStyle = 'rgba(100,220,80,0.28)'
        ctx.fillRect(sx, sz, pxPerChunk, pxPerChunk)
      }
    }
  }
  ctx.restore()
}

// Java Edition slime chunk check using BigInt LCG
function isSlimeChunk(seed, chunkX, chunkZ) {
  try {
    const s  = BigInt(seed)
    const cx = BigInt(chunkX)
    const cz = BigInt(chunkZ)

    const M = BigInt(0x1000000000000)  // 2^48
    const A = BigInt(0x5deece66d)
    const C = BigInt(11)

    // Vanilla seed mixing
    const mixed =
      s +
      cx * cx * BigInt(0x4c1906) +
      cx * BigInt(0x5ac0db) +
      cz * cz * BigInt(0x4307a7) +
      cz * BigInt(0x5f24f) ^
      BigInt(0x3ad8025f)

    let r = (mixed ^ A) & (M - 1n)
    r = (r * A + C) & (M - 1n)
    const bits = Number((r >> 17n) & 0x7fffn)
    return (bits % 10) === 0
  } catch {
    return false
  }
}
