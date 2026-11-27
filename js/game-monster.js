/* ============================================================
   勇一把 · 七项提示，七次机会
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const { util, storage, settings, audio, toast } = YZ;
  const MAX_TRIES = 7;
  const BUST_LABEL = { 1: "平板", 2: "小", 3: "软", 4: "大", 5: "巨乳" };
  const BUBBLES = [
    { key: "race", label: "种族", short: "族" },
    { key: "world", label: "世界", short: "界" },
    { key: "cg", label: "CG个数", short: "CG" },
    { key: "gender", label: "性别", short: "性" },
    { key: "forms", label: "形态数量", short: "形" },
    { key: "bust", label: "胸部大小", short: "胸" },
    { key: "length", label: "名称字数", short: "字" }
  ];

  const CLEAN_RE = /[\s\u3000・·•.,，。！？!?\-—_、；;：:“”"'‘’（）()【】\[\]《》<>/\\|]/g;
  const norm = s => String(s || "").toLowerCase().replace(CLEAN_RE, "");
  const countChars = s => Array.from(norm(s)).length;

  function splitList(s) {
    return String(s || "").split(/[、,，/／]/).map(x => x.trim()).filter(Boolean);
  }

  function familyOf(token) {
    const t = token;
    const tests = [
      ["insect", /虫|蜘蛛|蜂|蝶|蛾|蚁|蝎|蛞蝓|蜗/],
      ["plant", /植物|花|树|藤|蘑菇|藻|菌|草|曼德拉|史莱姆|黏液|触手/],
      ["undead", /幽灵|吸血|丧尸|骷髅|亡灵|死灵|僵尸|鬼/],
      ["dragon", /龙/],
      ["aquatic", /人鱼|鱼|海|水|潮/],
      ["construct", /人偶|机械|魔像|傀儡|人造/],
      ["beast", /魔兽|兽人|妖狐|猫|犬|兔|狼|狐|牛|马|羊|鸟|拉米亚|蜥蜴|虎|狮|熊|鼠|猪|猴|鹿|蛇|半兽/],
      ["demon", /淫魔|妖魔|恶魔|魔人|魅魔|梦魔|魔王|邪神/],
      ["humanoid", /人类|天使|堕天|精灵|妖精|亚人|神|半精灵/]
    ];
    for (const [name, re] of tests) if (re.test(t)) return name;
    return "other:" + t;
  }

  function raceState(guessRace, answerRace) {
    const g = splitList(guessRace), a = splitList(answerRace);
    if (!g.length || !a.length) return "bad";
    if (g.some(x => a.includes(x))) return "good";
    const gf = new Set(g.map(familyOf));
    const af = new Set(a.map(familyOf));
    for (const f of gf) if (af.has(f)) return "near";
    return "bad";
  }

  function worldState(guessWorld, answerWorld) {
    const g = splitList(guessWorld), a = splitList(answerWorld);
    if (!g.length || !a.length) return "bad";
    return g.some(x => a.includes(x)) ? "good" : "bad";
  }

  function numericState(g, a, tolerance) {
    if (g === a) return "good";
    return Math.abs(g - a) <= tolerance ? "near" : "bad";
  }

  function arrow(g, a) {
    if (g < a) return "↑";
    if (g > a) return "↓";
    return "";
  }

  function lengthState(guessLen, answerLen) {
    const d = guessLen - answerLen;
    if (d === 0) return { state: "good", arrow: "" };
    const arrows = (d > 0 ? "↓" : "↑").repeat(Math.min(2, Math.abs(d)));
    return { state: Math.abs(d) === 1 ? "near" : "bad", arrow: arrows };
  }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function nameMatch(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length !== y.length) return false;
    const limit = x.length >= 4 ? 2 : 1;
    return lev(x, y) <= limit;
  }

  function mount(root, api) {
    const DATA = YZ.guessData || [];
    const db = YZ.pieceDB;
    const displayName = m => db.monsterName(m.id) || m.name;
    const saved = storage.get(YZ.KEY.monsterGuess, { best: 0, wins: 0, plays: 0 }) || {};

    const state = {
      target: null,
      attempts: 0,
      over: false,
      won: false,
      paused: false,
      lastGuess: "",
      guessedKeys: new Set(),
      suggestions: [],
      suggestIndex: -1,
      hintUsed: false,
      hintCost: 0,
      history: [],
      currentFeedback: null,
      best: saved.best || 0,
      wins: saved.wins || 0,
      plays: saved.plays || 0
    };
    let index = new Map();

    root.innerHTML =
      '<div class="guess-layout">' +
        '<div class="guess-card">' +
          '<div class="guess-head">' +
            '<div><p class="kicker">GUESS THE MONSTER GIRL</p>' +
              '<h2 class="guess-title">这是谁？</h2>' +
              '<p class="guess-sub">看七项反馈，在 <b>7</b> 次内猜出名字。绿=命中，黄=接近，红=不接近；译名差一个字也算对。</p></div>' +
            '<div class="guess-attempt">' +
              '<div class="guess-attempt-text">第 <b id="guess-no">1</b> / ' + MAX_TRIES + ' 次</div>' +
              '<div class="guess-pips" id="guess-pips"></div>' +
              '<div class="guess-wrong">已错 <b id="guess-wrong">0</b> 次</div>' +
            "</div>" +
          "</div>" +
          '<div class="guess-bubbles" id="guess-bubbles"></div>' +
          '<div class="guess-history" id="guess-history" hidden></div>' +
          '<div class="guess-last" id="guess-last">还没有猜测，先输入一个名字。</div>' +
          '<form class="guess-form" id="guess-form" autocomplete="off">' +
            '<div class="guess-input-wrap">' +
              '<input id="guess-input" type="text" maxlength="32" placeholder="输入名字…" aria-label="输入猜测的名字" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="guess-suggest">' +
              '<div class="guess-suggest" id="guess-suggest" role="listbox" hidden></div>' +
            "</div>" +
            '<button class="btn primary" type="submit" id="guess-submit">猜一猜</button>' +
            '<button class="btn ghost guess-hint" type="button" id="guess-hint">提示 · 看轮廓 <small>消耗 3 次</small></button>' +
          "</form>" +
          '<div class="guess-hint-panel" id="guess-hint-panel" hidden></div>' +
          '<div class="guess-result" id="guess-result"></div>' +
          '<p class="guess-source">答案范围：<code>data/guessdata.xlsx</code> · ' + DATA.length + " 位角色</p>" +
        "</div>" +
      "</div>";

    const bubblesEl = root.querySelector("#guess-bubbles");
    const formEl = root.querySelector("#guess-form");
    const inputEl = root.querySelector("#guess-input");
    const submitEl = root.querySelector("#guess-submit");
    const noEl = root.querySelector("#guess-no");
    const pipsEl = root.querySelector("#guess-pips");
    const lastEl = root.querySelector("#guess-last");
    const historyEl = root.querySelector("#guess-history");
    const resultEl = root.querySelector("#guess-result");
    const wrongEl = root.querySelector("#guess-wrong");
    const suggestEl = root.querySelector("#guess-suggest");
    const inputWrapEl = root.querySelector(".guess-input-wrap");
    const hintBtn = root.querySelector("#guess-hint");
    const hintPanel = root.querySelector("#guess-hint-panel");

    function renderEmptyBubbles() {
      bubblesEl.innerHTML = BUBBLES.map(b =>
        '<div class="guess-bubble empty" data-key="' + b.key + '">' +
        '<span class="gb-mark">?</span><span class="gb-label">' + b.label + '</span><span class="gb-value">—</span></div>'
      ).join("");
    }

    function refreshMeta() {
      noEl.textContent = Math.min(state.over ? state.attempts : state.attempts + 1, MAX_TRIES);
      pipsEl.innerHTML = Array.from({ length: MAX_TRIES }, (_, i) => {
        let cls = "guess-pip";
        if (i < state.attempts) cls += " used";
        if (i === state.attempts && !state.over) cls += " current";
        return '<i class="' + cls + '"></i>';
      }).join("");
      if (wrongEl) wrongEl.textContent = String(wrongCount());
      if (hintBtn) {
        const canHint = !state.over && !state.hintUsed && state.attempts + 3 < MAX_TRIES;
        hintBtn.disabled = !canHint;
        hintBtn.innerHTML = state.hintUsed ? "轮廓已显示" : '提示 · 看轮廓 <small>消耗 3 次</small>';
      }
      api.setStatus("第 " + Math.min(state.attempts + 1, MAX_TRIES) + " / " + MAX_TRIES + " 次 · 猜名字");
    }

    function wrongCount() {
      return Math.max(0, state.attempts - state.hintCost - (state.won ? 1 : 0));
    }

    function hideSuggest() {
      state.suggestions = [];
      state.suggestIndex = -1;
      if (suggestEl) {
        suggestEl.hidden = true;
        suggestEl.innerHTML = "";
      }
      if (inputEl) inputEl.setAttribute("aria-expanded", "false");
    }

    function showSuggest() {
      const q = norm(inputEl.value);
      if (!q) { hideSuggest(); return; }
      const seen = new Set();
      const scored = [];
      for (const m of DATA) {
        const name = displayName(m);
        const n = norm(name);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        let score = 0;
        if (n.startsWith(q)) score += 100;
        else if (n.includes(q)) score += 55;
        const d = lev(q, n);
        if (d === 0) score += 80;
        else if (d === 1) score += 32;
        else if (d <= 2 && q.length >= 2) score += 11;
        if (score <= 0) continue;
        score -= Math.abs(n.length - q.length) * 0.7;
        scored.push({ name, m, score, d });
      }
      scored.sort((a, b) => b.score - a.score || a.d - b.d || a.name.length - b.name.length);
      const list = scored.slice(0, 8);
      state.suggestions = list;
      state.suggestIndex = -1;
      if (!list.length) { hideSuggest(); return; }
      suggestEl.innerHTML = list.map((it, i) =>
        '<button type="button" class="guess-suggest-item" role="option" data-suggest="' + i + '">' +
        '<strong>' + util.escapeHtml(it.name) + "</strong>" +
        '<small>' + util.escapeHtml(it.m.race) + " · " + util.escapeHtml(it.m.world) + "</small></button>"
      ).join("");
      suggestEl.hidden = false;
      inputEl.setAttribute("aria-expanded", "true");
    }

    function pickSuggest(i) {
      const it = state.suggestions[i];
      if (!it) return;
      inputEl.value = it.name;
      hideSuggest();
      inputEl.focus();
      try { inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length); } catch (e) { /* ignore */ }
    }

    function moveSuggest(delta) {
      if (!state.suggestions.length || suggestEl.hidden) return false;
      state.suggestIndex = (state.suggestIndex + delta + state.suggestions.length) % state.suggestions.length;
      suggestEl.querySelectorAll(".guess-suggest-item").forEach((n, i) => n.classList.toggle("active", i === state.suggestIndex));
      return true;
    }

    function buildIndex() {
      index = new Map();
      for (const m of DATA) {
        const names = [displayName(m), m.name];
        for (const n of names) {
          const k = norm(n);
          if (k && !index.has(k)) index.set(k, m);
        }
      }
    }

    function resolveGuess(raw) {
      const key = norm(raw);
      if (index.has(key)) return index.get(key);
      let best = null, bestD = 999;
      const maxLen = key.length >= 4 ? 2 : 1;
      for (const m of DATA) {
        for (const n of [displayName(m), m.name]) {
          const k = norm(n);
          if (!k) continue;
          if (Math.abs(k.length - key.length) > maxLen) continue;
          const d = lev(key, k);
          if (d < bestD) { bestD = d; best = m; }
          if (d === 0) return m;
        }
      }
      if (best && bestD <= maxLen) return best;
      return null;
    }

    function targetMatches(raw) {
      return nameMatch(raw, displayName(state.target)) || nameMatch(raw, state.target.name);
    }

    function makeFeedback(raw, g, target) {
      const guessLen = countChars(raw);
      const answerLen = countChars(displayName(target));
      const ls = lengthState(guessLen, answerLen);
      const rs = raceState(g.race, target.race);
      const ws = worldState(g.world, target.world);
      const cgS = numericState(g.cg, target.cg, 2);
      const formS = numericState(g.forms, target.forms, 1);
      const bustS = numericState(g.bust, target.bust, 1);
      return {
        race: { state: rs, value: g.race || "未知", mark: rs === "good" ? "✓" : rs === "near" ? "≈" : "×" },
        world: { state: ws, value: g.world || "未知", mark: ws === "good" ? "✓" : "×" },
        cg: { state: cgS, value: String(g.cg) + (arrow(g.cg, target.cg) ? " " + arrow(g.cg, target.cg) : ""), mark: cgS === "good" ? "✓" : cgS === "near" ? "≈" : "×" },
        gender: { state: g.gender === target.gender ? "good" : "bad", value: g.gender || "未知", mark: g.gender === target.gender ? "✓" : "×" },
        forms: { state: formS, value: String(g.forms) + (arrow(g.forms, target.forms) ? " " + arrow(g.forms, target.forms) : ""), mark: formS === "good" ? "✓" : formS === "near" ? "≈" : "×" },
        bust: { state: bustS, value: g.bust + " · " + (BUST_LABEL[g.bust] || "?") + (arrow(g.bust, target.bust) ? " " + arrow(g.bust, target.bust) : ""), mark: bustS === "good" ? "✓" : bustS === "near" ? "≈" : "×" },
        length: { state: ls.state, value: guessLen + (ls.arrow ? " " + ls.arrow : ""), mark: ls.state === "good" ? "✓" : ls.state === "near" ? "≈" : "×" }
      };
    }

    function renderHistory() {
      if (!historyEl) return;
      if (!state.history.length) {
        historyEl.hidden = true;
        historyEl.innerHTML = "";
        return;
      }
      historyEl.hidden = false;
      const stateName = { good: "命中", near: "接近", bad: "较远" };
      const rows = state.history.map((item, idx) => {
        const minis = BUBBLES.map(b => {
          const f = item.fb[b.key];
          return '<i class="' + f.state + '" title="' + util.escapeHtml(b.label + "：" + f.value + "（" + (stateName[f.state] || "") + "）") + '">' + b.short + "</i>";
        }).join("");
        return '<div class="guess-history-row"><span class="guess-history-name">第' + (idx + 1) + '猜 · ' + util.escapeHtml(item.name) + "</span>" +
          '<span class="guess-history-mini">' + minis + "</span></div>";
      }).join("");
      historyEl.innerHTML = '<div class="guess-history-head"><span>前面的失败</span><small>' + state.history.length + " / 6</small></div>" +
        '<div class="guess-history-list">' + rows + "</div>";
    }

    function rememberCurrent() {
      if (!state.currentFeedback) return;
      state.history.push({ name: state.lastGuess, fb: state.currentFeedback });
      if (state.history.length > 6) state.history.shift();
    }

    function applyFeedback(fb) {
      for (const b of BUBBLES) {
        const node = bubblesEl.querySelector('[data-key="' + b.key + '"]');
        if (!node) continue;
        const f = fb[b.key];
        node.className = "guess-bubble " + f.state;
        node.innerHTML = '<span class="gb-mark">' + f.mark + "</span>" +
          '<span class="gb-label">' + b.label + "</span>" +
          '<span class="gb-value">' + util.escapeHtml(f.value) + "</span>";
        node.classList.remove("flip");
        void node.offsetWidth;
        node.classList.add("flip");
      }
    }

    function pickTarget() {
      if (!DATA.length) return null;
      let next = DATA[Math.floor(Math.random() * DATA.length)];
      if (DATA.length > 1 && state.target && next.id === state.target.id) {
        next = DATA[(DATA.indexOf(next) + 1) % DATA.length];
      }
      return next;
    }

    function startRound() {
      state.target = pickTarget();
      state.attempts = 0;
      state.over = false;
      state.won = false;
      state.paused = false;
      state.lastGuess = "";
      state.guessedKeys.clear();
      state.suggestions = [];
      state.suggestIndex = -1;
      state.hintUsed = false;
      state.hintCost = 0;
      state.history = [];
      state.currentFeedback = null;
      hideSuggest();
      renderHistory();
      buildIndex();
      renderEmptyBubbles();
      lastEl.textContent = "还没有猜测，先输入一个名字。";
      resultEl.innerHTML = "";
      resultEl.className = "guess-result";
      if (hintPanel) { hintPanel.hidden = true; hintPanel.innerHTML = ""; }
      formEl.style.display = "";
      inputEl.disabled = false;
      submitEl.disabled = false;
      inputEl.value = "";
      refreshMeta();
      setTimeout(() => { try { inputEl.focus(); } catch (e) { /* ignore */ } }, 80);
      if (!DATA.length) {
        lastEl.textContent = "没有读到 guessdata，请确认 js/guess-data.js 存在。";
      }
    }

    function finish(won) {
      state.over = true;
      state.won = won;
      state.plays++;
      if (won) {
        state.wins++;
        state.best = state.best ? Math.min(state.best, state.attempts) : state.attempts;
      }
      storage.set(YZ.KEY.monsterGuess, { best: state.best, wins: state.wins, plays: state.plays });
      if (won && YZ.achievements) YZ.achievements.recordGuessWins(state.wins);
      formEl.style.display = "none";
      inputEl.disabled = true;
      submitEl.disabled = true;
      refreshMeta();
      renderHistory();
      const t = state.target;
      const name = util.escapeHtml(displayName(t));
      const profile = [
        ["种族", t.race], ["世界", t.world], ["CG", t.cg], ["性别", t.gender],
        ["形态", t.forms], ["胸部", t.bust + " · " + (BUST_LABEL[t.bust] || "?")], ["字数", countChars(displayName(t))]
      ];
      resultEl.className = "guess-result show " + (won ? "win" : "lose");
      const headSrc = "img/guess_head/" + encodeURIComponent(t.name) + ".png";
      resultEl.innerHTML = '<div class="guess-result-card">' +
        '<p class="kicker">' + (won ? "GUESSED IT" : "OUT OF TRIES") + "</p>" +
        "<h3>" + (won ? "猜对了！" : "机会用完了") + "</h3>" +
        '<div class="guess-result-hero">' +
          '<img class="guess-answer-portrait" src="' + headSrc + '" alt="' + name + '">' +
          '<div class="guess-result-copy"><p class="guess-answer">答案：<b>' + name + "</b>" +
            (won ? " · 用了 " + state.attempts + " 次 · 错 " + wrongCount() + " 次" : " · 错 " + wrongCount() + " 次") +
          "</p></div>" +
        "</div>" +
        '<div class="guess-profile">' + profile.map(p => "<span><em>" + p[0] + "</em>" + util.escapeHtml(String(p[1])) + "</span>").join("") + "</div>" +
        '<button class="btn primary" id="guess-again">再来一局</button>' +
        "</div>";
      const portrait = resultEl.querySelector(".guess-answer-portrait");
      if (portrait) portrait.addEventListener("error", () => portrait.classList.add("missing"));
      resultEl.querySelector("#guess-again").addEventListener("click", startRound);
      audio.sfx(won ? "win" : "lose");
      api.setStatus(won ? "猜对了 · 用了 " + state.attempts + " 次" : "机会用完了 · 答案是 " + displayName(t));
    }

    function showHint() {
      if (state.over || state.paused || !state.target || state.hintUsed) return;
      if (state.attempts + 3 >= MAX_TRIES) {
        toast("剩余次数不足，不能用轮廓提示", "gold");
        return;
      }
      state.attempts += 3;
      state.hintCost += 3;
      state.hintUsed = true;
      const name = displayName(state.target);
      const src = "img/guess_head/" + encodeURIComponent(state.target.name) + ".png";
      hintPanel.hidden = false;
      hintPanel.innerHTML = '<div class="guess-hint-card">' +
        '<p class="kicker">SILHOUETTE</p>' +
        '<div class="guess-silhouette"><img src="' + src + '" alt="答案轮廓"></div>' +
        '<p>这是答案的轮廓 · 已消耗 3 次猜测</p></div>';
      const img = hintPanel.querySelector("img");
      if (img) img.addEventListener("error", () => { img.style.display = "none"; hintPanel.querySelector(".guess-silhouette").textContent = "??? 轮廓缺失"; });
      refreshMeta();
      audio.sfx("select");
      toast("已消耗 3 次，显示答案轮廓", "gold");
    }

    function submitGuess() {
      if (state.over || state.paused || !state.target) return;
      const raw = inputEl.value.trim();
      if (!raw) { toast("先输入一个名字", "gold"); inputEl.focus(); return; }
      const key = norm(raw);
      if (!key) { toast("这个名字没有有效字符", "bad"); return; }
      if (state.guessedKeys.has(key)) { toast("这个名字已经猜过了", "gold"); inputEl.select(); return; }

      const correct = nameMatch(raw, displayName(state.target)) || nameMatch(raw, state.target.name);
      const resolved = correct ? state.target : resolveGuess(raw);
      if (!resolved) {
        toast("名册里没有找到这个名字，再试一次", "bad");
        inputEl.select();
        return;
      }

      hideSuggest();
      rememberCurrent();
      state.attempts++;
      state.lastGuess = raw;
      state.guessedKeys.add(key);
      const fb = makeFeedback(raw, resolved, state.target);
      state.currentFeedback = fb;
      applyFeedback(fb);
      renderHistory();
      lastEl.innerHTML = "本次猜测：<b>" + util.escapeHtml(raw) + "</b>" + (resolved.id !== state.target.id ? "" : "");
      inputEl.value = "";
      refreshMeta();
      audio.sfx(correct ? "correct" : "wrong");

      if (correct) { finish(true); return; }
      if (state.attempts >= MAX_TRIES) { finish(false); return; }
      inputEl.focus();
    }

    inputEl.addEventListener("input", showSuggest);
    inputEl.addEventListener("focus", () => { if (inputEl.value.trim()) showSuggest(); });
    inputEl.addEventListener("blur", () => setTimeout(hideSuggest, 140));
    inputEl.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { if (moveSuggest(1)) e.preventDefault(); }
      else if (e.key === "ArrowUp") { if (moveSuggest(-1)) e.preventDefault(); }
      else if (e.key === "Escape") { if (!suggestEl.hidden) { e.preventDefault(); hideSuggest(); } }
      else if (e.key === "Enter") {
        if (!suggestEl.hidden && state.suggestIndex >= 0) {
          e.preventDefault();
          pickSuggest(state.suggestIndex);
        }
      }
    });
    suggestEl.addEventListener("pointerdown", e => {
      const item = e.target.closest("[data-suggest]");
      if (item) { e.preventDefault(); pickSuggest(+item.dataset.suggest); }
    });
    formEl.addEventListener("submit", e => { e.preventDefault(); hideSuggest(); submitGuess(); });
    hintBtn.addEventListener("click", showHint);
    function onHintKey(e) {
      if (e.key !== "h" && e.key !== "H") return;
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      showHint();
    }
    global.addEventListener("keydown", onHintKey);
    root.addEventListener("pointerdown", () => audio.unlock(), { once: true });
    renderEmptyBubbles();
    startRound();

    const handle = {
      destroy() { global.removeEventListener("keydown", onHintKey); },
      pause() { state.paused = true; },
      resume() { state.paused = false; setTimeout(() => { try { inputEl.focus(); } catch (e) { /* ignore */ } }, 30); },
      restart: startRound,
      isOver() { return state.over; },
      escape() { return false; }
    };
    try {
      if (new URLSearchParams(location.search).has("debug")) {
        handle._debug = { state, DATA, displayName, makeFeedback, resolveGuess, countChars };
      }
    } catch (e) { /* ignore */ }
    return handle;
  }

  YZ.games.monster = {
    id: "monster",
    no: "04",
    kicker: "竞猜 · NAME GUESS",
    title: "勇一把",
    subtitle: "七项提示，七次机会",
    desc: "输入名字，用种族、世界、CG 数、性别、形态、胸部与字数七个气泡来缩小范围。七次机会，译名差一个字也算对。",
    emblem: '<span class="emblem-svg"><svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="24" cy="30" r="12" fill="#ff8cbe"/><circle cx="50" cy="24" r="12" fill="#ffd45e"/><circle cx="76" cy="30" r="12" fill="#7fd7a8"/>' +
      '<circle cx="18" cy="56" r="12" fill="#8fd8ff"/><circle cx="50" cy="50" r="12" fill="#b89aff"/><circle cx="82" cy="56" r="12" fill="#ff9f9f"/>' +
      '<circle cx="50" cy="76" r="12" fill="#ffcf8a"/>' +
      '<text x="50" y="58" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="24" font-weight="800" fill="#1e3152">?</text></svg></span>',
    mount,
    cardStat() {
      const s = storage.get(YZ.KEY.monsterGuess, null);
      if (!s || !s.best) return "7 次内猜中";
      return "最佳 " + s.best + " 次 · 胜 " + (s.wins || 0);
    }
  };
})(window);
