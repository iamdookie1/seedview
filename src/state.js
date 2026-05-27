// Central app state — import and mutate this from any module.
// Call state.onChange(callback) to subscribe to changes.

const listeners = []

export const state = {
  seed: '0',
  edition: 'java',        // 'java' | 'bedrock'
  version: '1.21',
  dimension: 'overworld', // 'overworld' | 'nether' | 'end'

  // Camera
  camX: 0,
  camZ: 0,
  zoom: 1,               // pixels per block

  // Overlays
  showBiomes: true,
  showSlime: false,
  showChunkBorders: false,
  showStructures: true,
  highlightBiome: '',    // biome id string or ''

  // Per-structure visibility — key: structure id, value: boolean
  structureVisibility: {},

  // Internal
  wasmReady: false,

  // Notify all listeners of a state change
  notify() {
    for (const cb of listeners) cb(this)
  },

  onChange(cb) {
    listeners.push(cb)
  },
}
