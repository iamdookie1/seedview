// Loads cubiomes.wasm and exposes a clean JS API.
// The actual WASM is compiled by you — see README for instructions.
// Until you have the real WASM, a stub fallback is used so the UI still works.

let _module = null
let _stub = false

// Version string → cubiomes MC_VERSION int
const VERSION_MAP = {
  'java': {
    '1.21': 21, '1.20': 20, '1.19': 19, '1.18': 18,
    '1.17': 17, '1.16': 16, '1.15': 15, '1.14': 14,
  },
  'bedrock': {
    '1.21': 21, '1.20': 20, '1.19': 19, '1.18': 18,
  }
}

export async function loadCubiomes() {
  try {
    // Try loading real WASM
    const CubiomesModule = (await import('/wasm/cubiomes.js')).default
    _module = await CubiomesModule()
    console.log('[cubiomes] WASM loaded successfully')
  } catch (e) {
    console.warn('[cubiomes] WASM not found, using stub biome data:', e.message)
    _stub = true
  }
}

// Seed string → int64-safe number (Java edition hashes strings)
export function parseSeed(seedStr, edition) {
  const n = Number(seedStr)
  if (!isNaN(n) && String(n) === seedStr.trim()) return n
  // String seed: simple hash (matches Java's String.hashCode)
  let hash = 0
  for (let i = 0; i < seedStr.length; i++) {
    hash = Math.imul(31, hash) + seedStr.charCodeAt(i) | 0
  }
  return hash
}

// Get biome at a block position.
// Returns a biome ID integer.
export function getBiomeAt(seed, edition, version, dimension, blockX, blockZ) {
  if (_stub || !_module) return stubBiome(blockX, blockZ)

  const mcVer = VERSION_MAP[edition]?.[version] ?? 21
  const dimId = { overworld: 0, nether: -1, end: 1 }[dimension] ?? 0
  const numSeed = parseSeed(String(seed), edition)

  // cubiomes C API: setupGenerator, applySeed, getBiomeAt
  try {
    const g = _module._malloc(4096) // generator struct
    _module._setupGenerator(g, mcVer, 0)
    _module._applySeed(g, dimId, numSeed)
    const biome = _module._getBiomeAt(g, 1, blockX, 64, blockZ)
    _module._free(g)
    return biome
  } catch {
    return stubBiome(blockX, blockZ)
  }
}

// Get structure positions in a region.
// Returns array of {x, z, type}
export function getStructuresInRegion(seed, edition, version, dimension, x0, z0, x1, z1) {
  if (_stub || !_module) return stubStructures(seed, dimension, x0, z0, x1, z1)

  const mcVer = VERSION_MAP[edition]?.[version] ?? 21
  const dimId = { overworld: 0, nether: -1, end: 1 }[dimension] ?? 0
  const numSeed = parseSeed(String(seed), edition)
  const results = []

  // Structure type IDs in cubiomes
  const structureTypes = getStructureTypesForDimension(dimension)

  try {
    const g = _module._malloc(4096)
    _module._setupGenerator(g, mcVer, 0)
    _module._applySeed(g, dimId, numSeed)

    const outBuf = _module._malloc(4 * 2 * 512) // up to 512 results

    for (const { type, id } of structureTypes) {
      const count = _module._findStructures(g, id, x0 >> 4, z0 >> 4, x1 >> 4, z1 >> 4, outBuf, 512)
      for (let i = 0; i < count; i++) {
        const ox = _module.HEAP32[(outBuf >> 2) + i * 2]
        const oz = _module.HEAP32[(outBuf >> 2) + i * 2 + 1]
        results.push({ x: ox * 16, z: oz * 16, type })
      }
    }

    _module._free(outBuf)
    _module._free(g)
  } catch (e) {
    console.warn('[cubiomes] structure error:', e)
  }

  return results
}

