// Pure cubiomes logic — no DOM refs, safe for worker import

let _module = null
let _stub   = true

const VERSION_MAP = {
  java: {
    '1.21':21,'1.20':20,'1.19':19,'1.18':18,
    '1.17':17,'1.16':16,'1.15':15,'1.14':14,
    '1.13':13,'1.12':12,'1.11':11,'1.10':10,
    '1.9':9,'1.8':8,'1.7':7,
  },
  bedrock: {
    '1.21':21,'1.20':20,'1.19':19,'1.18':18,
    '1.17':17,'1.16':16,
  },
}

const STRUCT_IDS = {
  desert_temple:0, jungle_temple:1, witch_hut:2, igloo:3,
  village:4, shipwreck:5, monument:6, mansion:7, outpost:8,
  ruined_portal:9, ancient_city:11, mineshaft:12,
  nether_fortress:13, bastion:14, end_city:15, trial_chamber:16,
}

// Generator sizes to try — LayerStack (1.17-) needs ~2MB
const GEN_SIZES = [4*1024*1024, 8*1024*1024, 16*1024*1024]

export function setModule(mod) {
  _module = mod
  _stub   = false
  _genPtr = 0
  _genKey = ''
}

export function isReady() { return !_stub && _module !== null }

export function parseSeed(seedStr) {
  const t = String(seedStr).trim()
  const n = Number(t)
  if (!isNaN(n) && String(n) === t) return n
  let h = 0
  for (let i = 0; i < t.length; i++) h = Math.imul(31, h) + t.charCodeAt(i) | 0
  return h >>> 0
}

let _genPtr = 0
let _genKey = ''

function getGenerator(mcVer, dimId, numSeed) {
  const key = `${mcVer}:${dimId}:${numSeed}`
  if (_genPtr && _genKey === key) return _genPtr
  if (_genPtr) { _module._free(_genPtr); _genPtr = 0 }
  let ptr = 0
  for (const sz of GEN_SIZES) {
    ptr = _module._malloc(sz)
    if (ptr) break
  }
  if (!ptr) throw new Error('malloc failed')
  _module._setupGenerator(ptr, mcVer, 0)
  _module._applySeed(ptr, dimId, BigInt(numSeed))
  _genPtr = ptr
  _genKey = key
  return ptr
}

// ── FAST batch biome render — fills a Uint8ClampedArray RGBA buffer ──────────
// Much faster than calling getBiomeAt per pixel — one WASM call overhead per tile
export function renderTileToBuffer(seed, edition, version, dimension, tileX, tileZ, tileBlocks, bufSize, highlightBiome) {
  const buf = new Uint8ClampedArray(bufSize * bufSize * 4)
  const blockPerPx = tileBlocks / bufSize
  const mcVer  = VERSION_MAP[edition]?.[version] ?? 21
  const dimId  = { overworld:0, nether:-1, end:1 }[dimension] ?? 0
  const numSeed = parseSeed(seed)

  if (_stub || !_module) {
    // stub pattern
    for (let py = 0; py < bufSize; py++) {
      for (let px = 0; px < bufSize; px++) {
        const bx = Math.floor(tileX + px * blockPerPx)
        const bz = Math.floor(tileZ + py * blockPerPx)
        const id = stubBiome(bx, bz)
        const [r,g,b] = biomeColor(id)
        const i = (py*bufSize+px)*4
        buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=255
      }
    }
    return buf
  }

  try {
    const g = getGenerator(mcVer, dimId, numSeed)
    for (let py = 0; py < bufSize; py++) {
      for (let px = 0; px < bufSize; px++) {
        const bx = Math.floor(tileX + px * blockPerPx)
        const bz = Math.floor(tileZ + py * blockPerPx)
        // scale=4 means quarter-block resolution (fast, matches map display)
        const id = _module._getBiomeAt(g, 4, bx >> 2, 0, bz >> 2)
        let [r,g2,b] = biomeColor(id >= 0 ? id : 0)
        if (highlightBiome && String(id) !== String(highlightBiome)) {
          r=r>>2; g2=g2>>2; b=b>>2
        }
        const i = (py*bufSize+px)*4
        buf[i]=r; buf[i+1]=g2; buf[i+2]=b; buf[i+3]=255
      }
    }
  } catch(e) {
    console.warn('[cubiomes-core] renderTile error:', e.message)
  }
  return buf
}

