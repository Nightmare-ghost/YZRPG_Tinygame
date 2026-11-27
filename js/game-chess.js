/* ============================================================
   混沌乱战 · 王车易位，别把王弄丢
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const { util, storage, settings, audio, toast } = YZ;

  const WHITE = 1, BLACK = -1;
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const INF = 1e9, MATE = 1e7;
  const FILES = "abcdefgh";
  const GLYPH = { 1: "♟", 2: "♞", 3: "♝", 4: "♜", 5: "♛", 6: "♚" };
  const CHESS_LABEL = { 1: "兵", 2: "马", 3: "象", 4: "车", 5: "后", 6: "王" };
  const LETTER = { 5: "Q", 4: "R", 3: "B", 2: "N" };
  const VAL = { 1: 100, 2: 320, 3: 330, 4: 500, 5: 900, 6: 0 };
  const CST = { WK: 1, WQ: 2, BK: 4, BQ: 8 };

  const idx = (r, c) => r * 8 + c;
  const rowOf = i => i >> 3;
  const colOf = i => i & 7;
  const other = s => -s;
  const sqName = i => FILES[colOf(i)] + (8 - rowOf(i));

  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const ROOK4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const BISHOP4 = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  const START = (() => {
    const b = new Int8Array(64);
    const back = [R, N, B, Q, K, B, N, R];
    for (let c = 0; c < 8; c++) {
      b[idx(0, c)] = -back[c];
      b[idx(7, c)] = back[c];
      b[idx(1, c)] = -P;
      b[idx(6, c)] = P;
    }
    return b;
  })();

  function initialIds(board) {
    const ids = new Array(64).fill(null);
    const counts = { white: {}, black: {} };
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p) continue;
      const side = p > 0 ? "white" : "black";
      const t = Math.abs(p);
      const slot = (counts[side][t] || 0) + 1;
      counts[side][t] = slot;
      ids[i] = side + "-" + t + "-" + slot;
    }
    return ids;
  }

  /* ---------------- 规则 ---------------- */
  function isAttacked(b, sq, by) {
    const r = rowOf(sq), c = colOf(sq);
    // 兵
    if (by === WHITE) {
      if (r + 1 < 8) {
        if (c > 0 && b[idx(r + 1, c - 1)] === P) return true;
        if (c < 7 && b[idx(r + 1, c + 1)] === P) return true;
      }
    } else {
      if (r - 1 >= 0) {
        if (c > 0 && b[idx(r - 1, c - 1)] === -P) return true;
        if (c < 7 && b[idx(r - 1, c + 1)] === -P) return true;
      }
    }
    // 马
    for (const [dr, dc] of KNIGHT) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const p = b[idx(nr, nc)];
      if (p === (by === WHITE ? N : -N)) return true;
    }
    // 王
    for (const [dr, dc] of KING8) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const p = b[idx(nr, nc)];
      if (p === (by === WHITE ? K : -K)) return true;
    }
    // 车 / 后
    for (const [dr, dc] of ROOK4) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = b[idx(nr, nc)];
        if (p) {
          if (p === (by === WHITE ? R : -R) || p === (by === WHITE ? Q : -Q)) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    // 象 / 后
    for (const [dr, dc] of BISHOP4) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = b[idx(nr, nc)];
        if (p) {
          if (p === (by === WHITE ? B : -B) || p === (by === WHITE ? Q : -Q)) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return false;
  }

  const isChecked = (g, side) => isAttacked(g.board, g.kp[side], other(side));

  function castleTargets(g, side, b) {
    const out = [];
    if (side === WHITE) {
      if ((g.castling & CST.WK) && b[60] === K && b[63] === R && !b[61] && !b[62] &&
        !isAttacked(b, 60, BLACK) && !isAttacked(b, 61, BLACK) && !isAttacked(b, 62, BLACK)) {
        out.push({ from: 60, to: 62, promo: 0, flag: "ck" });
      }
      if ((g.castling & CST.WQ) && b[60] === K && b[56] === R && !b[59] && !b[58] && !b[57] &&
        !isAttacked(b, 60, BLACK) && !isAttacked(b, 59, BLACK) && !isAttacked(b, 58, BLACK)) {
        out.push({ from: 60, to: 58, promo: 0, flag: "cq" });
      }
    } else {
      if ((g.castling & CST.BK) && b[4] === -K && b[7] === -R && !b[5] && !b[6] &&
        !isAttacked(b, 4, WHITE) && !isAttacked(b, 5, WHITE) && !isAttacked(b, 6, WHITE)) {
        out.push({ from: 4, to: 6, promo: 0, flag: "ck" });
      }
      if ((g.castling & CST.BQ) && b[4] === -K && b[0] === -R && !b[3] && !b[2] && !b[1] &&
        !isAttacked(b, 4, WHITE) && !isAttacked(b, 3, WHITE) && !isAttacked(b, 2, WHITE)) {
        out.push({ from: 4, to: 2, promo: 0, flag: "cq" });
      }
    }
    return out;
  }

  function genMoves(g, side, capturesOnly) {
    const b = g.board;
    const out = [];
    const add = (from, to, promo, flag) => {
      const target = b[to];
      if (target && (target > 0) === (side > 0)) return;
      if (capturesOnly && !target && !promo && flag !== "ep") return;
      out.push({ from, to, promo: promo || 0, flag: flag || 0 });
    };
    for (let from = 0; from < 64; from++) {
      const p = b[from];
      if (!p || (p > 0) !== (side > 0)) continue;
      const t = Math.abs(p);
      const r = rowOf(from), c = colOf(from);
      if (t === P) {
        const dir = side === WHITE ? -1 : 1;
        const startRow = side === WHITE ? 6 : 1;
        const promoRow = side === WHITE ? 0 : 7;
        const one = idx(r + dir, c);
        if (r + dir >= 0 && r + dir < 8 && !b[one]) {
          if (r + dir === promoRow) for (const q of [5, 4, 3, 2]) add(from, one, q, 0);
          else {
            add(from, one, 0, 0);
            if (r === startRow) {
              const two = idx(r + dir * 2, c);
              if (!b[two]) add(from, two, 0, "dbl");
            }
          }
        }
        for (const dc of [-1, 1]) {
          const nr = r + dir, nc = c + dc;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
          const to = idx(nr, nc);
          if (b[to] && (b[to] > 0) !== (side > 0)) {
            if (nr === promoRow) for (const q of [5, 4, 3, 2]) add(from, to, q, 0);
            else add(from, to, 0, 0);
          } else if (to === g.ep) {
            add(from, to, 0, "ep");
          }
        }
      } else if (t === N) {
        for (const [dr, dc] of KNIGHT) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
          add(from, idx(nr, nc), 0, 0);
        }
      } else if (t === K) {
        for (const [dr, dc] of KING8) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
          add(from, idx(nr, nc), 0, 0);
        }
        for (const mv of castleTargets(g, side, b)) out.push(mv);
      } else {
        const dirs = t === B ? BISHOP4 : t === R ? ROOK4 : BISHOP4.concat(ROOK4);
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const to = idx(nr, nc);
            const target = b[to];
            if (!target) {
              if (!capturesOnly) out.push({ from, to, promo: 0, flag: 0 });
            } else {
              if ((target > 0) !== (side > 0)) out.push({ from, to, promo: 0, flag: 0 });
              break;
            }
            nr += dr; nc += dc;
          }
        }
      }
    }
    return out;
  }

  function makeMove(g, mv) {
    const b = g.board;
    const from = mv.from, to = mv.to;
    const p = b[from];
    const cap = b[to];
    const side = p > 0 ? WHITE : BLACK;
    const u = {
      cap, castling: g.castling, ep: g.ep, half: g.halfmove, full: g.fullmove,
      kpWhite: g.kp[WHITE], kpBlack: g.kp[BLACK], turn: g.turn,
      epCap: 0, epCapSq: -1, rookFrom: -1, rookTo: -1, piece: p
    };
    b[to] = mv.promo ? (side === WHITE ? mv.promo : -mv.promo) : p;
    b[from] = 0;
    if (mv.flag === "ep") {
      u.epCapSq = to + (side === WHITE ? 8 : -8);
      u.epCap = b[u.epCapSq];
      b[u.epCapSq] = 0;
    }
    if (mv.flag === "ck" || mv.flag === "cq") {
      if (side === WHITE) {
        const rf = mv.flag === "ck" ? 63 : 56;
        const rt = mv.flag === "ck" ? 61 : 59;
        u.rookFrom = rf; u.rookTo = rt;
        b[rt] = b[rf]; b[rf] = 0;
      } else {
        const rf = mv.flag === "ck" ? 7 : 0;
        const rt = mv.flag === "ck" ? 5 : 3;
        u.rookFrom = rf; u.rookTo = rt;
        b[rt] = b[rf]; b[rf] = 0;
      }
    }
    if (Math.abs(p) === K) g.kp[side] = to;
    // 易位权利
    if (Math.abs(p) === K) g.castling &= side === WHITE ? ~(CST.WK | CST.WQ) : ~(CST.BK | CST.BQ);
    if (from === 56 || to === 56) g.castling &= ~CST.WQ;
    if (from === 63 || to === 63) g.castling &= ~CST.WK;
    if (from === 0 || to === 0) g.castling &= ~CST.BQ;
    if (from === 7 || to === 7) g.castling &= ~CST.BK;
    g.ep = mv.flag === "dbl" ? (from + to) / 2 : -1;
    g.halfmove = (Math.abs(p) === P || cap) ? 0 : g.halfmove + 1;
    if (g.turn === BLACK) g.fullmove++;
    g.turn = other(g.turn);
    return u;
  }

  function unmakeMove(g, mv, u) {
    const b = g.board;
    const from = mv.from, to = mv.to;
    const p = u.piece;
    b[from] = p;
    b[to] = u.cap;
    if (mv.flag === "ep") b[u.epCapSq] = u.epCap;
    if (u.rookFrom >= 0) {
      b[u.rookFrom] = b[u.rookTo];
      b[u.rookTo] = 0;
    }
    g.castling = u.castling;
    g.ep = u.ep;
    g.halfmove = u.half;
    g.fullmove = u.full;
    g.kp[WHITE] = u.kpWhite;
    g.kp[BLACK] = u.kpBlack;
    g.turn = u.turn;
  }

  function legalMoves(g, side) {
    const out = [];
    for (const mv of genMoves(g, side, false)) {
      const u = makeMove(g, mv);
      if (!isChecked(g, side)) out.push(mv);
      unmakeMove(g, mv, u);
    }
    return out;
  }

  function hasInsufficientMaterial(b) {
    const pieces = [];
    let bishopsLight = 0, bishopsDark = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || Math.abs(p) === K) continue;
      pieces.push(p);
      if (Math.abs(p) === B) {
        if ((rowOf(i) + colOf(i)) % 2 === 0) bishopsLight++;
        else bishopsDark++;
      }
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (Math.abs(pieces[0]) === B || Math.abs(pieces[0]) === N)) return true;
    if (pieces.length >= 2 && pieces.every(p => Math.abs(p) === B)) {
      if (bishopsLight === 0 || bishopsDark === 0) return true;
    }
    return false;
  }

  /* ---------------- 评估与搜索 ---------------- */
  const PST = {
    1: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0
    ],
    2: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50
    ],
    3: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20
    ],
    4: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0
    ],
    5: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20
    ],
    6: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20
    ]
  };
  const mirror = i => (7 - rowOf(i)) * 8 + colOf(i);

  function evaluate(g, side) {
    const b = g.board;
    let score = 0;
    let whiteBishops = 0, blackBishops = 0;
    const pawnFiles = { 1: new Array(8).fill(0), [-1]: new Array(8).fill(0) };
    const pawns = [], rooks = [], kings = {};
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const t = Math.abs(p), w = p > 0;
      score += (w ? 1 : -1) * (VAL[t] + PST[t][w ? i : mirror(i)]);
      if (t === B) { if (w) whiteBishops++; else blackBishops++; }
      if (t === P) { pawnFiles[w ? 1 : -1][colOf(i)]++; pawns.push({ i, w }); }
      if (t === R) rooks.push({ i, w });
      if (t === K) kings[w ? 1 : -1] = i;
    }
    if (whiteBishops >= 2) score += 28;
    if (blackBishops >= 2) score -= 28;
    for (const s of [1, -1]) {
      for (let f = 0; f < 8; f++) {
        const n = pawnFiles[s][f];
        if (n > 1) score += (s === WHITE ? -1 : 1) * 10 * (n - 1);
        if (n === 0) {
          const left = f > 0 ? pawnFiles[s][f - 1] : 0;
          const right = f < 7 ? pawnFiles[s][f + 1] : 0;
          if (!left && !right) score += (s === WHITE ? -1 : 1) * 8;
        }
      }
    }
    /* 通路兵：越接近升变越值钱 */
    for (const { i, w } of pawns) {
      const r = rowOf(i), f = colOf(i), dir = w ? -1 : 1;
      let passed = true;
      for (let rr = r + dir; rr >= 0 && rr < 8; rr += dir) {
        for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
          const q = b[rr * 8 + ff];
          if (q && Math.abs(q) === P && (q > 0) !== w) { passed = false; break; }
        }
        if (!passed) break;
      }
      if (passed) {
        const adv = w ? 7 - r : r;
        score += (w ? 1 : -1) * [0, 8, 18, 32, 52, 80, 120][Math.min(6, adv)];
      }
    }
    /* 车在开放线 / 半开放线 */
    for (const { i, w } of rooks) {
      const f = colOf(i);
      const own = pawnFiles[w ? 1 : -1][f];
      const enemy = pawnFiles[w ? -1 : 1][f];
      if (!own) score += (w ? 1 : -1) * (enemy ? 7 : 14);
    }
    /* 王前兵盾 */
    for (const s of [1, -1]) {
      const k = kings[s];
      if (k === undefined) continue;
      const f = colOf(k), r = rowOf(k), dir = s === WHITE ? -1 : 1;
      let shield = 0;
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
        for (let d = 1; d <= 2; d++) {
          const rr = r + dir * d;
          if (rr >= 0 && rr < 8 && b[rr * 8 + ff] * s > 0 && Math.abs(b[rr * 8 + ff]) === P) { shield += 8; break; }
        }
      }
      score += s * shield;
    }
    return side === WHITE ? score : -score;
  }

  function toFen(g) {
    const map = { 1: "P", 2: "N", 3: "B", 4: "R", 5: "Q", 6: "K" };
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let row = "", empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = g.board[idx(r, c)];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        const ch = map[Math.abs(p)] || "?";
        row += p > 0 ? ch : ch.toLowerCase();
      }
      if (empty) row += empty;
      rows.push(row || "8");
    }
    let castle = "";
    if (g.castling & CST.WK) castle += "K";
    if (g.castling & CST.WQ) castle += "Q";
    if (g.castling & CST.BK) castle += "k";
    if (g.castling & CST.BQ) castle += "q";
    const ep = g.ep >= 0 ? sqName(g.ep) : "-";
    return rows.join("/") + " " + (g.turn === WHITE ? "w" : "b") + " " + (castle || "-") + " " + ep + " " + (g.halfmove || 0) + " " + (g.fullmove || 1);
  }

  function uciToMove(uci, g) {
    const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(String(uci || ""));
    if (!m) return null;
    const fileOf = ch => FILES.indexOf(ch.toLowerCase());
    const from = (8 - Number(m[2][1])) * 8 + fileOf(m[2][0]);
    const to = (8 - Number(m[4][1])) * 8 + fileOf(m[4][0]);
    const promoMap = { q: 5, r: 4, b: 3, n: 2 };
    const promo = m[5] ? promoMap[m[5].toLowerCase()] || 5 : 0;
    const moves = legalMoves(g, g.turn);
    let found = moves.find(mv => mv.from === from && mv.to === to && (!promo || mv.promo === promo));
    if (!found) found = moves.find(mv => mv.from === from && mv.to === to);
    return found || null;
  }

  function stockfishMillis(difficulty) {
    return difficulty === "easy" ? 500 : difficulty === "hard" ? 3000 : 1200;
  }

  function searchBest(start, side, difficulty) {
    const g = {
      board: Int8Array.from(start.board),
      turn: side,
      castling: start.castling,
      ep: start.ep,
      halfmove: 0,
      fullmove: 1,
      kp: { 1: start.kp[1], [-1]: start.kp[-1] }
    };
    const maxDepth = difficulty === "easy" ? 1 : difficulty === "hard" ? 4 : 3;
    const timeLimit = difficulty === "easy" ? 250 : difficulty === "hard" ? 900 : 620;
    const margin = difficulty === "easy" ? 130 : difficulty === "normal" ? 38 : 0;
    const deadline = performance.now() + timeLimit;
    let nodes = 0, aborted = false, orderMap = new Map();
    const killers = Array.from({ length: 64 }, () => []);
    const historyScore = new Map();

    function timeUp() {
      if ((nodes & 255) === 0 && performance.now() > deadline) aborted = true;
      return aborted;
    }
    function scoreMove(mv, ply) {
      let s = 0;
      const cap = g.board[mv.to];
      if (cap) s += VAL[Math.abs(cap)] * 10 - VAL[Math.abs(g.board[mv.from])];
      if (mv.promo) s += 800;
      const key = (mv.from << 6) | mv.to;
      if (killers[ply] && killers[ply].includes(key)) s += 900;
      s += Math.min(220, historyScore.get(key) || 0);
      return s;
    }
    function order(moves, ply) { moves.sort((a, b) => scoreMove(b, ply) - scoreMove(a, ply)); }
    function quiesce(alpha, beta, s, ply, qd) {
      nodes++;
      if (timeUp()) return 0;
      const stand = evaluate(g, s);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (qd >= 4) return alpha;
      const caps = genMoves(g, s, true);
      order(caps, ply);
      for (const mv of caps) {
        const u = makeMove(g, mv);
        if (isChecked(g, s)) { unmakeMove(g, mv, u); continue; }
        const sc = -quiesce(-beta, -alpha, other(s), ply + 1, qd + 1);
        unmakeMove(g, mv, u);
        if (aborted) return 0;
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }
    function negamax(depth, alpha, beta, s, ply) {
      nodes++;
      if (timeUp()) return 0;
      if (depth <= 0) {
        if (ply < 12 && isChecked(g, s)) depth = 1;
        else return quiesce(alpha, beta, s, ply, 0);
      }
      const moves = legalMoves(g, s);
      if (!moves.length) return -MATE + ply;
      order(moves, ply);
      let best = -INF;
      let cutoff = false;
      for (const mv of moves) {
        const wasCap = g.board[mv.to];
        const u = makeMove(g, mv);
        const sc = -negamax(depth - 1, -beta, -alpha, other(s), ply + 1);
        unmakeMove(g, mv, u);
        if (aborted) return 0;
        if (sc > best) best = sc;
        if (sc > alpha) alpha = sc;
        if (alpha >= beta) {
          if (!wasCap) {
            const key = (mv.from << 6) | mv.to;
            if (killers[ply] && !killers[ply].includes(key)) killers[ply] = [key, ...killers[ply].slice(0, 1)];
            historyScore.set(key, (historyScore.get(key) || 0) + depth * depth);
          }
          break;
        }
      }
      return best;
    }

    const rootMoves = legalMoves(g, side);
    if (!rootMoves.length) return null;
    order(rootMoves, 0);
    let bestOverall = rootMoves[0];
    let lastScores = null;
    for (let depth = 1; depth <= maxDepth; depth++) {
      if (depth > 1) rootMoves.sort((a, b) => (orderMap.get(b) || 0) - (orderMap.get(a) || 0));
      let alpha = -INF, beta = INF, best = -INF, bestMove = null;
      const scores = [];
      for (const mv of rootMoves) {
        const u = makeMove(g, mv);
        const sc = -negamax(depth - 1, -beta, -alpha, other(side), 1);
        unmakeMove(g, mv, u);
        if (aborted) break;
        scores.push([mv, sc]);
        if (sc > best) { best = sc; bestMove = mv; }
        if (sc > alpha) alpha = sc;
      }
      if (aborted || !bestMove) break;
      bestOverall = bestMove;
      lastScores = scores;
      orderMap = new Map(scores);
    }
    if (!lastScores || !lastScores.length) return bestOverall;
    let top = -INF;
    for (const [, sc] of lastScores) if (sc > top) top = sc;
    const pool = lastScores.filter(([, sc]) => sc >= top - margin);
    if (pool.length > 1) return pool[util.randInt(0, pool.length - 1)][0];
    return pool[0][0];
  }

  /* ---------------- 界面 ---------------- */
  function mount(root, api) {
    const firstTurn = Math.random() < 0.5 ? WHITE : BLACK;
    const state = {
      board: Int8Array.from(START),
      ids: null,
      turn: firstTurn,
      firstTurn,
      castling: CST.WK | CST.WQ | CST.BK | CST.BQ,
      ep: -1,
      halfmove: 0,
      fullmove: 1,
      kp: { 1: 60, [-1]: 4 },
      selected: -1,
      targets: [],
      lastMove: null,
      over: false,
      result: null,
      thinking: false,
      history: [],
      plies: [],
      keys: [],
      rep: new Map(),
      paused: false,
      alive: true,
      promoting: null
    };
    state.ids = initialIds(state.board);
    const playerSide = api.startSide === "black" ? BLACK : WHITE;
    const aiSide = -playerSide;
    const flipped = playerSide === BLACK;
    state.playerSide = playerSide;
    state.aiSide = aiSide;
    const resolveFaction = (key, side) => {
      const f = YZ.factions.get("chess", key);
      if (f) return f;
      return YZ.factions.get("chess", side === WHITE ? "white" : "black") || { key: side === WHITE ? "white" : "black", side: side === WHITE ? "white" : "black", army: side === WHITE ? "女神军" : "邪神军" };
    };
    const playerFaction = resolveFaction(api.startFaction, playerSide);
    const aiFaction = resolveFaction(api.opponentFaction, aiSide);
    const factionWhite = playerSide === WHITE ? playerFaction : aiFaction;
    const factionBlack = playerSide === BLACK ? playerFaction : aiFaction;
    state.factions = { white: factionWhite.key, black: factionBlack.key };
    let aiTimer = 0, resumeAI = false, overlayEl = null, helpEl = null, resignTimer = 0, armedResign = false;
    let boardEl, squareEls, statusEl, turnText, turnDot, rightStatus, blackRow, redRow, capByWhite, capByBlack, movesEl, undoBtn, resignBtn, boardWrap, blackSub, whiteSub;
    const db = YZ.pieceDB;
    const armyWhite = factionWhite.army || db.army("chess", "white");
    const armyBlack = factionBlack.army || db.army("chess", "black");

    const artGlyph = (p, id) => {
      const side = p > 0 ? "white" : "black";
      const parts = id ? String(id).split("-") : [];
      const slot = +parts[2] || 1;
      const faction = state.factions[side];
      const name = util.escapeHtml(db.chessName(side, Math.abs(p), slot, faction));
      const art = db.chessArt(side, Math.abs(p), slot, faction);
      if (art) {
        return '<span class="piece-art-wrap ' + side + '" title="' + name + '" aria-label="' + name + '">' +
          '<img class="piece-art" src="img/chess/art/' + art + '.png" alt="' + name + '" draggable="false">' +
          '<span class="piece-badge" aria-hidden="true">' + GLYPH[Math.abs(p)] + "</span></span>";
      }
      return '<span class="piece ' + side + '" title="' + name + '" aria-label="' + name + '">' + GLYPH[Math.abs(p)] + "</span>";
    };
    const posKey = () => state.board.join(",") + "|" + state.turn + "|" + state.castling + "|" + state.ep;

    function rebuildRep() {
      state.rep.clear();
      for (const k of state.keys) state.rep.set(k, (state.rep.get(k) || 0) + 1);
    }

    function resetRep() {
      state.keys = [posKey()];
      rebuildRep();
    }

    /* ---------- 布局 ---------- */
    const fileOrder = flipped ? FILES.split("").reverse().join("") : FILES;
    const rankOrder = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const filesHtml = fileOrder.split("").map(f => "<span>" + f + "</span>").join("");
    const ranksHtml = rankOrder.map(r => "<span>" + r + "</span>").join("");
    root.innerHTML =
      '<div class="ch-layout">' +
        '<div class="ch-main">' +
          '<div class="ch-status"><span class="turn-side"><i class="cc-turn-dot"></i><span id="ch-turn-text">' + util.escapeHtml(armyWhite) + ' · 你</span></span><span id="ch-right-status">第 1 手</span></div>' +
          '<div class="ch-board-wrap" id="ch-board-wrap">' +
            '<div class="ch-file top">' + filesHtml + "</div>" +
            '<div class="ch-file bottom">' + filesHtml + "</div>" +
            '<div class="ch-rank left">' + ranksHtml + "</div>" +
            '<div class="ch-rank right">' + ranksHtml + "</div>" +
            '<div class="ch-board" id="ch-board"></div>' +
          "</div>" +
        "</div>" +
        '<aside class="ch-side">' +
          '<div class="ch-player" id="ch-black-row">' +
            '<div class="ch-avatar black">♚</div>' +
            '<div class="ch-player-info"><strong>' + util.escapeHtml(armyBlack) + ' · ' + (playerSide === BLACK ? "你" : "电脑") + '</strong><small id="ch-sub-black">' + util.escapeHtml(armyBlack) + ' · ' + (firstTurn === BLACK ? "先行" : "后行") + '</small>' +
              '<div class="ch-captured" id="ch-cap-by-black"></div></div>' +
          "</div>" +
          '<div class="ch-moves-panel"><div class="ch-moves-head"><span>棋谱</span><span id="ch-move-count">0 步</span></div><div class="ch-moves" id="ch-moves"></div></div>' +
          '<div class="ch-player" id="ch-white-row">' +
            '<div class="ch-avatar white">♚</div>' +
            '<div class="ch-player-info"><strong>' + util.escapeHtml(armyWhite) + ' · ' + (playerSide === WHITE ? "你" : "电脑") + '</strong><small id="ch-sub-white">' + util.escapeHtml(armyWhite) + ' · ' + (firstTurn === WHITE ? "先行" : "后行") + '</small>' +
              '<div class="ch-captured" id="ch-cap-by-white"></div></div>' +
          "</div>" +
          '<div class="ch-piece-card" id="ch-piece-card">' +
            '<div class="ch-piece-card-glyph" id="ch-piece-glyph">?</div>' +
            '<div class="ch-piece-card-info"><strong id="ch-piece-name">棋子详情</strong><small id="ch-piece-sub">点一枚棋子查看名称</small></div>' +
          "</div>" +
          '<div class="ch-actions">' +
            '<button class="mini-btn" data-ch="restart">新局</button>' +
            '<button class="mini-btn" data-ch="undo" id="ch-undo">悔棋</button>' +
            '<button class="mini-btn danger" data-ch="resign" id="ch-resign">认输</button>' +
            '<button class="mini-btn" data-ch="help">规则</button>' +
          "</div>" +
          '<p class="ch-tip"><b>走子：</b>点棋子，再点落点。<br><b>特殊：</b>王车易位点王再点 g/c 线；兵到底线会升变；吃过路兵已开启。</p>' +
        "</aside>" +
      "</div>";

    boardEl = root.querySelector("#ch-board");
    boardWrap = root.querySelector("#ch-board-wrap");
    statusEl = root.querySelector(".ch-status");
    turnText = root.querySelector("#ch-turn-text");
    turnDot = statusEl.querySelector(".cc-turn-dot");
    rightStatus = root.querySelector("#ch-right-status");
    blackRow = root.querySelector("#ch-black-row");
    redRow = root.querySelector("#ch-white-row");
    blackSub = root.querySelector("#ch-sub-black");
    whiteSub = root.querySelector("#ch-sub-white");
    capByWhite = root.querySelector("#ch-cap-by-white");
    capByBlack = root.querySelector("#ch-cap-by-black");
    movesEl = root.querySelector("#ch-moves");
    undoBtn = root.querySelector("#ch-undo");
    resignBtn = root.querySelector("#ch-resign");
    const pieceCardEl = root.querySelector("#ch-piece-card");
    const pieceGlyphEl = root.querySelector("#ch-piece-glyph");
    const pieceNameEl = root.querySelector("#ch-piece-name");
    const pieceSubEl = root.querySelector("#ch-piece-sub");

    boardEl.innerHTML = Array.from({ length: 64 }, (_, view) => {
      const actual = flipped ? 63 - view : view;
      const cls = (rowOf(view) + colOf(view)) % 2 === 0 ? "light" : "dark";
      return '<div class="ch-sq ' + cls + '" data-sq="' + actual + '" data-view="' + view + '"></div>';
    }).join("");
    squareEls = Array.from(boardEl.children);

    /* ---------- 展示 ---------- */
    function renderBoard() {
      const checked = !state.over && isChecked(state, state.turn) ? state.kp[state.turn] : -1;
      const targetSet = new Map();
      for (const mv of state.targets) targetSet.set(mv.to, true);
      for (let view = 0; view < 64; view++) {
        const sq = squareEls[view];
        const i = +sq.dataset.sq;
        const actualRow = rowOf(i);
        const zone = actualRow >= 5 ? "zone-white" : actualRow <= 2 ? "zone-black" : "zone-middle";
        let cls = "ch-sq " + zone + " " + ((rowOf(view) + colOf(view)) % 2 === 0 ? "light" : "dark");
        if (state.selected === i) cls += " selected";
        if (state.lastMove && (state.lastMove.from === i || state.lastMove.to === i)) cls += " last";
        if (checked === i) cls += " check";
        let html = "";
        const p = state.board[i];
        if (p) html += artGlyph(p, state.ids[i]);
        if (targetSet.has(i)) {
          html += '<span class="' + (p ? "ring" : "dot") + '"></span>';
        }
        sq.className = cls;
        sq.innerHTML = html;
      }
    }

    function updateMoves() {
      const rows = [];
      for (let i = 0; i < state.plies.length; i += 2) {
        const no = i / 2 + 1;
        const a = state.plies[i] || "";
        const b = state.plies[i + 1] || "";
        const latestA = i === state.plies.length - 1 ? " latest" : "";
        const latestB = i + 1 === state.plies.length - 1 ? " latest" : "";
        rows.push('<div class="ch-move-row"><span class="no">' + no + '.</span><span class="' + latestA + '">' + a + "</span><span class=\"" + latestB + '">' + b + "</span></div>");
      }
      movesEl.innerHTML = rows.join("");
      movesEl.scrollTop = movesEl.scrollHeight;
      root.querySelector("#ch-move-count").textContent = state.plies.length + " 步";
    }

    function updateCaptured() {
      const initial = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 };
      const now = { 1: {}, [-1]: {} };
      for (const s of [WHITE, BLACK]) for (const t of [1, 2, 3, 4, 5, 6]) now[s][t] = 0;
      for (const p of state.board) {
        if (p) now[p > 0 ? WHITE : BLACK][Math.abs(p)]++;
      }
      function htmlFor(side) {
        let h = "", n = 0;
        for (const t of [5, 4, 3, 2, 1]) {
          const missing = Math.max(0, initial[t] - now[side][t]);
          for (let k = 0; k < missing; k++) {
            h += "<span class=\"" + (side === BLACK ? "b" : "") + '">' + GLYPH[t] + "</span>";
            n++;
          }
        }
        return { h, n };
      }
      const byWhite = htmlFor(BLACK);
      const byBlack = htmlFor(WHITE);
      capByWhite.innerHTML = byWhite.h;
      capByBlack.innerHTML = byBlack.h;
      const matWhite = materialOf(WHITE, now);
      const matBlack = materialOf(BLACK, now);
      const diff = matWhite - matBlack;
      root.querySelector("#ch-sub-white").textContent = armyWhite + (state.firstTurn === WHITE ? " · 先行" : " · 后行") + (diff > 0 ? " · 子力 +" + diff : "");
      root.querySelector("#ch-sub-black").textContent = armyBlack + (state.firstTurn === BLACK ? " · 先行" : " · 后行") + (diff < 0 ? " · 子力 +" + (-diff) : "");
    }
    function materialOf(side, now) {
      let s = 0;
      for (const t of [1, 2, 3, 4, 5]) s += now[side][t] * VAL[t];
      return s;
    }

    function updateStatus() {
      const checked = !state.over && isChecked(state, state.turn);
      turnDot.className = "cc-turn-dot" + (state.turn === BLACK ? " black" : "");
      let left, right;
      if (state.over) {
        left = state.result && state.result.winner === "white" ? armyWhite + "胜" : state.result && state.result.winner === "black" ? armyBlack + "胜" : "和棋";
        right = state.result ? state.result.reason : "对局结束";
      } else if (state.thinking) {
        left = (aiSide === WHITE ? armyWhite : armyBlack) + " · 电脑";
        right = '<span class="cc-thinking">思考中<span class="dots"><i></i><i></i><i></i></span></span>';
      } else {
        left = (state.turn === WHITE ? armyWhite : armyBlack) + (state.turn === playerSide ? " · 你" : " · 电脑");
        right = checked ? '<span class="cc-check-flag">将军！</span>' : (state.turn === playerSide ? "轮到你走" : "电脑回合");
      }
      turnText.textContent = left;
      if (typeof right === "string" && right.indexOf("<") === 0) rightStatus.innerHTML = right;
      else rightStatus.textContent = right;
      blackRow.classList.toggle("active", !state.over && state.turn === BLACK);
      redRow.classList.toggle("active", !state.over && state.turn === WHITE);
      if (blackSub) blackSub.textContent = armyBlack + " · " + (state.firstTurn === BLACK ? "先行" : "后行");
      if (whiteSub) whiteSub.textContent = armyWhite + " · " + (state.firstTurn === WHITE ? "先行" : "后行");
      undoBtn.disabled = state.history.length === 0 || state.thinking || state.over;
      resignBtn.disabled = state.over;
      if (state.over) api.setStatus("对局结束 · " + left);
      else if (state.thinking) api.setStatus((aiSide === WHITE ? armyWhite : armyBlack) + "正在思考…");
      else api.setStatus((state.turn === WHITE ? armyWhite : armyBlack) + " · 第 " + state.fullmove + " 回合");
    }

    function refresh() {
      renderBoard();
      updateMoves();
      updateCaptured();
      updateStatus();
      updatePieceCard();
    }

    function updatePieceCard() {
      if (!pieceCardEl) return;
      const i = state.selected;
      if (i < 0 || !state.board[i]) {
        pieceCardEl.classList.add("empty");
        pieceGlyphEl.textContent = "?";
        pieceNameEl.textContent = "棋子详情";
        pieceSubEl.textContent = "点一枚棋子查看名称";
        return;
      }
      const p = state.board[i];
      const side = p > 0 ? "white" : "black";
      const parts = state.ids[i] ? String(state.ids[i]).split("-") : [];
      const slot = +parts[2] || 1;
      const slotText = db.slotLabel(Math.abs(p), slot, side);
      pieceCardEl.classList.remove("empty");
      const faction = state.factions[side];
      const cardArt = db.chessArt(side, Math.abs(p), slot, faction);
      pieceGlyphEl.innerHTML = cardArt
        ? '<img src="img/chess/art/' + cardArt + '.png" alt="">'
        : GLYPH[Math.abs(p)];
      pieceNameEl.textContent = db.chessName(side, Math.abs(p), slot, faction);
      pieceSubEl.textContent = (side === "white" ? armyWhite : armyBlack) + " · " + (CHESS_LABEL[Math.abs(p)] || "棋子") +
        (slotText ? " · " + slotText : "") + " · " + (p > 0 ? "白棋" : "黑棋");
    }

    /* ---------- 流程 ---------- */
    function snapshot() {
      return {
        board: state.board.slice(),
        ids: state.ids.slice(),
        turn: state.turn,
        castling: state.castling,
        ep: state.ep,
        halfmove: state.halfmove,
        fullmove: state.fullmove,
        kp: Object.assign({}, state.kp),
        lastMove: state.lastMove ? Object.assign({}, state.lastMove) : null,
        pliesLength: state.plies.length,
        keysLength: state.keys.length
      };
    }

    function removeOverlay() {
      if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    }
    function removeHelp() {
      if (helpEl) { helpEl.remove(); helpEl = null; }
    }

    function notate(mv, piece, cap) {
      if (mv.flag === "ck") return "O-O";
      if (mv.flag === "cq") return "O-O-O";
      let s = sqName(mv.from) + (cap ? "x" : "-") + sqName(mv.to);
      if (mv.flag === "ep") s += " e.p.";
      if (mv.promo) s += "=" + (LETTER[mv.promo] || "Q");
      return s;
    }

    function commitMove(mv, isPlayer) {
      const piece = state.board[mv.from];
      const cap = state.board[mv.to];
      const movingId = state.ids[mv.from];
      const sideKey = piece > 0 ? "white" : "black";
      makeMove(state, mv);
      state.ids[mv.to] = movingId;
      state.ids[mv.from] = null;
      if (mv.flag === "ep") state.ids[mv.to + (piece > 0 ? 8 : -8)] = null;
      if (mv.flag === "ck" || mv.flag === "cq") {
        const rookFrom = mv.to + (mv.flag === "ck" ? 1 : -2);
        const rookTo = mv.to + (mv.flag === "ck" ? -1 : 1);
        state.ids[rookTo] = state.ids[rookFrom];
        state.ids[rookFrom] = null;
      }
      if (mv.promo) state.ids[mv.to] = sideKey + "-" + mv.promo + "-1";
      state.lastMove = { from: mv.from, to: mv.to };
      state.selected = -1;
      state.targets = [];
      const chk = isChecked(state, state.turn);
      let notation = notate(mv, piece, cap);
      if (chk) notation += "+";
      state.plies.push(notation);
      state.keys.push(posKey());
      state.rep.set(state.keys[state.keys.length - 1], (state.rep.get(state.keys[state.keys.length - 1]) || 0) + 1);
      audio.sfx(cap || mv.flag === "ep" ? "capture" : "place");
      afterMove(isPlayer ? playerSide : aiSide);
    }

    function playerCommit(mv) {
      if (state.thinking || state.over || state.paused || state.turn !== playerSide) return;
      state.history.push(snapshot());
      commitMove(mv, true);
    }

    function afterMove(mover) {
      const side = state.turn;
      const moves = legalMoves(state, side);
      if (!moves.length) {
        // 以“无子可动的一方”判负，避免将军状态被误判成和棋
        if (isChecked(state, side)) finish(side === WHITE ? "black" : "white", "将杀");
        else finish("draw", "逼和 · 无子可动");
        return;
      }
      if (state.halfmove >= 100) { finish("draw", "五十回合无吃子、无兵动"); return; }
      if (hasInsufficientMaterial(state.board)) { finish("draw", "子力不足，无法将杀"); return; }
      const key = state.keys[state.keys.length - 1];
      if ((state.rep.get(key) || 0) >= 3) { finish("draw", "三次重复局面"); return; }
      if (isChecked(state, side)) {
        audio.sfx("check");
        toast("将军！", "bad");
      }
      refresh();
      if (side === aiSide) scheduleAI();
    }

    function scheduleAI() {
      if (state.over || state.paused || !state.alive) return;
      state.thinking = true;
      updateStatus();
      clearTimeout(aiTimer);
      aiTimer = setTimeout(() => {
        if (!state.alive) return;
        if (state.paused) { state.thinking = false; resumeAI = true; updateStatus(); return; }
        requestAnimationFrame(() => {
          if (!state.alive || state.over || state.paused) { state.thinking = false; updateStatus(); return; }
          const side = aiSide;
          const settle = mv => {
            if (!state.alive || state.over || state.paused || state.turn !== side) { state.thinking = false; updateStatus(); return; }
            state.thinking = false;
            if (!mv) {
              if (isChecked(state, aiSide)) finish(aiSide === BLACK ? "white" : "black", "将杀");
              else finish("draw", "逼和 · 无子可动");
              return;
            }
            commitMove(mv, false);
          };
          const localFallback = () => settle(searchBest(state, aiSide, settings.get("ai")));
          const jsFallback = () => {
            try {
              if (global.JSChessAI && global.JSChessAI.available()) {
                const uci = global.JSChessAI.bestMove(toFen(state), settings.get("ai"));
                const mv = uci ? uciToMove(uci, state) : null;
                if (mv) { settle(mv); return; }
              }
            } catch (err) { /* fall through */ }
            localFallback();
          };
          const canStockfish = global.StockfishAI && location.protocol !== "file:";
          if (canStockfish) {
            global.StockfishAI.bestMove(toFen(state), stockfishMillis(settings.get("ai")), settings.get("ai"))
              .then(uci => {
                const mv = uciToMove(uci, state);
                if (mv) settle(mv); else jsFallback();
              })
              .catch(jsFallback);
          } else {
            jsFallback();
          }
        });
      }, 80);
    }

    function selectSquare(i) {
      const p = state.board[i];
      if (!p || (p > 0) !== (state.turn === WHITE) || state.turn !== playerSide) return;
      state.selected = i;
      const all = legalMoves(state, state.turn);
      state.targets = all.filter(mv => mv.from === i);
      audio.sfx("select");
      renderBoard();
      updateStatus();
      updatePieceCard();
    }

    function clearSelection() {
      state.selected = -1;
      state.targets = [];
      renderBoard();
      updateStatus();
      updatePieceCard();
    }

    function onBoardClick(e) {
      if (state.thinking || state.over || state.paused || state.turn !== playerSide || state.promoting) return;
      const sq = e.target.closest(".ch-sq");
      if (!sq) return;
      const i = +sq.dataset.sq;
      if (state.selected >= 0) {
        const matches = state.targets.filter(mv => mv.to === i);
        if (matches.length) {
          if (matches.length > 1) showPromotion(matches);
          else playerCommit(matches[0]);
          return;
        }
      }
      const p = state.board[i];
      if (p && (p > 0) === (state.turn === WHITE) && state.turn === playerSide) selectSquare(i);
      else clearSelection();
    }

    function showPromotion(moves) {
      state.promoting = moves;
      removePromo();
      const el = document.createElement("div");
      el.className = "ch-promo";
      el.id = "ch-promo";
      const order = [5, 4, 3, 2];
      el.innerHTML = '<div class="ch-promo-card"><h4>选择升变棋子</h4><div class="ch-promo-btns">' +
        order.map(t => '<button data-promo="' + t + '" aria-label="升变为' + LETTER[t] + '">' + GLYPH[t] + "</button>").join("") +
        '</div><button class="mini-btn" data-promo-cancel style="margin-top:12px;width:100%">取消</button></div>';
      boardWrap.appendChild(el);
      el.addEventListener("click", ev => {
        if (ev.target.closest("[data-promo-cancel]")) { removePromo(); clearSelection(); return; }
        const btn = ev.target.closest("[data-promo]");
        if (!btn) return;
        const t = +btn.dataset.promo;
        const mv = moves.find(m => m.promo === t);
        removePromo();
        if (mv) playerCommit(mv);
      });
    }
    function removePromo() {
      state.promoting = null;
      const el = boardWrap.querySelector("#ch-promo");
      if (el) el.remove();
    }

    function finish(winner, reason) {
      if (state.over) return;
      state.over = true;
      state.thinking = false;
      state.result = { winner, reason };
      clearTimeout(aiTimer);
      aiTimer = 0;
      const stats = storage.get(YZ.KEY.chess, { wins: 0, losses: 0, draws: 0 });
      stats.wins = stats.wins || 0; stats.losses = stats.losses || 0; stats.draws = stats.draws || 0;
      const playerWon = (winner === "white" && playerSide === WHITE) || (winner === "black" && playerSide === BLACK);
      const aiWon = (winner === "white" && aiSide === WHITE) || (winner === "black" && aiSide === BLACK);
      if (playerWon) stats.wins++;
      else if (aiWon) stats.losses++;
      else stats.draws++;
      storage.set(YZ.KEY.chess, stats);
      removePromo();
      refresh();
      audio.sfx(playerWon ? "win" : aiWon ? "lose" : "pop");
      if (playerWon && YZ.achievements) YZ.achievements.unlock("chess-" + (settings.get("ai") || "normal"));
      const title = playerWon ? "你赢了" : aiWon ? "你输了" : "和棋";
      removeOverlay();
      const el = document.createElement("div");
      el.className = "game-overlay";
      el.innerHTML = '<div class="overlay-card"><p class="kicker">GAME OVER</p><h3>' + title + "</h3>" +
        '<p class="ov-sub">' + reason + "。<br>共走了 " + state.plies.length + " 步。</p>" +
        '<div class="ov-stats"><div><span>胜</span><strong>' + stats.wins + "</strong></div><div><span>负</span><strong>" + stats.losses +
        "</strong></div><div><span>和</span><strong>" + stats.draws + "</strong></div></div>" +
        '<div class="ov-actions"><button class="btn primary" data-ov="again">再来一局</button>' +
        '<button class="btn" data-ov="look">看看棋盘</button>' +
        '<button class="btn ghost" data-ov="exit">返回主页</button></div></div>';
      root.appendChild(el);
      overlayEl = el;
      el.querySelector('[data-ov="again"]').addEventListener("click", restart);
      el.querySelector('[data-ov="look"]').addEventListener("click", removeOverlay);
      el.querySelector('[data-ov="exit"]').addEventListener("click", api.onExit);
    }

    function undo() {
      if (state.thinking || state.over || !state.history.length || state.paused) return;
      clearTimeout(aiTimer);
      aiTimer = 0;
      resumeAI = false;
      const s = state.history.pop();
      state.board = s.board;
      state.ids = s.ids;
      state.turn = s.turn;
      state.castling = s.castling;
      state.ep = s.ep;
      state.halfmove = s.halfmove;
      state.fullmove = s.fullmove;
      state.kp = s.kp;
      state.lastMove = s.lastMove;
      state.plies.length = s.pliesLength;
      state.keys.length = s.keysLength;
      rebuildRep();
      state.selected = -1;
      state.targets = [];
      state.over = false;
      state.result = null;
      state.thinking = false;
      state.promoting = null;
      removePromo();
      removeOverlay();
      refresh();
      audio.sfx("pop");
      toast("悔棋成功，轮到你走", "gold");
    }

    function restart() {
      state.board = Int8Array.from(START);
      state.ids = initialIds(state.board);
      state.firstTurn = Math.random() < 0.5 ? WHITE : BLACK;
      state.turn = state.firstTurn;
      state.castling = CST.WK | CST.WQ | CST.BK | CST.BQ;
      state.ep = -1;
      state.halfmove = 0;
      state.fullmove = 1;
      state.kp = { 1: 60, [-1]: 4 };
      state.selected = -1;
      state.targets = [];
      state.lastMove = null;
      state.over = false;
      state.result = null;
      state.thinking = false;
      state.history = [];
      state.plies = [];
      state.paused = false;
      state.alive = true;
      state.promoting = null;
      clearTimeout(aiTimer);
      aiTimer = 0;
      resumeAI = false;
      armedResign = false;
      resignBtn.textContent = "认输";
      clearTimeout(resignTimer);
      resetRep();
      removeOverlay();
      removeHelp();
      removePromo();
      refresh();
      if (state.turn === aiSide) scheduleAI();
    }

    function resign() {
      if (state.over || state.thinking) return;
      if (!armedResign) {
        armedResign = true;
        resignBtn.textContent = "再点一次";
        clearTimeout(resignTimer);
        resignTimer = setTimeout(() => { armedResign = false; resignBtn.textContent = "认输"; }, 2600);
        return;
      }
      armedResign = false;
      resignBtn.textContent = "认输";
      finish(playerSide === WHITE ? "black" : "white", "你认输了");
    }

    function showHelp() {
      if (helpEl) return;
      const el = document.createElement("div");
      el.className = "game-overlay";
      el.innerHTML = '<div class="overlay-card" style="text-align:left"><p class="kicker">HOW TO PLAY</p>' +
        '<h3 style="font-size:30px">混沌乱战小抄</h3>' +
        '<p class="ov-sub" style="text-align:left;line-height:2">' +
        "· 兵向前一步，第一次可以走两格；斜着吃子。<br>" +
        "· 马走日，象走斜线，车走直线，后横竖斜都行。<br>" +
        "· 兵走到对方底线，可以在后、车、象、马中升变。<br>" +
        "· 王车易位：点王，再点 g 线（短易位）或 c 线（长易位）。<br>" +
        "· 吃过路兵：对方兵刚走两格时，可以立刻斜吃。<br>" +
        "· 被将军必须应将；无子可动且被将军就是将杀。" +
        "</p><div class=\"ov-actions\"><button class=\"btn primary\" data-help-close>知道了</button></div></div>";
      root.appendChild(el);
      helpEl = el;
      el.addEventListener("click", ev => {
        if (ev.target === el || ev.target.closest("[data-help-close]")) removeHelp();
      });
    }

    /* ---------- 绑定 ---------- */
    boardEl.addEventListener("click", onBoardClick);
    root.querySelectorAll("[data-ch]").forEach(btn => {
      btn.addEventListener("click", () => {
        const a = btn.dataset.ch;
        if (a === "restart") restart();
        else if (a === "undo") undo();
        else if (a === "resign") resign();
        else if (a === "help") showHelp();
      });
    });
    root.addEventListener("pointerdown", () => audio.unlock(), { once: true });

    resetRep();
    refresh();
    if (state.turn === aiSide) scheduleAI();

    const handle = {
      destroy() {
        state.alive = false;
        clearTimeout(aiTimer);
        clearTimeout(resignTimer);
        removeOverlay();
        removeHelp();
        removePromo();
      },
      pause() {
        state.paused = true;
        if (aiTimer) {
          clearTimeout(aiTimer);
          aiTimer = 0;
          state.thinking = false;
          resumeAI = true;
          updateStatus();
        }
      },
      resume() {
        state.paused = false;
        if (resumeAI) { resumeAI = false; scheduleAI(); }
      },
      restart,
      isOver() { return state.over; },
      escape() {
        if (state.promoting) { removePromo(); clearSelection(); return true; }
        if (helpEl) { removeHelp(); return true; }
        if (overlayEl) { removeOverlay(); return true; }
        return false;
      }
    };
    try {
      if (new URLSearchParams(location.search).has("debug")) {
        handle._debug = { state, refresh, resetRep, playerCommit, showPromotion };
      }
    } catch (e) { /* ignore */ }
    return handle;
  }

  YZ.games.chess = {
    id: "chess",
    no: "02",
    kicker: "对弈 · CHESS",
    title: "混沌乱战",
    subtitle: "女神军 vs 邪神军",
    desc: "标准规则全部到位：易位、吃过路兵、兵升变。每局抛硬币随机先手，和执白/执黑无关；棋子用象棋角色去底座立绘分人。",
    emblem: '<img src="img/chess/art/goddess/King.png" alt="混沌乱战">',
    mount,
    cardStat() {
      const s = storage.get(YZ.KEY.chess, null);
      if (!s || (!s.wins && !s.losses && !s.draws)) return "尚无战绩 · 你先来";
      return "战绩 " + (s.wins || 0) + "胜 " + (s.losses || 0) + "负" + (s.draws ? " " + s.draws + "和" : "");
    }
  };

  // 调试用的 perft（仅在 ?debug=1 时挂出）
  try {
    if (new URLSearchParams(location.search).has("debug")) {
      YZ.games.chess._test = {
        START,
        makeState() {
          return {
            board: Int8Array.from(START), turn: WHITE,
            castling: CST.WK | CST.WQ | CST.BK | CST.BQ,
            ep: -1, halfmove: 0, fullmove: 1, kp: { 1: 60, [-1]: 4 }
          };
        },
        legalMoves,
        perft(depth) {
          const g = this.makeState();
          function go(d) {
            if (d === 0) return 1;
            const moves = legalMoves(g, g.turn);
            let n = 0;
            for (const mv of moves) {
              const u = makeMove(g, mv);
              n += go(d - 1);
              unmakeMove(g, mv, u);
            }
            return n;
          }
          return go(depth);
        }
      };
    }
  } catch (e) { /* ignore */ }
})(window);