// Structure type definitions per dimension
export function getStructureTypesForDimension(dimension) {
  const map = {
    overworld: [
      { type: 'village',        id: 1,  label: 'Village',          icon: '🏘' },
      { type: 'stronghold',     id: 2,  label: 'Stronghold',        icon: '🔮' },
      { type: 'desert_temple',  id: 3,  label: 'Desert Temple',     icon: '🏛' },
      { type: 'jungle_temple',  id: 4,  label: 'Jungle Temple',     icon: '🌿' },
      { type: 'witch_hut',      id: 5,  label: 'Witch Hut',         icon: '🧙' },
      { type: 'monument',       id: 6,  label: 'Ocean Monument',    icon: '🏯' },
      { type: 'mansion',        id: 7,  label: 'Woodland Mansion',  icon: '🏚' },
      { type: 'outpost',        id: 8,  label: 'Pillager Outpost',  icon: '🗼' },
      { type: 'shipwreck',      id: 9,  label: 'Shipwreck',         icon: '⚓' },
      { type: 'ruined_portal',  id: 10, label: 'Ruined Portal',     icon: '🌀' },
      { type: 'mineshaft',      id: 11, label: 'Mineshaft',         icon: '⛏' },
      { type: 'buried_treasure',id: 12, label: 'Buried Treasure',   icon: '💎' },
      { type: 'trial_chamber',  id: 13, label: 'Trial Chamber',     icon: '⚔' },
      { type: 'ancient_city',   id: 14, label: 'Ancient City',      icon: '🏙' },
    ],
    nether: [
      { type: 'nether_fortress',id: 15, label: 'Nether Fortress',   icon: '🔥' },
      { type: 'bastion',        id: 16, label: 'Bastion Remnant',   icon: '👹' },
      { type: 'ruined_portal',  id: 10, label: 'Ruined Portal',     icon: '🌀' },
    ],
    end: [
      { type: 'end_city',       id: 17, label: 'End City',          icon: '🏰' },
      { type: 'end_gateway',    id: 18, label: 'End Gateway',       icon: '🌌' },
    ],
  }
  return map[dimension] ?? []
}

// ── Biome color lookup ──────────────────────────────────────────────────────

export const BIOME_COLORS = {
  0:  [141,179, 96],  // plains
  1:  [250,148, 24],  // desert
  2:  [ 96,160, 82],  // forest
  3:  [  5,102, 33],  // taiga
  4:  [ 37,123, 70],  // swamp
  5:  [ 11,102,89],   // river
  6:  [178,173,132],  // nether wastes
  7:  [100,100,100],  // the end
  8:  [ 64, 64,144],  // frozen ocean
  9:  [ 96,160,170],  // frozen river
  10: [255,255,255],  // snowy plains
  11: [160,160,255],  // snowy tundra
  12: [ 49, 85, 74],  // mushroom fields
  13: [ 96, 96, 96],  // beach
  14: [136,179, 96],  // jungle
  15: [255,128, 64],  // badlands
  // extend as needed
}

export function biomeColor(id) {
  return BIOME_COLORS[id] ?? [80, 80, 80]
}

export const BIOME_NAMES = {
  0: 'Plains', 1: 'Desert', 2: 'Forest', 3: 'Taiga', 4: 'Swamp',
  5: 'River', 6: 'Nether Wastes', 7: 'The End', 8: 'Frozen Ocean',
  9: 'Frozen River', 10: 'Snowy Plains', 11: 'Snowy Tundra',
  12: 'Mushroom Fields', 13: 'Beach', 14: 'Jungle', 15: 'Badlands',
}

// ── Stubs (used when WASM not yet compiled) ─────────────────────────────────

function stubBiome(x, z) {
  // Simple deterministic noise for demo purposes
  const v = Math.abs(Math.sin(x * 0.01) * Math.cos(z * 0.01) * 100) | 0
  return v % 16
}

function stubStructures(seed, dimension, x0, z0, x1, z1) {
  const types = getStructureTypesForDimension(dimension)
  const results = []
  const numSeed = typeof seed === 'string' ? parseInt(seed) || 12345 : seed
  const spacing = 512
  const cx0 = Math.floor(x0 / spacing)
  const cz0 = Math.floor(z0 / spacing)
  const cx1 = Math.ceil(x1 / spacing)
  const cz1 = Math.ceil(z1 / spacing)

  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const rng = Math.abs(Math.sin(cx * 7 + cz * 13 + numSeed) * 1e6) | 0
      if (rng % 4 === 0 && types.length > 0) {
        const type = types[rng % types.length].type
        results.push({
          x: cx * spacing + (rng % 200) - 100,
          z: cz * spacing + ((rng >> 4) % 200) - 100,
          type,
        })
      }
    }
  }
  return results
}
