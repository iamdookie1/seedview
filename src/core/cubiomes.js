// Loads cubiomes.wasm and exposes a clean JS API.
// Uses the actual cubiomes C API as of 2025:
//   setupGenerator, applySeed, getBiomeAt, getStructureConfig, getStructurePos

let _module = null
let _stub = false

// Called by worker.js after loading WASM via importScripts
export function setModule(mod) {
  _module = mod
  _stub = false
}

// Generator struct size — must be large enough for the full Generator union
// LayerStack alone can be >200KB, so we allocate generously
const GEN_SIZE = 1024 * 512  // 512 KB

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

// cubiomes structure type enum values (from finders.h)
const STRUCT_IDS = {
  desert_temple:   0,  // Desert_Pyramid
  jungle_temple:   1,  // Jungle_Temple
  witch_hut:       2,  // Swamp_Hut
  igloo:           3,
  village:         4,
  shipwreck:       5,
  monument:        6,
  mansion:         7,
  outpost:         8,
  ruined_portal:   9,
  ancient_city:    10,
  mineshaft:       11,
  nether_fortress: 13, // Fortress
  bastion:         14,
  trial_chamber:   15, // Trial_Chambers
  end_city:        16,
}

export async function loadCubiomes() {
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/wasm/cubiomes.js'
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
    _module = await window.CubiomesModule()
    console.log('[cubiomes] WASM loaded OK')
  } catch (e) {
    console.warn('[cubiomes] WASM not found, using stub:', e.message)
    _stub = true
  }
}

// Seed string → number (Java string hash if not a plain number)
export function parseSeed(seedStr) {
  const trimmed = String(seedStr).trim()
  const n = Number(trimmed)
  if (!isNaN(n) && String(n) === trimmed) return n
  let hash = 0
  for (let i = 0; i < trimmed.length; i++) {
    hash = Math.imul(31, hash) + trimmed.charCodeAt(i) | 0
  }
  return hash >>> 0
}

// Get biome ID at a block position
// Reuse a single generator per seed/dimension/version to avoid constant alloc/free
let _genPtr = 0
let _genKey = ''

function getGenerator(mcVer, dimId, numSeed) {
  const key = `${mcVer}:${dimId}:${numSeed}`
  if (_genPtr && _genKey === key) return _genPtr
  if (_genPtr) _module._free(_genPtr)
  _genPtr = _module._malloc(GEN_SIZE)
  _module._setupGenerator(_genPtr, mcVer, 0)
  _module._applySeed(_genPtr, dimId, numSeed)
  _genKey = key
  return _genPtr
}

export function getBiomeAt(seed, edition, version, dimension, blockX, blockZ) {
  if (_stub || !_module) return stubBiome(blockX, blockZ)

  const mcVer  = VERSION_MAP[edition]?.[version] ?? 21
  const dimId  = { overworld: 0, nether: -1, end: 1 }[dimension] ?? 0
  const numSeed = parseSeed(seed)

  try {
    const g = getGenerator(mcVer, dimId, numSeed)
    // getBiomeAt(g, scale, x, y, z) — use scale 4 (quarter-block) for speed
    const biome = _module._getBiomeAt(g, 4, blockX >> 2, 0, blockZ >> 2)
    return biome >= 0 ? biome : stubBiome(blockX, blockZ)
  } catch {
    return stubBiome(blockX, blockZ)
  }
}

// Get structure positions in a world region
// Returns array of { x, z, type }
export function getStructuresInRegion(seed, edition, version, dimension, x0, z0, x1, z1) {
  if (_stub || !_module) return stubStructures(seed, dimension, x0, z0, x1, z1)

  const mcVer  = VERSION_MAP[edition]?.[version] ?? 21
  const dimId  = { overworld: 0, nether: -1, end: 1 }[dimension] ?? 0
  const numSeed = parseSeed(seed)
  const results = []

  const types  = getStructureTypesForDimension(dimension)

  try {
    const g      = getGenerator(mcVer, dimId, numSeed)
    const sconf  = _module._malloc(64)
    const posPtr = _module._malloc(8)

    const regionSize = 512  // blocks — scan in 512-block region chunks
    const rx0 = Math.floor(x0 / regionSize)
    const rz0 = Math.floor(z0 / regionSize)
    const rx1 = Math.ceil(x1  / regionSize)
    const rz1 = Math.ceil(z1  / regionSize)

    for (const { type } of types) {
      const structId = STRUCT_IDS[type]
      if (structId === undefined) continue

      // getStructureConfig(structureType, mc, *sconf) → 1 on success
      const ok = _module._getStructureConfig(structId, mcVer, sconf)
      if (!ok) continue

      for (let rx = rx0; rx <= rx1; rx++) {
        for (let rz = rz0; rz <= rz1; rz++) {
          // getStructurePos(structureType, mc, seed, regX, regZ, *pos) → 1 on success
          const found = _module._getStructurePos(structId, mcVer, numSeed, rx, rz, posPtr)
          if (!found) continue

          const px = _module.HEAP32[(posPtr >> 2)]
          const pz = _module.HEAP32[(posPtr >> 2) + 1]

          // Filter to requested region
          if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) {
            results.push({ x: px, z: pz, type })
          }
        }
      }
    }

    _module._free(posPtr)
    _module._free(sconf)
  } catch (e) {
    console.warn('[cubiomes] getStructuresInRegion error:', e)
  }

  return results
}

