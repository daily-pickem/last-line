// LAST LINE — procedural WebAudio SFX (no audio files, fully offline)
'use strict';
window.AudioFX = (() => {
  let ac = null, master = null, comp = null, noiseBuf = null;
  let crowdGain = null, crowdFilter = null;
  let muted = false;
  const tele = { played: {}, compressor: false };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(ac.destination);
    tele.compressor = true;
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startCrowd();
  }

  function mark(name) { tele.played[name] = (tele.played[name] || 0) + 1; }

  function noise(dur, type, freq, q, gain, when = 0, attack = 0.002, freqEnd) {
    const t = ac.currentTime + when;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  function tone(type, f0, f1, dur, gain, when = 0, attack = 0.003) {
    const t = ac.currentTime + when;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function startCrowd() {
    // brown-noise stadium bed
    const len = ac.sampleRate * 4;
    const b = ac.createBuffer(1, len, ac.sampleRate);
    const d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const src = ac.createBufferSource(); src.buffer = b; src.loop = true;
    crowdFilter = ac.createBiquadFilter(); crowdFilter.type = 'lowpass'; crowdFilter.frequency.value = 650;
    crowdGain = ac.createGain(); crowdGain.gain.value = 0.12;
    src.connect(crowdFilter); crowdFilter.connect(crowdGain); crowdGain.connect(master);
    src.start();
  }

  function crowd(kind) {
    if (!ac || !crowdGain) return;
    const t = ac.currentTime;
    const g = crowdGain.gain, f = crowdFilter.frequency;
    g.cancelScheduledValues(t); f.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t); f.setValueAtTime(f.value, t);
    const peak = { ooh: 0.42, roar: 0.6, groan: 0.3, cheer: 0.5 }[kind] || 0.3;
    const freq = { ooh: 1200, roar: 2400, groan: 380, cheer: 1800 }[kind] || 800;
    g.linearRampToValueAtTime(peak, t + 0.15);
    f.linearRampToValueAtTime(freq, t + 0.15);
    g.linearRampToValueAtTime(0.12, t + 2.2);
    f.linearRampToValueAtTime(650, t + 2.2);
    mark('crowd_' + kind);
  }

  const sfx = {
    kick() { // leather pop + low thump
      tone('sine', 160, 45, 0.14, 0.9); noise(0.035, 'bandpass', 2600, 1.2, 0.5); mark('kick');
    },
    catch() { // latex palm slap + chest thud + grip squeak
      noise(0.09, 'lowpass', 1100, 0.7, 0.9); tone('sine', 95, 55, 0.12, 0.7);
      noise(0.03, 'bandpass', 3400, 3, 0.35); tone('triangle', 1900, 2400, 0.05, 0.05, 0.05); mark('catch');
    },
    tip() { // fingertip flick
      noise(0.05, 'bandpass', 1900, 1.6, 0.7); tone('triangle', 340, 210, 0.06, 0.25); mark('tip');
    },
    block() { // body block thud
      tone('sine', 120, 50, 0.18, 0.85); noise(0.14, 'lowpass', 520, 0.8, 0.6); mark('block');
    },
    post() { // inharmonic aluminium clang
      [1, 2.76, 5.4, 8.93].forEach((m, i) => tone('sine', 520 * m, 520 * m * 0.995, 1.3 / (i + 1), 0.28 / (i + 1)));
      noise(0.02, 'highpass', 4000, 0.7, 0.6); mark('post');
    },
    net() { // net swish
      noise(0.55, 'bandpass', 3200, 1.1, 0.45, 0, 0.02, 700); tone('sine', 80, 50, 0.2, 0.3); mark('net');
    },
    bounce() { tone('sine', 140, 70, 0.08, 0.35); mark('bounce'); },
    whistle() {
      const t = ac.currentTime;
      [2900, 3060].forEach(fq => {
        const o = ac.createOscillator(); o.frequency.value = fq;
        const lfo = ac.createOscillator(); lfo.frequency.value = 32;
        const lg = ac.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(o.frequency);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
      });
      mark('whistle');
    },
    ui() { tone('sine', 660, 880, 0.07, 0.18); mark('ui'); },
    coin() { tone('square', 1320, 1320, 0.06, 0.06); tone('square', 1760, 1760, 0.09, 0.06, 0.06); mark('coin'); },
    focus() { tone('sine', 220, 110, 0.6, 0.3); noise(0.6, 'lowpass', 400, 1, 0.2, 0, 0.1, 150); mark('focus'); },
    boss() { tone('sawtooth', 110, 110, 0.5, 0.12); tone('sawtooth', 165, 165, 0.5, 0.08, 0.05); mark('boss'); },
  };

  function play(name) { if (!ac || muted) return; try { sfx[name](); } catch (e) { /* ignore */ } }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.02);
  }
  function suspend() { if (ac && ac.state === 'running') ac.suspend(); }
  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }
  function telemetry() { return { ctxState: ac ? ac.state : 'none', muted, ...tele }; }

  return { init, play, crowd, setMuted, suspend, resume, telemetry };
})();
