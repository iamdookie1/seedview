// Draws chunk borders and slime chunk overlays directly onto the canvas.

import { state } from '../state.js'

const CHUNK = 16  // blocks per chunk

export function drawOverlays(ctx, W, H, camX, camZ, zoom) {
  if (state.showChunkBorders) drawChunkBorders(ctx, W, H, camX, camZ, zoom)
  if (state.showSlime)        drawSlimeChunks(ctx, W, H, camX, camZ, zoom)
}

function drawChunkBorders(ctx, W, H, camX, camZ, zoom) {
  const pxPerChunk = CHUNK * zoom
  if (pxPerChunk < 4) return  // too zoomed out to be useful

  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 0.5

  // First visible chunk X
  const startChunkX = Math.floor((camX - W / 2 / zoom) / CHUNK)
  const startChunkZ = Math.floor((camZ - H / 2 / zoom) / CHUNK)
  const endChunkX   = Math.ceil((camX + W / 2 / zoom) / CHUNK)
  const endChunkZ   = Math.ceil((camZ + H / 2 / zoom) / CHUNK)

  for (let cx = startChunkX; cx <= endChunkX; cx++) {
    const sx = (cx * CHUNK - camX) * zoom + W / 2
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, H)
    ctx.stroke()
  }
  for (let cz = startChunkZ; cz <= endChunkZ; cz++) {
    const sz = (cz * CHUNK - camZ) * zoom + H / 2
    ctx.beginPath()
    ctx.moveTo(0, sz)
    ctx.lineTo(W, sz)
    ctx.stroke()
  }
  ctx.restore()
}

function drawSlimeChunks(ctx, W, H, camX, camZ, zoom) {
  const pxPerChunk = CHUNK * zoom
  if (pxPerChunk < 3) return  // skip when too small to see

  const seed = parseInt(state.seed) || 0
  const startChunkX = Math.floor((camX - W / 2 / zoom) / CHUNK)
  const startChunkZ = Math.floor((camZ - H / 2 / zoom) / CHUNK)
  const endChunkX   = Math.ceil((camX + W / 2 / zoom) / CHUNK)
  const endChunkZ   = Math.ceil((camZ + H / 2 / zoom) / CHUNK)

  ctx.save()
  for (let cx = startChunkX; cx <= endChunkX; cx++) {
    for (let cz = startChunkZ; cz <= endChunkZ; cz++) {
      if (isSlimeChunk(seed, cx, cz)) {
        const sx = (cx * CHUNK - camX) * zoom + W / 2
        const sz = (cz * CHUNK - camZ) * zoom + H / 2
        ctx.fillStyle = 'rgba(100, 220, 80, 0.28)'
        ctx.fillRect(sx, sz, pxPerChunk, pxPerChunk)
      }
    }
  }
  ctx.restore()
}

// Java Edition slime chunk algorithm
function isSlimeChunk(seed, chunkX, chunkZ) {
  // Mirrors the Java Random-based check used in vanilla Minecraft
  const s = BigInt(seed)
  const cx = BigInt(chunkX)
  const cz = BigInt(chunkZ)
  const rngSeed =
    s +
    BigInt(Math.imul(Number(cx), Number(cx)) * 0x4c1906) +
    cx * 0x5ac0dbL_helper(cx) +
    BigInt(Math.imul(Number(cz), Number(cz))) * 0x4307a7n +
    cz * 0x5f24fn ^
    0x3ad8025fn

  // LCG next
  const A = 0x5deece66dn
  const C = 0xbn
  const M = (1n << 48n)
  let r = (rngSeed ^ A) & (M - 1n)
  r = (r * A + C) & (M - 1n)
  const bits = Number((r >> 17n) & 0x7fffn)
  return (bits % 10) === 0
}
// helper to avoid the BigInt literal issue across JS engines
function _L(n) { return n }
