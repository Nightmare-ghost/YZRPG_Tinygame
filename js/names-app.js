/* ============================================================
   名称数据库编辑器
   ============================================================ */
(function () {
  "use strict";
  const YZ = window.YZ;
  const db = YZ.pieceDB;
  const $ = YZ.$;
  const esc = YZ.util.escapeHtml;
  const clone = o => JSON.parse(JSON.stringify(o));

  let working = clone(db.get());
  let active = "cchess";
  let dirty = false;
  let resetArmed = false;
  let monsterPage = 0;
  let monsterQuery = "";
  let arenaOpen = "";
  const GUESS_COUNT = (YZ.guessData || []).length;

  const TABS = [
    { id: "cchess", name: "圣魔大战", sub: "32 个棋子位", icon: "圣", color: "#ff6aa8" },
    { id: "chess", name: "混沌乱战", sub: "32 个棋子位", icon: "♞", color: "#7b8cf0" },
    { id: "suika", name: "合成大鲁卡", sub: "11 级鲁卡", icon: "●", color: "#4fc48a" },
    { id: "monster", name: "勇一把", sub: GUESS_COUNT + " 位角色", icon: "?", color: "#b07ad8" },
    { id: "arena", name: "格兰德诺亚", sub: "斗士参数", icon: "⚔", color: "#d9a441" }
  ];

  YZ.settings.load();
  YZ.initBackground();

  function cchessArtCount() {
    let n = 0;
    for (const side of ["red", "black"]) {
      for (let t = 1; t <= 7; t++) {
        for (let slot = 1; slot <= db.meta.cchessCounts[t]; slot++) {
          if (db.cchessArt(side, t, slot)) n++;
        }
      }
    }
    return n;
  }

  function chessArtCount() {
    let n = 0;
    for (const side of ["white", "black"]) {
      for (let t = 1; t <= 6; t++) {
        for (let slot = 1; slot <= db.meta.chessCounts[t]; slot++) {
          if (db.chessArt(side, t, slot)) n++;
        }
      }
    }
    return n;
  }

  function renderSummary() {
    const art = cchessArtCount();
    const chessArt = chessArtCount();
    const items = [
      { color: "rgba(255,120,180,.16)", ink: "#ff4f97", n: 32, title: "圣魔大战", sub: "32 个棋子位 · " + art + " 个有立绘" },
      { color: "rgba(123,140,240,.16)", ink: "#6574e8", n: 32, title: "国际象棋", sub: "32 个棋子位 · " + chessArt + " 个有立绘" },
      { color: "rgba(79,196,138,.16)", ink: "#2f9e6b", n: 11, title: "合成大鲁卡", sub: "11 个等级名 · 头像图标" },
      { color: "rgba(176,122,216,.16)", ink: "#8e59bd", n: GUESS_COUNT, title: "猜魔物娘", sub: GUESS_COUNT + " 位角色名 · 竞猜数据" },
      { color: "rgba(217,164,65,.18)", ink: "#b57c1f", n: db.arenaRoster().length, title: "格兰德诺亚", sub: db.arenaRoster().length + " 位斗士 · 永久参数" }
    ];
    $("#names-summary").innerHTML = items.map(it =>
      '<div class="names-stat" style="--stat-color:' + it.color + ';--stat-ink:' + it.ink + '">' +
      '<div class="n">' + it.n + "</div><strong>" + it.title + "</strong><small>" + it.sub + "</small></div>"
    ).join("");
  }

  function renderTabs() {
    $("#names-tabs").innerHTML = TABS.map(t =>
      '<button class="names-tab' + (t.id === active ? " active" : "") + '" data-tab="' + t.id + '" role="tab" aria-selected="' + (t.id === active) + '">' +
      '<span class="tab-ico" style="--tab-color:' + t.color + '">' + t.icon + "</span>" +
      '<span class="tab-copy"><strong>' + t.name + "</strong><small>" + t.sub + "</small></span></button>"
    ).join("");
    $("#names-tabs").querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => { active = btn.dataset.tab; renderTabs(); renderPanel(); });
    });
  }

  function panelHead(title, sub, right) {
    return '<div class="names-panel-head"><div><h2>' + title + "</h2><p>" + sub + "</p></div>" +
      '<span class="art-count">' + right + "</span></div>";
  }

  function armyField(game, side, label, colorClass) {
    const value = working[game].armies[side] || "";
    return '<div class="army-field"><span class="army-dot" style="background:' +
      (side === "red" || side === "white" ? "#f4c74e" : "#8a63c9") + '"></span>' +
      '<label>' + label + "</label>" +
      '<input data-kind="army" data-game="' + game + '" data-side="' + side + '" maxlength="20" value="' + esc(value) + '"></div>';
  }

  function cchessPanel() {
    let rows = "";
    let artCount = 0;
    for (const side of ["red", "black"]) {
      for (let t = 1; t <= 7; t++) {
        const count = db.meta.cchessCounts[t];
        for (let slot = 1; slot <= count; slot++) {
          const key = side + "-" + t + "-" + slot;
          const art = db.cchessArt(side, t, slot);
          if (art) artCount++;
          const ch = db.cchessChar(side, t);
          const role = db.meta.cchessRoles[t] || "";
          const army = working.cchess.armies[side] || "";
          const val = working.cchess.pieces[key] || "";
          const slotText = db.slotLabel(t, slot, side);
          const preview = art
            ? '<img src="img/Cchess/art/' + art + '.png" alt="' + esc(ch) + '">'
            : '<span class="preview-empty">暂无立绘<br>代码占位</span>';
          rows += '<div class="name-row">' +
            '<div class="name-preview">' + preview + "</div>" +
            '<div class="name-info"><div class="name-meta"><span class="side-tag ' + (side === "red" ? "goddess" : "evil") + '">' + esc(army) + "</span>" +
            '<span class="type-tag">' + ch + " · " + role + (slotText ? " · " + slotText : "") + "</span></div>" +
            '<input data-kind="cchess-piece" data-side="' + side + '" data-type="' + t + '" data-slot="' + slot + '" maxlength="40" value="' + esc(val) + '" aria-label="' + ch + slotText + '名称">' +
            "<small>" + (art ? "立绘：img/Cchess/art/" + art + ".png" : "未提供立绘，棋盘上使用代码棋子") + "</small></div></div>";
        }
      }
    }
    return panelHead("圣魔大战 · 棋子名册", "按每个棋子位分别命名：同类型左右两个棋子（士、象、马、车、炮）可以不同名，五个兵也各有名字。", artCount + " / 32 有立绘") +
      '<div class="names-panel">' +
      '<div class="names-note"><b>说明：</b>女神军 16 个棋子位已全部有图（新增白车 WC，五个兵共用 WS），邪神军 16 个也齐全；名字会跟着棋子移动，不会因为走到另一边而换名。</div>' +
      '<div class="names-armies">' + armyField("cchess", "red", "女神军名称", "goddess") + armyField("cchess", "black", "邪神军名称", "evil") + "</div>" +
      '<div class="names-grid">' + rows + "</div></div>";
  }

  function chessPanel() {
    let rows = "";
    let artCount = 0;
    for (const side of ["white", "black"]) {
      for (let t = 1; t <= 6; t++) {
        const count = db.meta.chessCounts[t];
        for (let slot = 1; slot <= count; slot++) {
          const glyph = db.meta.chessGlyph[t];
          const label = db.meta.chessLabel[t];
          const army = working.chess.armies[side] || "";
          const val = working.chess.pieces[side + "-" + t + "-" + slot] || "";
          const slotText = db.slotLabel(t, slot, side);
          const art = db.chessArt(side, t, slot);
          if (art) artCount++;
          const preview = art
            ? '<img src="img/chess/art/' + art + '.png" alt="' + label + '">'
            : '<span class="preview-glyph' + (side === "black" ? " dark" : "") + '">' + glyph + "</span>";
          rows += '<div class="name-row"><div class="name-preview">' + preview + "</div>" +
            '<div class="name-info"><div class="name-meta"><span class="side-tag ' + (side === "white" ? "goddess" : "evil") + '">' + esc(army) + "</span>" +
            '<span class="type-tag">' + label + (slotText ? " · " + slotText : "") + "</span></div>" +
            '<input data-kind="chess-piece" data-side="' + side + '" data-type="' + t + '" data-slot="' + slot + '" maxlength="40" value="' + esc(val) + '" aria-label="' + label + slotText + '名称">' +
            "<small>" + (side === "white" ? "白棋 · 女神军" : "黑棋 · 邪神军") + (art ? " · 立绘：img/chess/art/" + art + ".png" : "") + "</small></div></div>";
        }
      }
    }
    return panelHead("混沌乱战 · 棋子名册", "按每个棋子位分别命名；默认格式：女神军/邪神军 + 棋子名 · 象棋里的名字；默认跟着象棋名称库联动，手动改过的棋子会锁定为自定义。左右两个车、象、马可以不同名，八个兵也各有名字。", artCount + " / 32 有立绘") +
      '<div class="names-panel">' +
      '<div class="names-note"><b>说明：</b>国际象棋：王←帅/将，白后←P（WP），黑后←BP1 去底图（沙蛇），P2 不用；马复制象棋炮位的图和名字，象←相，车←车，兵按颜色共用同一张（白 WS / 黑 BP）；右上角保留棋子类型符号。图片已裁掉底部底座。</div>' +
      '<div class="names-armies">' + armyField("chess", "white", "女神军名称", "goddess") + armyField("chess", "black", "邪神军名称", "evil") + "</div>" +
      '<div class="names-grid">' + rows + "</div></div>";
  }

  function suikaPanel() {
    let rows = "";
    for (let i = 0; i < 11; i++) {
      const c = db.meta.suikaColors[i];
      const val = working.suika.levels[i] || "";
      rows += '<div class="name-row"><div class="name-preview">' +
        '<span class="preview-ball" style="background:radial-gradient(circle at 32% 28%,' + c.light + "," + c.color + " 58%," + c.dark + ')">' + (i + 1) + "</span></div>" +
        '<div class="name-info"><div class="name-meta"><span class="side-tag">第 ' + (i + 1) + ' 级</span><span class="type-tag">' + (i === 10 ? "最大等级" : "鲁卡球") + "</span></div>" +
        '<input data-kind="suika" data-tier="' + i + '" maxlength="40" value="' + esc(val) + '" aria-label="第 ' + (i + 1) + ' 级名称">' +
        "<small>合成路线、状态栏与 11 级选择界面都会使用这个名字</small></div></div>";
    }
    return panelHead("合成大鲁卡 · 球名册", "11 个等级各自命名；球体使用 img/ball 的 1–11 号图标，名字会同步到合成路线。", "11 / 11 可编辑") +
      '<div class="names-panel">' +
      '<div class="names-note"><b>说明：</b>球体使用 img/ball 的 1–11 号头像图标；改名只影响文字。</div>' +
      '<div class="names-grid">' + rows + "</div></div>";
  }

  function monsterPanel() {
    const all = YZ.guessData || [];
    const q = monsterQuery.trim().toLowerCase();
    const filtered = q ? all.filter(m => {
      const custom = working.monster.names[m.id] || m.name || "";
      return custom.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.race && m.race.toLowerCase().includes(q)) ||
        (m.world && m.world.toLowerCase().includes(q));
    }) : all;
    const perPage = 40;
    const pages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (monsterPage >= pages) monsterPage = pages - 1;
    if (monsterPage < 0) monsterPage = 0;
    const slice = filtered.slice(monsterPage * perPage, monsterPage * perPage + perPage);
    let rows = "";
    for (const m of slice) {
      const val = working.monster.names[m.id] || m.name;
      const initial = (val || m.name || "?").slice(0, 1);
      rows += '<div class="name-row"><div class="name-preview"><span class="preview-glyph">' + esc(initial) + "</span></div>" +
        '<div class="name-info"><div class="name-meta"><span class="side-tag">' + esc(m.race || "未知种族") + "</span>" +
        '<span class="type-tag">' + esc(m.world || "未知世界") + " · CG " + m.cg + " · 形态 " + m.forms + " · 胸 " + m.bust + "</span></div>" +
        '<input data-kind="monster" data-id="' + m.id + '" maxlength="40" value="' + esc(val) + '" aria-label="' + esc(m.name) + '名称">' +
        "<small>原始名称：" + esc(m.name) + " · 名称字数 " + Array.from(String(val).replace(/[\s・·]/g, "")).length + "</small></div></div>";
    }
    if (!slice.length) rows = '<p class="names-empty">没有匹配的角色。</p>';
    return panelHead("勇一把 · 角色名册", "来自 data/guessdata.xlsx 的竞猜数据，共 " + all.length + " 位。名字可改，种族/世界/CG 等属性保持不变。", all.length + " 位角色") +
      '<div class="names-panel">' +
      '<div class="names-note"><b>说明：</b>这里不再使用临时剪影，直接读取竞猜数据。游戏里只显示七项气泡，不显示立绘；名字修改会同步到答案与输入匹配。</div>' +
      '<div class="names-filter">' +
        '<input id="monster-search" type="search" placeholder="搜索名字 / 种族 / 世界…" value="' + esc(monsterQuery) + '">' +
        '<span>共 ' + filtered.length + ' 位 · 第 ' + (monsterPage + 1) + " / " + pages + ' 页</span>' +
        '<button class="mini-btn" data-mpage="-1" ' + (monsterPage === 0 ? "disabled" : "") + ">上一页</button>" +
        '<button class="mini-btn" data-mpage="1" ' + (monsterPage >= pages - 1 ? "disabled" : "") + ">下一页</button>" +
      "</div>" +
      '<div class="names-grid">' + rows + "</div></div>";
  }

  function arenaPanel() {
    const limits = db.meta.arenaLimits || {};
    const attacks = db.meta.arenaAttacks || {};
    const shapes = db.meta.arenaShapes || {};
    const aims = db.meta.arenaAims || {};
    const specials = db.meta.arenaSpecials || {};
    const roster = db.arenaRoster();
    const current = roster.find(p => p.id === arenaOpen) || null;
    const note = '<div class="names-note"><b>永久说明：</b>这里是开发端。改完先「保存修改」，再点右上角「导出默认值」下载 default-names.js；覆盖项目里的 js/default-names.js 并重新打包后，所有玩家都会拿到这套参数。</div>' +
      '<div class="arena-edit-note">默认移动：<b>2 秒走完场地直径</b>，碰壁后反弹。名字已去掉棋子前缀并按角色去重；攻击参数只影响碰撞之外的伤害。</div>';

    if (!current) {
      const avatars = roster.map(p => {
        const f = (working.arena.fighters && working.arena.fighters[p.id]) || p.stats;
        return '<button class="arena-avatar" type="button" data-arena-open="' + p.id + '" title="' + esc(f.name || p.name) + ' · ' + esc(p.role) + '">' +
          '<img src="' + p.head + '" alt="' + esc(f.name || p.name) + '">' +
          "</button>";
      }).join("");
      return panelHead("格兰德诺亚 · 斗士头像墙", "点击头像展开该斗士的完整面板。头像用圣魔大战裁头；展开后显示国际象棋全身图与攻击参数。", roster.length + " 位斗士") +
        '<div class="names-panel">' + note +
        '<div class="arena-avatar-grid">' + avatars + "</div></div>";
    }

    const p = current;
    const f = (working.arena.fighters && working.arena.fighters[p.id]) || p.stats;
    const field = (label, key, min, max, step, value, unit) =>
      '<label class="arena-detail-field"><span>' + label + (unit ? " <em>" + unit + "</em>" : "") + "</span>" +
      '<input type="number" min="' + min + '" max="' + max + '" step="' + step + '" data-kind="arena-field" data-key="' + p.id + '" data-field="' + key + '" value="' + value + '"></label>';
    const select = (label, key, map, value) =>
      '<label class="arena-detail-field"><span>' + label + '</span><select data-kind="arena-select" data-key="' + p.id + '" data-field="' + key + '">' +
      Object.keys(map).map(k => '<option value="' + k + '"' + (value === k ? " selected" : "") + ">" + esc(map[k]) + "</option>").join("") +
      "</select></label>";
    return panelHead("格兰德诺亚 · " + esc(f.name || p.name), "全身图来自象棋立绘；名字、体型、碰撞、移动和攻击都由你定。", "展开编辑") +
      '<div class="names-panel">' + note +
      '<button class="mini-btn arena-back" type="button" data-arena-back>← 返回头像墙</button>' +
      '<div class="arena-detail-main">' +
        '<div class="arena-fullbody"><img src="' + p.fullArt + '" alt="' + esc(f.name || p.name) + '"><span>全身图</span></div>' +
        '<div class="arena-detail-form">' +
          '<label class="arena-name-field"><span>名字（不带棋子前缀）</span><input data-kind="arena-name" data-key="' + p.id + '" maxlength="40" value="' + esc(f.name || p.name) + '"></label>' +
          '<div class="arena-detail-grid">' +
            field("半径", "radius", limits.radius[0], limits.radius[1], 1, f.radius, "") +
            field("碰撞伤害", "damage", limits.damage[0], limits.damage[1], 1, f.damage, "") +
            field("移动速度", "speed", limits.speed[0], limits.speed[1], 1, f.speed, "≈" + ((db.meta.arenaDiameter || 370.67) / f.speed).toFixed(2) + "s/直径") +
            select("攻击方式", "attack", attacks, f.attack) +
            select("弹体形状", "shape", shapes, f.shape) +
            field("弹速", "attackSpeed", limits.attackSpeed[0], limits.attackSpeed[1], 10, f.attackSpeed, "") +
            field("攻击伤害", "attackDamage", limits.attackDamage[0], limits.attackDamage[1], 1, f.attackDamage, "") +
            field("弹体数量", "count", limits.count[0], limits.count[1], 1, f.count, "") +
            select("轨迹", "aim", aims, f.aim) +
            select("特殊", "special", specials, f.special) +
            field("射程", "range", limits.range[0], limits.range[1], 10, f.range, "") +
          "</div>" +
          '<label class="arena-skill-field"><span>技能描述（之后按这里实现）</span>' +
          '<textarea data-kind="arena-skill" data-key="' + p.id + '" rows="3" maxlength="600" placeholder="先留空；之后把角色技能描述填在这里。">' + esc(f.skill || "") + "</textarea></label>" +
          '<p class="arena-detail-tip">四/八方向会覆盖数量；射弹的弹速/射程生效，激光用射程与数量，陷阱用数量与轨迹。特殊：反射只对射弹、分裂只对射弹，分身会复制攻击，吸血对三种攻击都生效。</p>' +
        "</div>" +
      "</div></div>";
  }

  function renderPanel() {
    const panels = { cchess: cchessPanel, chess: chessPanel, suika: suikaPanel, monster: monsterPanel, arena: arenaPanel };
    $("#names-panel-wrap").innerHTML = panels[active]();
    $("#names-panel-wrap").querySelectorAll("input, textarea").forEach(inp => {
      inp.addEventListener("input", onInput);
    });
    const search = $("#monster-search");
    if (search) {
      search.addEventListener("input", () => {
        monsterQuery = search.value;
        monsterPage = 0;
        renderPanel();
        const again = $("#monster-search");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      });
    }
    $("#names-panel-wrap").querySelectorAll("select[data-kind]").forEach(sel => {
      sel.addEventListener("change", onInput);
    });
    $("#names-panel-wrap").querySelectorAll("[data-arena-open]").forEach(btn => {
      btn.addEventListener("click", () => { arenaOpen = btn.dataset.arenaOpen; renderPanel(); });
    });
    $("#names-panel-wrap").querySelectorAll("[data-arena-back]").forEach(btn => {
      btn.addEventListener("click", () => { arenaOpen = ""; renderPanel(); });
    });
    $("#names-panel-wrap").querySelectorAll("[data-mpage]").forEach(btn => {
      btn.addEventListener("click", () => {
        monsterPage += Number(btn.dataset.mpage);
        renderPanel();
      });
    });
  }

  function onInput(e) {
    const inp = e.target;
    const kind = inp.dataset.kind;
    const v = inp.value;
    if (kind === "army") working[inp.dataset.game].armies[inp.dataset.side] = v;
    else if (kind === "cchess-piece") working.cchess.pieces[inp.dataset.side + "-" + inp.dataset.type + "-" + inp.dataset.slot] = v;
    else if (kind === "chess-piece") {
      const key = inp.dataset.side + "-" + inp.dataset.type + "-" + inp.dataset.slot;
      working.chess.pieces[key] = v;
      if (v.trim()) working.chess.custom[key] = true;
      else delete working.chess.custom[key];
    }
    else if (kind === "suika") working.suika.levels[+inp.dataset.tier] = v;
    else if (kind === "monster") working.monster.names[inp.dataset.id] = v;
    else if (kind === "arena-name") {
      if (!working.arena || !working.arena.fighters) working.arena = { version: 2, fighters: {} };
      if (working.arena.fighters[inp.dataset.key]) working.arena.fighters[inp.dataset.key].name = v;
    }
    else if (kind === "arena-field") {
      const lim = (db.meta.arenaLimits || {})[inp.dataset.field] || [0, 999];
      const n = Math.max(lim[0], Math.min(lim[1], Math.round(Number(v) || lim[0])));
      const f = working.arena && working.arena.fighters && working.arena.fighters[inp.dataset.key];
      if (f) f[inp.dataset.field] = n;
    }
    else if (kind === "arena-select") {
      const f = working.arena && working.arena.fighters && working.arena.fighters[inp.dataset.key];
      if (f) f[inp.dataset.field] = v;
    }
    else if (kind === "arena-skill") {
      const f = working.arena && working.arena.fighters && working.arena.fighters[inp.dataset.key];
      if (f) f.skill = v;
    }
    setDirty(true);
    if (kind === "army") {
      const tag = inp.closest(".names-panel").querySelectorAll(".army-field input");
      // 轻量更新同区域的阵营标签，不打断输入焦点
      const sideEls = inp.closest(".names-panel").querySelectorAll(".names-grid .side-tag");
      sideEls.forEach(el => {
        if (el.classList.contains("goddess") && inp.dataset.side === (active === "chess" ? "white" : "red")) el.textContent = v || "女神军";
        if (el.classList.contains("evil") && inp.dataset.side === "black") el.textContent = v || "邪神军";
      });
    }
  }

  function setDirty(v) {
    dirty = v;
    const st = $("#names-status");
    st.textContent = v ? "有未保存的修改" : "已保存 / 未修改";
    st.classList.toggle("dirty", v);
  }

  function save() {
    const next = clone(working);
    // 空名称回退，避免界面出现空白
    for (const game of ["cchess", "chess"]) {
      for (const side of Object.keys(next[game].armies)) if (!next[game].armies[side].trim()) next[game].armies[side] = db.defaults[game].armies[side];
      for (const key of Object.keys(next[game].pieces)) if (!next[game].pieces[key].trim()) next[game].pieces[key] = db.defaults[game].pieces[key];
    }
    for (let i = 0; i < next.suika.levels.length; i++) if (!next.suika.levels[i].trim()) next.suika.levels[i] = db.defaults.suika.levels[i];
    for (const id of Object.keys(next.monster.names)) if (!next.monster.names[id].trim()) next.monster.names[id] = db.defaults.monster.names[id];
    if (!next.arena || !next.arena.fighters) next.arena = { version: 10, fighters: {} };
    next.arena.version = 10;
    const arenaLimits = db.meta.arenaLimits;
    const arenaDefaults = db.defaults.arena.fighters;
    for (const key of Object.keys(arenaDefaults)) {
      const base = arenaDefaults[key];
      const a = next.arena.fighters[key] || {};
      const clampField = (f, fallback) => {
        const lim = arenaLimits[f] || [0, 999];
        const n = Number(a[f]);
        return Number.isFinite(n) ? Math.max(lim[0], Math.min(lim[1], Math.round(n))) : fallback;
      };
      next.arena.fighters[key] = {
        name: String(a.name || base.name).trim() || base.name,
        radius: clampField("radius", base.radius),
        damage: clampField("damage", base.damage),
        speed: clampField("speed", base.speed),
        attack: db.meta.arenaAttacks[a.attack] ? a.attack : base.attack,
        shape: db.meta.arenaShapes[a.shape] ? a.shape : base.shape,
        attackSpeed: clampField("attackSpeed", base.attackSpeed),
        attackDamage: clampField("attackDamage", base.attackDamage),
        count: clampField("count", base.count),
        aim: db.meta.arenaAims[a.aim] ? a.aim : base.aim,
        special: db.meta.arenaSpecials[a.special] ? a.special : base.special,
        range: clampField("range", base.range),
        skill: String(a.skill || "").trim()
      };
    }
    working = db.save(next);
    setDirty(false);
    renderSummary();
    renderTabs();
    renderPanel();
    YZ.toast("已保存到浏览器；分发前记得导出默认值", "good");
  }

  function resetAll() {
    if (!resetArmed) {
      resetArmed = true;
      $("#names-reset").textContent = "再点一次确认";
      setTimeout(() => { resetArmed = false; $("#names-reset").textContent = "恢复默认"; }, 3000);
      return;
    }
    resetArmed = false;
    $("#names-reset").textContent = "恢复默认";
    arenaOpen = "";
    working = clone(db.defaults);
    db.reset();
    working = clone(db.get());
    setDirty(false);
    renderSummary();
    renderTabs();
    renderPanel();
    YZ.toast("已恢复默认名称", "gold");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(working, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    a.download = "piece-names-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    YZ.toast("已导出 JSON", "good");
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !parsed.cchess || !parsed.chess) throw new Error("格式不对");
        working = db.save(parsed);
        setDirty(false);
        renderSummary();
        renderTabs();
        renderPanel();
        YZ.toast("JSON 已导入并保存", "good");
      } catch (e) {
        YZ.toast("导入失败：不是有效的名称库 JSON", "bad");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportDefaults() {
    const payload = JSON.stringify(working, null, 2);
    const js = "/* 由名称库控制台导出：名字 + 竞技场永久参数 */\n" +
      "(function (global) {\n" +
      "  const YZ = global.YZ = global.YZ || {};\n" +
      "  YZ.DEFAULT_NAMES = " + payload + ";\n" +
      "})(window);\n";
    const blob = new Blob([js], { type: "text/javascript;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "default-names.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1200);
    YZ.toast("已下载 default-names.js，替换 js/default-names.js 后重新打包", "gold");
  }

  $("#names-save").addEventListener("click", save);
  $("#names-export-defaults").addEventListener("click", exportDefaults);
  $("#names-reset").addEventListener("click", resetAll);
  $("#names-export").addEventListener("click", exportJson);
  $("#names-import-btn").addEventListener("click", () => $("#names-import-file").click());
  $("#names-import-file").addEventListener("change", e => {
    importJson(e.target.files && e.target.files[0]);
    e.target.value = "";
  });

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  });
  window.addEventListener("beforeunload", e => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  setDirty(false);
  renderSummary();
  renderTabs();
  renderPanel();
})();
