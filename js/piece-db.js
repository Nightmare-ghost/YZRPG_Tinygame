/* ============================================================
   棋子 / 角色名称数据库（四个游戏区域共用）
   ------------------------------------------------------------
   · 象棋类按“每个棋子位”命名：同类型左右两个棋子可以不同名
   · 英雄类按角色位命名：11 级鲁卡、781 位竞猜角色
   · 数据保存在 localStorage；names.html 是可视化编辑程序
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const KEY = "yz_piece_names_v1";

  const CCHESS_CHARS = {
    red: { 1: "帅", 2: "仕", 3: "相", 4: "马", 5: "车", 6: "炮", 7: "兵" },
    black: { 1: "将", 2: "士", 3: "象", 4: "马", 5: "车", 6: "炮", 7: "卒" }
  };
  const CCHESS_ROLES = { 1: "主帅", 2: "近卫", 3: "象卫", 4: "轻骑", 5: "战车", 6: "火炮", 7: "步卒" };
  const CCHESS_COUNTS = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 5 };
  const CHESS_COUNTS = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 };
  const CHESS_GLYPH = { 1: "♟", 2: "♞", 3: "♝", 4: "♜", 5: "♛", 6: "♚" };
  const CHESS_LABEL = { 1: "兵", 2: "马", 3: "象", 4: "车", 5: "后", 6: "王" };

  /* 每个物理棋子的立绘；同名同功能但左右可以不同图 */
  const CCHESS_ART = {
    "red-1-1": ["wk"],
    "red-2-1": ["wp"], "red-2-2": ["wp2"],
    "red-3-1": ["we1"], "red-3-2": ["we2"],
    "red-4-1": ["wh"], "red-4-2": ["wh2"],
    "red-5-1": ["wc2"], "red-5-2": ["wc"],
    "red-6-1": ["wg1"], "red-6-2": ["wg2"],
    "red-7-1": ["ws"], "red-7-2": ["ws"], "red-7-3": ["ws"], "red-7-4": ["ws"], "red-7-5": ["ws"],
    "black-1-1": ["bk"],
    "black-2-1": ["bs1"], "black-2-2": ["bs2"],
    "black-3-1": ["be"], "black-3-2": ["be"],
    "black-4-1": ["bh"], "black-4-2": ["bh"],
    "black-5-1": ["br1"], "black-5-2": ["br2"],
    "black-6-1": ["bc1"], "black-6-2": ["bc2"],
    "black-7-1": ["bp"], "black-7-2": ["bp"], "black-7-3": ["bp"], "black-7-4": ["bp"], "black-7-5": ["bp"]
  };

  const SLOT_CN = ["一", "二", "三", "四", "五", "六", "七", "八"];

  function slotLabel(type, slot, side) {
    const count = (side === "red" || side === "black") ? CCHESS_COUNTS[type] : CHESS_COUNTS[type];
    if (count === 1) return "";
    if (count === 2) return slot === 1 ? "左" : "右";
    return SLOT_CN[slot - 1] || String(slot);
  }

  /* ---------------- 默认名称：直接使用保存下来的名称库数据 ---------------- */
  const SAVED_DEFAULT_NAMES = (YZ.DEFAULT_NAMES || {});
  const CCHESS_DEFAULT_NAMES = Object.assign({}, (SAVED_DEFAULT_NAMES.cchess && SAVED_DEFAULT_NAMES.cchess.pieces) || {});

  /* 国际象棋默认名：阵营+兵种 · 名字。
     名字从当前象棋名称库里取最后一段，所以用户改过象棋名字后，
     国际象棋会跟着用新的名字。 */
  const CHESS_NAME_SOURCE = {
    "white-6-1": "red-1-1", "white-5-1": "red-2-1",
    "white-3-1": "red-3-1", "white-3-2": "red-3-2",
    "white-2-1": "red-6-1", "white-2-2": "red-6-2",
    "white-4-1": "red-5-1", "white-4-2": "red-5-2",
    "black-6-1": "black-1-1", "black-5-1": "black-2-1",
    "black-3-1": "black-3-1", "black-3-2": "black-3-2",
    "black-2-1": "black-6-1", "black-2-2": "black-6-2",
    "black-4-1": "black-5-1", "black-4-2": "black-5-2"
  };
  for (let slot = 1; slot <= 5; slot++) {
    CHESS_NAME_SOURCE["white-1-" + slot] = "red-7-" + slot;
    CHESS_NAME_SOURCE["black-1-" + slot] = "black-7-" + slot;
  }

  function chessNamePart(full) {
    const text = String(full || "").trim();
    if (text.includes(" · ")) return text.split(" · ").pop().trim();
    const parts = text.split(/[·・]/);
    return (parts[parts.length - 1] || "").trim();
  }

  function chessCharName(key, type, slot) {
    const source = CHESS_NAME_SOURCE[key];
    const full = source ? CCHESS_DEFAULT_NAMES[source] : "";
    if (full) return chessNamePart(full) || slotLabel(type, slot, sideOfChessKey(key));
    if (type === 1) return SLOT_CN[slot - 1] || String(slot);
    return slotLabel(type, slot, sideOfChessKey(key));
  }

  function sideOfChessKey(key) {
    return key.indexOf("black-") === 0 ? "black" : "white";
  }

  function chessNameTemplate(army, type, name, sourceFull) {
    const dots = (String(sourceFull || "").match(/[·・]/g) || []).length;
    if (dots >= 2) return army + " · " + CHESS_LABEL[type] + " · " + name;
    return army + CHESS_LABEL[type] + " · " + name;
  }

  const CHESS_DEFAULT_NAMES = Object.assign({}, (SAVED_DEFAULT_NAMES.chess && SAVED_DEFAULT_NAMES.chess.pieces) || {});

  /* 国际象棋势力图：chess/art/<势力英文>/<棋子图>.png
     白/黑两军沿用原有立绘并统一迁入 goddess / demon 目录；
     鲁卡军与卡奥斯军使用新素材。兵共用 soldier 一张。 */
  const CHESS_FACTION_ART = {
    white: { dir: "goddess", pieces: { 1: "soldier", 2: ["hor", "hor2"], 3: ["ele", "ele2"], 4: ["car", "car2"], 5: "queen", 6: "King" } },
    black: { dir: "demon", pieces: { 1: "soldier", 2: ["hor", "hor2"], 3: ["ele", "ele2"], 4: ["car", "car2"], 5: "queen", 6: "King" } },
    ruka: { dir: "ruka", pieces: { 1: "soldier", 2: ["hor", "hor2"], 3: ["ele", "ele2"], 4: ["car", "car2"], 5: "queen", 6: "King" } },
    chaos: { dir: "chaos", pieces: { 1: "soldier", 2: ["hor", "hor2"], 3: ["ele", "ele2"], 4: ["car", "car2"], 5: "queen", 6: "King" } }
  };
  const CHESS_FACTION_ARMY = {
    white: "女神军", black: "邪神军", ruka: "鲁卡军", chaos: "卡奥斯军"
  };
  const CHESS_FACTION_KING = { ruka: "鲁卡", chaos: "卡奥斯" };

  const SUIKA_COLORS = [
    { light: "#ffd0c4", color: "#e85d5d", dark: "#9e2938" },
    { light: "#ffd4a3", color: "#ef8f3a", dark: "#a85318" },
    { light: "#fff2a6", color: "#e8c94a", dark: "#9f8322" },
    { light: "#e8ffa8", color: "#9fd65f", dark: "#5f9029" },
    { light: "#b8ffd9", color: "#4fc48a", dark: "#237c52" },
    { light: "#b6f6f8", color: "#45bfc9", dark: "#1d7f8a" },
    { light: "#b8dcff", color: "#4b9ee8", dark: "#2163a3" },
    { light: "#c4ccff", color: "#5d6fd8", dark: "#33419a" },
    { light: "#e0c4ff", color: "#9662d8", dark: "#5c3198" },
    { light: "#ffc4e6", color: "#d65fa8", dark: "#8f2d6b" },
    { light: "#fff6d6", color: "#e8c07a", dark: "#895a25" }
  ];
  const SUIKA_TONES = ["珊瑚", "橙光", "流金", "青柠", "翡翠", "潮青", "晴空", "靛夜", "紫晶", "品红", "虹核"];
  const SUIKA_DEFAULT_LEVELS = SUIKA_TONES.map((t, i) => "Lv." + (i + 1) + " · " + t);

  /* ---------------- 格兰德诺亚竞技场：斗士战斗参数 ---------------- */
  const ARENA_DIAMETER = 556 * 2 / 3;       // 场地缩小到原来的 2/3
  const ARENA_SPEED = Math.round(ARENA_DIAMETER / 2); // 2 秒走完新的直径
  const ARENA_ATTACKS = {
    none: "无（只靠碰撞）",
    projectile: "射弹",
    laser: "激光",
    trap: "随机陷阱"
  };
  const ARENA_SHAPES = {
    circle: "圆形",
    needle: "针形",
    beam: "激光"
  };
  const ARENA_AIMS = {
    current: "向当前位置",
    front: "向对方前方",
    random: "随机方向",
    four: "四方向",
    eight: "八方向"
  };
  const ARENA_SPECIALS = {
    none: "无",
    reflect: "可反射",
    split: "可分裂",
    clone: "生成分身",
    lifesteal: "可吸血"
  };
  const ARENA_BASE = {
    1: { radius: 26, damage: 18, attack: "laser", shape: "beam", attackSpeed: 500, attackDamage: 15, count: 1, aim: "current", special: "none", range: 700 },
    2: { radius: 20, damage: 13, attack: "trap", shape: "circle", attackSpeed: 0, attackDamage: 13, count: 2, aim: "random", special: "none", range: 0 },
    3: { radius: 23, damage: 15, attack: "laser", shape: "beam", attackSpeed: 500, attackDamage: 13, count: 1, aim: "current", special: "none", range: 680 },
    4: { radius: 19, damage: 17, attack: "projectile", shape: "needle", attackSpeed: 340, attackDamage: 12, count: 1, aim: "front", special: "none", range: 560 },
    5: { radius: 23, damage: 21, attack: "projectile", shape: "circle", attackSpeed: 300, attackDamage: 16, count: 1, aim: "current", special: "none", range: 600 },
    6: { radius: 21, damage: 15, attack: "projectile", shape: "circle", attackSpeed: 360, attackDamage: 14, count: 2, aim: "current", special: "none", range: 520 },
    7: { radius: 16, damage: 10, attack: "trap", shape: "circle", attackSpeed: 0, attackDamage: 11, count: 1, aim: "random", special: "none", range: 0 }
  };
  /* 国际象棋 18 名角色的竞技场数值：按王/后/象/马/车/兵分工，保持现有技能机制 */
  const CHESS_ARENA_STATS = {
    6: { radius: 24, damage: 14, speed: 150, attack: "projectile", shape: "circle", attackSpeed: 340, attackDamage: 8, count: 1, aim: "current", special: "none", range: 540 },
    5: { radius: 21, damage: 12, speed: 175, attack: "projectile", shape: "needle", attackSpeed: 380, attackDamage: 11, count: 1, aim: "current", special: "none", range: 600 },
    3: { radius: 20, damage: 11, speed: 165, attack: "projectile", shape: "circle", attackSpeed: 330, attackDamage: 6, count: 2, aim: "current", special: "none", range: 560 },
    2: { radius: 19, damage: 13, speed: 200, attack: "projectile", shape: "needle", attackSpeed: 360, attackDamage: 8, count: 1, aim: "current", special: "none", range: 520 },
    4: { radius: 23, damage: 16, speed: 145, attack: "laser", shape: "beam", attackSpeed: 500, attackDamage: 16, count: 1, aim: "current", special: "none", range: 640 },
    1: { radius: 16, damage: 8, speed: 205, attack: "projectile", shape: "circle", attackSpeed: 300, attackDamage: 5, count: 1, aim: "current", special: "none", range: 500 }
  };
  const CHESS_ARENA_SKILLS = {
    "ruka-6-1": "搏命的半天使勇者——初始伤害 15；血量每降低 10%，攻击力提升 5。"
    /* 其余 17 名角色的技能描述等待填入，不自行命名或编造效果。 */
  };

  const ARENA_LIMITS = {
    radius: [12, 40],
    damage: [4, 40],
    speed: [40, 400],
    attackSpeed: [80, 700],
    attackDamage: [2, 80],
    count: [1, 8],
    range: [80, 1000]
  };

  function clampArenaNumber(value, key, fallback) {
    const lim = ARENA_LIMITS[key] || [0, 999];
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(lim[0], Math.min(lim[1], Math.round(n)));
  }

  function stripArenaName(full) {
    const text = String(full || "").trim();
    if (!text) return "";
    if (text.includes(" · ")) return text.split(" · ").pop().trim();
    const parts = text.split(/[·・]/);
    return (parts[parts.length - 1] || text).trim();
  }

  const ARENA_HEAD = {
    "red-6-2": "img/arena/wg2-both.png"
  };

  const ARENA_FULL_ART = {
    "red-1-1": "img/chess/art/arena-wk.png",
    "red-2-1": "img/chess/art/arena-wp.png",
    "red-2-2": "img/chess/art/arena-wp2.png",
    "red-3-1": "img/chess/art/arena-we1.png",
    "red-3-2": "img/chess/art/arena-we2.png",
    "red-4-1": "img/chess/art/arena-wh.png",
    "red-4-2": "img/chess/art/arena-wh2.png",
    "red-5-1": "img/chess/art/arena-wc2.png",
    "red-5-2": "img/chess/art/arena-wc.png",
    "red-6-1": "img/chess/art/arena-wg1.png",
    "red-6-2": "img/chess/art/arena-wg2.png",
    "red-7-3": "img/chess/art/arena-ws.png",
    "black-1-1": "img/chess/art/arena-bk.png",
    "black-2-1": "img/chess/art/arena-bs1.png",
    "black-2-2": "img/chess/art/arena-bs2.png",
    "black-3-1": "img/chess/art/arena-be.png",
    "black-4-1": "img/chess/art/arena-bh.png",
    "black-5-1": "img/chess/art/arena-br1.png",
    "black-6-1": "img/chess/art/arena-bc1.png",
    "black-6-2": "img/chess/art/arena-bc2.png",
    "black-7-3": "img/chess/art/arena-bp.png"
  };

  function arenaFullArt(side, type, slot, faction) {
    const key = side + "-" + type + "-" + slot;
    if (ARENA_FULL_ART[key]) return ARENA_FULL_ART[key];
    const chessSide = side === "red" ? "white" : "black";
    const spec = CHESS_FACTION_ART[faction || chessSide] || CHESS_FACTION_ART[chessSide];
    const typeMap = { 1: 6, 2: 5, 3: 3, 4: 2, 5: 4, 6: 2, 7: 1 };
    const ct = typeMap[type] || 1;
    const file = spec.pieces[ct];
    if (!file) return "";
    const name = Array.isArray(file) ? file[0] : file;
    return "img/chess/art/" + spec.dir + "/" + name + ".png";
  }

  function defaultArenaFighter(side, type, slot, name) {
    const b = ARENA_BASE[type] || ARENA_BASE[7];
    return {
      name: stripArenaName(name),
      radius: b.radius,
      damage: b.damage + (slot % 2 === 0 ? 1 : 0),
      speed: ARENA_SPEED,
      attack: b.attack,
      shape: b.shape,
      attackSpeed: b.attackSpeed,
      attackDamage: b.attackDamage,
      count: b.count,
      aim: b.aim,
      special: b.special,
      range: b.range,
      skill: ""
    };
  }

  function buildArenaFighters() {
    const fighters = {};
    const seen = new Set();
    const removed = new Set(["red-7-1", "red-7-2", "red-7-4", "red-7-5", "black-4-2", "black-5-2", "black-7-1", "black-7-2", "black-7-4", "black-7-5"]);
    const removedNames = new Set(["炽天使伊甸分身", "六祖蛭虫分身", "六祖魅凪·残影"]);
    for (const side of ["red", "black"]) {
      for (const type of [1, 2, 3, 4, 5, 6, 7]) {
        const count = CCHESS_COUNTS[type];
        for (let slot = 1; slot <= count; slot++) {
          const key = side + "-" + type + "-" + slot;
          if (removed.has(key)) continue;
          const full = CCHESS_DEFAULT_NAMES[key] || key;
          const name = stripArenaName(full);
          if (!name || removedNames.has(name) || seen.has(name)) continue;
          seen.add(name);
          fighters[key] = defaultArenaFighter(side, type, slot, full);
        }
      }
    }
    /* 国际象棋新增阵营的 18 名角色：王/后/双象/双马/双车/兵 */
    const chessPattern = [[6, 1], [5, 1], [3, 1], [3, 2], [2, 1], [2, 2], [4, 1], [4, 2], [1, 1]];
    for (const faction of ["ruka", "chaos"]) {
      const teamSide = faction === "ruka" ? "red" : "black";
      const chessSide = faction === "ruka" ? "white" : "black";
      for (const [type, slot] of chessPattern) {
        const key = faction + "-" + type + "-" + slot;
        const role = CHESS_LABEL[type] || "棋子";
        const pieceName = type === 6 ? CHESS_FACTION_KING[faction] : role;
        const army = CHESS_FACTION_ARMY[faction];
        const base = defaultArenaFighter(teamSide, type, slot, pieceName);
        Object.assign(base, CHESS_ARENA_STATS[type]);
        if (key === "ruka-6-1") base.attackDamage = 15;
        base.chessFaction = faction;
        base.chessSide = chessSide;
        base.head = "img/arena/" + key + ".png";
        base.name = pieceName;
        base.displayName = pieceName;
        base.skill = CHESS_ARENA_SKILLS[key] || "";
        fighters[key] = base;
      }
    }
    const saved = SAVED_DEFAULT_NAMES.arena;
    if (saved && saved.fighters && typeof saved.fighters === "object") {
      for (const key of Object.keys(fighters)) {
        const a = saved.fighters[key];
        if (!a || typeof a !== "object") continue;
        const base = fighters[key];
        fighters[key] = Object.assign({}, base, {
          name: String(a.name || base.name).trim() || base.name,
          radius: clampArenaNumber(a.radius, "radius", base.radius),
          damage: clampArenaNumber(a.damage, "damage", base.damage),
          speed: clampArenaNumber(a.speed, "speed", base.speed),
          attack: ARENA_ATTACKS[a.attack] ? a.attack : base.attack,
          shape: ARENA_SHAPES[a.shape] ? a.shape : base.shape,
          attackSpeed: clampArenaNumber(a.attackSpeed, "attackSpeed", base.attackSpeed),
          attackDamage: clampArenaNumber(a.attackDamage, "attackDamage", base.attackDamage),
          count: clampArenaNumber(a.count, "count", base.count),
          aim: ARENA_AIMS[a.aim] ? a.aim : base.aim,
          special: ARENA_SPECIALS[a.special] ? a.special : base.special,
          range: clampArenaNumber(a.range, "range", base.range),
          skill: String(a.skill || "").trim()
        });
        const merged = fighters[key];
        if (base.chessFaction) {
          const type = Number(key.split("-")[1]) || 0;
          const army = CHESS_FACTION_ARMY[base.chessFaction];
          merged.displayName = merged.name;
        }
      }
    }
    return fighters;
  }

  function buildDefaults() {
    const monsterNames = {};
    if (YZ.guessData && YZ.guessData.length) {
      for (const m of YZ.guessData) monsterNames[m.id] = m.name;
    }
    return {
      version: 3,
      cchess: {
        armies: Object.assign({ red: "女神军", black: "邪神军" }, (SAVED_DEFAULT_NAMES.cchess && SAVED_DEFAULT_NAMES.cchess.armies) || {}),
        pieces: Object.assign({}, CCHESS_DEFAULT_NAMES)
      },
      chess: {
        armies: Object.assign({ white: "女神军", black: "邪神军" }, (SAVED_DEFAULT_NAMES.chess && SAVED_DEFAULT_NAMES.chess.armies) || {}),
        pieces: Object.assign({}, CHESS_DEFAULT_NAMES),
        custom: Object.assign({}, (SAVED_DEFAULT_NAMES.chess && SAVED_DEFAULT_NAMES.chess.custom) || {})
      },
      suika: { levels: ((SAVED_DEFAULT_NAMES.suika && SAVED_DEFAULT_NAMES.suika.levels) || SUIKA_DEFAULT_LEVELS).slice() },
      monster: { names: Object.assign({}, (SAVED_DEFAULT_NAMES.monster && SAVED_DEFAULT_NAMES.monster.names) || monsterNames) },
      arena: { version: 10, fighters: buildArenaFighters() }
    };
  }

  const DEFAULTS = buildDefaults();

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function buildChessNames(out) {
    const names = {};
    for (const side of ["white", "black"]) {
      const army = (out.chess.armies && out.chess.armies[side]) || (side === "white" ? "女神军" : "邪神军");
      for (const type of [1, 2, 3, 4, 5, 6]) {
        const count = CHESS_COUNTS[type];
        for (let slot = 1; slot <= count; slot++) {
          const key = side + "-" + type + "-" + slot;
          const source = CHESS_NAME_SOURCE[key];
          const full = source ? ((out.cchess.pieces && out.cchess.pieces[source]) || CCHESS_DEFAULT_NAMES[source] || "") : "";
          const name = full ? chessNamePart(full) : (type === 1 ? (SLOT_CN[slot - 1] || String(slot)) : slotLabel(type, slot, side));
          names[key] = chessNameTemplate(army, type, name, full);
        }
      }
    }
    return names;
  }

  function legacyChessName(value) {
    const v = String(value || "").trim();
    if (!v) return false;
    if (/^(女神军|邪神军) · (王|后|车|象|马|兵)( · (左|右|一|二|三|四|五|六|七|八))?$/.test(v)) return true;
    if (/^(红|黑)(帅|仕|相|马|车|炮|兵|将|士|象|卒) · /.test(v)) return true;
    if (v.split("·").length >= 4) return true;
    return false;
  }

  function normalize(saved) {
    const out = clone(DEFAULTS);
    if (!saved || typeof saved !== "object") return out;
    const mergePieces = (game, srcPieces) => {
      if (!srcPieces || typeof srcPieces !== "object") return;
      for (const key of Object.keys(out[game].pieces)) {
        const legacy = key.replace(/-\d+$/, "");
        let value = (typeof srcPieces[key] === "string" && srcPieces[key]) ||
          (key.endsWith("-1") && typeof srcPieces[legacy] === "string" && srcPieces[legacy]) || "";
        const oldChessDefaults = new Set([
          "红炮 · 左", "黑炮 · 赤狐",
          "红仕 · 左", "红仕 · 右", "红炮 · 右",
          "黑士 · 夜翼", "黑士 · 霜角", "黑炮 · 金尾",
          "红马 · 左", "红马 · 右", "黑马 · 魅翼", "黑马 · 梦魇",
          "红相 · 左", "红相 · 右", "黑象 · 澜灵", "黑象 · 潮息"
        ]);
        if (game === "chess" && (
          /^(女神军|邪神军) · (王|后|车|象|马|兵)( · (左|右|一|二|三|四|五|六|七|八))?$/.test(value.trim()) ||
          /^(女神军|邪神军) · (王|后|车|象|马|兵) · (左|右|一|二|三|四|五|六|七|八)$/.test(value.trim()) ||
          /^(红|黑)(帅|仕|相|马|车|炮|兵|将|士|象|卒) · /.test(value.trim()) ||
          oldChessDefaults.has(value.trim())
        )) {
          value = "";
        }
        if (value && value.trim()) out[game].pieces[key] = value.trim();
      }
    };
    for (const game of ["cchess", "chess"]) {
      const src = saved[game];
      if (!src) continue;
      if (src.armies && typeof src.armies === "object") {
        for (const side of Object.keys(out[game].armies)) {
          if (typeof src.armies[side] === "string" && src.armies[side].trim()) out[game].armies[side] = src.armies[side].trim();
        }
      }
      if (game === "chess" && src.custom && typeof src.custom === "object") {
        for (const key of Object.keys(src.custom)) if (src.custom[key]) out.chess.custom[key] = true;
      }
      mergePieces(game, src.pieces);
    }
    const dynamicChess = buildChessNames(out);
    for (const key of Object.keys(out.chess.pieces)) {
      if (!out.chess.custom[key]) out.chess.pieces[key] = dynamicChess[key];
    }
    if (saved.suika && Array.isArray(saved.suika.levels)) {
      for (let i = 0; i < out.suika.levels.length; i++) {
        if (typeof saved.suika.levels[i] === "string" && saved.suika.levels[i].trim()) out.suika.levels[i] = saved.suika.levels[i].trim();
      }
    }
    if (saved.monster && saved.monster.names && typeof saved.monster.names === "object") {
      for (const id of Object.keys(out.monster.names)) {
        if (typeof saved.monster.names[id] === "string" && saved.monster.names[id].trim()) out.monster.names[id] = saved.monster.names[id].trim();
      }
    }
    if (saved.arena && saved.arena.fighters && typeof saved.arena.fighters === "object") {
      for (const key of Object.keys(out.arena.fighters)) {
        const a = saved.arena.fighters[key];
        if (!a || typeof a !== "object") continue;
        const base = out.arena.fighters[key];
        out.arena.fighters[key] = Object.assign({}, base, {
          name: String(a.name || base.name).trim() || base.name,
          radius: clampArenaNumber(a.radius, "radius", base.radius),
          damage: clampArenaNumber(a.damage, "damage", base.damage),
          speed: clampArenaNumber(a.speed, "speed", base.speed),
          attack: ARENA_ATTACKS[a.attack] ? a.attack : base.attack,
          shape: ARENA_SHAPES[a.shape] ? a.shape : base.shape,
          attackSpeed: clampArenaNumber(a.attackSpeed, "attackSpeed", base.attackSpeed),
          attackDamage: clampArenaNumber(a.attackDamage, "attackDamage", base.attackDamage),
          count: clampArenaNumber(a.count, "count", base.count),
          aim: ARENA_AIMS[a.aim] ? a.aim : base.aim,
          special: ARENA_SPECIALS[a.special] ? a.special : base.special,
          range: clampArenaNumber(a.range, "range", base.range),
          skill: String(a.skill || "").trim()
        });
        const merged = out.arena.fighters[key];
        if (base.chessFaction) {
          const type = Number(key.split("-")[1]) || 0;
          const army = CHESS_FACTION_ARMY[base.chessFaction];
          merged.displayName = merged.name;
        }
      }
    }
    return out;
  }

  let data = normalize(YZ.storage ? YZ.storage.get(KEY, null) : null);

  const db = {
    KEY,
    meta: {
      cchessChars: CCHESS_CHARS,
      cchessRoles: CCHESS_ROLES,
      cchessCounts: CCHESS_COUNTS,
      chessCounts: CHESS_COUNTS,
      cchessArt: CCHESS_ART,
      chessArt: CHESS_FACTION_ART,
      chessGlyph: CHESS_GLYPH,
      chessLabel: CHESS_LABEL,
      suikaColors: SUIKA_COLORS,
      suikaTones: SUIKA_TONES,
      arenaAttacks: ARENA_ATTACKS,
      arenaShapes: ARENA_SHAPES,
      arenaAims: ARENA_AIMS,
      arenaSpecials: ARENA_SPECIALS,
      arenaLimits: ARENA_LIMITS,
      arenaDiameter: ARENA_DIAMETER,
      slotLabel
    },
    defaults: DEFAULTS,
    get() { return data; },
    reload() {
      data = normalize(YZ.storage ? YZ.storage.get(KEY, null) : null);
      return data;
    },
    save(next) {
      data = normalize(next);
      try {
        if (YZ.storage) YZ.storage.set(KEY, data);
        else localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) { /* ignore */ }
      return data;
    },
    reset() {
      data = clone(DEFAULTS);
      try {
        if (YZ.storage) YZ.storage.remove(KEY);
        else localStorage.removeItem(KEY);
      } catch (e) { /* ignore */ }
      return data;
    },
    army(game, side) {
      const g = data[game];
      return (g && g.armies && g.armies[side]) || (game === "cchess" ? (side === "red" ? "女神军" : "邪神军") : (side === "white" ? "女神军" : "邪神军"));
    },
    cchessName(side, type, slot) {
      return data.cchess.pieces[side + "-" + type + "-" + slot] || CCHESS_DEFAULT_NAMES[side + "-" + type + "-" + slot] || "";
    },
    chessName(side, type, slot, faction) {
      const key = side + "-" + type + "-" + slot;
      if (faction === "ruka" || faction === "chaos") {
        const custom = data.chess.pieces[faction + "-" + type + "-" + slot];
        if (custom) return custom;
        const slots = { 1: [1], 2: [1, 2], 3: [1, 2], 4: [1, 2], 5: [1], 6: [1] }[type] || [1];
        const arenaKey = faction + "-" + type + "-" + slots[Math.max(0, Math.min(slots.length - 1, slot - 1))];
        const arena = SAVED_DEFAULT_NAMES.arena && SAVED_DEFAULT_NAMES.arena.fighters && SAVED_DEFAULT_NAMES.arena.fighters[arenaKey];
        const piece = (arena && arena.name) || (type === 6 ? CHESS_FACTION_KING[faction] : (CHESS_LABEL[type] || ""));
        return CHESS_FACTION_ARMY[faction] + " · " + piece;
      }
      return data.chess.pieces[key] || CHESS_DEFAULT_NAMES[key] || "";
    },
    suikaName(tier) {
      return data.suika.levels[tier] || ("Lv." + (tier + 1));
    },
    monsterName(id) {
      return (data.monster.names && data.monster.names[id]) || id;
    },
    arenaAttackLabel(id) { return ARENA_ATTACKS[id] || ARENA_ATTACKS.none; },
    arenaShapeLabel(id) { return ARENA_SHAPES[id] || ARENA_SHAPES.circle; },
    arenaAimLabel(id) { return ARENA_AIMS[id] || ARENA_AIMS.current; },
    arenaSpecialLabel(id) { return ARENA_SPECIALS[id] || ARENA_SPECIALS.none; },
    arenaRoster() {
      const out = [];
      const fighters = (data.arena && data.arena.fighters) || {};
      for (const id of Object.keys(fighters)) {
        const parts = id.split("-");
        const side = parts[0], type = Number(parts[1]), slot = Number(parts[2]);
        const f = fighters[id];
        if (f.chessFaction) {
          const army = CHESS_FACTION_ARMY[f.chessFaction];
          const role = CHESS_LABEL[type] || "棋子";
          const art = this.chessArt(f.chessSide, type, slot, f.chessFaction);
          const fullArt = art ? "img/chess/art/" + art + ".png" : "";
          out.push({
            id, key: id, side: f.chessFaction === "ruka" ? "red" : "black", type, slot,
            name: f.name || "",
            displayName: f.displayName || f.name || role,
            army, char: "", role,
            art, head: f.head || fullArt, fullArt,
            chessFaction: f.chessFaction, chessSide: f.chessSide,
            stats: Object.assign({}, f)
          });
          continue;
        }
        const art = this.cchessArt(side, type, slot);
        out.push({
          id, key: id, side, type, slot,
          name: f.name,
          displayName: f.name,
          army: this.army("cchess", side),
          char: this.cchessChar(side, type),
          role: CCHESS_ROLES[type],
          art,
          head: ARENA_HEAD[id] || (art ? "img/arena/" + art + ".png" : ""),
          fullArt: arenaFullArt(side, type, slot),
          stats: Object.assign({}, f)
        });
      }
      return out;
    },
    cchessArt(side, type, slot, variant) {
      const list = CCHESS_ART[side + "-" + type + "-" + slot];
      if (!list || !list.length) return null;
      return list[Math.abs(variant || 0) % list.length];
    },
    chessArt(side, type, slot, faction) {
      const spec = CHESS_FACTION_ART[faction || side] || CHESS_FACTION_ART[side];
      if (!spec) return null;
      const file = spec.pieces[type];
      if (!file) return null;
      const name = Array.isArray(file) ? file[Math.max(0, (slot - 1) % file.length)] : file;
      return spec.dir + "/" + name;
    },
    cchessChar(side, type) { return (CCHESS_CHARS[side] || {})[type] || ""; },
    chessGlyph(type) { return CHESS_GLYPH[type] || ""; },
    slotLabel
  };

  YZ.pieceDB = db;
})(window);
