/* ============================================================
   成就系统 · ACHIEVEMENTS
   主页白底金字入口 → 黑色细则窗口
   同一游戏合并为一个入口，下设子类
   ============================================================ */
(function (global) {
  "use strict";
  const YZ = global.YZ;
  const { util, storage, audio, toast } = YZ;
  const KEY = "yz_achievements_v1";
  const VERSION = 1;

  const GROUPS = [
    {
      id: "cchess", title: "圣魔大战", kicker: "HOLY WAR",
      sections: [{
        id: "main", title: "", sequential: true, metal: true, tiers: [
          { id: "cchess-easy", name: "惨胜", desc: "以轻松难度通关圣魔大战", metal: "bronze" },
          { id: "cchess-normal", name: "得胜", desc: "以普通难度通关圣魔大战", metal: "silver" },
          { id: "cchess-hard", name: "完胜", desc: "以困难难度通关圣魔大战", metal: "gold" }
        ]
      }]
    },
    {
      id: "chess", title: "混沌乱战", kicker: "CHAOS CHESS",
      sections: [{
        id: "main", title: "", sequential: true, metal: true, tiers: [
          { id: "chess-easy", name: "惨胜", desc: "以轻松难度通关混沌乱战", metal: "bronze" },
          { id: "chess-normal", name: "得胜", desc: "以普通难度通关混沌乱战", metal: "silver" },
          { id: "chess-hard", name: "完胜", desc: "以困难难度通关混沌乱战", metal: "gold" }
        ]
      }]
    },
    {
      id: "suika", title: "合成大鲁卡", kicker: "RUKA FUSION",
      sections: [
        {
          id: "ladder", title: "等级", sequential: true, metal: true, tiers: [
            { id: "suika-8", name: "靠近混沌", desc: "在合成大鲁卡中合成到 8 级", metal: "bronze" },
            { id: "suika-9", name: "抵达最终", desc: "在合成大鲁卡中合成到 9 级", metal: "silver" },
            { id: "suika-11", name: "混沌之父诞生", desc: "在合成大鲁卡中合成到 11 级", metal: "gold" }
          ]
        },
        {
          id: "special", title: "特殊球", special: true, tiers: [
            { id: "suika-hiruko-high", name: "什么被吃了！？", desc: "让蛭虫球吃掉五级以上的球" },
            { id: "suika-promestein-low", name: "科学被浪费了……", desc: "让普罗米斯汀球升级五级以下的球" },
            { id: "suika-eva", name: "合理的下场", desc: "让蛭虫球吃掉伊娃球" },
            { id: "suika-judgement", name: "审判来临！", desc: "点击合成大鲁卡图标触发审判彩蛋" }
          ]
        }
      ]
    },
    {
      id: "guess", title: "勇一把", kicker: "NAME GUESS",
      sections: [{
        id: "main", title: "", sequential: true, tiers: [
          { id: "guess-1", name: "回忆起……", desc: "在勇一把中猜对 1 次" },
          { id: "guess-5", name: "检索工具", desc: "在勇一把中猜对 5 次" },
          { id: "guess-10", name: "阿卡夏记录", desc: "在勇一把中猜对 10 次" }
        ]
      }]
    },
    {
      id: "arena", title: "格兰德诺亚", kicker: "GRAND NOAH",
      sections: [{
        id: "main", title: "", sequential: true, tiers: [
          { id: "arena-join", name: "猜对了！", desc: "参加一次格兰德诺亚竞技场" },
          { id: "arena-10", name: "识人术", desc: "在竞技场中猜对 10 次" },
          { id: "arena-streak10", name: "运筹帷幄", desc: "在竞技场连猜模式中连续猜对 10 场" }
        ]
      }]
    },
    {
      id: "memory", title: "寻找二重身", kicker: "CHESS MEMORY",
      sections: [
        {
          id: "diff", title: "难度", sequential: true, metal: true, tiers: [
            { id: "memory-easy", name: "二重身发觉", desc: "通关轻松难度寻找二重身", metal: "bronze" },
            { id: "memory-normal", name: "看透", desc: "通关普通难度寻找二重身", metal: "silver" },
            { id: "memory-hard", name: "破除", desc: "通关困难难度寻找二重身", metal: "gold" }
          ]
        },
        {
          id: "battle", title: "对战", sequential: true, metal: true, tiers: [
            { id: "battle-easy", name: "挑战全知者", desc: "在轻松难度战胜全知者", metal: "bronze" },
            { id: "battle-normal", name: "成为全知者", desc: "在普通难度战胜全知者", metal: "silver" },
            { id: "battle-hard", name: "超越全知者", desc: "在困难难度战胜全知者", metal: "gold" }
          ]
        },
        {
          id: "special", title: "特殊", special: true, tiers: [
            { id: "memory-flawless", name: "没看答案吗……", desc: "在没有错误的情况下通关任意难度寻找二重身" },
            { id: "memory-touch-omn", name: "摸摸全知者", desc: "在寻找二重身中点击全知者" }
          ]
        }
      ]
    }
  ];

  const byId = new Map();
  for (const g of GROUPS) for (const sec of g.sections) for (const t of sec.tiers) byId.set(t.id, { group: g, section: sec, tier: t });
  let data = { version: VERSION, unlocked: {}, counters: { arenaCorrect: 0, arenaStreak: 0, arenaPlayed: 0 } };
  let modal = null;
  const openGroups = new Set(GROUPS.map(g => g.id));

  function load() {
    const saved = storage.get(KEY, null);
    if (saved && typeof saved === "object") {
      data = {
        version: VERSION,
        unlocked: saved.unlocked && typeof saved.unlocked === "object" ? saved.unlocked : {},
        counters: Object.assign({ arenaCorrect: 0, arenaStreak: 0, arenaPlayed: 0 }, saved.counters || {})
      };
    }
  }
  function save() { storage.set(KEY, data); }
  load();

  const allTiers = () => GROUPS.flatMap(g => g.sections.flatMap(s => s.tiers));
  const totalCount = () => allTiers().length;
  function completedCount() { return Object.keys(data.unlocked).length; }
  function isUnlocked(id) { return !!data.unlocked[id]; }
  const maskName = t => "？".repeat(Array.from(t.name).length);

  function mark(id, at) {
    const item = byId.get(id);
    if (!item || data.unlocked[id]) return false;
    data.unlocked[id] = { at, name: item.tier.name, group: item.group.title };
    return true;
  }

  function showUnlockPopup(item) {
    let host = document.getElementById("ach-unlock-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "ach-unlock-host";
      host.className = "ach-unlock-host";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "ach-unlock-toast" + (item.section && item.section.special ? " is-special" : "");
    el.innerHTML = '<span class="ach-unlock-icon">✦</span><div><small>成就解锁 · ACHIEVEMENT</small><strong>' + util.escapeHtml(item.tier.name) + '</strong><em>' + util.escapeHtml(item.group.title) + '</em></div>';
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 350);
    }, 3200);
  }

  function unlock(id) {
    const item = byId.get(id);
    if (!item || data.unlocked[id]) return false;
    const at = Date.now();
    const newly = [];
    mark(id, at) && newly.push(item.tier);
    if (item.section.sequential) {
      const idx = item.section.tiers.indexOf(item.tier);
      for (let i = 0; i < idx; i++) mark(item.section.tiers[i].id, at) && newly.push(item.section.tiers[i]);
    }
    save();
    if (newly.length) {
      try { audio.sfx("win"); } catch (e) { /* ignore */ }
      try { showUnlockPopup(item); } catch (e2) { /* ignore */ }
      global.dispatchEvent(new CustomEvent("yz-achievement", { detail: { ids: newly.map(t => t.id), name: item.tier.name } }));
      render();
    }
    return true;
  }

  function recordGuessWins(n) {
    if (n >= 1) unlock("guess-1");
    if (n >= 5) unlock("guess-5");
    if (n >= 10) unlock("guess-10");
  }
  function recordArena(guessed, chainMode, chainStreak) {
    data.counters.arenaPlayed = (data.counters.arenaPlayed || 0) + 1;
    unlock("arena-join");
    if (guessed) {
      data.counters.arenaCorrect = (data.counters.arenaCorrect || 0) + 1;
      if (data.counters.arenaCorrect >= 10) unlock("arena-10");
      if (chainMode) {
        data.counters.arenaStreak = chainStreak || 0;
        if (data.counters.arenaStreak >= 10) unlock("arena-streak10");
      }
    } else if (chainMode) {
      data.counters.arenaStreak = 0;
    }
    save();
  }
  function recordMemory(mode, diff, flawless) {
    if (mode === "battle") return;
    if (["easy", "normal", "hard"].includes(diff)) unlock("memory-" + diff);
    if (flawless) unlock("memory-flawless");
  }
  function recordMemoryBattle(diff, win) {
    if (win && ["easy", "normal", "hard"].includes(diff)) unlock("battle-" + diff);
  }

  function timeText(at) {
    try { return new Date(at).toLocaleString("zh-CN", { hour12: false }); }
    catch (e) { return new Date(at).toISOString(); }
  }

  function rowHtml(g, sec, t, i, states) {
    const done = states[i];
    const maxDone = states.lastIndexOf(true);
    const classes = ["ach-row", done ? "done" : "locked"];
    if (sec.metal && t.metal) classes.push("metal-" + t.metal);
    if (sec.special) classes.push("special");
    if (done) {
      return '<div class="' + classes.join(" ") + '"><span class="ach-mark">✦</span><div><strong>' + util.escapeHtml(t.name) + '</strong><small>' + util.escapeHtml(t.desc) + '</small></div><em>' + util.escapeHtml(timeText(data.unlocked[t.id].at)) + '</em></div>';
    }
    // 特殊成就未解锁时完全隐藏条件
    if (sec.special) {
      return '<div class="' + classes.join(" ") + ' hidden"><span class="ach-mark">? </span><div><strong>' + maskName(t) + '</strong><small>隐藏成就</small></div><em>???</em></div>';
    }
    const canSee = i === 0 || (sec.sequential && i <= maxDone + 1);
    if (!canSee) {
      return '<div class="' + classes.join(" ") + ' hidden"><span class="ach-mark">? </span><div><strong>' + maskName(t) + '</strong><small>继续完成前面的成就后显形</small></div><em>???</em></div>';
    }
    return '<div class="' + classes.join(" ") + '"><span class="ach-mark">◇</span><div><strong>' + maskName(t) + '</strong><small>' + util.escapeHtml(t.desc) + '</small></div><em>未解锁</em></div>';
  }

  function render() {
    const countEl = document.getElementById("ach-count");
    const homeCount = document.getElementById("home-ach-count");
    if (countEl) countEl.textContent = completedCount() + " / " + totalCount();
    if (homeCount) homeCount.textContent = completedCount() + " / " + totalCount();
    if (!modal) return;
    const body = modal.querySelector("#ach-body");
    body.innerHTML = GROUPS.map(g => {
      const all = g.sections.flatMap(s => s.tiers);
      const done = all.filter(t => data.unlocked[t.id]).length;
      const isOpen = openGroups.has(g.id);
      const sections = g.sections.map(sec => {
        const states = sec.tiers.map(t => !!data.unlocked[t.id]);
        return (sec.title ? '<div class="ach-subhead">' + util.escapeHtml(sec.title) + '</div>' : '') +
          '<div class="ach-rows">' + sec.tiers.map((t, i) => rowHtml(g, sec, t, i, states)).join("") + '</div>';
      }).join("");
      return '<div class="ach-group' + (isOpen ? " is-open" : "") + '">' +
        '<button type="button" class="ach-group-head" data-ach-toggle="' + g.id + '" aria-expanded="' + isOpen + '"><div><span>' + util.escapeHtml(g.kicker) + '</span><strong>' + util.escapeHtml(g.title) + '</strong></div><small>' + done + " / " + all.length + ' <b>⌄</b></small></button>' +
        sections + '</div>';
    }).join("");
    body.querySelectorAll("[data-ach-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.achToggle;
        if (openGroups.has(id)) openGroups.delete(id); else openGroups.add(id);
        const group = btn.closest(".ach-group");
        group.classList.toggle("is-open", openGroups.has(id));
        btn.setAttribute("aria-expanded", String(openGroups.has(id)));
      });
    });
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "ach-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="ach-backdrop" data-ach-close></div>' +
      '<div class="ach-panel" role="dialog" aria-modal="true" aria-label="成就">' +
        '<div class="ach-head"><div><p>ACHIEVEMENTS · 成就</p><h2>旅程记录</h2><small>按游戏分组；组内按子类排列，点击游戏标题收起或展开。完成时自动保存时间。</small></div><div class="ach-head-right"><span class="ach-count" id="ach-count">0 / 0</span><button class="ach-close" data-ach-close type="button" aria-label="关闭">✕</button></div></div>' +
        '<div class="ach-actions"><button class="ach-btn" id="ach-export" type="button">导出存档</button><button class="ach-btn" id="ach-import" type="button">导入存档</button><input id="ach-file" type="file" accept="application/json,.json" hidden></div>' +
        '<div class="ach-body" id="ach-body"></div>' +
        '<div class="ach-foot"><span>存档位置：浏览器 localStorage · <code>yz_achievements_v1</code></span><span>导出后可以带到其他设备导入</span></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-ach-close]").forEach(n => n.addEventListener("click", close));
    modal.querySelector("#ach-export").addEventListener("click", exportFile);
    modal.querySelector("#ach-import").addEventListener("click", () => modal.querySelector("#ach-file").click());
    modal.querySelector("#ach-file").addEventListener("change", importFile);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && modal && !modal.hidden) close(); });
    return modal;
  }

  function open() {
    ensureModal();
    render();
    modal.hidden = false;
    document.body.classList.add("ach-open");
    try { audio.sfx("click"); } catch (e) { /* ignore */ }
  }
  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("ach-open");
  }

  function exportFile() {
    const payload = JSON.stringify({
      game: "YZRPG_tinygame", type: "achievements", version: VERSION,
      exportedAt: new Date().toISOString(), data
    }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "YZRPG-achievements-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function importFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || "{}"));
        const incoming = obj && obj.data && obj.data.unlocked ? obj.data : obj;
        if (!incoming || typeof incoming.unlocked !== "object") throw new Error("bad data");
        const merged = Object.assign({}, data.unlocked);
        for (const [id, v] of Object.entries(incoming.unlocked)) {
          if (!byId.has(id)) continue;
          const at = v && typeof v === "object" ? v.at : v;
          if (!merged[id] || (at && at < merged[id].at)) merged[id] = { at: at || Date.now(), name: byId.get(id).tier.name, group: byId.get(id).group.title };
        }
        data.unlocked = merged;
        data.counters = Object.assign({ arenaCorrect: 0, arenaStreak: 0, arenaPlayed: 0 }, data.counters, incoming.counters || {});
        save(); render();
        try { toast("成就存档已导入", "good"); audio.sfx("win"); } catch (e2) { /* ignore */ }
      } catch (err) {
        try { toast("成就存档读取失败", "bad"); } catch (e3) { /* ignore */ }
      }
      e.target.value = "";
    };
    reader.readAsText(f);
  }

  function bind() {
    const entry = document.getElementById("home-achievements");
    if (entry) entry.addEventListener("click", open);
    render();
  }

  YZ.achievements = {
    GROUPS, KEY, open, close, unlock, recordGuessWins, recordArena, recordMemory, recordMemoryBattle,
    isUnlocked, completedCount, totalCount, getData() { return JSON.parse(JSON.stringify(data)); },
    exportFile, render
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
