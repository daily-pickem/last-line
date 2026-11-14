// LAST LINE — offline goalkeeper arcade prototype. No network, no accounts. Saves to localStorage only.
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const HALF_W = 3.66, GOAL_H = 2.44, BALL_R = 0.11, K = 8, NET_D = 1.3, PITCH_Z = 36;
  const KEEPER_Z = 0.25;
  let W = 0, H = 0, DPR = 1, S0 = 50, CX = 0, GL_Y = 0, HOR_Y = 0;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const hash = location.hash.slice(1);
  const HOOK = Object.fromEntries(hash.split('&').filter(Boolean).map(p => { const [k, v] = p.split('='); return [k, v === undefined ? true : v]; }));

  // ---------- persistence ----------
  const SAVE_KEY = 'lastline_v1';
  const DEFAULTS = { coins: 0, best: 0, bestScore: 0, runs: 0, upg: { grip: 0, spring: 0, stretch: 0, heart: 0 },
    glove: 'classic', ownedGloves: ['classic'], kit: 'emerald', ownedKits: ['emerald'], pro: false, muted: false };
  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) return { ...DEFAULTS, ...s, upg: { ...DEFAULTS.upg, ...(s.upg || {}) } }; } catch (e) { /* fresh */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  const save = load();
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };

  const GLOVES = [
    { id: 'classic', name: 'Classic', a: '#f8fafc', b: '#16a34a', cost: 0 },
    { id: 'volt', name: 'Volt', a: '#d9f99d', b: '#1f2937', cost: 300 },
    { id: 'lava', name: 'Lava', a: '#fb923c', b: '#7f1d1d', cost: 500 },
    { id: 'ice', name: 'Glacier', a: '#a5f3fc', b: '#1e3a8a', cost: 500 },
    { id: 'galaxy', name: 'Galaxy', a: '#d8b4fe', b: '#312e81', cost: 900 },
    { id: 'gold', name: 'Gold Std', a: '#fde047', b: '#a16207', cost: -1 },
  ];
  const KITS = [
    { id: 'emerald', name: 'Emerald', shirt: '#10b981', trim: '#064e3b', shorts: '#0f172a', cost: 0 },
    { id: 'pink', name: 'Hi-Vis', shirt: '#f472b6', trim: '#831843', shorts: '#1f2937', cost: 300 },
    { id: 'midnight', name: 'Midnight', shirt: '#1e293b', trim: '#38bdf8', shorts: '#0f172a', cost: 400 },
    { id: 'tiger', name: 'Tiger', shirt: '#f59e0b', trim: '#111827', shorts: '#111827', cost: 600 },
    { id: 'lime', name: 'Acid', shirt: '#bef264', trim: '#14532d', shorts: '#14532d', cost: 750 },
    { id: 'royal', name: 'Royal', shirt: '#7c3aed', trim: '#fde047', shorts: '#2e1065', cost: -1 },
  ];
  const UPGRADES = [
    { id: 'grip', name: 'Grip', desc: 'Bigger gloves, more catches', max: 5, base: 120 },
    { id: 'spring', name: 'Spring', desc: 'Faster dives', max: 5, base: 150 },
    { id: 'stretch', name: 'Stretch', desc: 'Reach deeper into corners', max: 5, base: 150 },
    { id: 'heart', name: 'Big Heart', desc: '+1 starting life', max: 2, base: 600 },
  ];
  const upCost = (u, lvl) => Math.round(u.base * Math.pow(1.85, lvl) / 10) * 10;
  const gloveDef = () => GLOVES.find(g => g.id === save.glove) || GLOVES[0];
  const kitDef = () => KITS.find(k => k.id === save.kit) || KITS[0];
  const gloveR = () => 0.36 + 0.05 * save.upg.grip;
  const maxReach = () => 3.1 + 0.16 * save.upg.stretch;
  const diveDur = d => (0.15 + 0.07 * d) * Math.pow(0.92, save.upg.spring);

  // ---------- strikers ----------
  const STRIKERS = {
    rookie: { name: 'Rookie', shirt: '#3b82f6', shorts: '#1e3a8a', T: 1.25, bend: 0, arc: 0.35, dist: [11, 13], xr: 2, runup: 0.9 },
    winger: { name: 'Winger', shirt: '#f97316', shorts: '#7c2d12', T: 1.2, bend: 2.0, arc: 0.45, dist: [15, 19], xr: 7, runup: 0.85 },
    cannon: { name: 'Cannon', shirt: '#ef4444', shorts: '#450a0a', T: 0.7, bend: 0.35, arc: 0.12, dist: [14, 18], xr: 4, runup: 0.75 },
    chipper: { name: 'Chipper', shirt: '#a855f7', shorts: '#3b0764', T: 1.4, bend: 0.4, arc: 2.4, dist: [13, 16], xr: 4, runup: 0.9, high: true },
    mago: { name: 'EL MAGO', boss: true, shirt: '#0ea5e9', shorts: '#f8fafc', T: 1.3, bend: 2.8, arc: 2.0, dist: [21, 24], xr: 7, runup: 1.0, high: true, wall: true, hp: 3, title: 'Free-kick wizard. Bends it over the wall.' },
    stutter: { name: 'THE STUTTER', boss: true, shirt: '#e11d48', shorts: '#111827', T: 0.8, bend: 0.2, arc: 0.3, dist: [11, 11], xr: 0, runup: 1.7, stutter: true, hp: 3, title: 'Penalty trickster. Dive early and he reads you.' },
    bertha: { name: 'BIG BERTHA', boss: true, shirt: '#facc15', shorts: '#111827', T: 0.56, bend: 0.6, arc: 0.1, dist: [17, 20], xr: 5, runup: 0.8, hp: 4, title: 'Rocket boots. No time to think.' },
  };
  const BOSS_ORDER = ['mago', 'stutter', 'bertha'];
  function stagePlan(n) {
    if (n % 4 === 0) return { boss: BOSS_ORDER[(n / 4 - 1) % 3] };
    const pool = n < 6 ? ['rookie'] : [];
    if (n >= 2) pool.push('winger');
    if (n >= 3) pool.push('cannon');
    if (n >= 5) pool.push('chipper');
    return { shots: 5 + Math.min(3, Math.floor((n - 1) / 3)), pool };
  }
  const speedFactor = n => Math.min(1.6, 1 + 0.045 * (n - 1));

  // ---------- state ----------
  let phase = 'title', phaseT = 0, paused = false, timeScale = 1, clock = 0;
  let run = null, shot = null;
  const ball = { x: 0, y: BALL_R, z: 11, vx: 0, vy: 0, vz: 0, mode: 'spot', spin: 0, trail: [], bounces: 0 };
  const keeper = { x: 0, hx: 0, hy: 1.2, fx: 0, fy: 1.2, tx: 0, ty: 1.2, t: 0, dur: 0, diving: false, early: false };
  const fx = { texts: [], parts: [], flash: 0, flashCol: '#ef4444', shake: 0, net: null, banner: null, cam: 0 };
  let stands = null;

  // ---------- projection ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    S0 = Math.min(W * 0.95 / (HALF_W * 2), H * 0.2 / GOAL_H);
    CX = W / 2;
    GL_Y = H * 0.79;
    HOR_Y = H * 0.30;
    buildStands();
  }
  function proj(x, y, z) {
    const s = K / (z + K);
    return { x: CX + x * S0 * s, y: HOR_Y + (GL_Y - HOR_Y) * s - y * S0 * s, s: S0 * s };
  }
  const groundY = z => HOR_Y + (GL_Y - HOR_Y) * K / (z + K);

  function buildStands() {
    stands = document.createElement('canvas');
    stands.width = Math.round(W * DPR); stands.height = Math.round(H * DPR);
    const c = stands.getContext('2d'); c.scale(DPR, DPR);
    const top = HOR_Y - H * 0.2, bot = groundY(PITCH_Z) - 1.1 * S0 * K / (PITCH_Z + K);
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#0d1a33'); g.addColorStop(1, '#1d2b4a');
    c.fillStyle = g; c.fillRect(0, top, W, bot - top);
    const cols = ['#e2e8f0', '#f87171', '#60a5fa', '#fbbf24', '#34d399', '#f472b6', '#c4b5fd', '#94a3b8'];
    for (let y = top + 4; y < bot - 2; y += 5.5) {
      const rowShade = (y - top) / (bot - top);
      c.fillStyle = `rgba(0,0,0,${0.25 - rowShade * 0.15})`; c.fillRect(0, y, W, 1.2);
      for (let x = (y * 7) % 6; x < W; x += 5 + Math.random() * 2) {
        c.globalAlpha = 0.35 + rowShade * 0.5;
        c.fillStyle = cols[(Math.random() * cols.length) | 0];
        c.fillRect(x, y - 2.2, 2.6, 2.6);
      }
    }
    c.globalAlpha = 1;
    // roof edge + floodlights
    c.fillStyle = '#050b18'; c.fillRect(0, 0, W, top + 2);
    c.fillStyle = '#0f172a'; c.fillRect(0, top - 6, W, 8);
    [W * 0.12, W * 0.5, W * 0.88].forEach(x => {
      const lg = c.createRadialGradient(x, top - 2, 2, x, top - 2, W * 0.35);
      lg.addColorStop(0, 'rgba(255,250,220,0.55)'); lg.addColorStop(1, 'rgba(255,250,220,0)');
      c.fillStyle = lg; c.fillRect(x - W * 0.35, top - W * 0.35, W * 0.7, W * 0.7);
      c.fillStyle = '#fffbe6'; for (let i = -2; i <= 2; i++) c.fillRect(x + i * 7 - 2.5, top - 4, 5, 4);
    });
  }

  // ---------- run lifecycle ----------
  function newRun() {
    const startStage = HOOK.stage ? Math.max(1, parseInt(HOOK.stage, 10) || 1) : 1;
    const maxH = 3 + save.upg.heart;
    run = { stage: startStage, hearts: maxH, maxHearts: maxH, score: 0, saves: 0, catches: 0, conceded: 0, streak: 0, bestStreak: 0,
      focus: 0, focusArmed: false, shotIdx: 0, plan: null, bossHp: 0, revived: false, bosses: 0, faced: 0 };
    save.runs++; persist();
    startStage_(run.stage);
  }
  function startStage_(n) {
    run.stage = n; run.plan = stagePlan(n); run.shotIdx = 0;
    if (run.plan.boss) { run.bossHp = STRIKERS[run.plan.boss].hp; AudioFX.play('boss'); }
    fx.banner = run.plan.boss
      ? { big: STRIKERS[run.plan.boss].name, small: 'BOSS · STAGE ' + n, sub: STRIKERS[run.plan.boss].title, col: '#facc15' }
      : { big: 'STAGE ' + n, small: n === 1 ? 'KICK-OFF' : 'NEXT WAVE', sub: run.plan.shots + ' shots incoming', col: '#a3e635' };
    setPhase('intro');
    updateHud();
  }
  function setPhase(p) { phase = p; phaseT = 0; }

  function newShot() {
    const plan = run.plan;
    const typeId = plan.boss || plan.pool[(Math.random() * plan.pool.length) | 0];
    const def = STRIKERS[typeId];
    const sp = speedFactor(run.stage);
    const sz = rand(def.dist[0], def.dist[1]);
    const sx = def.xr ? rand(-def.xr, def.xr) : 0;
    const maxTx = Math.min(3.35, 2.2 + 0.13 * run.stage);
    let tx = rand(0.6, maxTx) * (Math.random() < 0.5 ? -1 : 1);
    if (Math.random() < 0.18) tx = rand(-1.2, 1.2);
    let ty = def.high ? rand(1.5, 2.2) : rand(0.2, 2.15);
    let post = false;
    if (run.faced > 3 && Math.random() < 0.06) { post = true; tx = (HALF_W + 0.02) * Math.sign(tx); ty = rand(0.4, 2.2); }
    const bend = def.bend * (sx > 0 ? -1 : 1) * rand(0.7, 1.1) * (Math.random() < 0.25 ? -1 : 1);
    shot = { typeId, def, sx, sz, tx, ty, T: def.T / sp, bend, arc: def.arc * rand(0.8, 1.15), u: 0, kicked: false, runT: 0,
      runup: def.runup, resolved: false, post, result: null, kickPose: 0, wallHop: 0, aside: sx >= 0 ? -1 : 1 };
    ball.mode = 'spot'; ball.x = sx; ball.y = BALL_R; ball.z = sz; ball.trail = []; ball.spin = 0; ball.bounces = 0;
    keeper.x = clamp(sx * 0.1, -0.5, 0.5); keeper.hx = keeper.fx = keeper.tx = keeper.x; keeper.hy = keeper.fy = keeper.ty = 1.2;
    keeper.diving = false; keeper.early = false; keeper.t = 0; keeper.dur = 0;
    timeScale = 1;
    run.focusArmedThisShot = false;
    setPhase('runup');
    AudioFX.play('whistle');
  }

  function kick() {
    shot.kicked = true; shot.kickPose = 1; shot.wallHop = 1;
    if (keeper.diving && keeper.early) {
      // striker reads the early dive and goes the other way
      const side = keeper.tx >= keeper.x ? -1 : 1;
      shot.tx = side * rand(2.2, Math.min(3.3, 2.4 + 0.1 * run.stage));
      shot.ty = rand(0.3, 2.0); shot.post = false;
      shot.bend *= 0.3;
    }
    if (run.focus >= 1 && !HOOK.nofocus) {
      run.focus = 0; run.focusArmedThisShot = true; timeScale = 0.42; AudioFX.play('focus');
      addText('FOCUS', W / 2, H * 0.45, '#38bdf8', 34);
    }
    ball.mode = 'flight'; ball.trail = [];
    AudioFX.play('kick');
    updateHud();
  }

  function ballAt(u) {
    const s = shot;
    const late = 6.75 * u * u * (1 - u);
    return { x: lerp(s.sx, s.tx, u) + s.bend * late, y: lerp(BALL_R, s.ty, u) + s.arc * 4 * u * (1 - u), z: s.sz * (1 - u) };
  }

  // ---------- keeper ----------
  function dive(gx, gy) {
    if (keeper.diving || !shot || shot.resolved || !(phase === 'runup' || phase === 'flight')) return;
    const ox = keeper.x, oy = 1.2;
    gy = clamp(gy, 0.15, 2.65);
    let dx = gx - ox, dy = gy - oy; const d = Math.hypot(dx, dy); const R = maxReach();
    if (d > R) { dx *= R / d; dy *= R / d; }
    keeper.tx = ox + dx; keeper.ty = oy + dy;
    keeper.fx = keeper.hx; keeper.fy = keeper.hy;
    keeper.dur = diveDur(Math.min(d, R)); keeper.t = 0; keeper.diving = true;
    keeper.early = !shot.kicked;
    if (window.navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* noop */ }
  }
  function keeperFeet() {
    let fx_ = keeper.x + (keeper.hx - keeper.x) * 0.3, fy_ = Math.max(0, keeper.hy - 2.0);
    const dx = keeper.hx - fx_, dy = keeper.hy - fy_, L = Math.hypot(dx, dy);
    if (L > 2.1) { fx_ = keeper.hx - dx * 2.1 / L; fy_ = Math.max(0, keeper.hy - dy * 2.1 / L); }
    return { x: fx_, y: fy_ };
  }
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay; const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  }

  function resolveShot() {
    shot.resolved = true;
    const bx = shot.tx, by = shot.ty;
    const R = gloveR() + BALL_R;
    const dH = Math.hypot(bx - keeper.hx, by - keeper.hy);
    const F = keeperFeet();
    const Sx = lerp(F.x, keeper.hx, 0.78), Sy = lerp(F.y, keeper.hy, 0.78);
    let res;
    if (dH < R) res = dH < R * 0.45 ? 'catch' : 'tip';
    else if (segDist(bx, by, F.x, F.y, Sx, Sy) < 0.26 + BALL_R) res = 'block';
    else if (shot.post) res = 'post';
    else res = 'goal';
    shot.result = res;
    run.faced++;
    const p = proj(bx, by, 0);
    const mult = 1 + 0.25 * Math.floor(run.streak / 3);
    if (res === 'catch' || res === 'tip' || res === 'block') {
      run.saves++; run.streak++; run.bestStreak = Math.max(run.bestStreak, run.streak);
      const base = res === 'catch' ? 150 : res === 'tip' ? 100 : 80;
      const pts = Math.round(base * mult);
      run.score += pts;
      run.focus = Math.min(1, run.focus + (res === 'catch' ? 0.34 : res === 'tip' ? 0.15 : 0.1));
      if (res === 'catch') { run.catches++; ball.mode = 'held'; AudioFX.play('catch'); burst(p.x, p.y, gloveDef().a, 22); }
      else {
        ball.mode = 'loose'; ball.x = bx; ball.y = by; ball.z = 0;
        if (res === 'tip') { ball.vx = Math.sign(bx - keeper.hx || bx) * rand(3, 5); ball.vy = by > 1.6 ? 4 : 2.5; ball.vz = -2.2; AudioFX.play('tip'); burst(p.x, p.y, '#e0f2fe', 12); }
        else { ball.vx = rand(-2, 2); ball.vy = 2.2; ball.vz = 6; AudioFX.play('block'); burst(p.x, p.y, '#ffffff', 10); }
      }
      AudioFX.crowd(res === 'catch' ? 'cheer' : 'ooh');
      const label = { catch: 'CATCH!', tip: 'TIPPED!', block: 'BLOCKED!' }[res];
      addText(label, p.x, p.y - 30, res === 'catch' ? '#facc15' : '#7dd3fc', 30);
      addText('+' + pts + (mult > 1 ? '  x' + mult.toFixed(2).replace(/\.?0+$/, '') : ''), p.x, p.y + 2, '#ffffff', 16);
      if (run.plan.boss) { run.bossHp--; }
      fx.shake = res === 'catch' ? 4 : 2;
    } else if (res === 'post') {
      ball.mode = 'loose'; ball.x = bx; ball.y = by; ball.z = 0; ball.vx = -Math.sign(bx) * rand(1.5, 3); ball.vy = 2; ball.vz = 5;
      AudioFX.play('post'); AudioFX.crowd('ooh');
      addText('OFF THE POST!', p.x - Math.sign(bx) * 60, p.y - 20, '#e2e8f0', 24);
      fx.shake = 3;
    } else {
      run.hearts--; run.conceded++; run.streak = 0;
      ball.mode = 'net'; ball.x = bx; ball.y = by; ball.z = 0; ball.vx = (bx - shot.sx) / shot.T * 0.15; ball.vy = 0; ball.vz = -9;
      fx.net = { x: bx, y: by, t: 0 }; fx.flash = 0.5; fx.flashCol = '#ef4444'; fx.shake = 9;
      AudioFX.play('net'); AudioFX.crowd('groan');
      addText('GOAL', W / 2, H * 0.42, '#ef4444', 54);
      if (keeper.early) addText('He read your early dive', W / 2, H * 0.42 + 40, '#fecaca', 15);
      else if (!keeper.diving) addText('No dive!', W / 2, H * 0.42 + 40, '#fecaca', 15);
    }
    timeScale = 1;
    setPhase('result');
    updateHud();
  }

  function afterResult() {
    if (run.hearts <= 0) return gameOver();
    run.shotIdx++;
    const plan = run.plan;
    const done = plan.boss ? run.bossHp <= 0 : run.shotIdx >= plan.shots;
    if (done) {
      const bonus = plan.boss ? 500 : 200;
      run.score += bonus;
      if (plan.boss) { run.bosses++; run.hearts = Math.min(run.maxHearts, run.hearts + 1); }
      fx.banner = { big: plan.boss ? 'BOSS BEATEN' : 'STAGE CLEAR', small: 'STAGE ' + run.stage, sub: '+' + bonus + (plan.boss ? '  ·  +1 life' : ''), col: plan.boss ? '#facc15' : '#a3e635' };
      AudioFX.crowd('roar'); AudioFX.play('coin');
      setPhase('clear');
      updateHud();
      return;
    }
    newShot();
  }

  let lastCoins = 0;
  function gameOver() {
    setPhase('over');
    lastCoins = Math.floor(run.score / 25) + run.bosses * 40;
    if (save.pro) lastCoins *= 2;
    save.coins += lastCoins;
    save.best = Math.max(save.best, run.stage);
    save.bestScore = Math.max(save.bestScore, run.score);
    persist();
    $('oTitle').textContent = run.stage >= 4 ? 'WHAT A RUN' : 'THE NET BROKE';
    $('oSub').textContent = 'Reached stage ' + run.stage + ' · best streak ' + run.bestStreak;
    $('oScore').textContent = run.score.toLocaleString();
    $('oSaves').textContent = run.saves; $('oCatch').textContent = run.catches;
    $('oCoins').textContent = lastCoins;
    const rb = $('reviveBtn');
    rb.style.display = run.revived ? 'none' : 'flex';
    rb.textContent = save.pro ? 'SECOND LIFE · Free with Pro' : 'SECOND LIFE · Watch ad';
    setTimeout(() => { if (phase === 'over') show('over'); }, 900);
    $('hint').style.display = 'none';
  }
  function revive() {
    const go = () => {
      run.revived = true; run.hearts = 1; hideAll(); $('hud').style.display = 'block';
      save.coins -= lastCoins; persist(); // coins re-awarded at the real end of the run
      addText('SECOND LIFE', W / 2, H * 0.45, '#a3e635', 34);
      run.shotIdx++; newShot(); updateHud();
    };
    if (save.pro) return go();
    show('ad'); let n = 3; $('adCount').textContent = n;
    const iv = setInterval(() => { n--; $('adCount').textContent = n; if (n <= 0) { clearInterval(iv); go(); } }, 1000);
  }

  // ---------- update ----------
  function update(dt) {
    clock += dt;
    phaseT += dt;
    fx.flash = Math.max(0, fx.flash - dt);
    fx.shake = Math.max(0, fx.shake - dt * 30);
    fx.texts.forEach(t => t.t += dt); fx.texts = fx.texts.filter(t => t.t < t.life);
    fx.parts.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; }); fx.parts = fx.parts.filter(p => p.t < p.life);
    if (fx.net) { fx.net.t += dt; if (fx.net.t > 1.4) fx.net = null; }

    if (phase === 'intro') { if (phaseT > (HOOK.fast ? 0.3 : 1.6)) { fx.banner = null; newShot(); } return; }
    if (phase === 'clear') { if (phaseT > (HOOK.fast ? 0.3 : 1.8)) { fx.banner = null; startStage_(run.stage + 1); } return; }
    if (!shot) return;
    const gdt = dt * timeScale;

    // keeper animation
    if (keeper.diving) {
      keeper.t = Math.min(1, keeper.t + gdt / keeper.dur);
      const e = easeOut(keeper.t);
      keeper.hx = lerp(keeper.fx, keeper.tx, e); keeper.hy = lerp(keeper.fy, keeper.ty, e);
    } else if (phase === 'runup' || phase === 'flight') {
      keeper.hy = 1.2 + Math.sin(clock * 6) * 0.03; keeper.hx = keeper.x + Math.sin(clock * 3) * 0.04;
    }
    shot.kickPose = Math.max(0, shot.kickPose - dt * 3);
    shot.wallHop = Math.max(0, shot.wallHop - dt * 1.6);

    if (phase === 'runup') {
      shot.runT += gdt;
      if (shot.runT >= shot.runup) kick(), setPhase('flight');
    } else if (phase === 'flight') {
      shot.u = Math.min(1, shot.u + gdt / shot.T);
      const p = ballAt(shot.u);
      ball.x = p.x; ball.y = p.y; ball.z = p.z; ball.spin += gdt * 25;
      pushTrail();
      if (HOOK.autoplay && !keeper.diving && shot.u > 0.12) dive(shot.tx + rand(-0.08, 0.08), shot.ty + rand(-0.08, 0.08));
      if (shot.u >= 1) resolveShot();
    } else if (phase === 'result') {
      if (ball.mode === 'held') { ball.x = keeper.hx; ball.y = keeper.hy; ball.z = 0.05; }
      else if (ball.mode === 'loose') {
        ball.vy -= 9.8 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt; ball.spin += dt * 12;
        if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) * 0.5; ball.vx *= 0.8; ball.vz *= 0.8; if (ball.bounces++ < 2) AudioFX.play('bounce'); }
      } else if (ball.mode === 'net') {
        ball.x += ball.vx * dt; ball.z += ball.vz * dt; ball.vz *= Math.pow(0.02, dt);
        if (ball.z < -NET_D + 0.15) { ball.z = -NET_D + 0.15; ball.vz = 0; }
        ball.vy -= 9.8 * dt * (ball.z < -NET_D + 0.3 ? 1 : 0); ball.y = Math.max(BALL_R, ball.y + ball.vy * dt);
      }
      pushTrail(true);
      if (phaseT > (HOOK.fast ? 0.5 : 1.25)) afterResult();
    }
  }
  function pushTrail(decay) {
    const p = proj(ball.x, ball.y, ball.z);
    if (!decay) ball.trail.push({ x: p.x, y: p.y, r: p.s * BALL_R * 1.5 });
    else ball.trail.shift();
    if (ball.trail.length > 10) ball.trail.shift();
  }

  // ---------- effects ----------
  function addText(s, x, y, col, size) { fx.texts.push({ s, x, y, col, size, t: 0, life: 1.1 }); }
  function burst(x, y, col, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = rand(120, 320); fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, col, t: 0, life: rand(0.4, 0.8), r: rand(2, 4) }); }
  }

  // ---------- render ----------
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake));
    ctx.drawImage(stands, 0, 0, W, H);
    // flashes in the crowd
    for (let i = 0; i < 3; i++) if (Math.random() < 0.08) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(Math.random() * W, rand(HOR_Y - H * 0.18, groundY(PITCH_Z) - 30), 2, 2); }
    drawPitch();
    drawBoards();
    if (shot) {
      if (shot.def.wall) drawWall();
      drawStriker();
    }
    drawKeeper(true);
    if (ball.z > 0.05 || ball.mode === 'spot') drawBall();
    drawGoalFrame();
    if (ball.z <= 0.05 && ball.mode !== 'spot') drawBall();
    if (ball.mode === 'held') drawKeeperGloves();
    drawNet();
    // focus vignette
    if (timeScale < 1) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      vg.addColorStop(0, 'rgba(14,165,233,0)'); vg.addColorStop(1, 'rgba(14,165,233,0.35)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (fx.flash > 0) { ctx.fillStyle = fx.flashCol; ctx.globalAlpha = fx.flash * 0.5; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    fx.parts.forEach(p => { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
    fx.texts.forEach(drawText);
    if (fx.banner) drawBanner();
    ctx.restore();
  }

  function quad(a, b, c, d, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
  function line3(pts, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => { const q = proj(p[0], 0, p[1]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke(); }

  function drawPitch() {
    const XW = 60;
    const zs = [-K + 0.6, -3];
    for (let z = 0; z < PITCH_Z; z += 3) zs.push(z);
    zs.push(PITCH_Z);
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      const shade = i % 2 ? '#2f9e44' : '#37b24d';
      quad(proj(-XW, 0, z0), proj(XW, 0, z0), proj(XW, 0, z1), proj(-XW, 0, z1), z0 < 0 ? (i % 2 ? '#2b8a3e' : '#2f9e44') : shade);
    }
    // light pool around the box
    const lp = proj(0, 0, 6);
    const rg = ctx.createRadialGradient(lp.x, lp.y, 10, lp.x, lp.y, W * 0.9);
    rg.addColorStop(0, 'rgba(255,255,230,0.12)'); rg.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = rg; ctx.fillRect(0, groundY(PITCH_Z), W, H);
    const lw = Math.max(1.2, S0 * 0.06), col = 'rgba(255,255,255,0.85)';
    line3([[-40, 0], [40, 0]], lw, col);
    line3([[-9.16, 0], [-9.16, 5.5], [9.16, 5.5], [9.16, 0]], lw * 0.8, col);
    line3([[-20.16, 0], [-20.16, 16.5], [20.16, 16.5], [20.16, 0]], lw * 0.7, col);
    const arc = []; for (let a = -0.93; a <= 0.93; a += 0.08) arc.push([Math.sin(a) * 9.15, 11 + Math.cos(a) * 9.15]);
    line3(arc.filter(p => p[1] > 16.5), lw * 0.6, col);
    const ps = proj(0, 0, 11); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(ps.x, ps.y, ps.s * 0.14, ps.s * 0.07, 0, 0, 7); ctx.fill();
  }

  function drawBoards() {
    const a = proj(-60, 0, PITCH_Z), b = proj(60, 1.0, PITCH_Z);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, b.y, W, a.y - b.y);
    const words = ['LAST LINE', 'GLOVEWORKS', 'NET SPORTS', 'CLEAN SHEET', 'KEEPER CO.'];
    const h = a.y - b.y; ctx.font = `900 ${Math.max(7, h * 0.62)}px system-ui`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const seg = W / 3.2, off = (clock * 18) % seg;
    for (let i = -1; i < 5; i++) {
      const x = i * seg - off + seg / 2;
      ctx.fillStyle = ['#0ea5e9', '#16a34a', '#e11d48', '#7c3aed', '#f59e0b'][(i + 5) % 5];
      ctx.fillRect(x - seg / 2 + 1, b.y + 1, seg - 2, h - 2);
      ctx.fillStyle = '#fff'; ctx.fillText(words[(i + 5) % 5], x, b.y + h / 2);
    }
  }

  function person(x, y, z, o) {
    // front-facing outfield player; o: {shirt, shorts, lean, kick, hop, sway, num}
    const g = proj(x + (o.sway || 0), (o.hop || 0), z); const s = g.s;
    ctx.save(); ctx.translate(g.x, g.y);
    // shadow
    const sh = proj(x, 0, z); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(sh.x - g.x, sh.y - g.y, s * 0.38, s * 0.1, 0, 0, 7); ctx.fill();
    ctx.lineCap = 'round';
    const legW = s * 0.17, kickA = o.kick || 0;
    ctx.strokeStyle = '#f1c27d'; ctx.lineWidth = legW;
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.9); ctx.lineTo(-s * 0.13 - (o.stride || 0) * s * 0.15, -s * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.1, -s * 0.9); ctx.lineTo(s * 0.13 + kickA * s * 0.35 + (o.stride || 0) * s * 0.15, -s * 0.08 - kickA * s * 0.35); ctx.stroke();
    ctx.fillStyle = '#111'; [[-s * 0.13 - (o.stride || 0) * s * 0.15, -s * 0.06], [s * 0.13 + kickA * s * 0.35 + (o.stride || 0) * s * 0.15, -s * 0.06 - kickA * s * 0.35]].forEach(([fx_, fy_]) => { ctx.beginPath(); ctx.ellipse(fx_, fy_, s * 0.1, s * 0.05, 0, 0, 7); ctx.fill(); });
    ctx.fillStyle = o.shorts; ctx.fillRect(-s * 0.22, -s * 1.0, s * 0.44, s * 0.24);
    ctx.fillStyle = o.shirt; roundRect(-s * 0.24, -s * 1.52, s * 0.48, s * 0.56, s * 0.08); ctx.fill();
    ctx.strokeStyle = o.shirt; ctx.lineWidth = s * 0.12;
    ctx.beginPath(); ctx.moveTo(-s * 0.22, -s * 1.44); ctx.lineTo(-s * 0.36, -s * 1.08 + (o.arm || 0) * s * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.22, -s * 1.44); ctx.lineTo(s * 0.36, -s * 1.08 - (o.arm || 0) * s * 0.2); ctx.stroke();
    ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(0, -s * 1.68, s * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = '#3f2a1a'; ctx.beginPath(); ctx.arc(0, -s * 1.72, s * 0.13, Math.PI, 0); ctx.fill();
    if (o.num && s > 14) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `900 ${s * 0.26}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.num, 0, -s * 1.25); }
    if (o.crown) { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(-s * 0.13, -s * 1.86); ctx.lineTo(-s * 0.13, -s * 2.0); ctx.lineTo(-s * 0.05, -s * 1.92); ctx.lineTo(0, -s * 2.04); ctx.lineTo(s * 0.05, -s * 1.92); ctx.lineTo(s * 0.13, -s * 2.0); ctx.lineTo(s * 0.13, -s * 1.86); ctx.fill(); }
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawStriker() {
    const s = shot, d = s.def;
    let k = clamp(s.runT / s.runup, 0, 1), sway = 0, stride = 0;
    if (d.stutter && !s.kicked) {
      // run, freeze + shimmy, then strike
      if (k < 0.45) k = k / 0.45 * 0.6; else if (k < 0.8) { sway = Math.sin(clock * 14) * 0.25; k = 0.6; } else k = 0.6 + (k - 0.8) / 0.2 * 0.4;
    }
    if (!s.kicked) stride = Math.sin(s.runT * 18) * (k < 1 ? 1 : 0);
    const px = s.kicked ? s.sx - s.aside * 0.45 : lerp(s.sx - s.aside * 2.2, s.sx - s.aside * 0.45, k);
    const pz = s.kicked ? s.sz + 0.5 : lerp(s.sz + 2.6, s.sz + 0.5, k);
    person(px, 0, pz, { shirt: d.shirt, shorts: d.shorts, kick: s.kickPose, sway, stride, arm: stride, num: d.boss ? '' : String(7 + (s.sz | 0) % 5), crown: d.boss });
  }
  function drawWall() {
    const s = shot; const wz = Math.max(4, s.sz - 9.15);
    const dirx = (0 - s.sx) / s.sz; const cx = s.sx + dirx * 9.15;
    const hop = Math.sin(clamp(1 - s.wallHop, 0, 1) * Math.PI) * 0.5 * (s.kicked ? 1 : 0);
    for (let i = 0; i < 4; i++) person(cx + (i - 1.5) * 0.55, 0, wz, { shirt: '#f8fafc', shorts: '#111827', hop, arm: -0.5 });
  }

  function drawKeeper() {
    const kit = kitDef();
    const F = keeperFeet();
    const hx = keeper.hx, hy = keeper.hy;
    const dx = hx - F.x, dy = hy - F.y, L = Math.hypot(dx, dy) || 1;
    const px = -dy / L, py = dx / L; // perpendicular
    const at = (t, off = 0) => proj(F.x + dx * t + px * off, F.y + dy * t + py * off, KEEPER_Z);
    const sc = proj(0, 0, KEEPER_Z).s;
    // shadow
    const sh1 = proj(F.x, 0, KEEPER_Z), sh2 = proj(hx, 0, KEEPER_Z);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse((sh1.x + sh2.x) / 2, sh1.y, Math.abs(sh2.x - sh1.x) / 2 + sc * 0.35, sc * 0.09, 0, 0, 7); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const seg = (a, b, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w * sc; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
    // legs (socks + boots)
    const hip = at(0.42);
    seg(at(0, -0.16), hip, 0.19, kit.shirt === '#111827' ? '#334155' : kit.trim);
    seg(at(0, 0.16), hip, 0.19, kit.trim);
    seg(at(0.32, -0.12), at(0.48, 0), 0.34, kit.shorts);
    // torso (seen from behind)
    seg(at(0.46), at(0.76), 0.46, kit.shirt);
    seg(at(0.5), at(0.7), 0.1, kit.trim);
    // number on back
    const back = at(0.6);
    ctx.fillStyle = kit.trim; ctx.font = `900 ${sc * 0.26}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('1', back.x, back.y);
    // head
    const head = at(0.86);
    ctx.fillStyle = '#3f2a1a'; ctx.beginPath(); ctx.arc(head.x, head.y, sc * 0.14, 0, 7); ctx.fill();
    // arms
    const sh = at(0.76);
    const gA = at(1.0, -0.15), gB = at(1.0, 0.15);
    seg(sh, gA, 0.13, kit.shirt); seg(sh, gB, 0.13, kit.shirt);
    if (ball.mode !== 'held') drawKeeperGloves();
  }
  function drawKeeperGloves() {
    const F = keeperFeet(); const dx = keeper.hx - F.x, dy = keeper.hy - F.y, L = Math.hypot(dx, dy) || 1;
    const px = -dy / L, py = dx / L; const g = gloveDef();
    const r = (0.13 + 0.02 * save.upg.grip);
    [-0.15, 0.15].forEach(o => {
      const p = proj(keeper.hx + px * o, keeper.hy + py * o, KEEPER_Z);
      ctx.fillStyle = g.b; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (r + 0.025), 0, 7); ctx.fill();
      ctx.fillStyle = g.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(p.x - p.s * r * 0.3, p.y - p.s * r * 0.3, p.s * r * 0.35, 0, 7); ctx.fill();
    });
  }

  function drawBall() {
    const p = proj(ball.x, ball.y, ball.z); const r = p.s * BALL_R * 1.5;
    // shadow
    if (ball.mode !== 'held') {
      const sp = proj(ball.x, 0, ball.z); const k = clamp(1 - ball.y / 4, 0.25, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, r * 1.1 * k, r * 0.35 * k, 0, 0, 7); ctx.fill();
    }
    // trail
    if (ball.trail.length > 1) {
      for (let i = 1; i < ball.trail.length; i++) {
        const a = ball.trail[i - 1], b = ball.trail[i];
        ctx.strokeStyle = timeScale < 1 ? `rgba(125,211,252,${i / ball.trail.length * 0.6})` : `rgba(255,255,255,${i / ball.trail.length * 0.4})`;
        ctx.lineWidth = b.r * 1.4 * (i / ball.trail.length); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ball.spin);
    const bg = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#111827';
    pent(0, 0, r * 0.36);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 - Math.PI / 2; pent(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.24); }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(0.6, r * 0.08); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.restore();
  }
  function pent(x, y, r) { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 - Math.PI / 2; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); }

  function drawGoalFrame() {
    const pw = 0.12;
    const bl = proj(-HALF_W, 0, 0), tl = proj(-HALF_W, GOAL_H, 0), tr = proj(HALF_W, GOAL_H, 0), br = proj(HALF_W, 0, 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = S0 * pw + 3;
    ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.stroke();
    ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = S0 * pw;
    ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.stroke();
  }

  function netPoint(x, y, z) {
    // bulge toward camera around the goal impact
    if (fx.net && z <= -NET_D + 0.01) {
      const n = fx.net, d2 = (x - n.x) ** 2 + (y - n.y) ** 2;
      const amp = Math.exp(-d2 / 0.9) * 0.9 * Math.exp(-n.t * 2.2) * Math.cos(n.t * 9);
      z -= amp;
    }
    return proj(x, y, z);
  }
  function drawNet() {
    const backTop = GOAL_H * 0.82;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
    const step = 0.36;
    ctx.beginPath();
    // back panel verticals & horizontals
    for (let x = -HALF_W; x <= HALF_W + 0.01; x += step) { for (let y = 0; y <= backTop + 0.01; y += step / 2) { const p = netPoint(x, y, -NET_D); y ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } }
    for (let y = 0; y <= backTop + 0.01; y += step) { for (let x = -HALF_W; x <= HALF_W + 0.01; x += step / 2) { const p = netPoint(x, y, -NET_D); x === -HALF_W ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); } }
    // roof
    for (let x = -HALF_W; x <= HALF_W + 0.01; x += step) { const a = proj(x, GOAL_H, 0), b = netPoint(x, backTop, -NET_D); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    for (let t = 0; t <= 1.001; t += 0.25) { const y = lerp(GOAL_H, backTop, t), z = -NET_D * t; const a = proj(-HALF_W, y, z), b = proj(HALF_W, y, z); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    // sides
    [-HALF_W, HALF_W].forEach(x => {
      for (let t = 0; t <= 1.001; t += 0.25) { const a = proj(x, 0, -NET_D * t), b = proj(x, lerp(GOAL_H, backTop, t), -NET_D * t); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      for (let y = 0; y <= GOAL_H; y += step) { const a = proj(x, y, 0), b = proj(x, Math.min(y, backTop), -NET_D); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    });
    ctx.stroke();
    // back stanchions
    ctx.strokeStyle = 'rgba(226,232,240,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    [-HALF_W, HALF_W].forEach(x => { const a = proj(x, GOAL_H, 0), b = proj(x, backTop, -NET_D), c = proj(x, 0, -NET_D); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); });
    const bl = proj(-HALF_W, 0, -NET_D), br = proj(HALF_W, 0, -NET_D); ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y);
    ctx.stroke();
  }

  function drawText(t) {
    const k = t.t / t.life; const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
    ctx.save(); ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1; ctx.translate(t.x, t.y - k * 30); ctx.scale(pop, pop);
    ctx.font = `italic 1000 ${t.size}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, t.size * 0.16); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round';
    ctx.strokeText(t.s, 0, 0); ctx.fillStyle = t.col; ctx.fillText(t.s, 0, 0);
    ctx.restore();
  }
  function drawBanner() {
    const b = fx.banner; const k = Math.min(1, phaseT / 0.25);
    const y = H * 0.4;
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(3,7,18,0.72)'; ctx.fillRect(0, y - 58, W, 116);
    ctx.fillStyle = b.col; ctx.fillRect(0, y - 58, W, 3); ctx.fillRect(0, y + 55, W, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 12px system-ui'; ctx.fillStyle = b.col; ctx.fillText(b.small, W / 2, y - 36);
    ctx.font = `italic 1000 ${Math.min(46, W * 0.11)}px system-ui`; ctx.fillStyle = '#fff';
    ctx.translate((1 - k) * -60, 0); ctx.fillText(b.big, W / 2, y - 2);
    ctx.font = '700 13px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText(b.sub, W / 2, y + 33);
    ctx.restore();
  }

  // ---------- HUD / UI ----------
  const heartSvg = on => `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3 1.7-1.8 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="${on ? '#ef4444' : 'rgba(255,255,255,0.18)'}" stroke="${on ? '#fecaca' : 'none'}" stroke-width="1"/></svg>`;
  function updateHud() {
    if (!run) return;
    $('hearts').innerHTML = Array.from({ length: run.maxHearts }, (_, i) => heartSvg(i < run.hearts)).join('');
    $('scorePill').textContent = run.score.toLocaleString();
    const sp = $('stagePill');
    if (run.plan && run.plan.boss) { sp.textContent = STRIKERS[run.plan.boss].name; sp.classList.add('boss'); }
    else { sp.textContent = 'STAGE ' + run.stage + (run.plan ? ' · ' + Math.min(run.shotIdx + 1, run.plan.shots) + '/' + run.plan.shots : ''); sp.classList.remove('boss'); }
    const ff = $('focusFill'); ff.style.width = Math.round(run.focus * 100) + '%'; ff.classList.toggle('full', run.focus >= 1);
    $('bossHp').innerHTML = run.plan && run.plan.boss ? Array.from({ length: STRIKERS[run.plan.boss].hp }, (_, i) => `<i class="${i < run.bossHp ? '' : 'off'}"></i>`).join('') : '';
  }
  const muteIcon = m => m
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
  function setMute(m) { save.muted = m; persist(); AudioFX.setMuted(m); $('muteBtn').innerHTML = muteIcon(m); }

  const screens = ['title', 'locker', 'pro', 'over', 'ad', 'paused'];
  function hideAll() { screens.forEach(s => $(s).classList.remove('show')); }
  function show(id) { hideAll(); $(id).classList.add('show'); }
  let lockerReturn = 'title';
  function refreshTitle() { $('tBest').textContent = save.best; $('tScore').textContent = save.bestScore.toLocaleString(); $('tCoins').textContent = save.coins; $('proBtn').textContent = save.pro ? 'PRO ACTIVE' : 'PRO PASS'; }

  function swatchCanvas(draw) { const c = document.createElement('canvas'); c.width = 96; c.height = 64; c.style.width = '48px'; c.style.height = '32px'; draw(c.getContext('2d')); return c; }
  function renderLocker() {
    $('lCoins').textContent = save.coins;
    const ul = $('upgList'); ul.innerHTML = '';
    UPGRADES.forEach(u => {
      const lvl = save.upg[u.id], maxed = lvl >= u.max, cost = upCost(u, lvl);
      const row = document.createElement('div'); row.className = 'upg';
      row.innerHTML = `<div class="info"><b>${u.name}</b><small>${u.desc}</small><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
      const b = document.createElement('button'); b.className = 'buy'; b.textContent = maxed ? 'MAX' : cost; b.disabled = maxed || save.coins < cost;
      b.onclick = () => { if (save.coins >= cost && !maxed) { save.coins -= cost; save.upg[u.id]++; persist(); AudioFX.play('coin'); renderLocker(); } };
      row.appendChild(b); ul.appendChild(row);
    });
    const mk = (list, ownedKey, selKey, drawFn, containerId) => {
      const box = $(containerId); box.innerHTML = '';
      list.forEach(it => {
        const owned = save[ownedKey].includes(it.id) || (it.cost === -1 && save.pro);
        const el = document.createElement('div'); el.className = 'swatch' + (save[selKey] === it.id ? ' sel' : '');
        el.appendChild(swatchCanvas(c => drawFn(c, it)));
        el.insertAdjacentHTML('beforeend', `<div>${it.name}</div><div class="price ${it.cost === -1 ? 'pro' : ''}">${owned ? (save[selKey] === it.id ? 'EQUIPPED' : 'OWNED') : it.cost === -1 ? 'PRO' : it.cost + ' coins'}</div>`);
        el.onclick = () => {
          if (owned) { save[selKey] = it.id; }
          else if (it.cost === -1) { show('pro'); return; }
          else if (save.coins >= it.cost) { save.coins -= it.cost; save[ownedKey].push(it.id); save[selKey] = it.id; AudioFX.play('coin'); }
          else return;
          persist(); AudioFX.play('ui'); renderLocker();
        };
        box.appendChild(el);
      });
    };
    mk(GLOVES, 'ownedGloves', 'glove', (c, g) => { [[30, 32], [66, 32]].forEach(([x, y]) => { c.fillStyle = g.b; c.beginPath(); c.arc(x, y, 22, 0, 7); c.fill(); c.fillStyle = g.a; c.beginPath(); c.arc(x, y, 18, 0, 7); c.fill(); }); }, 'gloveList');
    mk(KITS, 'ownedKits', 'kit', (c, k) => { c.fillStyle = k.shirt; c.fillRect(28, 6, 40, 36); c.fillRect(14, 8, 16, 16); c.fillRect(66, 8, 16, 16); c.fillStyle = k.trim; c.font = '900 22px system-ui'; c.textAlign = 'center'; c.fillText('1', 48, 33); c.fillStyle = k.shorts; c.fillRect(30, 42, 36, 16); }, 'kitList');
  }

  function saveReceipt() {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#0b1530'); g.addColorStop(1, '#14532d'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 3; for (let i = 0; i < 14; i++) { x.beginPath(); x.moveTo(0, 1100 + i * 60); x.lineTo(1080, 1100 + i * 60); x.stroke(); }
    x.textAlign = 'center'; x.fillStyle = '#a3e635'; x.font = 'italic 900 170px system-ui'; x.fillText('LAST LINE', 540, 300);
    x.fillStyle = '#fff'; x.font = '800 54px system-ui'; x.fillText('KEEPER CARD', 540, 390);
    const rows = [['STAGE REACHED', run.stage], ['SCORE', run.score.toLocaleString()], ['SAVES', run.saves], ['CATCHES', run.catches], ['BEST STREAK', run.bestStreak], ['BOSSES BEATEN', run.bosses]];
    rows.forEach(([k, v], i) => { const y = 560 + i * 170; x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(120, y - 80, 840, 140); x.textAlign = 'left'; x.fillStyle = '#9fb0c8'; x.font = '800 44px system-ui'; x.fillText(k, 160, y + 14); x.textAlign = 'right'; x.fillStyle = '#fff'; x.font = '900 72px system-ui'; x.fillText(String(v), 920, y + 22); });
    const gl = gloveDef(); [[430, 1640], [650, 1640]].forEach(([gx, gy]) => { x.fillStyle = gl.b; x.beginPath(); x.arc(gx, gy, 95, 0, 7); x.fill(); x.fillStyle = gl.a; x.beginPath(); x.arc(gx, gy, 80, 0, 7); x.fill(); });
    x.textAlign = 'center'; x.fillStyle = '#cbd5e1'; x.font = '700 40px system-ui'; x.fillText('Can you hold the line?', 540, 1830);
    const a = document.createElement('a'); a.download = 'last-line-card.png'; a.href = c.toDataURL('image/png'); a.click();
  }

  // ---------- input ----------
  let ptr = null;
  canvas.addEventListener('pointerdown', e => {
    AudioFX.init();
    if (phase !== 'runup' && phase !== 'flight') return;
    const r = canvas.getBoundingClientRect();
    ptr = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), done: false };
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptr || ptr.done) return;
    const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    const dx = x - ptr.x, dy = y - ptr.y;
    if (Math.hypot(dx, dy) > 24) {
      ptr.done = true; const L = Math.hypot(dx, dy);
      dive(keeper.x + dx / L * 10, 1.2 - dy / L * 10); // full-stretch dive along swipe (clamped to reach)
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (!ptr || ptr.done) { ptr = null; return; }
    const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    dive((x - CX) / S0, (GL_Y - y) / S0);
    ptr = null;
  });

  const click = (id, fn) => $(id).addEventListener('click', () => { AudioFX.init(); AudioFX.play('ui'); fn(); });
  function startGame() { hideAll(); $('hud').style.display = 'block'; $('hint').style.display = 'block'; newRun(); setTimeout(() => { $('hint').style.display = 'none'; }, 6000); }
  click('playBtn', startGame);
  click('againBtn', startGame);
  click('lockerBtn', () => { lockerReturn = 'title'; renderLocker(); show('locker'); });
  click('oLocker', () => { lockerReturn = 'over'; renderLocker(); show('locker'); });
  click('proBtn', () => show('pro'));
  click('buyPro', () => { save.pro = true; persist(); $('buyPro').textContent = 'Pro unlocked'; refreshTitle(); setTimeout(() => { refreshTitle(); show('title'); }, 600); });
  click('reviveBtn', revive);
  click('receiptBtn', saveReceipt);
  click('homeBtn', () => { phase = 'title'; shot = null; run = null; $('hud').style.display = 'none'; refreshTitle(); show('title'); });
  click('pauseBtn', () => { if (run && phase !== 'over') { paused = true; show('paused'); } });
  click('resumeBtn', () => { paused = false; hideAll(); });
  click('quitBtn', () => { paused = false; hideAll(); run.hearts = 0; gameOver(); });
  click('muteBtn', () => setMute(!save.muted));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    AudioFX.play('ui'); refreshTitle();
    const inLocker = b.closest('#locker');
    show(inLocker && lockerReturn === 'over' ? 'over' : 'title');
  }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { AudioFX.suspend(); if (run && (phase === 'runup' || phase === 'flight' || phase === 'result')) { paused = true; show('paused'); } }
    else AudioFX.resume();
  });
  window.addEventListener('resize', resize);

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused && run && phase !== 'over') update(dt);
    else if (!run) { clock += dt; }
    render();
    requestAnimationFrame(frame);
  }

  resize();
  setMute(save.muted);
  refreshTitle();
  // idle attract scene on title
  shot = null; ball.x = 0; ball.z = 11; ball.mode = 'spot';
  if (HOOK.play || HOOK.autoplay) startGame();
  requestAnimationFrame(frame);

  window.LL = {
    get state() { return { phase, run, shot, keeper, ball, save }; },
    getAudioTelemetry: () => AudioFX.telemetry(),
    dive, startGame,
  };
})();
