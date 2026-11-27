/* ============================================================
   同人小游戏合集 — 应用层
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const { $, $$, util, settings, toast, audio } = YZ;

  const GAME_ORDER = ["cchess", "chess", "suika", "monster", "arena", "memory"];
  const SETUP_GAMES = { cchess: true, chess: true };
  const SIDE_TRACK = {
    red: "dungeon_irias", white: "dungeon_irias",
    black: "fieldm"
  };

  let currentScreen = "title";
  let currentId = null;
  let currentHandle = null;
  let paused = false;
  let showcaseIndex = 0;
  let showcaseTimer = 0;
  let setupGameId = null;
  let setupSide = "";
  let setupRandom = false;
  let setupOpponent = "";
  let suikaIconTaps = 0;
  let suikaIconTimer = 0;
  let suikaIconFrame = 0;
  let setupDiff = "normal";

  /* ---------------- 屏幕 ---------------- */
  function showScreen(name) {
    currentScreen = name;
    $$(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + name));
    document.body.classList.toggle("in-game", name === "game");
    document.body.classList.toggle("in-splash", name === "title");
    if (name === "home") {
      refreshStats();
      renderShowcase(true);
      scheduleShowcase();
      audio.playTrack("ending4-0");
    } else {
      stopShowcaseTimer();
    }
    if (name === "title") {
      audio.playTrack("ending4-0");
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- 开场 ---------------- */
  let splashDone = false;
  function startFromSplash() {
    if (splashDone || currentScreen !== "title") return;
    splashDone = true;
    audio.unlock();
    audio.playTrack("ending4-0");
    audio.sfx("start");
    showScreen("home");
  }

  /* ---------------- 主页随机棋子 ---------------- */
  function showcasePool() {
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
        if (db.chessArt(f.side, type, slot, f.key)) out.push({ faction: f.key, chessSide: f.side, army: f.army, type, slot });
      }
    }
    return out;
  }

  function renderShowcase(animate) {
    const db = YZ.pieceDB;
    const artEl = $("#showcase-art");
    const nameEl = $("#showcase-name");
    const roleEl = $("#showcase-role");
    if (!db || !artEl || !nameEl) return;
    const pool = showcasePool();
    if (!pool.length) return;
    if (pool.length > 1) {
      let next = Math.floor(Math.random() * pool.length);
      if (next === showcaseIndex) next = (next + 1) % pool.length;
      showcaseIndex = next;
    }
    const p = pool[showcaseIndex];
    const art = db.chessArt(p.chessSide, p.type, p.slot, p.faction);
    const name = db.chessName(p.chessSide, p.type, p.slot, p.faction);
    const role = p.army + " · " + ((db.meta && db.meta.chessLabel && db.meta.chessLabel[p.type]) || "棋子");
    nameEl.textContent = name;
    roleEl.textContent = role;
    if (animate) {
      artEl.classList.remove("switching");
      void artEl.offsetWidth;
      artEl.classList.add("switching");
    }
    artEl.innerHTML = art
      ? '<img src="img/chess/art/' + art + '.png" alt="' + util.escapeHtml(name) + '">'
      : '<span class="showcase-glyph">棋</span><span class="showcase-note">混沌乱战棋子</span>';
    clearTimeout(renderShowcase._t);
    if (animate) {
      renderShowcase._t = setTimeout(() => artEl.classList.remove("switching"), 420);
    }
  }

  function nextShowcase() {
    renderShowcase(true);
    audio.sfx("click");
    scheduleShowcase();
  }

  function scheduleShowcase() {
    stopShowcaseTimer();
    if (!settings.get("motion")) return;
    showcaseTimer = setInterval(() => {
      if (currentScreen === "home" && !document.hidden) renderShowcase(true);
    }, 7000);
  }

  function stopShowcaseTimer() {
    if (showcaseTimer) clearInterval(showcaseTimer);
    showcaseTimer = 0;
  }

  /* ---------------- 游戏卡片 ---------------- */
  function buildGameCards() {
    const grid = $("#game-grid");
    if (!grid) return;
    clearInterval(suikaIconTimer);
    suikaIconTimer = 0;
    grid.innerHTML = "";
    for (const id of GAME_ORDER) {
      const g = YZ.games[id];
      if (!g) continue;
      const card = document.createElement("button");
      card.className = "game-card";
      card.dataset.game = id;
      card.setAttribute("aria-label", "开始 " + g.title);
      card.innerHTML =
        '<span class="card-emblem">' + g.emblem + "</span>" +
        '<span class="card-kicker">' + g.no + " · " + g.kicker + "</span>" +
        '<span class="card-title">' + g.title + "</span>" +
        '<span class="card-desc">' + g.desc + "</span>" +
        '<span class="card-stat" id="stat-' + id + '">' + (g.cardStat ? g.cardStat() : "") + "</span>" +
        '<span class="card-go">进入 <b>→</b></span>';
      card.addEventListener("mouseenter", () => audio.sfx("click"));
      card.addEventListener("click", () => launchGame(id));
      if (id === "suika") {
        card.classList.add("suika-card");
        const emblem = card.querySelector(".card-emblem");
        if (emblem) {
          emblem.classList.add("suika-emblem");
          const icon = emblem.querySelector("img");
          if (icon) {
            suikaIconFrame = 0;
            suikaIconTimer = setInterval(() => {
              if (currentScreen !== "home") return;
              suikaIconFrame = (suikaIconFrame + 1) % 11;
              icon.src = "img/ball/icon-" + (suikaIconFrame + 1) + ".png";
            }, 1100);
          }
          emblem.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            suikaIconTaps++;
            audio.sfx("click");
            emblem.classList.remove("shake");
            void emblem.offsetWidth;
            emblem.classList.add("shake");
            setTimeout(() => emblem.classList.remove("shake"), 460);
            if (suikaIconTaps >= 7 && YZ.judgement) {
              suikaIconTaps = 0;
              if (YZ.achievements) YZ.achievements.unlock("suika-judgement");
              YZ.judgement.trigger("icon");
            }
          });
        }
      }
      grid.appendChild(card);
    }

    const randomCard = document.createElement("button");
    randomCard.className = "game-card game-card-random";
    randomCard.dataset.game = "random";
    randomCard.setAttribute("aria-label", "随机打开一个游戏");
    randomCard.innerHTML =
      '<span class="card-emblem"><span class="glyph-emblem">🎲</span></span>' +
      '<span class="card-kicker">RANDOM · 随机</span>' +
      '<span class="card-title">随机游戏</span>' +
      '<span class="card-desc">不知道玩什么？把选择交给骰子。</span>' +
      '<span class="card-stat">' + GAME_ORDER.length + ' 选一</span>' +
      '<span class="card-go">开始 <b>→</b></span>';
    randomCard.addEventListener("mouseenter", () => audio.sfx("click"));
    randomCard.addEventListener("click", () => {
      const pick = GAME_ORDER[Math.floor(Math.random() * GAME_ORDER.length)];
      launchGame(pick);
    });
    grid.appendChild(randomCard);


  }

  function refreshStats() {
    for (const id of GAME_ORDER) {
      const g = YZ.games[id];
      const node = document.getElementById("stat-" + id);
      if (g && node && g.cardStat) node.textContent = g.cardStat();
    }
  }

  /* ---------------- 开局选择 ---------------- */
  function trackForSide(side) {
    return SIDE_TRACK[side] || "ending4-0";
  }

  function setupFactionKey(game, value) {
    if (!value) return "";
    const f = YZ.factions.get(game, value);
    if (f) return f.key;
    return YZ.factions.keyForSide(game, value);
  }

  function openSetup(id, preferSide) {
    const def = YZ.games[id];
    if (!def) return;
    setupGameId = id;
    setupSide = setupFactionKey(id, preferSide);
    setupRandom = false;
    setupOpponent = "";
    setupDiff = settings.get("ai") || "normal";
    $("#game-setup").hidden = false;
    $("#game-restart").style.display = "none";
    $("#game-pause").style.display = "none";
    $("#game-mount").style.display = "none";
    $("#game-mount").innerHTML = "";
    $("#game-subtitle").textContent = "选择阵营与难度";
    audio.playTrack("ending4-0");
    renderSetup();
  }

  function renderSetup() {
    const box = $("#game-setup");
    const id = setupGameId;
    const db = YZ.pieceDB;
    const isChess = id === "chess";
    const gameKey = isChess ? "chess" : "cchess";
    const sides = YZ.factions.all(gameKey).map(f => ({
      key: f.key,
      side: f.side,
      army: f.army || db.army(gameKey, f.side),
      tag: f.tag,
      art: f.avatar,
      first: !!f.first,
      track: f.track || trackForSide(f.side)
    }));
    const setupFaction = id === "chess" ? YZ.factions.get("chess", setupSide) : null;
    const opponentSides = setupFaction ? sides.filter(s => s.key !== setupFaction.key) : [];
    const enemySide = setupFaction ? (setupFaction.side === "white" ? "black" : "white") : "";
    if (setupFaction && (!setupOpponent || !opponentSides.some(s => s.key === setupOpponent))) {
      setupOpponent = ({ white: "black", black: "white", ruka: "chaos", chaos: "ruka" }[setupFaction.key]) || (opponentSides[0] && opponentSides[0].key) || "";
    }
    const diffs = [
      { key: "easy", label: "轻松", note: "随便下下" },
      { key: "normal", label: "普通", note: "会认真一点" },
      { key: "hard", label: "困难", note: "不让你悔棋" }
    ];
    box.innerHTML =
      '<div class="setup-panel">' +
        '<div class="setup-head"><div><p class="kicker">NEW GAME</p><h2>开局</h2>' +
        '<p class="setup-sub">选择你要执的阵营和电脑棋力。阵营不同，出场的音乐也不同。</p></div>' +
        '<button class="close-btn" data-setup-back aria-label="返回">✕</button></div>' +
        '<p class="setup-label">选择阵营 · 共 ' + sides.length + ' 支</p>' +
        '<div class="setup-sides">' + sides.map(s =>
          '<button class="setup-side' + (!setupRandom && setupSide === s.key ? " active" : "") + '" data-side="' + s.key + '">' +
          '<span class="setup-side-art"><img src="' + s.art + '" alt=""></span>' +
          '<span class="setup-side-copy"><strong>' + util.escapeHtml(s.army) + '</strong><small>' + s.tag + ' · ' + (isChess ? "先手随机" : (s.first ? "先手" : "后手")) + '</small></span>' +
          '<span class="setup-side-check">✓</span></button>'
        ).join("") +
          '<button class="setup-side random' + (setupRandom ? " active" : "") + '" data-random aria-label="随机阵营">' +
            '<span class="setup-side-art random-art">🎲</span>' +
            '<span class="setup-side-copy"><strong>随机阵营</strong><small>交给运气</small></span>' +
            '<span class="setup-side-check">✓</span></button>' +
          '<div class="setup-side more" aria-disabled="true">' +
            '<span class="setup-side-art more-art">＋</span>' +
            '<span class="setup-side-copy"><strong>更多阵营</strong><small>未来可能会更新更多阵营<br><em>——可能也不会。</em></small></span>' +
          "</div></div>" +
        (isChess && setupFaction ? '<p class="setup-label">选择敌人 · 共 ' + opponentSides.length + ' 支（四阵营独立）</p>' +
          '<div class="setup-sides setup-opponents">' + opponentSides.map(s =>
            '<button class="setup-side' + (setupOpponent === s.key ? " active" : "") + '" data-opponent="' + s.key + '">' +
            '<span class="setup-side-art"><img src="' + s.art + '" alt=""></span>' +
            '<span class="setup-side-copy"><strong>' + util.escapeHtml(s.army) + '</strong><small>敌方 · 执' + (enemySide === "black" ? "黑" : "白") + '</small></span>' +
            '<span class="setup-side-check">✓</span></button>'
          ).join("") + "</div>" : "") +
        '<p class="setup-label">电脑棋力</p>' +
        '<div class="setup-diffs">' + diffs.map(d =>
          '<button class="setup-diff' + (setupDiff === d.key ? " active" : "") + '" data-diff="' + d.key + '">' +
          '<strong>' + d.label + '</strong><small>' + d.note + '</small></button>'
        ).join("") + "</div>" +
        '<div class="setup-actions"><button class="btn ghost" data-setup-back>返回主页</button>' +
        '<button class="btn primary" id="setup-start"' + (setupSide ? "" : " disabled") + ">" +
        (setupSide ? (setupRandom ? "随机开局 · " + util.escapeHtml(sides.find(s => s.key === setupSide).army) : "以" + util.escapeHtml(sides.find(s => s.key === setupSide).army) + "开局") : "先选一个阵营") + "</button></div>" +
      "</div>";
    box.querySelectorAll("[data-side]").forEach(btn => {
      btn.addEventListener("click", () => {
        setupSide = btn.dataset.side;
        setupRandom = false;
        setupOpponent = ({ white: "black", black: "white", ruka: "chaos", chaos: "ruka" }[setupSide]) || "";
        const picked = sides.find(s => s.key === setupSide);
        if (picked) audio.playTrack(picked.track);
        audio.sfx("select");
        renderSetup();
      });
    });
    box.querySelectorAll("[data-random]").forEach(btn => {
      btn.addEventListener("click", () => {
        const pick = sides[Math.floor(Math.random() * sides.length)];
        if (!pick) return;
        setupSide = pick.key;
        setupRandom = true;
        setupOpponent = ({ white: "black", black: "white", ruka: "chaos", chaos: "ruka" }[pick.key]) || "";
        audio.playTrack(pick.track);
        audio.sfx("select");
        renderSetup();
      });
    });
    box.querySelectorAll("[data-opponent]").forEach(btn => {
      btn.addEventListener("click", () => {
        setupOpponent = btn.dataset.opponent;
        audio.sfx("select");
        renderSetup();
      });
    });
    box.querySelectorAll("[data-diff]").forEach(btn => {
      btn.addEventListener("click", () => {
        setupDiff = btn.dataset.diff;
        audio.sfx("click");
        renderSetup();
      });
    });
    box.querySelectorAll("[data-setup-back]").forEach(btn => {
      btn.addEventListener("click", exitGame);
    });
    const start = $("#setup-start");
    if (start) start.addEventListener("click", startSetupGame);
  }

  function startSetupGame() {
    if (!setupGameId || !setupSide) return;
    const id = setupGameId;
    const faction = YZ.factions.get(id, setupSide);
    if (!faction) return;
    const side = faction.side;
    const diff = setupDiff;
    settings.set("ai", diff);
    audio.playTrack(faction.track || trackForSide(side));
    $("#game-setup").hidden = true;
    $("#game-mount").style.display = "";
    setupGameId = null;
    audio.sfx("start");
    const opponentKey = id === "chess" ? (setupOpponent || "") : "";
    mountCurrent(id, side, faction.key, opponentKey);
  }

  /* ---------------- 启动游戏 ---------------- */
  function cleanupGame() {
    stopShowcaseTimer();
    if (currentHandle && typeof currentHandle.destroy === "function") {
      try { currentHandle.destroy(); } catch (e) { console.warn(e); }
    }
    currentHandle = null;
    currentId = null;
    paused = false;
    setupGameId = null;
    setupSide = "";
    setupOpponent = "";
    YZ.modal.close("pause");
    const setup = $("#game-setup");
    if (setup) { setup.hidden = true; setup.innerHTML = ""; }
    const rbtn = $("#game-restart"), pbtn = $("#game-pause");
    if (rbtn) rbtn.style.display = "";
    if (pbtn) pbtn.style.display = "";
    const mount = $("#game-mount");
    if (mount) mount.style.display = "";
  }

  function mountCurrent(id, startSide, startFaction, opponentFaction) {
    const def = YZ.games[id];
    if (!def) return;
    const mount = $("#game-mount");
    mount.innerHTML = "";
    mount.scrollTop = 0;
    $("#game-restart").style.display = "";
    $("#game-pause").style.display = "";
    $("#game-title").textContent = def.title;
    $("#game-subtitle").textContent = def.subtitle || "";
    const api = {
      onExit: exitGame,
      setStatus: text => { const n = $("#game-subtitle"); if (n) n.textContent = text; },
      openPause: pauseGame,
      toast,
      audio,
      settings,
      storage: YZ.storage,
      KEY: YZ.KEY,
      util,
      startSide: startSide || "",
      startFaction: startFaction || "",
      opponentFaction: opponentFaction || "",
      isPaused: () => paused
    };
    try {
      currentHandle = def.mount(mount, api) || {};
    } catch (err) {
      console.error("[YZ] game mount failed:", err);
      mount.innerHTML = '<div class="game-panel" style="margin:40px auto;max-width:520px;padding:28px;text-align:center">' +
        "<h3 style=\"font-family:var(--serif);font-size:24px\">这个游戏没爬起来</h3>" +
        "<p style=\"margin-top:10px;color:var(--muted);font-size:12px\">" + util.escapeHtml(err && err.message || err) + "</p>" +
        '<button class="btn primary" style="margin-top:18px" onclick="YZ.app.exitGame()">返回主页</button></div>';
    }
  }

  function launchGame(id, opts) {
    const def = YZ.games[id];
    if (!def) return;
    cleanupGame();
    currentId = id;
    showScreen("game");
    $("#game-title").textContent = def.title;
    $("#game-subtitle").textContent = def.subtitle || "";
    if (SETUP_GAMES[id]) {
      openSetup(id, opts && opts.side);
      return;
    }
    $("#game-setup").hidden = true;
    $("#game-mount").style.display = "";
    audio.playTrack(id === "monster" ? "scene_comi1" : (id === "suika" ? "ruka" : (id === "arena" ? "boss_chaos5" : (id === "memory" ? "kioku1" : "ending4-0"))));
    audio.sfx("start");
    mountCurrent(id, "", "", "");
  }

  function exitGame() {
    cleanupGame();
    showScreen("home");
    refreshStats();
    audio.playTrack("ending4-0");
  }

  function restartGame() {
    if (!currentHandle) {
      if (setupGameId) { openSetup(setupGameId, setupSide); }
      return;
    }
    if (typeof currentHandle.restart === "function") {
      try { currentHandle.restart(); } catch (e) { console.warn(e); }
    }
    YZ.modal.close("pause");
    paused = false;
    audio.sfx("start");
    toast("已重新开始", "gold");
  }

  function pauseGame() {
    if (!currentHandle || setupGameId || paused) return;
    paused = true;
    if (typeof currentHandle.pause === "function") {
      try { currentHandle.pause(); } catch (e) { console.warn(e); }
    }
    YZ.modal.open("pause");
  }

  function resumeGame() {
    if (!paused) return;
    paused = false;
    YZ.modal.close("pause");
    if (currentHandle && typeof currentHandle.resume === "function") {
      try { currentHandle.resume(); } catch (e) { console.warn(e); }
    }
  }

  /* ---------------- 设置 ---------------- */
  function syncSettingsUI() {
    const data = settings.data;
    [["music", "opt-music"], ["sfx", "opt-sfx"], ["motion", "opt-motion"]].forEach(([key, id]) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.setAttribute("aria-checked", data[key] ? "true" : "false");
    });
    $$("#opt-ai button").forEach(b => b.classList.toggle("active", b.dataset.value === data.ai));
    $$("#opt-pieces button").forEach(b => b.classList.toggle("active", b.dataset.value === data.pieces));
    refreshAudioButtons();
  }

  function refreshAudioButtons() {
    ["btn-music", "game-music"].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.toggle("is-off", !settings.get("music"));
    });
    ["btn-sfx", "game-sfx"].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.toggle("is-off", !settings.get("sfx"));
    });
  }

  function currentTrackName() {
    if (currentScreen === "game" && currentId === "monster") return "scene_comi1";
    if (currentScreen === "game" && currentId === "suika") return "ruka";
    if (currentScreen === "game" && currentId === "memory") return "kioku1";
    if (currentScreen === "game" && currentId === "arena") return "boss_chaos5";
    if (currentScreen === "game" && (currentId === "cchess" || currentId === "chess") && setupSide) {
      const f = YZ.factions.get(currentId, setupSide);
      return f ? (f.track || trackForSide(f.side)) : trackForSide(setupSide);
    }
    return "ending4-0";
  }

  function toggleMusic() {
    const on = !settings.get("music");
    settings.set("music", on);
    audio.setMusic(on);
    if (on) {
      audio.unlock();
      if (!audio.currentTrack()) audio.playTrack(currentTrackName());
      audio.sfx("select");
    }
    refreshAudioButtons();
  }

  function toggleSfx() {
    const on = !settings.get("sfx");
    settings.set("sfx", on);
    audio.setSfx(on);
    if (on) audio.sfx("select");
    refreshAudioButtons();
  }

  function resetRecords() {
    const btn = $("#opt-reset");
    if (!btn) return;
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.textContent = "再点一次确认";
      setTimeout(() => {
        if (btn.dataset.armed === "1") {
          btn.dataset.armed = "0";
          btn.textContent = "清除游戏记录";
        }
      }, 3200);
      return;
    }
    [YZ.KEY.cchess, YZ.KEY.chess, YZ.KEY.suika, YZ.KEY.monster, YZ.KEY.monsterGuess].forEach(k => YZ.storage.remove(k));
    btn.dataset.armed = "0";
    btn.textContent = "清除游戏记录";
    refreshStats();
    toast("游戏记录已清空", "good");
    audio.sfx("pop");
  }

  /* ---------------- 退出 ---------------- */
  function openQuit() {
    YZ.modal.open("quit");
    audio.sfx("click");
  }

  function doQuit() {
    YZ.modal.close("quit");
    const farewell = $("#farewell");
    if (farewell) farewell.hidden = false;
    try { window.close(); } catch (e) { /* ignore */ }
    setTimeout(() => { if (!document.hidden && farewell) farewell.hidden = false; }, 400);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    // 开场：任意键 / 点击
    document.addEventListener("keydown", e => {
      if (currentScreen === "title" && !YZ.modal.anyOpen()) {
        e.preventDefault();
        startFromSplash();
      }
    });
    const splash = $("#splash");
    if (splash) splash.addEventListener("pointerdown", () => startFromSplash());

    // 返回主页 / 选项
    document.addEventListener("click", e => {
      const go = e.target.closest("[data-go]");
      if (go) {
        if (go.dataset.go === "home" || go.dataset.go === "title") {
          if (currentScreen === "game") { exitGame(); return; }
          showScreen("home");
          audio.sfx("click");
        }
        return;
      }
    });

    // 卡片与展示
    buildGameCards();
    const next = $("#showcase-next");
    if (next) next.addEventListener("click", nextShowcase);

    // 游戏页
    $("#game-back").addEventListener("click", () => {
      if (currentScreen === "game") exitGame();
      else showScreen("home");
    });
    $("#game-pause").addEventListener("click", pauseGame);
    $("#game-restart").addEventListener("click", restartGame);
    $("#game-music").addEventListener("click", toggleMusic);
    $("#game-sfx").addEventListener("click", toggleSfx);
    $("#btn-music").addEventListener("click", toggleMusic);
    $("#btn-sfx").addEventListener("click", toggleSfx);
    $("#btn-fullscreen").addEventListener("click", () => {
      audio.sfx("click");
      try {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      } catch (e) { toast("这个浏览器不让全屏", "bad"); }
    });

    // 暂停
    $$("[data-pause]").forEach(btn => {
      btn.addEventListener("click", () => {
        audio.sfx("click");
        const action = btn.dataset.pause;
        if (action === "resume") resumeGame();
        else if (action === "restart") restartGame();
        else if (action === "exit") exitGame();
      });
    });
    $$("[data-close]").forEach(node => {
      node.addEventListener("click", () => {
        if (node.dataset.close === "pause") resumeGame();
        else if (node.dataset.close === "quit") YZ.modal.close("quit");
      });
    });

    // 退出
    $$("[data-quit]").forEach(btn => {
      btn.addEventListener("click", () => {
        audio.sfx("click");
        if (btn.dataset.quit === "leave") doQuit();
        else YZ.modal.close("quit");
      });
    });
    const homeQuit = $("#home-quit");
    if (homeQuit) homeQuit.addEventListener("click", openQuit);
    $("#farewell-back").addEventListener("click", () => {
      $("#farewell").hidden = true;
      showScreen("home");
      audio.playTrack("ending4-0");
      audio.sfx("select");
    });

    // 设置控件（主页内嵌）
    $("#opt-music").addEventListener("click", () => {
      const on = !settings.get("music");
      settings.set("music", on);
      audio.setMusic(on);
      if (on) { audio.unlock(); audio.sfx("select"); }
      syncSettingsUI();
    });
    $("#opt-sfx").addEventListener("click", () => {
      const on = !settings.get("sfx");
      settings.set("sfx", on);
      audio.setSfx(on);
      if (on) audio.sfx("select");
      syncSettingsUI();
    });
    $("#opt-motion").addEventListener("click", () => {
      settings.set("motion", !settings.get("motion"));
      syncSettingsUI();
      if (settings.get("motion")) scheduleShowcase();
      else stopShowcaseTimer();
    });
    $$("#opt-ai button").forEach(b => b.addEventListener("click", () => {
      settings.set("ai", b.dataset.value);
      syncSettingsUI();
      audio.sfx("click");
    }));
    $$("#opt-pieces button").forEach(b => b.addEventListener("click", () => {
      settings.set("pieces", b.dataset.value);
      syncSettingsUI();
      audio.sfx("click");
      if (currentHandle && typeof currentHandle.applySettings === "function") currentHandle.applySettings();
    }));
    $("#opt-reset").addEventListener("click", resetRecords);

    // 快捷键
    document.addEventListener("keydown", e => {
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (typing && e.key === "Escape") return;
      if (e.key === "Escape") {
        if (currentScreen === "title") { e.preventDefault(); startFromSplash(); return; }
        if (!$("#modal-quit").hidden) { YZ.modal.close("quit"); return; }
        if (!$("#modal-pause").hidden) { resumeGame(); return; }
        if (setupGameId) { e.preventDefault(); exitGame(); return; }
        if (currentScreen === "game") {
          if (currentHandle && typeof currentHandle.escape === "function" && currentHandle.escape()) return;
          pauseGame();
        }
        return;
      }
      if (typing) return;
    });

    // 首次交互解锁音频
    const unlock = () => { audio.unlock(); };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    settings.on(() => {
      syncSettingsUI();
      if (settings.get("music")) audio.startMusic();
      else audio.stopMusic();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && currentScreen === "game" && currentHandle && !paused) pauseGame();
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    settings.load();
    YZ.initBackground();
    syncSettingsUI();
    showScreen("title");
    bindEvents();
    ["rk", "bk", "bs1", "bs2", "be", "bh", "br1", "br2", "bc1", "bc2", "bp", "wk", "wp", "wp2", "we1", "we2", "wh", "wh2", "wc2", "wc", "wg1", "wg2", "ws", "placeholder"].forEach(k => {
      const img = new Image();
      img.src = "img/Cchess/art/" + k + ".png";
    });
    YZ.app = {
      launchGame, exitGame, pauseGame, resumeGame, restartGame,
      showScreen, refreshStats,
      get currentId() { return currentId; },
      get currentHandle() { return currentHandle; },
      get paused() { return paused; },
      get setupGameId() { return setupGameId; },
      get setupSide() { return setupSide; }
    };

    try {
      const params = new URLSearchParams(location.search);
      const game = params.get("game");
      const screen = params.get("screen");
      if (game && YZ.games[game]) setTimeout(() => launchGame(game, { side: params.get("side") }), 80);
      else if (screen === "select" || screen === "home") setTimeout(() => showScreen("home"), 80);
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