// Keep single getBiomeAt for coord hover display
export function getBiomeAt(seed, edition, version, dimension, blockX, blockZ) {
  if (_stub || !_module) return stubBiome(blockX, blockZ)
  const mcVer  = VERSION_MAP[edition]?.[version] ?? 21
  const dimId  = { overworld:0, nether:-1, end:1 }[dimension] ?? 0
  const numSeed = parseSeed(seed)
  try {
    const g = getGenerator(mcVer, dimId, numSeed)
    const id = _module._getBiomeAt(g, 4, blockX>>2, 0, blockZ>>2)
    return id >= 0 ? id : 0
  } catch { return stubBiome(blockX, blockZ) }
}

export function getStructuresInRegion(seed, edition, version, dimension, x0, z0, x1, z1) {
  if (_stub || !_module) return stubStructures(seed, dimension, x0, z0, x1, z1)
  const mcVer   = VERSION_MAP[edition]?.[version] ?? 21
  const numSeed = parseSeed(seed)
  const results = []
  const types   = getStructureTypesForDimension(dimension)
  const posPtr  = _module._malloc(8)
  if (!posPtr) return results
  try {
    for (const { type } of types) {
      const structId = STRUCT_IDS[type]
      if (structId === undefined) continue
      const spacing = 512
      const rx0 = Math.floor(x0/spacing)-2
      const rz0 = Math.floor(z0/spacing)-2
      const rx1 = Math.ceil(x1/spacing)+2
      const rz1 = Math.ceil(z1/spacing)+2
      for (let rx = rx0; rx <= rx1; rx++) {
        for (let rz = rz0; rz <= rz1; rz++) {
          try {
            const ok = _module._getStructurePos(structId, mcVer, BigInt(numSeed), rx, rz, posPtr)
            if (!ok) continue
            const px = _module.HEAP32[posPtr>>2]
            const pz = _module.HEAP32[(posPtr>>2)+1]
            results.push({ x:px, z:pz, type })
          } catch { /* skip */ }
        }
      }
    }
  } finally { _module._free(posPtr) }
  return results
}

export function getStructureTypesForDimension(dimension) {
  const map = {
    overworld: [
      { type:'village',       label:'Village',          icon:'🏘' },
      { type:'desert_temple', label:'Desert Temple',    icon:'🏛' },
      { type:'jungle_temple', label:'Jungle Temple',    icon:'🌿' },
      { type:'witch_hut',     label:'Witch Hut',        icon:'🧙' },
      { type:'igloo',         label:'Igloo',            icon:'🧊' },
      { type:'monument',      label:'Ocean Monument',   icon:'🏯' },
      { type:'mansion',       label:'Woodland Mansion', icon:'🏚' },
      { type:'outpost',       label:'Pillager Outpost', icon:'🗼' },
      { type:'shipwreck',     label:'Shipwreck',        icon:'⚓' },
      { type:'ruined_portal', label:'Ruined Portal',    icon:'🌀' },
      { type:'ancient_city',  label:'Ancient City',     icon:'🏙' },
      { type:'trial_chamber', label:'Trial Chamber',    icon:'⚔' },
      { type:'mineshaft',     label:'Mineshaft',        icon:'⛏' },
    ],
    nether: [
      { type:'nether_fortress', label:'Nether Fortress', icon:'🔥' },
      { type:'bastion',         label:'Bastion Remnant', icon:'👹' },
      { type:'ruined_portal',   label:'Ruined Portal',   icon:'🌀' },
    ],
    end: [
      { type:'end_city', label:'End City', icon:'🏰' },
    ],
  }
  return map[dimension] ?? []
}

export const JAVA_VERSIONS    = ['1.21','1.20','1.19','1.18','1.17','1.16','1.15','1.14','1.13','1.12','1.11','1.10','1.9','1.8','1.7']
export const BEDROCK_VERSIONS = ['1.21','1.20','1.19','1.18','1.17','1.16']