// Structure type definitions per dimension
export function getStructureTypesForDimension(dimension) {
  const map = {
    overworld: [
      { type: 'village',         label: 'Village',          icon: '🏘' },
      { type: 'desert_temple',   label: 'Desert Temple',    icon: '🏛' },
      { type: 'jungle_temple',   label: 'Jungle Temple',    icon: '🌿' },
      { type: 'witch_hut',       label: 'Witch Hut',        icon: '🧙' },
      { type: 'igloo',           label: 'Igloo',            icon: '🧊' },
      { type: 'monument',        label: 'Ocean Monument',   icon: '🏯' },
      { type: 'mansion',         label: 'Woodland Mansion', icon: '🏚' },
      { type: 'outpost',         label: 'Pillager Outpost', icon: '🗼' },
      { type: 'shipwreck',       label: 'Shipwreck',        icon: '⚓' },
      { type: 'ruined_portal',   label: 'Ruined Portal',    icon: '🌀' },
      { type: 'mineshaft',       label: 'Mineshaft',        icon: '⛏' },
      { type: 'ancient_city',    label: 'Ancient City',     icon: '🏙' },
      { type: 'trial_chamber',   label: 'Trial Chamber',    icon: '⚔' },
    ],
    nether: [
      { type: 'nether_fortress', label: 'Nether Fortress',  icon: '🔥' },
      { type: 'bastion',         label: 'Bastion Remnant',  icon: '👹' },
      { type: 'ruined_portal',   label: 'Ruined Portal',    icon: '🌀' },
    ],
    end: [
      { type: 'end_city',        label: 'End City',         icon: '🏰' },
    ],
  }
  return map[dimension] ?? []
}

// ── Biome colors ─────────────────────────────────────────────────────────────

export const BIOME_COLORS = {
  0:  [141,179, 96],  // plains
  1:  [250,148, 24],  // desert
  2:  [ 96,160, 82],  // forest (wooded hills)
  3:  [  5,102, 33],  // taiga
  4:  [ 37,123, 70],  // swamp
  5:  [ 11,102, 89],  // river
  6:  [178,173,132],  // nether wastes
  7:  [100,100,100],  // the end
  8:  [ 64, 64,144],  // frozen ocean
  9:  [ 96,160,170],  // frozen river
  10: [255,255,255],  // snowy plains
  11: [160,160,255],  // snowy mountains
  12: [ 49, 85, 74],  // mushroom fields
  13: [ 96, 96, 96],  // beach
  14: [  0,168,  0],  // jungle (dark green)
  15: [  0,  0,255],  // deep ocean
  16: [247,233,163],  // badlands plateau
  17: [178,173,132],  // eroded badlands
  18: [100,100,100],  // stone shore
  21: [ 83,123, 9],   // jungle hills
  23: [100,100,255],  // deep ocean (dark)
  24: [ 96,160,170],  // cold ocean
  25: [100,100,255],  // deep cold ocean
  26: [ 96,160,170],  // lukewarm ocean
  27: [100,100,255],  // deep lukewarm ocean
  28: [100,100,255],  // warm ocean
  29: [100,100,255],  // deep warm ocean
  30: [  5,102, 33],  // snowy taiga
  32: [  5,102, 33],  // giant tree taiga
  35: [141,179, 96],  // savanna
  36: [141,179, 96],  // savanna plateau
  37: [178,173,132],  // badlands
  38: [178,173,132],  // wooded badlands
  39: [178,173,132],  // eroded badlands
  40: [141,179, 96],  // windswept hills
  41: [ 96,160, 82],  // flower forest
  44: [ 64,164,164],  // mangrove swamp
  45: [ 25,180, 80],  // cherry grove
  46: [ 96,160, 82],  // old growth forest
  47: [  5,102, 33],  // old growth taiga
  48: [  5,102, 33],  // old growth pine taiga
  49: [141,179, 96],  // meadow
  50: [255,255,255],  // frozen peaks
  51: [178,178,178],  // jagged peaks
  52: [200,200,200],  // stony peaks
  53: [178,178,178],  // grove
  54: [255,255,255],  // snowy slopes
}

export function biomeColor(id) {
  return BIOME_COLORS[id] ?? [80, 80, 80]
}

export const BIOME_NAMES = {
  0: 'Plains', 1: 'Desert', 2: 'Forest', 3: 'Taiga', 4: 'Swamp',
  5: 'River', 6: 'Nether Wastes', 7: 'The End', 8: 'Frozen Ocean',
  9: 'Frozen River', 10: 'Snowy Plains', 12: 'Mushroom Fields',
  13: 'Beach', 14: 'Jungle', 21: 'Jungle Hills', 30: 'Snowy Taiga',
  35: 'Savanna', 37: 'Badlands', 40: 'Windswept Hills',
  41: 'Flower Forest', 44: 'Mangrove Swamp', 45: 'Cherry Grove',
  49: 'Meadow', 50: 'Frozen Peaks', 54: 'Snowy Slopes',
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

function stubBiome(x, z) {
  const v = Math.abs(Math.sin(x * 0.01) * Math.cos(z * 0.01) * 100) | 0
  return v % 16
}

function stubStructures(seed, dimension, x0, z0, x1, z1) {
  const types = getStructureTypesForDimension(dimension)
  const results = []
  const numSeed = parseSeed(seed)
  const spacing = 512
  const cx0 = Math.floor(x0 / spacing)
  const cz0 = Math.floor(z0 / spacing)
  const cx1 = Math.ceil(x1  / spacing)
  const cz1 = Math.ceil(z1  / spacing)
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const rng = Math.abs(Math.sin(cx * 7 + cz * 13 + numSeed) * 1e6) | 0
      if (rng % 4 === 0 && types.length > 0) {
        results.push({
          x: cx * spacing + (rng % 200) - 100,
          z: cz * spacing + ((rng >> 4) % 200) - 100,
          type: types[rng % types.length].type,
        })
      }
    }
  }
  return results
}
