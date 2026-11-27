# Vendored chess engines

## Stockfish.js 19.0.1 (lite, single-threaded)
- Source: https://github.com/nmrugg/stockfish.js
- Files: `stockfish/stockfish-19-lite-single.js`, `stockfish-19-lite-single.wasm`
- License: GPL-3.0; see `stockfish/Copying.txt`
- Used by `js/stockfish-ai.js` through a Web Worker.
- Requires the game to be served over HTTP(S); `file://` blocks the Worker.

## js-chess-engine 2.4.6
- Source: https://github.com/josefjadrny/js-chess-engine
- File: `jschess/js-chess-engine.js` (browser bundle)
- License: MIT; see `jschess/LICENSE`
- Used as the file:// fallback for international chess when Stockfish cannot start.

## js-chess-engine 2.4.6
- Source: https://github.com/josefjadrny/js-chess-engine
- File: `jschess/js-chess-engine.js` (esbuild browser bundle)
- License: MIT; see `jschess/LICENSE`
- Used as the file:// fallback for international chess when Stockfish cannot start.

## XiangQi Wizard Light
- Source: https://github.com/xqbase/xqwlight
- Files: `xqwlight/position.js`, `xqwlight/search.js`; wrapper `xqwlight/engine.js`
- License: GPL-2.0; see `xqwlight/LICENSE`
- Pure JavaScript, runs from `file://` as well as HTTP.
