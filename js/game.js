"use strict";
(() => {
  // ===== 定数 =====
  const VW = 960, VH = 540;
  const PW = 14, PH = 30, PHC = 18;
  const G = 0.42, MAXFALL = 9, RUN = 3.6, CRAWL = 1.6;
  const ACC_G = 0.6, DEC_G = 0.75, ACC_A = 0.4, DEC_A = 0.22;
  const OVER_G = 0.45, OVER_A_HOLD = 0.04, OVER_A = 0.14;
  const JUMP = -8.4, WJ_X = 4.2, WJ_Y = -8.0, SLIDE = 2.4;
  const DASH_SPD = 6.5, DASH_T = 10, IFRAMES = 9, DIAG = 0.72;
  const HYPER_MUL = 1.3, HYPER_VY = -6.6, SPEED_CAP = 16;
  const COYOTE = 6, JBUF = 6, DBUF = 4;
  const SPRING_V = -13, SPRING_BUG = 1.8;
  const ZIP_RANGE = 40;
  const SAVE_KEY = "glitchrun_v1";
  const TEST_MODE = /[?&]test\b/.test(location.search);

  const BUGS = [
    { id: "hyper",  no: "0x01", name: "ハイパーダッシュ", hint: "地面すれすれの急ぎ足は、跳ぶと妙に伸びる。しかも、その速さは次の急ぎ足に引き継がれる。" },
    { id: "zip",    no: "0x02", name: "押し出しワープ",   hint: "狭い所で無理に跳ぼうとすると、体は『向いている方の空き地』へ逃げる。そこが壁の向こうでも。" },
    { id: "spring", no: "0x03", name: "バネ過剰反応",     hint: "急いでいる最中に踏まれたバネは、少し張り切りすぎる。" },
    { id: "iframe", no: "0x04", name: "痛覚遅延",         hint: "ダッシュの出だしの一瞬だけ、体は痛みを忘れている。" },
    { id: "oob",    no: "0x05", name: "天井の外",         hint: "この世界の天井より上にも、歩ける場所がある。" },
    { id: "goal",   no: "0x06", name: "太い旗",           hint: "ゴールの旗の当たり判定は、見た目より少しだけ太い。壁越しでも。" },
  ];

  // ===== セーブ =====
  function loadSave() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) {}
    s = s || {};
    return {
      pb: s.pb || null, pbSplits: s.pbSplits || null, il: s.il || {}, bugs: s.bugs || {},
      cleared: !!s.cleared, name: s.name || "", pid: s.pid || null, submitted: s.submitted || null,
      runs: s.runs || 0,
    };
  }
  const save = loadSave();
  if (!save.pid) save.pid = (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
  persist();

  // ===== ランキング（共有Supabase / REST直叩き）=====
  const Ranking = (() => {
    const URL_ = "https://kifnzvktwbomxthzvvgy.supabase.co/rest/v1/glitchrun_scores";
    // 書き込みは従来形式(JWT)のanon key。セッションは持たない(REST直叩きなので他ゲームのログインを拾わない)。
    const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZm56dmt0d2JvbXh0aHp2dmd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzgxMzgsImV4cCI6MjA5MzQxNDEzOH0.M7nXP-u--6J_6rRpgz1cJj21_7KX6MtfTmZy77Xf_IE";
    const H = { apikey: KEY, Authorization: "Bearer " + KEY };
    async function top(limit = 50) {
      const r = await fetch(`${URL_}?select=name,time_ms,bugs,deaths,updated_at&order=time_ms.asc,updated_at.asc&limit=${limit}`, { headers: H });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }
    async function rankOf(ms) {
      const r = await fetch(`${URL_}?select=name&time_ms=lt.${ms}`, { method: "HEAD", headers: { ...H, Prefer: "count=exact" } });
      const cr = r.headers.get("content-range");
      if (!cr) return null;
      return (parseInt(cr.split("/")[1], 10) || 0) + 1;
    }
    async function submit(row) {
      const r = await fetch(`${URL_}?on_conflict=id`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()));
    }
    return { top, rankOf, submit };
  })();

  // ===== キャンバス =====
  const cv = document.getElementById("game");
  const ctx = cv.getContext("2d");
  cv.width = VW; cv.height = VH;
  function fit() {
    const s = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    cv.style.width = Math.floor(VW * s) + "px";
    cv.style.height = Math.floor(VH * s) + "px";
  }
  window.addEventListener("resize", fit); fit();

  // ===== 入力 =====
  const keys = {}, pressed = {};
  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    ArrowDown: "down", KeyS: "down", ArrowUp: "up", KeyW: "up",
    KeyZ: "jump", Space: "jump", KeyK: "jump", KeyC: "jump",
    KeyX: "dash", ShiftLeft: "dash", ShiftRight: "dash", KeyJ: "dash",
    KeyR: "retry", Escape: "esc", KeyP: "esc",
  };
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    if (!keys[a]) pressed[a] = true;
    keys[a] = true;
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    if (a === "esc") onEsc();
  });
  window.addEventListener("keyup", (e) => { const a = KEYMAP[e.code]; if (a) keys[a] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  // タッチボタン
  document.querySelectorAll("[data-k]").forEach((b) => {
    const a = b.dataset.k;
    const down = (e) => { e.preventDefault(); if (!keys[a]) pressed[a] = true; keys[a] = true; b.classList.add("on"); };
    const up = (e) => { e.preventDefault(); keys[a] = false; b.classList.remove("on"); };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("pointerleave", up);
  });
  if (matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch");

  // ===== サウンド（簡易）=====
  let actx = null;
  function beep(freq, dur = 0.08, type = "square", vol = 0.05, slide = 0) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  const SFX = {
    jump: () => beep(520, 0.07, "square", 0.035, 200),
    dash: () => beep(300, 0.1, "sawtooth", 0.03, -150),
    spring: () => beep(380, 0.18, "triangle", 0.06, 500),
    die: () => beep(180, 0.3, "sawtooth", 0.06, -140),
    check: () => beep(880, 0.12, "triangle", 0.05, 300),
    goal: () => { beep(660, 0.1, "square", 0.05); setTimeout(() => beep(990, 0.18, "square", 0.05), 90); },
    bug: () => { beep(90, 0.25, "sawtooth", 0.05, 900); setTimeout(() => beep(1500, 0.06, "square", 0.03, -1200), 120); },
  };

  // ===== 状態 =====
  let stages = [];
  let lvl = null, stageIdx = 0, mode = "rta"; // rta | il
  let p = null, respawnPt = null;
  let state = "title"; // title | play | clear | result | pause
  let runFrames = 0, stageFrames = 0, splits = [], deaths = 0, runBugs = {};
  let clearT = 0, lastSplitDiff = null;
  let cam = { x: 0, y: 0 };
  let particles = [], ghosts = [], shake = 0, glitchT = 0, frameNo = 0;
  let levelCanvas = null;

  // ===== タイル =====
  function tile(c, r) {
    if (c < 0 || c >= lvl.W) return "M";
    if (r < 0 || r >= lvl.H) return ".";
    return lvl.grid[r][c];
  }
  const isSolid = (t) => t === "#" || t === "M";
  function solidInRect(x, y, w, h) {
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 0.001) / TILE);
    const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 0.001) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolid(tile(c, r))) return true;
    return false;
  }
  function jumpableInRect(x, y, w, h) {
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 0.001) / TILE);
    const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 0.001) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tile(c, r) === "#") return true;
    return false;
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ===== プレイヤー =====
  function newPlayer(x, y) {
    return {
      x, y, w: PW, h: PH, vx: 0, vy: 0, onGround: false, crouch: false, facing: 1,
      coyote: 0, jbuf: 0, dbuf: 0, dashT: 0, dashDX: 0, dashDY: 0, dashSpd: DASH_SPD,
      lastDX: 0, lastDY: 0, canDash: true, iframes: 0, postDash: 99, wjLock: 0,
      varJump: false, dead: 0, springCD: 0, squash: 0, blink: 0,
    };
  }
  function setCrouch(on) {
    if (on && !p.crouch) { p.y += PH - PHC; p.h = PHC; p.crouch = true; }
    else if (!on && p.crouch) { p.y -= PH - PHC; p.h = PH; p.crouch = false; }
  }
  const canStand = () => !solidInRect(p.x, p.y - (PH - PHC), p.w, PH);

  function moveX(dx) {
    const prevL = p.x, prevR = p.x + p.w;
    p.x += dx;
    const c0 = Math.floor(p.x / TILE), c1 = Math.floor((p.x + p.w - 0.001) / TILE);
    const r0 = Math.floor(p.y / TILE), r1 = Math.floor((p.y + p.h - 0.001) / TILE);
    let hit = false;
    if (dx > 0) {
      let best = Infinity;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
        if (isSolid(tile(c, r)) && c * TILE >= prevR - 0.01) best = Math.min(best, c * TILE);
      if (best < Infinity) { p.x = best - p.w; hit = true; }
    } else if (dx < 0) {
      let best = -Infinity;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
        if (isSolid(tile(c, r)) && (c + 1) * TILE <= prevL + 0.01) best = Math.max(best, (c + 1) * TILE);
      if (best > -Infinity) { p.x = best; hit = true; }
    }
    return hit;
  }
  function moveY(dy) {
    const prevT = p.y, prevB = p.y + p.h;
    p.y += dy;
    const c0 = Math.floor(p.x / TILE), c1 = Math.floor((p.x + p.w - 0.001) / TILE);
    const r0 = Math.floor(p.y / TILE), r1 = Math.floor((p.y + p.h - 0.001) / TILE);
    if (dy > 0) {
      let best = Infinity;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const t = tile(c, r);
        if ((isSolid(t) || t === "-") && r * TILE >= prevB - 0.01) best = Math.min(best, r * TILE);
      }
      if (best < Infinity) { p.y = best - p.h; return "land"; }
    } else if (dy < 0) {
      let best = -Infinity;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
        if (isSolid(tile(c, r)) && (r + 1) * TILE <= prevT + 0.01) best = Math.max(best, (r + 1) * TILE);
      if (best > -Infinity) { p.y = best; return "bonk"; }
    }
    return null;
  }
  function groundProbe() {
    const y = p.y + p.h;
    if (solidInRect(p.x, y, p.w, 1)) return true;
    const r = Math.round(y / TILE);
    if (Math.abs(r * TILE - y) < 0.05) {
      const c0 = Math.floor(p.x / TILE), c1 = Math.floor((p.x + p.w - 0.001) / TILE);
      for (let c = c0; c <= c1; c++) if (tile(c, r) === "-") return true;
    }
    return false;
  }
  function wallDir() {
    if (jumpableInRect(p.x + p.w, p.y + 3, 3, p.h - 8)) return 1;
    if (jumpableInRect(p.x - 3, p.y + 3, 3, p.h - 8)) return -1;
    return 0;
  }

  // ===== バグ検出 =====
  function bug(id) {
    if (!runBugs[id]) runBugs[id] = true;
    if (save.bugs[id]) return;
    save.bugs[id] = Date.now();
    persist();
    const b = BUGS.find((x) => x.id === id);
    glitchT = 40;
    SFX.bug();
    showBugToast(b);
  }

  function doJump() {
    p.vy = JUMP; p.onGround = false; p.coyote = 0; p.jbuf = 0; p.varJump = true; p.squash = -6;
    SFX.jump();
    dust(p.x + p.w / 2, p.y + p.h, 5);
  }
  function doHyper(dx) {
    p.vx = dx * Math.min(p.dashSpd * HYPER_MUL, SPEED_CAP);
    p.vy = HYPER_VY; p.dashT = 0; p.onGround = false; p.coyote = 0; p.jbuf = 0; p.varJump = false;
    p.squash = -8;
    SFX.jump();
    dust(p.x + p.w / 2, p.y + p.h, 10);
    bug("hyper");
  }
  function doWallJump(wd) {
    p.vx = -wd * WJ_X; p.vy = WJ_Y; p.facing = -wd; p.wjLock = 7; p.jbuf = 0; p.varJump = true; p.dashT = 0;
    SFX.jump();
    dust(p.x + (wd > 0 ? p.w : 0), p.y + p.h / 2, 5);
  }
  function zipEject() {
    const baseY = p.y - (PH - PHC), f = p.facing;
    for (let d = 1; d <= ZIP_RANGE; d++) {
      const nx = p.x + f * d;
      if (!solidInRect(nx, baseY, p.w, PH)) {
        const x0 = Math.min(p.x, nx), x1 = Math.max(p.x, nx) + p.w;
        const through = solidInRect(x0, p.y + 2, x1 - x0, PHC - 4);
        p.x = nx; p.y = baseY; p.h = PH; p.crouch = false; p.vx = 0;
        if (through) { bug("zip"); shake = 6; for (let i = 0; i < 12; i++) spark(p.x + p.w / 2, p.y + p.h / 2, "#7ff"); }
        return true;
      }
    }
    return false;
  }

  function stepPlayer() {
    if (p.dead > 0) {
      p.dead--;
      if (p.dead === 0) respawn();
      return;
    }
    const ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const D = !!keys.down, U = !!keys.up;
    if (pressed.jump) p.jbuf = JBUF; else if (p.jbuf > 0) p.jbuf--;
    if (pressed.dash) p.dbuf = DBUF; else if (p.dbuf > 0) p.dbuf--;
    if (p.wjLock > 0) p.wjLock--;
    if (p.springCD > 0) p.springCD--;
    if (p.iframes > 0) p.iframes--;
    if (ix !== 0 && p.dashT === 0 && p.wjLock === 0) p.facing = ix;

    // しゃがみ
    if (p.onGround && D && p.dashT === 0 && !p.crouch) setCrouch(true);
    if (p.crouch && !(D && p.onGround) && p.dashT === 0 && canStand()) setCrouch(false);
    // 狭い所でジャンプ → 押し出し
    if (p.crouch && p.jbuf > 0 && p.onGround && !canStand()) {
      p.jbuf = 0;
      zipEject();
    }

    // ダッシュ開始
    if (p.dbuf > 0 && p.canDash && p.dashT === 0) {
      p.dbuf = 0;
      let dx = ix, dy = (D ? 1 : 0) - (U ? 1 : 0);
      if (dx === 0 && dy === 0) dx = p.facing;
      let spd = DASH_SPD;
      if (dx !== 0 && Math.sign(p.vx) === dx && Math.abs(p.vx) > spd) spd = Math.min(Math.abs(p.vx), SPEED_CAP);
      p.dashSpd = spd; p.dashDX = dx; p.dashDY = dy; p.lastDX = dx; p.lastDY = dy;
      p.dashT = DASH_T; p.iframes = IFRAMES; p.canDash = false; p.varJump = false;
      if (dx) p.facing = dx;
      const k = dx && dy ? DIAG : 1;
      p.vx = dx * spd * k; p.vy = dy * spd * k;
      SFX.dash();
      shake = Math.max(shake, 2);
    }

    let jumped = false;
    if (p.dashT > 0) {
      p.dashT--;
      const k = p.dashDX && p.dashDY ? DIAG : 1;
      p.vx = p.dashDX * p.dashSpd * k;
      p.vy = p.dashDY * p.dashSpd * k;
      if (p.jbuf > 0) {
        const grounded = p.onGround || p.coyote > 0;
        if (grounded && (!p.crouch || canStand())) {
          if (p.crouch) setCrouch(false);
          if (p.dashDY > 0 && p.dashDX !== 0) doHyper(p.dashDX);
          else { p.dashT = 0; doJump(); if (p.dashDY < 0) p.vy = Math.min(p.vy, JUMP); }
          jumped = true;
        } else if (!grounded) {
          const wd = wallDir();
          if (wd) { doWallJump(wd); jumped = true; }
        }
      }
      if (p.dashT === 0 && !jumped) {
        if (p.dashDY < 0) p.vy *= 0.55;
        p.postDash = 0;
      }
      if (frameNo % 2 === 0) ghosts.push({ x: p.x, y: p.y, w: p.w, h: p.h, life: 14, col: p.dashSpd > DASH_SPD + 0.5 ? "#ff5cf0" : "#5cf0ff" });
    } else {
      p.postDash++;
      // 横移動
      const max = p.crouch && p.onGround ? CRAWL : RUN;
      if (p.wjLock === 0) {
        const s = Math.sign(p.vx), av = Math.abs(p.vx);
        if (av > max && s === ix) {
          const dec = p.onGround ? OVER_G : OVER_A_HOLD;
          p.vx -= s * Math.min(dec, av - max);
        } else if (av > max && !p.onGround) {
          p.vx -= s * Math.min(OVER_A, av - max);
          if (ix === -s) p.vx -= s * ACC_A;
        } else {
          const target = ix * max;
          const acc = p.onGround ? (ix ? ACC_G : DEC_G) : (ix ? ACC_A : DEC_A);
          if (p.vx < target) p.vx = Math.min(target, p.vx + acc);
          else if (p.vx > target) p.vx = Math.max(target, p.vx - acc);
        }
      }
      // 重力
      const floaty = p.varJump && keys.jump && Math.abs(p.vy) < 1.2;
      p.vy += floaty ? G * 0.55 : G;
      if (p.varJump && !keys.jump && p.vy < -2.6) { p.vy = -2.6; p.varJump = false; }
      if (p.vy >= 0) p.varJump = false;
      if (p.vy > MAXFALL) p.vy = MAXFALL;
      const wd = !p.onGround ? wallDir() : 0;
      if (wd !== 0 && ix === wd && p.vy > SLIDE) {
        p.vy = SLIDE;
        if (frameNo % 5 === 0) dust(p.x + (wd > 0 ? p.w : 0), p.y + p.h - 4, 1);
      }
      // ジャンプ
      if (p.jbuf > 0 && !(p.crouch && !canStand())) {
        if (p.onGround || p.coyote > 0) {
          if (p.crouch) setCrouch(false);
          if (p.postDash <= 3 && p.lastDY > 0 && p.lastDX !== 0) doHyper(p.lastDX);
          else doJump();
        } else if (wd !== 0) doWallJump(wd);
      }
    }

    // 移動（サブステップ）
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) / 6));
    const wasGround = p.onGround;
    let hx = false, hy = null;
    for (let i = 0; i < steps; i++) {
      if (!hx && moveX(p.vx / steps)) hx = true;
      if (!hy) { const r = moveY(p.vy / steps); if (r) hy = r; }
    }
    if (hx) p.vx = 0;
    if (hy === "land") { p.vy = 0; }
    if (hy === "bonk") { p.vy = Math.max(0, p.vy); p.varJump = false; }
    p.onGround = p.vy >= 0 && groundProbe();
    if (p.onGround) {
      if (!wasGround) { p.squash = 5; if (p.vy >= 0) dust(p.x + p.w / 2, p.y + p.h, 3); }
      p.coyote = COYOTE;
      if (p.dashT === 0) p.canDash = true;
    } else if (p.coyote > 0) p.coyote--;
    if (!p.onGround && p.crouch && canStand()) setCrouch(false);

    // バネ
    for (const s of lvl.springs) {
      const r = { x: s.c * TILE + 2, y: s.r * TILE + 14, w: 20, h: 10 };
      if (p.springCD === 0 && overlap(p, r) && (p.vy >= 0 || p.dashT > 0)) {
        const bugged = p.dashT > 0;
        if (p.crouch) setCrouch(false);
        p.vy = SPRING_V * (bugged ? SPRING_BUG : 1);
        p.vx *= 0.25;
        p.y = r.y - p.h - 0.01;
        p.dashT = 0; p.canDash = true; p.varJump = false; p.onGround = false; p.coyote = 0; p.springCD = 8;
        s.anim = 14;
        SFX.spring();
        if (bugged) { bug("spring"); shake = 5; }
      }
    }
    // トゲ
    if (hitSpike()) {
      if (p.iframes > 0) bug("iframe");
      else { die(); return; }
    }
    // 範囲外（上）
    if (p.y + p.h < -2) bug("oob");
    // 落下死
    if (p.y > lvl.H * TILE + 80) { die(); return; }
    // チェックポイント
    for (const f of lvl.checks) {
      if (!f.on && overlap(p, { x: f.c * TILE, y: (f.r - 1) * TILE, w: TILE, h: TILE * 2 })) {
        lvl.checks.forEach((o) => (o.on = false));
        f.on = true;
        respawnPt = { x: f.c * TILE + 5, y: (f.r + 1) * TILE - PH };
        SFX.check();
        for (let i = 0; i < 10; i++) spark(f.c * TILE + 12, f.r * TILE, "#8f8");
      }
    }
    // ゴール（判定は旗より左右に30px太い）
    const gl = lvl.goal;
    const gbox = { x: gl.c * TILE - 30, y: (gl.r - 1) * TILE - 6, w: TILE + 60, h: TILE * 2 + 6 };
    if (overlap(p, gbox)) {
      const cy = p.y + p.h / 2, px = p.x + p.w / 2, fx = gl.c * TILE + 12;
      let wall = false;
      for (let x = Math.min(px, fx); x <= Math.max(px, fx); x += 6)
        if (isSolid(tile(Math.floor(x / TILE), Math.floor(cy / TILE)))) wall = true;
      if (wall) bug("goal");
      stageClear();
    }
  }

  function hitSpike() {
    const c0 = Math.floor(p.x / TILE), c1 = Math.floor((p.x + p.w - 0.001) / TILE);
    const r0 = Math.floor(p.y / TILE), r1 = Math.floor((p.y + p.h - 0.001) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const t = tile(c, r);
      let box = null;
      if (t === "^") box = { x: c * TILE + 3, y: r * TILE + 12, w: 18, h: 12 };
      else if (t === "v") box = { x: c * TILE + 3, y: r * TILE, w: 18, h: 12 };
      else if (t === "x") box = { x: c * TILE + 4, y: r * TILE + 4, w: 16, h: 16 };
      if (box && overlap(p, box)) return true;
    }
    return false;
  }

  function die() {
    if (p.dead) return;
    p.dead = 34;
    deaths++;
    SFX.die();
    shake = 8;
    for (let i = 0; i < 24; i++) spark(p.x + p.w / 2, p.y + p.h / 2, i % 2 ? "#fff" : "#ff4d6d");
  }
  function respawn() {
    const facing = p ? p.facing : 1;
    p = newPlayer(respawnPt.x, respawnPt.y);
    p.facing = facing;
    p.blink = 30;
  }

  // ===== パーティクル =====
  function dust(x, y, n) {
    for (let i = 0; i < n; i++)
      particles.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.2, life: 18 + Math.random() * 10, col: "rgba(220,220,255,.7)", s: 2 + Math.random() * 2 });
  }
  function spark(x, y, col) {
    const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 4;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 24 + Math.random() * 16, col, s: 3 });
  }

  // ===== ステージ管理 =====
  function loadStage(i) {
    stageIdx = i;
    lvl = buildLevel(STAGE_DEFS[i]);
    respawnPt = { x: lvl.start.c * TILE + 5, y: (lvl.start.r + 1) * TILE - PH };
    p = newPlayer(respawnPt.x, respawnPt.y);
    stageFrames = 0;
    particles = []; ghosts = [];
    prerender();
    snapCam();
    showStageBanner();
  }
  function startRun(m, i = 0) {
    mode = m;
    runFrames = 0; splits = []; deaths = 0; runBugs = {};
    lastSplitDiff = null;
    loadStage(i);
    state = "play";
    ui.hideAll();
    ui.hud(true);
  }
  function stageClear() {
    state = "clear";
    clearT = 70;
    SFX.goal();
    for (let i = 0; i < 30; i++) spark(p.x + p.w / 2, p.y + p.h / 2, i % 3 ? "#ffe066" : "#fff");
    if (mode === "rta") {
      splits.push(runFrames);
      if (save.pbSplits && save.pbSplits[splits.length - 1] != null) lastSplitDiff = runFrames - save.pbSplits[splits.length - 1];
      else lastSplitDiff = null;
    } else {
      const id = lvl.id;
      const prev = save.il[id];
      lastSplitDiff = prev != null ? stageFrames - prev : null;
      if (prev == null || stageFrames < prev) { save.il[id] = stageFrames; persist(); }
    }
  }
  function afterClear() {
    if (mode === "rta" && stageIdx < STAGE_DEFS.length - 1) {
      loadStage(stageIdx + 1);
      state = "play";
      return;
    }
    if (mode === "rta") finishRun();
    else { state = "result"; ui.ilResult(); }
  }
  function finishRun() {
    state = "result";
    save.runs++;
    const newPb = save.pb == null || runFrames < save.pb;
    const prevPb = save.pb;
    if (newPb) { save.pb = runFrames; save.pbSplits = splits.slice(); }
    const firstClear = !save.cleared;
    save.cleared = true;
    persist();
    ui.result({ frames: runFrames, newPb, prevPb, firstClear });
  }

  // ===== 描画 =====
  const THEMES = [
    { bg1: "#0d1030", bg2: "#1b1446", tile: "#2a3570", edge: "#6f86ff", dark: "#161c42" },
    { bg1: "#1a0f08", bg2: "#2b1a10", tile: "#5a3a22", edge: "#d99a52", dark: "#2f1d10" },
    { bg1: "#1a0712", bg2: "#2c0c1f", tile: "#4a1d3a", edge: "#ff6fae", dark: "#260d1d" },
    { bg1: "#07181a", bg2: "#0c2a2c", tile: "#1d4a4c", edge: "#5fe8d6", dark: "#0e2728" },
    { bg1: "#0a0a12", bg2: "#171725", tile: "#34344d", edge: "#b8b8ff", dark: "#1a1a2a" },
  ];
  function prerender() {
    const th = THEMES[lvl.theme];
    levelCanvas = document.createElement("canvas");
    levelCanvas.width = lvl.W * TILE; levelCanvas.height = lvl.H * TILE;
    const g = levelCanvas.getContext("2d");
    for (let r = 0; r < lvl.H; r++) for (let c = 0; c < lvl.W; c++) {
      const t = lvl.grid[r][c], x = c * TILE, y = r * TILE;
      if (t === "#") {
        g.fillStyle = th.tile; g.fillRect(x, y, TILE, TILE);
        g.fillStyle = th.dark; g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        g.fillStyle = th.tile; g.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
        g.fillStyle = th.edge;
        if (!isSolid(tile(c, r - 1))) g.fillRect(x, y, TILE, 3);
        if (!isSolid(tile(c - 1, r))) g.fillRect(x, y, 2, TILE);
        if (!isSolid(tile(c + 1, r))) g.fillRect(x + TILE - 2, y, 2, TILE);
        if (!isSolid(tile(c, r + 1)) && r + 1 < lvl.H) g.fillRect(x, y + TILE - 2, TILE, 2);
      } else if (t === "M") {
        g.fillStyle = "#5b6070"; g.fillRect(x, y, TILE, TILE);
        g.fillStyle = "#8a90a3"; g.fillRect(x, y, TILE, 2); g.fillRect(x, y, 2, TILE);
        g.fillStyle = "#3a3e4a"; g.fillRect(x + TILE - 2, y, 2, TILE); g.fillRect(x, y + TILE - 2, TILE, 2);
        g.fillStyle = "#c5cad8"; g.fillRect(x + 5, y + 5, 2, 2); g.fillRect(x + 17, y + 5, 2, 2); g.fillRect(x + 5, y + 17, 2, 2); g.fillRect(x + 17, y + 17, 2, 2);
      } else if (t === "-") {
        g.fillStyle = th.edge; g.fillRect(x, y, TILE, 4);
        g.fillStyle = th.tile; g.fillRect(x + 2, y + 4, 3, 4); g.fillRect(x + TILE - 5, y + 4, 3, 4);
      } else if (t === "^" || t === "v") {
        g.fillStyle = "#ff4d6d";
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          if (t === "^") { g.moveTo(x + k * 8, y + TILE); g.lineTo(x + k * 8 + 4, y + 10); g.lineTo(x + k * 8 + 8, y + TILE); }
          else { g.moveTo(x + k * 8, y); g.lineTo(x + k * 8 + 4, y + 14); g.lineTo(x + k * 8 + 8, y); }
          g.fill();
        }
        g.fillStyle = "#ffc2cf";
        for (let k = 0; k < 3; k++) g.fillRect(x + k * 8 + 3, t === "^" ? y + 12 : y + 10, 2, 2);
      } else if (t === "x") {
        g.fillStyle = "#6a1022"; g.fillRect(x + 6, y + 6, 12, 12);
        g.fillStyle = "#ff4d6d";
        const tri = (ax, ay, bx, by, cx2, cy2) => { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx2, cy2); g.fill(); };
        tri(x + 6, y + 6, x + 12, y, x + 18, y + 6);
        tri(x + 6, y + 18, x + 12, y + 24, x + 18, y + 18);
        tri(x + 6, y + 6, x, y + 12, x + 6, y + 18);
        tri(x + 18, y + 6, x + 24, y + 12, x + 18, y + 18);
      }
    }
    // 看板
    g.font = "bold 13px 'DotGothic16', monospace";
    g.textBaseline = "top";
    for (const s of lvl.signs || []) {
      const w = g.measureText(s.t).width + 14;
      const x = s.c * TILE, y = s.r * TILE;
      g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(x, y, w, 22);
      g.strokeStyle = "rgba(255,255,255,.25)"; g.strokeRect(x + 0.5, y + 0.5, w - 1, 21);
      g.fillStyle = "#e8e8ff"; g.fillText(s.t, x + 7, y + 4);
    }
  }

  function snapCam() {
    const t = camTarget();
    cam.x = t.x; cam.y = t.y;
  }
  function camTarget() {
    const mw = lvl.W * TILE, mh = lvl.H * TILE;
    let x = p.x + p.w / 2 - VW / 2 + p.facing * 40 + Math.max(-120, Math.min(120, p.vx * 10));
    let y = p.y + p.h / 2 - VH / 2 - 20;
    if (mw <= VW) x = (mw - VW) / 2; else x = Math.max(0, Math.min(mw - VW, x));
    const minY = lvl.oob ? -300 : 0;
    if (mh <= VH && !(lvl.oob && p.y < 0)) y = (mh - VH) / 2;
    else y = Math.max(minY, Math.min(mh - VH, y));
    return { x, y };
  }

  function drawBg() {
    const th = THEMES[lvl.theme];
    const gr = ctx.createLinearGradient(0, 0, 0, VH);
    gr.addColorStop(0, th.bg1); gr.addColorStop(1, th.bg2);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH);
    // パララックスの格子
    ctx.strokeStyle = "rgba(255,255,255,.035)";
    ctx.lineWidth = 1;
    const ox = -(cam.x * 0.3) % 48, oy = -(cam.y * 0.3) % 48;
    ctx.beginPath();
    for (let x = ox; x < VW; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, VH); }
    for (let y = oy; y < VH; y += 48) { ctx.moveTo(0, y); ctx.lineTo(VW, y); }
    ctx.stroke();
  }

  function drawVoid(sx, sy) {
    // マップの上（y<0）の「何もない」領域
    if (!lvl.oob) return;
    const top = -sy;
    if (top <= 0) return;
    ctx.fillStyle = "#050507";
    ctx.fillRect(0, 0, VW, top);
    for (let i = 0; i < 40; i++) {
      const y = Math.random() * top, x = Math.random() * VW;
      ctx.fillStyle = `rgba(${150 + Math.random() * 100 | 0},${Math.random() * 255 | 0},255,${Math.random() * 0.25})`;
      ctx.fillRect(x, y, Math.random() * 90, 1 + Math.random() * 2);
    }
    ctx.fillStyle = "rgba(255,255,255,.05)";
    ctx.font = "12px monospace";
    ctx.fillText("NULL NULL NULL NULL", 20 - (sx * 0.2) % 200, top - 10);
  }

  function drawPlayer(sx, sy) {
    if (p.dead) return;
    if (p.blink > 0) { p.blink--; if (p.blink % 4 < 2) return; }
    const sq = p.squash;
    let w = p.w, h = p.h;
    if (sq > 0) { w += sq * 0.8; h -= sq * 0.8; }
    else if (sq < 0) { w += sq * 0.5; h -= sq * 0.8; }
    const x = Math.round(p.x + p.w / 2 - w / 2 - sx), y = Math.round(p.y + p.h - h - sy);
    const fast = Math.abs(p.vx) > RUN + 1.5;
    const body = p.canDash ? (fast ? "#ff5cf0" : "#5cf0ff") : "#7a7fa8";
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.fillRect(x, y, w, 3);
    // 目
    ctx.fillStyle = "#101020";
    const ey = y + (p.crouch ? 5 : 8);
    const ex = p.facing > 0 ? x + w - 7 : x + 2;
    ctx.fillRect(ex, ey, 3, 5);
    ctx.fillRect(ex + (p.facing > 0 ? -5 : 5), ey, 3, 5);
    // スカーフ
    ctx.fillStyle = "#ffe066";
    const sw = Math.sin(frameNo * 0.3) * 2;
    ctx.fillRect(p.facing > 0 ? x - 6 : x + w, y + (p.crouch ? 3 : 12) + sw, 6, 3);
    if (p.squash > 0) p.squash--; else if (p.squash < 0) p.squash++;
  }

  function fmt(frames) {
    const ms = Math.floor(frames * 1000 / 60);
    const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, cs = ms % 1000;
    return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(3, "0")}`;
  }
  const fmtDiff = (d) => (d < 0 ? "-" : "+") + fmt(Math.abs(d)).replace(/^0:/, "");

  function draw() {
    if (!lvl) return;
    const t = camTarget();
    cam.x += (t.x - cam.x) * 0.18;
    cam.y += (t.y - cam.y) * 0.18;
    let sx = cam.x, sy = cam.y;
    if (shake > 0) { sx += (Math.random() - 0.5) * shake; sy += (Math.random() - 0.5) * shake; shake *= 0.85; if (shake < 0.3) shake = 0; }
    sx = Math.round(sx); sy = Math.round(sy);
    drawBg();
    drawVoid(sx, sy);
    ctx.drawImage(levelCanvas, -sx, -sy);
    // バネ
    for (const s of lvl.springs) {
      const x = s.c * TILE - sx, y = s.r * TILE - sy;
      const ext = s.anim > 0 ? s.anim * 0.7 : 0;
      if (s.anim > 0) s.anim--;
      ctx.fillStyle = "#666"; ctx.fillRect(x + 4, y + 20, 16, 4);
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 20); ctx.lineTo(x + 18, y + 17 - ext / 2); ctx.lineTo(x + 6, y + 15 - ext); ctx.stroke();
      ctx.fillStyle = "#ffcf33"; ctx.fillRect(x + 2, y + 11 - ext, 20, 4);
    }
    // チェックポイント
    for (const f of lvl.checks) {
      const x = f.c * TILE - sx, y = f.r * TILE - sy;
      ctx.fillStyle = "#aaa"; ctx.fillRect(x + 10, y - 20, 3, 44);
      ctx.fillStyle = f.on ? "#6dff8a" : "#55607a";
      ctx.beginPath(); ctx.moveTo(x + 13, y - 20); ctx.lineTo(x + 26, y - 14); ctx.lineTo(x + 13, y - 8); ctx.fill();
    }
    // ゴール
    {
      const g = lvl.goal, x = g.c * TILE - sx, y = g.r * TILE - sy;
      ctx.fillStyle = "#ddd"; ctx.fillRect(x + 10, y - 24, 3, 48);
      const wv = Math.sin(frameNo * 0.12) * 2;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#111" : "#fff";
        ctx.fillRect(x + 13 + i * 4, y - 24 + j * 4 + (i % 2 ? wv * 0.5 : 0), 4, 4);
      }
      ctx.fillStyle = "rgba(255,230,100,.12)";
      ctx.beginPath(); ctx.arc(x + 12, y, 26 + Math.sin(frameNo * 0.08) * 3, 0, Math.PI * 2); ctx.fill();
    }
    // 残像
    for (const gh of ghosts) {
      ctx.globalAlpha = gh.life / 14 * 0.45;
      ctx.fillStyle = gh.col;
      ctx.fillRect(Math.round(gh.x - sx), Math.round(gh.y - sy), gh.w, gh.h);
    }
    ctx.globalAlpha = 1;
    drawPlayer(sx, sy);
    // パーティクル
    for (const q of particles) {
      ctx.globalAlpha = Math.min(1, q.life / 20);
      ctx.fillStyle = q.col;
      ctx.fillRect(q.x - sx, q.y - sy, q.s, q.s);
    }
    ctx.globalAlpha = 1;
    // 画面外(上)にいる時の矢印
    if (p.y + p.h - sy < 0 && !p.dead) {
      const x = p.x + p.w / 2 - sx;
      ctx.fillStyle = "#ff5cf0";
      ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x - 8, 18); ctx.lineTo(x + 8, 18); ctx.fill();
    }
    // 死亡フェード
    if (p.dead) {
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, (22 - p.dead) / 22) * 0.9})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    drawGlitch();
    if (state !== "title") drawHud();
  }

  function drawGlitch() {
    if (glitchT <= 0) return;
    glitchT--;
    const n = Math.min(12, glitchT / 2 | 0);
    for (let i = 0; i < n; i++) {
      const y = Math.random() * VH | 0, h = 2 + Math.random() * 18 | 0, dx = (Math.random() - 0.5) * 40 | 0;
      try { ctx.drawImage(cv, 0, y, VW, h, dx, y, VW, h); } catch (e) {}
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "255,0,200" : "0,255,255"},.12)`;
      ctx.fillRect(0, y, VW, h);
    }
  }

  function drawHud() {
    ctx.save();
    ctx.font = "bold 30px 'Share Tech Mono', monospace";
    ctx.textBaseline = "top";
    const shown = mode === "rta" ? runFrames : stageFrames;
    const txt = fmt(shown);
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(10, 10, 190, 60);
    ctx.fillStyle = state === "clear" ? "#ffe066" : "#fff";
    ctx.fillText(txt, 20, 14);
    ctx.font = "13px 'DotGothic16', monospace";
    ctx.fillStyle = "#aab";
    ctx.fillText(`${lvl.name} ${lvl.title}  ✖${deaths}`, 20, 48);
    if (mode === "il") { ctx.fillStyle = "#ff5cf0"; ctx.fillText("PRACTICE", 130, 48); }
    // 右上: 自己ベスト
    ctx.textAlign = "right";
    ctx.font = "13px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,.55)";
    const best = mode === "rta" ? save.pb : save.il[lvl.id];
    ctx.fillText(best != null ? `PB ${fmt(best)}` : "PB --:--.---", VW - 14, 14);
    ctx.textAlign = "left";
    if (state === "clear") {
      ctx.textAlign = "center";
      ctx.font = "bold 42px 'DotGothic16', monospace";
      ctx.fillStyle = "#ffe066";
      ctx.fillText("CLEAR", VW / 2, VH / 2 - 60);
      ctx.font = "bold 26px 'Share Tech Mono', monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText(fmt(mode === "rta" ? runFrames : stageFrames), VW / 2, VH / 2 - 10);
      if (lastSplitDiff != null) {
        ctx.fillStyle = lastSplitDiff < 0 ? "#6dff8a" : lastSplitDiff > 0 ? "#ff6d6d" : "#fff";
        ctx.fillText(fmtDiff(lastSplitDiff), VW / 2, VH / 2 + 24);
      }
      ctx.textAlign = "left";
    }
    ctx.restore();
  }

  const dbg = { frozen: false };
  // ===== メインループ =====
  let acc = 0, last = performance.now();
  function tick(now) {
    let dt = now - last; last = now;
    if (dt > 250) dt = 250;
    acc += dt;
    let n = 0;
    while (acc >= 1000 / 60 && n < 6) {
      if (!dbg.frozen) update();
      acc -= 1000 / 60;
      n++;
    }
    if (n >= 6) acc = 0;
    draw();
    requestAnimationFrame(tick);
  }
  function update() {
    frameNo++;
    if (state === "play") {
      if (pressed.retry && !p.dead) { p.dead = 1; }
      runFrames++; stageFrames++;
      stepPlayer();
    } else if (state === "clear") {
      clearT--;
      if (clearT <= 0) afterClear();
    }
    for (const q of particles) { q.x += q.vx; q.y += q.vy; q.vy += 0.12; q.life--; }
    particles = particles.filter((q) => q.life > 0);
    for (const g of ghosts) g.life--;
    ghosts = ghosts.filter((g) => g.life > 0);
    for (const k in pressed) pressed[k] = false;
  }

  function onEsc() {
    if (state === "play") { state = "pause"; ui.pause(true); }
    else if (state === "pause") { state = "play"; ui.pause(false); }
  }

  // ===== UI =====
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bugCount = () => BUGS.filter((b) => save.bugs[b.id]).length;

  function showStageBanner() {
    const el = $("banner");
    el.innerHTML = `<small>${esc(lvl.name)}</small>${esc(lvl.title)}`;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  }
  let toastTimer = null;
  function showBugToast(b) {
    const el = $("bugToast");
    el.innerHTML = `<div class="bt-h">⚠ UNEXPECTED BEHAVIOR <span>ERR_${b.no}</span></div><div class="bt-n">${esc(b.name)}</div><div class="bt-s">バグ図鑑に記録されました（${bugCount()}/${BUGS.length}）</div>`;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
  }

  const ui = {
    hideAll() { document.querySelectorAll(".screen").forEach((e) => e.classList.add("hidden")); },
    show(id) { this.hideAll(); $(id).classList.remove("hidden"); },
    hud(on) { document.body.classList.toggle("playing", on); },
    title() {
      state = "title";
      this.hud(false);
      this.show("titleScreen");
      $("tPb").textContent = save.pb != null ? fmt(save.pb) : "--:--.---";
      $("tBugs").textContent = `${bugCount()}/${BUGS.length}`;
      $("tRuns").textContent = save.runs;
    },
    practice() {
      this.show("practiceScreen");
      $("stageList").innerHTML = STAGE_DEFS.map((s, i) => `
        <button class="stageBtn" data-i="${i}">
          <span class="sn">${esc(s.name)}</span><span class="st">${esc(s.title)}</span>
          <span class="sb">${save.il[s.id] != null ? fmt(save.il[s.id]) : "--:--.---"}</span>
        </button>`).join("");
      $("stageList").querySelectorAll(".stageBtn").forEach((b) => b.onclick = () => startRun("il", +b.dataset.i));
    },
    dex() {
      this.show("dexScreen");
      const hintsOpen = save.cleared;
      $("dexNote").textContent = hintsOpen
        ? "ヒントが開放されています。"
        : "一度でも全ステージをクリアすると、未発見のバグのヒントが表示されます。";
      $("dexList").innerHTML = BUGS.map((b) => {
        const found = !!save.bugs[b.id];
        return `<div class="dexRow ${found ? "found" : ""}">
          <div class="dx-no">ERR_${b.no}</div>
          <div class="dx-body"><div class="dx-name">${found ? esc(b.name) : "？？？？？"}</div>
          <div class="dx-hint">${found || hintsOpen ? esc(b.hint) : "―――"}</div></div>
          <div class="dx-st">${found ? "発見済" : "未発見"}</div></div>`;
      }).join("");
      $("dexCount").textContent = `${bugCount()}/${BUGS.length}`;
    },
    async rank() {
      this.show("rankScreen");
      const list = $("rankList");
      list.textContent = "読み込み中…";
      try {
        const rows = await Ranking.top(50);
        list.innerHTML = rows.length ? rows.map((r, i) => `
          <div class="rankRow ${r.name === save.name ? "me" : ""}">
            <span class="rk">${i + 1}</span><span class="rn">${esc(r.name)}</span>
            <span class="rt">${fmt(Math.round(r.time_ms * 60 / 1000))}</span>
            <span class="rx">🐞${r.bugs | 0} ✖${r.deaths | 0}</span>
          </div>`).join("") : "まだ記録がありません。一番乗りのチャンス！";
      } catch (e) {
        list.textContent = "読み込みに失敗しました。";
      }
    },
    pause(on) {
      if (on) this.show("pauseScreen"); else this.hideAll();
    },
    ilResult() {
      this.show("ilScreen");
      $("ilTitle").textContent = `${lvl.name} ${lvl.title}`;
      $("ilTime").textContent = fmt(stageFrames);
      const best = save.il[lvl.id];
      $("ilBest").textContent = best != null ? fmt(best) : "-";
      $("ilNew").classList.toggle("hidden", !(best === stageFrames));
      $("ilUsed").textContent = Object.keys(runBugs).length ? Object.keys(runBugs).map((id) => BUGS.find((b) => b.id === id).name).join(" / ") : "なし";
    },
    result({ frames, newPb, prevPb, firstClear }) {
      this.show("resultScreen");
      $("rTime").textContent = fmt(frames);
      $("rNew").classList.toggle("hidden", !newPb);
      $("rPrev").textContent = prevPb != null ? `前回PB ${fmt(prevPb)}（${fmtDiff(frames - prevPb)}）` : "初完走！";
      $("rDeaths").textContent = deaths;
      const used = Object.keys(runBugs);
      $("rBugs").textContent = used.length ? used.map((id) => BUGS.find((b) => b.id === id).name).join(" / ") : "なし（正攻法）";
      $("rSplits").innerHTML = splits.map((f, i) => {
        const seg = f - (i ? splits[i - 1] : 0);
        return `<div><span>${esc(STAGE_DEFS[i].title)}</span><b>${fmt(seg)}</b><em>${fmt(f)}</em></div>`;
      }).join("");
      $("rFirst").classList.toggle("hidden", !firstClear);
      $("nameInput").value = save.name;
      const canSubmit = !TEST_MODE && (save.submitted == null || frames < save.submitted);
      $("submitBox").classList.toggle("hidden", !canSubmit);
      $("submitMsg").textContent = TEST_MODE ? "🧪 テストモード：送信されません"
        : canSubmit ? "" : `世界ランキングには自己ベスト ${fmt(save.submitted)} が登録済みです。`;
      $("submitBtn").disabled = false;
      $("submitBtn").onclick = async () => {
        const name = $("nameInput").value.trim().slice(0, 12);
        if (!name) { $("submitMsg").textContent = "名前を入力してください。"; return; }
        save.name = name; persist();
        $("submitBtn").disabled = true;
        $("submitMsg").textContent = "送信中…";
        const ms = Math.round(frames * 1000 / 60);
        try {
          await Ranking.submit({ id: save.pid, name, time_ms: ms, bugs: used.length, deaths, updated_at: new Date().toISOString() });
          save.submitted = frames; persist();
          $("submitBox").classList.add("hidden");
          const r = await Ranking.rankOf(ms).catch(() => null);
          $("submitMsg").textContent = r ? `登録しました！ 世界 ${r} 位` : "登録しました！";
        } catch (e) {
          $("submitBtn").disabled = false;
          $("submitMsg").textContent = "送信に失敗しました。時間をおいて再度お試しください。";
        }
      };
    },
  };

  $("btnRta").onclick = () => startRun("rta", 0);
  $("btnPractice").onclick = () => ui.practice();
  $("btnDex").onclick = () => ui.dex();
  $("btnRank").onclick = () => ui.rank();
  $("btnHelp").onclick = () => ui.show("helpScreen");
  document.querySelectorAll("[data-back]").forEach((b) => b.onclick = () => ui.title());
  $("btnResume").onclick = () => { state = "play"; ui.pause(false); };
  $("btnRestartRun").onclick = () => startRun(mode, mode === "rta" ? 0 : stageIdx);
  $("btnQuit").onclick = () => ui.title();
  $("btnAgain").onclick = () => startRun("rta", 0);
  $("btnIlAgain").onclick = () => startRun("il", stageIdx);
  $("btnIlNext").onclick = () => startRun("il", (stageIdx + 1) % STAGE_DEFS.length);
  $("pauseBtn").onclick = () => onEsc();

  // タイトル背景用にステージ1を読み込んでおく
  lvl = buildLevel(STAGE_DEFS[0]);
  p = newPlayer(lvl.start.c * TILE + 5, (lvl.start.r + 1) * TILE - PH);
  prerender(); snapCam();
  ui.title();
  requestAnimationFrame(tick);

  // デバッグ用フック（検証用）
  window.GR = {
    get p() { return p; }, get lvl() { return lvl; }, get state() { return state; },
    keys, pressed, update, dbg, startRun, loadStage, save, get runFrames() { return runFrames; },
    tp(c, r) { p.x = c * TILE + 5; p.y = (r + 1) * TILE - p.h; p.vx = p.vy = 0; },
  };
})();
