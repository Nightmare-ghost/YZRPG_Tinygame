/* 审判彩蛋：全屏黑底、金色抖动文字、9？球与 🙏 图标、boss_jadgement。 */
(function (global) {
  const YZ = global.YZ;
  let active = false;
  let overlay = null;
  let audioEl = null;
  let prevTrack = "";
  let clickTimer = 0;
  let safetyTimer = 0;
  let scareTimer = 0;
  let flashTimer = 0;
  let stormTimer = 0;
  let stormCount = 0;
  let ascended = false;
  let stormPlayed = false;
  let scared = false;

  const PHRASE = "审判即将来临";
  const EMOJI = "🙏";

  function build() {
    overlay = document.createElement("div");
    overlay.id = "judgement-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", PHRASE);

    let rows = "";
    for (let r = 0; r < 5; r++) {
      let cells = "";
      for (let i = 0; i < 14; i++) {
        cells += i % 2 === 0
          ? '<span class="j-cell"><img src="img/ball/icon-9q.png" alt=""></span>'
          : '<span class="j-cell"><b>' + EMOJI + "</b></span>";
      }
      rows += '<div class="j-row ' + (r % 2 === 1 ? "right" : "left") + '"><div class="j-track">' +
        cells + cells + "</div></div>";
    }
    let echoes = "";
    for (let i = 0; i < 18; i++) {
      const x = 10 + ((i * 17 + 7) % 68);
      const y = 7 + ((i * 23 + 5) % 80);
      const size = (0.9 + (i % 5) * 0.22).toFixed(2);
      const delay = ((i % 9) * 0.33).toFixed(2);
      echoes += '<span class="j-echo" style="--x:' + x + "%;--y:" + y + "%;--s:" + size +
        "rem;--r:" + ((i % 2 ? 1 : -1) * (2 + i % 7)) + "deg;--d:" + delay + 's">' + PHRASE + "</span>";
    }

    overlay.innerHTML =
      '<div class="j-black"></div>' +
      '<div class="j-gold"></div>' +
      '<div class="j-rows">' + rows + "</div>" +
      '<div class="j-storm"></div>' +
      '<div class="j-echoes">' + echoes + "</div>" +
      '<div class="j-center">' +
        '<p class="j-kicker">' + PHRASE + '</p>' +
        '<h1 class="j-title">' + PHRASE + "</h1>" +
        '<p class="j-sub">' + PHRASE + " · " + PHRASE + "</p>" +
      "</div>" +
      '<div class="j-scare"><img src="img/ball/scare.png" alt=""></div>' +
      '<div class="j-flash"></div>';

    document.body.appendChild(overlay);
    overlay.addEventListener("click", onOverlayClick);

    if (global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      overlay.classList.add("reduce-motion");
    }

    requestAnimationFrame(() => overlay.classList.add("on"));
  }

  function spawnStorm() {
    if (!overlay) return;
    const layer = overlay.querySelector(".j-storm");
    if (!layer) return;
    if (stormCount > 72 && layer.firstChild) layer.firstChild.remove();
    const isJudge = Math.random() < 0.55;
    const img = document.createElement("img");
    img.src = isJudge ? "img/ball/judge.png" : "img/ball/icon-9q.png";
    img.className = "j-storm-img" + (isJudge ? " judge" : " ball");
    const x = Math.random() * 106 - 3;
    const y = Math.random() * 100;
    const rot = (Math.random() * 70 - 35).toFixed(1);
    const size = isJudge ? (13 + Math.random() * 34) : (7 + Math.random() * 17);
    img.style.left = x + "%";
    img.style.top = y + "%";
    img.style.width = size + "vw";
    img.style.setProperty("--r", rot + "deg");
    img.style.animationDelay = (Math.random() * 0.08).toFixed(2) + "s";
    layer.appendChild(img);
    stormCount++;
  }

  function startAscension() {
    if (!overlay) return;
    if (!ascended) {
      ascended = true;
      overlay.classList.add("ascend");
      /* 盖屏图标只在本次页面第一次审判时出现 */
      if (!stormPlayed) {
        stormPlayed = true;
        for (let i = 0; i < 7; i++) spawnStorm();
        stormTimer = setInterval(spawnStorm, 150);
      }
    }
  }

  function onOverlayClick() {
    if (!active || scared) return;
    startAscension();
    showScare();
  }

  function showScare() {
    if (!active || scared) return;
    scared = true;
    clearTimeout(clickTimer);
    clearTimeout(safetyTimer);
    clickTimer = 0;
    safetyTimer = 0;
    scareTimer = 0;
    flashTimer = 0;
    startAscension();
    overlay.classList.add("scare");
    scareTimer = setTimeout(startFlash, 5000);
  }

  function startFlash() {
    if (!active || !overlay) return;
    overlay.classList.add("flash");
    flashTimer = setTimeout(() => {
      if (!overlay) return;
      overlay.classList.remove("flash");
      flashTimer = setTimeout(close, 620);
    }, 620);
  }

  function close() {
    if (!active) return;
    active = false;
    scared = false;
    clearTimeout(clickTimer);
    clearTimeout(safetyTimer);
    clearTimeout(scareTimer);
    clearTimeout(flashTimer);
    clearInterval(stormTimer);
    stormTimer = 0;
    if (audioEl) {
      try { audioEl.pause(); audioEl.currentTime = 0; } catch (e) { /* ignore */ }
      audioEl = null;
    }
    if (overlay) {
      overlay.classList.remove("on");
      const old = overlay;
      overlay = null;
      setTimeout(() => old.remove(), 260);
    }
    document.body.classList.remove("judgement-active");
    if (prevTrack && YZ.audio && typeof YZ.audio.playTrack === "function") {
      try { YZ.audio.playTrack(prevTrack); } catch (e) { /* ignore */ }
    }
    prevTrack = "";
  }

  function trigger(reason) {
    if (active) return;
    if (reason === "icon" && YZ.achievements) YZ.achievements.unlock("suika-judgement");
    active = true;
    scared = false;
    clickTimer = 0;
    safetyTimer = 0;
    document.body.classList.add("judgement-active");
    prevTrack = (YZ.audio && typeof YZ.audio.currentTrack === "function" && YZ.audio.currentTrack()) || "";
    try { if (YZ.audio && YZ.audio.stopTrack) YZ.audio.stopTrack(); } catch (e) { /* ignore */ }
    build();

    audioEl = new Audio("audio/boss_jadgement.ogg");
    audioEl.preload = "auto";
    audioEl.volume = 0.92;
    audioEl.addEventListener("ended", showScare, { once: true });
    audioEl.addEventListener("error", () => { if (!scared) setTimeout(showScare, 1200); }, { once: true });
    const p = audioEl.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => { if (!scared) safetyTimer = setTimeout(showScare, 12000); });
    } else {
      safetyTimer = setTimeout(showScare, 90000);
    }
  }

  function maybeRandom() {
    if (Math.random() < 0.001) {
      setTimeout(() => trigger("random"), 700);
      return true;
    }
    return false;
  }

  YZ.judgement = { trigger, maybeRandom, isActive: () => active };
})(window);
