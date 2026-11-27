/* ============================================================
   同人小游戏合集 — 核心层
   ============================================================ */
(function (global) {
  "use strict";

  const YZ = global.YZ = global.YZ || {};
  YZ.games = YZ.games || {};
  YZ.version = "1.0.0";

  /* ---------------- 小工具 ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "style") node.style.cssText = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      }
    }
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const formatNum = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = (() => { let n = 0; return p => (p || "id") + "-" + (++n); })();

  /* ---------------- 存档 ---------------- */
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
    keys(prefix) {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!prefix || (k && k.startsWith(prefix))) out.push(k);
        }
      } catch (e) { /* ignore */ }
      return out;
    }
  };

  const KEY = {
    settings: "yz_settings_v1",
    cchess: "yz_cchess_v1",
    chess: "yz_chess_v1",
    suika: "yz_suika_v1",
    monster: "yz_monster_v1",
    monsterGuess: "yz_monster_guess_v1",
    memory: "yz_memory_v1"
  };

  /* ---------------- 设置 ---------------- */
  const defaults = {
    music: true,
    sfx: true,
    motion: true,
    ai: "normal",
    pieces: "art"
  };
  const settings = {
    data: Object.assign({}, defaults),
    listeners: [],
    load() {
      const saved = storage.get(KEY.settings, {});
      this.data = Object.assign({}, defaults, saved && typeof saved === "object" ? saved : {});
      if (!["easy", "normal", "hard"].includes(this.data.ai)) this.data.ai = "normal";
      if (!["art", "glyph"].includes(this.data.pieces)) this.data.pieces = "art";
      this.apply();
      return this.data;
    },
    save() {
      storage.set(KEY.settings, this.data);
      this.apply();
      this.listeners.forEach(fn => { try { fn(this.data); } catch (e) { console.warn(e); } });
    },
    set(key, value) {
      this.data[key] = value;
      this.save();
    },
    get(key) { return this.data[key]; },
    apply() {
      const root = document.documentElement;
      root.dataset.motion = this.data.motion ? "on" : "off";
      root.dataset.pieces = this.data.pieces;
    },
    on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  };

  /* ---------------- 提示 ---------------- */
  let toastTimer = 0;
  function toast(message, kind) {
    const stack = $("#toast-stack");
    if (!stack) return;
    const node = el("div", { class: "toast " + (kind || ""), role: "status" });
    node.textContent = message;
    stack.appendChild(node);
    while (stack.children.length > 3) stack.removeChild(stack.firstElementChild);
    setTimeout(() => { try { node.remove(); } catch (e) { /* ignore */ } }, 2800);
  }

  /* ---------------- 音频 ---------------- */
  const AudioEngine = (function () {
    let ctx = null;
    let master = null, musicBus = null, sfxBus = null, delay = null, musicFilter = null;
    let musicTimer = null, nextNoteTime = 0, step = 0, started = false;
    const scale = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99];
    let noiseBuffer = null;

    function ensure() {
      if (ctx) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        return ctx;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);

        musicFilter = ctx.createBiquadFilter();
        musicFilter.type = "lowpass";
        musicFilter.frequency.value = 1600;
        musicFilter.Q.value = 0.5;

        musicBus = ctx.createGain();
        musicBus.gain.value = settings.data.music ? 0.5 : 0;
        musicBus.connect(musicFilter);
        musicFilter.connect(master);

        delay = ctx.createDelay(1.0);
        delay.delayTime.value = 0.37;
        const fb = ctx.createGain();
        fb.gain.value = 0.26;
        const wet = ctx.createGain();
        wet.gain.value = 0.22;
        delay.connect(fb); fb.connect(delay);
        delay.connect(wet); wet.connect(musicBus);

        sfxBus = ctx.createGain();
        sfxBus.gain.value = settings.data.sfx ? 0.55 : 0;
        sfxBus.connect(master);

        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const d = noiseBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return ctx;
      } catch (e) {
        ctx = null;
        return null;
      }
    }

    function unlock() {
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    }

    function tone(freq, dur, type, gain, when, slideTo) {
      if (!ctx || !settings.data.sfx && gain > 0 && !musicTimer) return;
      const t = when || ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.12), t + Math.min(0.02, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(sfxBus);
      osc.start(t); osc.stop(t + dur + 0.02);
    }

    function toneAt(freq, dur, type, gain, when) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g);
      if (musicBus) { g.connect(musicBus); if (step % 4 === 2) g.connect(delay); }
      osc.start(when); osc.stop(when + dur + 0.02);
    }

    function noise(dur, gain, freq) {
      if (!ctx || !noiseBuffer) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq || 900;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(gain || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(sfxBus);
      src.start(t); src.stop(t + dur);
    }

    function sfx(name, opt) {
      if (!settings.data.sfx) return;
      if (!ensure()) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const o = opt || {};
      switch (name) {
        case "click":
          tone(620, 0.06, "triangle", 0.08, null, 460);
          break;
        case "select":
          tone(520, 0.08, "triangle", 0.07, null, 650);
          break;
        case "place":
          tone(240, 0.1, "triangle", 0.11, null, 150);
          noise(0.045, 0.035, 1200);
          break;
        case "capture":
          tone(170, 0.16, "sawtooth", 0.07, null, 90);
          noise(0.12, 0.05, 700);
          break;
        case "check":
          tone(740, 0.11, "square", 0.05);
          tone(980, 0.16, "square", 0.045, ctx.currentTime + 0.12);
          break;
        case "move":
          tone(300, 0.07, "triangle", 0.08, null, 260);
          break;
        case "drop":
          tone(210, 0.18, "sine", 0.1, null, 95);
          break;
        case "merge":
          {
            const tier = clamp(o.tier || 0, 0, 12);
            const f = 300 * Math.pow(2, tier / 12);
            tone(f, 0.13, "sine", 0.12, null, f * 1.5);
            tone(f * 2, 0.2, "triangle", 0.045, ctx.currentTime + 0.035, f * 2.3);
          }
          break;
        case "pop":
          tone(800, 0.06, "sine", 0.06, null, 1100);
          break;
        case "correct":
          [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.2, "triangle", 0.08, ctx.currentTime + i * 0.075));
          break;
        case "wrong":
          tone(220, 0.22, "sawtooth", 0.06, null, 140);
          tone(180, 0.28, "sine", 0.05, ctx.currentTime + 0.09, 100);
          break;
        case "hint":
          tone(880, 0.08, "sine", 0.05);
          tone(1174, 0.1, "sine", 0.04, ctx.currentTime + 0.08);
          break;
        case "win":
          [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.45, "triangle", 0.075, ctx.currentTime + i * 0.1));
          break;
        case "lose":
          [392, 349.23, 293.66, 220].forEach((f, i) => tone(f, 0.5, "sine", 0.07, ctx.currentTime + i * 0.13));
          break;
        case "start":
          [392, 523.25, 659.25].forEach((f, i) => tone(f, 0.25, "triangle", 0.06, ctx.currentTime + i * 0.08));
          break;
        default:
          tone(500, 0.05, "sine", 0.05);
      }
    }

    function startMusic() {
      if (!ensure() || !settings.data.music) return;
      if (started && musicTimer) return;
      started = true;
      nextNoteTime = ctx.currentTime + 0.1;
      step = 0;
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = setInterval(schedule, 240);
      schedule();
    }

    function stopMusic() {
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      started = false;
    }

    function schedule() {
      if (!ctx || !settings.data.music) return;
      const horizon = ctx.currentTime + 0.75;
      while (nextNoteTime < horizon) {
        if (step % 2 === 0 || Math.random() < 0.42) {
          const n = scale[randInt(0, scale.length - 1)];
          const octave = Math.random() < 0.16 ? 2 : 1;
          toneAt(n * octave, 1.5 + Math.random() * 0.6, "sine", 0.028 + Math.random() * 0.016, nextNoteTime);
          if (Math.random() < 0.24) {
            toneAt(n * 2, 0.9, "triangle", 0.012, nextNoteTime + 0.19);
          }
        }
        if (step % 8 === 0) {
          toneAt(step % 16 === 0 ? 146.83 : 110, 2.6, "sine", 0.025, nextNoteTime);
        }
        if (step % 8 === 4 && Math.random() < 0.5) {
          toneAt(scale[randInt(0, 3)] / 2, 1.8, "triangle", 0.014, nextNoteTime);
        }
        step++;
        nextNoteTime += 0.46;
      }
    }

    function setMusic(on) {
      if (on) {
        ensure();
        if (musicBus) musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 0.2);
        startMusic();
      } else {
        if (musicBus && ctx) musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
        stopMusic();
      }
    }

    function setSfx(on) {
      if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(on ? 0.55 : 0.0001, ctx.currentTime, 0.12);
    }

    return { unlock, sfx, setMusic, setSfx, startMusic, stopMusic, ensure };
  })();

  /* ---------------- 背景音乐（真实音频轨） ---------------- */
  const TrackPlayer = (function () {
    const TRACKS = {
      "ending4-0": "audio/ending4-0.ogg",
      "home_iriasu": "audio/home_iriasu.ogg",
      "dungeon_irias": "audio/dungeon_irias.ogg",
      "kioku1": "audio/kioku1.ogg",
      "home_zyasin": "audio/home_zyasin.ogg",
      "fieldg2": "audio/fieldg2.ogg",
      "fieldm": "audio/fieldm.ogg",
      "ruka": "audio/ruka.ogg",
      "scene_comi1": "audio/scene_comi1.ogg",
      "boss_chaos5": "audio/boss_chaos5.ogg",
      "boss_chaosruka2": "audio/boss_chaosruka2.ogg",
      "singun_kessen_g": "audio/singun_kessen_g.ogg"
    };
    let el = null, current = "", fadeTimer = 0, wanted = false;

    function ensureEl() {
      if (el) return el;
      el = new Audio();
      el.loop = true;
      el.preload = "auto";
      el.volume = 0;
      el.addEventListener("ended", () => { if (current && settings.data.music) el.play().catch(() => {}); });
      return el;
    }

    function clearFade() {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = 0;
    }

    function fadeTo(target, done) {
      clearFade();
      const node = ensureEl();
      const from = node.volume;
      const steps = 18;
      let n = 0;
      fadeTimer = setInterval(() => {
        n++;
        const t = Math.min(1, n / steps);
        node.volume = Math.max(0, Math.min(1, from + (target - from) * t));
        if (t >= 1) {
          clearFade();
          if (done) done();
        }
      }, 28);
    }

    function play(name) {
      if (!name || !TRACKS[name]) return;
      current = name;
      wanted = true;
      if (!settings.data.music) return;
      const node = ensureEl();
      if (node.dataset.track === name && !node.paused) {
        if (node.volume < 0.5) fadeTo(0.5);
        return;
      }
      const swap = () => {
        node.src = TRACKS[name];
        node.dataset.track = name;
        node.currentTime = 0;
        node.volume = 0;
        const p = node.play();
        if (p && p.catch) p.catch(() => { /* 等待用户手势后 resume */ });
        fadeTo(0.5);
      };
      if (node.dataset.track && !node.paused) {
        fadeTo(0, () => { node.pause(); swap(); });
      } else {
        node.pause();
        swap();
      }
    }

    function pause() {
      wanted = false;
      if (!el) return;
      fadeTo(0, () => { if (el) el.pause(); });
    }

    function resume() {
      wanted = true;
      if (!current || !settings.data.music) return;
      const node = ensureEl();
      if (node.dataset.track !== current) {
        node.src = TRACKS[current];
        node.dataset.track = current;
        node.currentTime = 0;
      }
      const p = node.play();
      if (p && p.catch) p.catch(() => {});
      fadeTo(0.5);
    }

    function setEnabled(on) {
      if (on) resume();
      else pause();
    }

    function stop() {
      current = "";
      wanted = false;
      if (!el) return;
      fadeTo(0, () => { if (el) { el.pause(); el.removeAttribute("src"); el.dataset.track = ""; } });
    }

    function isWanted() { return wanted; }
    function currentName() { return current; }

    return { play, pause, resume, setEnabled, stop, ensureEl, isWanted, currentName };
  })();

  YZ.audio = {
    unlock: () => { AudioEngine.unlock(); TrackPlayer.resume(); },
    sfx: (name, opt) => AudioEngine.sfx(name, opt),
    playTrack: name => TrackPlayer.play(name),
    stopTrack: () => TrackPlayer.pause(),
    currentTrack: () => TrackPlayer.currentName(),
    startMusic: () => TrackPlayer.resume(),
    stopMusic: () => TrackPlayer.pause(),
    setMusic: on => TrackPlayer.setEnabled(on),
    setSfx: on => AudioEngine.setSfx(on)
  };

  /* ---------------- 背景画布 ---------------- */
  function initBackground() {
    const canvas = $("#bg-canvas");
    if (!canvas) return { refresh() {} };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { refresh() {} };
    let w = 0, h = 0, dpr = 1, raf = 0, t = 0, running = false;
    let motes = [], petals = [], fish = [];
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    function resize() {
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      w = global.innerWidth; h = global.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      draw(0);
    }

    function build() {
      const area = w * h;
      const n = clamp(Math.round(area / 34000), 18, 48);
      motes = Array.from({ length: n }, () => ({
        x: rand(0, w), y: rand(0, h), r: rand(0.6, 2.4),
        vx: rand(-4, 4), vy: rand(-9, -2), a: rand(0.08, 0.5),
        hue: Math.random() < 0.45 ? "255,255,255" : (Math.random() < 0.5 ? "255,190,220" : "140,220,255"),
        ph: rand(0, Math.PI * 2), sp: rand(0.3, 1.1)
      }));
      const pn = clamp(Math.round(area / 90000), 6, 16);
      petals = Array.from({ length: pn }, () => ({
        x: rand(0, w), y: rand(0, h), s: rand(5, 12),
        vx: rand(-10, 12), vy: rand(9, 24), rot: rand(0, Math.PI * 2),
        vr: rand(-0.5, 0.5), a: rand(0.08, 0.2), hue: Math.random() < 0.5 ? "255,255,255" : "255,180,212"
      }));
      fish = Array.from({ length: 4 }, (_, i) => ({
        x: rand(-200, w), y: rand(h * 0.2, h * 0.9),
        dir: Math.random() < 0.5 ? 1 : -1, sp: rand(6, 16), s: rand(0.7, 1.5),
        a: rand(0.035, 0.08), ph: rand(0, Math.PI * 2), wob: rand(8, 22)
      }));
    }

    function drawFish(f, time) {
      const yy = f.y + Math.sin(time * 0.4 + f.ph) * f.wob;
      ctx.save();
      ctx.translate(f.x, yy);
      ctx.scale(f.dir * f.s, f.s);
      ctx.strokeStyle = "rgba(255,255,255," + (f.a + 0.03) + ")";
      ctx.fillStyle = "rgba(255,255,255," + f.a * 0.7 + ")";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.quadraticCurveTo(-6, -10, 14, -2);
      ctx.quadraticCurveTo(18, 0, 14, 2);
      ctx.quadraticCurveTo(-6, 10, -18, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-17, 0); ctx.lineTo(-27, -7); ctx.lineTo(-24, 0); ctx.lineTo(-27, 7);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.arc(9, -2, 0.9, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255," + f.a * 2 + ")"; ctx.fill();
      ctx.restore();
    }

    function draw(dt) {
      t += dt;
      ctx.clearRect(0, 0, w, h);
      pointer.x = lerp(pointer.x, pointer.tx, 0.04);
      pointer.y = lerp(pointer.y, pointer.ty, 0.04);

      // 微光
      for (const m of motes) {
        if (running) {
          m.x += m.vx * dt + Math.sin(t * m.sp + m.ph) * 2 * dt;
          m.y += m.vy * dt;
          if (m.y < -10) { m.y = h + 10; m.x = rand(0, w); }
          if (m.x < -10) m.x = w + 10;
          if (m.x > w + 10) m.x = -10;
        }
        const px = m.x + pointer.x * 8;
        const py = m.y + pointer.y * 5;
        const g = ctx.createRadialGradient(px, py, 0, px, py, m.r * 5);
        g.addColorStop(0, "rgba(" + m.hue + "," + m.a + ")");
        g.addColorStop(1, "rgba(" + m.hue + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, m.r * 5, 0, Math.PI * 2); ctx.fill();
      }

      // 花瓣
      for (const p of petals) {
        if (running) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > h + 20) { p.y = -20; p.x = rand(0, w); }
          if (p.x < -30) p.x = w + 20;
          if (p.x > w + 30) p.x = -20;
        }
        ctx.save();
        ctx.translate(p.x + pointer.x * 14, p.y + pointer.y * 8);
        ctx.rotate(p.rot);
        ctx.fillStyle = "rgba(" + p.hue + "," + p.a + ")";
        ctx.beginPath();
        ctx.ellipse(0, 0, p.s, p.s * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const f of fish) {
        if (running) {
          f.x += f.dir * f.sp * dt;
          if (f.dir > 0 && f.x > w + 80) { f.x = -80; f.y = rand(h * 0.15, h * 0.9); }
          if (f.dir < 0 && f.x < -80) { f.x = w + 80; f.y = rand(h * 0.15, h * 0.9); }
        }
        drawFish(f, t);
      }
    }

    let last = 0;
    function loop(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000 || 0, 0.05);
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    function refresh() {
      stop();
      build();
      draw(0);
      if (settings.data.motion) start();
    }

    global.addEventListener("resize", resize, { passive: true });
    global.addEventListener("pointermove", e => {
      pointer.tx = (e.clientX / Math.max(1, w) - 0.5) * 2;
      pointer.ty = (e.clientY / Math.max(1, h) - 0.5) * 2;
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else if (settings.data.motion) start();
    });
    settings.on(() => { if (settings.data.motion) start(); else { stop(); draw(0); } });

    resize();
    if (settings.data.motion) start();
    return { refresh, start, stop };
  }

  /* ---------------- 模态框 ---------------- */
  const modal = {
    open(id) {
      const m = document.getElementById("modal-" + id);
      if (!m) return;
      m.hidden = false;
      document.body.classList.add("modal-open");
    },
    close(id) {
      const m = document.getElementById("modal-" + id);
      if (!m) return;
      m.hidden = true;
      if (!document.querySelector(".modal:not([hidden])")) document.body.classList.remove("modal-open");
    },
    anyOpen() {
      return !!document.querySelector(".modal:not([hidden])");
    }
  };

  /* ---------------- 游戏卡图标（代码绘制） ---------------- */
  function svgWatermelon() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<path d="M18 62a34 34 0 0 1 64 0Z" fill="#2f7d4f"/>' +
      '<path d="M22 62a30 30 0 0 1 56 0Z" fill="#7fce72"/>' +
      '<path d="M27 62a25 25 0 0 1 46 0Z" fill="#f06a72"/>' +
      '<g fill="#3a1d24"><ellipse cx="39" cy="55" rx="1.7" ry="2.4"/><ellipse cx="50" cy="50" rx="1.7" ry="2.4"/><ellipse cx="61" cy="55" rx="1.7" ry="2.4"/><ellipse cx="44" cy="60" rx="1.5" ry="2.2"/><ellipse cx="56" cy="60" rx="1.5" ry="2.2"/></g>' +
      '<path d="M46 22c2-6 8-8 12-7-3 5-5 8-12 7Z" fill="#5ca56b"/>' +
      '<path d="M46 22c0-7 1-9 5-13" stroke="#4a7f4f" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>';
  }
  function svgMonster() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<path d="M22 40 18 16l20 12c8-5 16-5 24 0l20-12-4 24c5 8 5 22-2 30-8 9-22 12-32 8-11-4-18-14-18-24 0-5 1-10 3-14Z" fill="#2b2233" stroke="#f19bb8" stroke-width="1.2"/>' +
      '<path d="M36 42c3-4 7-4 10 0" stroke="#f19bb8" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M56 42c3-4 7-4 10 0" stroke="#f19bb8" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M46 58c3 3 7 3 10 0" stroke="#f19bb8" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<path d="M50 16v-6M44 12l6 4 6-4" stroke="#e8c07a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
  }
  function svgChess() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<path d="M31 78h38l-6-9H37l-6 9Z" fill="#b9a8e6"/>' +
      '<path d="M38 69c1-10 2-15 2-22 0-7-3-11-3-17 0-8 6-14 13-14s13 6 13 14c0 6-3 10-3 17 0 7 1 12 2 22H38Z" fill="#d9cef6"/>' +
      '<path d="M50 29c-4 0-7 3-7 7 2 2 4 3 7 3s5-1 7-3c0-4-3-7-7-7Z" fill="#6b5b96"/>' +
      '<circle cx="43" cy="38" r="1.8" fill="#4d3f73"/><circle cx="57" cy="38" r="1.8" fill="#4d3f73"/>' +
      '<path d="M47 46c2 2 4 2 6 0" stroke="#6b5b96" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  }
  YZ.icons = { watermelon: svgWatermelon, monster: svgMonster, chess: svgChess };

  /* ---------------- 导出 ---------------- */
  YZ.$ = $; YZ.$$ = $$; YZ.el = el;
  YZ.util = { clamp, lerp, rand, randInt, pick, shuffle, formatNum, sleep, escapeHtml, uid };
  YZ.storage = storage;
  YZ.KEY = KEY;
  YZ.settings = settings;
  YZ.toast = toast;
  YZ.modal = modal;
  YZ.initBackground = initBackground;
})(window);