(function (global) {
  "use strict";
  const RED = 1, BLACK = -1;

  function available() {
    return typeof global.Position === "function" && typeof global.Search === "function";
  }

  function buildPosition(board, side) {
    if (!available()) return null;
    const pos = new global.Position();
    pos.clearBoard();
    pos.sdPlayer = side === RED ? 0 : 1;
    for (let i = 0; i < 90; i++) {
      const p = board[i];
      if (!p) continue;
      const r = (i / 9) | 0, c = i % 9;
      const t = Math.abs(p);
      const pc = (p > 0 ? 8 : 16) + (t - 1);
      pos.addPiece(global.COORD_XY(c + 3, r + 3), pc);
    }
    pos.setIrrev();
    return pos;
  }

  function search(board, side, difficulty) {
    if (!available()) return 0;
    try {
      const pos = buildPosition(board, side);
      if (!pos) return 0;
      const level = difficulty === "easy" ? 3 : difficulty === "hard" ? 8 : 5;
      const millis = difficulty === "easy" ? 120 : difficulty === "hard" ? 650 : 280;
      const engine = new global.Search(pos, 16);
      const mv = engine.searchMain(level, millis);
      if (!mv) return 0;
      const src = mv & 255, dst = mv >> 8;
      const from = (global.RANK_Y(src) - 3) * 9 + (global.FILE_X(src) - 3);
      const to = (global.RANK_Y(dst) - 3) * 9 + (global.FILE_X(dst) - 3);
      if (from < 0 || from >= 90 || to < 0 || to >= 90) return 0;
      return (from << 8) | to;
    } catch (err) {
      return 0;
    }
  }

  global.XQWizardAI = { available, search };
})(window);
