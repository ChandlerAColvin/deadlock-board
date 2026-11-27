// Deadlock Board audio: alert sounds, spoken alerts, custom sound files and a background-safe clock tick.
(function () {
  'use strict';
  const A = {};
  let ctx = null;
  let master = null;
  let keepAlive = null;
  const custom = {}; // kind -> AudioBuffer (from IndexedDB)
  const folder = {}; // kind -> HTMLAudioElement (from sounds/<kind>.mp3|wav|ogg)
  A.volume = 0.8;
  A.voice = { on: false, name: '', rate: 1, volume: 0.85 };

  A.kinds = [
    ['attention', 'Look-at-the-board cue (used for every alert in one-sound mode)'],
    ['camp_small', 'Small camps'], ['camp_medium', 'Medium camps'], ['camp_large', 'Hard camps'],
    ['sinners', "Sinner's Sacrifice"], ['snack', 'Healing bats'], ['crate', 'Crates'], ['heavy_crate', 'Heavy crates'], ['buff_box', 'Buff containers'],
    ['powerup', 'Bridge buffs'], ['urn_spawn', 'Soul Urn'], ['midboss', 'Mid-Boss'], ['rift', 'Unstable Rift'],
    ['events', 'Match events'], ['waves', 'Trooper waves'], ['ping', 'Map pings'],
  ];

  A.unlock = function () {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = A.volume;
      master.connect(ctx.destination);
      loadCustom();
    }
    if (ctx.state === 'suspended') ctx.resume();
  };

  A.setVolume = function (v) {
    A.volume = v;
    if (master) master.gain.value = v;
  };

  // A quiet, steady tone keeps Chrome from throttling the page while you play the game in front of it.
  A.keepAwake = function (on) {
    if (!ctx) return;
    if (on && !keepAlive) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0006;
      o.frequency.value = 30;
      o.connect(g).connect(ctx.destination);
      o.start();
      keepAlive = { o, g };
    } else if (!on && keepAlive) {
      keepAlive.o.stop();
      keepAlive = null;
    }
  };

  // ---- synthesized sounds ----
  function env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(type, freq, t0, a, d, peak, dest, glideTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + a + d);
    env(g, t0, a, d, peak);
    o.connect(g).connect(dest || master);
    o.start(t0);
    o.stop(t0 + a + d + 0.05);
    return o;
  }
  function noise(t0, dur, peak, filterFreq, q) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    f.Q.value = q || 1;
    const g = ctx.createGain();
    env(g, t0, 0.005, dur, peak);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  const synth = {
    // A soft two-note chime: "check the board".
    attention(t) {
      tone('sine', 659.25, t, 0.03, 0.55, 0.32);
      tone('sine', 987.77, t + 0.16, 0.03, 0.75, 0.26);
      tone('sine', 1318.5, t + 0.16, 0.03, 0.6, 0.05);
    },
    heavy_crate(t) { noise(t, 0.16, 0.7, 380, 2.5); tone('sine', 1568, t + 0.12, 0.005, 0.25, 0.18); },
    camp_small(t) { tone('triangle', 660, t, 0.01, 0.18, 0.35); tone('triangle', 880, t + 0.12, 0.01, 0.25, 0.35); },
    camp_medium(t) { tone('triangle', 523, t, 0.01, 0.18, 0.4); tone('triangle', 659, t + 0.12, 0.01, 0.18, 0.4); tone('triangle', 784, t + 0.24, 0.01, 0.3, 0.4); },
    camp_large(t) { tone('sawtooth', 196, t, 0.02, 0.35, 0.22); tone('triangle', 392, t + 0.05, 0.02, 0.5, 0.35); tone('triangle', 294, t + 0.3, 0.02, 0.5, 0.35); },
    sinners(t) { for (let i = 0; i < 3; i++) { tone('square', 1568, t + i * 0.09, 0.005, 0.12, 0.12); tone('sine', 2093, t + i * 0.09, 0.005, 0.2, 0.15); } },
    snack(t) { tone('sine', 300, t, 0.005, 0.18, 0.45, null, 900); },
    crate(t) { noise(t, 0.12, 0.6, 700, 3); noise(t + 0.14, 0.1, 0.5, 500, 3); },
    buff_box(t) { noise(t, 0.1, 0.5, 900, 4); tone('sine', 1046, t + 0.08, 0.01, 0.3, 0.25); },
    powerup(t) { [784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, t + i * 0.07, 0.005, 0.35, 0.28)); },
    urn_spawn(t) { [1, 2.76, 5.4].forEach((h, i) => tone('sine', 220 * h, t, 0.005, 2.2 - i * 0.5, 0.35 / (i + 1))); tone('sine', 330, t + 0.6, 0.005, 1.6, 0.25); },
    midboss(t) {
      const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(55, t + 1.2);
      f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(1200, t + 0.4); f.frequency.linearRampToValueAtTime(150, t + 1.3);
      env(g, t, 0.15, 1.2, 0.7); o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 1.5);
      noise(t, 1.2, 0.25, 300, 0.7);
    },
    rift(t) {
      const o = ctx.createOscillator(); const lfo = ctx.createOscillator(); const lg = ctx.createGain(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 440; lfo.frequency.value = 9; lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency); env(g, t, 0.05, 1.2, 0.35); o.connect(g).connect(master);
      o.start(t); lfo.start(t); o.stop(t + 1.4); lfo.stop(t + 1.4);
    },
    events(t) { tone('sine', 880, t, 0.01, 0.3, 0.3); tone('sine', 1320, t + 0.15, 0.01, 0.4, 0.25); },
    waves(t) { tone('square', 1200, t, 0.002, 0.04, 0.08); },
    ping(t) { tone('sine', 1760, t, 0.003, 0.15, 0.35); tone('sine', 1760, t + 0.18, 0.003, 0.15, 0.3); },
  };

  A.play = function (kind) {
    if (!ctx) return;
    if (folder[kind]) {
      const el = folder[kind].cloneNode();
      el.volume = Math.min(1, A.volume);
      el.play().catch(() => {});
      return;
    }
    if (custom[kind]) {
      const src = ctx.createBufferSource();
      src.buffer = custom[kind];
      src.connect(master);
      src.start();
      return;
    }
    (synth[kind] || synth.events)(ctx.currentTime + 0.02);
  };

  // Speak one short line. Anything still waiting to be said is dropped, so lines never pile up.
  A.say = function (text, force) {
    if ((!A.voice.on && !force) || !('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = A.voice.rate;
    u.volume = A.voice.volume;
    u.pitch = 1;
    const v = A.pickVoice();
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  };

  A.voices = function () {
    return 'speechSynthesis' in window ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : [];
  };
  // The chosen voice, or the most natural-sounding English voice installed (Windows' "Natural" voices first).
  A.pickVoice = function () {
    const list = A.voices();
    if (A.voice.name) { const v = list.find(x => x.name === A.voice.name); if (v) return v; }
    const prefs = [/natural/i, /online/i, /aria|jenny|guy|sonia|libby/i, /google us english/i, /zira/i];
    for (const re of prefs) { const v = list.find(x => re.test(x.name) && /en-(US|GB)/i.test(x.lang)); if (v) return v; }
    return list[0] || null;
  };

  // ---- sounds folder: sounds/<kind>.mp3 (or .wav / .ogg) replaces the built-in sound ----
  A.probeFolder = function (onChange) {
    for (const [kind] of A.kinds) {
      for (const ext of ['mp3', 'wav', 'ogg']) {
        const el = new Audio();
        el.preload = 'auto';
        el.addEventListener('canplaythrough', () => { if (!folder[kind]) { folder[kind] = el; onChange && onChange(); } }, { once: true });
        el.addEventListener('error', () => {}, { once: true });
        el.src = 'sounds/' + kind + '.' + ext;
      }
    }
  };
  A.source = function (kind) {
    return folder[kind] ? 'file in sounds folder' : custom[kind] ? 'your file' : 'built-in';
  };

  // ---- custom sounds picked in Settings, kept in IndexedDB ----
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('deadlock-board', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('sounds');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function loadCustom() {
    try {
      const d = await db();
      const tx = d.transaction('sounds', 'readonly');
      const store = tx.objectStore('sounds');
      const keys = await new Promise(r => { const q = store.getAllKeys(); q.onsuccess = () => r(q.result); });
      for (const k of keys) {
        const data = await new Promise(r => { const q = store.get(k); q.onsuccess = () => r(q.result); });
        try { custom[k] = await ctx.decodeAudioData(data.slice(0)); } catch (e) { /* unreadable file */ }
      }
    } catch (e) { /* storage unavailable */ }
  }
  A.setCustom = async function (kind, file) {
    A.unlock();
    const data = await file.arrayBuffer();
    custom[kind] = await ctx.decodeAudioData(data.slice(0));
    try {
      const d = await db();
      d.transaction('sounds', 'readwrite').objectStore('sounds').put(data, kind);
    } catch (e) { /* kept for this session only */ }
  };
  A.clearCustom = async function (kind) {
    delete custom[kind];
    try { const d = await db(); d.transaction('sounds', 'readwrite').objectStore('sounds').delete(kind); } catch (e) {}
  };

  // ---- a clock tick that keeps running when the window is in the background ----
  // Runs fn every `ms`. A worker keeps ticking when the window is in the background; a plain timer
  // runs too in case the worker is blocked (some browsers refuse workers on pages opened from disk).
  // Running both is harmless: each tick reads the clock, and alerts never fire twice.
  A.startTicker = function (fn, ms) {
    const code = 'let id=null;onmessage=e=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';
    let w = null;
    try {
      w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      w.onmessage = () => { if (!document.body.dataset.ticker) document.body.dataset.ticker = 'worker'; fn(); };
      w.onerror = () => {};
      w.postMessage(ms);
    } catch (e) { w = null; }
    const id = setInterval(() => fn(), ms);
    return () => { clearInterval(id); if (w) w.postMessage(0); };
  };

  window.DLB_AUDIO = A;
})();
