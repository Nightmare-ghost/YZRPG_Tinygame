/* ============================================================
   寻找二重身 · CHESS MEMORY
   练习 / 竞速 / 与全知者对战
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const { util, storage, audio } = YZ;

  const DIFFS = {
    easy: { pairs: 6, label: "轻松", hint: "6 对 · 12 张", cols: 6 },
    normal: { pairs: 12, label: "普通", hint: "12 对 · 24 张", cols: 8 },
    hard: { pairs: 18, label: "困难", hint: "18 对 · 36 张", cols: 9 }
  };
  const MODES = {
    practice: { label: "练习", hint: "熟悉牌面，慢慢记", desc: "不追求排名，先把牌面认全。" },
    race: { label: "竞速", hint: "从第一张开始计时", desc: "同一副牌，用更短的时间清空牌桌。" },
    battle: { label: "对战", hint: "与全知者轮流配对", desc: "配对得分并继续，失败换人；她知道所有亮过的牌。" }
  };
  const BOT_LINES = {
    before: "这张牌背后的图像，我早已知晓……",
    match: "能翻出这一对这件事，我也早已知晓",
    miss: "我翻出的并不是一对，这是不可改变的命运。我也知晓……"
  };
  const OMN_LINES = [
    "你要摸我这件事……我也知晓",
    "这具身体只是凭依……你要摸也没意义……"
  ];

  const fmtTime = ms => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  };

  function buildPool() {
    const db = YZ.pieceDB;
    if (!db) return [];
    const factions = [
      { key: "white", side: "white", army: "女神军" },
      { key: "black", side: "black", army: "邪神军" },
      { key: "ruka", side: "white", army: "鲁卡军" },
      { key: "chaos", side: "black", army: "卡奥斯军" }
    ];
    const pieces = [[6, 1], [5, 1], [4, 1], [4, 2], [3, 1], [3, 2], [2, 1], [2, 2], [1, 1]];
    const out = [];
    for (const f of factions) {
      for (const [type, slot] of pieces) {
        // 祸抚的 3-1 / 3-2 共用同一张立绘，牌库里只保留一张，避免同图分身。
        if (f.key === "black" && type === 3 && slot === 2) continue;
        const art = db.chessArt(f.side, type, slot, f.key);
        if (!art) continue;
        const fullName = db.chessName(f.side, type, slot, f.key);
        const name = String(fullName || "").split(" · ").pop().trim() || fullName || "棋子";
        const id = f.key + "-" + type + "-" + slot;
        out.push({ id, name, army: f.army, faction: f.key, img: "img/memory/faces/" + id + ".png" });
      }
    }
    return out;
  }

  function mount(root, api) {
    api = api || {};
    const KEY = (api.KEY && api.KEY.memory) || "yz_memory_v1";
    const cover = new URL("img/System/title.jpg", document.baseURI).href;
    const pool = buildPool();
    document.body.classList.add("memory-mode");

    root.innerHTML =
      '<div class="mem-shell is-setup" id="mem-shell">' +
        '<div class="mem-hero">' +
          '<div class="mem-title-block">' +
            '<p class="mem-kicker"><span></span>CHESS MEMORY · 对碰</p>' +
            '<h2>寻找二重身</h2>' +
            '<p class="mem-sub">翻开两张，找出同一枚棋子。牌面来自混沌乱战图库，会随图库一起增加。</p>' +
          '</div>' +
          '<div class="mem-hud">' +
            '<div class="mem-stat"><span>配对</span><strong id="mem-pairs">0 / 0</strong></div>' +
            '<div class="mem-stat"><span>步数</span><strong id="mem-moves">0</strong></div>' +
            '<div class="mem-stat"><span>用时</span><strong id="mem-time">00:00</strong></div>' +
            '<div class="mem-stat mem-score-stat" id="mem-score-wrap" hidden><span>比分</span><strong id="mem-score">你 0 : 0</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="mem-setup" id="mem-setup">' +
          '<div class="mem-setup-head">' +
            '<p class="mem-kicker"><span></span>CHOOSE YOUR GAME</p>' +
            '<h3>先选模式，再选难度</h3>' +
            '<p>牌桌会按难度自动换列，让全部卡牌留在画面里。</p>' +
          '</div>' +
          '<div class="mem-setup-block">' +
            '<p class="mem-setup-label">模式</p>' +
            '<div class="mem-setup-modes">' +
              Object.keys(MODES).map(k => '<button type="button" class="mem-choice mem-choice-mode" data-setup-mode="' + k + '"><strong>' + MODES[k].label + '</strong><small>' + MODES[k].hint + '</small><em>' + MODES[k].desc + '</em></button>').join("") +
            '</div>' +
          '</div>' +
          '<div class="mem-setup-block">' +
            '<p class="mem-setup-label">难度</p>' +
            '<div class="mem-setup-diffs">' +
              Object.keys(DIFFS).map(k => '<button type="button" class="mem-choice mem-choice-diff" data-setup-diff="' + k + '"><strong>' + DIFFS[k].label + '</strong><small>' + DIFFS[k].hint + '</small></button>').join("") +
            '</div>' +
          '</div>' +
          '<div class="mem-setup-foot">' +
            '<div class="mem-setup-note" id="mem-setup-note">练习模式 · 普通 · 16 张</div>' +
            '<button type="button" class="mem-start" id="mem-start">开始翻牌 <span>→</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="mem-play" id="mem-play" hidden>' +
          '<div class="mem-playbar">' +
            '<span id="mem-run-label">练习 · 普通</span>' +
            '<span class="mem-best" id="mem-best">最佳 ——</span>' +
            '<div class="mem-play-actions">' +
              '<button type="button" class="mem-btn" id="mem-change">换模式</button>' +
              '<button type="button" class="mem-btn" id="mem-restart">重新洗牌</button>' +
            '</div>' +
          '</div>' +
          '<div class="mem-body" id="mem-body">' +
            '<div class="mem-main">' +
              '<div class="mem-turnbar"><span id="mem-turn">你的回合</span><span id="mem-tip">先翻一张，再找它的另一半。</span></div>' +
              '<div class="mem-board-wrap">' +
                '<div class="mem-board" id="mem-board" aria-live="polite"></div>' +
                '<div class="mem-win" id="mem-win" hidden>' +
                  '<p class="mem-win-kicker">ALL MATCHED</p>' +
                  '<h3 id="mem-win-title">全部对上了</h3>' +
                  '<p id="mem-win-copy">——</p>' +
                  '<div class="mem-win-actions">' +
                    '<button type="button" class="mem-btn primary" id="mem-again">再来一局</button>' +
                    '<button type="button" class="mem-btn" id="mem-next">换模式 / 难度</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<aside class="mem-opponent" id="mem-opponent" role="button" tabindex="0" title="点一下全知者" hidden>' +
              '<div class="mem-omn-head"><span>OMNISCIENT</span><strong>全知者</strong></div>' +
              '<div class="mem-omn-art"><img src="img/memory/Omn.png" alt="全知者"></div>' +
              '<div class="mem-omn-score"><span>她的得分</span><strong id="mem-bot-score">0</strong></div>' +
              '<div class="mem-bubble" id="mem-bubble">' + BOT_LINES.before + '</div>' +
            '</aside>' +
          '</div>' +
        '</div>' +
        '<div class="mem-foot"><span>牌背：主页封面图 · 牌面：混沌乱战立绘</span><span id="mem-foot-note">选择模式与难度</span></div>' +
      '</div>';

    const shell = root.querySelector("#mem-shell");
    const setupEl = root.querySelector("#mem-setup");
    const playEl = root.querySelector("#mem-play");
    const body = root.querySelector("#mem-body");
    const board = root.querySelector("#mem-board");
    const winEl = root.querySelector("#mem-win");
    const pairsEl = root.querySelector("#mem-pairs");
    const movesEl = root.querySelector("#mem-moves");
    const timeEl = root.querySelector("#mem-time");
    const bestEl = root.querySelector("#mem-best");
    const tipEl = root.querySelector("#mem-tip");
    const turnEl = root.querySelector("#mem-turn");
    const scoreWrap = root.querySelector("#mem-score-wrap");
    const scoreEl = root.querySelector("#mem-score");
    const botScoreEl = root.querySelector("#mem-bot-score");
    const opponentEl = root.querySelector("#mem-opponent");
    const bubbleEl = root.querySelector("#mem-bubble");
    const footNote = root.querySelector("#mem-foot-note");
    const setupNote = root.querySelector("#mem-setup-note");
    const runLabel = root.querySelector("#mem-run-label");
    const playbar = root.querySelector(".mem-playbar");

    const state = {
      mode: "practice",
      diff: "normal",
      deck: [],
      first: null,
      second: null,
      busy: false,
      over: false,
      paused: false,
      started: false,
      startAt: 0,
      elapsed: 0,
      moves: 0,
      matched: 0,
      total: 0,
      scores: { player: 0, bot: 0 },
      turn: "player",
      seen: new Set(),
      roundToken: 0,
      botToken: 0,
      lockTimer: 0,
      botTimer: 0,
      tick: 0,
      omniTimer: 0,
      omniLockUntil: 0,
      inGame: false
    };

    const loadBest = () => {
      const s = storage.get(KEY, null);
      return s && typeof s === "object" ? s : {};
    };
    const bestKey = () => state.mode + ":" + state.diff;
    const renderBest = () => {
      if (state.mode === "battle") { if (bestEl) bestEl.textContent = "全知者 · 对战"; return; }
      const b = loadBest()[bestKey()];
      if (bestEl) bestEl.textContent = b ? (state.mode === "race" ? "最快 " + fmtTime(b.ms) : "最佳 " + b.moves + " 步 · " + fmtTime(b.ms)) : "最佳 ——";
    };
    const saveBest = result => {
      if (state.mode === "battle") return;
      const all = loadBest();
      const prev = all[bestKey()] || {};
      all[bestKey()] = {
        moves: !prev.moves || result.moves < prev.moves ? result.moves : prev.moves,
        ms: !prev.ms || result.ms < prev.ms ? result.ms : prev.ms,
        at: Date.now()
      };
      storage.set(KEY, all);
    };

    const clearTimers = () => {
      clearTimeout(state.lockTimer); state.lockTimer = 0;
      clearTimeout(state.botTimer); state.botTimer = 0;
      clearInterval(state.tick); state.tick = 0;
    };
    const liveElapsed = () => state.elapsed + (state.started && !state.paused && !state.over ? performance.now() - state.startAt : 0);

    const updateHud = () => {
      pairsEl.textContent = state.matched + " / " + state.total;
      movesEl.textContent = String(state.moves);
      timeEl.textContent = fmtTime(liveElapsed());
      scoreWrap.hidden = state.mode !== "battle";
      botScoreEl.textContent = String(state.scores.bot);
      scoreEl.textContent = "你 " + state.scores.player + " : " + state.scores.bot;
      turnEl.textContent = state.mode === "battle" ? (state.turn === "bot" ? "全知者的回合" : "你的回合") : (state.mode === "race" ? "竞速计时" : "练习模式");
      root.querySelectorAll(".mem-choice-mode").forEach(b => b.classList.toggle("is-on", b.dataset.setupMode === state.mode));
      root.querySelectorAll(".mem-choice-diff").forEach(b => b.classList.toggle("is-on", b.dataset.setupDiff === state.diff));
      footNote.textContent = MODES[state.mode].label + "模式 · " + DIFFS[state.diff].hint;
      runLabel.textContent = MODES[state.mode].label + " · " + DIFFS[state.diff].label;
      setupNote.textContent = MODES[state.mode].label + "模式 · " + DIFFS[state.diff].label + " · " + DIFFS[state.diff].hint;
    };

    const setBubble = (text, force) => {
      if (!bubbleEl) return;
      if (!force && state.omniLockUntil > performance.now()) return;
      bubbleEl.classList.remove("pop");
      bubbleEl.textContent = text;
      void bubbleEl.offsetWidth;
      bubbleEl.classList.add("pop");
    };
    const touchOmn = () => {
      if (state.mode !== "battle" || !state.inGame) return;
      state.omniLockUntil = performance.now() + 1000;
      if (YZ.achievements) YZ.achievements.unlock("memory-touch-omn");
      setBubble(OMN_LINES[Math.floor(Math.random() * OMN_LINES.length)], true);
      opponentEl.classList.remove("is-touched");
      void opponentEl.offsetWidth;
      opponentEl.classList.add("is-touched");
      clearTimeout(state.omniTimer);
      state.omniTimer = setTimeout(() => opponentEl.classList.remove("is-touched"), 620);
    };

    const buildDeck = pairs => {
      const chosen = util.shuffle(pool).slice(0, Math.min(pairs, pool.length));
      const cards = [];
      chosen.forEach(p => cards.push(p, p));
      return util.shuffle(cards).map((p, i) => ({ ...p, cardId: p.id + "-" + i }));
    };

    const makeCard = (c, idx) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "mem-card";
      card.dataset.card = c.cardId;
      card.dataset.id = c.id;
      card.dataset.index = String(idx);
      card.setAttribute("aria-label", "未翻开的卡牌 " + (idx + 1));
      card.innerHTML =
        '<span class="mem-card-inner">' +
          '<span class="mem-card-back" style="--back:url(\'' + cover + '\')"></span>' +
          '<span class="mem-card-face">' +
            '<span class="mem-face-art"><img src="' + c.img + '" alt="' + util.escapeHtml(c.name) + '" draggable="false"></span>' +
            '<span class="mem-frame" aria-hidden="true"></span>' +
            '<span class="mem-face-copy"><small>' + util.escapeHtml(c.army) + '</small><strong>' + util.escapeHtml(c.name) + '</strong></span>' +
          '</span>' +
        '</span>';
      card.addEventListener("click", () => playerFlip(card));
      return card;
    };

    const showSetup = () => {
      clearTimers();
      state.roundToken++;
      state.botToken++;
      state.inGame = false;
      shell.classList.add("is-setup");
      setupEl.hidden = false;
      playEl.hidden = true;
      body.classList.remove("is-battle");
      opponentEl.hidden = true;
      winEl.hidden = true;
      board.innerHTML = "";
      state.deck = [];
      state.matched = 0; state.total = 0; state.moves = 0; state.elapsed = 0;
      state.scores = { player: 0, bot: 0 }; state.turn = "player";
      pairsEl.textContent = "0 / 0"; movesEl.textContent = "0"; timeEl.textContent = "00:00";
      scoreWrap.hidden = true;
      footNote.textContent = "选择模式与难度";
      updateHud();
      renderBest();
      api.setStatus && api.setStatus("选择模式与难度");
    };

    const startRound = () => {
      clearTimers();
      state.roundToken++;
      state.botToken++;
      const conf = DIFFS[state.diff];
      state.deck = buildDeck(conf.pairs);
      state.first = null; state.second = null;
      state.busy = false; state.over = false; state.paused = false;
      state.started = false; state.startAt = 0; state.elapsed = 0;
      state.moves = 0; state.matched = 0; state.total = conf.pairs;
      state.scores = { player: 0, bot: 0 };
      state.turn = "player";
      state.seen = new Set();
      state.inGame = true;
      shell.classList.remove("is-setup");
      setupEl.hidden = true;
      playEl.hidden = false;
      board.className = "mem-board mem-board--" + state.diff;
      board.style.setProperty("--cols", conf.cols);
      board.innerHTML = "";
      state.deck.forEach((c, i) => board.appendChild(makeCard(c, i)));
      winEl.hidden = true;
      body.classList.toggle("is-battle", state.mode === "battle");
      opponentEl.hidden = state.mode !== "battle";
      shell.classList.toggle("is-battle-mode", state.mode === "battle");
      setBubble(BOT_LINES.before);
      tipEl.textContent = state.mode === "battle" ? "你先翻，匹配成功可以继续。" : "先翻一张，再找它的另一半。";
      state.tick = setInterval(() => {
        if (state.paused || state.over) return;
        timeEl.textContent = fmtTime(liveElapsed());
      }, 200);
      updateHud();
      renderBest();
      api.setStatus && api.setStatus(state.mode === "battle" ? "与全知者轮流翻牌" : (state.mode === "race" ? "计时竞速" : "翻开两张，找出同一枚棋子"));
    };

    const beginGame = () => {
      root.querySelector("#mem-setup").hidden = true;
      root.querySelector("#mem-play").hidden = false;
      startRound();
    };

    const cardData = card => state.deck[Number(card.dataset.index)];
    const unpairedCards = () => Array.from(board.querySelectorAll(".mem-card")).filter(c => !c.classList.contains("is-matched"));
    const unseenRandom = exclude => {
      const list = unpairedCards().filter(c => c !== exclude && !c.classList.contains("is-flipped"));
      return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    };
    const knownPair = () => {
      const groups = {};
      for (const c of unpairedCards()) {
        if (!state.seen.has(c.dataset.card)) continue;
        (groups[c.dataset.id] || (groups[c.dataset.id] = [])).push(c);
      }
      for (const key of Object.keys(groups)) if (groups[key].length >= 2) return [groups[key][0], groups[key][1]];
      return null;
    };

    const reveal = card => {
      if (!card || card.classList.contains("is-flipped") || card.classList.contains("is-matched")) return false;
      const data = cardData(card);
      if (!data) return false;
      card.classList.add("is-flipped");
      card.setAttribute("aria-label", "已翻开：" + data.name);
      state.seen.add(card.dataset.card);
      return true;
    };
    const hide = card => {
      card.classList.remove("is-flipped", "is-wrong");
      card.setAttribute("aria-label", "未翻开的卡牌");
    };

    const finish = () => {
      state.over = true;
      state.elapsed = liveElapsed();
      state.started = false;
      clearTimers();
      updateHud();
      saveBest({ moves: state.moves, ms: state.elapsed });
      if (YZ.achievements) {
        if (state.mode === "battle") YZ.achievements.recordMemoryBattle(state.diff, state.scores.player > state.scores.bot);
        else YZ.achievements.recordMemory(state.mode, state.diff, state.moves === state.total);
      }
      const title = root.querySelector("#mem-win-title");
      const copy = root.querySelector("#mem-win-copy");
      if (state.mode === "battle") {
        const p = state.scores.player, b = state.scores.bot;
        title.textContent = p > b ? "你赢过了全知者" : p < b ? "全知者早已知晓" : "命运互不相让";
        copy.textContent = "你 " + p + " : " + b + " 全知者 · " + fmtTime(state.elapsed);
      } else {
        title.textContent = "全部对上了";
        copy.textContent = state.moves + " 步 · " + fmtTime(state.elapsed) + " · " + DIFFS[state.diff].label;
      }
      winEl.hidden = false;
      tipEl.textContent = "这一局结束了。";
      if (audio) audio.sfx("start");
      api.setStatus && api.setStatus("全部配对完成");
    };

    const afterMatch = (a, b, actor) => {
      a.classList.add("is-matched"); b.classList.add("is-matched");
      a.disabled = true; b.disabled = true;
      state.matched++;
      state.first = null; state.second = null;
      if (state.mode === "battle") {
        if (actor === "bot") state.scores.bot++;
        else state.scores.player++;
      }
      updateHud();
      if (state.matched >= state.total) finish();
    };

    const markWrong = (a, b, nextTurn) => {
      a.classList.add("is-wrong"); b.classList.add("is-wrong");
      tipEl.textContent = nextTurn === "bot" ? "没对上，轮到全知者。" : "没对上，记一下位置。";
      state.lockTimer = setTimeout(() => {
        state.lockTimer = 0;
        hide(a); hide(b);
        state.first = null; state.second = null; state.busy = false;
        if (nextTurn === "bot") {
          state.turn = "bot";
          updateHud();
          runBot();
        } else updateHud();
      }, 820);
    };

    const playerFlip = card => {
      if (!state.inGame || state.paused || state.busy || state.over) return;
      if (state.mode === "battle" && state.turn !== "player") return;
      if (!card || card.classList.contains("is-flipped") || card.classList.contains("is-matched")) return;
      if (!state.started) { state.started = true; state.startAt = performance.now(); }
      if (!reveal(card)) return;
      if (!state.first) {
        state.first = card;
        tipEl.textContent = "再翻一张，看看是不是「" + cardData(card).name + "」。";
        return;
      }
      state.second = card;
      state.moves++;
      updateHud();
      const a = state.first, b = card;
      if (cardData(a).id === cardData(b).id) {
        state.busy = true;
        tipEl.textContent = "对上了：「" + cardData(b).name + "」。";
        state.lockTimer = setTimeout(() => {
          state.lockTimer = 0;
          afterMatch(a, b, "player");
          if (state.over) return;
          state.busy = false;
          updateHud();
          tipEl.textContent = "配对成功，继续翻。";
        }, 280);
      } else {
        state.busy = true;
        markWrong(a, b, state.mode === "battle" ? "bot" : "player");
      }
    };

    const resolveBotPair = (a, b, token) => {
      if (token !== state.botToken || state.over) return;
      if (cardData(a).id === cardData(b).id) {
        afterMatch(a, b, "bot");
        setBubble(BOT_LINES.match);
        if (state.over) return;
        state.botTimer = setTimeout(() => {
          if (token !== state.botToken || state.over) return;
          state.busy = false;
          updateHud();
          runBotStep(token);
        }, 650);
      } else {
        setBubble(BOT_LINES.miss);
        state.botTimer = setTimeout(() => {
          if (token !== state.botToken || state.over) return;
          hide(a); hide(b);
          state.busy = false;
          state.turn = "player";
          state.first = null; state.second = null;
          updateHud();
          tipEl.textContent = "轮到你了。";
        }, 880);
      }
    };

    function runBotStep(token) {
      if (token !== state.botToken || state.over || state.paused || state.mode !== "battle" || state.turn !== "bot") return;
      const pair = knownPair();
      let a = null, b = null;
      if (pair) { a = pair[0]; b = pair[1]; }
      else {
        a = unseenRandom(null);
        if (!a) return;
      }
      state.busy = true;
      setBubble(BOT_LINES.before);
      reveal(a);
      updateHud();
      state.botTimer = setTimeout(() => {
        if (token !== state.botToken || state.over) return;
        if (!b) b = unseenRandom(a);
        if (!b) { state.busy = false; return; }
        reveal(b);
        updateHud();
        state.botTimer = setTimeout(() => resolveBotPair(a, b, token), 420);
      }, 480);
    }

    function runBot() {
      if (state.mode !== "battle" || state.over || state.paused || !state.inGame) return;
      state.turn = "bot";
      state.botToken++;
      updateHud();
      setBubble(BOT_LINES.before);
      const token = state.botToken;
      state.botTimer = setTimeout(() => runBotStep(token), 700);
    }

    opponentEl.addEventListener("click", touchOmn);
    opponentEl.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); touchOmn(); } });
    root.querySelectorAll("[data-setup-mode]").forEach(btn => btn.addEventListener("click", () => {
      state.mode = btn.dataset.setupMode;
      updateHud();
    }));
    root.querySelectorAll("[data-setup-diff]").forEach(btn => btn.addEventListener("click", () => {
      state.diff = btn.dataset.setupDiff;
      updateHud();
    }));
    root.querySelector("#mem-start").addEventListener("click", beginGame);
    root.querySelector("#mem-change").addEventListener("click", showSetup);
    root.querySelector("#mem-restart").addEventListener("click", () => startRound());
    root.querySelector("#mem-again").addEventListener("click", () => startRound());
    root.querySelector("#mem-next").addEventListener("click", showSetup);

    if (!pool.length) {
      root.innerHTML = '<div class="mem-shell"><h2>没有可用的混沌乱战立绘</h2></div>';
      return { destroy() { document.body.classList.remove("memory-mode"); }, pause() {}, resume() {}, restart() {}, isOver() { return true; }, escape() { return false; } };
    }

    showSetup();
    const handle = {
      destroy() {
        clearTimers(); state.paused = true; state.roundToken++; state.botToken++;
        document.body.classList.remove("memory-mode");
      },
      pause() {
        if (state.paused) return;
        if (state.started) state.elapsed += performance.now() - state.startAt;
        state.started = false; state.paused = true;
        clearInterval(state.tick); state.tick = 0;
        updateHud();
      },
      resume() {
        if (!state.paused) return;
        state.paused = false;
        state.started = !state.over && state.elapsed > 0;
        state.startAt = performance.now();
        state.tick = setInterval(() => { if (!state.paused && !state.over) timeEl.textContent = fmtTime(liveElapsed()); }, 200);
        updateHud();
      },
      restart() { if (state.inGame) startRound(); else beginGame(); },
      isOver() { return state.over; },
      escape() { return false; }
    };
    try {
      if (new URLSearchParams(location.search).has("debug")) handle._debug = { state, startRound, beginGame, showSetup, pool, runBot, knownPair };
    } catch (e) { /* ignore */ }
    return handle;
  }

  YZ.games.memory = {
    id: "memory",
    no: "06",
    kicker: "记忆 · CHESS MEMORY",
    title: "寻找二重身",
    subtitle: "练习、竞速，或者与全知者一战",
    desc: "牌背是主页封面图，牌面直接调用混沌乱战立绘。练习模式慢慢记，竞速模式计时通关，对战模式与全知者轮流翻牌。",
    emblem: '<span class="mem-card-emblem"><img src="img/System/title.jpg" alt="寻找二重身"><b>寻找<br>二重身</b></span>',
    mount,
    cardStat() {
      const s = storage.get((YZ.KEY && YZ.KEY.memory) || "yz_memory_v1", null);
      if (!s || !s["practice:normal"] || !s["practice:normal"].moves) return "练习 / 竞速 / 全知者";
      return "练习最佳 " + s["practice:normal"].moves + " 步";
    }
  };
})(window);
