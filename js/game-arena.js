/* ============================================================
   格兰德诺亚竞技场
   · 两个圆形棋子自动对战，玩家先猜胜者
   · 三局两胜；半径 / 碰撞伤害 / 速度 / 攻击方式来自名称库
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const { util, audio, settings } = YZ;

  const W = 960, H = 620;
  const CX = W / 2, CY = H / 2 + 4, ARENA_R = 278 * 2 / 3;
  const ROUND_TIME = 30;
  const WIN_SCORE = 2;
  const RANGE = { projectile: 195, laser: 245, trap: 125, none: 0 };
  const COOLDOWN = { projectile: 1.15, laser: 2.2, trap: 1.75, none: 999 };
  const PROJ_SPEED = 335;

  const ATTACK_LABEL = {
    none: "只靠碰撞",
    projectile: "射弹",
    laser: "激光",
    trap: "随机陷阱"
  };

  const sideColor = side => side === "red" ? "#f4c74e" : "#a97ae8";
  const sideDark = side => side === "red" ? "#8d5b15" : "#4b286f";

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function mount(root, api) {
    document.body.classList.add("arena-mode");
    const db = YZ.pieceDB;
    const roster = db.arenaRoster();
    const byKey = {};
    for (const p of roster) byKey[p.key] = p;

    const state = {
      phase: "setup",
      slot: "a",
      mode: "1v1",
      chain: false, chainActive: false, chainStreak: 0,
      picked: { a: "", a2: "", b: "", b2: "" },
      guess: "",
      score: { a: 0, b: 0 },
      round: 1,
      roundTime: 0,
      timeLeft: ROUND_TIME,
      countdown: 0,
      roundEndTimer: 0,
      roundWinner: "",
      overtime: false,
      bannerTimer: 0,
      matchWinner: "",
      fighters: [],
      projectiles: [],
      lasers: [],
      traps: [],
      clones: [],
      allies: [],
      heals: [],
      timeStop: 0, timeStopOwner: "",
      effects: [],
      paused: false,
      alive: true
    };

    let canvas = null, ctx = null, raf = 0, last = 0;
    let stageWrap = null, bannerEl = null, resultEl = null;
    const headCache = {};

    root.innerHTML =
      '<div class="ar-shell">' +
        '<div class="ar-head">' +
          '<div><p class="kicker">GRAND NOAH · ARENA</p><h2>格兰德诺亚竞技场</h2>' +
          '<p class="ar-sub">从 39 位斗士里选 1v1 或 2v2 阵容，猜哪队会赢。三局两胜，开打后交给它们自己。</p></div>' +
        '</div>' +
        '<div class="ar-setup" id="ar-setup">' +
          '<div class="ar-mode-row">' +
            '<span>模式</span>' +
            '<button class="ar-mode active" data-ar-mode="1v1" type="button">1v1</button>' +
            '<button class="ar-mode" data-ar-mode="2v2" type="button">2v2</button>' +
            '<button class="ar-chain" data-ar-chain type="button">连猜模式</button>' +
          '</div>' +
          '<div class="ar-pick-row">' +
            '<button class="ar-pick" data-slot="a" type="button"></button>' +
            '<button class="ar-pick off" data-slot="a2" type="button"></button>' +
            '<div class="ar-vs">VS</div>' +
            '<button class="ar-pick" data-slot="b" type="button"></button>' +
            '<button class="ar-pick off" data-slot="b2" type="button"></button>' +
          '</div>' +
          '<div class="ar-setup-tools">' +
            '<button class="mini-btn" data-ar-random type="button">随机阵容</button>' +
            '<span>点棋子换人：A 队默认邪神，B 队默认女神；同一枚不能重复。</span>' +
          '</div>' +
          '<div class="ar-guess-row">' +
            '<span>你猜谁会赢？</span>' +
            '<button class="ar-guess" data-ar-guess="a" type="button">猜 A 胜</button>' +
            '<button class="ar-guess" data-ar-guess="b" type="button">猜 B 胜</button>' +
          '</div>' +
          '<button class="btn primary ar-start" data-ar-start type="button" disabled>开始三局两胜</button>' +
          '<div class="ar-roster" id="ar-roster"></div>' +
        '</div>' +
        '<div class="ar-battle" id="ar-battle" hidden>' +
          '<div class="ar-matchbar">' +
            '<strong id="ar-round-no">第 1 回合</strong>' +
            '<span id="ar-score-text">0 : 0</span>' +
            '<small id="ar-clock">30.0</small>' +
          '</div>' +
          '<div class="ar-arena-row">' +
            '<aside class="ar-side-card team-a" id="ar-side-a">' +
              '<div class="ar-side-head"><span>红队 · A</span><b class="ar-pips" id="ar-pips-a"></b></div>' +
              '<div class="ar-side-art"><img id="ar-head-a" alt=""></div>' +
              '<strong id="ar-name-a">A</strong>' +
              '<small id="ar-role-a"></small>' +
              '<div class="ar-hp"><i id="ar-hp-a"></i><b class="ar-hpnum" id="ar-hpnum-a">0 / 0</b></div>' +
              '<div class="ar-unit-list" id="ar-units-a"></div>' +
              '<div class="ar-side-skill"><b>技能</b><p id="ar-skill-a">待填写</p></div>' +
              '<div class="ar-side-skill alt" id="ar-skill2-wrap-a" hidden><b id="ar-skill2-title-a">队友技能</b><p id="ar-skill2-a"></p></div>' +
            '</aside>' +
            '<div class="ar-stage" id="ar-stage">' +
              '<canvas id="ar-canvas" aria-label="格兰德诺亚竞技场战斗画面"></canvas>' +
              '<div class="ar-banner" id="ar-banner" hidden></div>' +
              '<div class="ar-result" id="ar-result" hidden></div>' +
            '</div>' +
            '<aside class="ar-side-card right team-b" id="ar-side-b">' +
              '<div class="ar-side-head"><b class="ar-pips" id="ar-pips-b"></b><span>蓝队 · B</span></div>' +
              '<div class="ar-side-art"><img id="ar-head-b" alt=""></div>' +
              '<strong id="ar-name-b">B</strong>' +
              '<small id="ar-role-b"></small>' +
              '<div class="ar-hp"><i id="ar-hp-b"></i><b class="ar-hpnum" id="ar-hpnum-b">0 / 0</b></div>' +
              '<div class="ar-unit-list" id="ar-units-b"></div>' +
              '<div class="ar-side-skill"><b>技能</b><p id="ar-skill-b">待填写</p></div>' +
              '<div class="ar-side-skill alt" id="ar-skill2-wrap-b" hidden><b id="ar-skill2-title-b">队友技能</b><p id="ar-skill2-b"></p></div>' +
            '</aside>' +
          '</div>' +
          '<div class="ar-foot"><span>自动战斗 · 猜胜负</span><span id="ar-foot-note">30 秒后进入狂暴：双方受伤与移速翻倍。</span></div>' +
        '</div>' +
      '</div>';

    const setupEl = root.querySelector("#ar-setup");
    const battleEl = root.querySelector("#ar-battle");
    const rosterEl = root.querySelector("#ar-roster");
    stageWrap = root.querySelector("#ar-stage");
    bannerEl = root.querySelector("#ar-banner");
    resultEl = root.querySelector("#ar-result");
    canvas = root.querySelector("#ar-canvas");
    ctx = canvas && canvas.getContext("2d");

    function attackLabel(key) { return ATTACK_LABEL[key] || ATTACK_LABEL.none; }

    function headFor(p) {
      if (!p || !p.head) return "";
      return p.head;
    }

    function imgFor(path) {
      if (!path) return null;
      if (headCache[path]) return headCache[path];
      const im = new Image();
      im.src = path;
      headCache[path] = im;
      return im;
    }

    function buildRoster() {
      rosterEl.innerHTML = roster.map(p =>
        '<button class="ar-roster-card" type="button" data-key="' + p.key + '">' +
        '<span class="ar-roster-head"><img src="' + headFor(p) + '" alt=""></span>' +
        '<span class="ar-roster-name">' + util.escapeHtml(p.displayName || p.name) + "</span></button>"
      ).join("");
      rosterEl.querySelectorAll("[data-key]").forEach(btn => {
        btn.addEventListener("click", () => choosePiece(btn.dataset.key));
      });
    }

    function pickedData(slot) {
      return byKey[state.picked[slot]] || null;
    }

    function activeSlots() {
      return state.mode === "2v2" ? ["a", "a2", "b", "b2"] : ["a", "b"];
    }

    function sideSlots(side) {
      return state.mode === "2v2" ? [side, side + "2"] : [side];
    }

    function sideReady(side) {
      return sideSlots(side).every(slot => !!state.picked[slot]);
    }

    function slotLabel(slot) {
      return slot === "a" ? "A1" : slot === "a2" ? "A2" : slot === "b" ? "B1" : "B2";
    }

    function applyDefaultPicks() {
      const black = roster.filter(p => p.side === "black");
      const red = roster.filter(p => p.side === "red");
      state.picked.a = black[0] ? black[0].key : "";
      state.picked.a2 = state.mode === "2v2" ? (black[1] ? black[1].key : "") : "";
      state.picked.b = red[0] ? red[0].key : "";
      state.picked.b2 = state.mode === "2v2" ? (red[1] ? red[1].key : "") : "";
      state.slot = "a";
      state.guess = "";
    }

    function cardHtml(slot, p) {
      if (!p) {
        return '<span class="ar-pick-empty"><b>' + slotLabel(slot) + "</b><small>从下方选择成员</small></span>";
      }
      return '<span class="ar-pick-badge">' + slotLabel(slot) + "</span>" +
        '<span class="ar-pick-head"><img src="' + headFor(p) + '" alt=""></span>' +
        '<strong class="ar-pick-name">' + util.escapeHtml(p.displayName || p.name) + "</strong>";
    }

    function updateSetup() {
      const active = activeSlots();
      if (!active.includes(state.slot)) state.slot = active[0];
      root.querySelectorAll(".ar-pick").forEach(card => {
        const slot = card.dataset.slot;
        const on = active.includes(slot);
        card.classList.toggle("off", !on);
        card.classList.toggle("active", on && state.slot === slot);
        card.classList.toggle("filled", !!state.picked[slot]);
        card.innerHTML = cardHtml(slot, pickedData(slot));
      });
      const pickRow = root.querySelector(".ar-pick-row");
      if (pickRow) {
        pickRow.classList.toggle("one", state.mode !== "2v2");
        pickRow.classList.toggle("two", state.mode === "2v2");
      }
      root.querySelectorAll("[data-ar-mode]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.arMode === state.mode);
      });
      const chainBtn = root.querySelector("[data-ar-chain]");
      if (chainBtn) {
        chainBtn.classList.toggle("active", state.chain);
        chainBtn.textContent = state.chain ? "连猜模式 · 已开启" : "连猜模式";
        chainBtn.title = "同一套阵容连续竞猜，猜对继续，猜错结束；不能重抽";
      }
      rosterEl.querySelectorAll("[data-key]").forEach(card => {
        for (const slot of ["a", "a2", "b", "b2"]) {
          card.classList.toggle("in-" + slot, card.dataset.key === state.picked[slot]);
        }
        card.classList.toggle("current", card.dataset.key === state.picked[state.slot]);
      });
      const aReady = sideReady("a"), bReady = sideReady("b");
      root.querySelectorAll("[data-ar-guess]").forEach(btn => {
        const side = btn.dataset.arGuess;
        btn.disabled = !(aReady && bReady);
        btn.classList.toggle("active", state.guess === side);
        btn.textContent = "猜 " + side.toUpperCase() + " 队胜";
      });
      const startBtn = root.querySelector("[data-ar-start]");
      if (startBtn) {
        startBtn.disabled = !(aReady && bReady && !!state.guess);
        startBtn.textContent = state.chain ? "开始连猜模式" : (state.mode === "2v2" ? "开始 2v2 三局两胜" : "开始三局两胜");
      }
    }

    function choosePiece(key) {
      if (state.phase !== "setup" || !byKey[key]) return;
      const active = activeSlots();
      const used = active.filter(slot => slot !== state.slot && state.picked[slot] === key);
      if (used.length) {
        YZ.toast("同一名成员不能重复上场", "bad");
        return;
      }
      state.picked[state.slot] = key;
      const next = active.find(slot => !state.picked[slot]);
      if (next) state.slot = next;
      audio.sfx("select");
      updateSetup();
    }

    function randomPair() {
      if (state.phase !== "setup") return;
      const pool = roster.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const active = activeSlots();
      active.forEach((slot, i) => { state.picked[slot] = pool[i] ? pool[i].key : ""; });
      state.slot = active[0];
      state.guess = "";
      audio.sfx("click");
      updateSetup();
    }

    function chooseGuess(side) {
      if (state.phase !== "setup") return;
      if (!sideReady("a") || !sideReady("b")) return;
      state.guess = side;
      audio.sfx("click");
      updateSetup();
    }

    function makeFighter(p, slot) {
      const st = Object.assign({}, p.stats);
      let maxHp = 100;
      if (p.id === "ruka-6-1") st.attackDamage = 15;
      if (p.id === "ruka-2-1") st.attack = "none";
      if (p.id === "ruka-1-1") st.attack = "none";
      if (p.id === "ruka-2-2") st.attack = "none";
      if (p.id === "chaos-2-2") st.attack = "none";
      if (p.id === "ruka-4-2") st.attack = "none";
      if (p.id === "red-1-1") st.attack = "none";
      if (p.id === "red-2-2") st.attack = "none";
      if (p.id === "black-2-1") st.attack = "none";
      if (p.id === "black-4-1") st.attack = "none";
      if (p.id === "red-6-1") st.skill = "不动的律法裁决——始终不移动；每 0.5 秒发射两枚伤害减半的针弹。";
      if (p.id === "chaos-5-1") {
        st.skill = "不存在的第四使徒——每 9 秒进入 4 秒虚化状态（透明度减半），期间不受到伤害、不被碰撞推开，但会对接触的敌人造成碰撞伤害（dot伤害除外）。";
      }
      if (p.id === "black-2-1") {
        st.skill = "六祖之首——交替使用「俱利伽罗的黑龙」与「阿基里斯之盾」：黑龙造成中伤害并灼烧；盾牌停在原地面向敌人，前方屏障造成碰撞伤害，持续 4 秒或被从背后击中时破裂。";
      }
      if (p.id === "black-4-1") {
        st.skill = "魅拳双绝——平时不移动并蓄势，每秒获得 1 层势（最多 10 层）；敌人进入警戒范围时突进，消耗全部势造成 10 + 2×层数 的碰撞伤害。";
      }
      if (p.id === "red-1-1") {
        st.skill = "普照神民的神光——不发动普通攻击；场上生成两个交叉、旋转并周期变化的十字星，只造成持续伤害、不产生碰撞。";
      }
      if (p.id === "red-3-2") {
        st.skill = "慈爱的圣百合——开局展开覆盖全场的治疗领域，持续整局；所有友方每秒回复 4 点生命，自身每秒额外回复 3 点。";
      }
      if (p.id === "black-1-1") {
        st.skill = "魔界的邪神——生命上限 200，每秒回复 5 点；每 4.5 秒发射一枚缓慢但沉重的紫色射弹。";
      }
      if (p.id === "ruka-3-1") {
        st.skill = "无能淫魔——攻击施加怨念并偷取目标 10% 攻击力；攻击已带怨念的目标时，额外偷取等量层数的生命。";
      }
      if (p.id === "red-2-2") {
        st.skill = "小小神明的奇策——每 2 秒向敌人发射伤害 10 并麻痹的雷电；每 10 秒随机召唤 1 血米卡艾拉酱（10%）、露西菲娜酱（50%），或获得免疫一次伤害的圣光（40%）。";
      }
      if (p.id === "red-5-1") {
        st.attack = "none";
        st.skill = "天界决战兵器——最大生命提高 50%，每秒流失 1 点；每 2.5 秒向八方向发射伤害 10 的光弹，每 2 秒发射伤害 10 的激光。";
      }
      if (p.id === "chaos-4-1") { maxHp = 20; st.damage = 20; st.attackDamage = 20; st.radius = 19; }
      if (p.id === "chaos-1-1") { maxHp = 30; st.radius = 26; }
      if (p.id === "red-5-1") maxHp = 150;
      if (p.id === "black-1-1") maxHp = 200;
      if (p.id === "black-3-1") maxHp = 40;
      if (p.id === "black-5-1") maxHp = 100;
      if (p.id === "black-7-3") maxHp = 80;
      const left = slot === "a";
      const angle = Math.random() * Math.PI * 2;
      let speed = Math.max(1, st.speed);
      if (p.id === "red-6-1") speed = 0;
      if (p.id === "black-4-1") speed = 0;
      return {
        slot, p, side: p.side, stats: st, immobile: p.id === "red-6-1",
        maxHp, hp: maxHp, baseMaxHp: maxHp,
        noCollision: p.id === "red-1-1",
        x: left ? CX - 100 : CX + 100,
        y: CY + (left ? 1 : -1) * 32,
        homeX: left ? CX - 100 : CX + 100,
        homeY: CY + (left ? 1 : -1) * 32,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: st.radius,
        atkCd: 0.65 + Math.random() * 0.6, atkRate: 1,
        collCd: 0,
        flash: 0,
        head: headFor(p),
        img: imgFor(headFor(p)),
        burn: 0, burnTick: 0,
        paralyze: 0, freeze: 0, water: 0, control: 0,
        shield: 0, invincible: 0, star: 0, heal: 0,
        hold: 0, dash: 0, dashHit: false, slow: 0,
        wither: 0, witherTick: 0, grudge: 0, atkBuff: 1, atkNerf: 1, noDamageDealt: 0,
        collisionLock: 0, clubAngle: Math.random() * Math.PI * 2, clubCd: 0,
        phaseTimer: 0, phaseActive: false, atomCd: 0, atomMerge: 0, marchTimer: 0, marchCharge: 0, marchAngle: 0,
        chargeTotal: 0, chargeLeft: 0, crossAngle: Math.random() * Math.PI * 2, crossSize: 100, crossCd: 0,
        smallBolt: 2, smallGift: 10, holyShield: false, fistStacks: 0, fistTimer: 0, fistDash: false, fistDamage: 0,
        snakeShield: false, snakeShieldTimer: 0, snakeAngle: 0, snakeCd: 2.5, snakeMode: 0,
        gimmickAtk: 0, idiaPhase: 0, idiaTimer: 0, idiaAngle: 0, bladeAura: 0,
        spinTimer: 0, spinAngle: 0, spinUntil: 0, spinStart: 0,
        urielBurst: p.id === "red-5-1" ? 2.5 : 0, urielLaser: p.id === "red-5-1" ? 2 : 0,
        speedBoost: 1, dmgBoost: 1,
        skillCd: 0.8 + Math.random(),
        skill2Cd: 4,
        buffTimer: 0,
        reviveStage: 0,
        charged: false,
        defense: false,
        merged: false,
        splitDone: false,
        splitKind: "",
        spearTimer: 0,
        planetTimer: 0,
        bloodBoost: false
      };
    }

    function makeTeammate(p, slot) {
      const f = makeFighter(p, slot);
      const isA = slot === "a";
      f.isAlly = true;
      f.teammate = true;
      f.x = CX + (isA ? -100 : 100);
      f.y = CY + (isA ? -42 : 42);
      f.homeX = f.x; f.homeY = f.y;
      const angle = Math.random() * Math.PI * 2;
      f.vx = Math.cos(angle) * Math.max(1, f.stats.speed);
      f.vy = Math.sin(angle) * Math.max(1, f.stats.speed);
      f.head = headFor(p);
      f.img = imgFor(f.head);
      f.atkCd = 0.65 + Math.random() * 0.6;
      f.skillCd = 0.8 + Math.random();
      return f;
    }

    function makeAlly(owner, kind, hp, x, y, opt) {
      const o = opt || {};
      const angle = Math.random() * Math.PI * 2;
      const speed = o.speed == null ? 150 : o.speed;
      return {
        isAlly: true, kind, ownerSlot: owner.slot, slot: owner.slot, side: owner.side,
        p: owner.p, stats: owner.stats,
        maxHp: hp, hp, x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: o.radius || 14, atkCd: 0.8 + Math.random(), atkRate: 1, collCd: 0,
        flash: 0, immobile: !!o.immobile, damage: o.damage || 10,
        head: o.head || owner.head, img: o.head ? imgFor(o.head) : (o.img || owner.img), splitGen: o.splitGen || 0
      };
    }

    function spawnChessMinions(f) {
      const id = f.p.id;
      if (id === "ruka-2-1") {
        f.drones = [0, 1].map(i => ({ angle: i * Math.PI + Math.PI / 2, dist: 48, cd: 0.8 + i * 0.5 }));
      } else if (id === "chaos-6-1") {
        f.eyes = [0, 1].map(i => ({ angle: i * Math.PI + Math.PI / 2, dist: 54 }));
        f.eyeImgs = ["img/arena/eyeL.png", "img/arena/eyeR.png"].map(src => imgFor(src));
        f.eyeShield = true;
      } else if (id === "chaos-1-1") {
        for (let i = 0; i < 3; i++) {
          const ang = Math.PI * 2 * i / 3;
          const a = spawnAlly(f, "chessApilos", 30, f.x + Math.cos(ang) * 34, f.y + Math.sin(ang) * 34, { radius: 17, speed: 170, head: f.head, img: f.img, damage: 18 });
          if (a) a.arenaSide = f.side;
        }
      }
    }

    function clampToArena(x, y, r) {
      const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
      const max = ARENA_R - (r || 0) - 3;
      if (d <= max || d < 0.001) return { x, y };
      return { x: CX + dx / d * max, y: CY + dy / d * max };
    }

    function spawnAlly(owner, kind, hp, x, y, opt) {
      const pos = clampToArena(x, y, (opt && opt.radius) || 14);
      const a = makeAlly(owner, kind, hp, pos.x, pos.y, opt);
      state.allies.push(a);
      return a;
    }

    function splitHuayin(f) {
      if (f.splitDone) return;
      f.splitDone = true;
      f.maxHp = 50; f.hp = Math.min(50, f.hp);
      f.splitKind = "left-arm";
      spawnAlly(f, "right-arm", 50, f.x + 52, f.y + 22, { radius: 15, speed: 0, immobile: true, damage: 10, head: "img/arena/br2.png" });
      state.effects.push({ x: f.x, y: f.y - 30, text: "华音 · 双腕分离", life: 1.2, color: "#f4d28a" });
    }

    function splitMetatron(f) {
      if (f.splitDone) return;
      f.splitDone = true;
      f.maxHp = 50; f.hp = Math.min(50, f.hp);
      f.splitKind = "metatron";
      const sister = spawnAlly(f, "sandalphon", 50, f.x - 46, f.y - 30, { radius: 15, speed: 0, immobile: true, damage: 10, head: "img/arena/wg2-right.png" });
      f.head = "img/arena/wg2-left.png";
      f.img = imgFor("img/arena/wg2-left.png");
      f.p = Object.assign({}, f.p, { name: "梅塔特隆", displayName: "梅塔特隆", fullArt: "img/chess/art/arena-wg2-left.png" });
      if (sister) {
        sister.p = Object.assign({}, sister.p, { name: "尚达芬妮", displayName: "尚达芬妮", fullArt: "img/chess/art/arena-wg2-right.png" });
        sister.atomSister = true;
        sister.head = "img/arena/wg2-right.png";
        sister.img = imgFor("img/arena/wg2-right.png");
      }
      state.effects.push({ x: f.x, y: f.y - 30, text: "核动力双子 · 分离", life: 1.2, color: "#f4d28a" });
    }

    function atomHeaven(main, sister) {
      if (!main || !sister || main.hp <= 0 || sister.hp <= 0 || main.atomCd > 0) return;
      main.atomCd = 3.8;
      const total = Math.max(1, main.hp + sister.hp);
      const mx = (main.x + sister.x) / 2, my = (main.y + sister.y) / 2;
      const target = nearestEnemyBody(main.slot, mx, my);
      if (target) {
        const proxy = { x: mx, y: my, slot: main.slot, side: main.side, stats: main.stats };
        spawnBeams(proxy, target, {
          count: 1, aim: "current", range: 900,
          damage: Math.max(30, Math.round(total * 0.55)), style: "atom"
        });
      }
      main.hp = Math.min(50, Math.max(1, Math.round(total / 2)));
      sister.hp = Math.min(50, Math.max(1, total - main.hp));
      main.maxHp = 50; sister.maxHp = 50;
      const dx = main.x - sister.x, dy = main.y - sister.y;
      const a = Math.atan2(dy || 0.01, dx || 1);
      const rx = Math.cos(a) * 34, ry = Math.sin(a) * 34;
      main.x = clampToArena(mx + rx, my + ry, main.radius).x;
      main.y = clampToArena(mx + rx, my + ry, main.radius).y;
      sister.x = clampToArena(mx - rx, my - ry, sister.radius).x;
      sister.y = clampToArena(mx - rx, my - ry, sister.radius).y;
      main.invincible = Math.max(main.invincible, 0.25);
      sister.invincible = Math.max(sister.invincible, 0.25);
      main.atomMerge = 0.55;
      state.effects.push({ x: mx, y: my - 24, text: "原子天堂", life: 1.1, color: "#b8ffcf" });
      audio.sfx("check");
    }

    function sideAllies(slot) {
      return state.allies.filter(a => a.slot === slot && a.hp > 0);
    }

    function sideAlive(slot) {
      const main = fighter(slot);
      return !!(main && main.hp > 0) || sideAllies(slot).some(a => !a.noTarget);
    }

    function allBodies() {
      const out = [];
      for (const slot of ["a", "b"]) {
        const main = fighter(slot);
        if (main && main.hp > 0) out.push(main);
        for (const a of sideAllies(slot)) if (!a.noTarget) out.push(a);
      }
      return out;
    }

    function nearestEnemyBody(slot, x, y) {
      let best = null, bd = Infinity;
      for (const f of allBodies()) {
        if (f.slot === slot) continue;
        const d = dist(x, y, f.x, f.y);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    }

    function startMatch(resetChain) {
      if (!sideReady("a") || !sideReady("b") || !state.guess) return;
      if (resetChain !== false) {
        state.chainActive = state.chain;
        state.chainStreak = 0;
      }
      state.score = { a: 0, b: 0 };
      state.round = 1;
      state.matchWinner = "";
      state.phase = "countdown";
      setupEl.hidden = true;
      battleEl.hidden = false;
      resultEl.hidden = true;
      resultEl.innerHTML = "";
      updateHud();
      resize();
      startRound();
    }

    function startRound() {
      state.fighters = [
        makeFighter(pickedData("a"), "a"),
        makeFighter(pickedData("b"), "b")
      ];
      state.allies = [];
      state.timeStop = 0; state.timeStopOwner = "";
      {
        const a = state.fighters[0], b = state.fighters[1];
        if (a && b && a.p.id === "black-4-1" && b.p.id !== "black-4-1") {
          const ang = Math.atan2(a.y - b.y, a.x - b.x) || 0;
          a.x = clampToArena(b.x + Math.cos(ang) * 76, b.y + Math.sin(ang) * 76, a.radius).x;
          a.y = clampToArena(b.x + Math.cos(ang) * 76, b.y + Math.sin(ang) * 76, a.radius).y;
        }
        if (a && b && b.p.id === "black-4-1" && a.p.id !== "black-4-1") {
          const ang = Math.atan2(b.y - a.y, b.x - a.x) || 0;
          b.x = clampToArena(a.x + Math.cos(ang) * 76, a.y + Math.sin(ang) * 76, b.radius).x;
          b.y = clampToArena(a.x + Math.cos(ang) * 76, a.y + Math.sin(ang) * 76, b.radius).y;
        }
      }
      if (state.fighters[0]) spawnChessMinions(state.fighters[0]);
      if (state.fighters[1]) spawnChessMinions(state.fighters[1]);
      if (state.mode === "2v2") {
        if (pickedData("a2")) state.allies.push(makeTeammate(pickedData("a2"), "a"));
        if (pickedData("b2")) state.allies.push(makeTeammate(pickedData("b2"), "b"));
      }
      state.projectiles = [];
      state.lasers = [];
      state.traps = [];
      state.clones = [];
      state.heals = [];
      for (const f of [...state.fighters, ...state.allies]) {
        if (f && f.p.id === "red-3-2" && f.hp > 0) {
          state.heals.push({ x: f.x, y: f.y, r: ARENA_R, life: 999, slot: f.slot, rate: 4, persistent: true });
        }
      }
      state.effects = [];
      state.roundTime = 0;
      state.timeLeft = ROUND_TIME;
      state.countdown = 1.35;
      state.roundEndTimer = 0;
      state.roundWinner = "";
      state.overtime = false;
      state.bannerTimer = 0;
      state.phase = "countdown";
      resultEl.hidden = true;
      resultEl.innerHTML = "";
      showBanner("第 " + state.round + " 回合", "准备好", "");
      updateHud();
    }

    function showBanner(title, sub, cls) {
      if (!bannerEl) return;
      bannerEl.hidden = false;
      bannerEl.className = "ar-banner " + (cls || "");
      bannerEl.innerHTML = "<strong>" + util.escapeHtml(title) + "</strong><small>" + util.escapeHtml(sub || "") + "</small>";
    }

    function hideBanner() {
      if (bannerEl) bannerEl.hidden = true;
    }

    function updateHud() {
      const a = state.fighters[0] || makeFighter(pickedData("a"), "a");
      const b = state.fighters[1] || makeFighter(pickedData("b"), "b");
      const set = (side, f) => {
        const name = root.querySelector("#ar-name-" + side);
        const role = root.querySelector("#ar-role-" + side);
        const head = root.querySelector("#ar-head-" + side);
        const hp = root.querySelector("#ar-hp-" + side);
        const hpnum = root.querySelector("#ar-hpnum-" + side);
        const units = root.querySelector("#ar-units-" + side);
        const pips = root.querySelector("#ar-pips-" + side);
        const skill = root.querySelector("#ar-skill-" + side);
        const bodies = [f, ...sideAllies(side)].filter(u => u && u.hp > 0 && !u.noTarget);
        if (name) name.textContent = f.p.displayName || f.p.name;
        if (role) role.textContent = (side === "a" ? "红队" : "蓝队") + " · " + bodies.length + " 单位";
        if (head) head.src = f.p.fullArt || f.head;
        if (hp) {
          hp.style.width = clamp(f.hp / f.maxHp * 100, 0, 100) + "%";
          hp.classList.toggle("low", f.hp / f.maxHp < 0.3);
        }
        if (hpnum) hpnum.textContent = Math.max(0, Math.round(f.hp)) + " / " + Math.round(f.maxHp);
        if (units) {
          units.innerHTML = bodies.map(u => {
            const tag = u === f ? "主将" : (u.teammate ? "队友" : "分体");
            const pct = clamp(u.hp / u.maxHp * 100, 0, 100);
            return '<div class="ar-unit-row">' +
              '<span class="ar-unit-dot"></span>' +
              '<span class="ar-unit-name">' + util.escapeHtml(u.p.displayName || u.p.name) + '<em>' + tag + "</em></span>" +
              '<b class="ar-unit-hp">' + Math.max(0, Math.round(u.hp)) + " / " + Math.round(u.maxHp) + "</b>" +
              '<i class="ar-unit-bar"><em style="width:' + pct + '%"></em></i>' +
              "</div>";
          }).join("");
        }
        const mate = sideAllies(side).find(a => a.teammate);
        const sw = root.querySelector("#ar-skill2-wrap-" + side);
        const stitle = root.querySelector("#ar-skill2-title-" + side);
        const stext = root.querySelector("#ar-skill2-" + side);
        if (sw) sw.hidden = !mate;
        if (stitle && mate) stitle.textContent = "队友 · " + (mate.p.displayName || mate.p.name);
        if (stext && mate) {
          const text = String(mate.stats.skill || "").trim();
          stext.textContent = text || "技能描述待填写";
          stext.classList.toggle("empty", !text);
        }
        if (pips) {
          const score = state.score[side] || 0;
          pips.innerHTML = [0, 1].map(i => '<i class="' + (i < score ? "on" : "") + '"></i>').join("");
        }
        if (skill) {
          const text = String(f.stats.skill || "").trim();
          skill.textContent = text || "技能描述待填写";
          skill.classList.toggle("empty", !text);
        }
      };
      set("a", a); set("b", b);
      const no = root.querySelector("#ar-round-no");
      if (no) no.textContent = "第 " + state.round + " 回合";
      const score = root.querySelector("#ar-score-text");
      if (score) score.textContent = state.score.a + " : " + state.score.b;
      const clock = root.querySelector("#ar-clock");
      if (clock) {
        clock.textContent = state.overtime ? "狂暴" : (state.phase === "fight" ? Math.max(0, state.timeLeft).toFixed(1) : "VS");
        clock.classList.toggle("rage", state.overtime);
      }
      const foot = root.querySelector("#ar-foot-note");
      if (foot) foot.textContent = state.chainActive ? "连猜模式 · 已连赢 " + state.chainStreak + " 场 · 同一阵容不重抽" : "30 秒后进入狂暴：双方受伤与移速翻倍。";
    }

    function fighter(slot) {
      return state.fighters.find(f => f.slot === slot) || null;
    }

    function tryRevive(f) {
      if (!f) return false;
      const id = f.p.id;
      if (id === "red-3-1" && f.reviveStage === 0) {
        f.reviveStage = 1; f.hp = 40; f.invincible = Math.max(f.invincible, 1.3);
        state.effects.push({ x: f.x, y: f.y - 30, text: "复活", life: 1.2, color: "#ffe0a0" });
        return true;
      }
      if (id === "chaos-4-1") {
        if (f.reviveStage === 0) {
          f.reviveStage = 1; f.maxHp = 30; f.hp = 30; f.stats.attackDamage = 30; f.stats.damage = 30;
          f.invincible = Math.max(f.invincible, 1.2);
          state.effects.push({ x: f.x, y: f.y - 30, text: "复活 30/30", life: 1.1, color: "#ffe0a0" });
          return true;
        }
        if (f.reviveStage === 1) {
          f.reviveStage = 2; f.maxHp = 40; f.hp = 40; f.stats.attackDamage = 40; f.stats.damage = 40;
          f.invincible = Math.max(f.invincible, 1.2);
          state.effects.push({ x: f.x, y: f.y - 30, text: "复活 40/40", life: 1.1, color: "#ffe0a0" });
          return true;
        }
      }
      if (id === "black-3-1" && !f.isAlly) {
        if (f.reviveStage === 0) {
          f.reviveStage = 1; f.hp = 0;
          for (const dx of [-34, 34]) spawnAlly(f, "slime20", 20, f.x + dx, f.y + (dx < 0 ? -16 : 16), { radius: 13, speed: 170, damage: 9, splitGen: 1 });
          return true;
        }
      }
      return false;
    }

    function downAlly(a) {
      if (!a || a.hp > 0) return;
      if (a.kind === "slime20") {
        for (let i = 0; i < 3; i++) {
          const ang = Math.PI * 2 * i / 3 + Math.random() * 0.4;
          spawnAlly(a, "slime10", 10, a.x + Math.cos(ang) * 28, a.y + Math.sin(ang) * 28, { radius: 9, speed: 190, damage: 6, splitGen: 2 });
        }
      } else if (a.kind === "slime40") {
        // 大祸抚死亡：分裂成两个中祸抚
        for (const dx of [-30, 30]) {
          spawnAlly(a, "slime20", 20, a.x + dx, a.y - 16, { radius: 13, speed: 170, damage: 9, splitGen: 1 });
        }
      }
    }

    function mergeSlimes(a, b) {
      if (!a || !b || a === b || a.hp <= 0 || b.hp <= 0) return false;
      if (a.slot !== b.slot || a.kind !== b.kind) return false;
      const isSmall = a.kind === "slime10";
      const isMedium = a.kind === "slime20";
      if (!isSmall && !isMedium) return false;
      const kind = isSmall ? "slime20" : "slime40";
      const hp = Math.min(kind === "slime40" ? 40 : 20, a.hp + b.hp);
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      a.hp = 0; a.dead = true;
      b.hp = 0; b.dead = true;
      spawnAlly(a, kind, hp, x, y, {
        radius: kind === "slime40" ? 17 : 13,
        speed: kind === "slime40" ? 150 : 170,
        damage: kind === "slime40" ? 12 : 9,
        splitGen: kind === "slime40" ? 1 : 2
      });
      state.effects.push({ x, y: y - 18, text: "祸抚合体", life: 0.9, color: "#d8a6ff" });
      return true;
    }

    function onHit(source, target) {
      if (!source || !target || source === target) return;
      const id = source.p && source.p.id;
      if (id === "ruka-3-1") {
        const stolen = target.grudge || 0;
        target.atkNerf = (target.atkNerf || 1) * 0.9;
        source.atkBuff = (source.atkBuff || 1) * 1.1;
        target.grudge = (target.grudge || 0) + 1;
        if (stolen > 0) {
          source.hp = Math.min(source.maxHp, source.hp + stolen);
          state.effects.push({ x: source.x, y: source.y - source.radius - 14, text: "怨念吸血 +" + stolen, life: 0.9, color: "#ffc0e0" });
        }
        state.effects.push({ x: target.x, y: target.y - target.radius - 12, text: "怨念", life: 0.7, color: "#d8a6ff" });
      } else if (id === "chaos-3-1" || id === "chaos-2-1") {
        target.wither = (target.wither || 0) + 1;
      } else if (id === "chaos-4-2") {
        target.paralyze = Math.max(target.paralyze, 1.2);
        target.burn = Math.max(target.burn, 4);
      } else if (id === "chaos-3-2") {
        target.collisionLock = Math.max(target.collisionLock, 2);
      }
    }

    function buffOpponents(slot) {
      const other = slot === "a" ? "b" : "a";
      const main = fighter(other);
      if (main && main.hp > 0 && (main.atkRate || 1) < 2) {
        main.atkRate = 2;
        state.effects.push({ x: main.x, y: main.y - main.radius - 14, text: "攻速 ×2", life: 1, color: "#ffe08a" });
      }
      for (const a of sideAllies(other)) {
        if (a.hp > 0 && (a.atkRate || 1) < 2) {
          a.atkRate = 2;
          state.effects.push({ x: a.x, y: a.y - a.radius - 12, text: "攻速 ×2", life: 1, color: "#ffe08a" });
        }
      }
    }

    function damage(f, amount, color, source) {
      if (state.phase !== "fight" || !f || f.hp <= 0) return;
      if (f.permanent) return;
      if (f.p.id === "black-2-1" && f.snakeShield) {
        const dx = source ? source.x - f.x : -Math.cos(f.snakeAngle);
        const dy = source ? source.y - f.y : -Math.sin(f.snakeAngle);
        const facing = Math.cos(f.snakeAngle) * dx + Math.sin(f.snakeAngle) * dy;
        if (source && facing > 0) {
          state.effects.push({ x: f.x, y: f.y - f.radius - 14, text: "盾反", life: 0.8, color: "#ffe6a0" });
          if (source.hp > 0) damage(source, 8, "#ffd76a", f);
          return;
        }
        f.snakeShield = false;
        if (f.p.id !== "red-6-1") f.immobile = false;
        state.effects.push({ x: f.x, y: f.y - f.radius - 14, text: "破盾", life: 0.8, color: "#ff9a8a" });
      }
      if (f.holyShield) {
        f.holyShield = false;
        state.effects.push({ x: f.x, y: f.y - f.radius - 12, text: "圣光免疫", life: 0.8, color: "#fff8c8" });
        return;
      }
      if (f.invincible > 0 || f.star > 0) {
        state.effects.push({ x: f.x, y: f.y - f.radius - 10, text: "免疫", life: 0.7, color: "#cfc2ff" });
        return;
      }
      onHit(source, f);
      let mult = 1;
      if (f.water > 0 || f.freeze > 0) mult *= 0.5;
      if (f.shield > 0) mult *= 0.5;
      if (f.eyeShield) {
        mult *= 0.5;
        state.effects.push({ x: f.x, y: f.y - f.radius - 10, text: "护眼", life: 0.45, color: "#ff9ab0" });
      }
      if (f.p.id === "red-4-1" && Math.hypot(f.vx, f.vy) > 20) mult *= 0.5;
      const n = Math.max(1, Math.round(amount * mult * (state.overtime ? 2 : 1)));
      f.hp = Math.max(0, f.hp - n);
      f.flash = 0.2;
      state.effects.push({ x: f.x, y: f.y - f.radius - 10, text: "-" + n, life: 0.8, color: color || "#ffd776" });
      if (f.hp <= 0) {
        if (f.isAlly) {
          downAlly(f);
          if (sideAlive(f.slot)) buffOpponents(f.slot);
          else finishRound(f.slot === "a" ? "b" : "a");
          return;
        }
        if (tryRevive(f)) return;
        if (sideAlive(f.slot)) buffOpponents(f.slot);
        else finishRound(f.slot === "a" ? "b" : "a");
      }
    }

    function applyStatus(target, status) {
      if (!target || !status) return;
      if (status.burn) target.burn = Math.max(target.burn, status.burn);
      if (status.paralyze) target.paralyze = Math.max(target.paralyze, status.paralyze);
      if (status.freeze) target.freeze = Math.max(target.freeze, status.freeze);
      if (status.water) target.water = Math.max(target.water, status.water);
      if (status.control) target.control = Math.max(target.control, status.control);
      if (status.slow) target.slow = Math.max(target.slow, status.slow);
      if (status.reverse) {
        target.vx = -target.vx; target.vy = -target.vy;
        state.effects.push({ x: target.x, y: target.y - target.radius - 14, text: "风向反转", life: 0.9, color: "#b9f3ff" });
      }
    }

    function tickStatuses(f, dt) {
      f.burn = Math.max(0, f.burn - dt);
      f.paralyze = Math.max(0, f.paralyze - dt);
      f.freeze = Math.max(0, f.freeze - dt);
      f.water = Math.max(0, f.water - dt);
      f.control = Math.max(0, f.control - dt);
      f.shield = Math.max(0, f.shield - dt);
      f.invincible = Math.max(0, f.invincible - dt);
      f.star = Math.max(0, f.star - dt);
      f.hold = Math.max(0, f.hold - dt);
      if (f.chargeLeft > 0) f.chargeLeft = Math.max(0, f.chargeLeft - dt);
      f.dash = Math.max(0, f.dash - dt);
      f.slow = Math.max(0, f.slow - dt);
      if (f.star > 0) f.invincible = Math.max(f.invincible, f.star);
      if (f.buffTimer > 0) {
        f.buffTimer -= dt;
        if (f.buffTimer <= 0) { f.dmgBoost = 1; f.speedBoost = 1; }
      }
      if (f.p.id === "red-4-2" && f.star <= 0) f.dmgBoost = 1;
      if (f.p.id === "red-3-2") f.hp = Math.min(f.maxHp, f.hp + 3 * dt);
      if (f.p.id === "black-1-1") f.hp = Math.min(f.maxHp, f.hp + 5 * dt);
      if (f.burn > 0) {
        f.burnTick += dt;
        while (f.burnTick >= 1) {
          f.burnTick -= 1;
          damage(f, 1, "#ff9a5a", null);
          if (state.phase !== "fight") return;
        }
      }
      if (f.wither > 0) {
        f.witherTick += dt;
        while (f.witherTick >= 1) {
          f.witherTick -= 1;
          damage(f, f.wither, "#b06ad8", null);
          if (state.phase !== "fight") return;
        }
      }
      if (f.heal > 0) {
        f.heal = Math.max(0, f.heal - dt);
        f.hp = Math.min(f.maxHp, f.hp + 2 * dt);
      }
      if (f.p.id === "red-5-1") {
        f.hp = Math.max(0, f.hp - dt);
        if (f.hp <= 0) { if (!tryRevive(f)) finishRound(f.slot === "a" ? "b" : "a"); return; }
      }
    }

    function finishRound(winner) {
      if (state.phase !== "fight") return;
      state.phase = "roundEnd";
      state.roundWinner = winner;
      state.score[winner] = (state.score[winner] || 0) + 1;
      state.roundEndTimer = 1.8;
      const p = pickedData(winner);
      showBanner((p ? (p.displayName || p.name) : winner) + " 拿下本回合", "比分 " + state.score.a + " : " + state.score.b, "round");
      audio.sfx("win");
      updateHud();
    }

    function finishMatch() {
      state.phase = "matchEnd";
      state.matchWinner = state.score.a >= WIN_SCORE ? "a" : "b";
      const winnerName = (pickedData(state.matchWinner) && (pickedData(state.matchWinner).displayName || pickedData(state.matchWinner).name)) || state.matchWinner;
      const guessed = state.guess === state.matchWinner;
      const chainWas = state.chainActive;
      if (chainWas && guessed) {
        state.chainStreak++;
        if (YZ.achievements) YZ.achievements.recordArena(true, true, state.chainStreak);
      } else {
        if (chainWas) state.chainActive = false;
        if (YZ.achievements) YZ.achievements.recordArena(guessed, chainWas, 0);
      }
      hideBanner();
      resultEl.hidden = false;
      const aName = (pickedData("a") && (pickedData("a").displayName || pickedData("a").name)) || "A";
      const bName = (pickedData("b") && (pickedData("b").displayName || pickedData("b").name)) || "B";
      let html = '<div class="ar-result-card"><p class="kicker">' + (chainWas ? "CHAIN GUESS" : "MATCH OVER") + '</p>';
      html += '<h3>' + (chainWas ? (guessed ? "连猜命中" : "连猜结束") : (guessed ? "猜对了" : "猜错了")) + '</h3>';
      html += '<p class="ar-result-name">' + util.escapeHtml(winnerName) + " 赢下比赛</p>";
      html += '<p class="ar-result-pair">' + util.escapeHtml(aName) + " VS " + util.escapeHtml(bName) + '</p>';
      html += '<p class="ar-result-score">' + state.score.a + " : " + state.score.b + '</p>';
      if (chainWas) {
        html += '<p class="ar-chain-result">连赢 ' + state.chainStreak + ' 场</p>';
        if (guessed) {
          html += '<p class="ar-chain-next">下一场仍是同一对阵容。选择你的猜测：</p>' +
            '<div class="ar-result-actions">' +
              '<button class="btn primary" data-chain-guess="a">猜 A 胜 · 下一场</button>' +
              '<button class="btn" data-chain-guess="b">猜 B 胜 · 下一场</button>' +
              '<button class="btn ghost" data-ar-exit>返回主页</button>' +
            '</div>';
        } else {
          html += '<p class="ar-chain-next">连猜不能重抽；输掉后请重新选择阵容。</p>' +
            '<div class="ar-result-actions">' +
              '<button class="btn primary" data-ar-new>重新选择</button>' +
              '<button class="btn ghost" data-ar-exit>返回主页</button>' +
            '</div>';
        }
      } else {
        html += '<div class="ar-result-actions">' +
          '<button class="btn primary" data-ar-again>再打一场</button>' +
          '<button class="btn" data-ar-new>重新选人</button>' +
          '<button class="btn ghost" data-ar-exit>返回主页</button>' +
        '</div>';
      }
      html += '</div>';
      resultEl.innerHTML = html;
      resultEl.querySelectorAll("[data-chain-guess]").forEach(btn => btn.addEventListener("click", () => {
        state.guess = btn.dataset.chainGuess;
        startMatch(false);
      }));
      const again = resultEl.querySelector("[data-ar-again]");
      if (again) again.addEventListener("click", () => startMatch());
      const fresh = resultEl.querySelector("[data-ar-new]");
      if (fresh) fresh.addEventListener("click", () => {
        state.phase = "setup";
        state.chainActive = false;
        state.chainStreak = 0;
        state.score = { a: 0, b: 0 };
        state.round = 1;
        state.matchWinner = "";
        resultEl.hidden = true;
        battleEl.hidden = true;
        setupEl.hidden = false;
        updateSetup();
      });
      const exit = resultEl.querySelector("[data-ar-exit]");
      if (exit) exit.addEventListener("click", api.onExit);
      audio.sfx(guessed ? "win" : "lose");
    }

    function aimAngle(f, o, cfg, index, count) {
      const base = Math.atan2(o.y - f.y, o.x - f.x);
      if (cfg.aim === "front") {
        const tx = o.x + o.vx * 0.32, ty = o.y + o.vy * 0.32;
        return Math.atan2(ty - f.y, tx - f.x) + (index - (count - 1) / 2) * 0.1;
      }
      if (cfg.aim === "random") return Math.random() * Math.PI * 2;
      if (cfg.aim === "four") return base + index * Math.PI / 2;
      if (cfg.aim === "eight") return base + index * Math.PI / 4;
      return base + (index - (count - 1) / 2) * 0.11;
    }

    function attackCount(cfg) {
      if (cfg.aim === "four") return 4;
      if (cfg.aim === "eight") return 8;
      return Math.max(1, Math.min(8, cfg.count || 1));
    }

    function cloneFor(f) {
      return {
        x: f.x + (Math.random() - 0.5) * 80,
        y: f.y + (Math.random() - 0.5) * 80,
        owner: f.slot,
        head: f.head,
        img: f.img,
        life: 2.6,
        atkCd: 0.5,
        color: sideColor(f.side)
      };
    }

    function castChessAttack(f, o) {
      const id = f.p.id;
      if (id === "ruka-5-1") {
        const forms = ["circle", "needle", "beam"];
        for (let i = 0; i < 2; i++) {
          const form = forms[Math.floor(Math.random() * forms.length)];
          const mult = 0.7 + Math.random() * 0.8;
          const dmg = Math.max(3, Math.round(f.stats.attackDamage * mult));
          if (form === "beam") spawnBeams(f, o, { count: 1, aim: "current", damage: dmg, range: 600 });
          else spawnShots(f, o, { count: 1, aim: "current", damage: dmg, speed: 300, shape: form, range: 600 });
        }
        f.atkCd = 1.15;
        return true;
      }
      if (id === "ruka-3-2") {
        const status = [{ burn: 3 }, { burn: 5 }, { freeze: 1.4 }, { paralyze: 1.4 }];
        const baseA = Math.atan2(o.y - f.y, o.x - f.x);
        for (const st of status) {
          const a = baseA + (Math.random() - 0.5) * 0.22;
          const sp = 250 + Math.random() * 50;
          state.projectiles.push({
            x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 240,
            r: 8, shape: "bottle", life: 1.35, traveled: 0, range: 620, gravity: 560,
            owner: f.slot, target: o.slot, damage: Math.max(2, Math.round(f.stats.attackDamage * 0.55)),
            special: "none", status: st, bounces: 0, color: "#b8ffd9", arm: 0.05, age: 0, src: f
          });
        }
        f.atkCd = 2.1;
        return true;
      }
      if (id === "chaos-6-1") {
        spawnShots(f, o, { count: 1, damage: Math.max(4, Math.round(f.stats.attackDamage * 1.5)), speed: 230, shape: "chaosOrb", r: 18, range: 620, aim: "current" });
        f.atkCd = 1.7;
        return true;
      }
      return false;
    }

    function castAttack(f, o) {
      if (f.noDamageDealt > 0) return;
      if (castChessAttack(f, o)) return;
      const cfg = f.stats;
      let dmg = Math.max(2, Math.round(cfg.attackDamage || cfg.damage * 0.72) + rukaAttackBonus(f));
      dmg = Math.max(1, Math.round(dmg * (f.atkBuff || 1) * (f.atkNerf || 1)));
      if (cfg.attack === "projectile") {
        const count = attackCount(cfg);
        const speed = Math.max(80, cfg.attackSpeed || 320);
        const range = Math.max(80, cfg.range || 600);
        for (let i = 0; i < count; i++) {
          const angle = aimAngle(f, o, cfg, i, count);
          state.projectiles.push({
            x: f.x, y: f.y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            r: cfg.shape === "needle" ? 5 : 9,
            shape: cfg.shape || "circle",
            life: range / speed, traveled: 0, range,
            owner: f.slot, target: o.slot, damage: dmg,
            special: cfg.special || "none", bounces: 0, src: f,
            color: sideColor(f.side)
          });
        }
        if (cfg.special === "clone" && state.clones.length < 2) state.clones.push(cloneFor(f));
        f.atkCd = COOLDOWN.projectile / (f.p.id === "red-6-1" ? 2 : 1);
      } else if (cfg.attack === "laser") {
        const count = attackCount(cfg);
        const range = Math.max(80, cfg.range || 700);
        for (let i = 0; i < count; i++) {
          const angle = aimAngle(f, o, cfg, i, count);
          state.lasers.push({
            x1: f.x, y1: f.y,
            x2: f.x + Math.cos(angle) * range,
            y2: f.y + Math.sin(angle) * range,
            t: 0.55, active: 0, fired: false,
            owner: f.slot, target: o.slot, damage: dmg,
            shape: "beam", special: cfg.special || "none", src: f,
            color: sideColor(f.side)
          });
        }
        if (cfg.special === "clone" && state.clones.length < 2) state.clones.push(cloneFor(f));
        f.atkCd = COOLDOWN.laser;
      } else if (cfg.attack === "trap") {
        const count = attackCount(cfg);
        for (let i = 0; i < count; i++) {
          let x, y;
          if (cfg.aim === "current" || cfg.aim === "front") {
            const px = cfg.aim === "front" ? o.x + o.vx * 0.45 : o.x;
            const py = cfg.aim === "front" ? o.y + o.vy * 0.45 : o.y;
            const a = Math.random() * Math.PI * 2, r = Math.random() * 70;
            x = px + Math.cos(a) * r; y = py + Math.sin(a) * r;
          } else {
            const a = Math.random() * Math.PI * 2, r = Math.random() * ARENA_R * 0.78;
            x = CX + Math.cos(a) * r; y = CY + Math.sin(a) * r;
          }
          const dx = x - CX, dy = y - CY, dd = Math.hypot(dx, dy);
          if (dd > ARENA_R - 30) { x = CX + dx / dd * (ARENA_R - 30); y = CY + dy / dd * (ARENA_R - 30); }
          state.traps.push({
            x, y, t: 0.78, active: 0, fired: false, radius: 48,
            owner: f.slot, target: o.slot, damage: dmg,
            shape: cfg.shape || "circle", special: cfg.special || "none", src: f,
            color: sideColor(f.side)
          });
        }
        if (cfg.special === "clone" && state.clones.length < 2) state.clones.push(cloneFor(f));
        f.atkCd = COOLDOWN.trap;
      } else {
        f.atkCd = COOLDOWN.none;
      }
    }

    function spawnShots(f, o, opt) {
      const cfg = Object.assign({ aim: "current", count: 1, speed: 300, damage: 6, shape: "circle", range: 600, special: "none", status: null }, opt || {});
      const count = cfg.aim === "four" ? 4 : cfg.aim === "eight" ? 8 : Math.max(1, Math.min(8, cfg.count || 1));
      const speed = Math.max(80, cfg.speed);
      const range = Math.max(60, cfg.range);
      const shotR = cfg.r || (cfg.shape === "needle" ? 5 : cfg.shape === "planet" ? 32 : 9);
      for (let i = 0; i < count; i++) {
        let a = aimAngle(f, o, cfg, i, count);
        if (cfg.shape !== "planet" && !cfg.noSpread) {
          const chance = cfg.spreadChance == null ? 0.32 : cfg.spreadChance;
          if (Math.random() < chance) {
            const amount = cfg.spread == null ? 0.13 : cfg.spread;
            a += (Math.random() < 0.5 ? -1 : 1) * (0.04 + Math.random() * amount);
          }
        }
        const back = cfg.startBack || 0;
        const start = clampToArena(f.x - Math.cos(a) * back, f.y - Math.sin(a) * back, shotR + 2);
        state.projectiles.push({
          x: start.x, y: start.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          r: shotR, shape: cfg.shape,
          life: range / speed, traveled: 0, range,
          owner: f.slot, target: o.slot, damage: cfg.damage,
          special: cfg.special || "none", status: cfg.status || null, src: f, rabbit: !!cfg.rabbit,
          bounces: 0, color: sideColor(f.side), img: cfg.img || null,
          drawR: cfg.drawR || shotR, arm: cfg.arm == null ? 0.1 : cfg.arm, age: 0
        });
      }
    }

    function spawnBeams(f, o, opt) {
      const cfg = Object.assign({ aim: "current", count: 1, range: 700, damage: 8, special: "none", status: null }, opt || {});
      const count = cfg.aim === "four" ? 4 : cfg.aim === "eight" ? 8 : Math.max(1, Math.min(8, cfg.count || 1));
      const range = Math.max(80, cfg.range);
      for (let i = 0; i < count; i++) {
        let a = aimAngle(f, o, cfg, i, count);
        state.lasers.push({
          x1: f.x, y1: f.y, x2: f.x + Math.cos(a) * range, y2: f.y + Math.sin(a) * range,
          t: 0.32, active: 0, fired: false, owner: f.slot, target: o.slot,
          damage: cfg.damage, shape: "beam", special: cfg.special || "none", status: cfg.status || null,
          range, src: f, color: sideColor(f.side), style: cfg.style || ""
        });
      }
    }

    function spawnTrapAt(f, o, x, y, opt) {
      const cfg = Object.assign({ radius: 46, damage: 7, status: null, delay: 0.55 }, opt || {});
      const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
      if (d > ARENA_R - 24) { x = CX + dx / d * (ARENA_R - 24); y = CY + dy / d * (ARENA_R - 24); }
      state.traps.push({
        x, y, t: cfg.delay, active: 0, fired: false, radius: cfg.radius,
        owner: f.slot, target: o.slot, damage: cfg.damage,
        shape: "circle", special: "none", status: cfg.status || null,
        src: f, color: sideColor(f.side)
      });
    }

    function skillAttackDamage(f, scale) {
      return Math.max(2, Math.round(((f.stats.attackDamage || 10) * (scale || 1) * (f.dmgBoost || 1) + rukaAttackBonus(f)) * (f.atkBuff || 1) * (f.atkNerf || 1)));
    }

    function chessArenaType(id) {
      return /^(ruka|chaos)-([1-6])-/.test(id) ? Number(id.split("-")[1]) : 0;
    }

    function rukaAttackBonus(f) {
      if (!f || f.p.id !== "ruka-6-1") return 0;
      const missing = Math.max(0, 1 - f.hp / f.maxHp);
      return Math.floor(missing / 0.1 + 1e-7) * 5;
    }

    function updateChessGimmick(f, o, dt) {
      const id = f.p.id;
      if (!id || (!id.startsWith("ruka-") && !id.startsWith("chaos-") && id !== "black-6-2" && id !== "red-5-1" && id !== "red-1-1" && id !== "red-2-2" && id !== "black-2-1" && id !== "black-4-1" && id !== "ruka-5-1")) return;
      if (id === "black-2-1") {
        if (f.snakeShield) {
          f.snakeShieldTimer -= dt * (f.atkRate || 1);
          f.vx = 0; f.vy = 0;
          if (f.snakeShieldTimer <= 0) {
            f.snakeShield = false;
            if (f.p.id !== "red-6-1") f.immobile = false;
          }
        } else {
          f.snakeCd -= dt * (f.atkRate || 1);
          if (f.snakeCd <= 0) {
            const target = nearestEnemyBody(f.slot, f.x, f.y);
            if (target) {
              if (f.snakeMode % 2 === 0) {
                spawnShots(f, target, { count: 1, aim: "current", damage: 18, speed: 280, shape: "dragon", r: 16, range: 680, status: { burn: 5 } });
                state.effects.push({ x: f.x, y: f.y - 30, text: "俱利伽罗的黑龙", life: 0.9, color: "#ffb36a" });
                f.snakeCd = 3.2;
              } else {
                f.immobile = true; f.homeX = f.x; f.homeY = f.y;
                f.snakeAngle = Math.atan2(target.y - f.y, target.x - f.x);
                f.snakeShield = true; f.snakeShieldTimer = 4;
                state.effects.push({ x: f.x, y: f.y - 30, text: "阿基里斯之盾", life: 0.9, color: "#ffd76a" });
                f.snakeCd = 4.5;
              }
              f.snakeMode++;
            }
          }
        }
      }
      if (id === "black-4-1") {
        const target = nearestEnemyBody(f.slot, f.x, f.y);
        if (f.fistDash) {
          if (f.dash <= 0) f.fistDash = false;
        } else {
          f.vx = 0; f.vy = 0;
          f.fistTimer += dt;
          while (f.fistTimer >= 1) {
            f.fistTimer -= 1;
            f.fistStacks = Math.min(10, f.fistStacks + 1);
          }
          if (target && f.fistStacks > 0 && dist(f.x, f.y, target.x, target.y) <= 110) {
            f.fistDamage = 10 + 2 * f.fistStacks;
            f.fistStacks = 0; f.fistTimer = 0;
            const a = Math.atan2(target.y - f.y, target.x - f.x);
            f.vx = Math.cos(a) * 800; f.vy = Math.sin(a) * 800;
            f.dash = 0.32; f.dashHit = false; f.fistDash = true; f.collCd = 0;
            state.effects.push({ x: f.x, y: f.y - f.radius - 20, text: "魅拳 · 蓄势", life: 0.8, color: "#fff0cf" });
          }
        }
      }
      const attackRate = f.atkRate || 1;
      if (id === "red-6-2") {
        if (f.atomCd > 0) f.atomCd = Math.max(0, f.atomCd - dt);
        if (f.atomMerge > 0) f.atomMerge = Math.max(0, f.atomMerge - dt);
      }
      if (id === "red-1-1") {
        f.crossAngle = (f.crossAngle || 0) + dt * 0.72;
        f.crossSize = 88 + Math.sin((state.roundTime + 0.8) * 1.15) * 34;
        f.crossCd = Math.max(0, (f.crossCd || 0) - dt);
        if (f.crossCd <= 0) {
          f.crossCd = 0.42;
          const targets = allBodies().filter(b => b.slot !== f.slot && b.hp > 0);
          for (const b of targets) {
            const dx = b.x - f.x, dy = b.y - f.y;
            let hit = false;
            for (const ang of [f.crossAngle, f.crossAngle + Math.PI / 4]) {
              const ca = Math.cos(ang), sa = Math.sin(ang);
              const rx = dx * ca + dy * sa;
              const ry = -dx * sa + dy * ca;
              const arm = Math.min(f.crossSize, 160);
              if ((Math.abs(rx) < 14 && Math.abs(ry) < arm) || (Math.abs(ry) < 14 && Math.abs(rx) < arm)) hit = true;
            }
            if (hit) damage(b, 8, "#fff2b0", f);
          }
        }
      }
      if (id === "ruka-5-1") {
        f.gimmickAtk -= dt * (f.atkRate || 1);
        if (f.gimmickAtk <= 0) {
          const target = nearestEnemyBody(f.slot, f.x, f.y);
          if (target) castChessAttack(f, target);
          f.gimmickAtk = 1.15;
        }
      }
      if (id === "red-2-2") {
        f.smallBolt -= dt * (f.atkRate || 1);
        f.smallGift -= dt * (f.atkRate || 1);
        if (f.smallBolt <= 0) {
          const target = nearestEnemyBody(f.slot, f.x, f.y);
          if (target) spawnBeams(f, target, { count: 1, aim: "current", damage: 10, range: 700, style: "lightning", status: { paralyze: 1.4 } });
          f.smallBolt = 2;
        }
        if (f.smallGift <= 0) {
          f.smallGift = 10;
          const roll = Math.random();
          if (roll < 0.1) {
            const a = spawnAlly(f, "mikaClone", 1, f.x - 28, f.y + 24, { radius: 10, speed: 150, damage: 3, head: "img/arena/wp.png" });
            if (a) a.p = Object.assign({}, a.p, { name: "米卡艾拉酱", displayName: "米卡艾拉酱" });
            state.effects.push({ x: f.x, y: f.y - 30, text: "召唤米卡艾拉酱", life: 1, color: "#ffe6a0" });
          } else if (roll < 0.6) {
            const a = spawnAlly(f, "luciClone", 1, f.x + 28, f.y + 24, { radius: 10, speed: 150, damage: 3, head: "img/arena/wh2.png" });
            if (a) a.p = Object.assign({}, a.p, { name: "露西菲娜酱", displayName: "露西菲娜酱" });
            state.effects.push({ x: f.x, y: f.y - 30, text: "召唤露西菲娜酱", life: 1, color: "#d8ecff" });
          } else {
            f.holyShield = true;
            state.effects.push({ x: f.x, y: f.y - 30, text: "圣光庇护", life: 1, color: "#fff8c8" });
          }
        }
      }
      if (id === "red-5-1") {
        f.urielBurst -= dt * attackRate;
        f.urielLaser -= dt * attackRate;
        if (f.urielBurst <= 0) {
          const target = nearestEnemyBody(f.slot, f.x, f.y);
          if (target) spawnShots(f, target, { count: 8, aim: "eight", damage: 10, speed: 300, shape: "circle", range: 620, noSpread: true });
          f.urielBurst = 2.5;
        }
        if (f.urielLaser <= 0) {
          const target = nearestEnemyBody(f.slot, f.x, f.y);
          if (target) spawnBeams(f, target, { count: 1, aim: "current", damage: 10, range: 700 });
          f.urielLaser = 2;
        }
      }
      if (id === "ruka-3-2" || id === "chaos-6-1") {
        f.gimmickAtk -= dt;
        if (f.gimmickAtk <= 0) {
          const target = nearestEnemyBody(f.slot, f.x, f.y);
          if (target) castChessAttack(f, target);
          f.gimmickAtk = id === "chaos-6-1" ? 1.7 : 2.1;
        }
      }
      if (id === "ruka-1-1") {
        f.clubAngle = (f.clubAngle || 0) + dt * 4.4;
        const a = f.clubAngle;
        const bx = f.x + Math.cos(a) * (f.radius + 6), by = f.y + Math.sin(a) * (f.radius + 6);
        const ex = f.x + Math.cos(a) * (f.radius + 54), ey = f.y + Math.sin(a) * (f.radius + 54);
        for (const body of allBodies()) {
          if (body.slot === f.slot || body.hp <= 0 || body.collCd > 0) continue;
          const d = distToSegment(body.x, body.y, bx, by, ex, ey);
          if (d < body.radius + 10) {
            const nx = (body.x - f.x) / (Math.hypot(body.x - f.x, body.y - f.y) || 1);
            const ny = (body.y - f.y) / (Math.hypot(body.x - f.x, body.y - f.y) || 1);
            body.x += nx * 8; body.y += ny * 8;
            body.collCd = 0.45;
            damage(body, 10, "#ffd86e", f);
          }
        }
      }
      if (id === "chaos-2-2") {
        if (f.idiaPhase === 0) {
          f.gimmickAtk -= dt;
          if (f.gimmickAtk <= 0) {
            const target = nearestEnemyBody(f.slot, f.x, f.y);
            if (target) {
              f.idiaPhase = 1; f.idiaTimer = 0.5;
              f.idiaAngle = Math.atan2(target.y - f.y, target.x - f.x);
              f.hold = 0.5; f.chargeTotal = 0.5; f.chargeLeft = 0.5;
              f.vx = f.vy = 0;
            }
          }
        } else if (f.idiaPhase === 1) {
          f.idiaTimer -= dt;
          if (f.idiaTimer <= 0) {
            const a = f.idiaAngle;
            state.projectiles.push({
              x: f.x, y: f.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420,
              r: 11, shape: "sword", life: 1.1, traveled: 0, range: 380,
              owner: f.slot, target: "", damage: Math.max(4, Math.round(f.stats.attackDamage * 0.8)),
              special: "none", status: null, bounces: 0, color: "#9fe0ff", arm: 0.05, age: 0, src: f
            });
            f.idiaPhase = 2; f.idiaTimer = 0.45; f.hold = 0;
          }
        } else if (f.idiaPhase === 2) {
          f.idiaTimer -= dt;
          if (f.idiaTimer <= 0) {
            f.idiaPhase = 0; f.gimmickAtk = 2.5;
            const a = f.idiaAngle;
            f.dash = 0.35; f.dashHit = false; f.invincible = Math.max(f.invincible, 0.5);
            f.vx = Math.cos(a) * 780; f.vy = Math.sin(a) * 780; f.collCd = 0;
          }
        }
      }
      if (f.bladeAura > 0) f.bladeAura = Math.max(0, f.bladeAura - dt);
      if (f.spinUntil && performance.now() / 1000 < f.spinUntil) {
        f.spinAngle = (performance.now() / 1000 - f.spinStart) * 9;
        f.spinTimer = Math.max(0, f.spinUntil - performance.now() / 1000);
      } else if (f.spinUntil) {
        f.spinUntil = 0; f.spinAngle = 0; f.spinTimer = 0;
      }
      if (f.drones) {
        for (const d of f.drones) {
          d.angle += dt * 1.6;
          d.cd -= dt;
          if (d.cd <= 0) {
            const target = nearestEnemyBody(f.slot, f.x, f.y);
            if (target) {
              const proxy = { x: f.x + Math.cos(d.angle) * d.dist, y: f.y + Math.sin(d.angle) * d.dist, slot: f.slot, side: f.side, vx: 0, vy: 0 };
              spawnShots(proxy, target, { count: 1, aim: "current", damage: 7, speed: 520, shape: "beam", range: 380, noSpread: true });
            }
            d.cd = 2;
          }
        }
      }
      if (f.eyes) for (const e of f.eyes) e.angle += dt * 0.9;
      if (id === "chaos-5-1") {
        f.phaseTimer -= dt;
        if (f.phaseTimer <= 0) {
          f.phaseTimer = 9;
          f.invincible = Math.max(f.invincible, 4);
          f.noDamageDealt = Math.max(f.noDamageDealt, 4);
          f.phaseActive = true;
          state.effects.push({ x: f.x, y: f.y - f.radius - 20, text: "虚化", life: 1, color: "#cfe6ff" });
        }
        if (f.noDamageDealt > 0) {
          f.noDamageDealt = Math.max(0, f.noDamageDealt - dt);
          if (f.noDamageDealt <= 0) f.phaseActive = false;
        }
      } else if (id === "ruka-4-1") {
        f.phaseTimer -= dt;
        if (f.phaseTimer <= 0) {
          f.phaseTimer = 8;
          state.timeStop = 1.6; state.timeStopOwner = f.slot;
          const target = nearestEnemyBody(f.slot, f.x, f.y);
          if (target) {
            const a = Math.atan2(target.y - f.y, target.x - f.x);
            const sp = Math.max(1, f.stats.speed * (f.speedBoost || 1));
            f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp;
          }
          state.effects.push({ x: f.x, y: f.y - f.radius - 20, text: "时停", life: 1.1, color: "#ffe6a0" });
        }
      } else if (id === "ruka-2-2") {
        if (f.marchTimer > 0) {
          f.marchTimer -= dt;
          if (f.marchTimer <= 0) {
            const a = f.marchAngle;
            f.vx = Math.cos(a) * 900; f.vy = Math.sin(a) * 900;
            f.dash = 0.3; f.dashHit = false; f.collCd = 0;
            f.phaseTimer = 2;
          }
        } else {
          f.phaseTimer -= dt;
          if (f.phaseTimer <= 0) {
            f.phaseTimer = 6;
            const target = nearestEnemyBody(f.slot, f.x, f.y);
            if (target) {
              const past = clampToArena(target.x - target.vx * 0.5, target.y - target.vy * 0.5, f.radius);
              f.x = past.x; f.y = past.y;
              f.marchAngle = Math.atan2(target.y - f.y, target.x - f.x);
              f.marchTimer = 0.25; f.chargeTotal = 0.25; f.chargeLeft = 0.25;
              f.vx = f.vy = 0;
              state.effects.push({ x: f.x, y: f.y - f.radius - 16, text: "蓄力", life: 0.25, color: "#fff0a0" });
            }
          }
        }
      }
    }

    function chessArenaSkill(f, o, id, dmg) {
      if (id === "ruka-4-2") {
        f.bladeAura = 1.2;
        for (const body of allBodies()) {
          if (body.slot !== f.slot && body.hp > 0 && dist(f.x, f.y, body.x, body.y) < f.radius + 58) {
            damage(body, Math.max(3, Math.round(dmg * 0.7)), "#e8d8ff", f);
          }
        }
        f.skillCd = 3.5;
      } else if (id === "chaos-3-1") {
        for (let i = 0; i < 6; i++) {
          const a = Math.PI * 2 * i / 6 + performance.now() / 1000;
          state.projectiles.push({
            x: f.x, y: f.y, vx: Math.cos(a) * 310, vy: Math.sin(a) * 310,
            r: 9, shape: "scythe", life: 0.9, traveled: 0, range: 300,
            owner: f.slot, target: o.slot, damage: Math.max(1, Math.round(dmg * 0.3)),
            special: "none", status: null, bounces: 0, color: "#c6a0ff", arm: 0.05, age: 0, src: f
          });
        }
        f.skillCd = 2.2;
      } else if (id === "chaos-3-2") {
        spawnShots(f, o, { count: 1, aim: "current", damage: Math.max(2, Math.round(dmg * 0.55)), speed: 260, shape: "rabbit", r: 13, range: 620, rabbit: true });
        f.skillCd = 5;
      } else if (id === "chaos-2-1") {
        spawnShots(f, o, { count: 3, aim: "current", damage: Math.max(2, Math.round(dmg * 0.275)), speed: 320, shape: "scythe", range: 280 });
        f.vx = -f.vx; f.vy = -f.vy;
        f.skillCd = 3.2;
      } else if (id === "chaos-2-2") {
        f.skillCd = 999;
      } else if (id === "chaos-4-2") {
        const a = Math.atan2(o.y - f.y, o.x - f.x);
        f.dash = 0.35; f.dashHit = false; f.invincible = Math.max(f.invincible, 0.45);
        f.vx = Math.cos(a) * 780; f.vy = Math.sin(a) * 780; f.collCd = 0;
        f.skillCd = 6;
      } else if (id === "ruka-6-1") {
        f.skillCd = 999;
      } else {
        f.skillCd = 999;
      }
    }

    function updateSkills(f, o, dt) {
      if (f.noDamageDealt > 0) { f.skillCd = Math.max(f.skillCd, 0.2); return; }
      f.skillCd -= dt * (f.atkRate || 1);
      if (f.skillCd > 0) return;
      const id = f.p.id;
      const dmg = skillAttackDamage(f, 1);
      const chessType = chessArenaType(id);
      if (chessType) { chessArenaSkill(f, o, id, dmg); return; }
      if (!f.isAlly && id === "black-5-1" && !f.splitDone) {
        splitHuayin(f); f.skillCd = 2.2; return;
      }
      if (!f.isAlly && id === "red-6-2" && !f.splitDone) {
        splitMetatron(f); f.skillCd = 2.2; return;
      }
      if (id === "red-1-1") {
        f.skillCd = 999;
      } else if (id === "red-2-1") {
        const a = Math.atan2(o.y - f.y, o.x - f.x);
        f.dash = 0.36; f.dashHit = false; f.vx = Math.cos(a) * 850; f.vy = Math.sin(a) * 850; f.collCd = 0;
        f.skillCd = 3.8;
      } else if (id === "red-2-2") {
        f.skillCd = 999;
      } else if (id === "red-3-1") {
        spawnShots(f, o, { count: 1, aim: "current", damage: Math.max(2, Math.round(dmg * 0.55)), speed: 380, shape: "needle", range: 620, status: { burn: 5 } });
        f.skillCd = 1.55;
      } else if (id === "red-3-2") {
        f.skillCd = 999;
      } else if (id === "red-4-1") {
        const a = Math.atan2(o.y - f.y, o.x - f.x);
        f.dash = 0.32; f.dashHit = false; f.vx = Math.cos(a) * 760; f.vy = Math.sin(a) * 760; f.collCd = 0;
        f.skillCd = 2.9;
      } else if (id === "red-4-2") {
        f.star = 3.5; f.invincible = 3.5; f.dmgBoost = 1;
        f.skillCd = 10.5;
      } else if (id === "red-5-1") {
        f.skillCd = 999;
      } else if (id === "red-5-2") {
        const target = nearestEnemyBody(f.slot, f.x, f.y);
        if (target) {
          const a = Math.atan2(target.y - f.y, target.x - f.x);
          state.projectiles.push({
            x: f.x, y: f.y, vx: 0, vy: 0, r: 34, drawR: 68, shape: "planet",
            life: 6.5, traveled: 0, range: 900, planetHold: 1, planetOwner: f.slot, planetAngle: a,
            owner: f.slot, target: target.slot, damage: Math.max(8, Math.round(target.maxHp * 0.42)),
            special: "none", status: null, bounces: 0, color: "#f0a6ff", arm: 0, age: 0,
            src: f, img: imgFor("img/arena/planet.png")
          });
        }
        f.hold = 1; f.planetTimer = 0; f.chargeTotal = 1; f.chargeLeft = 1;
        f.skillCd = 10;
      } else if (id === "red-6-1") {
        spawnShots(f, o, { count: 2, aim: "current", damage: Math.max(1, Math.round(dmg * 0.125)), speed: 330, shape: "needle", range: 480 });
        f.skillCd = 0.5;
      } else if (id === "red-6-2") {
        if (f.hp / f.maxHp <= 0.5 && !f.merged) {
          f.merged = true; f.dmgBoost = 1.25; f.invincible = Math.max(f.invincible, 1);
          spawnBeams(f, o, { count: 1, aim: "current", damage: Math.max(5, dmg), range: 760 });
        } else {
          spawnShots(f, o, { count: 2, aim: "current", damage: Math.max(2, Math.round(dmg * 0.45)), speed: 330, shape: "arrow", range: 560 });
        }
        f.skillCd = 2.6;
      } else if (id === "red-7-3") {
        if (f.spearTimer <= 0) {
          f.hold = 5; f.spearTimer = 5; f.chargeTotal = 5; f.chargeLeft = 5;
          f.skillCd = 21;
        }
      } else if (id === "black-1-1") {
        spawnShots(f, o, { count: 1, aim: "current", damage: Math.max(4, Math.round(dmg * 1.1)), speed: 150, shape: "circle", range: 620 });
        f.skillCd = 4.5;
      } else if (id === "black-2-1") {
        f.skillCd = 999;
      } else if (id === "black-2-2") {
        spawnShots(f, o, { count: 8, aim: "eight", damage: Math.max(2, Math.round(dmg * 0.35)), speed: 300, shape: "needle", range: 600, special: "reflect" });
        f.skillCd = 4;
      } else if (id === "black-3-1") {
        f.skillCd = 999;
      } else if (id === "black-4-1") {
        f.skillCd = 999;
      } else if (id === "black-5-1") {
        spawnTrapAt(f, o, f.x, f.y, { damage: 4, radius: 38, delay: 0.2, status: { burn: 3 } });
        f.skillCd = 3;
      } else if (id === "black-6-1") {
        const el = ["wind", "earth", "water", "fire", "ice", "thunder"][Math.floor(Math.random() * 6)];
        if (el === "earth") {
          spawnTrapAt(f, o, o.x, o.y, { damage: Math.max(3, dmg), radius: 48, delay: 0.4 });
        } else {
          const status = el === "wind" ? { reverse: true, slow: 3 } : el === "water" ? { water: 5 } : el === "fire" ? { burn: 5 } : el === "ice" ? { freeze: 1.4 } : { paralyze: 1.4 };
          spawnShots(f, o, { count: 1, aim: "current", damage: Math.max(2, Math.round(dmg * 0.55)), speed: 360, shape: "yinYang", r: 12, range: 650, status });
        }
        spawnBeams(f, o, { count: 1, aim: "current", damage: Math.max(2, Math.round(dmg * 0.35)), range: 620 });
        f.skillCd = 2.8;
      } else if (id === "black-6-2") {
        f.speedBoost = 3; f.invincible = 3; f.dmgBoost = 1.5;
        f.spinTimer = 3; f.buffTimer = 3;
        f.spinStart = performance.now() / 1000;
        f.spinUntil = f.spinStart + 3;
        f.skillCd = 9.5;
        state.effects.push({ x: f.x, y: f.y - f.radius - 22, text: "玉藻球形态~", life: 1.4, color: "#ffe08a" });
      } else if (id === "black-7-3") {
        f.skillCd = 999;
      } else {
        f.skillCd = 999;
      }
    }

    function updateFighter(f, o, dt) {
      if (!f || !o || f.hp <= 0) return;
      if (state.phase !== "fight") return;
      if (state.timeStop > 0 && f.p.id !== "ruka-4-1") return;
      tickStatuses(f, dt);
      if (state.phase !== "fight") return;
      f.flash = Math.max(0, f.flash - dt);
      f.collCd = Math.max(0, f.collCd - dt);
      f.collisionLock = Math.max(0, f.collisionLock - dt);
      if (f.immobile) { f.x = f.homeX; f.y = f.homeY; f.vx = 0; f.vy = 0; }

      if (f.planetTimer > 0) {
        f.planetTimer -= dt;
        if (f.planetTimer <= 0 && state.phase === "fight") {
          f.planetTimer = 0;
          const target = nearestEnemyBody(f.slot, f.x, f.y);
          if (target) spawnShots(f, target, { count: 1, aim: "current", damage: Math.max(8, Math.round(target.maxHp * 0.42)), speed: 145, shape: "planet", r: 34, drawR: 68, range: 900, startBack: 70, arm: 0.4, img: imgFor("img/arena/planet.png") });
        }
      }
      if (f.spearTimer > 0) {
        f.spearTimer -= dt;
        if (f.spearTimer <= 0 && state.phase === "fight") {
          f.spearTimer = 0;
          const target = nearestEnemyBody(f.slot, f.x, f.y);
          if (target) {
            const a = Math.atan2(target.y - f.y, target.x - f.x);
            const spearStart = clampToArena(target.x + Math.cos(a + Math.PI) * 92, target.y + Math.sin(a + Math.PI) * 92, 9);
            state.projectiles.push({
              x: spearStart.x, y: spearStart.y,
              vx: Math.cos(a) * 900, vy: Math.sin(a) * 900,
              r: 11, shape: "spear", life: 2.4, traveled: 0, range: 1000,
              owner: f.slot, target: target.slot, damage: Math.max(18, Math.round(target.maxHp * 0.65)),
              special: "none", status: null, bounces: 0, color: "#ffe6a0", arm: 0.02, age: 0
            });
          }
        }
      }

      const stopped = f.paralyze > 0 || f.freeze > 0 || f.hold > 0;
      let speed = f.immobile ? 0 : Math.max(0, f.stats.speed) * (state.overtime ? 2 : 1) * (f.speedBoost || 1);
      if (f.slow > 0) speed *= 0.55;
      if (f.dash > 0) {
        // 冲锋期间保持冲刺速度
        const cur = Math.hypot(f.vx, f.vy) || 1;
        speed = Math.max(speed, cur);
      }
      if (stopped) speed = 0;
      if (f.marchTimer > 0) speed = 0;
      if (f.p.id === "ruka-2-2" && f.dash <= 0) speed = 0;
      if (f.p.id === "chaos-2-2" && f.dash <= 0) speed = 0;
      if (speed > 0) {
        const current = Math.hypot(f.vx, f.vy) || 1;
        f.vx = f.vx / current * speed;
        f.vy = f.vy / current * speed;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
      }

      const wd = Math.hypot(f.x - CX, f.y - CY);
      const maxD = ARENA_R - f.radius;
      if (wd > maxD) {
        const ux = (f.x - CX) / wd, uy = (f.y - CY) / wd;
        f.x = CX + ux * maxD;
        f.y = CY + uy * maxD;
        const dot = f.vx * ux + f.vy * uy;
        if (dot > 0) { f.vx -= 2 * dot * ux; f.vy -= 2 * dot * uy; }
        // 反弹后加随机偏角，打断完美周期轨道
        const baseAngle = Math.atan2(f.vy, f.vx);
        const jitter = (Math.random() < 0.5 ? -1 : 1) * (0.16 + Math.random() * 0.24);
        const nx2 = Math.cos(baseAngle + jitter), ny2 = Math.sin(baseAngle + jitter);
        if (nx2 * ux + ny2 * uy < 0) { f.vx = nx2 * speed; f.vy = ny2 * speed; }
        else { f.vx = Math.cos(baseAngle - jitter) * speed; f.vy = Math.sin(baseAngle - jitter) * speed; }
      }

      if (f.control <= 0 && f.paralyze <= 0 && f.freeze <= 0) updateSkills(f, o, dt);
      updateChessGimmick(f, o, dt);
    }

    function updateHeals(dt) {
      for (let i = state.heals.length - 1; i >= 0; i--) {
        const h = state.heals[i];
        h.life -= dt;
        for (const body of allBodies()) {
          if (body.slot !== h.slot || body.hp <= 0) continue;
          if (Math.hypot(body.x - h.x, body.y - h.y) > h.r) continue;
          body.hp = Math.min(body.maxHp, body.hp + (h.rate || 2) * dt);
        }
        if (h.life <= 0) state.heals.splice(i, 1);
      }
    }

    function updateProjectiles(dt) {
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const bulletBoost = state.overtime ? 2 : 1;
        const holding = p.planetHold > 0;
        if (holding) {
          p.planetHold -= dt;
          const owner = fighter(p.planetOwner);
          if (owner) { p.x = owner.x; p.y = owner.y; }
          p.age = (p.age || 0) + dt;
          if (p.planetHold <= 0) {
            const target = fighter(p.target) || nearestEnemyBody(p.owner, p.x, p.y);
            if (target) p.planetAngle = Math.atan2(target.y - p.y, target.x - p.x);
            p.vx = Math.cos(p.planetAngle) * 145; p.vy = Math.sin(p.planetAngle) * 145;
            p.traveled = 0; p.life = 6.5; p.arm = 0;
            p.planetHold = 0;
          }
        } else {
          if (p.gravity) p.vy += p.gravity * dt;
          p.x += p.vx * dt * bulletBoost; p.y += p.vy * dt * bulletBoost;
          p.traveled += speed * dt * bulletBoost; p.life -= dt;
          p.age = (p.age || 0) + dt;
        }
        const armed = !p.arm || p.age >= p.arm;
        let gone = p.life <= 0 || p.traveled > p.range;
        const outside = Math.hypot(p.x - CX, p.y - CY) > ARENA_R - p.r;
        if (outside && !gone) {
          if (p.special === "reflect" && p.bounces < 2) {
            const nx = (p.x - CX) / (Math.hypot(p.x - CX, p.y - CY) || 1);
            const ny = (p.y - CY) / (Math.hypot(p.x - CX, p.y - CY) || 1);
            const dot = p.vx * nx + p.vy * ny;
            p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny;
            const pa = Math.atan2(p.vy, p.vx) + (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.16);
            p.vx = Math.cos(pa) * speed; p.vy = Math.sin(pa) * speed;
            p.x = CX + nx * (ARENA_R - p.r - 2);
            p.y = CY + ny * (ARENA_R - p.r - 2);
            p.bounces++;
          } else gone = true;
        }
        const target = nearestEnemyBody(p.owner, p.x, p.y);
        if (!gone && armed && target && target.slot !== p.owner && dist(p.x, p.y, target.x, target.y) < target.radius + p.r) {
          if (p.shape === "planet") {
            state.effects.push({ x: p.x, y: p.y, text: "行星撞击", life: 1.1, color: "#f0c6ff" });
          }
          p.hit = true;
          damage(target, p.damage, p.color, p.src);
          if (p.status) applyStatus(target, p.status);
          if (p.special === "lifesteal") {
            const owner = fighter(p.owner);
            if (owner) owner.hp = Math.min(owner.maxHp, owner.hp + p.damage * 0.4);
          }
          if (p.special === "split") {
            for (let k = 0; k < 2; k++) {
              const a = Math.random() * Math.PI * 2;
              state.projectiles.push({
                x: p.x, y: p.y,
                vx: Math.cos(a) * speed * 0.8, vy: Math.sin(a) * speed * 0.8,
                r: 5, shape: "circle", life: 0.8, traveled: 0, range: p.range,
                owner: p.owner, target: p.target, damage: Math.max(2, Math.round(p.damage * 0.5)),
                special: "none", bounces: 0, color: p.color, arm: 0.08, age: 0
              });
            }
          }
          gone = true;
        }
        if (gone) {
          if (p.rabbit && !p.hit && p.src) {
            const owner = p.src;
            spawnAlly(owner, "rabbitClone", 10, p.x, p.y, { radius: 10, speed: 170, head: owner.head, img: owner.img, damage: 5 });
          }
          state.projectiles.splice(i, 1);
        }
      }
    }

    function updateLasers(dt) {
      for (let i = state.lasers.length - 1; i >= 0; i--) {
        const l = state.lasers[i];
        if (!l.fired) {
          l.t -= dt;
          if (l.t <= 0) {
            l.fired = true; l.active = 0.22;
            const target = nearestEnemyBody(l.owner, l.x1, l.y1);
            if (target && target.slot !== l.owner && distToSegment(target.x, target.y, l.x1, l.y1, l.x2, l.y2) < target.radius + 14) {
              damage(target, l.damage, l.color, l.src);
              if (l.status) applyStatus(target, l.status);
              if (l.special === "lifesteal") {
                const owner = fighter(l.owner);
                if (owner) owner.hp = Math.min(owner.maxHp, owner.hp + l.damage * 0.4);
              }
            }
            audio.sfx("check");
          }
        } else {
          l.active -= dt;
          if (l.active <= 0) state.lasers.splice(i, 1);
        }
      }
    }

    function updateTraps(dt) {
      for (let i = state.traps.length - 1; i >= 0; i--) {
        const t = state.traps[i];
        if (!t.fired) {
          t.t -= dt;
          if (t.t <= 0) {
            t.fired = true; t.active = 0.3;
            const target = nearestEnemyBody(t.owner, t.x, t.y);
            if (target && target.slot !== t.owner && dist(t.x, t.y, target.x, target.y) < t.radius + target.radius) {
              damage(target, t.damage, t.color, t.src);
              if (t.status) applyStatus(target, t.status);
              if (t.special === "lifesteal") {
                const owner = fighter(t.owner);
                if (owner) owner.hp = Math.min(owner.maxHp, owner.hp + t.damage * 0.4);
              }
            }
            audio.sfx("capture");
          }
        } else {
          t.active -= dt;
          if (t.active <= 0) state.traps.splice(i, 1);
        }
      }
    }

    function updateClones(dt) {
      for (let i = state.clones.length - 1; i >= 0; i--) {
        const c = state.clones[i];
        c.life -= dt; c.atkCd -= dt;
        if (c.life <= 0) { state.clones.splice(i, 1); continue; }
        if (c.atkCd <= 0) {
          const target = nearestEnemyBody(c.owner, c.x, c.y);
          if (target) {
            const a = Math.atan2(target.y - c.y, target.x - c.x);
            state.projectiles.push({
              x: c.x, y: c.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
              r: 5, shape: "circle", life: 1.2, traveled: 0, range: 380,
              owner: c.owner, target: target.slot, damage: 6,
              special: "none", bounces: 0, color: c.color, arm: 0.08, age: 0
            });
          }
          c.atkCd = 0.9;
        }
      }
    }

    function updateAlly(a, dt) {
      if (!a || a.hp <= 0) return;
      a.atkCd -= dt * (a.atkRate || 1);
      a.collCd = Math.max(0, a.collCd - dt);
      a.flash = Math.max(0, a.flash - dt);
      if (a.orbitOwner) {
        const owner = fighter(a.orbitOwner);
        if (owner && owner.hp > 0) {
          a.orbitAngle += dt * (a.orbitSpeed || 1);
          a.x = owner.x + Math.cos(a.orbitAngle) * (a.orbitDist || 44);
          a.y = owner.y + Math.sin(a.orbitAngle) * (a.orbitDist || 44);
          if (a.kind === "chessClub") owner.clubAngle = a.orbitAngle;
          if (a.kind === "chessDrone" && a.atkCd <= 0) {
            const target = nearestEnemyBody(a.slot, a.x, a.y);
            if (target) spawnBeams(a, target, { count: 1, aim: "current", damage: 7, range: 360 });
            a.atkCd = 1.8;
          }
        }
        return;
      }
      if (!a.immobile) {
        const sp = 150 * (state.overtime ? 2 : 1);
        const cur = Math.hypot(a.vx, a.vy) || 1;
        a.vx = a.vx / cur * sp; a.vy = a.vy / cur * sp;
        a.x += a.vx * dt; a.y += a.vy * dt;
        const wd = Math.hypot(a.x - CX, a.y - CY), maxD = ARENA_R - a.radius;
        if (wd > maxD) {
          const ux = (a.x - CX) / wd, uy = (a.y - CY) / wd;
          a.x = CX + ux * maxD; a.y = CY + uy * maxD;
          const dot = a.vx * ux + a.vy * uy;
          if (dot > 0) { a.vx -= 2 * dot * ux; a.vy -= 2 * dot * uy; }
          const ang = Math.atan2(a.vy, a.vx) + (Math.random() - 0.5) * 0.5;
          a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp;
        }
      }
      if (a.kind === "right-arm" && a.atkCd <= 0) {
        const target = nearestEnemyBody(a.slot, a.x, a.y);
        if (target) spawnShots(a, target, { count: 1, aim: "current", damage: 8, speed: 380, shape: "needle", range: 640, status: { paralyze: 1 } });
        a.atkCd = 2;
      } else if (a.kind === "sandalphon" && a.atkCd <= 0) {
        const target = nearestEnemyBody(a.slot, a.x, a.y);
        if (target) spawnBeams(a, target, { count: 1, aim: "current", damage: 7, range: 720 });
        a.atkCd = 2.6;
      } else if ((a.kind === "mikaClone" || a.kind === "luciClone") && a.atkCd <= 0) {
        const target = nearestEnemyBody(a.slot, a.x, a.y);
        if (target) spawnShots(a, target, { count: 1, aim: "current", damage: 3, speed: 300, shape: "circle", r: 5, range: 560 });
        a.atkCd = 1.8;
      }
    }

    function collisionPower(f) {
      if (f.p.id === "black-2-1" && f.snakeShield) return 10;
      if (f.p.id === "black-4-1" && f.fistDash) return f.fistDamage;
      if (f.p.id === "red-1-1") return 0;
      if (f.p.id === "chaos-5-1" && f.phaseActive) return Math.max(10, Math.round(f.stats.damage * 0.85));
      if (f.noDamageDealt > 0 || f.p.id === "chaos-6-1") return 0;
      const isUnit = !f.isAlly || f.teammate;
      let v = isUnit ? Math.max(2, f.stats.damage * 0.52) : (f.damage || 8);
      if (isUnit) {
        if (f.p.id === "red-1-1") v = Math.min(v, 6);
        if (f.p.id === "red-2-1") v = f.dash > 0 ? 80 : 4;
        if (f.p.id === "red-4-1") v = f.dash > 0 ? 32 : 9;
        if (f.p.id === "black-4-1") v = f.dash > 0 ? 22 : 4;
        if (f.p.id === "black-7-3") v = 16;
        v += rukaAttackBonus(f);
        v *= (f.atkBuff || 1) * (f.atkNerf || 1);
        if (f.collisionLock > 0) v = 0;
        if (f.p.chessFaction) {
          if (f.p.type === 2) v = f.dash > 0 ? 38 : 6;
          else if (f.p.type === 4) v = Math.max(v, 18);
          else if (f.p.type === 6) v = Math.max(v, 15);
          else if (f.p.type === 1) v = Math.min(v, 7);
        }
        if (f.star > 0) v *= 2;
      }
      v *= f.dmgBoost || 1;
      return Math.max(1, Math.round(v));
    }

    function isDashing(f) {
      return !!f && f.dash > 0 && !f.dashHit && (f.p.id === "red-2-1" || f.p.id === "red-4-1" || f.p.id === "black-4-1" || (f.p.chessFaction && f.p.type === 2));
    }

    function allyCollision(a, b) {
      if (!a || !b || a.slot === b.slot || a.hp <= 0 || b.hp <= 0) return;
      if (a.noCollision || b.noCollision) return;
      if (state.timeStop > 0) return;
      const d = dist(a.x, a.y, b.x, b.y);
      const min = a.radius + b.radius;
      if (d >= min || d < 0.001) return;
      const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
      const overlap = min - d;
      if (a.immobile && !b.immobile) { b.x += nx * overlap; b.y += ny * overlap; }
      else if (b.immobile && !a.immobile) { a.x -= nx * overlap; a.y -= ny * overlap; }
      else if (!a.immobile && !b.immobile) {
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
      }
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        a.vx += nx * vn * 0.75; a.vy += ny * vn * 0.75;
        b.vx -= nx * vn * 0.75; b.vy -= ny * vn * 0.75;
      }
      if (!isDashing(a) && !isDashing(b) && (a.collCd > 0 || b.collCd > 0)) return;
      a.collCd = b.collCd = 0.5;
      if (isDashing(a)) a.dashHit = true;
      if (isDashing(b)) b.dashHit = true;
      const pa = a.noDamage ? 0 : collisionPower(a);
      const pb = b.noDamage ? 0 : collisionPower(b);
      if (a.p.id === "red-2-1" && isDashing(a)) state.effects.push({ x: b.x, y: b.y - b.radius - 12, text: "天军之剑", life: 0.8, color: "#fff0a0" });
      if (b.p.id === "red-2-1" && isDashing(b)) state.effects.push({ x: a.x, y: a.y - a.radius - 12, text: "天军之剑", life: 0.8, color: "#fff0a0" });
      damage(b, pa, sideColor(a.side), a);
      damage(a, pb, sideColor(b.side), b);
    }

    function updateAllyCollisions() {
      if (state.phase !== "fight") return;
      // 同尺寸祸抚碎片碰撞合体：小 + 小 → 中；中 + 中 → 大。
      const slimes = state.allies.filter(a => a.hp > 0 && (a.kind === "slime10" || a.kind === "slime20"));
      for (let i = 0; i < slimes.length; i++) {
        let merged = false;
        for (let j = i + 1; j < slimes.length; j++) {
          const a = slimes[i], b = slimes[j];
          if (a.hp <= 0 || b.hp <= 0 || a.slot !== b.slot || a.kind !== b.kind) continue;
          if (dist(a.x, a.y, b.x, b.y) < a.radius + b.radius) {
            mergeSlimes(a, b);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
      for (const a of state.allies) {
        if (a.hp <= 0) continue;
        const own = fighter(a.slot);
        if (a.atomSister && own && own.p.id === "red-6-2" && own.splitKind === "metatron" && own.hp > 0) {
          if (dist(own.x, own.y, a.x, a.y) < own.radius + a.radius) atomHeaven(own, a);
        }
        const main = fighter(a.slot === "a" ? "b" : "a");
        if (a.noTarget) continue;
        if (main && main.hp > 0) allyCollision(a, main);
        for (const b of state.allies) {
          if (b.hp > 0 && b.slot !== a.slot) allyCollision(a, b);
        }
        if (state.phase !== "fight") return;
      }
    }

    function updateCollisions() {
      const a = fighter("a"), b = fighter("b");
      if (!a || !b || state.phase !== "fight") return;
      if (state.timeStop > 0 && a.p.id !== "ruka-4-1" && b.p.id !== "ruka-4-1") return;
      if (a.noCollision || b.noCollision) return;
      const d = dist(a.x, a.y, b.x, b.y);
      const min = a.radius + b.radius;
      if (d < min && d > 0.001) {
        const phaseA = a.p.id === "chaos-5-1" && a.phaseActive;
        const phaseB = b.p.id === "chaos-5-1" && b.phaseActive;
        if (phaseA || phaseB) {
          if (a.collCd <= 0 && b.collCd <= 0 && state.phase === "fight") {
            a.collCd = b.collCd = 0.48;
            if (phaseA) {
              damage(b, collisionPower(a), "#e8d8ff", a);
              state.effects.push({ x: b.x, y: b.y - b.radius - 12, text: "虚化撞击", life: 0.8, color: "#e8d8ff" });
            }
            if (phaseB) {
              damage(a, collisionPower(b), "#e8d8ff", b);
              state.effects.push({ x: a.x, y: a.y - a.radius - 12, text: "虚化撞击", life: 0.8, color: "#e8d8ff" });
            }
            audio.sfx("capture");
          }
          return;
        }
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        const overlap = min - d;
        if (a.immobile && !b.immobile) { b.x += nx * overlap; b.y += ny * overlap; }
        else if (b.immobile && !a.immobile) { a.x -= nx * overlap; a.y -= ny * overlap; }
        else if (!a.immobile && !b.immobile) {
          a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        }
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          a.vx += nx * vn * 0.75; a.vy += ny * vn * 0.75;
          b.vx -= nx * vn * 0.75; b.vy -= ny * vn * 0.75;
        }
        if ((isDashing(a) || isDashing(b) || (a.collCd <= 0 && b.collCd <= 0))) {
          let da = collisionPower(a), db = collisionPower(b);
          if (state.timeStop > 0) {
            if (a.p.id !== "ruka-4-1") da = 0;
            if (b.p.id !== "ruka-4-1") db = 0;
          }
          if (a.p.id === "red-2-1" && isDashing(a)) state.effects.push({ x: b.x, y: b.y - b.radius - 12, text: "天军之剑", life: 0.8, color: "#fff0a0" });
          if (b.p.id === "red-2-1" && isDashing(b)) state.effects.push({ x: a.x, y: a.y - a.radius - 12, text: "天军之剑", life: 0.8, color: "#fff0a0" });
          a.collCd = b.collCd = 0.48;
          if (a.fistDash) a.fistDash = false;
          if (b.fistDash) b.fistDash = false;
          if (isDashing(a)) a.dashHit = true;
          if (isDashing(b)) b.dashHit = true;
          if (a.star > 0) {
            a.star = 0; a.invincible = 0; a.dmgBoost = 1;
          }
          damage(b, da, sideColor(a.side), a);
          if (a.p.id === "red-3-1") applyStatus(b, { burn: 5 });
          if (a.p.id === "black-7-3") {
            if (a.hp >= a.maxHp && !a.bloodBoost) {
              a.hp = Math.max(1, a.hp - 40); a.bloodBoost = true; a.dmgBoost = 2;
              state.effects.push({ x: a.x, y: a.y - 30, text: "暴食强化", life: 1, color: "#c6ff8a" });
            }
            a.hp = Math.min(a.maxHp, a.hp + da);
            if (a.bloodBoost) { a.bloodBoost = false; a.dmgBoost = 1; }
          }
          damage(a, db, sideColor(b.side), b);
          if (b.p.id === "red-3-1") applyStatus(a, { burn: 5 });
          if (b.p.id === "black-7-3") {
            if (b.hp >= b.maxHp && !b.bloodBoost) {
              b.hp = Math.max(1, b.hp - 40); b.bloodBoost = true; b.dmgBoost = 2;
            }
            b.hp = Math.min(b.maxHp, b.hp + db);
            if (b.bloodBoost) { b.bloodBoost = false; b.dmgBoost = 1; }
          }
          audio.sfx("capture");
        }
      }
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      if (!len2) return Math.hypot(px - x1, py - y1);
      let t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = clamp(t, 0, 1);
      return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
    }

    function update(dt) {
      if (state.phase === "countdown") {
        state.countdown -= dt;
        if (state.countdown <= 0) { state.phase = "fight"; hideBanner(); }
        return;
      }
      if (state.phase === "roundEnd") {
        state.roundEndTimer -= dt;
        if (state.roundEndTimer <= 0) {
          if (state.score.a >= WIN_SCORE || state.score.b >= WIN_SCORE) {
            finishMatch();
          } else {
            state.round++;
            startRound();
          }
        }
        return;
      }
      if (state.phase !== "fight") return;

      state.roundTime += dt;
      state.timeLeft -= dt;
      if (state.timeStop > 0) {
        state.timeStop -= dt;
        if (state.timeStop <= 0) state.timeStopOwner = "";
      }
      if (root) root.classList.toggle("ar-time-stop", state.timeStop > 0);
      document.body.classList.toggle("time-stop-page", state.timeStop > 0);
      const a = fighter("a"), b = fighter("b");
      if (a) updateFighter(a, nearestEnemyBody("a", a.x, a.y), dt);
      if (b) updateFighter(b, nearestEnemyBody("b", b.x, b.y), dt);
      for (const ally of state.allies) {
        if (ally.teammate) updateFighter(ally, nearestEnemyBody(ally.slot, ally.x, ally.y), dt);
        else updateAlly(ally, dt);
      }
      updateHeals(dt);
      updateProjectiles(dt);
      updateLasers(dt);
      updateTraps(dt);
      updateClones(dt);
      updateCollisions();
      updateAllyCollisions();
      for (const body of allBodies()) {
        if (body.immobile) { body.x = body.homeX != null ? body.homeX : body.x; body.y = body.homeY != null ? body.homeY : body.y; body.vx = 0; body.vy = 0; }
      }
      for (let i = state.effects.length - 1; i >= 0; i--) {
        const e = state.effects[i];
        e.y -= 34 * dt; e.life -= dt;
        if (e.life <= 0) state.effects.splice(i, 1);
      }
      if (state.bannerTimer > 0) {
        state.bannerTimer -= dt;
        if (state.bannerTimer <= 0 && state.phase === "fight") hideBanner();
      }
      if (!state.overtime && state.timeLeft <= 0) {
        state.overtime = true;
        state.bannerTimer = 1.6;
        showBanner("时间到 · 狂暴", "双方受伤 ×2 · 移速 ×2", "round");
        audio.sfx("win");
      }
      updateHud();
    }

    function drawArena() {
      if (!ctx) return;
      const scale = Math.min(canvas.width / W, canvas.height / H);
      ctx.setTransform(scale, 0, 0, scale, (canvas.width - W * scale) / 2, (canvas.height - H * scale) / 2);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#120d22");
      bg.addColorStop(0.55, "#22133b");
      bg.addColorStop(1, "#090711");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(CX, CY, 30, CX, CY, ARENA_R + 70);
      glow.addColorStop(0, "rgba(126,73,190,.22)");
      glow.addColorStop(0.7, "rgba(232,183,90,.06)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      // arena disc
      ctx.beginPath(); ctx.arc(CX, CY, ARENA_R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(10,7,20,.62)"; ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.beginPath(); ctx.arc(CX, CY, 46 + i * 31, 0, Math.PI * 2);
        ctx.strokeStyle = i % 2 ? "rgba(234,196,106,.11)" : "rgba(160,108,225,.12)";
        ctx.lineWidth = 1; ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(CX, CY);
        ctx.lineTo(CX + Math.cos(a) * ARENA_R, CY + Math.sin(a) * ARENA_R);
        ctx.strokeStyle = "rgba(232,192,122,.07)"; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(CX, CY, ARENA_R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(242,202,112,.8)"; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(CX, CY, ARENA_R - 9, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(166,114,230,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(CX, CY, 30, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(242,202,112,.4)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "rgba(242,202,112,.65)";
      ctx.font = "600 15px 'Microsoft YaHei',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GRAND NOAH", CX, CY + 5);
    }

    function drawTraps() {
      for (const t of state.traps) {
        const pulse = t.fired ? 1 - Math.max(0, t.active / 0.3) : 0.5 + Math.sin(performance.now() / 120) * 0.2;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.radius * (t.fired ? 1 + pulse * 0.3 : pulse * 0.6 + 0.4), 0, Math.PI * 2);
        ctx.fillStyle = t.fired ? "rgba(255,132,92,.25)" : "rgba(190,110,255,.12)";
        ctx.fill();
        ctx.strokeStyle = t.fired ? "rgba(255,170,110,.9)" : "rgba(198,128,255,.65)";
        ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t.x - 8, t.y); ctx.lineTo(t.x + 8, t.y);
        ctx.moveTo(t.x, t.y - 8); ctx.lineTo(t.x, t.y + 8);
        ctx.strokeStyle = "rgba(255,230,170,.55)"; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    function drawLasers() {
      for (const l of state.lasers) {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2);
        if (!l.fired) {
          ctx.setLineDash([9, 9]); ctx.strokeStyle = "rgba(255,120,160,.55)"; ctx.lineWidth = 2;
        } else if (l.style === "lightning") {
          ctx.setLineDash([]);
          ctx.strokeStyle = "#c9b6ff"; ctx.lineWidth = 2.5;
          ctx.shadowColor = "#9f7dff"; ctx.shadowBlur = 16;
          ctx.beginPath();
          const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const off = i === 0 || i === 10 ? 0 : (Math.sin(i * 9.7 + performance.now() / 95) * 10);
            const px = l.x1 + dx * t + nx * off;
            const py = l.y1 + dy * t + ny * off;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1;
          ctx.stroke();
        } else if (l.style === "atom") {
          ctx.setLineDash([]);
          ctx.strokeStyle = "#37ff9a"; ctx.lineWidth = 26;
          ctx.shadowColor = "#37ff9a"; ctx.shadowBlur = 34;
          ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
          ctx.strokeStyle = "#eafff5"; ctx.lineWidth = 11;
          ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 22;
          ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
        } else {
          ctx.setLineDash([]); ctx.strokeStyle = l.color; ctx.lineWidth = 8;
          ctx.shadowColor = l.color; ctx.shadowBlur = 18;
        }
        ctx.stroke(); ctx.restore();
      }
    }

    function drawProjectiles() {
      for (const p of state.projectiles) {
        ctx.save();
        ctx.shadowColor = p.color; ctx.shadowBlur = 22;
        ctx.strokeStyle = p.color; ctx.fillStyle = p.color;
        if (p.shape === "planet" && p.img && p.img.complete && p.img.naturalWidth) {
          const dr = p.drawR || p.r;
          ctx.shadowBlur = 32;
          ctx.drawImage(p.img, p.x - dr, p.y - dr, dr * 2, dr * 2);
        } else if (p.shape === "dragon") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
          ctx.shadowColor = "#ff8a3d"; ctx.shadowBlur = 22;
          ctx.fillStyle = "#1a0c14"; ctx.beginPath(); ctx.ellipse(0, 0, 21, 13, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ff8a3d"; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-2, -10); ctx.lineTo(4, 0); ctx.lineTo(-2, 10); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#ffd25a"; ctx.beginPath(); ctx.arc(10, -3, 2, 0, Math.PI * 2); ctx.arc(10, 3, 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#ffb86a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(-27, 0); ctx.lineTo(-16, 8); ctx.stroke();
          ctx.restore();
        } else if (p.shape === "spear") {
          const a = Math.atan2(p.vy, p.vx);
          const c = Math.cos(a), sn = Math.sin(a);
          ctx.shadowBlur = 30;
          ctx.strokeStyle = "rgba(255,220,130,.95)"; ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(p.x - c * 54, p.y - sn * 54);
          ctx.lineTo(p.x + c * 14, p.y + sn * 14);
          ctx.stroke();
          ctx.fillStyle = "#fff2c0";
          ctx.beginPath();
          ctx.moveTo(p.x + c * 32, p.y + sn * 32);
          ctx.lineTo(p.x + c * 8 - sn * 10, p.y + sn * 8 + c * 10);
          ctx.lineTo(p.x + c * 8 + sn * 10, p.y + sn * 8 - c * 10);
          ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - c * 42, p.y - sn * 42);
          ctx.lineTo(p.x + c * 10, p.y + sn * 10);
          ctx.stroke();
        } else if (p.shape === "chaosOrb") {
          const t = performance.now() / 180;
          ctx.shadowBlur = 34;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 5 - i * 4, t + i * 2.1, t + i * 2.1 + Math.PI * 1.25);
            ctx.strokeStyle = ["#ff3048", "#2a6cff", "#05030a"][i]; ctx.lineWidth = 5 - i; ctx.stroke();
          }
          ctx.fillStyle = "#0a050c"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ff4058"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#6aa8ff"; ctx.beginPath(); ctx.arc(p.x - 4, p.y - 4, p.r * 0.22, 0, Math.PI * 2); ctx.fill();
        } else if (p.shape === "bottle") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a + Math.PI / 2);
          ctx.fillStyle = "rgba(180,255,220,.85)";
          ctx.beginPath(); ctx.arc(0, 5, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#d8ffe8";
          ctx.fillRect(-2.5, -9, 5, 10);
          ctx.fillStyle = "#c8b080";
          ctx.fillRect(-3.5, -13, 7, 4);
          ctx.restore();
        } else if (p.shape === "scythe") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
          ctx.strokeStyle = "#c8a6ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(8, 0); ctx.stroke();
          ctx.strokeStyle = "#f2e6ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(8, 0, 16, -Math.PI / 2, Math.PI / 2); ctx.stroke();
          ctx.restore();
        } else if (p.shape === "sword") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
          ctx.strokeStyle = "#9fe0ff"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(22, 0); ctx.stroke();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(20, 0); ctx.stroke();
          ctx.strokeStyle = "#ffe0a0"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(4, 8); ctx.stroke();
          ctx.restore();
        } else if (p.shape === "rabbit") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
          ctx.shadowBlur = 20;
          // 兔子头弹：两只耳朵 + 圆头 + 红眼
          ctx.fillStyle = "#f7f2ff";
          ctx.beginPath(); ctx.ellipse(-5, -10, 5, 13, -0.35, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(6, -10, 5, 13, 0.35, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ffd6e8";
          ctx.beginPath(); ctx.ellipse(-5, -11, 2, 8, -0.35, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(6, -11, 2, 8, 0.35, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(0, 2, 14, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#d94d6b";
          ctx.beginPath(); ctx.arc(-5, 0, 2.6, 0, Math.PI * 2); ctx.arc(5, 0, 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#9c6b8a";
          ctx.beginPath(); ctx.arc(0, 7, 2, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (p.shape === "yinYang") {
          const t = performance.now() / 260;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t);
          ctx.shadowBlur = 16;
          ctx.fillStyle = "#f6f1ff"; ctx.beginPath(); ctx.arc(0, 0, p.r + 2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#17101f"; ctx.beginPath(); ctx.arc(0, 0, p.r, -Math.PI / 2, Math.PI / 2); ctx.arc(0, 0, p.r / 2, Math.PI / 2, -Math.PI / 2, true); ctx.fill();
          ctx.fillStyle = "#f6f1ff"; ctx.beginPath(); ctx.arc(0, 0, p.r / 2, -Math.PI / 2, Math.PI / 2); ctx.arc(0, 0, p.r, Math.PI / 2, -Math.PI / 2, true); ctx.fill();
          ctx.fillStyle = "#17101f"; ctx.beginPath(); ctx.arc(0, -p.r / 2, p.r * 0.18, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#f6f1ff"; ctx.beginPath(); ctx.arc(0, p.r / 2, p.r * 0.18, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (p.shape === "heart") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
          ctx.shadowBlur = 18; ctx.fillStyle = "#ff6b9d";
          ctx.beginPath();
          ctx.moveTo(0, 8);
          ctx.bezierCurveTo(-18, -4, -11, -18, 0, -7);
          ctx.bezierCurveTo(11, -18, 18, -4, 0, 8);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.75)";
          ctx.beginPath(); ctx.arc(-4, -5, 2, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (p.shape === "arrow") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
          ctx.strokeStyle = "#ffe6a0"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(14, 0); ctx.stroke();
          ctx.fillStyle = "#fff2c0";
          ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(10, -7); ctx.lineTo(10, 7); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#ffcf7a"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-16, -7); ctx.lineTo(-9, 0); ctx.lineTo(-16, 7); ctx.stroke();
          ctx.restore();
        } else if (p.shape === "needle") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(a) * 22, p.y - Math.sin(a) * 22);
          ctx.lineTo(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12);
          ctx.stroke();
          ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(a) * 14, p.y - Math.sin(a) * 14);
          ctx.lineTo(p.x + Math.cos(a) * 9, p.y + Math.sin(a) * 9);
          ctx.stroke();
        } else if (p.shape === "beam") {
          const a = Math.atan2(p.vy, p.vx);
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(a) * 34, p.y - Math.sin(a) * 34);
          ctx.lineTo(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12);
          ctx.stroke();
          ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(a) * 24, p.y - Math.sin(a) * 24);
          ctx.lineTo(p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8);
          ctx.stroke();
        } else {
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
          ctx.fillStyle = p.color; ctx.globalAlpha = 0.35; ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,.88)";
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, p.r * 0.38), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    function drawClones() {
      for (const c of state.clones) {
        ctx.save();
        ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 90) * 0.12;
        ctx.beginPath(); ctx.arc(c.x, c.y, 15, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(12,7,24,.8)"; ctx.fill();
        ctx.strokeStyle = c.color; ctx.lineWidth = 2; ctx.stroke();
        if (c.img && c.img.complete && c.img.naturalWidth) {
          ctx.beginPath(); ctx.arc(c.x, c.y, 13, 0, Math.PI * 2); ctx.clip();
          ctx.drawImage(c.img, c.x - 17, c.y - 20, 34, 34);
        }
        ctx.restore();
      }
    }

    function teamColor(slot) {
      return slot === "a" ? "#ff5f7a" : "#5fa8ff";
    }

    function drawStatusFx(f) {
      const t = performance.now() / 1000;
      const x = f.x, y = f.y, r = f.radius;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // 蓄力：旋转能量环 + 向心粒子
      if (f.chargeTotal > 0 && f.chargeLeft > 0) {
        const progress = Math.max(0, Math.min(1, 1 - f.chargeLeft / f.chargeTotal));
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r + 17, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r + 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = "#fff1b8"; ctx.lineWidth = 4; ctx.lineCap = "round";
        ctx.shadowColor = "#ffe6a0"; ctx.shadowBlur = 10; ctx.stroke();
        ctx.restore();
      }
      if (f.p.id === "red-1-1") {
        for (let k = 0; k < 2; k++) {
          const a = f.crossAngle + k * Math.PI / 4;
          const size = f.crossSize * (k ? 0.82 : 1);
          ctx.strokeStyle = k ? "#fff8d8" : "#ffe28a";
          ctx.lineWidth = k ? 3 : 5;
          ctx.globalAlpha = 0.85;
          for (let arm = 0; arm < 4; arm++) {
            const aa = a + arm * Math.PI / 2;
            const c = Math.cos(aa), sn = Math.sin(aa);
            ctx.beginPath(); ctx.moveTo(x + c * 8, y + sn * 8); ctx.lineTo(x + c * size, y + sn * size); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + c * size, y + sn * size);
            ctx.lineTo(x + c * (size - 13) - sn * 7, y + sn * (size - 13) + c * 7);
            ctx.lineTo(x + c * (size - 13) + sn * 7, y + sn * (size - 13) - c * 7);
            ctx.closePath(); ctx.fillStyle = k ? "#fff8d8" : "#ffe28a"; ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      if (f.p.id === "black-4-1" && f.fistStacks > 0) {
        for (let i = 0; i < f.fistStacks; i++) {
          const a = -Math.PI / 2 + i * Math.PI * 2 / Math.max(1, f.fistStacks);
          const fx = x + Math.cos(a) * (r + 25), fy = y + Math.sin(a) * (r + 25);
          ctx.globalAlpha = 0.85; ctx.fillStyle = "rgba(255,255,255,.16)";
          ctx.beginPath(); ctx.arc(fx, fy, 7, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#fff8e0"; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = "#fff8e0"; ctx.font = "700 7px 'Microsoft YaHei',sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("拳", fx, fy + 0.5);
        }
        ctx.globalAlpha = 1;
      }
      if (f.snakeShield) {
        const a = f.snakeAngle;
        const sx = x + Math.cos(a) * (r + 12), sy = y + Math.sin(a) * (r + 12);
        const nx = -Math.sin(a), ny = Math.cos(a);
        ctx.globalAlpha = 0.9; ctx.strokeStyle = "#ffe6a0"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(sx - nx * 28, sy - ny * 28); ctx.lineTo(sx + nx * 28, sy + ny * 28); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (f.atomMerge > 0) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = "#8dffc0"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (f.hold > 0 || f.planetTimer > 0 || f.spearTimer > 0) {
        const color = f.spearTimer > 0 ? "#ffd86e" : f.planetTimer > 0 ? "#f0a6ff" : "#ffcf7a";
        for (let i = 0; i < 3; i++) {
          const a0 = t * (1.4 + i * 0.35) + i * 2.1;
          ctx.beginPath();
          ctx.arc(x, y, r + 8 + i * 7, a0, a0 + 1.1);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.5 - i * 0.12;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        for (let i = 0; i < 8; i++) {
          const a = t * 2.6 + i * Math.PI / 4;
          const rr = r + 26 - ((t * 24 + i * 9) % 26);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.globalAlpha = 0.8; ctx.fill();
        }
      }

      // 护盾 / 防御
      if (f.shield > 0 || f.defense) {
        ctx.globalAlpha = 0.35 + Math.sin(t * 5) * 0.1;
        ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = f.defense ? "#a8f0ff" : "#8fe7ff"; ctx.lineWidth = 2.5; ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = t * 0.6 + i * Math.PI / 3;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8), 2.5, 0, Math.PI * 2);
          ctx.fillStyle = "#c8f6ff"; ctx.fill();
        }
      }

      // 无敌 / 明星
      if (f.invincible > 0 || f.star > 0) {
        ctx.globalAlpha = 0.3 + Math.sin(t * 4) * 0.1;
        ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = f.star > 0 ? "#ffe08a" : "#f3e2a0"; ctx.lineWidth = 2; ctx.stroke();
        if (f.star > 0) {
          for (let i = 0; i < 5; i++) {
            const a = t * 1.8 + i * Math.PI * 2 / 5;
            const sx = x + Math.cos(a) * (r + 12), sy = y + Math.sin(a) * (r + 12);
            ctx.beginPath();
            for (let k = 0; k < 5; k++) {
              const aa = -Math.PI / 2 + k * Math.PI * 2 / 5;
              const px = sx + Math.cos(aa) * 3.5, py = sy + Math.sin(aa) * 3.5;
              if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              ctx.lineTo(sx + Math.cos(aa + Math.PI / 5) * 1.6, sy + Math.sin(aa + Math.PI / 5) * 1.6);
            }
            ctx.closePath(); ctx.fillStyle = "#ffe9a6"; ctx.fill();
          }
        }
      }

      // 灼烧：底部火苗
      if (f.burn > 0) {
        for (let i = 0; i < 4; i++) {
          const a = t * 3 + i * 1.6;
          const fx = x + Math.cos(a) * (r * 0.65);
          const fy = y + r * 0.7 + Math.sin(a * 1.7) * 3;
          ctx.beginPath();
          ctx.moveTo(fx - 3, fy + 5);
          ctx.quadraticCurveTo(fx, fy - 8 - (i % 2) * 4, fx + 3, fy + 5);
          ctx.fillStyle = i % 2 ? "rgba(255,120,60,.75)" : "rgba(255,190,80,.7)";
          ctx.fill();
        }
      }

      // 冰冻：冰晶棱
      if (f.freeze > 0) {
        ctx.globalAlpha = 0.65;
        for (let i = 0; i < 6; i++) {
          const a = t * 0.5 + i * Math.PI / 3;
          const bx = x + Math.cos(a) * (r + 3), by = y + Math.sin(a) * (r + 3);
          ctx.beginPath();
          ctx.moveTo(bx - Math.cos(a) * 5, by - Math.sin(a) * 5);
          ctx.lineTo(bx + Math.cos(a) * 7, by + Math.sin(a) * 7);
          ctx.strokeStyle = "#bff2ff"; ctx.lineWidth = 2; ctx.stroke();
        }
      }

      // 麻痹：电弧
      if (f.paralyze > 0) {
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 3; i++) {
          const a = t * 7 + i * 2.1;
          ctx.beginPath();
          let px = x + Math.cos(a) * (r + 2), py = y + Math.sin(a) * (r + 2);
          ctx.moveTo(px, py);
          for (let k = 1; k <= 3; k++) {
            px += Math.cos(a + (k % 2 ? 0.6 : -0.6)) * 5;
            py += Math.sin(a + (k % 2 ? 0.6 : -0.6)) * 5;
            ctx.lineTo(px, py);
          }
          ctx.strokeStyle = "#ffe27a"; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }

      // 治疗：绿色十字
      if (f.heal > 0) {
        ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) {
          const a = t * 1.8 + i * 2.1;
          const hx = x + Math.cos(a) * (r + 10), hy = y + Math.sin(a) * (r + 10);
          ctx.fillStyle = "#9be58f";
          ctx.fillRect(hx - 1.5, hy - 5, 3, 10);
          ctx.fillRect(hx - 5, hy - 1.5, 10, 3);
        }
      }

      // 魅惑：粉色心形
      if (f.control > 0) {
        ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) {
          const a = t * 1.4 + i * 2.1;
          const hx = x + Math.cos(a) * (r + 12), hy = y + Math.sin(a) * (r + 12);
          ctx.beginPath();
          ctx.moveTo(hx, hy + 4);
          ctx.bezierCurveTo(hx - 7, hy - 2, hx - 4, hy - 7, hx, hy - 4);
          ctx.bezierCurveTo(hx + 4, hy - 7, hx + 7, hy - 2, hx, hy + 4);
          ctx.fillStyle = "#ff78b0"; ctx.fill();
        }
      }

      // 减速：紫色拖尾环
      if (f.slow > 0) {
        ctx.globalAlpha = 0.45;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(x, y, r + 6 + i * 5, t * 0.7 + i * 2, t * 0.7 + i * 2 + 1.6);
          ctx.strokeStyle = "#c2a0ff"; ctx.lineWidth = 2; ctx.stroke();
        }
      }

      // 冲刺：速度线
      if (f.dash > 0) {
        const a = Math.atan2(f.vy, f.vx);
        ctx.globalAlpha = 0.55;
        for (let i = 0; i < 3; i++) {
          const off = (i - 1) * 9;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(a) * (r + 4) - Math.sin(a) * off, y - Math.sin(a) * (r + 4) + Math.cos(a) * off);
          ctx.lineTo(x - Math.cos(a) * (r + 30) - Math.sin(a) * off, y - Math.sin(a) * (r + 30) + Math.cos(a) * off);
          ctx.strokeStyle = "#ffcf7a"; ctx.lineWidth = 2; ctx.stroke();
        }
      }

      // 凋零：小骷髅头均匀环绕
      if (f.wither > 0) {
        const n = Math.max(1, Math.round(f.wither));
        for (let i = 0; i < n; i++) {
          const a = t * 0.7 + i * Math.PI * 2 / n;
          const sx = x + Math.cos(a) * (r + 20), sy = y + Math.sin(a) * (r + 20);
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = "#e8e2ff";
          ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(sx - 3, sy + 2, 6, 3);
          ctx.fillStyle = "#28203a";
          ctx.beginPath(); ctx.arc(sx - 1.5, sy - 1, 1.2, 0, Math.PI * 2); ctx.arc(sx + 1.5, sy - 1, 1.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      // 伊娃怨念：灰色圆环
      if (f.grudge > 0) {
        const n = Math.max(1, Math.round(f.grudge));
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = "#9b98a8"; ctx.lineWidth = 2;
        for (let i = 0; i < n; i++) {
          const a = -t * 0.6 + i * Math.PI * 2 / n;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12), 3, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // 鲁卡的半血增伤：火焰图标
      if (f.p.id === "ruka-6-1" && rukaAttackBonus(f) > 0) {
        const n = Math.min(3, Math.ceil(rukaAttackBonus(f) / 10));
        for (let i = 0; i < n; i++) {
          const a = t * 1.2 + i * Math.PI * 2 / n;
          const fx = x + Math.cos(a) * (r + 17), fy = y + Math.sin(a) * (r + 17);
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = "#ff9a4a";
          ctx.beginPath(); ctx.moveTo(fx, fy - 7); ctx.quadraticCurveTo(fx + 6, fy, fx, fy + 5); ctx.quadraticCurveTo(fx - 6, fy, fx, fy - 7); ctx.fill();
          ctx.fillStyle = "#ffe08a";
          ctx.beginPath(); ctx.arc(fx, fy + 1, 2, 0, Math.PI * 2); ctx.fill();
        }
      }

      ctx.restore();
    }

    function drawHeals() {
      for (const h of state.heals) {
        const fade = clamp(h.life / 5, 0, 1);
        const t = performance.now() / 1000;
        ctx.save();
        const g = ctx.createRadialGradient(h.x, h.y, h.r * 0.1, h.x, h.y, h.r);
        g.addColorStop(0, "rgba(120,255,170,.24)");
        g.addColorStop(0.65, "rgba(70,220,130,.18)");
        g.addColorStop(1, "rgba(50,180,110,0)");
        ctx.globalAlpha = fade;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -t * 20;
        ctx.strokeStyle = "rgba(150,255,190,.55)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < 5; i++) {
          const a = t * 0.9 + i * Math.PI * 2 / 5;
          const rr = h.r * 0.45 + Math.sin(t * 2 + i) * 8;
          const x = h.x + Math.cos(a) * rr, y = h.y + Math.sin(a) * rr;
          ctx.fillStyle = "rgba(180,255,200,.7)";
          ctx.fillRect(x - 1.5, y - 5, 3, 10);
          ctx.fillRect(x - 5, y - 1.5, 10, 3);
        }
        ctx.restore();
      }
    }

    function drawFighter(f) {
      if (!f || f.hp <= 0) return;
      if (f.kind === "chessEye") {
        ctx.save();
        const r = f.radius + 4;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.clip();
        if (f.img && f.img.complete && f.img.naturalWidth) ctx.drawImage(f.img, f.x - r, f.y - r, r * 2, r * 2);
        ctx.restore();
        return;
      }
      if (f.kind === "chessDrone") {
        const a = f.orbitAngle || 0;
        ctx.save();
        ctx.translate(f.x, f.y); ctx.rotate(a);
        ctx.strokeStyle = teamColor(f.slot); ctx.fillStyle = "rgba(10,8,20,.9)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, 9); ctx.lineTo(-6, 0); ctx.lineTo(-10, -9); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fillStyle = "#cfe6ff"; ctx.fill();
        ctx.restore();
        return;
      }
      if (f.kind === "chessClub") {
        const a = f.orbitAngle || 0;
        ctx.save();
        ctx.translate(f.x, f.y); ctx.rotate(a);
        ctx.strokeStyle = "#d8a45a"; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(0, -20, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7, 22); ctx.lineTo(7, 22); ctx.moveTo(-7, 28); ctx.lineTo(7, 28); ctx.stroke();
        ctx.restore();
        return;
      }
      const col = teamColor(f.slot);
      ctx.save();
      if (f.noDamageDealt > 0) ctx.globalAlpha = 0.5;
      ctx.shadowColor = col; ctx.shadowBlur = f.flash > 0 ? 28 : 16;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(5,3,10,.9)"; ctx.fill();
      ctx.shadowBlur = 0;
      const im = f.img;
      if (im && im.complete && im.naturalWidth) {
        ctx.save();
        ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.clip();
        const size = f.radius * 2.25;
        if (f.p.id === "black-6-2" && f.spinUntil && performance.now() / 1000 < f.spinUntil) {
          ctx.translate(f.x, f.y); ctx.rotate(f.spinAngle);
          ctx.drawImage(im, -size / 2, -size * 0.58, size, size);
        } else {
          ctx.drawImage(im, f.x - size / 2, f.y - size * 0.58, size, size);
        }
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fillStyle = sideDark(f.side); ctx.fill();
        ctx.fillStyle = "#fff3cf"; ctx.font = "700 " + Math.round(f.radius * 0.8) + "px 'Microsoft YaHei',sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff3cf"; ctx.fillText(((f.p.displayName || f.p.name) || "?").slice(0, 1), f.x, f.y);
      }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = f.flash > 0 ? "#fff3c4" : col; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 1; ctx.stroke();

      const bw = f.radius * 2.2, bh = 6;
      const bx = f.x - bw / 2, by = f.y - f.radius - 17;
      ctx.fillStyle = "rgba(4,2,9,.85)"; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = col; ctx.fillRect(bx, by, bw * clamp(f.hp / f.maxHp, 0, 1), bh);
      ctx.strokeStyle = "rgba(255,255,255,.26)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);

      const icons = [];
      if (f.burn > 0) icons.push(["火", "#ff8a4a"]);
      if (f.paralyze > 0) icons.push(["麻", "#ffd166"]);
      if (f.freeze > 0) icons.push(["冰", "#8fe7ff"]);
      if (f.water > 0) icons.push(["水", "#62c8ff"]);
      if (f.shield > 0) icons.push(["盾", "#8fe7ff"]);
      if (f.star > 0) icons.push(["星", "#ffe08a"]);
      else if (f.invincible > 0) icons.push(["免", "#f3e2a0"]);
      if (f.control > 0) icons.push(["魅", "#ff78b0"]);
      if (f.slow > 0) icons.push(["缓", "#c2a0ff"]);
      if (f.heal > 0) icons.push(["疗", "#9be58f"]);
      if (f.hold > 0) icons.push(["蓄", "#ffd166"]);
      if (f.dash > 0) icons.push(["冲", "#ffcf7a"]);
      if (f.defense) icons.push(["守", "#8fe7ff"]);
      if (f.speedBoost > 1) icons.push(["速", "#9be58f"]);
      if (f.dmgBoost > 1) icons.push(["攻", "#ff9a7a"]);
      if (f.p.id === "ruka-6-1" && rukaAttackBonus(f) > 0) icons.push(["攻", "#ff9a7a"]);
      if (icons.length) {
        const iw = 14, gap = 2;
        let ix = f.x - (Math.min(icons.length, 6) * (iw + gap) - gap) / 2;
        const iy = f.y - f.radius - 34;
        ctx.font = "700 9px 'Microsoft YaHei',sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        icons.slice(0, 6).forEach(([label, col]) => {
          ctx.beginPath(); ctx.arc(ix + iw / 2, iy, iw / 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(5,3,10,.88)"; ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = col; ctx.fillText(label, ix + iw / 2, iy + 0.5);
          ix += iw + gap;
        });
      }
      if (f.drones) {
        for (const d of f.drones) {
          const dx = f.x + Math.cos(d.angle) * d.dist, dy = f.y + Math.sin(d.angle) * d.dist;
          ctx.save(); ctx.translate(dx, dy); ctx.rotate(d.angle + Math.PI / 2);
          ctx.strokeStyle = teamColor(f.slot); ctx.fillStyle = "rgba(10,8,20,.92)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(11, 8); ctx.lineTo(0, 4); ctx.lineTo(-11, 8); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#cfe6ff"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
      if (f.eyes && f.eyeImgs) {
        f.eyes.forEach((e, i) => {
          const ex = f.x + Math.cos(e.angle) * e.dist, ey = f.y + Math.sin(e.angle) * e.dist;
          const im = f.eyeImgs[i];
          if (im && im.complete && im.naturalWidth) {
            ctx.save(); ctx.beginPath(); ctx.arc(ex, ey, 16, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(im, ex - 16, ey - 16, 32, 32); ctx.restore();
          } else {
            ctx.fillStyle = "#ff3a4a"; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill();
          }
        });
      }
      if (f.bladeAura > 0) {
        ctx.save(); ctx.globalAlpha = 0.9;
        const progress = 1 - f.bladeAura / 1.2;
        for (let i = 0; i < 4; i++) {
          const a = progress * Math.PI * 2 + i * Math.PI * 2 / 4;
          const cx = f.x + Math.cos(a) * (f.radius + 42), cy = f.y + Math.sin(a) * (f.radius + 42);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(a + Math.PI / 2);
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.lineCap = "round";
          ctx.beginPath(); ctx.arc(0, 0, 11, -Math.PI * 0.65, Math.PI * 0.65); ctx.stroke();
          ctx.beginPath(); ctx.arc(5, 0, 8, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
      if (f.p.id === "black-6-2" && f.spinUntil && performance.now() / 1000 < f.spinUntil) {
        ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = 3;
        const t = performance.now() / 80;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc(f.x, f.y, f.radius + 12 + i * 5, t + i * 2.1, t + i * 2.1 + 1.5); ctx.stroke();
        }
        ctx.restore();
      }
      if (f.p.id === "ruka-1-1") {
        const a = f.clubAngle || 0;
        const bx = f.x + Math.cos(a) * (f.radius + 6), by = f.y + Math.sin(a) * (f.radius + 6);
        const ex = f.x + Math.cos(a) * (f.radius + 54), ey = f.y + Math.sin(a) * (f.radius + 54);
        ctx.save();
        ctx.strokeStyle = "#e8c47a"; ctx.lineWidth = 6; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        const px = Math.cos(a + Math.PI / 2), py = Math.sin(a + Math.PI / 2);
        ctx.lineWidth = 4;
        for (const k of [-9, 0, 9]) {
          ctx.beginPath();
          ctx.moveTo(ex + px * k, ey + py * k);
          ctx.lineTo(ex + Math.cos(a) * 12 + px * k, ey + Math.sin(a) * 12 + py * k);
          ctx.stroke();
        }
        ctx.restore();
      }
      drawStatusFx(f);
      ctx.restore();
    }

    function drawEffects() {
      for (const e of state.effects) {
        ctx.save();
        ctx.globalAlpha = clamp(e.life / 0.8, 0, 1);
        ctx.fillStyle = e.color;
        ctx.font = "700 16px 'Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(e.text, e.x, e.y);
        ctx.restore();
      }
    }

    function draw() {
      if (!ctx) return;
      drawArena();
      drawHeals();
      drawTraps();
      drawFighter(fighter("a"));
      drawFighter(fighter("b"));
      for (const ally of state.allies) if (ally.hp > 0) drawFighter(ally);
      drawLasers();
      drawProjectiles();
      drawClones();
      drawEffects();
    }

    function resize() {
      if (!canvas || !stageWrap) return;
      const rect = stageWrap.getBoundingClientRect();
      const width = Math.max(280, rect.width);
      const height = Math.max(180, rect.height || width * H / W);
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.height = "100%";
    }

    function loop(ts) {
      if (!state.alive) return;
      if (!last) last = ts;
      const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
      last = ts;
      if (!state.paused) update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }

    buildRoster();
    applyDefaultPicks();
    updateSetup();
    resize();
    global.addEventListener("resize", resize);
    raf = requestAnimationFrame(loop);

    root.querySelectorAll("[data-ar-mode]").forEach(btn => btn.addEventListener("click", () => {
      if (state.phase !== "setup") return;
      state.mode = btn.dataset.arMode === "2v2" ? "2v2" : "1v1";
      applyDefaultPicks();
      audio.sfx("select");
      updateSetup();
    }));
    const chainBtn = root.querySelector("[data-ar-chain]");
    if (chainBtn) chainBtn.addEventListener("click", () => {
      if (state.phase !== "setup") return;
      state.chain = !state.chain;
      state.chainActive = false;
      state.chainStreak = 0;
      audio.sfx("click");
      updateSetup();
    });
    root.querySelectorAll("[data-ar-random]").forEach(btn => btn.addEventListener("click", randomPair));
    root.querySelectorAll("[data-ar-guess]").forEach(btn => btn.addEventListener("click", () => chooseGuess(btn.dataset.arGuess)));
    root.querySelectorAll("[data-ar-start]").forEach(btn => btn.addEventListener("click", startMatch));
    root.querySelectorAll(".ar-pick").forEach(card => card.addEventListener("click", () => {
      state.slot = card.dataset.slot;
      updateSetup();
    }));

    const handle = {
      destroy() {
        state.alive = false;
        document.body.classList.remove("arena-mode");
        document.body.classList.remove("time-stop-page");
        cancelAnimationFrame(raf);
        global.removeEventListener("resize", resize);
      },
      pause() { state.paused = true; },
      resume() { state.paused = false; last = 0; },
      restart() {
        if (state.picked.a && state.picked.b && state.guess) startMatch();
        else updateSetup();
      },
      isOver() { return state.phase === "matchEnd"; },
      escape() { return false; }
    };
    try {
      if (new URLSearchParams(location.search).has("debug")) handle._debug = { state, roster, startMatch, startRound, update, finishMatch };
    } catch (e) { /* ignore */ }
    return handle;
  }

  YZ.games.arena = {
    id: "arena",
    no: "05",
    kicker: "GRAND NOAH · ARENA",
    title: "格兰德诺亚竞技场",
    subtitle: "1v1 / 2v2 圆形斗士，三局两胜",
    desc: "从 39 位斗士里选 1v1 或 2v2 阵容，猜哪队赢。圆形场地自动混战：碰撞、射弹、激光、随机陷阱都会造成伤害，先拿两局者胜。",
    emblem: '<img src="img/arena/wk.png" alt="格兰德诺亚竞技场">',
    mount,
    cardStat() { return "39 位斗士 · 1v1 / 2v2"; }
  };
})(window);
