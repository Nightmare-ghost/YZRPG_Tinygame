(function (global) {
  "use strict";
  function available() { return !!(global.JSChessEngine && typeof global.JSChessEngine.ai === "function"); }
  function bestMove(fen, difficulty) {
    if (!available()) return "";
    const level = difficulty === "easy" ? 2 : difficulty === "hard" ? 5 : 4;
    const res = global.JSChessEngine.ai(fen, { level, play: false, ttSizeMB: 8 });
    const move = res && res.move ? Object.entries(res.move)[0] : null;
    if (!move) return "";
    return String(move[0]).toLowerCase() + String(move[1]).toLowerCase();
  }
  global.JSChessAI = { available, bestMove };
})(window);
