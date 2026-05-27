# SeedView

A fast, clean Minecraft seed viewer for Java & Bedrock — powered by [cubiomes](https://github.com/Cubitect/cubiomes) compiled to WebAssembly.

## Quick start (UI only, stub data)

```bash
npm install
npm run dev
```

The app runs immediately with stub/demo biome data. To get real biome and structure data you need to compile cubiomes to WASM (step below).

---

## Compiling cubiomes to WASM (required for real data)

### 1. Install Emscripten

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### 2. Clone cubiomes

```bash
git clone https://github.com/Cubitect/cubiomes.git
cd cubiomes
```

### 3. Compile

```bash
emcc -O2 \
  biomenoise.c \
  biomes.c \
  generator.c \
  layers.c \
  noise.c \
  quadbase.c \
  structure.c \
  util.c \
  -o cubiomes.js \
  -s EXPORTED_FUNCTIONS='[
    "_setupGenerator",
    "_applySeed",
    "_getBiomeAt",
    "_findStructures",
    "_malloc",
    "_free"
  ]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","ccall","HEAP32","HEAPU8"]' \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="CubiomesModule" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT=worker
```

### 4. Copy output into the project

```bash
cp cubiomes.js /path/to/seedview/public/wasm/cubiomes.js
cp cubiomes.wasm /path/to/seedview/public/wasm/cubiomes.wasm
```

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → import the repo
3. Framework: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Click Deploy

The `vercel.json` already sets the required `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers for WASM threads.

---

## Project structure

```
seedview/
├── public/wasm/          ← put compiled cubiomes.js + .wasm here
├── src/
│   ├── core/
│   │   ├── cubiomes.js   ← WASM loader & JS API
│   │   ├── worker.js     ← Web Worker (all WASM calls go here)
│   │   └── url.js        ← shareable URL encode/decode
│   ├── map/
│   │   ├── renderer.js   ← Canvas renderer, pan/zoom
│   │   ├── tiles.js      ← Tile cache & request queue
│   │   └── overlays.js   ← Chunk borders, slime chunks
│   ├── ui/
│   │   ├── toolbar.js    ← Seed input, edition/version/dimension
│   │   ├── sidebar.js    ← Overlay toggles, biome highlight, history
│   │   ├── structures.js ← Structure icons & toggles
│   │   └── theme.js      ← Light/dark toggle
│   ├── state.js          ← Global app state
│   └── main.js           ← Entry point
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

---

## Features

- Java & Bedrock edition support
- MC versions 1.14–1.21
- Biome color map (real cubiomes data when WASM compiled)
- All structures toggleable per dimension
- Slime chunk overlay
- Chunk border overlay
- Biome highlight filter
- Shareable URLs with full state encoded
- Seed history (localStorage)
- Light/dark theme
- Pan & zoom (mouse + touch)
- Coordinate jump search
