import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
  // Copy wasm files to dist as-is (Vite doesn't handle .wasm in public correctly always)
  plugins: [
    {
      name: 'copy-wasm',
      closeBundle() {
        const src  = resolve(__dirname, 'public/wasm')
        const dest = resolve(__dirname, 'dist/wasm')
        if (!existsSync(src)) return
        if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
        for (const f of ['cubiomes.js', 'cubiomes.wasm']) {
          const s = resolve(src, f)
          if (existsSync(s)) {
            copyFileSync(s, resolve(dest, f))
            console.log(`[copy-wasm] copied ${f}`)
          }
        }
      }
    }
  ],
})
