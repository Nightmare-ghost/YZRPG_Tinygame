(function (global) {
  "use strict";
  const WORKER_PATH = "vendor/stockfish/stockfish-19-lite-single.js";
  let worker = null;
  let failed = false;
  let seq = 0;
  const pending = new Map();

  function failAll(err) {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(err || new Error("stockfish unavailable"));
    }
    pending.clear();
  }

  function ensureWorker() {
    if (failed) throw new Error("stockfish unavailable");
    if (worker) return worker;
    if (typeof global.Worker !== "function") throw new Error("Worker unavailable");
    worker = new global.Worker(WORKER_PATH);
    worker.onmessage = ev => {
      const text = String(ev.data || "");
      if (text.indexOf("bestmove") !== 0) return;
      const parts = text.trim().split(/\s+/);
      const move = parts[1] || "";
      for (const [id, item] of pending) {
        clearTimeout(item.timer);
        pending.delete(id);
        if (move && move !== "(none)") item.resolve(move);
        else item.reject(new Error("stockfish no move"));
        break;
      }
    };
    worker.onerror = ev => {
      failed = true;
      failAll(new Error(ev.message || "worker error"));
    };
    try {
      worker.postMessage("uci");
      worker.postMessage("setoption name Threads value 1");
      worker.postMessage("setoption name Hash value 32");
    } catch (err) {
      failed = true;
      throw err;
    }
    return worker;
  }

  function bestMove(fen, millis, level) {
    return new Promise((resolve, reject) => {
      let w;
      try { w = ensureWorker(); } catch (err) { reject(err); return; }
      const id = ++seq;
      const timeout = Math.max(3000, millis + 4000);
      const timer = setTimeout(() => {
        pending.delete(id);
        failed = true;
        try { if (worker) worker.terminate(); } catch (e) { /* ignore */ }
        worker = null;
        reject(new Error("stockfish timeout"));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      if (level === "easy") {
        w.postMessage("setoption name UCI_LimitStrength value true");
        w.postMessage("setoption name UCI_Elo value 1350");
      } else if (level === "normal") {
        w.postMessage("setoption name UCI_LimitStrength value true");
        w.postMessage("setoption name UCI_Elo value 1900");
      } else {
        w.postMessage("setoption name UCI_LimitStrength value false");
      }
      w.postMessage("position fen " + fen);
      w.postMessage("go movetime " + Math.max(120, millis | 0));
    });
  }

  global.StockfishAI = { bestMove, isFailed: () => failed };
})(window);
