/* ============================================================
   圣魔大战 · 女神军 vs 邪神军
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const { util, storage, settings, audio, toast } = YZ;
  const db = YZ.pieceDB;

  const RED = 1, BLACK = -1;
  const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
  const INF = 1e9, MATE = 1e7;

  const RED_NAME = { 1: "帅", 2: "仕", 3: "相", 4: "马", 5: "车", 6: "炮", 7: "兵" };
  const BLACK_NAME = { 1: "将", 2: "士", 3: "象", 4: "马", 5: "车", 6: "炮", 7: "卒" };
  const TYPE_NAME = { 1: "主帅", 2: "近卫", 3: "象卫", 4: "轻骑", 5: "战车", 6: "火炮", 7: "步卒" };
  const VAL = { 1: 10000, 2: 240, 3: 240, 4: 440, 5: 940, 6: 500, 7: 110 };

  const CODE_ACCENT = { 1: "#ff7ab0", 2: "#74b8ff", 3: "#64d6a2", 4: "#b38cf0", 5: "#f0a34a", 6: "#ff7b7b", 7: "#5fd0d8" };
  const idx = (r, c) => r * 9 + c;
  const inBoard = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
  const sideOf = p => (p > 0 ? RED : BLACK);
  const charOf = p => (p > 0 ? RED_NAME[Math.abs(p)] : BLACK_NAME[Math.abs(p)]);

  /* ---------------- 棋盘与走法 ---------------- */
  function initialBoard() {
    const b = new Int8Array(90);
    const back = [R, N, B, A, K, A, B, N, R];
    for (let c = 0; c < 9; c++) {
      b[idx(0, c)] = -back[c];
      b[idx(9, c)] = back[c];
    }
    b[idx(2, 1)] = -C; b[idx(2, 7)] = -C;
    b[idx(7, 1)] = C; b[idx(7, 7)] = C;
    for (const c of [0, 2, 4, 6, 8]) {
      b[idx(3, c)] = -P;
      b[idx(6, c)] = P;
    }
    return b;
  }
  const INITIAL_KP = { 1: idx(9, 4), [-1]: idx(0, 4) };

  function initialIds(board) {
    const ids = new Array(90).fill(null);
    const counts = { red: {}, black: {} };
    for (let i = 0; i < 90; i++) {
      const p = board[i];
      if (!p) continue;
      const side = p > 0 ? "red" : "black";
      const t = Math.abs(p);
      const slot = (counts[side][t] || 0) + 1;
      counts[side][t] = slot;
      ids[i] = side + "-" + t + "-" + slot;
    }
    return ids;
  }

  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const HORSE = [
    [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
    [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]
  ];
  const inPalace = (r, c, side) => c >= 3 && c <= 5 && (side === RED ? r >= 7 && r <= 9 : r >= 0 && r <= 2);

  function genPseudo(b, side, capturesOnly) {
    const moves = [];
    for (let from = 0; from < 90; from++) {
      const p = b[from];
      if (!p || sideOf(p) !== side) continue;
      const t = Math.abs(p);
      const r = (from / 9) | 0, c = from % 9;
      const add = to => {
        const q = b[to];
        if (q * side > 0) return;
        if (capturesOnly && !q) return;
        moves.push((from << 8) | to);
      };

      if (t === K) {
        for (const [dr, dc] of ORTHO) {
          const nr = r + dr, nc = c + dc;
          if (inBoard(nr, nc) && inPalace(nr, nc, side)) add(idx(nr, nc));
        }
      } else if (t === A) {
        for (const [dr, dc] of DIAG) {
          const nr = r + dr, nc = c + dc;
          if (inBoard(nr, nc) && inPalace(nr, nc, side)) add(idx(nr, nc));
        }
      } else if (t === B) {
        for (const [dr, dc] of DIAG) {
          const nr = r + dr * 2, nc = c + dc * 2;
          if (!inBoard(nr, nc)) continue;
          if (side === RED ? nr < 5 : nr > 4) continue;
          if (b[idx(r + dr, c + dc)] !== 0) continue;
          add(idx(nr, nc));
        }
      } else if (t === N) {
        for (const [dr, dc, lr, lc] of HORSE) {
          const nr = r + dr, nc = c + dc;
          if (!inBoard(nr, nc)) continue;
          if (b[idx(r + lr, c + lc)] !== 0) continue;
          add(idx(nr, nc));
        }
      } else if (t === R) {
        for (const [dr, dc] of ORTHO) {
          let nr = r + dr, nc = c + dc;
          while (inBoard(nr, nc)) {
            const q = b[idx(nr, nc)];
            if (!q) {
              if (!capturesOnly) moves.push((from << 8) | idx(nr, nc));
            } else {
              if (q * side < 0) moves.push((from << 8) | idx(nr, nc));
              break;
            }
            nr += dr; nc += dc;
          }
        }
      } else if (t === C) {
        for (const [dr, dc] of ORTHO) {
          let nr = r + dr, nc = c + dc, screen = false;
          while (inBoard(nr, nc)) {
            const q = b[idx(nr, nc)];
            if (!screen) {
              if (!q) {
                if (!capturesOnly) moves.push((from << 8) | idx(nr, nc));
              } else {
                screen = true;
              }
            } else if (q) {
              if (q * side < 0) moves.push((from << 8) | idx(nr, nc));
              break;
            }
            nr += dr; nc += dc;
          }
        }
      } else if (t === P) {
        const dr = side === RED ? -1 : 1;
        if (inBoard(r + dr, c)) add(idx(r + dr, c));
        const crossed = side === RED ? r <= 4 : r >= 5;
        if (crossed) {
          if (c > 0) add(idx(r, c - 1));
          if (c < 8) add(idx(r, c + 1));
        }
      }
    }
    return moves;
  }

  function isAttacked(b, kp, sq, by) {
    const r = (sq / 9) | 0, c = sq % 9;
    // 车 / 将帅照面 / 炮
    for (const [dr, dc] of ORTHO) {
      let nr = r + dr, nc = c + dc, first = false, dist = 1;
      while (inBoard(nr, nc)) {
        const p = b[idx(nr, nc)];
        if (p) {
          if (!first) {
            if (sideOf(p) === by) {
              const t = Math.abs(p);
              if (t === R) return true;
              if (t === K && (dc === 0 || dist === 1)) return true;
            }
            first = true;
          } else {
            if (sideOf(p) === by && Math.abs(p) === C) return true;
            break;
          }
        }
        nr += dr; nc += dc; dist++;
      }
    }
    // 马
    for (const [kr, kc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      const nr = r + kr, nc = c + kc;
      if (!inBoard(nr, nc)) continue;
      const p = b[idx(nr, nc)];
      if (!p || sideOf(p) !== by || Math.abs(p) !== N) continue;
      const dr = r - nr, dc2 = c - nc;
      const lr = nr + (Math.abs(dr) === 2 ? Math.sign(dr) : 0);
      const lc = nc + (Math.abs(dc2) === 2 ? Math.sign(dc2) : 0);
      if (b[idx(lr, lc)] === 0) return true;
    }
    // 兵 / 卒
    if (by === RED) {
      if (r + 1 < 10 && b[idx(r + 1, c)] === P) return true;
      if (r <= 4) {
        if (c > 0 && b[idx(r, c - 1)] === P) return true;
        if (c < 8 && b[idx(r, c + 1)] === P) return true;
      }
    } else {
      if (r - 1 >= 0 && b[idx(r - 1, c)] === -P) return true;
      if (r >= 5) {
        if (c > 0 && b[idx(r, c - 1)] === -P) return true;
        if (c < 8 && b[idx(r, c + 1)] === -P) return true;
      }
    }
    return false;
  }

  const isChecked = (b, kp, side) => {
    const sq = kp[side];
    if (sq === undefined || sq < 0) return true;
    return isAttacked(b, kp, sq, -side);
  };

  function makeMove(b, kp, mv) {
    const from = mv >> 8, to = mv & 255;
    const p = b[from], cap = b[to];
    const side = sideOf(p);
    const oldKing = kp[side];
    b[to] = p;
    b[from] = 0;
    if (Math.abs(p) === K) kp[side] = to;
    return { cap, oldKing, side };
  }

  function unmakeMove(b, kp, mv, u) {
    const from = mv >> 8, to = mv & 255;
    b[from] = b[to];
    b[to] = u.cap;
    kp[u.side] = u.oldKing;
  }

  function legalMoves(b, kp, side) {
    const out = [];
    for (const mv of genPseudo(b, side, false)) {
      const u = makeMove(b, kp, mv);
      if (!isChecked(b, kp, side)) out.push(mv);
      unmakeMove(b, kp, mv, u);
    }
    return out;
  }

  function posBonus(t, side, r, c) {
    switch (t) {
      case P: {
        const adv = side === RED ? 6 - r : r - 3;
        const crossed = side === RED ? r <= 4 : r >= 5;
        return adv * 9 + (crossed ? 24 : 0) + (c >= 3 && c <= 5 ? 8 : 0);
      }
      case N: return 16 - (Math.abs(c - 4) + Math.abs(r - 4.5)) * 3;
      case C: return (c === 4 ? 12 : 0) + (r >= 4 && r <= 5 ? 5 : 0);
      case R: return (c === 4 ? 7 : 0) + (r >= 4 && r <= 5 ? 4 : 0);
      case K: return side === RED ? (r >= 8 ? 8 : 0) : (r <= 1 ? 8 : 0);
      default: return 0;
    }
  }

  function evaluate(b, side) {
    let score = 0;
    const pawns = [], rooks = [], pawnFiles = { 1: new Array(9).fill(0), [-1]: new Array(9).fill(0) };
    const kings = {};
    for (let i = 0; i < 90; i++) {
      const p = b[i];
      if (!p) continue;
      const t = Math.abs(p), s = sideOf(p), r = (i / 9) | 0, c = i % 9;
      const v = VAL[t] + posBonus(t, s, r, c);
      score += s === RED ? v : -v;
      if (t === P) { pawns.push({ i, s }); pawnFiles[s][c]++; }
      if (t === R) rooks.push({ i, s });
      if (t === K) kings[s] = i;
    }
    /* 通路兵 */
    for (const { i, s } of pawns) {
      const r = (i / 9) | 0, c = i % 9;
      const dir = s === RED ? -1 : 1;
      let passed = true;
      for (let rr = r + dir; rr >= 0 && rr < 10; rr += dir) {
        for (let cc = Math.max(0, c - 1); cc <= Math.min(8, c + 1); cc++) {
          const q = b[rr * 9 + cc];
          if (q && Math.abs(q) === P && sideOf(q) !== s) { passed = false; break; }
        }
        if (!passed) break;
      }
      if (passed) {
        const adv = s === RED ? 9 - r : r;
        score += s * [0, 6, 12, 22, 36, 56, 82][Math.min(6, adv)] * 0.9;
      }
    }
    /* 车/炮的开放线 */
    for (const { i, s } of rooks) {
      const c = i % 9;
      const own = pawnFiles[s][c], enemy = pawnFiles[-s][c];
      if (!own) score += s * (enemy ? 8 : 16);
    }
    /* 王前守子 */
    for (const s of [1, -1]) {
      const k = kings[s];
      if (k === undefined) continue;
      const r = (k / 9) | 0, c = k % 9;
      let guard = 0;
      for (let rr = Math.max(0, r - 1); rr <= Math.min(9, r + 1); rr++) {
        for (let cc = Math.max(0, c - 1); cc <= Math.min(8, c + 1); cc++) {
          const q = b[rr * 9 + cc];
          if (q && sideOf(q) === s && (Math.abs(q) === A || Math.abs(q) === B)) guard++;
        }
      }
      score += s * Math.min(3, guard) * 6;
    }
    return side === RED ? score : -score;
  }

  /* ---------------- 电脑棋手 ---------------- */
  function searchBest(startBoard, startKp, side, difficulty) {
    if (global.XQWizardAI && global.XQWizardAI.available()) {
      const engineMove = global.XQWizardAI.search(startBoard, side, difficulty);
      if (engineMove) return engineMove;
    }
    const b = Int8Array.from(startBoard);
    const kp = { 1: startKp[1], [-1]: startKp[-1] };
    const maxDepth = difficulty === "easy" ? 1 : difficulty === "hard" ? 4 : 3;
    const timeLimit = difficulty === "easy" ? 220 : difficulty === "hard" ? 450 : 520;
    const margin = difficulty === "easy" ? 140 : difficulty === "normal" ? 42 : 0;
    const deadline = performance.now() + timeLimit;
    let nodes = 0, aborted = false;
    let orderMap = new Map();
    const killers = Array.from({ length: 64 }, () => []);
    const historyScore = new Map();

    function timeUp() {
      if ((nodes & 255) === 0 && performance.now() > deadline) aborted = true;
      return aborted;
    }
    function scoreMove(mv, ply) {
      const cap = b[mv & 255];
      let s = cap ? VAL[Math.abs(cap)] * 10 - VAL[Math.abs(b[mv >> 8])] : 0;
      if (killers[ply] && killers[ply].includes(mv)) s += 900;
      s += Math.min(220, historyScore.get(mv) || 0);
      return s;
    }
    function order(moves, ply) {
      moves.sort((a, c) => scoreMove(c, ply) - scoreMove(a, ply));
    }
    function quiesce(alpha, beta, s, ply, qd) {
      nodes++;
      if (timeUp()) return 0;
      const stand = evaluate(b, s);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (qd >= 3) return alpha;
      const caps = genPseudo(b, s, true);
      order(caps, ply);
      for (const mv of caps) {
        const u = makeMove(b, kp, mv);
        if (isChecked(b, kp, s)) { unmakeMove(b, kp, mv, u); continue; }
        const sc = -quiesce(-beta, -alpha, -s, ply + 1, qd + 1);
        unmakeMove(b, kp, mv, u);
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
        if (ply < 12 && isChecked(b, kp, s)) depth = 1;
        else return quiesce(alpha, beta, s, ply, 0);
      }
      const moves = legalMoves(b, kp, s);
      if (!moves.length) return -MATE + ply;
      order(moves, ply);
      let best = -INF;
      for (const mv of moves) {
        const wasCap = b[mv & 255];
        const u = makeMove(b, kp, mv);
        const sc = -negamax(depth - 1, -beta, -alpha, -s, ply + 1);
        unmakeMove(b, kp, mv, u);
        if (aborted) return 0;
        if (sc > best) best = sc;
        if (sc > alpha) alpha = sc;
        if (alpha >= beta) {
          if (!wasCap) {
            if (killers[ply] && !killers[ply].includes(mv)) killers[ply] = [mv, ...killers[ply].slice(0, 1)];
            historyScore.set(mv, (historyScore.get(mv) || 0) + depth * depth);
          }
          break;
        }
      }
      return best;
    }

    const rootMoves = legalMoves(b, kp, side);
    if (!rootMoves.length) return null;
    order(rootMoves, 0);
    let bestOverall = rootMoves[0];
    let lastScores = null;

    for (let depth = 1; depth <= maxDepth; depth++) {
      if (depth > 1) {
        rootMoves.sort((x, y) => (orderMap.get(y) || 0) - (orderMap.get(x) || 0));
      }
      let alpha = -INF, beta = INF, best = -INF, bestMove = null;
      const scores = [];
      for (const mv of rootMoves) {
        const u = makeMove(b, kp, mv);
        const sc = -negamax(depth - 1, -beta, -alpha, -side, 1);
        unmakeMove(b, kp, mv, u);
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
    const state = {
      board: initialBoard(),
      kingPos: Object.assign({}, INITIAL_KP),
      turn: RED,
      selected: -1,
      targets: [],
      lastMove: null,
      halfmove: 0,
      ply: 0,
      over: false,
      result: null,
      thinking: false,
      history: [],
      cardIdx: -1,
      paused: false,
      alive: true
    };
    state.ids = initialIds(state.board);
    const playerSide = api.startSide === "black" ? BLACK : RED;
    const aiSide = -playerSide;
    const flipped = playerSide === BLACK;
    state.playerSide = playerSide;
    state.aiSide = aiSide;
    let aiTimer = 0, resumeAI = false, resultEl = null, galleryEl = null, resignTimer = 0, armedResign = false;
    let boardEl, piecesEl, statusEl, cardEl, turnDot, turnText, rightStatus, blackRow, redRow, capByBlack, capByRed, undoBtn, resignBtn;
    const artMode = () => settings.get("pieces") === "art";
    const armyRed = db.army("cchess", "red");
    const armyBlack = db.army("cchess", "black");

    /* ---------- 棋盘绘制 ---------- */
    function svgBoard() {
      const X = c => 60 + c * 97.5;
      const Y = r => 150 + r * 87.7778;
      let s = '<svg class="cc-board-svg" viewBox="0 0 900 1000" preserveAspectRatio="none" aria-hidden="true">';
      s += '<rect x="26" y="26" width="848" height="948" rx="18" fill="none" stroke="rgba(232,194,100,.5)" stroke-width="2"/>';
      s += '<rect x="38" y="38" width="824" height="924" rx="12" fill="none" stroke="rgba(255,232,160,.55)" stroke-width="1.4"/>';
      s += '<g stroke="rgba(248,218,140,.6)" stroke-width="2.4" fill="none" stroke-linecap="square">';
      for (let r = 0; r < 10; r++) s += '<path d="M' + X(0) + " " + Y(r) + "H" + X(8) + '"/>';
      for (let c = 0; c < 9; c++) {
        s += '<path d="M' + X(c) + " " + Y(0) + "V" + Y(4) + '"/>';
        s += '<path d="M' + X(c) + " " + Y(5) + "V" + Y(9) + '"/>';
      }
      s += '<path d="M' + X(3) + " " + Y(0) + "L" + X(5) + " " + Y(2) + "M" + X(5) + " " + Y(0) + "L" + X(3) + " " + Y(2) + '"/>';
      s += '<path d="M' + X(3) + " " + Y(7) + "L" + X(5) + " " + Y(9) + "M" + X(5) + " " + Y(7) + "L" + X(3) + " " + Y(9) + '"/>';
      s += "</g>";
      s += '<g fill="rgba(244,203,97,.82)" font-family="STKaiti,KaiTi,serif" font-size="38" font-weight="700" letter-spacing="10" text-anchor="middle">';
      s += '<text x="450" y="548">塔尔塔洛斯</text>';
      s += "</g>";
      s += '<g stroke="rgba(248,218,140,.5)" stroke-width="2.2" fill="none" stroke-linecap="round">';
      let marks = "";
      const addMark = (c, r) => {
        const x = X(c), y = Y(r), gap = 9, len = 13;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          marks += "M" + (x + sx * gap) + " " + (y + sy * (gap + len)) +
            "L" + (x + sx * gap) + " " + (y + sy * gap) +
            "L" + (x + sx * (gap + len)) + " " + (y + sy * gap);
        }
      };
      for (const [c, r] of [[1, 2], [7, 2], [1, 7], [7, 7], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]]) addMark(c, r);
      s += '<path d="' + marks + '"/>';
      s += "</g>";
      s += "</svg>";
      return s;
    }

    const viewC = c => flipped ? 8 - c : c;
    const viewR = r => flipped ? 9 - r : r;
    const posLeft = c => ((60 + viewC(c) * 97.5) / 900 * 100) + "%";
    const posTop = r => ((150 + viewR(r) * 87.7778) / 1000 * 100) + "%";

    /* ---------- 布局 ---------- */
    root.innerHTML =
      '<div class="cc-layout">' +
        '<div class="cc-main">' +
          '<div class="cc-status" id="cc-status">' +
            '<span class="turn-side"><i class="cc-turn-dot"></i><span id="cc-turn-text">' + util.escapeHtml(armyRed) + ' · 你</span></span>' +
            '<span id="cc-right-status">第 1 手</span>' +
          '</div>' +
          '<div class="cc-board-wrap"><div class="cc-board" id="cc-board">' + svgBoard() +
            '<div class="cc-pieces" id="cc-pieces"></div></div></div>' +
        '</div>' +
        '<aside class="cc-side">' +
          '<div class="cc-player" id="cc-black-row">' +
            '<div class="cc-avatar black"><img src="img/Cchess/face/bk.png" alt="' + util.escapeHtml(armyBlack) + '"></div>' +
            '<div class="cc-player-info"><strong>' + util.escapeHtml(armyBlack) + ' · ' + (playerSide === BLACK ? "你" : "电脑") + '</strong><small class="cc-cap-count" id="cc-count-black">暂无战果</small>' +
              '<div class="cc-captured" id="cc-cap-by-black"></div></div>' +
          '</div>' +
          '<div class="cc-card default" id="cc-card">' +
            '<div class="cc-card-art"><span class="big-glyph">战</span></div>' +
            '<div class="cc-card-body"><p class="kicker">当前棋子</p><h3>圣魔大战</h3><p>点一枚棋子，看看它能走到哪里。</p></div>' +
          '</div>' +
          '<div class="cc-player" id="cc-red-row">' +
            '<div class="cc-avatar"><img src="img/Cchess/face/rk.png" alt="' + util.escapeHtml(armyRed) + '"></div>' +
            '<div class="cc-player-info"><strong>' + util.escapeHtml(armyRed) + ' · ' + (playerSide === RED ? "你" : "电脑") + '</strong><small class="cc-cap-count" id="cc-count-red">暂无战果</small>' +
              '<div class="cc-captured" id="cc-cap-by-red"></div></div>' +
          '</div>' +
          '<div class="cc-actions">' +
            '<button class="mini-btn" data-cc="restart">新局</button>' +
            '<button class="mini-btn" data-cc="undo" id="cc-undo">悔棋</button>' +
            '<button class="mini-btn danger" data-cc="resign" id="cc-resign">认输</button>' +
            '<button class="mini-btn" data-cc="gallery">棋子图鉴</button>' +
          '</div>' +
          '<p class="cc-tip"><b>走子：</b>点自己的棋子，再点落点。<br><b>提示：</b>马走日，象走田，炮隔山打牛；将帅不能照面。</p>' +
        '</aside>' +
      '</div>';

    boardEl = root.querySelector("#cc-board");
    boardEl.classList.toggle("flipped", flipped);
    piecesEl = root.querySelector("#cc-pieces");
    statusEl = root.querySelector("#cc-status");
    cardEl = root.querySelector("#cc-card");
    turnText = root.querySelector("#cc-turn-text");
    turnDot = statusEl.querySelector(".cc-turn-dot");
    rightStatus = root.querySelector("#cc-right-status");
    blackRow = root.querySelector("#cc-black-row");
    redRow = root.querySelector("#cc-red-row");
    capByBlack = root.querySelector("#cc-cap-by-black");
    capByRed = root.querySelector("#cc-cap-by-red");
    undoBtn = root.querySelector("#cc-undo");
    resignBtn = root.querySelector("#cc-resign");

    /* ---------- 展示 ---------- */
    function idParts(id) {
      if (!id) return null;
      const parts = String(id).split("-");
      return { side: parts[0], type: +parts[1], slot: +parts[2] || 1 };
    }

    function artKeyFor(p, id) {
      const side = sideOf(p), t = Math.abs(p);
      const info = idParts(id);
      const slot = info ? info.slot : 1;
      const sideKey = side === RED ? "red" : "black";
      return db.cchessArt(sideKey, t, slot);
    }

    function heroFor(p, id) {
      const key = artKeyFor(p, id);
      const side = sideOf(p), t = Math.abs(p);
      const sideKey = side === RED ? "red" : "black";
      const info = idParts(id);
      const slot = info ? info.slot : 1;
      const name = db.cchessName(sideKey, t, slot);
      const slotText = db.slotLabel(t, slot, sideKey);
      const role = db.army("cchess", sideKey) + " · " + (TYPE_NAME[t] || "棋子") + (slotText ? " " + slotText : "");
      return { key, name, role, placeholder: !key };
    }

    function renderCard(i) {
      if (i === undefined) i = state.cardIdx;
      if (i < 0 || !state.board[i]) {
        state.cardIdx = -1;
        cardEl.className = "cc-card default";
        cardEl.innerHTML = '<div class="cc-card-art"><span class="big-glyph">战</span></div>' +
          '<div class="cc-card-body"><p class="kicker">当前棋子</p><h3>圣魔大战</h3><p>点一枚棋子，看看它能走到哪里。</p></div>';
        return;
      }
      const p = state.board[i];
      const info = heroFor(p, state.ids[i]);
      const ch = charOf(p);
      const artOn = artMode();
      const hasArt = info.key && artOn;
      const safeName = util.escapeHtml(info.name);
      const safeRole = util.escapeHtml(info.role);
      let artHtml, kicker;
      if (!artOn) {
        artHtml = '<span class="big-glyph" style="position:absolute;font-size:clamp(66px,8vh,98px);color:rgba(198,134,48,.7)">' + ch + "</span>" +
          '<span class="placeholder-note">符号棋子</span>';
        kicker = "当前棋子 · 符号";
      } else if (hasArt) {
        artHtml = '<img src="img/Cchess/art/' + info.key + '.png" alt="' + safeName + '" draggable="false">';
        kicker = "当前棋子 · 立绘";
      } else {
        artHtml = '<img src="img/Cchess/art/placeholder.png" alt="占位符" style="position:absolute;height:100%;opacity:.14;filter:grayscale(.7) contrast(.9)">' +
          '<span class="big-glyph" style="position:absolute;z-index:2;font-size:clamp(58px,7vh,88px);color:rgba(198,134,48,.78)">' + ch + '</span>' +
          '<span class="placeholder-note">代码棋子 · 占位符</span>';
        kicker = "当前棋子 · 占位";
      }
      cardEl.className = "cc-card";
      cardEl.innerHTML = '<div class="cc-card-art">' + artHtml + '</div>' +
        '<div class="cc-card-body"><p class="kicker">' + kicker + '</p>' +
        '<h3>' + safeName + '</h3><p class="cc-card-role">' + safeRole + '</p></div>';
    }

    function renderPieces() {
      const checkedSide = !state.over && isChecked(state.board, state.kingPos, state.turn) ? state.turn : 0;
      let html = "";
      if (state.lastMove) {
        const f = state.lastMove.from, t = state.lastMove.to;
        html += '<span class="cc-last" style="left:' + posLeft(f % 9) + ';top:' + posTop((f / 9) | 0) + '"></span>';
        html += '<span class="cc-last to" style="left:' + posLeft(t % 9) + ';top:' + posTop((t / 9) | 0) + '"></span>';
      }
      for (const to of state.targets) {
        const captured = state.board[to] !== 0;
        html += '<span class="cc-mark' + (captured ? " capture" : "") + '" style="left:' + posLeft(to % 9) + ';top:' + posTop((to / 9) | 0) + '"></span>';
      }
      for (let i = 0; i < 90; i++) {
        const p = state.board[i];
        if (!p) continue;
        const side = sideOf(p), t = Math.abs(p), c = i % 9, r = (i / 9) | 0;
        const id = state.ids[i];
        const key = artKeyFor(p, id);
        const useArt = !!(key && artMode());
        const selected = i === state.selected;
        const checked = checkedSide === side && t === K;
        const info = heroFor(p, id);
        const ch = charOf(p);
        const safeName = util.escapeHtml(info.name);
        const cls = "cc-unit " + (side === RED ? "red" : "black") + (useArt ? " art" : " code") +
          (selected ? " selected" : "") + (checked ? " checked" : "");
        const accent = useArt ? "" : ";--unit-accent:" + (CODE_ACCENT[t] || "#f0b23c");
        html += '<div class="' + cls + '" data-i="' + i + '" style="left:' + posLeft(c) + ";top:" + posTop(r) + ";z-index:" + (20 + viewR(r)) + accent + '"' +
          ' role="button" aria-label="' + safeName + '" title="' + safeName + '">';
        html += '<span class="unit-shadow"></span>';
        if (useArt) {
          html += '<img class="unit-art" src="img/Cchess/art/' + key + '.png" alt="' + safeName + '" draggable="false">';
        } else {
          html += '<span class="unit-pillar"><span class="unit-glyph">' + ch + "</span></span>";
        }
        html += '<span class="unit-tag">' + ch + "</span></div>";
      }
      piecesEl.innerHTML = html;
    }

    function updateCaptured() {
      const initial = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 5 };
      const count = { 1: {}, [-1]: {} };
      for (const side of [RED, BLACK]) for (const t of [1, 2, 3, 4, 5, 6, 7]) count[side][t] = 0;
      const now = { 1: {}, [-1]: {} };
      for (const side of [RED, BLACK]) for (const t of [1, 2, 3, 4, 5, 6, 7]) now[side][t] = 0;
      for (let i = 0; i < 90; i++) {
        const p = state.board[i];
        if (!p) continue;
        now[sideOf(p)][Math.abs(p)]++;
      }
      for (const side of [RED, BLACK]) {
        for (const t of [1, 2, 3, 4, 5, 6, 7]) count[side][t] = Math.max(0, initial[t] - now[side][t]);
      }
      function htmlFor(side) {
        let h = "", n = 0;
        for (const t of [7, 6, 5, 4, 3, 2, 1]) {
          for (let k = 0; k < count[side][t]; k++) {
            h += '<span class="cc-cap ' + (side === RED ? "red" : "black") + '">' +
              (side === RED ? RED_NAME[t] : BLACK_NAME[t]) + "</span>";
            n++;
          }
        }
        return { h, n };
      }
      const byBlack = htmlFor(RED);
      const byRed = htmlFor(BLACK);
      capByBlack.innerHTML = byBlack.h;
      capByRed.innerHTML = byRed.h;
      root.querySelector("#cc-count-black").textContent = byBlack.n ? "已吃 " + byBlack.n + " 子" : "暂无战果";
      root.querySelector("#cc-count-red").textContent = byRed.n ? "已吃 " + byRed.n + " 子" : "暂无战果";
    }

    function updateStatus() {
      const checked = !state.over && isChecked(state.board, state.kingPos, state.turn);
      turnDot.className = "cc-turn-dot" + (state.turn === BLACK ? " black" : "");
      let left, right;
      if (state.over) {
        left = state.result && state.result.winner === "red" ? armyRed + "胜" : state.result && state.result.winner === "black" ? armyBlack + "胜" : "和棋";
        right = state.result ? state.result.reason : "对局结束";
      } else if (state.thinking) {
        left = (aiSide === RED ? armyRed : armyBlack) + " · 电脑";
        right = '<span class="cc-thinking">思考中<span class="dots"><i></i><i></i><i></i></span></span>';
      } else {
        left = (state.turn === RED ? armyRed : armyBlack) + (state.turn === playerSide ? " · 你" : " · 电脑");
        right = checked ? '<span class="cc-check-flag">将军！</span>' : (state.turn === playerSide ? "轮到你走" : "电脑回合");
      }
      turnText.textContent = left;
      if (typeof right === "string" && right.indexOf("<") === 0) rightStatus.innerHTML = right;
      else rightStatus.textContent = right;
      blackRow.classList.toggle("active", !state.over && state.turn === BLACK);
      redRow.classList.toggle("active", !state.over && state.turn === RED);
      undoBtn.disabled = state.history.length === 0 || state.thinking || state.over;
      resignBtn.disabled = state.over;
      if (state.over) api.setStatus("对局结束 · " + left);
      else if (state.thinking) api.setStatus((aiSide === RED ? armyRed : armyBlack) + "正在思考…");
      else api.setStatus((state.turn === RED ? armyRed : armyBlack) + " · 第 " + (Math.floor(state.ply / 2) + 1) + " 手");
    }

    function refresh(keepCard) {
      renderPieces();
      updateCaptured();
      updateStatus();
      if (!keepCard) renderCard(state.cardIdx);
    }

    /* ---------- 游戏流程 ---------- */
    function snapshot() {
      return {
        board: state.board.slice(),
        ids: state.ids.slice(),
        kingPos: Object.assign({}, state.kingPos),
        turn: state.turn,
        halfmove: state.halfmove,
        ply: state.ply,
        lastMove: state.lastMove ? Object.assign({}, state.lastMove) : null
      };
    }

    function applyMove(from, to) {
      const p = state.board[from], cap = state.board[to];
      state.board[to] = p;
      state.board[from] = 0;
      state.ids[to] = state.ids[from];
      state.ids[from] = null;
      if (Math.abs(p) === K) state.kingPos[sideOf(p)] = to;
      state.lastMove = { from, to };
      state.halfmove = cap ? 0 : state.halfmove + 1;
      state.ply++;
      state.turn = -state.turn;
      return cap;
    }

    function removeResult() {
      if (resultEl) { resultEl.remove(); resultEl = null; }
    }

    function finish(winner, reason) {
      if (state.over) return;
      state.over = true;
      state.thinking = false;
      state.result = { winner, reason };
      clearTimeout(aiTimer);
      aiTimer = 0;
      const stats = storage.get(YZ.KEY.cchess, { wins: 0, losses: 0, draws: 0 });
      stats.wins = stats.wins || 0;
      stats.losses = stats.losses || 0;
      stats.draws = stats.draws || 0;
      const playerWon = (winner === "red" && playerSide === RED) || (winner === "black" && playerSide === BLACK);
      const aiWon = (winner === "red" && aiSide === RED) || (winner === "black" && aiSide === BLACK);
      if (playerWon) stats.wins++;
      else if (aiWon) stats.losses++;
      else stats.draws++;
      storage.set(YZ.KEY.cchess, stats);
      refresh();
      audio.sfx(playerWon ? "win" : aiWon ? "lose" : "pop");
      if (playerWon && YZ.achievements) YZ.achievements.unlock("cchess-" + (settings.get("ai") || "normal"));
      showResult(winner, reason, stats, playerWon, aiWon);
    }

    function showResult(winner, reason, stats, playerWon, aiWon) {
      removeResult();
      const title = playerWon ? "你赢了" : aiWon ? "你输了" : "和棋";
      const sub = (reason || "") + "。<br>共走了 " + state.ply + " 步。";
      const el = document.createElement("div");
      el.className = "game-overlay";
      el.innerHTML = '<div class="overlay-card"><p class="kicker">GAME OVER</p><h3>' + title + "</h3>" +
        '<p class="ov-sub">' + sub + "</p>" +
        '<div class="ov-stats"><div><span>胜</span><strong>' + stats.wins + "</strong></div><div><span>负</span><strong>" + stats.losses +
        "</strong></div><div><span>和</span><strong>" + stats.draws + "</strong></div></div>" +
        '<div class="ov-actions"><button class="btn primary" data-ov="again">再来一局</button>' +
        '<button class="btn" data-ov="look">看看棋盘</button>' +
        '<button class="btn ghost" data-ov="exit">返回主页</button></div></div>';
      root.appendChild(el);
      resultEl = el;
      el.querySelector('[data-ov="again"]').addEventListener("click", () => restart());
      el.querySelector('[data-ov="look"]').addEventListener("click", () => { removeResult(); });
      el.querySelector('[data-ov="exit"]').addEventListener("click", () => api.onExit());
    }

    function afterMove(mover) {
      const next = state.turn;
      const checked = isChecked(state.board, state.kingPos, next);
      const moves = legalMoves(state.board, state.kingPos, next);
      if (!moves.length) {
        // 绝杀 / 困毙 都判无子可动的一方负；不要走成和棋
        finish(next === RED ? "black" : "red", checked ? "绝杀" : "困毙 · 无子可动");
        return;
      }
      if (state.halfmove >= 120) {
        finish("draw", "六十回合无吃子");
        return;
      }
      if (checked) {
        audio.sfx("check");
        toast("将军！", "bad");
      }
      refresh();
      if (next === aiSide) scheduleAI();
    }

    function scheduleAI() {
      if (state.over || state.paused || !state.alive) return;
      state.thinking = true;
      updateStatus();
      clearTimeout(aiTimer);
      aiTimer = setTimeout(() => {
        if (!state.alive) return;
        if (state.paused) { state.thinking = false; resumeAI = true; updateStatus(); return; }
        // 让 UI 先绘制出“思考中”
        requestAnimationFrame(() => {
          if (!state.alive || state.over || state.paused) { state.thinking = false; updateStatus(); return; }
          const mv = searchBest(state.board, state.kingPos, aiSide, settings.get("ai"));
          state.thinking = false;
          if (!state.alive) return;
          if (!mv) {
            finish(aiSide === BLACK ? "red" : "black", isChecked(state.board, state.kingPos, aiSide) ? "绝杀" : "困毙 · 无子可动");
            return;
          }
          const cap = applyMove(mv >> 8, mv & 255);
          state.selected = -1;
          state.targets = [];
          state.cardIdx = mv & 255;
          audio.sfx(cap ? "capture" : "place");
          afterMove(aiSide);
        });
      }, 80);
    }

    function playerMove(from, to) {
      if (state.thinking || state.over || state.paused || state.turn !== playerSide) return;
      const legal = state.targets.includes(to);
      if (!legal) return;
      state.history.push(snapshot());
      const cap = applyMove(from, to);
      state.selected = -1;
      state.targets = [];
      state.cardIdx = -1;
      audio.sfx(cap ? "capture" : "place");
      renderPieces();
      updateCaptured();
      updateStatus();
      renderCard(-1);
      afterMove(playerSide);
    }

    function selectPiece(i) {
      if (state.selected === i) { clearSelection(); return; }
      state.selected = i;
      state.cardIdx = i;
      const all = legalMoves(state.board, state.kingPos, playerSide);
      state.targets = all.filter(mv => (mv >> 8) === i).map(mv => mv & 255);
      audio.sfx("select");
      renderPieces();
      renderCard(i);
      updateStatus();
    }

    function clearSelection(inspect) {
      state.selected = -1;
      state.targets = [];
      state.cardIdx = inspect === undefined ? -1 : inspect;
      renderPieces();
      renderCard(state.cardIdx);
      updateStatus();
    }

    function boardSquareFromEvent(e) {
      const rect = boardEl.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const mx = rect.width * 60 / 900, my = rect.height * 150 / 1000;
      const sx = (rect.width - 2 * mx) / 8, sy = (rect.height - my - rect.height * 60 / 1000) / 9;
      const vc = Math.round((px - mx) / sx), vr = Math.round((py - my) / sy);
      if (!inBoard(vr, vc)) return -1;
      const dx = px - (mx + vc * sx), dy = py - (my + vr * sy);
      if (Math.hypot(dx, dy) > Math.max(sx, sy) * 0.68) return -1;
      const c = flipped ? 8 - vc : vc;
      const r = flipped ? 9 - vr : vr;
      return idx(r, c);
    }

    function onBoardClick(e) {
      if (state.thinking || state.over || state.paused || state.turn !== playerSide) return;
      const i = boardSquareFromEvent(e);
      if (i < 0) { clearSelection(); return; }
      if (state.selected >= 0 && state.targets.includes(i)) { playerMove(state.selected, i); return; }
      const p = state.board[i];
      if (p && sideOf(p) === playerSide) { selectPiece(i); return; }
      if (p && sideOf(p) === -playerSide) { clearSelection(i); return; }
      clearSelection();
    }

    function undo() {
      if (state.thinking || state.over || !state.history.length || state.paused) return;
      clearTimeout(aiTimer);
      aiTimer = 0;
      resumeAI = false;
      const s = state.history.pop();
      state.board = s.board;
      state.ids = s.ids;
      state.kingPos = s.kingPos;
      state.turn = s.turn;
      state.halfmove = s.halfmove;
      state.ply = s.ply;
      state.lastMove = s.lastMove;
      state.selected = -1;
      state.targets = [];
      state.cardIdx = -1;
      refresh();
      audio.sfx("pop");
      toast("悔棋成功，轮到你了", "gold");
    }

    function restart() {
      state.alive = true;
      state.board = initialBoard();
      state.ids = initialIds(state.board);
      state.kingPos = Object.assign({}, INITIAL_KP);
      state.turn = RED;
      state.selected = -1;
      state.targets = [];
      state.lastMove = null;
      state.halfmove = 0;
      state.ply = 0;
      state.over = false;
      state.result = null;
      state.thinking = false;
      state.history = [];
      state.cardIdx = -1;
      state.paused = false;
      clearTimeout(aiTimer);
      aiTimer = 0;
      resumeAI = false;
      armedResign = false;
      resignBtn.textContent = "认输";
      clearTimeout(resignTimer);
      removeResult();
      if (galleryEl) { galleryEl.remove(); galleryEl = null; }
      refresh();
      renderCard(-1);
      if (playerSide === BLACK) scheduleAI();
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
      finish(playerSide === RED ? "black" : "red", "你认输了");
    }

    function openGallery() {
      if (galleryEl) return;
      let cards = "";
      let artCount = 0;
      for (const side of ["red", "black"]) {
        for (let t = 1; t <= 7; t++) {
          const count = db.meta.cchessCounts[t];
          for (let slot = 1; slot <= count; slot++) {
            const art = db.cchessArt(side, t, slot);
            if (art) artCount++;
            const name = util.escapeHtml(db.cchessName(side, t, slot));
            const slotText = db.slotLabel(t, slot, side);
            const role = util.escapeHtml(db.army("cchess", side) + " · " + db.cchessChar(side, t) + (slotText ? " " + slotText : ""));
            if (art) {
              cards += '<div class="cc-gallery-card"><div class="g-art"><img src="img/Cchess/art/' + art + '.png" alt="' + name + '"></div>' +
                "<strong>" + name + "</strong><small>" + role + " · 立绘</small></div>";
            } else {
              cards += '<div class="cc-gallery-card"><div class="g-art"><span class="g-glyph">' + db.cchessChar(side, t) + "</span></div>" +
                "<strong>" + name + "</strong><small>" + role + " · 代码棋子</small></div>";
            }
          }
        }
      }
      cards += '<div class="cc-gallery-card"><div class="g-art"><img src="img/Cchess/art/placeholder.png" alt="占位符"></div>' +
        "<strong>占位符</strong><small>未提供立绘时的备用素材</small></div>";
      const el = document.createElement("div");
      el.className = "cc-gallery";
      el.innerHTML = '<div class="cc-gallery-panel"><div class="cc-gallery-head"><div><p class="kicker">PIECE GALLERY</p>' +
        "<h3>棋子图鉴 · " + artCount + "/32</h3></div><button class=\"close-btn\" data-gclose aria-label=\"关闭\">✕</button></div>" +
        '<div class="cc-gallery-grid">' + cards + "</div>" +
        '<p class="cc-gallery-note">每个棋子位单独命名：士、象、马、车、炮左右各一个名字，五个兵也各有名字。女神军与邪神军 16 个棋子位现在都有立绘；五个兵共用同一张兵图。</p></div>';
      root.appendChild(el);
      galleryEl = el;
      el.addEventListener("click", e => {
        if (e.target === el || e.target.closest("[data-gclose]")) closeGallery();
      });
      audio.sfx("pop");
    }

    function closeGallery() {
      if (galleryEl) { galleryEl.remove(); galleryEl = null; }
    }

    /* ---------- 绑定 ---------- */
    boardEl.addEventListener("click", onBoardClick);
    root.querySelectorAll("[data-cc]").forEach(btn => {
      btn.addEventListener("click", () => {
        const a = btn.dataset.cc;
        if (a === "restart") restart();
        else if (a === "undo") undo();
        else if (a === "resign") resign();
        else if (a === "gallery") openGallery();
      });
    });
    root.addEventListener("pointerdown", () => audio.unlock(), { once: true });

    refresh();
    renderCard(-1);
    if (playerSide === BLACK) scheduleAI();

    const handle = {
      destroy() {
        state.alive = false;
        clearTimeout(aiTimer);
        clearTimeout(resignTimer);
        if (resultEl) resultEl.remove();
        if (galleryEl) galleryEl.remove();
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
        if (resumeAI) {
          resumeAI = false;
          scheduleAI();
        }
      },
      restart,
      isOver() { return state.over; },
      applySettings() { renderPieces(); renderCard(state.cardIdx); },
      escape() {
        if (galleryEl) { closeGallery(); return true; }
        if (resultEl) { removeResult(); return true; }
        return false;
      }
    };
    try {
      if (new URLSearchParams(location.search).has("debug")) {
        handle._debug = { state, refresh, applyMove, afterMove, playerSide, aiSide };
      }
    } catch (e) { /* ignore */ }
    return handle;
  }

  YZ.games.cchess = {
    id: "cchess",
    no: "01",
    kicker: "圣战 · HOLY WAR",
    title: "圣魔大战",
    subtitle: "女神军 vs 邪神军",
    desc: "女神军与邪神军在九宫棋盘上开战。完整象棋规则、会思考的对手，以及按棋子位保存的名字。",
    emblem: '<img src="img/Cchess/face/rk.png" alt="圣魔大战">',
    mount,
    cardStat() {
      const s = storage.get(YZ.KEY.cchess, null);
      if (!s || (!s.wins && !s.losses && !s.draws)) return "尚无战绩 · 你先来";
      return "战绩 " + (s.wins || 0) + "胜 " + (s.losses || 0) + "负" + (s.draws ? " " + s.draws + "和" : "");
    }
  };

  // 调试用的 perft（仅在 ?debug=1 时挂出）
  try {
    if (new URLSearchParams(location.search).has("debug")) {
      YZ.games.cchess._test = {
        perft(depth) {
          const b = initialBoard();
          const kp = Object.assign({}, INITIAL_KP);
          function go(d, side) {
            if (d === 0) return 1;
            const moves = legalMoves(b, kp, side);
            let n = 0;
            for (const mv of moves) {
              const u = makeMove(b, kp, mv);
              n += go(d - 1, -side);
              unmakeMove(b, kp, mv, u);
            }
            return n;
          }
          return go(depth, RED);
        },
        legalCount() { return legalMoves(initialBoard(), Object.assign({}, INITIAL_KP), RED).length; }
      };
    }
  } catch (e) { /* ignore */ }
})(window);
