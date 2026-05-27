// cubiomes WASM wrapper
// Correct enum values from finders.h (0-indexed order they appear):
// Desert_Pyramid=0, Jungle_Temple=1, Swamp_Hut=2, Igloo=3, Village=4,
// Shipwreck=5, Monument=6, Mansion=7, Outpost=8, Ruined_Portal=9,
// Ruined_Portal_N=10, Ancient_City=11, Mineshaft=12, Fortress=13,
// Bastion=14, End_City=15, Trial_Chambers=16

let _module = null
let _stub = false

// 512KB — large enough for Generator's LayerStack union (1.17 and below need most)
const GEN_SIZE = 1024 * 512

const VERSION_MAP = {
  java:    { '1.21':21, '1.20':20, '1.19':19, '1.18':18, '1.17':17, '1.16':16, '1.15':15, '1.14':14 },
  bedrock: { '1.21':21, '1.20':20, '1.19':19, '1.18':18 },
}

export function setModule(mod) {
  _module = mod
  _stub   = false
  // Reset cached generator when new module loaded
  _genPtr = 0
  _genKey = ''
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
    const mod = await window.CubiomesModule({ locateFile: p => '/wasm/' + p })
    setModule(mod)
    console.log('[cubiomes] WASM loaded OK')
  } catch (e) {
    console.warn('[cubiomes] WASM not found, using stub:', e.message)
    _stub = true
  }
}

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

// ── Generator cache (one per seed+dim+version) ────────────────────────────────

let _genPtr = 0
let _genKey = ''

function getGenerator(mcVer, dimId, numSeed) {
  const key = `${mcVer}:${dimId}:${numSeed}`
  if (_genPtr && _genKey === key) return _genPtr
  if (_genPtr) _module._free(_genPtr)
  _genPtr = _module._malloc(GEN_SIZE)
  if (!_genPtr) throw new Error('malloc failed for Generator')
  _module._setupGenerator(_genPtr, mcVer, 0)
  _module._applySeed(_genPtr, dimId, numSeed)
  _genKey = key
  return _genPtr
}

// ── Biomes ────────────────────────────────────────────────────────────────────

export function getBiomeAt(seed, edition, version, dimension, blockX, blockZ) {
  if (_stub || !_module) return stubBiome(blockX, blockZ)
  const mcVer   = VERSION_MAP[edition]?.[version] ?? 21
  const dimId   = { overworld: 0, nether: -1, end: 1 }[dimension] ?? 0
  const numSeed = parseSeed(seed)
  try {
    const g     = getGenerator(mcVer, dimId, numSeed)
    const biome = _module._getBiomeAt(g, 4, blockX >> 2, 0, blockZ >> 2)
    return biome >= 0 ? biome : stubBiome(blockX, blockZ)
  } catch {
    return stubBiome(blockX, blockZ)
  }
}

// ── Structures ────────────────────────────────────────────────────────────────

// Correct IDs matching the enum order in finders.h
const STRUCT_IDS = {
  desert_temple:   0,
  jungle_temple:   1,
  witch_hut:       2,
  igloo:           3,
  village:         4,
  shipwreck:       5,
  monument:        6,
  mansion:         7,
  outpost:         8,
  ruined_portal:   9,
  ancient_city:    11,
  mineshaft:       12,
  nether_fortress: 13,
  bastion:         14,
  end_city:        15,
  trial_chamber:   16,
}

export function getStructuresInRegion(seed, edition, version, dimension, x0, z0, x1, z1) {
  if (_stub || !_module) return stubStructures(seed, dimension, x0, z0, x1, z1)

  const mcVer   = VERSION_MAP[edition]?.[version] ?? 21
  const numSeed = parseSeed(seed)
  const results = []
  const types   = getStructureTypesForDimension(dimension)

  // Allocate Pos struct (two int32s = 8 bytes)
  const posPtr = _module._malloc(8)
  if (!posPtr) return results

  try {
    for (const { type } of types) {
      const structId = STRUCT_IDS[type]
      if (structId === undefined) continue

      // Region size varies by structure — use 512 blocks as a safe default
      const spacing = 512
      const rx0 = Math.floor(x0 / spacing) - 1
      const rz0 = Math.floor(z0 / spacing) - 1
      const rx1 = Math.ceil(x1  / spacing) + 1
      const rz1 = Math.ceil(z1  / spacing) + 1

      for (let rx = rx0; rx <= rx1; rx++) {
        for (let rz = rz0; rz <= rz1; rz++) {
          try {
            // getStructurePos(structType, mc, seed, regX, regZ, *pos) → 1 if valid
            const ok = _module._getStructurePos(structId, mcVer, numSeed, rx, rz, posPtr)
            if (!ok) continue
            const px = _module.HEAP32[posPtr >> 2]
            const pz = _module.HEAP32[(posPtr >> 2) + 1]
            // Filter to visible region
            if (px >= x0 - spacing && px <= x1 + spacing &&
                pz >= z0 - spacing && pz <= z1 + spacing) {
              results.push({ x: px, z: pz, type })
            }
          } catch {
            // skip this region on error
          }
        }
      }
    }
  } finally {
    _module._free(posPtr)
  }

  return results
}

