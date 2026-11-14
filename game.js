// LAST LINE — 100% offline goalkeeper arcade prototype. Zero network, zero accounts, localStorage only.
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const HALF_W = 3.66, GOAL_H = 2.44, BALL_R = 0.115, K = 8, NET_D = 1.35, PITCH_Z = 36, KEEPER_Z = 0.25;
  let W = 0, H = 0, DPR = 1, S0 = 50, CX = 0, GL_Y = 0, HOR_Y = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const smoothstep = t => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
  // Curl stays on the early line until just past halfway, then bends in.
  const lateWeight = p => smoothstep((p - 0.48) / 0.52);
  const HOOK = (() => {
    const h = location.hash.slice(1);
    return Object.fromEntries(h.split('&').filter(Boolean).map(p => {
      const [k, v] = p.split('=');
      return [k, v === undefined ? true : decodeURIComponent(v)];
    }));
  })();

  // ---------- Persistence ----------
  const SAVE_KEY = 'lastline_v1';
  const DEFAULTS = {
    coins: 0, best: 0, bestScore: 0, runs: 0,
    upg: { grip: 0, spring: 0, stretch: 0, heart: 0 },
    glove: 'classic', ownedGloves: ['classic'],
    kit: 'emerald', ownedKits: ['emerald'],
    pro: false, muted: false, assistArc: true, tutorialSeen: false
  };
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s) return { ...DEFAULTS, ...s, upg: { ...DEFAULTS.upg, ...(s.upg || {}) } };
    } catch (e) { /* fresh save */ }
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
    { id: 'grip', name: 'Grip', desc: 'Bigger gloves, easier clean catches', max: 5, base: 120 },
    { id: 'spring', name: 'Spring', desc: 'Faster dive snap across goal', max: 5, base: 150 },
    { id: 'stretch', name: 'Stretch', desc: 'Reach deeper into top corners', max: 5, base: 150 },
    { id: 'heart', name: 'Big Heart', desc: '+1 starting match life', max: 2, base: 600 },
  ];
  const upCost = (u, lvl) => Math.round(u.base * Math.pow(1.85, lvl) / 10) * 10;
  const gloveDef = () => GLOVES.find(g => g.id === save.glove) || GLOVES[0];
  const kitDef = () => KITS.find(k => k.id === save.kit) || KITS[0];
  const gloveR = () => 0.36 + 0.05 * save.upg.grip;
  const maxReach = () => {
    let r = 3.15 + 0.16 * save.upg.stretch;
    if (keeper.stamina < 0.25) r *= 0.85;
    return r;
  };
  const diveDur = d => (0.15 + 0.065 * d) * Math.pow(0.92, save.upg.spring);

  // Run-loop knobs. LL.loop exposes the same object so a device pass can retune them.
  const LOOP = {
    throwWindow: 1.2,
    throwTime: 1.5,
    throwCoins: [8, 14],
    blitzTime: 20,
    blitzPurse: [12, 8],
    bountyPurse: 40,
    bountyPerStage: 4,
    palms: { common: 0.10, rare: 0.15 },
    recoverLock: 0.30,
    recoverDive: 0.70,
    recoverRefill: { base: 0.22, common: 0.40, rare: 0.55 },
    stamCost: 0.45,
    stepSpeed: { base: 2.4, perk: 1.15 },
    stepLimit: 1.25,
    gloveRare: 1.08,
    rareChance: 0.22,
    eventGaps: [3, 4, 5, 4]
  };
  const PERKS = [
    { id: 'palms', name: 'Magnetic Palms', blurb: 'Catch radius +10%', rareBlurb: 'Catch radius +15%' },
    { id: 'recover', name: 'Quick Recovery', blurb: 'Dive recovery −30% · stamina refills faster', rareBlurb: 'Dive recovery −30% · stamina refills much faster' },
    { id: 'reach', name: 'Wide Reach', blurb: 'Lateral step +15%', rareBlurb: 'Lateral step +15% · gloves +8%' }
  ];

  // ---------- Strikers ----------
  const STRIKERS = {
    rookie: { name: 'Rookie', shirt: '#3b82f6', shorts: '#1e3a8a', T: 1.24, bend: 0, arc: 0.36, dist: [11, 13], xr: 2, runup: 0.9 },
    winger: { name: 'Winger', shirt: '#f97316', shorts: '#7c2d12', T: 1.18, bend: 2.0, arc: 0.45, dist: [15, 19], xr: 7, runup: 0.85 },
    cannon: { name: 'Cannon', shirt: '#ef4444', shorts: '#450a0a', T: 0.72, bend: 0.35, arc: 0.14, dist: [14, 18], xr: 4, runup: 0.75 },
    chipper: { name: 'Chipper', shirt: '#a855f7', shorts: '#3b0764', T: 1.38, bend: 0.4, arc: 2.3, dist: [13, 16], xr: 4, runup: 0.9, high: true },
    mago: { name: 'EL MAGO', boss: true, shirt: '#0ea5e9', shorts: '#f8fafc', T: 1.28, bend: 2.7, arc: 1.95, dist: [21, 24], xr: 7, runup: 1.0, high: true, wall: true, hp: 3, title: 'Free-kick wizard · bends over the wall' },
    stutter: { name: 'THE STUTTER', boss: true, shirt: '#e11d48', shorts: '#111827', T: 0.82, bend: 0.2, arc: 0.3, dist: [11, 11], xr: 0, runup: 1.65, stutter: true, hp: 3, title: 'Penalty trickster · hold until the strike' },
    bertha: { name: 'BIG BERTHA', boss: true, shirt: '#facc15', shorts: '#111827', T: 0.58, bend: 0.55, arc: 0.12, dist: [17, 20], xr: 5, runup: 0.82, hp: 4, title: 'Rocket boots · pure reaction speed' },
    knuckler: { name: 'Knuckler', shirt: '#e2e8f0', shorts: '#334155', T: 1.05, bend: 0, arc: 0.2, dist: [13, 16], xr: 3, runup: 1.2 },
    poacher: { name: 'Poacher', shirt: '#f472b6', shorts: '#831843', T: 1.0, bend: 0.3, arc: 0.3, dist: [12, 15], xr: 3, runup: 1.1 },
  };
  const BOSS_ORDER = ['mago', 'stutter', 'bertha'];

  // Procedural shot cards. Ranges are the Week 1–2 spec; speeds other than
  // straight sit in the same band so the late action (bend, dip, break) can be seen.
  // Curve % is |finishX − earlyAimX| / distance. Bounce hop is a path fraction.
  const CARDS = {
    straight:    { striker: 'rookie',   speed: [18, 22], dist: [11, 13], height: [0.30, 1.40], runup: 1.12, longRunup: 1.12, trail: 'neutral', spinRate: 7 },
    curler:      { striker: 'winger',   speed: [16, 20], dist: [15, 18], height: [0.34, 1.35], runup: 1.05, longRunup: 1.75, trail: 'spin',    spinRate: 24 },
    knuckle:     { striker: 'knuckler', speed: [17, 21], dist: [13, 16], height: [0.78, 1.38], runup: 1.22, longRunup: 1.22, trail: 'knuckle', spinRate: 0.5 },
    bounce:      { striker: 'rookie',   speed: [18, 22], dist: [12, 15], height: [0.28, 1.20], runup: 1.16, longRunup: 1.16, trail: 'bounce',  spinRate: 16 },
    deflection:  { striker: 'cannon',   speed: [18, 22], dist: [14, 17], height: [0.36, 1.40], runup: 1.08, longRunup: 1.08, trail: 'neutral', spinRate: 9 },
    rebound:     { striker: 'poacher',  speed: [18, 22], dist: [12, 15], height: [0.40, 1.30], runup: 1.12, longRunup: 1.12, trail: 'neutral', spinRate: 11, rebound: true },
    cross:       { striker: 'winger',   speed: [17, 21], dist: [13, 16], height: [1.35, 2.05], runup: 0.42, longRunup: 0.42, trail: 'neutral', spinRate: 8 },
  };
  const LESSONS = {
    1: { warmup: true, script: ['straight', 'straight', 'straight', 'straight'], title: 'WARM UP', sub: '4 easy shots · swipe to the ball' },
    2: { script: ['bounce', 'straight', 'bounce'], title: 'THE BOUNCE', sub: 'One new shot · then an easy one' },
    3: { script: ['curler', 'straight', 'curler'], title: 'THE CURL', sub: 'Watch the hips · then an easy one' },
    6: { script: ['knuckle', 'straight', 'knuckle'], title: 'KNUCKLEBALL', sub: 'It wobbles, then dips' },
    7: { script: ['deflection', 'straight', 'deflection'], title: 'DEFLECTION', sub: 'The path breaks late' },
    10: { script: ['rebound', 'straight', 'rebound'], title: 'SECOND BALL', sub: 'Early or late sends it back' }
  };
  const COACH = {
    straight: 'SWIPE TOWARD THE BALL · gloves on it is a save',
    bounce: 'IT HOPS · then it comes in slower',
    curler: 'HIPS TILT · COLORED TRAIL · it starts wide and bends',
    knuckle: 'PALE BROKEN TRAIL · it wobbles, then dips',
    deflection: 'READ THE START · the path breaks late',
    rebound: 'EARLY OR LATE SPILLS · a second ball comes back',
  };

  function eventAt(n) {
    if (n < 5) return null;
    let cursor = 5;
    let i = 0;
    while (cursor < 80) {
      const s = cursor % 4 === 0 ? cursor + 1 : cursor;
      const kind = i % 2 === 0 ? 'blitz' : 'bounty';
      if (s === n) return kind;
      if (s > n) return null;
      cursor = s + LOOP.eventGaps[i % LOOP.eventGaps.length];
      i++;
    }
    return null;
  }

  function shotPool(n) {
    const pool = ['straight', 'bounce'];
    if (n >= 3) pool.push('curler');
    if (n >= 6) pool.push('knuckle');
    if (n >= 7) pool.push('deflection');
    if (n >= 10) pool.push('rebound');
    return pool;
  }

  function stagePlan(n) {
    if (n % 4 === 0) return { boss: BOSS_ORDER[(n / 4 - 1) % 3] };
    const lesson = LESSONS[n];
    if (lesson) return { shots: lesson.script.length, script: lesson.script.slice(), warmup: !!lesson.warmup, title: lesson.title, sub: lesson.sub };
    const event = eventAt(n);
    if (event === 'blitz') return { event: 'blitz', shots: 99, pool: ['cross'] };
    if (event === 'bounty') return { event: 'bounty', shots: 3, pool: shotPool(n) };
    return { shots: 5 + Math.min(3, Math.floor((n - 1) / 3)), pool: shotPool(n) };
  }
  const speedFactor = n => Math.min(1.6, 1 + 0.045 * (n - 1));

  function spinRGB(s) {
    if (!s) return '248,250,252';
    if (s.trail === 'rebound' || s.leg === 2) return '196,181,253';
    if (s.broke || s.trail === 'deflect') return '248,113,113';
    if (s.trail === 'bounce') return '250,204,21';
    if (s.trail === 'knuckle') return '148,163,184';
    if (s.spinSign > 0) return '251,146,60';
    if (s.spinSign < 0) return '34,211,238';
    return '248,250,252';
  }

  function flightTime(s) {
    if (s.rebound) return s.rebound.T;
    if (s.hopAt) return s.hopAt * s.sz / s.speed + (1 - s.hopAt) * s.sz / (s.speed * s.postSpeed);
    return s.sz / s.speed;
  }

  function pathFraction(s, t) {
    if (!s.hopAt) return clamp((t * s.speed) / s.sz, 0, 1);
    const t1 = s.hopAt * s.sz / s.speed;
    if (t <= t1) return clamp((t * s.speed) / s.sz, 0, 1);
    return clamp(s.hopAt + ((t - t1) * s.speed * s.postSpeed) / s.sz, 0, 1);
  }

  function applyBodyTell(s) {
    const early = s.breakP != null ? s.preTx : (s.card === 'curler' ? s.aimX : s.tx);
    if (s.card !== 'curler') s.aimX = early;
    s.plantYaw = Math.atan2(early - s.sx, Math.max(0.001, s.sz));
    if (s.card === 'curler') {
      s.hip = clamp((s.tx - s.aimX) / 1.5, -1, 1);
      s.spinSign = Math.sign(s.tx - s.aimX) || 1;
    } else if (s.card === 'cross') {
      s.hip = clamp((s.tx - s.sx) / 8, -1, 1);
      s.spinSign = Math.sign(s.tx - s.sx) || 1;
    } else {
      s.hip = 0;
      s.spinSign = 0;
    }
  }

  function layoutDeflection(s) {
    const theta = rand(12, 20) * Math.PI / 180;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const T = s.sz / s.speed;
    const lead = rand(0.15, 0.25);
    s.breakLead = lead;
    s.breakP = 1 - lead / T;
    s.breakDeg = theta * 180 / Math.PI;
    const remZ = lead * s.speed;
    s.sx = rand(-1.6, 1.6);
    s.preTx = rand(-1.05, 1.05);
    let guard = 0;
    while (guard++ < 10) {
      const heading = Math.atan2(s.preTx - s.sx, s.sz);
      const breakX = lerp(s.sx, s.preTx, s.breakP);
      const tx = breakX + Math.tan(heading + sign * theta) * remZ;
      if (Math.abs(tx) <= HALF_W - 0.28 && Math.abs(s.preTx) <= HALF_W - 0.4) {
        s.tx = tx;
        return;
      }
      s.preTx *= 0.72;
      s.sx *= 0.85;
    }
    const heading = Math.atan2(s.preTx - s.sx, s.sz);
    const breakX = lerp(s.sx, s.preTx, s.breakP);
    s.tx = clamp(breakX + Math.tan(heading + sign * theta) * remZ, -HALF_W + 0.35, HALF_W - 0.35);
  }

  function layoutCard(s) {
    const spec = s.spec;
    if (s.card === 'cross') {
      const side = Math.random() < 0.5 ? -1 : 1;
      s.sx = side * rand(6.2, 8.2);
      s.tx = -side * rand(0.35, 2.35);
      s.ty = rand(spec.height[0], spec.height[1]);
      s.baseTy = s.ty;
      s.aimX = s.tx;
      return;
    }
    if (s.card === 'curler') {
      const pct = rand(0.12, 0.18);
      const mag = pct * s.sz;
      const side = Math.random() < 0.5 ? -1 : 1;
      s.sx = side * rand(4.4, 6.6);
      s.tx = side * rand(0.2, 1.5);
      s.ty = rand(spec.height[0], spec.height[1]);
      s.baseTy = s.ty;
      s.aimX = s.tx + side * mag;
      s.curvePct = mag / s.sz;
      return;
    }
    if (s.card === 'deflection') {
      s.ty = rand(spec.height[0], spec.height[1]);
      s.baseTy = s.ty;
      s.aimX = 0;
      layoutDeflection(s);
      s.aimX = s.preTx;
      return;
    }
    if (s.card === 'bounce') {
      s.hopAt = rand(0.60, 0.70);
      s.postSpeed = 0.75;
      s.apex1 = rand(0.9, 1.3);
      s.apex2 = rand(0.28, 0.48);
    }
    if (s.card === 'knuckle') {
      s.oscPx = rand(6, 10);
      s.oscHz = rand(12, 16);
      s.dipPx = rand(6, 10);
    }
    if (s.card === 'rebound') {
      s.reboundDelay = rand(0.30, 0.45);
      const side = Math.random() < 0.5 ? -1 : 1;
      s.sx = side * rand(0.3, 2.0);
      s.tx = side * rand(2.25, 3.05);
    } else if (s.card === 'deflection') {
      /* sx/tx set above */
    } else {
      s.sx = rand(-2.2, 2.2);
      const edge = Math.min(2.9, 2.05 + 0.08 * (run ? run.stage : 1));
      s.tx = rand(0.45, edge) * (Math.random() < 0.5 ? -1 : 1);
    }
    s.baseTy = rand(spec.height[0], spec.height[1]);
    s.ty = s.baseTy;
    if (s.card === 'knuckle') s.ty = s.baseTy - s.dipPx / Math.max(1, S0);
    s.aimX = s.tx;
    if (s.card === 'straight' && run && run.stage > 1 && run.faced > 3 && Math.random() < 0.06) {
      s.post = true;
      s.tx = (HALF_W + 0.02) * Math.sign(s.tx || 1);
      s.aimX = s.tx;
    }
  }

  function rollCard(typeId, o = {}) {
    const spec = CARDS[typeId];
    const stage = run ? run.stage : 1;
    const s = {
      card: typeId, spec, typeId: spec.striker, def: STRIKERS[spec.striker],
      sx: 0, sz: rand(spec.dist[0], spec.dist[1]), tx: 0, ty: 0, baseTy: 0, aimX: 0, preTx: null,
      speed: rand(spec.speed[0], spec.speed[1]) * speedFactor(stage),
      arc: rand(0.16, 0.4), curvePct: 0,
      hopAt: null, postSpeed: 0.75, apex1: 1, apex2: 0.35,
      oscPx: 0, oscHz: 0, dipPx: 0, spotJitter: 0,
      breakP: null, breakLead: 0, breakDeg: 0, broke: false,
      spinSign: 0, spinRate: spec.spinRate, trail: spec.trail,
      longTell: !!o.longTell && typeId === 'curler',
      reboundDelay: 0, leg: 1, rebound: null, pendingRebound: false,
      u: 0, kicked: false, runT: 0, resolved: false, post: false, result: null,
      kickPose: 0, wallHop: 0, aside: 1, plantYaw: 0, hip: 0,
      hopped: false, hopSquash: 0, T: 0,
    };
    s.runup = s.longTell ? spec.longRunup : spec.runup;
    layoutCard(s);
    if (o.warmup) {
      s.speed = rand(14, 16);
      s.sz = rand(13, 15);
      const side = Math.sign(s.tx) || (Math.random() < 0.5 ? -1 : 1);
      s.tx = clamp(Math.abs(s.tx) < 0.45 ? side * 0.8 : s.tx, -1.35, 1.35);
      s.aimX = s.tx;
      s.ty = clamp(s.ty, 0.5, 1.15);
      s.baseTy = s.ty;
      s.post = false;
    }
    if (run && run.wind && s.card !== 'curler' && s.card !== 'deflection' && !s.post) {
      const shift = run.wind * 0.035;
      s.tx = clamp(s.tx + shift, -HALF_W + 0.25, HALF_W - 0.25);
      s.aimX = s.tx;
    }
    s.T = flightTime(s);
    s.aside = s.sx >= 0 ? -1 : 1;
    applyBodyTell(s);
    return s;
  }

  function retargetCard(s, tx, ty) {
    const want = Math.sign(tx) || 1;
    if (Math.sign(s.tx) && Math.sign(s.tx) !== want) {
      s.tx = -s.tx;
      if (s.aimX != null) s.aimX = -s.aimX;
      if (s.preTx != null) s.preTx = -s.preTx;
    }
    if (s.card !== 'knuckle') {
      s.ty = ty;
      s.baseTy = ty;
    }
    s.post = false;
    applyBodyTell(s);
  }

  // Game-time windows. Change these on device; LL.timing exposes the same object.
  const TIMING = {
    perfect: 0.080,
    good: 0.140,
    freezePerfect: 0.120,
    freezeGood: 0.080,
    zoomPerfect: 1.08,
    zoomGood: 1.05,
    failRetry: 0.42,
    parryAngle: [15, 20],
    parrySpeed: [0.6, 0.8]
  };

  function timingBand() {
    const n = run ? run.stage : 99;
    if (n <= 1) return { perfect: 0.120, good: 0.220 };
    if (n === 2) return { perfect: 0.100, good: 0.180 };
    return { perfect: TIMING.perfect, good: TIMING.good };
  }

  function timingTier(offset) {
    const band = timingBand();
    const a = Math.abs(offset);
    if (a <= band.perfect) return 'perfect';
    if (a <= band.good) return 'good';
    return offset < 0 ? 'early' : 'late';
  }

  function mistimeSpills() {
    if (!shot || !run) return true;
    if (shot.card === 'rebound' || shot.leg === 2) return true;
    return run.stage > 10;
  }

  function isHeavyParry(s, res) {
    return !!(s && s.leg !== 2 && res === 'spill');
  }

  function perkNow() {
    if (!run || !run.perk || run.perk.stage !== run.stage) return null;
    return run.perk;
  }

  function catchRadius() {
    let r = gloveR();
    const p = perkNow();
    if (p && p.id === 'palms') r *= 1 + LOOP.palms[p.rarity];
    if (p && p.id === 'reach' && p.rarity === 'rare') r *= LOOP.gloveRare;
    return r;
  }

  function stepSpeed() {
    const p = perkNow();
    return LOOP.stepSpeed.base * (p && p.id === 'reach' ? LOOP.stepSpeed.perk : 1);
  }

  function recoverLock() {
    const p = perkNow();
    return LOOP.recoverLock * (p && p.id === 'recover' ? LOOP.recoverDive : 1);
  }

  function refillRate() {
    const p = perkNow();
    if (p && p.id === 'recover') return LOOP.recoverRefill[p.rarity];
    return LOOP.recoverRefill.base;
  }

  function perkLabel() {
    const p = perkNow();
    if (!p) return '';
    if (p.id === 'palms') return 'PALMS +' + Math.round(LOOP.palms[p.rarity] * 100) + '%';
    if (p.id === 'recover') return 'RECOVERY −30%';
    return p.rarity === 'rare' ? 'STEP +15% · GLOVE +8%' : 'STEP +15%';
  }

  function blitzDone() {
    return !!(run && run.event && run.event.kind === 'blitz' && run.event.time <= 0);
  }

  function cashBlitz() {
    const ev = run && run.event;
    if (!ev || ev.kind !== 'blitz' || ev.cashed) return 0;
    ev.cashed = true;
    const coins = LOOP.blitzPurse[0] + LOOP.blitzPurse[1] * (ev.peak || 0);
    run.purse += coins;
    run.score += 40 * (ev.peak || 0);
    ev.payout = coins;
    return coins;
  }

  function lessonArc() {
    if (!run || !shot || !run.plan) return false;
    if (run.plan.warmup) return true;
    if (run.stage === 2 && shot.card === 'bounce') return true;
    if (run.stage === 3 && shot.card === 'curler') return true;
    return false;
  }

  function assistApplies() {
    return !!(save.assistArc && lessonArc() && shot.card && shot.leg !== 2 && !shot.resolved && (phase === 'runup' || phase === 'flight'));
  }

  function landingRingVisible() {
    return phase === 'flight' && !!shot && shot.u > 0.22 && !shot.resolved && !!run && run.stage !== 1;
  }

  // ---------- State ----------
  let phase = 'title', phaseT = 0, paused = false, timeScale = 1, clock = 0;
  let run = null, shot = null;
  const ball = { x: 0, y: BALL_R, z: 11, vx: 0, vy: 0, vz: 0, mode: 'spot', spin: 0, trail: [], bounces: 0 };
  const keeper = { x: 0, hx: 0, hy: 1.25, fx: 0, fy: 1.25, tx: 0, ty: 1.25, t: 0, dur: 0, diving: false, early: false, dir: 0, stamina: 1, recover: 0 };
  const fx = { texts: [], parts: [], decals: [], flash: 0, flashCol: '#ef4444', shake: 0, net: null, banner: null, diveMark: null, zoom: 1, zoomHold: 0, zoomAt: null, tilt: 0 };
  let hitStop = 0;
  let throwState = null;
  let tutorial = null;
  let tutorialReturn = 'play';
  let stamShown = -1;
  let stands = null, toastTimer = null, adActive = false;

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- Projection ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width || 390; H = r.height || 844;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    S0 = Math.min(W * 0.94 / (HALF_W * 2), H * 0.21 / GOAL_H);
    CX = W / 2;
    GL_Y = H * 0.80;
    HOR_Y = H * 0.31;
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
    const top = HOR_Y - H * 0.20, bot = groundY(PITCH_Z) - 1.05 * S0 * K / (PITCH_Z + K);

    // Night sky above stadium roof
    const sky = c.createLinearGradient(0, 0, 0, top + 12);
    sky.addColorStop(0, '#040916');
    sky.addColorStop(1, '#0b1936');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, top + 12);

    // Two-tier stands backdrop
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#0c162c');
    g.addColorStop(0.45, '#132241');
    g.addColorStop(1, '#1a2d54');
    c.fillStyle = g;
    c.fillRect(0, top, W, bot - top);

    // Crowd spectators (deterministic pattern for clean texture, zero noisy flicker)
    const cols = ['#e2e8f0', '#f87171', '#60a5fa', '#fbbf24', '#34d399', '#cbd5e1'];
    let seed = 1337;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let y = top + 6; y < bot - 2; y += 6.5) {
      const rowShade = (y - top) / (bot - top);
      c.fillStyle = `rgba(4,9,20,${0.32 - rowShade * 0.16})`;
      c.fillRect(0, y, W, 1.5);
      for (let x = ((y * 5) % 8); x < W; x += 6 + rng() * 2.5) {
        c.globalAlpha = 0.34 + rowShade * 0.45;
        c.fillStyle = cols[(rng() * cols.length) | 0];
        c.beginPath();
        c.arc(x, y - 2.2, 1.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;

    // Tier fascia beam
    const midY = lerp(top, bot, 0.48);
    c.fillStyle = '#091224';
    c.fillRect(0, midY - 3, W, 6);
    c.fillStyle = 'rgba(163, 230, 53, 0.32)';
    c.fillRect(0, midY - 1, W, 1.5);

    // Roof girder + dramatic stadium floodlight cones
    c.fillStyle = '#0a1428';
    c.fillRect(0, top - 8, W, 10);
    [W * 0.14, W * 0.5, W * 0.86].forEach(x => {
      const beam = c.createLinearGradient(x, top - 2, x, bot + 40);
      beam.addColorStop(0, 'rgba(255, 250, 224, 0.24)');
      beam.addColorStop(1, 'rgba(255, 250, 224, 0)');
      c.fillStyle = beam;
      c.beginPath();
      c.moveTo(x - 18, top - 2);
      c.lineTo(x + 18, top - 2);
      c.lineTo(x + W * 0.24, bot + 40);
      c.lineTo(x - W * 0.24, bot + 40);
      c.closePath();
      c.fill();

      const lg = c.createRadialGradient(x, top - 3, 2, x, top - 3, W * 0.24);
      lg.addColorStop(0, 'rgba(255, 252, 232, 0.72)');
      lg.addColorStop(1, 'rgba(255, 252, 232, 0)');
      c.fillStyle = lg;
      c.fillRect(x - W * 0.24, top - W * 0.24, W * 0.48, W * 0.48);

      c.fillStyle = '#fffbeb';
      for (let i = -2; i <= 2; i++) c.fillRect(x + i * 7 - 2.5, top - 5, 5, 4);
    });
  }

  // ---------- Run Lifecycle ----------
  function newRun() {
    const startStage = HOOK.stage ? Math.max(1, parseInt(HOOK.stage, 10) || 1) : 1;
    const maxH = 3 + save.upg.heart;
    run = {
      stage: startStage, hearts: maxH, maxHearts: maxH,
      score: 0, saves: 0, catches: 0, conceded: 0, streak: 0, bestStreak: 0,
      focus: 0, focusManual: false, shotIdx: 0, plan: null, bossHp: 0,
      revived: false, doubled: false, bosses: 0, faced: 0, wind: 0,
      purse: 0, timeBank: 0, perk: null, event: null
    };
    keeper.stamina = 1;
    keeper.recover = 0;
    save.runs++; persist();
    startStage_(run.stage);
  }

  function startStage_(n) {
    run.stage = n;
    run.plan = stagePlan(n);
    run.shotIdx = 0;
    run.wind = n <= 3 ? 0 : Math.round(rand(-6, 6));
    if (run.wind === 0 && n >= 5) run.wind = 4;
    run.event = null;
    if (run.plan.event === 'blitz') run.event = { kind: 'blitz', time: LOOP.blitzTime, peak: 0, cashed: false, payout: 0 };
    if (run.plan.event === 'bounty') run.event = { kind: 'bounty', clean: true, cashed: false };
    if (run.plan.boss) {
      run.bossHp = STRIKERS[run.plan.boss].hp;
      AudioFX.play('boss');
    }
    fx.banner = run.plan.boss
      ? { big: STRIKERS[run.plan.boss].name, small: 'BOSS · STAGE ' + n, sub: STRIKERS[run.plan.boss].title, col: '#facc15' }
      : run.plan.event === 'blitz'
        ? { big: 'CORNER BLITZ', small: 'STAGE ' + n, sub: '20s of crosses and headers', col: '#38bdf8' }
        : run.plan.event === 'bounty'
          ? { big: 'CLEAN SHEET', small: 'STAGE ' + n, sub: '3 shots · a goal voids the bounty', col: '#facc15' }
          : run.plan.title
            ? { big: run.plan.title, small: 'STAGE ' + n, sub: run.plan.sub, col: '#a3e635' }
            : { big: 'STAGE ' + n, small: 'NEXT WAVE', sub: run.plan.shots + ' shots incoming', col: '#a3e635' };
    setPhase('intro');
    updateHud();
    coachHint();
  }

  function setPhase(p) { phase = p; phaseT = 0; if (typeof coachHint === 'function') coachHint(); }

  function resetShotActors(sx, sz) {
    ball.mode = 'spot'; ball.x = sx; ball.y = BALL_R; ball.z = sz; ball.trail = []; ball.spin = 0; ball.bounces = 0;
    keeper.x = clamp(sx * 0.08, -0.5, 0.5);
    keeper.hx = keeper.fx = keeper.tx = keeper.x;
    keeper.hy = keeper.fy = keeper.ty = 1.25;
    keeper.diving = false; keeper.early = false; keeper.t = 0; keeper.dur = 0; keeper.dir = 0;
    keeper.timed = false; keeper.contactAt = 0;
    fx.diveMark = null;
    timeScale = 1;
  }

  function newBossShot(typeId) {
    const def = STRIKERS[typeId];
    const sp = speedFactor(run.stage);
    const sz = rand(def.dist[0], def.dist[1]);
    const sx = def.xr ? rand(-def.xr, def.xr) : 0;
    const maxTx = Math.min(3.32, 2.2 + 0.13 * run.stage);
    let tx = rand(0.6, maxTx) * (Math.random() < 0.5 ? -1 : 1);
    if (Math.random() < 0.18) tx = rand(-1.2, 1.2);
    const ty = def.high ? rand(1.45, 2.18) : rand(0.24, 2.12);
    let post = false;
    if (run.faced > 3 && Math.random() < 0.06) {
      post = true;
      tx = (HALF_W + 0.02) * Math.sign(tx);
    }
    const windShift = run.wind * 0.04;
    const bend = def.bend * (sx > 0 ? -1 : 1) * rand(0.7, 1.1) * (Math.random() < 0.25 ? -1 : 1) + windShift;
    shot = {
      typeId, def, card: null, sx, sz, tx: clamp(tx + windShift * 0.5, -HALF_W - 0.05, HALF_W + 0.05), ty,
      T: def.T / sp, bend, arc: def.arc * rand(0.85, 1.15), u: 0, kicked: false, runT: 0,
      runup: def.runup, resolved: false, post, result: null, kickPose: 0, wallHop: 0, aside: sx >= 0 ? -1 : 1,
      leg: 1, spinRate: 25, trail: 'neutral', spinSign: Math.sign(bend), hip: clamp(bend / 2.2, -1, 1),
      plantYaw: Math.atan2(tx - sx, sz), aimX: tx, longTell: false, spotJitter: 0, hopSquash: 0, broke: false
    };
    resetShotActors(sx, sz);
    setPhase('runup');
    coachHint();
    AudioFX.play('whistle');
  }

  function newShot() {
    const plan = run.plan;
    if (plan.boss) { newBossShot(plan.boss); return; }
    const typeId = plan.script ? plan.script[run.shotIdx] : plan.pool[(Math.random() * plan.pool.length) | 0];
    const longTell = !!(plan.script && typeId === 'curler');
    shot = rollCard(typeId, { longTell, warmup: !!(plan.warmup && typeId === 'straight') });
    resetShotActors(shot.sx, shot.sz);
    setPhase('runup');
    coachHint();
    updateHud();
    AudioFX.play('whistle');
  }

  function coachHint() {
    const el = $('hint');
    if (!el) return;
    const live = phase !== 'intro' && phase !== 'clear' && phase !== 'over' && phase !== 'title' && phase !== 'perk';
    const eventLive = !!(run && run.event && live);
    const throwLive = phase === 'throw';
    const lessonLive = !!(run && run.plan && run.plan.script && live);
    if (!eventLive && !throwLive && !lessonLive) {
      el.style.display = 'none';
      return;
    }
    let text = 'SWIPE TOWARD THE BALL';
    if (throwLive && throwState && !throwState.flung) text = throwState.gentle ? 'FLICK UP · this first gate is an easy score' : 'FLICK UPFIELD · through the moving gate';
    else if (throwLive) text = 'COUNTER ON';
    else if (run.event && run.event.kind === 'blitz') text = 'CORNER BLITZ · the payout grows with your streak';
    else if (run.event && run.event.kind === 'bounty') text = run.event.clean ? 'CLEAN SHEET · no goals on these 3' : 'BOUNTY BLOWN · finish the wave';
    else if (shot && shot.leg === 2) text = 'OPPOSITE POST · dive again';
    else if (shot && shot.pendingRebound) text = 'SPILL · second ball is coming';
    else if (shot && shot.card && COACH[shot.card]) text = COACH[shot.card];
    el.textContent = text;
    el.style.display = 'block';
  }

  function triggerFocus(manual = false) {
    if (!run || run.focus < 1 || timeScale < 1) return false;
    run.focus = 0;
    timeScale = 0.42;
    AudioFX.play('focus');
    addText(manual ? 'BULLET FOCUS!' : 'FOCUS!', W / 2, H * 0.44, '#38bdf8', 32);
    updateHud();
    return true;
  }

  function kick() {
    shot.kicked = true; shot.kickPose = 1; shot.wallHop = 1;
    if (keeper.diving && keeper.early) {
      const side = keeper.tx >= keeper.x ? -1 : 1;
      const newTx = side * rand(1.7, Math.min(3.05, 2.15 + 0.08 * run.stage));
      const newTy = rand(0.34, 1.35);
      if (shot.card) retargetCard(shot, newTx, newTy);
      else {
        shot.tx = newTx;
        shot.ty = newTy;
        shot.post = false;
        shot.bend *= 0.3;
      }
    }
    if (run.focus >= 1 && !HOOK.nofocus) triggerFocus(false);
    ball.mode = 'flight'; ball.trail = [];
    AudioFX.play(shot.def.boss === true && shot.typeId === 'bertha' ? 'rocketKick' : 'kick');
    updateHud();
  }

  function legacyBallAt(u) {
    const s = shot;
    const late = 6.75 * u * u * (1 - u);
    return {
      x: lerp(s.sx, s.tx, u) + s.bend * late,
      y: lerp(BALL_R, s.ty, u) + s.arc * 4 * u * (1 - u),
      z: s.sz * (1 - u)
    };
  }

  function cardBallAt(u) {
    const s = shot;
    if (s.rebound) {
      const r = s.rebound;
      return {
        x: lerp(r.from.x, r.to.x, u),
        y: lerp(r.from.y, r.to.y, u) + Math.sin(u * Math.PI) * 0.62,
        z: lerp(r.from.z, r.to.z, u)
      };
    }
    const t = u * s.T;
    const p = pathFraction(s, t);
    let x, y, z;
    if (s.breakP != null) {
      z = s.sz * (1 - p);
      if (p <= s.breakP) x = lerp(s.sx, s.preTx, p);
      else {
        const bx = lerp(s.sx, s.preTx, s.breakP);
        x = lerp(bx, s.tx, (p - s.breakP) / (1 - s.breakP));
      }
      y = lerp(BALL_R, s.baseTy, p) + s.arc * 4 * p * (1 - p);
    } else if (s.card === 'curler') {
      x = lerp(s.sx, s.aimX, p) + (s.tx - s.aimX) * lateWeight(p);
      y = lerp(BALL_R, s.ty, p) + s.arc * 4 * p * (1 - p);
      z = s.sz * (1 - p);
    } else if (s.hopAt) {
      x = lerp(s.sx, s.tx, p);
      z = s.sz * (1 - p);
      if (p <= s.hopAt) y = BALL_R + s.apex1 * Math.sin((p / s.hopAt) * Math.PI);
      else {
        const k = (p - s.hopAt) / (1 - s.hopAt);
        y = lerp(BALL_R, s.ty, k) + s.apex2 * Math.sin(k * Math.PI);
      }
    } else {
      x = lerp(s.sx, s.tx, p);
      y = lerp(BALL_R, s.baseTy, p) + s.arc * 4 * p * (1 - p);
      z = s.sz * (1 - p);
    }
    if (s.oscPx) {
      const attack = 0.08, settle = 0.12;
      let env = 1;
      if (t < attack) env = t / attack;
      else if (t > s.T - settle) env = Math.max(0, (s.T - t) / settle);
      const scale = S0 * K / (z + K);
      x += (s.oscPx * Math.sin(2 * Math.PI * s.oscHz * t) * env) / Math.max(1, scale);
      y -= (s.dipPx / Math.max(1, S0)) * smoothstep((p - 0.70) / 0.30);
    }
    return { x, y, z };
  }

  function ballAt(u) {
    return shot.card ? cardBallAt(u) : legacyBallAt(u);
  }

  // ---------- Keeper ----------
  function shotClock() {
    if (!shot) return 0;
    if (!shot.kicked) return -(shot.runup - shot.runT);
    return shot.u * shot.T;
  }

  function haptic(kind) {
    if (!navigator.vibrate) return;
    const pat = { perfect: [28, 16, 42], good: [16], dive: [8], fail: [36, 24, 36] }[kind];
    if (!pat) return;
    try { navigator.vibrate(pat); } catch (e) { /* noop */ }
  }

  function dive(gx, gy) {
    if (hitStop > 0 || keeper.diving || keeper.recover > 0 || !shot || shot.resolved || !(phase === 'runup' || phase === 'flight')) return;
    const ox = keeper.x, oy = 1.25;
    gy = clamp(gy, 0.18, 2.55);
    let dx = gx - ox, dy = gy - oy;
    const d = Math.hypot(dx, dy);
    const R = maxReach();
    if (d > R) { dx *= R / d; dy *= R / d; }
    keeper.tx = ox + dx; keeper.ty = oy + dy;
    keeper.fx = keeper.hx; keeper.fy = keeper.hy;
    keeper.dur = diveDur(Math.min(d, R));
    keeper.t = 0; keeper.diving = true;
    keeper.dir = Math.sign(dx) || (gx >= ox ? 1 : -1);
    keeper.early = !shot.kicked;
    keeper.timed = true;
    keeper.contactAt = shotClock() + keeper.dur;
    keeper.stamina = Math.max(0, keeper.stamina - LOOP.stamCost);
    fx.diveMark = { x: keeper.tx, y: keeper.ty, t: 0 };
    fx.tilt = keeper.dir * 0.05;
    AudioFX.play('dive');
    haptic('dive');
  }

  function keeperFeet() {
    let fx_ = keeper.x + (keeper.hx - keeper.x) * 0.32;
    let fy_ = Math.max(0, keeper.hy - 1.95);
    const dx = keeper.hx - fx_, dy = keeper.hy - fy_, L = Math.hypot(dx, dy);
    if (L > 2.05) {
      fx_ = keeper.hx - dx * 2.05 / L;
      fy_ = Math.max(0, keeper.hy - dy * 2.05 / L);
    }
    return { x: fx_, y: fy_ };
  }

  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  }

  function stampMs(offset) {
    const ms = Math.round(offset * 1000);
    return (ms > 0 ? '+' : '') + ms + ' ms';
  }

  function parryLaunch(bx, by) {
    const incoming = shot.speed || Math.max(8, (shot.sz || 12) / Math.max(0.2, shot.T));
    const spd = incoming * rand(TIMING.parrySpeed[0], TIMING.parrySpeed[1]);
    const deg = rand(TIMING.parryAngle[0], TIMING.parryAngle[1]);
    const outward = Math.sign(bx) || keeper.dir || 1;
    const yaw = outward * deg * Math.PI / 180;
    ball.mode = 'loose';
    ball.x = bx; ball.y = Math.max(by, 0.35); ball.z = 0.12;
    ball.vx = Math.sin(yaw) * spd;
    ball.vz = Math.cos(yaw) * spd;
    ball.vy = Math.max(0.55, by * 0.45);
    ball.trail = [];
    shot.parryDeg = deg;
    shot.parrySpeed = spd / incoming;
    return { spd, deg };
  }

  function punchCamera(p, zoom, hold) {
    fx.zoom = zoom;
    fx.zoomHold = hold;
    fx.zoomAt = { x: p.x, y: p.y };
  }

  function contactDecals(hx, hy, bx) {
    addDecal('glove', hx, hy, KEEPER_Z);
    addDecal('turf', bx, 0, 0.25);
  }

  function addDecal(kind, x, y, z) {
    fx.decals.push({ kind, x, y, z, t: 0, life: kind === 'turf' ? 0.36 : 0.28 });
  }

  function resolveShot() {
    shot.resolved = true;
    const bx = shot.tx, by = shot.ty;
    const R = catchRadius() + BALL_R;
    const aimed = !!keeper.timed;
    const hx = aimed ? keeper.tx : keeper.hx;
    const hy = aimed ? keeper.ty : keeper.hy;
    const dH = Math.hypot(bx - hx, by - hy);
    const F = keeperFeet();
    const glove = aimed && dH < R;
    const body = aimed && segDist(bx, by, F.x, F.y, hx, hy) < 0.26 + BALL_R;
    const offset = aimed ? keeper.contactAt - shot.T : 0;
    const tier = aimed ? timingTier(offset) : 'none';
    shot.offset = offset;
    shot.tier = tier;
    let res;
    let forgiven = false;
    if (glove && tier === 'perfect') res = 'catch';
    else if ((glove || body) && (tier === 'perfect' || tier === 'good')) res = 'parry';
    else if ((glove || body) && (tier === 'early' || tier === 'late')) {
      if (mistimeSpills()) res = 'spill';
      else { res = 'parry'; forgiven = true; }
    } else if (shot.post) res = 'post';
    else res = 'goal';

    shot.result = res;
    shot.forgiven = forgiven;
    if (shot.leg !== 2) run.faced++;
    const p = proj(bx, by, 0);
    const mult = 1 + 0.25 * Math.floor(run.streak / 3);
    const ms = aimed ? stampMs(offset) : '';

    if (res === 'catch' || res === 'parry') {
      run.saves++; run.streak++; run.bestStreak = Math.max(run.bestStreak, run.streak);
      const base = res === 'catch' ? 100 : 60;
      const pts = Math.round(base * mult);
      run.score += pts;
      run.focus = Math.min(1, run.focus + (res === 'catch' ? 0.4 : 0.14));
      if (res === 'catch') {
        run.catches++; ball.mode = 'held';
        AudioFX.play('catch'); AudioFX.play('rattle');
        burst(p.x, p.y, gloveDef().a, 22);
        fx.net = { x: bx, y: by, t: 0, rattle: true };
        punchCamera(p, TIMING.zoomPerfect, 0.05);
        hitStop = Math.max(hitStop, TIMING.freezePerfect);
        haptic('perfect');
        fx.shake = 5;
      } else {
        parryLaunch(bx, by);
        AudioFX.play('parry');
        burst(p.x, p.y, '#e0f2fe', 14);
        punchCamera(p, TIMING.zoomGood, 0.04);
        hitStop = Math.max(hitStop, TIMING.freezeGood);
        haptic('good');
        fx.shake = 3;
      }
      contactDecals(hx, hy, bx);
      AudioFX.crowd(res === 'catch' ? 'cheer' : 'ooh');
      const label = res === 'catch' ? 'REFLEX' : 'PARRY';
      if (shot.forgiven) {
        addText(tier === 'early' ? 'EARLY' : 'LATE', p.x, p.y - 48, '#fb923c', 28);
        addText('SAVED', p.x, p.y - 22, '#e2e8f0', 14);
      } else {
        addText(label, p.x, p.y - 48, res === 'catch' ? '#facc15' : '#7dd3fc', 28);
        addText(ms, p.x, p.y - 22, '#e2e8f0', 14);
      }
      addText('+' + pts + (mult > 1 ? '  ×' + mult.toFixed(2).replace(/\.?0+$/, '') : ''), p.x, p.y + 2, '#ffffff', 16);
      if (run.plan.boss) run.bossHp--;
      if (run.event && run.event.kind === 'blitz') run.event.peak = Math.max(run.event.peak || 0, run.streak);
    } else if (res === 'spill' && shot.leg !== 2) {
      run.streak = 0;
      parryLaunch(bx, by);
      contactDecals(hx, hy, bx);
      AudioFX.play('fail'); AudioFX.crowd('groan');
      haptic('fail');
      fx.shake = 2;
      punchCamera(p, 1.03, 0.03);
      hitStop = Math.max(hitStop, 0.04);
      addText(tier === 'early' ? 'EARLY' : 'LATE', p.x, p.y - 36, '#fb923c', 28);
      addText(ms + ' · SPILL', p.x, p.y - 8, '#fed7aa', 15);
      shot.pendingRebound = true;
      if (!shot.reboundDelay) shot.reboundDelay = rand(0.30, 0.45);
    } else if (res === 'spill') {
      res = 'goal';
      shot.result = 'goal';
    } else if (res === 'post') {
      ball.mode = 'loose'; ball.x = bx; ball.y = by; ball.z = 0;
      ball.vx = -Math.sign(bx) * rand(1.5, 3); ball.vy = 2; ball.vz = 5;
      AudioFX.play('post'); AudioFX.crowd('ooh');
      addText('OFF THE POST!', p.x - Math.sign(bx) * 60, p.y - 20, '#e2e8f0', 24);
      fx.shake = 3;
    }

    if (res === 'goal') {
      if (shot.result !== 'goal') shot.result = 'goal';
      if (shot.pendingRebound) shot.pendingRebound = false;
      run.hearts--; run.conceded++; run.streak = 0;
      ball.mode = 'net'; ball.x = bx; ball.y = by; ball.z = 0;
      ball.vx = (bx - (shot.sx || 0)) / Math.max(0.2, shot.T) * 0.15; ball.vy = 0; ball.vz = -9;
      fx.net = { x: bx, y: by, t: 0 }; fx.flash = 0.5; fx.flashCol = '#ef4444'; fx.shake = 9;
      AudioFX.play('fail'); AudioFX.play('net'); AudioFX.crowd('groan');
      haptic('fail');
      if (run.event && run.event.kind === 'bounty' && run.event.clean) {
        run.event.clean = false;
        addText('BOUNTY BLOWN', W / 2, H * 0.42 + 78, '#facc15', 18);
      }
      addText('GOAL', W / 2, H * 0.42, '#f87171', 54);
      if (keeper.early) addText('Too early — he read your dive!', W / 2, H * 0.42 + 40, '#fecaca', 15);
      else if (!keeper.timed) addText('Tap or swipe to dive!', W / 2, H * 0.42 + 40, '#fecaca', 15);
      else addText(ms, W / 2, H * 0.42 + 40, '#fecaca', 15);
    }
    timeScale = 1;
    if (isHeavyParry(shot, shot.result)) {
      setPhase('rebound');
      updateHud();
      coachHint();
      return;
    }
    if (res === 'catch') {
      beginThrow();
      return;
    }
    setPhase('result');
    updateHud();
    coachHint();
  }

  function launchRebound() {
    const side = Math.sign(shot.tx) || Math.sign(keeper.hx) || 1;
    const origin = clamp(keeper.x, -0.35, 0.35);
    const want = -side * rand(2.05, 2.75);
    const reach = maxReach() - 0.2;
    const tx = clamp(want, origin - reach, origin + reach);
    const ty = rand(0.38, 1.2);
    shot.rebound = {
      from: { x: ball.x, y: Math.max(0.42, ball.y), z: Math.max(0.2, ball.z) },
      to: { x: tx, y: ty, z: 0 },
      T: rand(0.58, 0.72)
    };
    shot.leg = 2;
    shot.pendingRebound = false;
    shot.tx = tx;
    shot.ty = ty;
    shot.T = shot.rebound.T;
    shot.u = 0;
    shot.resolved = false;
    shot.post = false;
    shot.trail = 'rebound';
    shot.spinRate = 16;
    shot.spinSign = Math.sign(tx - shot.rebound.from.x) || -side;
    shot.broke = false;
    ball.mode = 'flight';
    ball.trail = [];
    ball.bounces = 0;
    keeper.diving = false;
    keeper.early = false;
    keeper.timed = false;
    keeper.contactAt = 0;
    keeper.x = origin;
    keeper.hx = keeper.fx = keeper.tx = origin;
    keeper.hy = keeper.fy = keeper.ty = 1.15;
    keeper.t = 0;
    keeper.dur = 0;
    setPhase('flight');
    AudioFX.play('bounce');
    fx.shake = 3;
    addText('SECOND BALL', W / 2, H * 0.38, '#c4b5fd', 26);
    coachHint();
    updateHud();
  }

  function gateX(at) {
    const sway = throwState && throwState.sway != null ? throwState.sway : 1.35;
    const span = throwState && throwState.span != null ? throwState.span : 2.15;
    return Math.sin((at == null ? clock : at) * sway) * span;
  }

  function beginThrow() {
    throwState = {
      t: 0,
      limit: LOOP.throwWindow,
      flung: false,
      checked: false,
      done: false,
      exit: 0,
      gateZ: 6.4,
      gateHalf: run && run.stage === 1 ? 1.7 : 0.85,
      gentle: !!(run && run.stage === 1),
      sway: run && run.stage === 1 ? 0.55 : 1.35,
      span: run && run.stage === 1 ? 1.15 : 2.15
    };
    ball.mode = 'held';
    setPhase('throw');
    updateHud();
    coachHint();
  }

  function launchThrow(vx) {
    if (!throwState || throwState.flung) return;
    ball.mode = 'flight';
    ball.x = keeper.hx;
    ball.y = Math.max(0.85, keeper.hy);
    ball.z = KEEPER_Z;
    ball.vx = vx;
    ball.vz = 15;
    ball.vy = 2.5;
    ball.trail = [];
    throwState.flung = true;
    AudioFX.play('kick');
    coachHint();
  }

  function throwFlick(dx, dy) {
    const len = Math.hypot(dx, dy);
    const gentle = !!(throwState && throwState.gentle);
    if (len < (gentle ? 16 : 36)) return false;
    const ny = -dy / len;
    if (ny < 0.25) return false;
    if (gentle) { aimThrow(); return true; }
    const nx = dx / len;
    const power = clamp(len / 160, 0.8, 1.3);
    launchThrow(nx * 7.5 * power);
    return true;
  }

  function aimThrow() {
    if (!throwState || throwState.flung) return;
    const travel = (throwState.gateZ - KEEPER_Z) / 15;
    const gx = gateX(clock + travel);
    launchThrow((gx - keeper.hx) / travel);
  }

  function finishThrow(hit, missDist) {
    if (!throwState || throwState.done) return;
    throwState.done = true;
    throwState.exit = hit ? 0.45 : (throwState.flung ? 0.35 : 0.02);
    if (!hit) {
      if (throwState.flung) addText('WIDE', W / 2, H * 0.36, '#fecaca', 28);
      return;
    }
    const central = missDist < throwState.gateHalf * 0.4;
    const coins = central ? LOOP.throwCoins[1] : LOOP.throwCoins[0];
    run.purse += coins;
    run.score += central ? 30 : 15;
    if (run.event && run.event.kind === 'blitz') run.event.time = Math.min(28, run.event.time + LOOP.throwTime);
    else run.timeBank += LOOP.throwTime;
    AudioFX.play('coin');
    AudioFX.crowd('cheer');
    addText(central ? 'GATE' : 'THROUGH', W / 2, H * 0.34, '#facc15', 32);
    addText('+' + coins + ' COINS · +1.5s', W / 2, H * 0.34 + 34, '#ffffff', 16);
    updateHud();
  }

  function updateThrow(dt) {
    if (!throwState) return;
    throwState.t += dt;
    if (HOOK.autoplay && !throwState.flung && !throwState.done && throwState.t > 0.18) aimThrow();
    if (!throwState.flung) {
      if (throwState.t >= throwState.limit) finishThrow(false, 0);
    } else if (!throwState.checked) {
      ball.vy -= 9.8 * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.z += ball.vz * dt;
      ball.spin += dt * 14;
      if (ball.z >= throwState.gateZ) {
        throwState.checked = true;
        const over = ball.z - throwState.gateZ;
        const xAt = ball.x - ball.vx * (over / Math.max(0.01, ball.vz));
        const gx = gateX();
        const hit = Math.abs(xAt - gx) <= throwState.gateHalf && ball.y > 0.15 && ball.y < 2.55;
        finishThrow(hit, Math.abs(xAt - gx));
      }
    }
    if (throwState.done) {
      throwState.exit -= dt;
      if (throwState.exit <= 0) {
        throwState = null;
        afterResult();
      }
    }
  }

  function finishStage() {
    const plan = run.plan;
    let extra = '';
    if (run.timeBank) {
      const pts = Math.round(run.timeBank * 10);
      run.score += pts;
      extra += ' · +' + run.timeBank.toFixed(1) + 's';
      run.timeBank = 0;
    }
    if (run.event && run.event.kind === 'bounty' && !run.event.cashed) {
      run.event.cashed = true;
      if (run.event.clean) {
        const coins = LOOP.bountyPurse + LOOP.bountyPerStage * run.stage;
        run.purse += coins;
        extra += ' · BOUNTY +' + coins;
      } else extra += ' · BOUNTY LOST';
    }
    if (run.event && run.event.kind === 'blitz') {
      const coins = cashBlitz();
      extra += ' · STREAK ' + (run.event.peak || 0) + ' · +' + coins;
    }
    const bonus = plan.boss ? 500 : 200;
    run.score += bonus;
    if (plan.boss) { run.bosses++; run.hearts = Math.min(run.maxHearts, run.hearts + 1); }
    fx.banner = {
      big: plan.boss ? 'BOSS BEATEN' : (plan.event === 'blitz' ? 'BLITZ CLEAR' : plan.event === 'bounty' ? 'SHEET CLOSED' : 'STAGE CLEAR'),
      small: 'STAGE ' + run.stage,
      sub: '+' + bonus + (plan.boss ? '  ·  +1 life' : '') + extra,
      col: plan.boss ? '#facc15' : '#a3e635'
    };
    AudioFX.crowd('roar'); AudioFX.play('coin');
    setPhase('clear');
    updateHud();
  }

  function openPerkPick() {
    if (phase === 'perk') return;
    run.perk = null;
    const offers = PERKS.map(p => ({ id: p.id, rarity: Math.random() < LOOP.rareChance ? 'rare' : 'common' }));
    run.offers = offers;
    const list = $('perkList');
    if (list) {
      list.innerHTML = '';
      offers.forEach((o, i) => {
        const def = PERKS.find(p => p.id === o.id);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'perk-card' + (o.rarity === 'rare' ? ' rare' : '');
        b.dataset.perk = o.id;
        b.innerHTML = `<span class="rarity">${o.rarity === 'rare' ? 'RARE' : 'COMMON'}</span><b>${def.name}</b><span>${o.rarity === 'rare' ? def.rareBlurb : def.blurb}</span>`;
        b.addEventListener('click', () => { AudioFX.init(); choosePerk(i); });
        list.appendChild(b);
      });
    }
    setPhase('perk');
    show('perk');
    updateHud();
    const first = list && list.querySelector('button');
    if (first) first.focus();
  }

  function choosePerk(index) {
    const o = run.offers && run.offers[index];
    if (!o || phase !== 'perk') return;
    run.perk = { id: o.id, rarity: o.rarity, stage: run.stage + 1 };
    AudioFX.play('ui');
    hideAll();
    $('hud').style.display = 'block';
    startStage_(run.stage + 1);
  }

  function afterResult() {
    if (run.hearts <= 0) { cashBlitz(); return gameOver(); }
    if (blitzDone()) return finishStage();
    run.shotIdx++;
    const plan = run.plan;
    const done = plan.boss ? run.bossHp <= 0 : run.shotIdx >= plan.shots;
    if (done) return finishStage();
    newShot();
  }

  let lastCoins = 0;
  function gameOver() {
    setPhase('over');
    cashBlitz();
    lastCoins = Math.max(15, Math.floor(run.score / 25) + run.bosses * 40) + (run.purse || 0);
    if (save.pro) lastCoins *= 2;
    save.coins += lastCoins;
    save.best = Math.max(save.best, run.stage);
    save.bestScore = Math.max(save.bestScore, run.score);
    persist();

    $('oTitle').textContent = run.stage >= 4 ? 'WHAT A RUN' : 'FULL TIME';
    $('oSub').textContent = 'Stage ' + run.stage + ' · Best streak ' + run.bestStreak;
    $('oScore').textContent = run.score.toLocaleString();
    $('oSaves').textContent = run.saves;
    $('oCatch').textContent = run.catches;
    $('oCoins').textContent = '+' + lastCoins;

    const rb = $('reviveBtn');
    rb.style.display = run.revived ? 'none' : 'flex';
    rb.textContent = save.pro ? 'SECOND LIFE · Free with Pro' : 'SECOND LIFE · Watch Ad';

    const db = $('doubleBtn');
    db.style.display = (save.pro || run.doubled) ? 'none' : 'flex';
    db.textContent = '2× Match Coins (+' + lastCoins + ') · Watch Ad';

    setTimeout(() => { if (phase === 'over') show('over'); }, HOOK.fast ? 200 : 850);
    $('hint').style.display = 'none';
  }

  function runMockAd(subtitle, onReward) {
    if (adActive) return;
    adActive = true;
    AudioFX.setAdPlaying(true);
    $('adSub').textContent = subtitle;
    show('ad');
    let n = HOOK.fast ? 1 : 3;
    $('adCount').textContent = n;
    const iv = setInterval(() => {
      n--;
      $('adCount').textContent = Math.max(0, n);
      if (n <= 0) {
        clearInterval(iv);
        adActive = false;
        AudioFX.setAdPlaying(false);
        onReward();
      }
    }, 1000);
  }

  function revive() {
    const go = () => {
      run.revived = true; run.hearts = 1; hideAll(); $('hud').style.display = 'block';
      save.coins = Math.max(0, save.coins - lastCoins); persist();
      addText('SECOND LIFE!', W / 2, H * 0.45, '#a3e635', 34);
      run.shotIdx++; newShot(); updateHud();
      showToast('Back in goal — 1 life restored!');
    };
    if (save.pro) return go();
    runMockAd('Simulated offline rewarded ad · restores 1 life', go);
  }

  function doubleCoins() {
    if (run.doubled || save.pro) return;
    runMockAd('Simulated offline rewarded ad · doubles match payout', () => {
      run.doubled = true;
      save.coins += lastCoins;
      lastCoins *= 2;
      persist();
      $('oCoins').textContent = '+' + lastCoins;
      $('doubleBtn').style.display = 'none';
      show('over');
      AudioFX.play('coin');
      showToast('Match coins doubled (+' + lastCoins + ')!');
    });
  }

  // ---------- Update ----------
  function tickFeel(dt, frozen) {
    if (fx.diveMark) fx.diveMark.t += dt;
    fx.texts.forEach(t => t.t += dt);
    fx.texts = fx.texts.filter(t => t.t < t.life);
    fx.parts.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; });
    fx.parts = fx.parts.filter(p => p.t < p.life);
    fx.decals.forEach(d => d.t += dt);
    fx.decals = fx.decals.filter(d => d.t < d.life);
    fx.tilt *= Math.exp(-dt * 9);
    if (Math.abs(fx.tilt) < 0.0008) fx.tilt = 0;
    if (fx.net) { fx.net.t += dt; if (fx.net.t > (fx.net.rattle ? 0.55 : 1.4)) fx.net = null; }
    if (!frozen) {
      fx.flash = Math.max(0, fx.flash - dt);
      fx.shake = Math.max(0, fx.shake - dt * 30);
      if (fx.zoom > 1) {
        fx.zoomHold = Math.max(0, fx.zoomHold - dt);
        if (fx.zoomHold <= 0) fx.zoom = 1 + (fx.zoom - 1) * Math.exp(-dt * 8);
        if (fx.zoom < 1.004) fx.zoom = 1;
      }
    }
  }

  function update(dt) {
    clock += dt;
    tickFeel(dt, hitStop > 0);
    if (hitStop > 0) { hitStop = Math.max(0, hitStop - dt); return; }
    phaseT += dt;
    if (run && keeper.recover > 0) keeper.recover = Math.max(0, keeper.recover - dt);
    if (run && !(keeper.diving && keeper.t < 1)) keeper.stamina = Math.min(1, keeper.stamina + refillRate() * dt);
    syncStamina();

    if (phase === 'intro') { if (phaseT > (HOOK.fast ? 0.25 : 1.55)) { fx.banner = null; newShot(); } return; }
    if (phase === 'clear') { if (phaseT > (HOOK.fast ? 0.25 : 1.55)) { fx.banner = null; openPerkPick(); } return; }
    if (phase === 'perk') return;
    if (phase === 'throw') { updateThrow(dt); tickBlitz(dt); return; }
    if (!shot) return;
    const gdt = dt * timeScale;

    if (keeper.diving) {
      const prevT = keeper.t;
      keeper.t = Math.min(1, keeper.t + gdt / keeper.dur);
      const e = easeOut(keeper.t);
      keeper.hx = lerp(keeper.fx, keeper.tx, e);
      keeper.hy = lerp(keeper.fy, keeper.ty, e);
      if (prevT < 1 && keeper.t >= 1) keeper.recover = recoverLock();
    } else if (phase === 'runup' && ptr && ptr.step && !ptr.done) {
      keeper.x = clamp(keeper.x + ptr.edge * stepSpeed() * dt, -LOOP.stepLimit, LOOP.stepLimit);
      keeper.hx = keeper.fx = keeper.tx = keeper.x;
    } else if (phase === 'runup' || phase === 'flight') {
      keeper.hy = 1.25 + Math.sin(clock * 6) * 0.035;
      keeper.hx = keeper.x + Math.sin(clock * 3.2) * 0.05;
    }
    shot.kickPose = Math.max(0, shot.kickPose - dt * 3);
    shot.wallHop = Math.max(0, shot.wallHop - dt * 1.6);
    shot.hopSquash = Math.max(0, (shot.hopSquash || 0) - dt * 6);
    if (phase === 'runup' && shot.card === 'knuckle') {
      shot.spotJitter = Math.sin(clock * shot.oscHz * Math.PI * 2) * shot.oscPx;
    } else if (shot.spotJitter) shot.spotJitter = 0;

    if (phase === 'runup') {
      if (blitzDone()) { finishStage(); return; }
      shot.runT += gdt;
      if (shot.runT >= shot.runup) { kick(); setPhase('flight'); }
    } else if (phase === 'flight') {
      shot.u = Math.min(1, shot.u + gdt / shot.T);
      const p = ballAt(shot.u);
      ball.x = p.x; ball.y = p.y; ball.z = p.z;
      ball.spin += gdt * (shot.spinRate != null ? shot.spinRate : 25);
      if (shot.hopAt && !shot.hopped && pathFraction(shot, shot.u * shot.T) >= shot.hopAt - 0.001) {
        shot.hopped = true;
        shot.hopSquash = 1;
        AudioFX.play('bounce');
        const bp = proj(ball.x, BALL_R, ball.z);
        burst(bp.x, bp.y, '#facc15', 8);
      }
      if (shot.breakP != null && !shot.broke && pathFraction(shot, shot.u * shot.T) >= shot.breakP - 0.001) {
        shot.broke = true;
        shot.trail = 'deflect';
        const bp = proj(ball.x, ball.y, ball.z);
        burst(bp.x, bp.y, '#f87171', 10);
        AudioFX.play('tip');
        fx.shake = Math.max(fx.shake, 2);
      }
      pushTrail();
      if (HOOK.autoplay && !keeper.diving && shot.kicked) {
        const remain = shot.T * (1 - shot.u);
        const dist = Math.hypot(shot.tx - keeper.x, shot.ty - 1.25);
        if (remain <= diveDur(Math.min(dist, maxReach())) + 0.012) dive(shot.tx, shot.ty);
      }
      if (shot.u >= 1) resolveShot();
    } else if (phase === 'rebound') {
      ball.vy -= 9.8 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt; ball.spin += dt * 10;
      if (ball.y < BALL_R) {
        ball.y = BALL_R; ball.vy = Math.abs(ball.vy) * 0.45; ball.vx *= 0.8; ball.vz *= 0.8;
      }
      if (!keeper.diving || keeper.t >= 1) {
        keeper.diving = false;
        keeper.x = lerp(keeper.x, 0, clamp(dt * 9, 0, 1));
        keeper.hx = keeper.x;
        keeper.hy = lerp(keeper.hy, 1.18, clamp(dt * 9, 0, 1));
      }
      if (phaseT >= (shot.reboundDelay || 0.36)) launchRebound();
    } else if (phase === 'result') {
      if (ball.mode === 'held') { ball.x = keeper.hx; ball.y = keeper.hy; ball.z = 0.05; }
      else if (ball.mode === 'loose') {
        ball.vy -= 9.8 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt; ball.spin += dt * 12;
        if (ball.y < BALL_R) {
          ball.y = BALL_R; ball.vy = Math.abs(ball.vy) * 0.5; ball.vx *= 0.8; ball.vz *= 0.8;
          if (ball.bounces++ < 2) AudioFX.play('bounce');
        }
      } else if (ball.mode === 'net') {
        ball.x += ball.vx * dt; ball.z += ball.vz * dt; ball.vz *= Math.pow(0.02, dt);
        if (ball.z < -NET_D + 0.15) { ball.z = -NET_D + 0.15; ball.vz = 0; }
        ball.vy -= 9.8 * dt * (ball.z < -NET_D + 0.3 ? 1 : 0);
        ball.y = Math.max(BALL_R, ball.y + ball.vy * dt);
      }
      pushTrail(true);
      const blitzWait = run.event && run.event.kind === 'blitz' ? 0.45 : 0.9;
      const retry = shot.result === 'goal' ? TIMING.failRetry : (HOOK.fast ? 0.4 : blitzWait);
      if (phaseT > retry) afterResult();
    }
    tickBlitz(dt);
  }

  function tickBlitz(dt) {
    if (!run || !run.event || run.event.kind !== 'blitz' || run.event.time <= 0) return;
    if (phase !== 'runup' && phase !== 'flight' && phase !== 'rebound' && phase !== 'result' && phase !== 'throw') return;
    run.event.time = Math.max(0, run.event.time - dt);
    const sp = $('stagePill');
    if (sp) sp.textContent = 'BLITZ ' + run.event.time.toFixed(1) + 's';
  }

  function syncStamina() {
    const el = $('stamFill');
    if (!el || !run) return;
    const pct = Math.round(keeper.stamina * 100);
    if (pct === stamShown) return;
    stamShown = pct;
    el.style.width = pct + '%';
    el.classList.toggle('low', pct < 25);
  }

  function pushTrail(decay) {
    const p = proj(ball.x, ball.y, ball.z);
    if (!decay) {
      ball.trail.push({
        x: p.x, y: p.y, r: p.s * BALL_R * 1.5,
        rgb: shot ? spinRGB(shot) : '248,250,252',
        gap: !!(shot && shot.trail === 'knuckle')
      });
    } else ball.trail.shift();
    const cap = shot && shot.trail === 'spin' ? 18 : 12;
    if (ball.trail.length > cap) ball.trail.shift();
  }

  // ---------- Effects ----------
  function addText(s, x, y, col, size) {
    const pad = Math.min(W * 0.34, Math.max(76, s.length * size * 0.33));
    fx.texts.push({ s, x: clamp(x, pad, W - pad), y: clamp(y, 88, H - 90), col, size, t: 0, life: 1.1 });
  }
  function burst(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(120, 320);
      fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, col, t: 0, life: rand(0.4, 0.8), r: rand(2, 4.2) });
    }
  }

  // ---------- Render ----------
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (fx.tilt) {
      ctx.translate(W / 2, GL_Y);
      ctx.rotate(fx.tilt);
      ctx.translate(-W / 2, -GL_Y);
    }
    if (fx.zoom > 1.001 && fx.zoomAt) {
      ctx.translate(fx.zoomAt.x, fx.zoomAt.y);
      ctx.scale(fx.zoom, fx.zoom);
      ctx.translate(-fx.zoomAt.x, -fx.zoomAt.y);
    }
    if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake));
    ctx.drawImage(stands, 0, 0, W, H);

    // Subtle camera flashes in the stands
    for (let i = 0; i < 2; i++) {
      if (Math.random() < 0.06) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(Math.random() * W, rand(HOR_Y - H * 0.16, groundY(PITCH_Z) - 22), 1.8, 0, 7);
        ctx.fill();
      }
    }

    drawPitch();
    drawDecals('turf');
    drawBoards();
    if (shot) {
      if (shot.def.wall) drawWall();
      drawStriker();
    }
    if (phase === 'throw' || (phase === 'tutorial' && tutorial && tutorial.beat === 2)) drawGate();
    if (phase === 'runup') drawStepEdges();
    if (shot && shot.card && (phase === 'runup' || phase === 'flight' || (phase === 'tutorial' && tutorial && tutorial.showTell))) drawTelegraphs();
    if (assistApplies()) drawAssistArc();
    if (landingRingVisible()) drawTargetRing();
    if (fx.diveMark && fx.diveMark.t < 0.45 && !shot?.resolved) drawDiveReticle();

    drawKeeper();
    if (ball.z > 0.05 || ball.mode === 'spot') drawBall();
    drawGoalFrame();
    if (ball.z <= 0.05 && ball.mode !== 'spot') drawBall();
    if (ball.mode === 'held') drawKeeperGloves(true);
    drawDecals('glove');
    drawNet();

    if (timeScale < 1) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.78);
      vg.addColorStop(0, 'rgba(56,189,248,0)');
      vg.addColorStop(1, 'rgba(56,189,248,0.34)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (fx.flash > 0) {
      ctx.fillStyle = fx.flashCol; ctx.globalAlpha = fx.flash * 0.45;
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    fx.parts.forEach(p => {
      ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    fx.texts.forEach(drawText);
    if (phase === 'throw') drawThrowPrompt();
    if (phase === 'tutorial') drawTutorialCues();
    if (fx.banner) drawBanner();
    ctx.restore();
  }

  function quad(a, b, c, d, fill) {
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
  }
  function line3(pts, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
    pts.forEach((p, i) => { const q = proj(p[0], 0, p[1]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.stroke();
  }

  function drawPitch() {
    const XW = 60, zs = [-K + 0.6, -3];
    for (let z = 0; z < PITCH_Z; z += 3) zs.push(z);
    zs.push(PITCH_Z);
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      const shade = i % 2 ? '#238636' : '#2ea043';
      quad(proj(-XW, 0, z0), proj(XW, 0, z0), proj(XW, 0, z1), proj(-XW, 0, z1),
        z0 < 0 ? (i % 2 ? '#1f7430' : '#238636') : shade);
    }
    const lp = proj(0, 0, 7);
    const rg = ctx.createRadialGradient(lp.x, lp.y, 12, lp.x, lp.y, W * 0.92);
    rg.addColorStop(0, 'rgba(255,255,235,0.12)');
    rg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = rg; ctx.fillRect(0, groundY(PITCH_Z), W, H);

    const lw = Math.max(1.4, S0 * 0.065), col = 'rgba(255,255,255,0.88)';
    line3([[-40, 0], [40, 0]], lw, col);
    line3([[-9.16, 0], [-9.16, 5.5], [9.16, 5.5], [9.16, 0]], lw * 0.85, col);
    line3([[-20.16, 0], [-20.16, 16.5], [20.16, 16.5], [20.16, 0]], lw * 0.75, col);
    const arc = [];
    for (let a = -0.93; a <= 0.93; a += 0.08) arc.push([Math.sin(a) * 9.15, 11 + Math.cos(a) * 9.15]);
    line3(arc.filter(p => p[1] > 16.5), lw * 0.65, col);
    const ps = proj(0, 0, 11);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(ps.x, ps.y, ps.s * 0.15, ps.s * 0.07, 0, 0, 7); ctx.fill();
  }

  function drawBoards() {
    const a = proj(-60, 0, PITCH_Z), b = proj(60, 1.0, PITCH_Z);
    ctx.fillStyle = '#0a1224'; ctx.fillRect(0, b.y, W, a.y - b.y);
    const words = ['LAST LINE', 'GLOVEWORKS', 'CLEAN SHEET', 'KEEPER CO.', 'STADIUM PRO'];
    const h = a.y - b.y;
    ctx.font = `900 ${Math.max(8, h * 0.6)}px system-ui`;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const seg = W / 3.1, off = (clock * 16) % seg;
    for (let i = -1; i < 5; i++) {
      const x = i * seg - off + seg / 2;
      ctx.fillStyle = ['#0284c7', '#15803d', '#be123c', '#6d28d9', '#b45309'][(i + 5) % 5];
      ctx.fillRect(x - seg / 2 + 1, b.y + 1, seg - 2, h - 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(words[(i + 5) % 5], x, b.y + h / 2);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function person(x, y, z, o) {
    const g = proj(x + (o.sway || 0), (o.hop || 0), z); const s = g.s;
    ctx.save(); ctx.translate(g.x, g.y);
    const sh = proj(x, 0, z);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(sh.x - g.x, sh.y - g.y, s * 0.4, s * 0.11, 0, 0, 7); ctx.fill();

    ctx.lineCap = 'round';
    const legW = s * 0.16, kickA = o.kick || 0;
    ctx.strokeStyle = '#f1c27d'; ctx.lineWidth = legW;
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.9); ctx.lineTo(-s * 0.13 - (o.stride || 0) * s * 0.15, -s * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.1, -s * 0.9); ctx.lineTo(s * 0.13 + kickA * s * 0.35 + (o.stride || 0) * s * 0.15, -s * 0.08 - kickA * s * 0.35); ctx.stroke();

    const plantX = -s * 0.13 - (o.stride || 0) * s * 0.15;
    const plantY = -s * 0.06;
    const kickX = s * 0.13 + kickA * s * 0.35 + (o.stride || 0) * s * 0.15;
    const kickY = -s * 0.06 - kickA * s * 0.35;
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.ellipse(kickX, kickY, s * 0.1, s * 0.05, 0, 0, 7); ctx.fill();
    if (o.tell && o.plantYaw != null) {
      const side = Math.sin(o.plantYaw);
      const dir = Math.sign(side || 1);
      const len = lerp(s * 0.22, s * 0.62, Math.min(1, Math.abs(side) * 2.4));
      const wid = s * 0.16;
      ctx.save();
      ctx.translate(plantX, plantY);
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.ellipse(dir * len * 0.25, 0, len, wid, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(dir * len * 0.85, 0, wid * 0.72, 0, 7); ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.ellipse(plantX, plantY, s * 0.1, s * 0.05, 0, 0, 7); ctx.fill();
    }

    ctx.save();
    ctx.translate(0, -s * 0.9);
    ctx.rotate((o.hip || 0) * 0.4);
    ctx.translate(0, s * 0.9);
    ctx.fillStyle = o.shorts; ctx.fillRect(-s * 0.22, -s * 1.02, s * 0.44, s * 0.24);
    ctx.fillStyle = o.shirt; roundRect(-s * 0.25, -s * 1.54, s * 0.50, s * 0.56, s * 0.08); ctx.fill();
    ctx.strokeStyle = o.shirt; ctx.lineWidth = s * 0.12;
    ctx.beginPath(); ctx.moveTo(-s * 0.22, -s * 1.44); ctx.lineTo(-s * 0.36, -s * 1.08 + (o.arm || 0) * s * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.22, -s * 1.44); ctx.lineTo(s * 0.36, -s * 1.08 - (o.arm || 0) * s * 0.2); ctx.stroke();

    ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(0, -s * 1.69, s * 0.135, 0, 7); ctx.fill();
    ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, -s * 1.73, s * 0.135, Math.PI, 0); ctx.fill();

    if (o.num && s > 12) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `900 ${s * 0.26}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(o.num, 0, -s * 1.25);
    }
    if (o.crown) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(-s * 0.13, -s * 1.87); ctx.lineTo(-s * 0.13, -s * 2.02); ctx.lineTo(-s * 0.05, -s * 1.94);
      ctx.lineTo(0, -s * 2.05); ctx.lineTo(s * 0.05, -s * 1.94); ctx.lineTo(s * 0.13, -s * 2.02); ctx.lineTo(s * 0.13, -s * 1.87);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  function strikerPose() {
    const s = shot, d = s.def;
    let k = clamp(s.runT / s.runup, 0, 1), sway = 0, stride = 0;
    if (s.longTell && !s.kicked) {
      const approach = clamp(k / 0.32, 0, 1);
      stride = approach < 1 ? Math.sin(s.runT * 16) : 0;
      k = approach;
    } else if (d.stutter && !s.kicked) {
      if (k < 0.45) k = k / 0.45 * 0.6;
      else if (k < 0.8) { sway = Math.sin(clock * 14) * 0.25; k = 0.6; }
      else k = 0.6 + (k - 0.8) / 0.2 * 0.4;
    }
    if (!s.kicked && !(s.longTell)) stride = Math.sin(s.runT * 18) * (k < 1 ? 1 : 0);
    const px = s.kicked ? s.sx - s.aside * 0.45 : lerp(s.sx - s.aside * 2.2, s.sx - s.aside * 0.45, k);
    const pz = s.kicked ? s.sz + 0.5 : lerp(s.sz + 2.6, s.sz + 0.5, k);
    return { px, pz, sway, stride };
  }

  function drawStriker() {
    const s = shot, d = s.def;
    const pose = strikerPose();
    const telling = !!s.card && !s.resolved && s.leg !== 2 && (!s.kicked || s.u < 0.32);
    person(pose.px, 0, pose.pz, {
      shirt: d.shirt, shorts: d.shorts, kick: s.kickPose, sway: pose.sway, stride: pose.stride, arm: pose.stride,
      num: d.boss ? '' : String(7 + (s.sz | 0) % 5), crown: d.boss,
      plantYaw: telling ? s.plantYaw : null,
      hip: telling ? s.hip : 0,
      tell: telling
    });
  }

  function drawTelegraphs() {
    const s = shot;
    if (!s || !s.card || s.leg === 2 || s.resolved) return;
    const fade = !s.kicked ? 1 : clamp(1 - s.u / 0.32, 0, 1);
    if (fade <= 0.02) return;
    const rgb = spinRGB(s);
    const aim = s.card === 'curler' ? s.aimX : (s.preTx != null ? s.preTx : s.tx);
    const dx = aim - s.sx, dz = -s.sz;
    const L = Math.hypot(dx, dz) || 1;
    const stub = 3.3;
    const a = proj(s.sx, 0, s.sz);
    const b = proj(s.sx + dx / L * stub, 0, s.sz + dz / L * stub);
    ctx.save();
    ctx.globalAlpha = 0.95 * fade;
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - Math.cos(ang - 0.45) * 10, b.y - Math.sin(ang - 0.45) * 10);
    ctx.lineTo(b.x - Math.cos(ang + 0.45) * 10, b.y - Math.sin(ang + 0.45) * 10);
    ctx.closePath();
    ctx.fill();
    const pose = strikerPose();
    const hip = proj(pose.px, 1.12, pose.pz);
    const bar = Math.max(6, hip.s * 0.42);
    ctx.globalAlpha = fade;
    ctx.translate(hip.x, hip.y);
    ctx.rotate((s.hip || 0) * 0.6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-bar, 0);
    ctx.lineTo(bar, 0);
    ctx.lineWidth = Math.max(2.5, bar * 0.42);
    ctx.strokeStyle = 'rgba(8,17,36,0.9)';
    ctx.stroke();
    ctx.lineWidth = Math.max(1.4, bar * 0.22);
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.stroke();
    ctx.restore();
  }

  function drawAssistArc() {
    ctx.save();
    ctx.strokeStyle = 'rgba(163, 230, 53, 0.92)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 7]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const u0 = phase === 'flight' ? shot.u : 0;
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const u = u0 + (1 - u0) * (i / steps);
      const p = ballAt(u);
      const q = proj(p.x, p.y, p.z);
      i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawWall() {
    const s = shot; const wz = Math.max(4, s.sz - 9.15);
    const dirx = (0 - s.sx) / s.sz; const cx = s.sx + dirx * 9.15;
    const hop = Math.sin(clamp(1 - s.wallHop, 0, 1) * Math.PI) * 0.5 * (s.kicked ? 1 : 0);
    for (let i = 0; i < 4; i++) person(cx + (i - 1.5) * 0.55, 0, wz, { shirt: '#f8fafc', shorts: '#111827', hop, arm: -0.5 });
  }

  // Clean, distinct goalkeeper seen from behind: athletic crouch in ready stance, outstretched dive when lunging
  function glovePositions() {
    if (!keeper.diving) {
      return [
        { x: keeper.x - 0.44, y: 1.06 + Math.sin(clock * 6) * 0.02 },
        { x: keeper.x + 0.44, y: 1.06 + Math.sin(clock * 6) * 0.02 }
      ];
    }
    const F = keeperFeet();
    const dx = keeper.hx - F.x, dy = keeper.hy - F.y, L = Math.hypot(dx, dy) || 1;
    const px = -dy / L, py = dx / L;
    return [
      { x: keeper.hx + px * -0.17, y: keeper.hy + py * -0.17 },
      { x: keeper.hx + px * 0.17, y: keeper.hy + py * 0.17 }
    ];
  }

  function drawKeeper() {
    const kit = kitDef();
    const sc = proj(0, 0, KEEPER_Z).s;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (!keeper.diving) {
      // Ready athletic crouch stance from behind — head & jersey clearly visible, gloves poised wide
      const bx = keeper.x, bob = Math.sin(clock * 6) * 0.03;
      const sh = proj(bx, 0, KEEPER_Z);
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath(); ctx.ellipse(sh.x, sh.y, sc * 0.48, sc * 0.11, 0, 0, 7); ctx.fill();

      const pt = (ox, oy) => proj(bx + ox, oy + bob * (oy > 0.3 ? 1 : 0), KEEPER_Z);
      const seg = (a, b, w, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = w * sc;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      };

      // Legs & boots (athletic wide stance)
      seg(pt(-0.24, 0.07), pt(-0.18, 0.56), 0.16, kit.trim);
      seg(pt(0.24, 0.07), pt(0.18, 0.56), 0.16, kit.trim);
      [pt(-0.26, 0.05), pt(0.26, 0.05)].forEach(b => {
        ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.ellipse(b.x, b.y, sc * 0.11, sc * 0.05, 0, 0, 7); ctx.fill();
      });

      // Shorts
      const shL = pt(-0.22, 0.58), shR = pt(0.22, 0.86);
      ctx.fillStyle = kit.shorts;
      roundRect(shL.x, shR.y, shR.x - shL.x, shL.y - shR.y, sc * 0.06);
      ctx.fill();

      // Jersey torso + shoulders
      const jL = pt(-0.25, 0.82), jR = pt(0.25, 1.38);
      ctx.fillStyle = kit.shirt;
      roundRect(jL.x, jR.y, jR.x - jL.x, jL.y - jR.y, sc * 0.09);
      ctx.fill();

      // Collar & back #1
      const numP = pt(0, 1.11);
      ctx.fillStyle = kit.trim;
      ctx.font = `900 ${sc * 0.27}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('1', numP.x, numP.y);

      // Head & hair (seen from behind, unobstructed by gloves)
      const neck = pt(0, 1.44);
      ctx.fillStyle = '#e6b88a'; ctx.beginPath(); ctx.arc(neck.x, neck.y, sc * 0.07, 0, 7); ctx.fill();
      const head = pt(0, 1.56);
      ctx.fillStyle = '#271a12'; ctx.beginPath(); ctx.arc(head.x, head.y, sc * 0.145, 0, 7); ctx.fill();

      // Outstretched arms holding gloves at sides
      const gp = glovePositions();
      seg(pt(-0.24, 1.28), proj(gp[0].x, gp[0].y, KEEPER_Z), 0.125, kit.shirt);
      seg(pt(0.24, 1.28), proj(gp[1].x, gp[1].y, KEEPER_Z), 0.125, kit.shirt);
    } else {
      // Full-stretch diving body aligned from feet to reaching hands
      const F = keeperFeet();
      const hx = keeper.hx, hy = keeper.hy;
      const dx = hx - F.x, dy = hy - F.y, L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      const px = -uy, py = ux;
      const at = (t, off = 0) => proj(F.x + dx * t + px * off, F.y + dy * t + py * off, KEEPER_Z);
      const seg = (a, b, w, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = w * sc;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      };

      // Dive ground shadow
      const sh1 = proj(F.x, 0, KEEPER_Z), sh2 = proj(hx, 0, KEEPER_Z);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse((sh1.x + sh2.x) / 2, sh1.y, Math.abs(sh2.x - sh1.x) / 2 + sc * 0.35, sc * 0.09, 0, 0, 7);
      ctx.fill();

      // Legs
      seg(at(0.02, -0.12), at(0.42, -0.10), 0.16, kit.trim);
      seg(at(0.02, 0.12), at(0.42, 0.10), 0.16, kit.trim);
      // Shorts block aligned with body axis
      seg(at(0.34, -0.07), at(0.50, -0.07), 0.18, kit.shorts);
      seg(at(0.34, 0.07), at(0.50, 0.07), 0.18, kit.shorts);
      seg(at(0.34, 0), at(0.50, 0), 0.24, kit.shorts);

      // Torso jersey
      seg(at(0.48), at(0.76), 0.42, kit.shirt);
      const back = at(0.62);
      ctx.fillStyle = kit.trim;
      ctx.font = `900 ${sc * 0.24}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('1', back.x, back.y);

      // Head behind/between outstretched arms
      const head = at(0.84);
      ctx.fillStyle = '#271a12'; ctx.beginPath(); ctx.arc(head.x, head.y, sc * 0.135, 0, 7); ctx.fill();

      // Reaching arms
      const gp = glovePositions();
      seg(at(0.74, -0.16), proj(gp[0].x, gp[0].y, KEEPER_Z), 0.12, kit.shirt);
      seg(at(0.74, 0.16), proj(gp[1].x, gp[1].y, KEEPER_Z), 0.12, kit.shirt);
    }

    if (ball.mode !== 'held') drawKeeperGloves(false);
    ctx.restore();
  }

  function drawKeeperGloves(held) {
    const g = gloveDef();
    const r = (0.135 + 0.02 * save.upg.grip) * (catchRadius() / gloveR());
    const pts = held ? [{ x: keeper.hx - 0.13, y: keeper.hy }, { x: keeper.hx + 0.13, y: keeper.hy }] : glovePositions();
    pts.forEach(gp => {
      const p = proj(gp.x, gp.y, KEEPER_Z);
      ctx.fillStyle = g.b; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (r + 0.028), 0, 7); ctx.fill();
      ctx.fillStyle = g.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(p.x - p.s * r * 0.28, p.y - p.s * r * 0.28, p.s * r * 0.3, 0, 7); ctx.fill();
    });
  }

  function drawTargetRing() {
    const p = proj(shot.tx, shot.ty, 0.05);
    const pulse = 0.88 + Math.sin(clock * 14) * 0.12;
    const alpha = clamp((shot.u - 0.22) / 0.25, 0, 0.85);
    const rad = p.s * gloveR() * 0.72 * pulse;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = keeper.diving ? '#a3e635' : '#fde047';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, rad * 0.45, 0, 7); ctx.stroke();
    ctx.restore();
  }

  function drawDecals(kind) {
    fx.decals.forEach(d => {
      if (d.kind !== kind) return;
      const k = d.t / d.life;
      const a = (1 - k) * (kind === 'turf' ? 0.75 : 0.9);
      ctx.save();
      ctx.globalAlpha = a;
      if (kind === 'turf') {
        const p = proj(d.x, 0, d.z);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.s * (0.22 + k * 0.85), p.s * (0.07 + k * 0.26), 0, 0, 7);
        ctx.stroke();
      } else {
        const p = proj(d.x, d.y, d.z);
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + k * 34, 0, 7);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  const TUTOR_BEATS = [
    { title: 'Swipe to dive', body: 'Swipe toward the ball. Your keeper dives where you aim.', dur: 5.2 },
    { title: 'Meet the ball', body: 'Dive so your gloves arrive with the ball. Too early or too late spills it.', dur: 6.4 },
    { title: 'Flick the counter', body: 'After a catch, flick up through the gate for coins and time. Waiting is fine.', dur: 4.8 }
  ];

  function tutorShot(kicked, t) {
    shot = {
      def: STRIKERS.rookie,
      sx: 0.35, sz: 12, aside: -1,
      runT: kicked ? 1.2 : t,
      runup: 1.2,
      kicked: !!kicked,
      kickPose: 0,
      longTell: false,
      card: 'straight', resolved: false, leg: 1, u: kicked ? 1 : 0,
      hip: 0.9,
      plantYaw: Math.atan2(1.55 - 0.35, 12),
      aimX: 1.65, tx: 1.65, ty: 0.82, preTx: null,
      spinSign: 0, trail: 'neutral', spotJitter: 0, broke: false
    };
  }

  function tutorFlight(u, tx, ty) {
    const z = 12 * (1 - u);
    return {
      x: lerp(0.35, tx, u),
      y: lerp(1.05, ty, u) + Math.sin(u * Math.PI) * 0.7,
      z
    };
  }

  function tutorStretch(p, tx, ty) {
    const e = easeOut(clamp(p, 0, 1));
    keeper.diving = true;
    keeper.x = 0;
    keeper.fx = 0; keeper.fy = 1.25;
    keeper.tx = tx; keeper.ty = ty;
    keeper.t = e; keeper.dur = 1;
    keeper.hx = lerp(0, tx, e);
    keeper.hy = lerp(1.25, ty, e);
    keeper.dir = Math.sign(tx) || 1;
  }

  function tutorStand() {
    keeper.diving = false;
    keeper.x = keeper.hx = keeper.fx = keeper.tx = 0;
    keeper.hy = keeper.fy = keeper.ty = 1.25;
    keeper.t = 0;
  }

  function tutorHold(tx, ty) {
    tutorStretch(1, tx, ty);
    ball.mode = 'held';
    ball.x = tx; ball.y = ty; ball.z = 0.08;
  }

  function applyTutorial(beat, t) {
    const tx = 1.55, ty = 0.78;
    tutorial.showTell = false;
    tutorial.cue = { tag: null, tagColor: '#facc15', finger: null, ring: null };
    if (beat !== 2) throwState = null;
    if (beat === 0) {
      if (t < 1.55) {
        tutorial.showTell = true;
        tutorShot(false, t);
        tutorStand();
        ball.mode = 'spot'; ball.x = shot.sx; ball.y = BALL_R; ball.z = shot.sz;
        tutorial.cue.tag = 'READ THE HIPS';
        tutorial.cue.tagColor = '#7dd3fc';
        return;
      }
      tutorShot(true, t);
      const u = clamp((t - 1.55) / 1.45, 0, 1);
      const dive = clamp((t - 2.45) / 0.55, 0, 1);
      if (u < 1) {
        const p = tutorFlight(u, tx, ty);
        ball.mode = 'flight'; ball.x = p.x; ball.y = p.y; ball.z = p.z;
      }
      if (t >= 2.35 && t < 2.95) {
        tutorial.cue.finger = clamp((t - 2.35) / 0.5, 0, 1);
        tutorial.cue.ring = { x: tx, y: ty };
      }
      if (dive > 0 && u < 1) tutorStretch(dive, tx, ty);
      else if (u >= 1 || dive >= 1) {
        tutorHold(tx, ty);
        tutorial.cue.tag = 'REFLEX';
      } else tutorStand();
      return;
    }
    if (beat === 1) {
      tutorShot(true, t);
      const early = t < 3.05;
      const local = early ? t : t - 3.05;
      const u = clamp((local - 0.25) / 1.55, 0, 1);
      const diveStart = early ? 0.35 : 1.25;
      const dive = clamp((local - diveStart) / 0.5, 0, 1);
      if (u < 1) {
        const p = tutorFlight(u, tx, ty);
        ball.mode = 'flight'; ball.x = p.x; ball.y = p.y; ball.z = p.z;
      }
      if (local >= diveStart && local < diveStart + 0.55) {
        tutorial.cue.finger = clamp((local - diveStart) / 0.45, 0, 1);
        tutorial.cue.ring = { x: tx, y: ty };
      }
      if (early) {
        if (dive > 0) tutorStretch(dive, tx, ty);
        else tutorStand();
        if (u >= 1) {
          const spill = clamp((local - 1.8) / 0.7, 0, 1);
          ball.mode = 'flight';
          ball.x = tx + spill * 0.8;
          ball.y = Math.max(BALL_R, ty - spill * 0.2);
          ball.z = 0.4 + spill * 2.2;
          tutorial.cue.tag = 'EARLY';
          tutorial.cue.tagColor = '#fb923c';
        }
      } else if (u >= 1 || (dive >= 1 && u > 0.88)) {
        tutorHold(tx, ty);
        tutorial.cue.tag = 'REFLEX';
      } else if (dive > 0) {
        tutorStretch(dive, tx, ty);
        if (u > 0.82) tutorial.cue.tag = 'REFLEX';
      } else tutorStand();
      return;
    }
    throwState = { gateZ: 6.4, gateHalf: 0.85, flung: true, limit: 1.2, t: 0, done: false };
    tutorShot(true, t);
    tutorStand();
    if (t < 1.15) {
      ball.mode = 'held';
      ball.x = keeper.hx; ball.y = keeper.hy; ball.z = 0.08;
      tutorial.cue.tag = 'FLICK UP';
      tutorial.cue.tagColor = '#a3e635';
      return;
    }
    if (t < 1.7) {
      tutorial.cue.finger = clamp((t - 1.15) / 0.45, 0, 1);
      tutorial.cue.ring = { x: gateX(), y: 0.35, z: 6.4 };
    }
    const u = clamp((t - 1.35) / 0.85, 0, 1);
    const gx = gateX();
    ball.mode = 'flight';
    ball.z = lerp(0.3, 8.2, u);
    ball.x = lerp(0, gx, Math.min(1, ball.z / 6.4));
    ball.y = 1.15 + Math.sin(u * Math.PI) * 0.4;
    if (ball.z > 6.4) {
      tutorial.cue.tag = 'GATE';
      tutorial.cue.tagColor = '#facc15';
    }
  }

  function updateTutorial(dt) {
    clock += dt;
    tutorial.t += dt;
    const dur = TUTOR_BEATS[tutorial.beat].dur;
    if (tutorial.t >= dur) {
      tutorial.t -= dur;
      ball.trail = [];
    }
    applyTutorial(tutorial.beat, tutorial.t);
    if (ball.mode === 'flight') {
      const p = proj(ball.x, ball.y, ball.z);
      ball.trail.push({ x: p.x, y: p.y, r: Math.max(3, p.s * BALL_R * 1.3), rgb: '248,250,252', gap: false });
      if (ball.trail.length > 12) ball.trail.shift();
    } else ball.trail = [];
    const bar = $('tutPlay');
    if (bar) bar.style.width = (tutorial.t / dur * 100) + '%';
  }

  function drawTutorialCues() {
    if (!tutorial || !tutorial.cue) return;
    const cue = tutorial.cue;
    const ringAt = cue.ring
      ? proj(cue.ring.x, cue.ring.y, cue.ring.z == null ? 0.05 : cue.ring.z)
      : null;
    if (ringAt && tutorial.beat !== 2) {
      ctx.save();
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(ringAt.x, ringAt.y, 16 + Math.sin(clock * 8) * 3, 0, 7); ctx.stroke();
      ctx.restore();
    }
    if (cue.finger != null) {
      const end = ringAt || { x: W * 0.5, y: H * 0.42 };
      const from = tutorial.beat === 2 ? proj(0, 1.15, 0.35) : { x: W * 0.5, y: H * 0.64 };
      const e = easeOut(cue.finger);
      const x = lerp(from.x, end.x, e);
      const y = lerp(from.y, end.y, e);
      ctx.save();
      for (let i = 4; i >= 1; i--) {
        const k = Math.max(0, cue.finger - i * 0.08);
        const px = lerp(from.x, end.x, easeOut(k));
        const py = lerp(from.y, end.y, easeOut(k));
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath(); ctx.arc(px, py, 14, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(x + 2, y + 4, 18, 0, 7); ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill();
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    if (cue.tag) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic 900 28px system-ui';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(cue.tag, W / 2, H * 0.36);
      ctx.fillStyle = cue.tagColor || '#facc15';
      ctx.fillText(cue.tag, W / 2, H * 0.36);
      ctx.restore();
    }
  }

  function syncTutorialChrome() {
    const beat = TUTOR_BEATS[tutorial.beat];
    $('tutKicker').textContent = (tutorial.beat + 1) + ' / ' + TUTOR_BEATS.length;
    $('tutTitle').textContent = beat.title;
    $('tutBody').textContent = beat.body;
    const last = tutorial.beat === TUTOR_BEATS.length - 1;
    $('tutNext').textContent = last ? (tutorialReturn === 'play' ? 'KICK OFF' : 'DONE') : 'NEXT';
    $('tutDots').innerHTML = TUTOR_BEATS.map((b, i) =>
      `<button type="button" data-beat="${i}"${i === tutorial.beat ? ' aria-current="true"' : ''} aria-label="${b.title}">${i + 1}</button>`
    ).join('');
  }

  function setTutorialBeat(i) {
    tutorial.beat = clamp(i, 0, TUTOR_BEATS.length - 1);
    tutorial.t = 0;
    ball.trail = [];
    syncTutorialChrome();
    $('tutNext').focus();
  }

  function openTutorial(ret) {
    tutorialReturn = ret || 'play';
    tutorial = { beat: 0, t: 0, showTell: false, cue: null };
    phase = 'tutorial';
    paused = false;
    hideAll();
    $('hud').style.display = 'none';
    $('hint').style.display = 'none';
    $('tutorial').classList.add('show');
    $('tutorial').setAttribute('aria-hidden', 'false');
    ball.trail = [];
    syncTutorialChrome();
    $('tutNext').focus();
  }

  function closeTutorial() {
    save.tutorialSeen = true;
    persist();
    $('tutorial').classList.remove('show');
    $('tutorial').setAttribute('aria-hidden', 'true');
    const backToTitle = tutorialReturn === 'title';
    tutorial = null;
    throwState = null;
    shot = null;
    ball.mode = 'spot'; ball.x = 0; ball.y = BALL_R; ball.z = 11; ball.trail = [];
    tutorStand();
    if (backToTitle) {
      phase = 'title';
      $('hud').style.display = 'none';
      refreshTitle();
      show('title');
      return;
    }
    startGame();
  }

  function drawGate() {
    if (!throwState) return;
    const gx = gateX();
    const z = throwState.gateZ;
    const half = throwState.gateHalf;
    const posts = [gx - half, gx + half];
    ctx.save();
    ctx.strokeStyle = 'rgba(163,230,53,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    posts.forEach(x => {
      const a = proj(x, 0.15, z);
      const b = proj(x, 2.15, z);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    });
    ctx.stroke();
    const c0 = proj(gx - half, 1.15, z);
    const c1 = proj(gx + half, 1.15, z);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#a3e635';
    ctx.fillRect(c0.x, c0.y - 28, c1.x - c0.x, 56);
    ctx.restore();
  }

  function drawThrowPrompt() {
    if (!throwState || throwState.flung) return;
    const left = Math.max(0, throwState.limit - throwState.t);
    const y = H * 0.30;
    ctx.save();
    ctx.fillStyle = 'rgba(6,13,28,0.82)';
    ctx.fillRect(W * 0.12, y - 28, W * 0.76, 56);
    ctx.fillStyle = '#a3e635';
    ctx.fillRect(W * 0.12, y + 26, W * 0.76 * (left / throwState.limit), 4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 18px system-ui';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('FLICK THE COUNTER', W / 2, y - 6);
    ctx.font = '800 12px system-ui';
    ctx.fillStyle = '#facc15';
    ctx.fillText('THROUGH THE GATE · +COINS · +1.5s', W / 2, y + 14);
    ctx.restore();
  }

  function drawStepEdges() {
    const hot = perkNow() && perkNow().id === 'reach';
    ctx.save();
    ctx.globalAlpha = hot ? 0.55 : 0.22;
    ctx.fillStyle = '#a3e635';
    [[W * 0.02, -1], [W * 0.98, 1]].forEach(([x, dir]) => {
      ctx.beginPath();
      ctx.moveTo(x, GL_Y - 18);
      ctx.lineTo(x + dir * 14, GL_Y);
      ctx.lineTo(x, GL_Y + 18);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawDiveReticle() {
    const m = fx.diveMark;
    const p = proj(m.x, m.y, 0.05);
    const k = m.t / 0.45;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.2 + k * 0.35), 0, 7); ctx.stroke();
    ctx.restore();
  }

  function drawBall() {
    const p = proj(ball.x, ball.y, ball.z);
    if (shot && shot.spotJitter && ball.mode === 'spot') p.x += shot.spotJitter;
    const r = p.s * BALL_R * 1.55;
    if (ball.mode !== 'held') {
      const sp = proj(ball.x, 0, ball.z);
      const k = clamp(1 - ball.y / 4, 0.25, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.34 * k})`;
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y, r * 1.1 * k, r * 0.35 * k, 0, 0, 7); ctx.fill();
    }
    if (ball.trail.length > 1) {
      for (let i = 1; i < ball.trail.length; i++) {
        const a = ball.trail[i - 1], b = ball.trail[i];
        if (b.gap && i % 2 === 0) continue;
        const rgb = b.rgb || '248,250,252';
        const thick = b.gap ? 1.05 : (b.rgb && b.rgb !== '248,250,252' ? 1.7 : 1.2);
        ctx.strokeStyle = `rgba(${rgb},${i / ball.trail.length * 0.85})`;
        ctx.lineWidth = b.r * thick * (i / ball.trail.length);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ball.spin);
    if (shot && shot.hopSquash) {
      const q = shot.hopSquash;
      ctx.scale(1 + q * 0.22, 1 - q * 0.32);
    }
    const bg = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#0f172a';
    pent(0, 0, r * 0.35);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 - Math.PI / 2;
      pent(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.24);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(0.7, r * 0.08);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.restore();
  }

  function pent(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 - Math.PI / 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawGoalFrame() {
    const pw = 0.125;
    const bl = proj(-HALF_W, 0, 0), tl = proj(-HALF_W, GOAL_H, 0), tr = proj(HALF_W, GOAL_H, 0), br = proj(HALF_W, 0, 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = S0 * pw + 4;
    ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.stroke();
    ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = S0 * pw;
    ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.stroke();
  }

  function netPoint(x, y, z) {
    if (fx.net && z <= -NET_D + 0.01) {
      const n = fx.net, d2 = (x - n.x) ** 2 + (y - n.y) ** 2;
      const amp = Math.exp(-d2 / 0.9) * (n.rattle ? 0.28 : 0.9) * Math.exp(-n.t * (n.rattle ? 6 : 2.2)) * Math.cos(n.t * (n.rattle ? 28 : 9));
      z -= amp;
    }
    return proj(x, y, z);
  }

  function drawNet() {
    const backTop = GOAL_H * 0.82;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
    const step = 0.36;
    ctx.beginPath();
    for (let x = -HALF_W; x <= HALF_W + 0.01; x += step) {
      for (let y = 0; y <= backTop + 0.01; y += step / 2) {
        const p = netPoint(x, y, -NET_D); y ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
    }
    for (let y = 0; y <= backTop + 0.01; y += step) {
      for (let x = -HALF_W; x <= HALF_W + 0.01; x += step / 2) {
        const p = netPoint(x, y, -NET_D); x === -HALF_W ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
    }
    for (let x = -HALF_W; x <= HALF_W + 0.01; x += step) {
      const a = proj(x, GOAL_H, 0), b = netPoint(x, backTop, -NET_D); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (let t = 0; t <= 1.001; t += 0.25) {
      const y = lerp(GOAL_H, backTop, t), z = -NET_D * t;
      const a = proj(-HALF_W, y, z), b = proj(HALF_W, y, z); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    [-HALF_W, HALF_W].forEach(x => {
      for (let t = 0; t <= 1.001; t += 0.25) {
        const a = proj(x, 0, -NET_D * t), b = proj(x, lerp(GOAL_H, backTop, t), -NET_D * t); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      for (let y = 0; y <= GOAL_H; y += step) {
        const a = proj(x, y, 0), b = proj(x, Math.min(y, backTop), -NET_D); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
    });
    ctx.stroke();

    ctx.strokeStyle = 'rgba(226,232,240,0.58)'; ctx.lineWidth = 2;
    ctx.beginPath();
    [-HALF_W, HALF_W].forEach(x => {
      const a = proj(x, GOAL_H, 0), b = proj(x, backTop, -NET_D), c = proj(x, 0, -NET_D);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    });
    const bl = proj(-HALF_W, 0, -NET_D), br = proj(HALF_W, 0, -NET_D);
    ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y);
    ctx.stroke();
  }

  function drawText(t) {
    const k = t.t / t.life;
    const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, k - 0.15);
    ctx.save();
    ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
    ctx.translate(t.x, t.y - k * 30);
    ctx.scale(pop, pop);
    ctx.font = `italic 900 ${t.size}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, t.size * 0.16);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineJoin = 'round';
    ctx.strokeText(t.s, 0, 0);
    ctx.fillStyle = t.col;
    ctx.fillText(t.s, 0, 0);
    ctx.restore();
  }

  function drawBanner() {
    const b = fx.banner, k = Math.min(1, phaseT / 0.25), y = H * 0.42;
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(6, 13, 28, 0.84)'; ctx.fillRect(0, y - 56, W, 112);
    ctx.fillStyle = b.col; ctx.fillRect(0, y - 56, W, 3); ctx.fillRect(0, y + 53, W, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 12px system-ui'; ctx.fillStyle = b.col; ctx.fillText(b.small, W / 2, y - 34);
    ctx.font = `italic 900 ${Math.min(44, W * 0.105)}px system-ui`; ctx.fillStyle = '#f8fafc';
    ctx.translate((1 - k) * -50, 0); ctx.fillText(b.big, W / 2, y - 1);
    ctx.font = '700 13px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText(b.sub, W / 2, y + 32);
    ctx.restore();
  }

  // ---------- HUD & UI ----------
  const heartSvg = on => `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3 1.7-1.8 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="${on ? '#ef4444' : 'rgba(255,255,255,0.2)'}" stroke="${on ? '#fecaca' : 'none'}" stroke-width="1"/></svg>`;

  function updateHud() {
    if (!run) return;
    $('hearts').innerHTML = Array.from({ length: run.maxHearts }, (_, i) => heartSvg(i < run.hearts)).join('');
    $('scorePill').textContent = run.score.toLocaleString();
    const sp = $('stagePill');
    if (run.plan && run.plan.boss) {
      sp.textContent = STRIKERS[run.plan.boss].name;
      sp.classList.add('boss');
    } else if (run.event && run.event.kind === 'blitz') {
      sp.textContent = 'BLITZ ' + Math.max(0, run.event.time).toFixed(1) + 's';
      sp.classList.remove('boss');
    } else if (run.event && run.event.kind === 'bounty') {
      sp.textContent = 'SHEET ' + Math.min(run.shotIdx + 1, 3) + '/3';
      sp.classList.remove('boss');
    } else {
      sp.textContent = 'STAGE ' + run.stage + (run.plan ? ' · ' + Math.min(run.shotIdx + 1, run.plan.shots) + '/' + run.plan.shots : '');
      sp.classList.remove('boss');
    }
    const chip = $('perkChip');
    if (chip) chip.textContent = perkLabel();
    syncStamina();
    const pct = Math.round(run.focus * 100);
    $('focusFill').style.width = pct + '%';
    $('focusBtn').classList.toggle('ready', run.focus >= 1);
    $('focusLabel').textContent = run.focus >= 1 ? 'FOCUS READY' : 'FOCUS';

    const wp = $('windPill');
    if (run.wind !== 0) {
      wp.classList.add('show');
      wp.textContent = (run.wind < 0 ? '← ' : '→ ') + Math.abs(run.wind) + ' mph';
    } else {
      wp.classList.remove('show');
    }

    $('bossHp').innerHTML = run.plan && run.plan.boss
      ? Array.from({ length: STRIKERS[run.plan.boss].hp }, (_, i) => `<i class="${i < run.bossHp ? '' : 'off'}"></i>`).join('')
      : '';

    const ab = $('arcBtn');
    if (ab) {
      const showArc = !!(run.plan && run.plan.script && run.stage <= 3);
      ab.style.display = showArc ? 'inline-flex' : 'none';
      ab.classList.toggle('on', !!save.assistArc);
      ab.classList.remove('done');
      ab.textContent = save.assistArc ? 'ARC ON' : 'ARC OFF';
      ab.setAttribute('aria-pressed', save.assistArc ? 'true' : 'false');
      ab.setAttribute('aria-label', 'Assist Arc on the teaching shots');
    }
  }

  function syncAssist() {
    const on = !!save.assistArc;
    ['assistBtn', 'assistPauseBtn'].forEach(id => {
      const b = $(id);
      if (!b) return;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      const mark = b.querySelector('b');
      if (mark) mark.textContent = on ? 'ON' : 'OFF';
    });
  }

  function toggleAssist() {
    save.assistArc = !save.assistArc;
    persist();
    syncAssist();
    showToast(save.assistArc ? 'Assist Arc on — teaching shots' : 'Assist Arc off');
    if (run) updateHud();
  }

  const muteIcon = m => m
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/></svg>';

  function setMute(m) {
    save.muted = m; persist();
    AudioFX.setMuted(m);
    $('muteBtn').innerHTML = muteIcon(m);
  }

  const screens = ['title', 'locker', 'pro', 'over', 'ad', 'paused', 'perk'];
  function hideAll() { screens.forEach(s => $(s).classList.remove('show')); }
  function show(id) { hideAll(); $(id).classList.add('show'); }
  let lockerReturn = 'title';

  function refreshTitle() {
    $('tBest').textContent = save.best;
    $('tScore').textContent = save.bestScore.toLocaleString();
    $('tCoins').textContent = save.coins;
    $('proBtn').textContent = save.pro ? 'Pro Active' : 'Pro Pass';
  }

  function swatchCanvas(draw) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64; c.style.width = '48px'; c.style.height = '32px';
    draw(c.getContext('2d'));
    return c;
  }

  function renderLocker() {
    $('lCoins').textContent = save.coins;
    const ul = $('upgList'); ul.innerHTML = '';
    UPGRADES.forEach(u => {
      const lvl = save.upg[u.id], maxed = lvl >= u.max, cost = upCost(u, lvl);
      const row = document.createElement('div'); row.className = 'upg';
      row.innerHTML = `<div class="info"><b>${u.name}</b><span>${u.desc}</span><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
      const b = document.createElement('button'); b.className = 'buy'; b.type = 'button';
      b.textContent = maxed ? 'MAX' : cost;
      b.disabled = maxed || save.coins < cost;
      b.onclick = () => {
        if (save.coins >= cost && !maxed) {
          save.coins -= cost; save.upg[u.id]++; persist();
          AudioFX.play('coin'); renderLocker();
          showToast(u.name + ' upgraded to Lv ' + save.upg[u.id]);
        }
      };
      row.appendChild(b); ul.appendChild(row);
    });

    const mk = (list, ownedKey, selKey, drawFn, containerId) => {
      const box = $(containerId); box.innerHTML = '';
      list.forEach(it => {
        const owned = save[ownedKey].includes(it.id) || (it.cost === -1 && save.pro);
        const equipped = save[selKey] === it.id;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'swatch' + (equipped ? ' sel' : '');
        el.appendChild(swatchCanvas(c => drawFn(c, it)));
        const statusText = owned ? (equipped ? 'EQUIPPED' : 'OWNED') : (it.cost === -1 ? 'PRO' : it.cost + ' coins');
        const cls = it.cost === -1 && !owned ? 'pro' : (owned ? 'owned' : '');
        el.insertAdjacentHTML('beforeend', `<div>${it.name}</div><div class="price ${cls}">${statusText}</div>`);
        el.onclick = () => {
          if (owned) { save[selKey] = it.id; showToast(it.name + ' equipped'); }
          else if (it.cost === -1) { show('pro'); return; }
          else if (save.coins >= it.cost) {
            save.coins -= it.cost; save[ownedKey].push(it.id); save[selKey] = it.id;
            AudioFX.play('coin'); showToast(it.name + ' unlocked!');
          } else { showToast('Need ' + (it.cost - save.coins) + ' more coins'); return; }
          persist(); AudioFX.play('ui'); renderLocker();
        };
        box.appendChild(el);
      });
    };

    mk(GLOVES, 'ownedGloves', 'glove', (c, g) => {
      [[30, 32], [66, 32]].forEach(([x, y]) => {
        c.fillStyle = g.b; c.beginPath(); c.arc(x, y, 22, 0, 7); c.fill();
        c.fillStyle = g.a; c.beginPath(); c.arc(x, y, 18, 0, 7); c.fill();
      });
    }, 'gloveList');

    mk(KITS, 'ownedKits', 'kit', (c, k) => {
      c.fillStyle = k.shirt; c.fillRect(28, 6, 40, 36); c.fillRect(14, 8, 16, 16); c.fillRect(66, 8, 16, 16);
      c.fillStyle = k.trim; c.font = '900 22px system-ui'; c.textAlign = 'center'; c.fillText('1', 48, 33);
      c.fillStyle = k.shorts; c.fillRect(30, 42, 36, 16);
    }, 'kitList');
  }

  function saveReceipt() {
    if (!run) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 1920);
    g.addColorStop(0, '#081124'); g.addColorStop(1, '#14532d');
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 3;
    for (let i = 0; i < 14; i++) { x.beginPath(); x.moveTo(0, 1100 + i * 60); x.lineTo(1080, 1100 + i * 60); x.stroke(); }
    x.textAlign = 'center'; x.fillStyle = '#a3e635'; x.font = 'italic 900 165px system-ui'; x.fillText('LAST LINE', 540, 290);
    x.fillStyle = '#f8fafc'; x.font = '800 50px system-ui'; x.fillText('KEEPER MATCH CARD', 540, 375);

    const rows = [
      ['STAGE REACHED', run.stage],
      ['MATCH SCORE', run.score.toLocaleString()],
      ['TOTAL SAVES', run.saves],
      ['CLEAN CATCHES', run.catches],
      ['BEST STREAK', run.bestStreak],
      ['BOSSES BEATEN', run.bosses]
    ];
    rows.forEach(([k, v], i) => {
      const y = 550 + i * 170;
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(110, y - 80, 860, 140);
      x.textAlign = 'left'; x.fillStyle = '#b6c8e2'; x.font = '800 42px system-ui'; x.fillText(k, 150, y + 14);
      x.textAlign = 'right'; x.fillStyle = '#ffffff'; x.font = '900 72px system-ui'; x.fillText(String(v), 930, y + 22);
    });
    const gl = gloveDef();
    [[430, 1640], [650, 1640]].forEach(([gx, gy]) => {
      x.fillStyle = gl.b; x.beginPath(); x.arc(gx, gy, 95, 0, 7); x.fill();
      x.fillStyle = gl.a; x.beginPath(); x.arc(gx, gy, 80, 0, 7); x.fill();
    });
    x.textAlign = 'center'; x.fillStyle = '#cbd5e1'; x.font = '700 40px system-ui'; x.fillText('Hold the line · 100% offline arcade', 540, 1830);
    const a = document.createElement('a'); a.download = 'last-line-card.png'; a.href = c.toDataURL('image/png'); a.click();
    showToast('Match card downloaded!');
  }

  // ---------- Input ----------
  let ptr = null;
  canvas.addEventListener('pointerdown', e => {
    AudioFX.init();
    if (phase !== 'runup' && phase !== 'flight' && phase !== 'throw') return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const edge = phase === 'runup' && (x < W * 0.16 ? -1 : x > W * 0.84 ? 1 : 0);
    ptr = { x, y, t: performance.now(), done: false, step: !!edge, edge: edge || 0 };
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptr || ptr.done) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const dx = x - ptr.x, dy = y - ptr.y;
    if (phase === 'throw') return;
    if (ptr.step && Math.hypot(dx, dy) < 70 && Math.abs(dx) >= Math.abs(dy)) return;
    if (Math.hypot(dx, dy) > 22) {
      ptr.done = true; ptr.step = false; const L = Math.hypot(dx, dy);
      dive(keeper.x + dx / L * 10, 1.25 - dy / L * 10);
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (!ptr || ptr.done) { ptr = null; return; }
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const dx = x - ptr.x, dy = y - ptr.y;
    if (phase === 'throw') throwFlick(dx, dy);
    else if (!ptr.step) dive((x - CX) / S0, (GL_Y - y) / S0);
    ptr = null;
  });
  window.addEventListener('keydown', e => {
    if (phase === 'tutorial' && tutorial) {
      if (e.key === 'Escape') { e.preventDefault(); closeTutorial(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setTutorialBeat(tutorial.beat + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setTutorialBeat(tutorial.beat - 1); }
      else if (e.key === 'Enter' && document.activeElement === $('tutNext')) return;
      return;
    }
    if (phase !== 'perk') return;
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (n == null) return;
    e.preventDefault();
    choosePerk(n);
  });

  const click = (id, fn) => $(id).addEventListener('click', () => { AudioFX.init(); AudioFX.play('ui'); fn(); });
  function startGame() {
    hideAll();
    $('hud').style.display = 'block';
    newRun();
  }

  click('playBtn', () => {
    if (!save.tutorialSeen && !HOOK.play && !HOOK.autoplay) openTutorial('play');
    else startGame();
  });
  click('howBtn', () => openTutorial('title'));
  $('tutSkip').addEventListener('click', () => { AudioFX.init(); AudioFX.play('ui'); closeTutorial(); });
  $('tutNext').addEventListener('click', () => {
    AudioFX.init(); AudioFX.play('ui');
    if (!tutorial) return;
    if (tutorial.beat >= TUTOR_BEATS.length - 1) closeTutorial();
    else setTutorialBeat(tutorial.beat + 1);
  });
  $('tutDots').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !tutorial) return;
    AudioFX.init(); AudioFX.play('ui');
    setTutorialBeat(Number(b.dataset.beat));
  });
  click('againBtn', startGame);
  click('lockerBtn', () => { lockerReturn = 'title'; renderLocker(); show('locker'); });
  click('oLocker', () => { lockerReturn = 'over'; renderLocker(); show('locker'); });
  click('proBtn', () => show('pro'));
  click('buyPro', () => {
    save.pro = true; persist();
    $('buyPro').textContent = 'Pro Pass Active';
    refreshTitle();
    showToast('Pro Keeper Pass unlocked (preview)!');
    setTimeout(() => { refreshTitle(); show('title'); }, 650);
  });
  click('reviveBtn', revive);
  click('doubleBtn', doubleCoins);
  click('receiptBtn', saveReceipt);
  click('focusBtn', () => {
    if (run && run.focus >= 1) triggerFocus(true);
    else showToast('Make clean catches to charge Focus!');
  });
  click('homeBtn', () => {
    phase = 'title'; shot = null; run = null;
    $('hud').style.display = 'none'; $('hint').style.display = 'none';
    refreshTitle(); show('title');
  });
  click('pauseBtn', () => { if (run && phase !== 'over') { paused = true; show('paused'); } });
  click('resumeBtn', () => { paused = false; hideAll(); });
  click('quitBtn', () => { paused = false; hideAll(); run.hearts = 0; gameOver(); });
  click('muteBtn', () => setMute(!save.muted));
  click('assistBtn', toggleAssist);
  click('assistPauseBtn', toggleAssist);
  click('arcBtn', toggleAssist);

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    AudioFX.play('ui'); refreshTitle();
    const inLocker = b.closest('#locker');
    show(inLocker && lockerReturn === 'over' ? 'over' : 'title');
  }));

  function handleBg() {
    AudioFX.suspend();
    if (run && (phase === 'runup' || phase === 'flight' || phase === 'result' || phase === 'throw')) { paused = true; show('paused'); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handleBg();
    else AudioFX.resume();
  });
  window.addEventListener('pagehide', handleBg);
  window.addEventListener('pageshow', () => { if (!document.hidden) AudioFX.resume(); });
  window.addEventListener('resize', resize);

  // ---------- Main Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (phase === 'tutorial') updateTutorial(dt);
    else if (!paused && run && phase !== 'over') update(dt);
    else clock += dt;
    render();
    requestAnimationFrame(frame);
  }

  resize();
  setMute(save.muted);
  syncAssist();
  refreshTitle();
  shot = null; ball.x = 0; ball.z = 11; ball.mode = 'spot';
  if (HOOK.play || HOOK.autoplay) startGame();
  requestAnimationFrame(frame);

  function deflectionAngle(s) {
    const headingIn = Math.atan2(s.preTx - s.sx, s.sz);
    const breakX = lerp(s.sx, s.preTx, s.breakP);
    const remZ = s.sz * (1 - s.breakP);
    const headingOut = Math.atan2(s.tx - breakX, remZ);
    return Math.abs(headingOut - headingIn) * 180 / Math.PI;
  }

  function auditCards() {
    const assistWas = !!save.assistArc;
    const prev = { run, shot, phase, ball: { ...ball }, keeper: { ...keeper } };
    const issues = [];
    const fail = (m) => issues.push(m);
    run = {
      stage: 1, wind: 0, shotIdx: 0, plan: stagePlan(1), faced: 0, focus: 0,
      score: 0, hearts: 3, maxHearts: 3, bossHp: 0
    };
    const script = run.plan.script;
    if (!script || script.join(',') !== 'straight,straight,straight,straight') fail('stage1 script ' + (script && script.join(',')));
    if (run.plan.shots !== 4 || !run.plan.warmup) fail('stage1 count ' + run.plan.shots);
    const rolls = { straight: 30, curler: 30, knuckle: 30, bounce: 30, deflection: 40, rebound: 20 };
    Object.keys(rolls).forEach(type => {
      for (let n = 0; n < rolls[type]; n++) {
        const s = rollCard(type, { longTell: type === 'curler' });
        shot = s;
        const tag = type + '#' + n;
        if (type === 'straight' || type === 'bounce' || type === 'deflection' || type === 'rebound') {
          if (s.speed < 18 || s.speed > 22) fail(tag + ' speed ' + s.speed.toFixed(2));
        }
        if (type === 'straight' && (s.ty < 0.30 || s.ty > 1.40)) fail(tag + ' height ' + s.ty.toFixed(2));
        if (type === 'curler') {
          const pct = Math.abs(s.tx - s.aimX) / s.sz;
          if (pct < 0.119 || pct > 0.181) fail(tag + ' curve ' + pct.toFixed(3));
          if (Math.sign(s.aimX) !== Math.sign(s.tx) || Math.abs(s.aimX) <= Math.abs(s.tx)) fail(tag + ' not wide');
          if (lateWeight(0.4) > 0.001) fail('lateWeight early');
          const early = ballAt(0.4);
          const wide = lerp(s.sx, s.aimX, 0.4);
          if (Math.abs(early.x - wide) > 0.05) fail(tag + ' bent early');
          if (!s.longTell || s.runup < 1.6) fail(tag + ' tell ' + s.runup);
          if (!s.spinSign || Math.abs(s.hip) < 0.4) fail(tag + ' hip ' + s.hip);
        }
        if (type === 'knuckle') {
          if (s.oscPx < 6 || s.oscPx > 10) fail(tag + ' osc ' + s.oscPx);
          if (s.oscHz < 12 || s.oscHz > 16) fail(tag + ' hz ' + s.oscHz);
          if (s.dipPx < 6 || s.dipPx > 10) fail(tag + ' dip ' + s.dipPx);
          const px = (s.baseTy - s.ty) * S0;
          if (Math.abs(px - s.dipPx) > 0.2) fail(tag + ' dip px ' + px.toFixed(2));
          const tPeak = 1.25 / s.oscHz;
          if (tPeak > 0.08 && tPeak < s.T - 0.12) {
            const keep = s.oscPx;
            const wob = ballAt(tPeak / s.T);
            s.oscPx = 0;
            const mean = ballAt(tPeak / s.T);
            s.oscPx = keep;
            const sc = S0 * K / (wob.z + K);
            const amp = (wob.x - mean.x) * sc;
            if (Math.abs(amp - keep) > 1.25) fail(tag + ' wobble px ' + amp.toFixed(2));
          }
        }
        if (type === 'bounce') {
          if (s.hopAt < 0.60 || s.hopAt > 0.70) fail(tag + ' hop ' + s.hopAt);
          if (Math.abs(s.postSpeed - 0.75) > 1e-6) fail(tag + ' post speed');
          const t1 = s.hopAt * s.sz / s.speed;
          const t2 = s.T - t1;
          const expect = (1 - s.hopAt) * s.sz / (s.speed * 0.75);
          if (Math.abs(t2 - expect) > 1e-3) fail(tag + ' t2 ' + t2.toFixed(3));
          const hop = ballAt(t1 / s.T);
          if (Math.abs(hop.y - BALL_R) > 0.04) fail(tag + ' hop y ' + hop.y.toFixed(3));
          if (Math.abs(hop.z - s.sz * (1 - s.hopAt)) > 0.06) fail(tag + ' hop z');
        }
        if (type === 'deflection') {
          if (s.breakLead < 0.15 || s.breakLead > 0.25) fail(tag + ' lead ' + s.breakLead);
          const ang = deflectionAngle(s);
          if (ang < 11.5 || ang > 20.5) fail(tag + ' angle ' + ang.toFixed(2));
          const remain = s.T * (1 - s.breakP);
          if (Math.abs(remain - s.breakLead) > 0.02) fail(tag + ' remain ' + remain.toFixed(3));
        }
        if (type === 'rebound') {
          if (s.reboundDelay < 0.30 || s.reboundDelay > 0.45) fail(tag + ' delay ' + s.reboundDelay);
          if (!isHeavyParry(s, 'spill')) fail(tag + ' spill flag');
          if (isHeavyParry(s, 'catch') || isHeavyParry(s, 'goal') || isHeavyParry(s, 'parry')) fail(tag + ' spill false');
        }
        const end = ballAt(1);
        if (Math.hypot(end.x - s.tx, end.y - s.ty) > 0.035 || Math.abs(end.z) > 0.03) {
          fail(tag + ' arrival ' + end.x.toFixed(2) + ',' + end.y.toFixed(2) + ',' + end.z.toFixed(2) + ' vs ' + s.tx.toFixed(2) + ',' + s.ty.toFixed(2));
        }
      }
    });
    phase = 'flight';
    shot = rollCard('straight');
    shot.u = 0.5;
    run.stage = 1;
    if (landingRingVisible()) fail('ring visible on stage 1');
    run.stage = 2;
    if (!landingRingVisible()) fail('ring hidden after stage 1');
    run.stage = 1;
    save.assistArc = true;
    run.shotIdx = 3;
    phase = 'runup';
    shot.resolved = false;
    shot.leg = 1;
    shot.card = 'straight';
    if (!assistApplies()) fail('assist should cover the warm-up');
    run.stage = 2;
    run.plan = stagePlan(2);
    shot.card = 'straight';
    if (assistApplies()) fail('assist on the rest straight');
    shot.card = 'bounce';
    if (!assistApplies()) fail('assist should cover the bounce');
    run.stage = 3;
    run.plan = stagePlan(3);
    shot.card = 'curler';
    if (!assistApplies()) fail('assist should cover the curl');
    save.assistArc = assistWas;
    const sample = rollCard('rebound');
    shot = sample;
    ball.x = sample.tx; ball.y = sample.ty; ball.z = 0.4; ball.vx = 1; ball.vy = 1; ball.vz = 1;
    keeper.x = 0; keeper.hx = 0; keeper.hy = 1.2;
    const firstSide = Math.sign(sample.tx);
    launchRebound();
    if (shot.leg !== 2) fail('rebound did not launch');
    if (Math.sign(shot.tx) !== -firstSide) fail('rebound side ' + shot.tx + ' from ' + firstSide);
    if (shot.T < 0.58 || shot.T > 0.72) fail('rebound flight ' + shot.T);
    const end2 = ballAt(1);
    if (Math.hypot(end2.x - shot.tx, end2.y - shot.ty) > 0.04) fail('rebound arrival');
    run = prev.run;
    shot = prev.shot;
    phase = prev.phase;
    Object.assign(ball, prev.ball);
    Object.assign(keeper, prev.keeper);
    fx.texts = [];
    fx.shake = 0;
    if (!prev.run) $('hint').style.display = 'none';
    return { ok: issues.length === 0, issues: issues.slice(0, 24), count: issues.length };
  }

  function auditFeel() {
    const issues = [];
    const t = (off, expect) => { if (timingTier(off) !== expect) issues.push(off + '→' + timingTier(off)); };
    t(0, 'perfect'); t(0.08, 'perfect'); t(-0.08, 'perfect');
    t(0.081, 'good'); t(-0.14, 'good'); t(0.14, 'good');
    t(0.141, 'late'); t(-0.141, 'early');
    if (!(TIMING.failRetry < 0.5)) issues.push('retry ' + TIMING.failRetry);
    if (TIMING.freezePerfect !== 0.12 || TIMING.zoomPerfect !== 1.08) issues.push('perfect juice');
    if (TIMING.freezeGood !== 0.08 || TIMING.zoomGood !== 1.05) issues.push('good juice');
    if (TIMING.parryAngle[0] < 15 || TIMING.parryAngle[1] > 20) issues.push('angle');
    if (TIMING.parrySpeed[0] < 0.6 || TIMING.parrySpeed[1] > 0.8) issues.push('speed');
    return { ok: issues.length === 0, issues };
  }

  function auditLoop() {
    const issues = [];
    const fail = (m) => issues.push(m);
    if (eventAt(1) || eventAt(2) || eventAt(3) || eventAt(4) || eventAt(8) || eventAt(12)) fail('event on lesson or boss');
    if (eventAt(5) !== 'blitz' || eventAt(9) !== 'bounty') fail('rotation ' + eventAt(5) + '/' + eventAt(9));
    const hits = [];
    for (let n = 1; n < 40; n++) {
      const e = eventAt(n);
      if (!e) continue;
      if (n % 4 === 0) fail('boss event ' + n);
      hits.push(n);
    }
    if (hits[0] !== 5) fail('first event ' + hits[0]);
    for (let i = 1; i < hits.length; i++) {
      const gap = hits[i] - hits[i - 1];
      if (gap < 3 || gap > 5) fail('gap ' + hits[i - 1] + '→' + hits[i] + ' = ' + gap);
      if (eventAt(hits[i]) === eventAt(hits[i - 1])) fail('same kind ' + hits[i]);
    }
    if (LOOP.throwWindow !== 1.2 || LOOP.throwTime !== 1.5) fail('throw');
    if (LOOP.blitzTime !== 20) fail('blitz time');
    if (stagePlan(9).event !== 'bounty' || stagePlan(9).shots !== 3) fail('bounty plan');
    if (stagePlan(5).pool[0] !== 'cross') fail('blitz pool');
    if (stagePlan(2).script.join(',') !== 'bounce,straight,bounce') fail('bounce lesson');
    if (stagePlan(6).script.join(',') !== 'knuckle,straight,knuckle') fail('knuckle lesson');
    if (stagePlan(10).script[0] !== 'rebound') fail('rebound lesson');
    if (LOOP.palms.common < 0.10 || LOOP.palms.common > 0.15) fail('palms common');
    if (LOOP.palms.rare < 0.10 || LOOP.palms.rare > 0.15) fail('palms rare');
    if (Math.abs(LOOP.recoverDive - 0.70) > 1e-6) fail('recovery');
    if (Math.abs(LOOP.stepSpeed.perk - 1.15) > 1e-6) fail('step');
    if (Math.abs(LOOP.gloveRare - 1.08) > 1e-6) fail('glove');
    if (!(LOOP.recoverRefill.common > LOOP.recoverRefill.base)) fail('refill');
    const prev = run;
    run = { stage: 3, wind: 0, faced: 0 };
    for (let n = 0; n < 12; n++) {
      const s = rollCard('cross');
      if (Math.abs(s.sx) < 6.2 || Math.abs(s.sx) > 8.2) fail('cross sx ' + s.sx.toFixed(2));
      if (s.ty < 1.35 || s.ty > 2.05) fail('cross ty ' + s.ty.toFixed(2));
      if (Math.sign(s.sx) === Math.sign(s.tx)) fail('cross same side');
    }
    run = prev;
    return { ok: issues.length === 0, issues: issues.slice(0, 16), hits };
  }

  window.LL = {
    get state() {
      return {
        phase, run, shot, keeper, ball, save,
        feel: { zoom: fx.zoom, tilt: fx.tilt, hitStop, decals: fx.decals.length },
        throw: throwState ? { t: throwState.t, flung: throwState.flung, done: throwState.done } : null
      };
    },
    getAudioTelemetry: () => AudioFX.telemetry(),
    dive, startGame, triggerFocus, auditCards, auditFeel, auditLoop, toggleAssist,
    timing: TIMING, timingTier, loop: LOOP, eventAt, throwFlick, aimThrow, choosePerk, catchRadius,
  };
  if (HOOK.check) {
    requestAnimationFrame(() => {
      const cards = auditCards();
      const feel = auditFeel();
      const loop = auditLoop();
      const report = {
        ok: cards.ok && feel.ok && loop.ok,
        issues: cards.issues.concat(feel.issues, loop.issues),
        count: cards.count + feel.issues.length + loop.issues.length,
        feel, loop
      };
      window.__LL_AUDIT = report;
      console.log('LL audit', report.ok, report.count, report.issues);
    });
  }
})();
