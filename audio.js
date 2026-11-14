// LAST LINE — 100% offline procedural WebAudio stadium & goalkeeper SFX engine
'use strict';
window.AudioFX = (() => {
  let ac = null, master = null, comp = null, noiseBuf = null;
  let crowdGain = null, crowdFilter = null;
  let muted = false, adPlaying = false;
  const tele = { played: {}, compressor: false };

  function syncGain() {
    if (!ac || !master) return;
    const silent = muted || adPlaying || document.hidden;
    const target = silent ? 0 : 0.9;
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.value = target;
    master.gain.setValueAtTime(target, ac.currentTime);
  }

  function init() {
    if (ac) {
      if (!document.hidden && !adPlaying && ac.state === 'suspended') ac.resume();
      syncGain();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 10;
    comp.ratio.value = 4.5;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    master = ac.createGain();
    master.gain.value = (muted || adPlaying || document.hidden) ? 0 : 0.9;
    master.connect(comp);
    comp.connect(ac.destination);
    tele.compressor = true;

    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startCrowd();
  }

  function mark(name) { tele.played[name] = (tele.played[name] || 0) + 1; }

  function noise(dur, type, freq, q, gain, when = 0, attack = 0.002, freqEnd = 0) {
    const t = ac.currentTime + when;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.05);
  }

  function tone(type, f0, f1, dur, gain, when = 0, attack = 0.003) {
    const t = ac.currentTime + when;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function startCrowd() {
    const len = ac.sampleRate * 4;
    const b = ac.createBuffer(1, len, ac.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.0;
    }
    const src = ac.createBufferSource();
    src.buffer = b;
    src.loop = true;
    crowdFilter = ac.createBiquadFilter();
    crowdFilter.type = 'lowpass';
    crowdFilter.frequency.value = 620;
    crowdGain = ac.createGain();
    crowdGain.gain.value = 0.11;
    src.connect(crowdFilter); crowdFilter.connect(crowdGain); crowdGain.connect(master);
    src.start();
  }

  function crowd(kind) {
    if (!ac || !crowdGain || muted || adPlaying) return;
    const t = ac.currentTime;
    const g = crowdGain.gain, f = crowdFilter.frequency;
    g.cancelScheduledValues(t); f.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t); f.setValueAtTime(f.value, t);
    const peak = { ooh: 0.40, roar: 0.58, groan: 0.28, cheer: 0.48 }[kind] || 0.28;
    const freq = { ooh: 1250, roar: 2350, groan: 360, cheer: 1850 }[kind] || 800;
    g.linearRampToValueAtTime(peak, t + 0.14);
    f.linearRampToValueAtTime(freq, t + 0.14);
    g.linearRampToValueAtTime(0.11, t + 2.0);
    f.linearRampToValueAtTime(620, t + 2.0);
    mark('crowd_' + kind);
  }

  const sfx = {
    kick() {
      tone('sine', 165, 44, 0.14, 0.88);
      noise(0.038, 'bandpass', 2450, 1.3, 0.52);
      mark('kick');
    },
    rocketKick() {
      tone('sawtooth', 190, 38, 0.2, 0.55);
      tone('sine', 150, 42, 0.18, 0.9);
      noise(0.08, 'bandpass', 1800, 1.0, 0.65, 0, 0.002, 600);
      mark('rocketKick');
    },
    dive() {
      noise(0.16, 'bandpass', 720, 0.9, 0.34, 0, 0.01, 260);
      tone('sine', 140, 75, 0.12, 0.22);
      mark('dive');
    },
    catch() {
      noise(0.085, 'lowpass', 1150, 0.75, 0.92);
      tone('sine', 102, 54, 0.13, 0.75);
      noise(0.03, 'bandpass', 3300, 2.8, 0.36);
      tone('triangle', 520, 780, 0.11, 0.18, 0.04);
      mark('catch');
    },
    tip() {
      noise(0.055, 'bandpass', 2050, 1.7, 0.72);
      tone('triangle', 380, 220, 0.07, 0.3);
      mark('tip');
    },
    block() {
      tone('sine', 125, 48, 0.18, 0.85);
      noise(0.13, 'lowpass', 540, 0.8, 0.58);
      mark('block');
    },
    parry() {
      tone('sine', 150, 58, 0.11, 0.72);
      noise(0.06, 'bandpass', 1680, 1.5, 0.5);
      mark('parry');
    },
    rattle() {
      [1, 2.5, 4.1].forEach((m, i) => tone('sine', 520 * m, 520 * m * 0.96, 0.16 / (i + 1), 0.07 / (i + 1)));
      noise(0.05, 'highpass', 2600, 0.7, 0.22);
      mark('rattle');
    },
    fail() {
      tone('sawtooth', 240, 78, 0.2, 0.32);
      tone('square', 160, 64, 0.16, 0.1, 0.015);
      noise(0.1, 'lowpass', 380, 0.7, 0.36);
      mark('fail');
    },
    post() {
      [1, 2.76, 5.4, 8.93].forEach((m, i) =>
        tone('sine', 540 * m, 540 * m * 0.994, 1.25 / (i + 1), 0.27 / (i + 1))
      );
      noise(0.022, 'highpass', 3800, 0.7, 0.55);
      mark('post');
    },
    net() {
      noise(0.52, 'bandpass', 3100, 1.1, 0.46, 0, 0.018, 680);
      tone('sine', 82, 48, 0.22, 0.32);
      mark('net');
    },
    bounce() {
      tone('sine', 138, 68, 0.08, 0.34);
      mark('bounce');
    },
    whistle() {
      const t = ac.currentTime;
      [2880, 3045].forEach(fq => {
        const o = ac.createOscillator(); o.frequency.value = fq;
        const lfo = ac.createOscillator(); lfo.frequency.value = 34;
        const lg = ac.createGain(); lg.gain.value = 65;
        lfo.connect(lg); lg.connect(o.frequency);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
        g.gain.setValueAtTime(0.11, t + 0.26);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        o.connect(g); g.connect(master);
        o.start(t); lfo.start(t);
        o.stop(t + 0.4); lfo.stop(t + 0.4);
      });
      mark('whistle');
    },
    ui() { tone('sine', 640, 860, 0.065, 0.16); mark('ui'); },
    coin() {
      tone('triangle', 1046, 1046, 0.07, 0.18);
      tone('triangle', 1568, 1568, 0.12, 0.2, 0.065);
      mark('coin');
    },
    focus() {
      tone('sine', 240, 110, 0.55, 0.32);
      noise(0.55, 'lowpass', 420, 1.0, 0.22, 0, 0.08, 140);
      mark('focus');
    },
    boss() {
      tone('sawtooth', 110, 108, 0.48, 0.14);
      tone('sawtooth', 165, 164, 0.48, 0.1, 0.05);
      tone('sine', 55, 52, 0.55, 0.35);
      mark('boss');
    },
  };

  function play(name) {
    if (!ac || muted || adPlaying || document.hidden) return;
    try { if (sfx[name]) sfx[name](); } catch (e) { /* ignore */ }
  }

  function setMuted(m) {
    muted = !!m;
    syncGain();
  }

  function setAdPlaying(flag) {
    adPlaying = !!flag;
    syncGain();
    if (adPlaying && ac && ac.state === 'running') ac.suspend();
    else if (!adPlaying && !document.hidden && ac && ac.state === 'suspended') ac.resume();
  }

  function suspend() {
    if (!ac) return;
    if (master) {
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.value = 0;
      master.gain.setValueAtTime(0, ac.currentTime);
    }
    if (ac.state === 'running') ac.suspend();
  }

  function resume() {
    if (!ac || document.hidden || adPlaying) return;
    syncGain();
    if (ac.state === 'suspended') ac.resume();
  }

  function telemetry() {
    return {
      ctxState: ac ? ac.state : 'none',
      masterGain: master ? master.gain.value : 0,
      muted,
      adPlaying,
      ...tele
    };
  }

  return { init, play, crowd, setMuted, setAdPlaying, suspend, resume, telemetry };
})();