export const BIOME_COLORS = {
  0:[141,179,96],   1:[250,148,24],   2:[96,160,82],    3:[5,102,33],
  4:[37,123,70],    5:[11,102,89],    6:[178,173,132],  7:[100,100,100],
  8:[64,64,144],    9:[96,160,170],   10:[255,255,255], 11:[160,160,255],
  12:[49,85,74],    13:[150,109,77],  14:[0,168,0],     15:[0,0,200],
  16:[247,233,163], 17:[178,173,132], 18:[34,85,28],    19:[96,160,82],
  20:[96,96,96],    21:[83,123,9],    22:[44,66,5],     23:[0,0,160],
  24:[32,32,112],   25:[64,128,150],  26:[144,144,255], 27:[34,85,28],
  28:[22,57,18],    29:[96,160,82],   30:[5,102,33],    31:[5,80,25],
  32:[89,102,81],   33:[69,79,62],    34:[68,70,156],   35:[141,179,96],
  36:[162,206,110], 37:[178,173,132], 38:[178,173,132], 39:[178,173,132],
  40:[141,179,96],  41:[96,160,82],   44:[64,164,164],  45:[255,183,197],
  46:[96,160,82],   47:[5,102,33],    48:[5,102,33],    49:[141,179,96],
  50:[255,255,255], 51:[178,178,178], 52:[200,200,200], 53:[178,178,178],
  54:[255,255,255],
}
export function biomeColor(id) { return BIOME_COLORS[id] ?? [60,60,60] }

export const BIOME_NAMES = {
  0:'Plains',1:'Desert',2:'Forest',3:'Taiga',4:'Swamp',5:'River',
  6:'Nether Wastes',7:'The End',8:'Frozen Ocean',9:'Frozen River',
  10:'Snowy Plains',11:'Snowy Mountains',12:'Mushroom Fields',13:'Beach',
  14:'Jungle',15:'Deep Ocean',16:'Badlands Plateau',17:'Eroded Badlands',
  18:'Wooded Hills',19:'Forest Hills',20:'Mountain Edge',21:'Jungle Hills',
  22:'Jungle Edge',23:'Deep Ocean',24:'Cold Ocean',25:'Deep Cold Ocean',
  26:'Lukewarm Ocean',27:'Deep Lukewarm Ocean',28:'Warm Ocean',
  29:'Deep Warm Ocean',30:'Snowy Taiga',31:'Snowy Taiga Hills',
  32:'Giant Tree Taiga',33:'Giant Tree Taiga Hills',34:'Wooded Mountains',
  35:'Savanna',36:'Savanna Plateau',37:'Badlands',38:'Wooded Badlands',
  39:'Eroded Badlands',40:'Windswept Hills',41:'Flower Forest',
  44:'Mangrove Swamp',45:'Cherry Grove',46:'Old Growth Birch Forest',
  47:'Old Growth Spruce Taiga',48:'Old Growth Pine Taiga',
  49:'Meadow',50:'Frozen Peaks',51:'Jagged Peaks',52:'Stony Peaks',
  53:'Grove',54:'Snowy Slopes',
}

function stubBiome(x,z) { return (Math.abs(Math.sin(x*.01)*Math.cos(z*.01)*100)|0)%16 }
function stubStructures(seed,dimension,x0,z0,x1,z1) {
  const types=getStructureTypesForDimension(dimension),results=[],ns=parseSeed(seed),sp=512
  for(let cx=Math.floor(x0/sp);cx<=Math.ceil(x1/sp);cx++)
    for(let cz=Math.floor(z0/sp);cz<=Math.ceil(z1/sp);cz++){
      const rng=Math.abs(Math.sin(cx*7+cz*13+ns)*1e6)|0
      if(rng%4===0&&types.length>0)
        results.push({x:cx*sp+(rng%200)-100,z:cz*sp+((rng>>4)%200)-100,type:types[rng%types.length].type})
    }
  return results
}
