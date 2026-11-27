/* ============================================================
   合成大鲁卡 · 11 级鲁卡
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const { util, storage, settings, audio, toast } = YZ;

  const W = 480, H = 720;
  const LEFT = 18, RIGHT = 462, FLOOR = 704, DROP_Y = 78, DANGER_Y = 150;
  const BOWL = 72;
  const CX = W / 2, HALF = (RIGHT - LEFT) / 2;
  const BOWL_R = (HALF * HALF + BOWL * BOWL) / (2 * BOWL);
  const BOWL_CY = FLOOR - BOWL_R;
  function floorAt(x) {
    const dx = Math.max(-HALF, Math.min(HALF, x - CX));
    return BOWL_CY + Math.sqrt(Math.max(0, BOWL_R * BOWL_R - dx * dx));
  }
  const STEP = 1 / 120;
  const TAU = Math.PI * 2;

  // 11 级鲁卡：级别越高，球越大；使用 img/ball/1–11 的头像图标
  const BALLS = [
    { name: "Lv.1", tone: "珊瑚", r: 15, light: "#ffd0c4", color: "#e85d5d", dark: "#9e2938", ink: "#55141e" },
    { name: "Lv.2", tone: "橙", r: 20, light: "#ffd4a3", color: "#ef8f3a", dark: "#a85318", ink: "#55280a" },
    { name: "Lv.3", tone: "金", r: 26, light: "#fff2a6", color: "#e8c94a", dark: "#9f8322", ink: "#4d3c07" },
    { name: "Lv.4", tone: "青柠", r: 33, light: "#e8ffa8", color: "#9fd65f", dark: "#5f9029", ink: "#2c470d" },
    { name: "Lv.5", tone: "翡翠", r: 41, light: "#b8ffd9", color: "#4fc48a", dark: "#237c52", ink: "#0b3d26" },
    { name: "Lv.6", tone: "青蓝", r: 50, light: "#b6f6f8", color: "#45bfc9", dark: "#1d7f8a", ink: "#083d44" },
    { name: "Lv.7", tone: "天蓝", r: 60, light: "#b8dcff", color: "#4b9ee8", dark: "#2163a3", ink: "#0a2e53" },
    { name: "Lv.8", tone: "靛蓝", r: 71, light: "#c4ccff", color: "#5d6fd8", dark: "#33419a", ink: "#141d57" },
    { name: "Lv.9", tone: "紫", r: 83, light: "#e0c4ff", color: "#9662d8", dark: "#5c3198", ink: "#2e1355" },
    { name: "Lv.10", tone: "品红", r: 95, light: "#ffc4e6", color: "#d65fa8", dark: "#8f2d6b", ink: "#4e1038" },
    { name: "Lv.11", tone: "虹核", r: 108, light: "#fff6d6", color: "#e8c07a", dark: "#895a25", ink: "#3b2408", max: true }
  ];

  const DROP_WEIGHTS = [30, 25, 20, 15, 10];
  const SPECIAL_CHANCE = 0.16;
  const SPECIALS = {
    promestein: {
      name: "普罗米斯汀", label: "绿 · 升级", r: 26,
      light: "#b8ffd9", color: "#4fc48a", dark: "#237c52", ink: "#06321d",
      img: "img/ball/special-promestein.png",
      hint: "碰到第一颗球，令其升级"
    },
    eva: {
      name: "伊娃", label: "石 · 不可合成", r: 30,
      light: "#e8e4da", color: "#8e8e92", dark: "#525256", ink: "#1b1b1d",
      img: "img/ball/special-eva.png",
      hint: "不可合成，作为石头占位"
    },
    hiruko: {
      name: "蛭虫", label: "鲜红 · 消失", r: 24,
      light: "#ffb8b8", color: "#e22f43", dark: "#7c0717", ink: "#3d0208",
      img: "img/ball/special-hiruko.png",
      hint: "碰到第一颗球，令其消失"
    }
  };
  const SPECIAL_KEYS = Object.keys(SPECIALS);
  const SPECIAL_WEIGHTS = { promestein: 2, hiruko: 2, eva: 1 };

  function weightedTier() {
    const total = DROP_WEIGHTS.reduce((a, b) => a + b, 0);
    let n = Math.random() * total;
    for (let i = 0; i < DROP_WEIGHTS.length; i++) {
      n -= DROP_WEIGHTS[i];
      if (n <= 0) return i;
    }
    return 0;
  }

  function randomSpecialKey() {
    const total = SPECIAL_KEYS.reduce((n, key) => n + (SPECIAL_WEIGHTS[key] || 0), 0);
    let n = Math.random() * total;
    for (const key of SPECIAL_KEYS) {
      n -= SPECIAL_WEIGHTS[key] || 0;
      if (n <= 0) return key;
    }
    return "promestein";
  }

  function mount(root, api) {
    const saved = storage.get(YZ.KEY.suika, { best: 0, maxTier: 0 }) || {};
    const state = {
      started: false,
      over: false,
      paused: false,
      score: 0,
      best: saved.best || 0,
      maxTier: saved.maxTier || 0,
      endless: false,
      maxOffered: false,
      choiceOpen: false,
      currentTier: weightedTier(),
      nextTier: weightedTier(),
      currentSpecial: null,
      nextSpecial: null,
      aimX: W / 2,
      dropTimer: 0,
      fruits: [],
      particles: [],
      popups: [],
      combo: 0,
      comboTimer: 0,
      dangerTime: 0,
      lastMergeAt: -10,
      elapsed: 0
    };
    let raf = 0, last = 0, acc = 0, alive = true;
    let canvas, ctx, nextCanvas, nextCtx, overlay, comboEl, scoreEl, bestEl, stageEl, modeEl, cashoutEl;

    root.innerHTML =
      '<div class="suika-layout">' +
        '<div class="suika-main">' +
          '<div class="suika-top">' +
            '<div class="suika-scores">' +
              '<div class="suika-score"><small>SCORE</small><strong id="suika-score">0</strong></div>' +
              '<div class="suika-score"><small>BEST</small><strong id="suika-best">0</strong></div>' +
            "</div>" +
            '<span class="suika-mode" id="suika-mode">普通模式</span>' +
            '<button class="mini-btn suika-cashout" id="suika-cashout" type="button">结算</button>' +
            '<div class="suika-next"><small>下一个<br>NEXT</small><canvas id="suika-next" width="92" height="92"></canvas></div>' +
          "</div>" +
          '<div class="suika-stage" id="suika-stage">' +
            '<canvas id="suika-canvas" aria-label="11 级鲁卡合成游戏画布"></canvas>' +
            '<div class="suika-combo" id="suika-combo" aria-hidden="true"></div>' +
            '<div class="suika-overlay" id="suika-overlay"></div>' +
          "</div>" +
        "</div>" +
        '<aside class="suika-side">' +
          '<div class="suika-panel"><h3>合成路线 <small>MERGE LIST</small></h3><div class="suika-ladder" id="suika-ladder"></div>' +
            '<p class="suika-help" style="margin-top:8px;color:var(--muted-2)">11 级鲁卡球 · 使用 img/ball 的 1–11 号图标</p></div>' +
          '<div class="suika-panel"><h3>特殊球 <small>SPECIAL</small></h3><div class="suika-special-list" id="suika-special-list"></div></div>' +
          '<div class="suika-panel"><h3>怎么玩 <small>HOW TO</small></h3>' +
            '<p class="suika-help">移动鼠标瞄准，<b>点击投放</b>。手机可以按住拖动，松手投放。<br><br>' +
            "两个同级鲁卡球碰到一起，就会合成高一级的球。任意时刻都可以点顶部「结算」收手；合出 <b>11 级鲁卡</b> 后还可以进入无尽模式继续刷分。<br><br>" +
            "无尽模式下，两颗 11 级鲁卡相撞会消失并给高分。<br><br>" +
            "<kbd>←</kbd><kbd>→</kbd> 瞄准 · <kbd>空格</kbd> 投放<br>球堆过危险线太久就结束。</p></div>" +
        "</aside>" +
      "</div>";

    canvas = root.querySelector("#suika-canvas");
    ctx = canvas.getContext("2d");
    nextCanvas = root.querySelector("#suika-next");
    nextCtx = nextCanvas.getContext("2d");
    overlay = root.querySelector("#suika-overlay");
    comboEl = root.querySelector("#suika-combo");
    scoreEl = root.querySelector("#suika-score");
    bestEl = root.querySelector("#suika-best");
    stageEl = root.querySelector("#suika-stage");
    modeEl = root.querySelector("#suika-mode");
    cashoutEl = root.querySelector("#suika-cashout");
    if (cashoutEl) cashoutEl.addEventListener("click", () => settleGame(false));

    const ballImages = {};
    for (let i = 0; i < 11; i++) {
      const img = new Image();
      img.onload = () => {
        buildLadder();
        renderPreview();
        if (alive) render();
      };
      img.src = "img/ball/icon-" + (i + 1) + ".png";
      ballImages[i] = img;
    }

    const specialImages = {};
    for (const key of SPECIAL_KEYS) {
      const img = new Image();
      img.onload = () => { buildSpecialList(); if (alive) render(); };
      img.src = SPECIALS[key].img;
      specialImages[key] = img;
    }
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.aspectRatio = "2 / 3";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    bestEl.textContent = util.formatNum(state.best);

    function fruitColor(tier) {
      const f = BALLS[Math.max(0, Math.min(BALLS.length - 1, tier))];
      return f;
    }

    function radiusFor(tier, special) {
      return special ? SPECIALS[special].r : BALLS[tier].r;
    }
    function colorFor(tier, special) {
      return special ? SPECIALS[special] : BALLS[tier];
    }
    function clampAim(x, tier, special) {
      const r = radiusFor(tier, special);
      return util.clamp(x, LEFT + r + 2, RIGHT - r - 2);
    }
    function rollNextDrop() {
      if (Math.random() < SPECIAL_CHANCE) {
        state.nextSpecial = randomSpecialKey();
        state.nextTier = 0;
      } else {
        state.nextSpecial = null;
        state.nextTier = weightedTier();
      }
    }

    /* ---------------- 绘制鲁卡球 ---------------- */
    function drawBall(c, tier, x, y, r, angle, special) {
      if (special) {
        const simg = specialImages[special];
        if (simg && simg.complete && simg.naturalWidth) {
          c.save(); c.translate(x, y); if (angle) c.rotate(angle);
          c.drawImage(simg, -r, -r, r * 2, r * 2); c.restore(); return;
        }
        const sp = SPECIALS[special];
        c.save(); c.translate(x, y); c.rotate(angle || 0);
        const sg = c.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
        sg.addColorStop(0, sp.light); sg.addColorStop(0.55, sp.color); sg.addColorStop(1, sp.dark);
        c.fillStyle = sg; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
        c.strokeStyle = sp.light; c.lineWidth = Math.max(2, r * 0.08); c.beginPath(); c.arc(0, 0, r * 0.94, 0, TAU); c.stroke();
        c.restore(); return;
      }
      const img = ballImages[tier];
      if (img && img.complete && img.naturalWidth) {
        c.save();
        c.translate(x, y);
        if (angle) c.rotate(angle);
        c.drawImage(img, -r, -r, r * 2, r * 2);
        c.restore();
        return;
      }
      const b = BALLS[tier] || BALLS[0];
      c.save();
      c.translate(x, y);
      c.rotate(angle || 0);

      if (b.max) {
        const rainbow = ["#ff6b6b", "#ffa94d", "#ffd43b", "#a9e34b", "#51cf66", "#38d9a9", "#4dabf7", "#748ffc", "#9775fa", "#da77f2", "#f783ac", "#ff8787"];
        c.save();
        c.lineWidth = Math.max(2, r * 0.075);
        for (let i = 0; i < rainbow.length; i++) {
          c.strokeStyle = rainbow[i];
          c.globalAlpha = 0.75;
          c.beginPath();
          c.arc(0, 0, r * 1.035, (i / rainbow.length) * TAU, ((i + 1) / rainbow.length) * TAU - 0.02);
          c.stroke();
        }
        c.restore();
      }

      const g = c.createRadialGradient(-r * 0.36, -r * 0.4, r * 0.08, 0, 0, r * 1.06);
      g.addColorStop(0, b.light);
      g.addColorStop(0.5, b.color);
      g.addColorStop(1, b.dark);
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();

      c.strokeStyle = "rgba(255,255,255,.16)";
      c.lineWidth = Math.max(1, r * 0.022);
      c.beginPath(); c.arc(0, 0, r * 0.76, -2.5, 0.45); c.stroke();

      c.fillStyle = "rgba(255,255,255,.34)";
      c.beginPath(); c.ellipse(-r * 0.37, -r * 0.42, r * 0.25, r * 0.13, -0.65, 0, TAU); c.fill();

      const label = String(tier + 1);
      c.fillStyle = b.ink;
      c.globalAlpha = 0.78;
      c.font = "700 " + Math.max(8, r * (label.length > 1 ? 0.56 : 0.7)) + "px 'Microsoft YaHei',sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(label, 0, r * 0.03);
      c.globalAlpha = 0.25;
      c.fillStyle = "#fff";
      c.fillText(label, 0, r * 0.01);
      c.globalAlpha = 1;

      c.strokeStyle = "rgba(0,0,0,.18)";
      c.lineWidth = Math.max(1, r * 0.03);
      c.beginPath(); c.arc(0, 0, r - Math.max(0.7, r * 0.02), 0, TAU); c.stroke();

      if (b.max) {
        c.strokeStyle = "rgba(255,244,214,.55)";
        c.lineWidth = Math.max(1, r * 0.02);
        c.beginPath(); c.arc(0, 0, r * 0.9, 0, TAU); c.stroke();
      }
      c.restore();
    }

    function drawShadow(c, f) {
      const r = f.r * f.scale;
      const g = c.createRadialGradient(f.x, f.y + r * 0.82, 1, f.x, f.y + r * 0.82, r * 1.1);
      g.addColorStop(0, "rgba(0,0,0,.24)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath(); c.ellipse(f.x, f.y + r * 0.82, r * 1.05, r * 0.32, 0, 0, TAU); c.fill();
    }

    function renderPreview() {
      const c = nextCtx;
      c.clearRect(0, 0, 92, 92);
      const tier = state.nextTier;
      const special = state.nextSpecial;
      const f = colorFor(tier, special);
      const scale = Math.min(1.8, 34 / f.r);
      drawBall(c, tier, 46, 50, f.r * scale, 0, special);
    }

    function buildLadder() {
      const ladder = root.querySelector("#suika-ladder");
      let html = "";
      BALLS.forEach((f, i) => {
        html += '<div class="suika-step' + (i === 10 ? " max" : "") + '"><canvas width="40" height="40" data-ladder="' + i + '"></canvas><span>' + util.escapeHtml(levelName(i)) + "</span><em>" + (i === 10 ? "+1500" : "+" + ((i + 1) * 10)) + "</em></div>";
      });
      ladder.innerHTML = html;
      ladder.querySelectorAll("canvas").forEach(cv => {
        const tier = +cv.dataset.ladder;
        const c = cv.getContext("2d");
        const f = BALLS[tier];
        const scale = Math.min(1.15, 15 / f.r);
        drawBall(c, tier, 20, 22, f.r * scale, 0);
      });
      buildSpecialList();
    }

    function buildSpecialList() {
      const list = root.querySelector("#suika-special-list");
      if (!list) return;
      list.innerHTML = SPECIAL_KEYS.map(key => {
        const sp = SPECIALS[key];
        return '<div class="suika-special-row"><canvas width="46" height="46" data-special="' + key + '"></canvas><div><b>' + util.escapeHtml(sp.name) + '</b><span>' + util.escapeHtml(sp.hint) + '</span></div></div>';
      }).join("");
      list.querySelectorAll("canvas").forEach(cv => {
        const key = cv.dataset.special;
        const c = cv.getContext("2d");
        drawBall(c, 0, 23, 23, 20, 0, key);
      });
    }

    /* ---------------- 物理 ---------------- */
    function addParticles(x, y, tier, big) {
      const f = BALLS[tier] || BALLS[10];
      const n = settings.get("motion") ? (big ? 22 : 10) : 4;
      for (let i = 0; i < n; i++) {
        const a = util.rand(0, TAU), sp = util.rand(40, big ? 220 : 150);
        state.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          life: 0, max: util.rand(0.35, 0.8), size: util.rand(2, big ? 7 : 5),
          color: Math.random() < 0.5 ? f.light : f.color, ring: false
        });
      }
      state.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.45, size: big ? 70 : 28, color: f.light, ring: true });
    }

    function addPopup(x, y, text, color) {
      state.popups.push({ x, y, text, color: color || "#ffe6a8", life: 0, max: 0.9 });
    }

    function bumpMaxTier(tier) {
      if (tier > state.maxTier) state.maxTier = tier;
    }

    function mergeFruits(a, b) {
      const tier = Math.max(a.tier, b.tier);
      const nx = (a.x + b.x) / 2, ny = (a.y + b.y) / 2;
      a.dead = true;
      b.dead = true;
      const isMaxPair = tier >= 10;
      const newTier = isMaxPair ? 10 : tier + 1;
      let points = (tier + 1) * 10;
      if (isMaxPair) points = state.endless ? 1500 : 1000;
      if (state.combo > 1) points = Math.round(points * (1 + (state.combo - 1) * 0.5));
      state.score += points;

      if (!isMaxPair) {
        state.fruits.push({
          x: nx, y: ny,
          vx: util.clamp((a.vx + b.vx) * 0.2, -60, 60),
          vy: Math.min((a.vy + b.vy) * 0.15 - 80, -50),
          r: BALLS[newTier].r, tier: newTier,
          angle: (a.angle + b.angle) / 2, spin: util.rand(-0.3, 0.3),
          age: 0, mergeLock: 0.13, scale: 0.55, dead: false
        });
        bumpMaxTier(newTier);
      } else {
        bumpMaxTier(10);
      }

      if (YZ.achievements) {
        if (newTier === 7) YZ.achievements.unlock("suika-8");
        if (newTier === 8) YZ.achievements.unlock("suika-9");
        if (newTier === 10) YZ.achievements.unlock("suika-11");
      }
      addParticles(nx, ny, isMaxPair ? 10 : newTier, isMaxPair);
      addPopup(nx, ny - BALLS[newTier].r * 0.5, "+" + points, isMaxPair ? "#fff0a8" : "#ffe6a8");
      audio.sfx("merge", { tier: Math.min(newTier, 10) });
      if (state.combo > 1) {
        comboEl.textContent = "x" + state.combo + " 连锁";
        comboEl.classList.remove("show");
        void comboEl.offsetWidth;
        comboEl.classList.add("show");
      }
      updateHud();

      if (isMaxPair) {
        toast(state.endless ? "两颗 11 级鲁卡相撞，+" + points : "11 级鲁卡相撞，+" + points, "good");
        audio.sfx("win");
      } else if (newTier === 10) {
        toast("合出 11 级鲁卡了！", "good");
        if (!state.maxOffered) offerMaxChoice();
      }
    }

    function offerMaxChoice() {
      state.maxOffered = true;
      state.choiceOpen = true;
      overlay.hidden = false;
      overlay.innerHTML = '<div class="overlay-card"><p class="kicker">LEVEL 11 REACHED</p>' +
        "<h3>合到顶了</h3>" +
        '<p class="ov-sub">你已经合出了 <b style="color:var(--gold)">11 级鲁卡</b>。<br>要收手结算，还是继续无尽模式？<br><span style="color:var(--muted-2)">无尽模式下，两颗 11 级鲁卡相撞会消失并给高分。</span></p>' +
        '<div class="ov-stats"><div><span>本局</span><strong>' + util.formatNum(state.score) + "</strong></div>" +
        "<div><span>最高</span><strong>" + util.formatNum(Math.max(state.best, state.score)) + "</strong></div>" +
        "<div><span>最大</span><strong>Lv.11</strong></div></div>" +
        '<div class="ov-actions"><button class="btn primary" id="suika-finish">收手，结算</button>' +
        '<button class="btn" id="suika-endless">进入无尽模式</button></div></div>';
      overlay.querySelector("#suika-finish").addEventListener("click", finishAtMax);
      overlay.querySelector("#suika-endless").addEventListener("click", enterEndless);
      audio.sfx("win");
      api.setStatus("已达成 11 级 · 选择结算或无尽");
    }

    function finishAtMax() {
      settleGame(true);
    }

    function settleGame(allowEndless) {
      if (!state.started || state.over) return;
      state.choiceOpen = false;
      state.over = true;
      if (state.score > state.best) state.best = state.score;
      persist();
      updateHud();
      overlay.hidden = false;
      const topTier = Math.max(0, state.maxTier);
      const canEndless = allowEndless && topTier >= 10;
      overlay.innerHTML = '<div class="overlay-card"><p class="kicker">CASH OUT</p>' +
        "<h3>收手结算</h3>" +
        '<p class="ov-sub">这一局合到了 <b style="color:var(--gold)">' + util.escapeHtml(levelName(topTier)) + "</b>。<br>本场最高记录会保留，不会因为之后的合成或特殊球而降低。</p>" +
        '<div class="ov-stats"><div><span>本局</span><strong>' + util.formatNum(state.score) + "</strong></div>" +
        "<div><span>最高分</span><strong>" + util.formatNum(state.best) + "</strong></div>" +
        "<div><span>本场最高</span><strong style=\"font-size:18px\">" + util.escapeHtml(levelName(topTier)) + "</strong></div></div>" +
        '<div class="ov-actions"><button class="btn primary" id="suika-again">再来一局</button>' +
        (canEndless ? '<button class="btn" id="suika-endless2">进入无尽模式</button>' : '') +
        '<button class="btn ghost" id="suika-exit">返回主页</button></div></div>';
      overlay.querySelector("#suika-again").addEventListener("click", restart);
      if (canEndless) overlay.querySelector("#suika-endless2").addEventListener("click", enterEndless);
      overlay.querySelector("#suika-exit").addEventListener("click", api.onExit);
      audio.sfx("win");
    }

    function enterEndless() {
      state.choiceOpen = false;
      state.over = false;
      state.endless = true;
      overlay.hidden = true;
      last = performance.now();
      acc = 0;
      updateHud();
      toast("无尽模式开启：11 级鲁卡相撞会消失并给高分", "gold");
      api.setStatus("无尽模式 · 分数 " + state.score);
    }

    function triggerSpecial(specialBall, target) {
      if (!specialBall.special || specialBall.specialDone || specialBall.dead) return;
      if (!target || target.dead) return;
      if (target.special && !(specialBall.special === "hiruko" && target.special === "eva")) return;
      specialBall.specialDone = true;
      specialBall.dead = true;
      const targetLevel = target.tier + 1;
      if (specialBall.special === "promestein") {
        if (target.tier < 10) {
          target.tier += 1;
          target.r = BALLS[target.tier].r;
          bumpMaxTier(target.tier);
          if (target.tier === 10 && !state.maxOffered) offerMaxChoice();
          target.mergeLock = 0.2;
          target.scale = 0.62;
          state.score += 20;
          addParticles(target.x, target.y, target.tier, false);
          addPopup(target.x, target.y - target.r, "升级！", "#b8ffd9");
          toast("普罗米斯汀让一颗球升级了", "good");
        } else {
          addPopup(target.x, target.y - target.r, "已满级", "#b8ffd9");
        }
      } else if (specialBall.special === "hiruko") {
        target.dead = true;
        state.score += 15;
        addParticles(target.x, target.y, target.tier, false);
        addPopup(target.x, target.y - target.r, "消失", "#ff9a9a");
        toast("蛭虫吞掉了一颗球", "warn");
      } else if (specialBall.special === "eva") {
        specialBall.specialDone = false;
        specialBall.dead = false;
        return;
      }
      specialBall.dead = true;
      if (YZ.achievements) {
        if (specialBall.special === "promestein" && targetLevel < 5) YZ.achievements.unlock("suika-promestein-low");
        if (specialBall.special === "hiruko" && targetLevel >= 5) YZ.achievements.unlock("suika-hiruko-high");
        if (specialBall.special === "hiruko" && target.special === "eva") YZ.achievements.unlock("suika-eva");
      }
      audio.sfx("merge", { tier: Math.min(target.tier || 0, 10) });
      updateHud();
    }

    function step(dt) {
      state.elapsed += dt;
      if (state.dropTimer > 0) state.dropTimer = Math.max(0, state.dropTimer - dt);
      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) state.combo = 0;
      }
      for (const f of state.fruits) {
        f.age += dt;
        if (f.mergeLock > 0) f.mergeLock = Math.max(0, f.mergeLock - dt);
        f.scale += (1 - f.scale) * Math.min(1, dt * 13);
        f.vy += 1500 * dt;
        f.vx *= 0.999;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.angle += f.spin * dt;
        f.spin *= Math.pow(0.18, dt);
        if (Math.abs(f.spin) < 0.01) f.spin = 0;
      }
      // 墙 / 地面
      for (const f of state.fruits) {
        if (f.x - f.r < LEFT) {
          f.x = LEFT + f.r;
          if (f.vx < 0) f.vx = -f.vx * 0.16;
          f.spin *= 0.45;
        }
        if (f.x + f.r > RIGHT) {
          f.x = RIGHT - f.r;
          if (f.vx > 0) f.vx = -f.vx * 0.16;
          f.spin *= 0.45;
        }
        const fy = floorAt(f.x);
        if (f.y + f.r > fy) {
          f.y = fy - f.r;
          if (f.vy > 20) f.vy = -f.vy * 0.11;
          else f.vy = 0;
          f.vx *= 0.94;
          f.vx += (CX - f.x) * 7.5 * dt;
          f.spin *= 0.82;
          if (Math.abs(f.spin) < 0.01) f.spin = 0;
        }
      }
      // 碰撞
      const mergePairs = [];
      const queued = new Set();
      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < state.fruits.length; i++) {
          const a = state.fruits[i];
          if (a.dead) continue;
          for (let j = i + 1; j < state.fruits.length; j++) {
            const b = state.fruits[j];
            if (b.dead) continue;
            let dx = b.x - a.x, dy = b.y - a.y;
            const min = a.r + b.r;
            let d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            let d = Math.sqrt(d2);
            if (d < 0.001) {
              dx = util.rand(-1, 1); dy = util.rand(-1, 1);
              d = Math.hypot(dx, dy) || 1;
            }
            const nx = dx / d, ny = dy / d;
            const overlap = min - d;
            const ma = a.r * a.r, mb = b.r * b.r;
            const total = ma + mb;
            if (overlap > 0.01) {
              a.x -= nx * overlap * (mb / total);
              a.y -= ny * overlap * (mb / total);
              b.x += nx * overlap * (ma / total);
              b.y += ny * overlap * (ma / total);
            }
            const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
            const vn = rvx * nx + rvy * ny;
            if (vn < 0 && iter < 2) {
              const inv = 1 / ma + 1 / mb;
              const jImp = -(1.06) * vn / inv;
              a.vx -= (jImp * nx) / ma;
              a.vy -= (jImp * ny) / ma;
              b.vx += (jImp * nx) / mb;
              b.vy += (jImp * ny) / mb;
              const tx = -ny, ty = nx;
              const vt = rvx * tx + rvy * ty;
              const jt = -vt * 0.06 / inv;
              a.vx -= (jt * tx) / ma;
              a.vy -= (jt * ty) / ma;
              b.vx += (jt * tx) / mb;
              b.vy += (jt * ty) / mb;
            }
            if (a.special) triggerSpecial(a, b);
            if (b.special) triggerSpecial(b, a);
            if (a.dead || b.dead) continue;
            if (!a.special && !b.special && iter === 0 && a.tier === b.tier && a.mergeLock <= 0 && b.mergeLock <= 0 &&
              a.age > 0.06 && b.age > 0.06 && !queued.has(a) && !queued.has(b)) {
              queued.add(a); queued.add(b);
              mergePairs.push([a, b]);
            }
          }
        }
        for (const f of state.fruits) {
          if (f.x - f.r < LEFT) f.x = LEFT + f.r;
          if (f.x + f.r > RIGHT) f.x = RIGHT - f.r;
          const fy = floorAt(f.x);
          if (f.y + f.r > fy) f.y = fy - f.r;
        }
      }

      for (const [a, b] of mergePairs) {
        if (a.dead || b.dead || !state.fruits.includes(a) || !state.fruits.includes(b)) continue;
        state.combo = state.elapsed - state.lastMergeAt < 0.75 ? state.combo + 1 : 1;
        state.lastMergeAt = state.elapsed;
        state.comboTimer = 1.2;
        mergeFruits(a, b);
      }
      state.fruits = state.fruits.filter(f => !f.dead);

      // 粒子
      for (const p of state.particles) {
        p.life += dt;
        if (!p.ring) {
          p.vy += 360 * dt;
          p.vx *= 0.98;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
      state.particles = state.particles.filter(p => p.life < p.max);
      for (const p of state.popups) {
        p.life += dt;
        p.y -= 34 * dt;
      }
      state.popups = state.popups.filter(p => p.life < p.max);

      // 危险线
      let danger = false;
      for (const f of state.fruits) {
        if (f.age > 1.0 && f.y - f.r < DANGER_Y) { danger = true; break; }
      }
      state.dangerTime = danger ? state.dangerTime + dt : 0;
      if (state.dangerTime > 2.1) gameOver();
    }

    /* ---------------- 渲染 ---------------- */
    function drawBackground() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#62c8ee");
      g.addColorStop(0.45, "#b7efff");
      g.addColorStop(1, "#ffe3a8");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const glow = ctx.createRadialGradient(W / 2, 40, 10, W / 2, 40, 330);
      glow.addColorStop(0, "rgba(255,214,234,.22)");
      glow.addColorStop(1, "rgba(255,196,224,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, 420);

      // 细格
      ctx.strokeStyle = "rgba(45,110,160,.1)";
      ctx.lineWidth = 1;
      for (let x = LEFT; x <= RIGHT; x += 37) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, floorAt(x)); ctx.stroke();
      }
      for (let y = 0; y < FLOOR; y += 37) {
        ctx.beginPath(); ctx.moveTo(LEFT, y); ctx.lineTo(RIGHT, y); ctx.stroke();
      }

      // 球形底：把下半圆填成实体，球会沿弧面往中间滚
      ctx.beginPath();
      ctx.moveTo(LEFT, H);
      ctx.lineTo(LEFT, floorAt(LEFT));
      for (let x = LEFT; x <= RIGHT; x += 4) ctx.lineTo(x, floorAt(x));
      ctx.lineTo(RIGHT, H);
      ctx.closePath();
      const bowlFill = ctx.createLinearGradient(0, FLOOR - BOWL, 0, H);
      bowlFill.addColorStop(0, "rgba(255,244,200,.72)");
      bowlFill.addColorStop(1, "rgba(240,196,116,.4)");
      ctx.fillStyle = bowlFill;
      ctx.fill();

      // 容器
      ctx.strokeStyle = "rgba(198,151,73,.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(LEFT, 34);
      ctx.lineTo(LEFT, floorAt(LEFT));
      for (let x = LEFT; x <= RIGHT; x += 4) ctx.lineTo(x, floorAt(x));
      ctx.lineTo(RIGHT, 34);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.62)";
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(LEFT + 7, 44); ctx.lineTo(LEFT + 7, floorAt(LEFT + 7) - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(RIGHT - 7, 44); ctx.lineTo(RIGHT - 7, floorAt(RIGHT - 7) - 8); ctx.stroke();

      // 危险线
      ctx.save();
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = state.dangerTime > 1.2 ? "rgba(235,76,96,.9)" : "rgba(232,110,130,.5)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(LEFT + 8, DANGER_Y); ctx.lineTo(RIGHT - 8, DANGER_Y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "rgba(216,80,110,.62)";
      ctx.font = "10px 'Microsoft YaHei',sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("危险线", RIGHT - 12, DANGER_Y - 7);

      // 顶部投放标记
      ctx.fillStyle = "rgba(102,140,170,.35)";
      ctx.font = "9px 'Microsoft YaHei',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("D R O P", W / 2, 28);
    }

    function drawAim() {
      if (!state.started || state.over) return;
      const tier = state.currentTier;
      const special = state.currentSpecial;
      const f = colorFor(tier, special);
      const x = state.aimX;
      ctx.save();
      ctx.setLineDash([5, 8]);
      ctx.strokeStyle = "rgba(232,192,122,.3)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, DROP_Y + f.r + 4); ctx.lineTo(x, floorAt(x) - 16); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = state.dropTimer > 0 ? 0.16 : 0.42;
      drawBall(ctx, tier, x, DROP_Y, f.r, 0, special);
      ctx.restore();
      // 瞄准三角
      ctx.fillStyle = "rgba(232,192,122,.6)";
      ctx.beginPath();
      ctx.moveTo(x, DROP_Y - f.r - 12);
      ctx.lineTo(x - 6, DROP_Y - f.r - 22);
      ctx.lineTo(x + 6, DROP_Y - f.r - 22);
      ctx.closePath();
      ctx.fill();
    }

    function render() {
      ctx.clearRect(0, 0, W, H);
      drawBackground();
      drawAim();
      for (const f of state.fruits) {
        drawShadow(ctx, f);
        drawBall(ctx, f.tier, f.x, f.y, f.r * f.scale, f.angle, f.special);
      }
      for (const p of state.particles) {
        const a = 1 - p.life / p.max;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        if (p.ring) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.3 + p.life / p.max), 0, TAU);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - p.life / p.max * 0.4), 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      for (const p of state.popups) {
        const a = 1 - p.life / p.max;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = p.color;
        ctx.font = "600 15px 'Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      }
      if (state.dangerTime > 1) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.55, (state.dangerTime - 1) * 0.7);
        ctx.strokeStyle = "#ff6e56";
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, W - 6, H - 6);
        ctx.restore();
      }
    }

    /* ---------------- HUD / 生命周期 ---------------- */
    function updateMode() {
      if (!modeEl) return;
      modeEl.textContent = state.endless ? "无尽模式" : (state.over ? "本局结束" : "普通模式");
      if (cashoutEl) cashoutEl.disabled = !state.started || state.over;
      modeEl.classList.toggle("endless", state.endless);
    }

    const db = YZ.pieceDB;
    const levelName = tier => db.suikaName(tier);

    function updateHud() {
      scoreEl.textContent = util.formatNum(state.score);
      if (state.score > state.best) {
        state.best = state.score;
        bestEl.textContent = util.formatNum(state.best);
      }
      updateMode();
      renderPreview();
      api.setStatus((state.endless ? "无尽模式 · " : "") + "分数 " + state.score + " · 最大 " + levelName(Math.max(0, state.maxTier)));
    }

    function persist() {
      storage.set(YZ.KEY.suika, { best: state.best, maxTier: state.maxTier });
    }

    function showStart() {
      overlay.hidden = false;
      overlay.innerHTML = '<div class="overlay-card"><p class="kicker">MERGE THE RUKAS</p>' +
        "<h3>合到 11 级</h3>" +
        '<p class="ov-sub">移动鼠标瞄准，点击投放。<br>两个同级球碰到一起，就会升级。<br>偶尔会掉落普罗米斯汀 / 伊娃 / 蛭虫特殊球。<br>合出 11 级鲁卡后，可以收手，<br>也可以进入无尽模式。<br>别让球堆过红色危险线。</p>' +
        '<div class="ov-actions"><button class="btn primary" id="suika-start">开始游戏</button></div></div>';
      overlay.querySelector("#suika-start").addEventListener("click", startGame);
    }

    function startGame() {
      state.started = true;
      state.over = false;
      state.paused = false;
      state.choiceOpen = false;
      state.maxOffered = false;
      state.endless = false;
      state.maxTier = 0;
      overlay.hidden = true;
      state.currentTier = weightedTier();
      state.currentSpecial = null;
      state.nextTier = weightedTier();
      state.nextSpecial = null;
      rollNextDrop();
      renderPreview();
      updateHud();
      last = performance.now();
      acc = 0;
      audio.sfx("start");
      api.setStatus("合到 11 级！");
    }

    function gameOver() {
      if (state.over) return;
      state.over = true;
      state.dangerTime = 0;
      if (state.score > state.best) state.best = state.score;
      persist();
      audio.sfx("lose");
      updateHud();
      overlay.hidden = false;
      overlay.innerHTML = '<div class="overlay-card"><p class="kicker">OVERFLOW</p>' +
        "<h3>堆满啦</h3>" +
        '<p class="ov-sub">这一局合到了 <b style="color:var(--gold)">' + util.escapeHtml(levelName(Math.max(0, state.maxTier))) + "</b>。<br>再试一次，11 级就在下一颗。</p>" +
        '<div class="ov-stats"><div><span>本局</span><strong>' + util.formatNum(state.score) + "</strong></div>" +
        "<div><span>最高</span><strong>" + util.formatNum(state.best) + "</strong></div>" +
        "<div><span>最大</span><strong style=\"font-size:18px\">" + util.escapeHtml(levelName(Math.max(0, state.maxTier))) + "</strong></div></div>" +
        '<div class="ov-actions"><button class="btn primary" id="suika-again">再来一局</button>' +
        '<button class="btn ghost" id="suika-exit">返回主页</button></div></div>';
      overlay.querySelector("#suika-again").addEventListener("click", restart);
      overlay.querySelector("#suika-exit").addEventListener("click", api.onExit);
    }

    function restart() {
      state.fruits = [];
      state.particles = [];
      state.popups = [];
      state.score = 0;
      state.maxTier = 0;
      state.combo = 0;
      state.comboTimer = 0;
      state.dangerTime = 0;
      state.lastMergeAt = -10;
      state.dropTimer = 0;
      state.aimX = W / 2;
      state.currentTier = weightedTier();
      state.currentSpecial = null;
      state.nextTier = weightedTier();
      state.nextSpecial = null;
      rollNextDrop();
      state.started = true;
      state.over = false;
      state.paused = false;
      state.endless = false;
      state.maxOffered = false;
      state.choiceOpen = false;
      overlay.hidden = true;
      acc = 0;
      last = performance.now();
      updateHud();
      renderPreview();
      audio.sfx("start");
      api.setStatus("合到 11 级！");
    }

    function drop() {
      if (!state.started || state.over || state.paused || state.choiceOpen || state.dropTimer > 0) return;
      const tier = state.currentTier;
      const special = state.currentSpecial;
      const f = colorFor(tier, special);
      state.aimX = clampAim(state.aimX, tier, special);
      state.fruits.push({
        x: state.aimX, y: DROP_Y, vx: 0, vy: 0, r: f.r, tier, special,
        angle: util.rand(-0.3, 0.3), spin: util.rand(-0.4, 0.4),
        age: 0, mergeLock: 0.12, scale: 1, dead: false, specialDone: false
      });
      state.dropTimer = 0.42;
      state.currentTier = state.nextTier;
      state.currentSpecial = state.nextSpecial;
      rollNextDrop();
      renderPreview();
      audio.sfx("drop");
    }

    function setAim(clientX) {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * W;
      state.aimX = clampAim(x, state.currentTier, state.currentSpecial);
    }

    /* ---------------- 输入 ---------------- */
    function onPointerDown(e) {
      audio.unlock();
      if (!state.started || state.over || state.choiceOpen) return;
      setAim(e.clientX);
      if (e.pointerType === "touch") {
        state.aiming = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      } else {
        drop();
      }
    }
    function onPointerMove(e) {
      if (!state.started || state.over || state.paused || state.choiceOpen) return;
      setAim(e.clientX);
    }
    function onPointerUp(e) {
      if (e.pointerType === "touch" && state.aiming) {
        state.aiming = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        setAim(e.clientX);
        drop();
      }
    }
    function onKey(e) {
      if (!state.started || state.over || state.paused || state.choiceOpen || !alive) return;
      if (YZ.modal.anyOpen()) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        state.aimX = clampAim(state.aimX - 24, state.currentTier, state.currentSpecial);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        state.aimX = clampAim(state.aimX + 24, state.currentTier, state.currentSpecial);
      } else if (e.key === " " || e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        drop();
      }
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", () => { state.aiming = false; });
    global.addEventListener("keydown", onKey);

    /* ---------------- 主循环 ---------------- */
    function frame(now) {
      if (!alive) return;
      const dt = Math.min((now - last) / 1000 || 0, 0.12);
      last = now;
      if (state.started && !state.paused && !state.over && !state.choiceOpen) {
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard < 16) {
          step(STEP);
          acc -= STEP;
          guard++;
          if (state.over || state.choiceOpen) break;
        }
      }
      render();
      raf = requestAnimationFrame(frame);
    }

    updateHud();
    buildLadder();
    renderPreview();
    showStart();
    last = performance.now();
    raf = requestAnimationFrame(frame);

    try {
      if (new URLSearchParams(location.search).has("debug")) {
        global.__suikaDebug = { state, drop, step, render, gameOver };
      }
    } catch (e) { /* ignore */ }

    return {
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        global.removeEventListener("keydown", onKey);
        if (global.__suikaDebug && global.__suikaDebug.state === state) global.__suikaDebug = null;
        persist();
      },
      pause() {
        state.paused = true;
      },
      resume() {
        state.paused = false;
        last = performance.now();
        acc = 0;
      },
      restart,
      isOver() { return state.over; },
      escape() {
        return false;
      }
    };
  }

  YZ.games.suika = {
    id: "suika",
    no: "03",
    kicker: "益智 · RUKA",
    title: "合成大鲁卡",
    subtitle: "11 级鲁卡，合到顶再说",
    desc: "投放、碰撞、升级。11 个形态各异的鲁卡球，两个同级鲁卡球相撞就升级；任意时刻都能结算，合到 11 级后还可进入无尽模式继续。",
    emblem: '<img class="suika-card-icon" src="img/ball/icon-1.png" alt="合成大鲁卡">',
    mount,
    cardStat() {
      const s = storage.get(YZ.KEY.suika, null);
      if (!s || !s.best) return "还没合到过 11 级";
      return "最高 " + util.formatNum(s.best) + " 分 · " + YZ.pieceDB.suikaName(s.maxTier || 0);
    }
  };
})(window);