export function getStructureTypesForDimension(dimension) {
  const map = {
    overworld: [
      { type: 'village',       label: 'Village',          icon: '🏘' },
      { type: 'desert_temple', label: 'Desert Temple',    icon: '🏛' },
      { type: 'jungle_temple', label: 'Jungle Temple',    icon: '🌿' },
      { type: 'witch_hut',     label: 'Witch Hut',        icon: '🧙' },
      { type: 'igloo',         label: 'Igloo',            icon: '🧊' },
      { type: 'monument',      label: 'Ocean Monument',   icon: '🏯' },
      { type: 'mansion',       label: 'Woodland Mansion', icon: '🏚' },
      { type: 'outpost',       label: 'Pillager Outpost', icon: '🗼' },
      { type: 'shipwreck',     label: 'Shipwreck',        icon: '⚓' },
      { type: 'ruined_portal', label: 'Ruined Portal',    icon: '🌀' },
      { type: 'ancient_city',  label: 'Ancient City',     icon: '🏙' },
      { type: 'trial_chamber', label: 'Trial Chamber',    icon: '⚔' },
    ],
    nether: [
      { type: 'nether_fortress', label: 'Nether Fortress', icon: '🔥' },
      { type: 'bastion',         label: 'Bastion Remnant', icon: '👹' },
      { type: 'ruined_portal',   label: 'Ruined Portal',   icon: '🌀' },
    ],
    end: [
      { type: 'end_city', label: 'End City', icon: '🏰' },
    ],
  }
  return map[dimension] ?? []
}

// ── Biome colors & names ──────────────────────────────────────────────────────

export const BIOME_COLORS = {
  0:  [141,179, 96],  1:  [250,148, 24],  2:  [ 96,160, 82],
  3:  [  5,102, 33],  4:  [ 37,123, 70],  5:  [ 11,102, 89],
  6:  [178,173,132],  7:  [100,100,100],  8:  [ 64, 64,144],
  9:  [ 96,160,170], 10:  [255,255,255], 11:  [160,160,255],
  12: [ 49, 85, 74], 13:  [ 96, 96, 96], 14:  [  0,168,  0],
  15: [  0,  0,200], 16:  [247,233,163], 17:  [178,173,132],
  21: [ 83,123,  9], 23:  [ 30, 30,180], 24:  [ 96,160,170],
  25: [ 30, 30,180], 26:  [ 96,160,170], 27:  [ 30, 30,180],
  28: [ 30, 30,180], 29:  [ 30, 30,180], 30:  [  5,102, 33],
  32: [  5,102, 33], 35:  [141,179, 96], 36:  [141,179, 96],
  37: [178,173,132], 38:  [178,173,132], 39:  [178,173,132],
  40: [141,179, 96], 41:  [ 96,160, 82], 44:  [ 64,164,164],
  45: [255,183,197], 46:  [ 96,160, 82], 47:  [  5,102, 33],
  48: [  5,102, 33], 49:  [141,179, 96], 50:  [255,255,255],
  51: [178,178,178], 52:  [200,200,200], 53:  [178,178,178],
  54: [255,255,255],
}

export function biomeColor(id) {
  return BIOME_COLORS[id] ?? [60, 60, 60]
}

export const BIOME_NAMES = {
  0:'Plains', 1:'Desert', 2:'Forest', 3:'Taiga', 4:'Swamp',
  5:'River', 6:'Nether Wastes', 7:'The End', 8:'Frozen Ocean',
  9:'Frozen River', 10:'Snowy Plains', 12:'Mushroom Fields',
  13:'Beach', 14:'Jungle', 21:'Jungle Hills', 30:'Snowy Taiga',
  35:'Savanna', 37:'Badlands', 40:'Windswept Hills',
  41:'Flower Forest', 44:'Mangrove Swamp', 45:'Cherry Grove',
  49:'Meadow', 50:'Frozen Peaks', 54:'Snowy Slopes',
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

function stubBiome(x, z) {
  const v = Math.abs(Math.sin(x * 0.01) * Math.cos(z * 0.01) * 100) | 0
  return v % 16
}

function stubStructures(seed, dimension, x0, z0, x1, z1) {
  const types   = getStructureTypesForDimension(dimension)
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
