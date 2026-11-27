// Deadlock Board app: clock, alerts, panels, god mode, saving and export.
(function () {
  'use strict';
  const E = window.DLB_ENGINE;
  const A = window.DLB_AUDIO;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dlb.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dlb.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
  };

  const KIND_LABEL = {
    guardian: 'Guardian', walker: 'Walker', base_guardian: 'Base Guardian', shrine: 'Shrine', patron: 'Patron', midboss: 'Mid-Boss',
    camp_small: 'Small camp', camp_medium: 'Medium camp', camp_large: 'Hard camp', sinners: "Sinner's Sacrifice", urn_spawn: 'Soul Urn spawn',
    urn_dropoff: 'Soul Urn drop-off', powerup: 'Bridge buff', rift: 'Unstable Rift', snack: 'Healing bat', crate: 'Crate',
    heavy_crate: 'Heavy crate', buff_box: 'Buff container', vent: 'Steam vent', shop: 'Shop', teleporter: 'Teleporter', rope: 'Rope', bell: 'Bell', spawn: 'Spawn',
  };
  const ALL_KINDS = Object.keys(KIND_LABEL);
  const CLEAR_WORD = { snack: 'Picked up', crate: 'Broken', heavy_crate: 'Broken', buff_box: 'Broken', sinners: 'Cleared' };

  // ---------- settings and saved edits ----------
  const S = {
    settings: Object.assign({
      lead: DLB_GAME.alerts.leadSeconds, volume: 0.8, alertStyle: DLB_GAME.alerts.style || 'sound', oneSound: true, autoFloat: true, iconSet: 'minimap', voiceName: '', voiceRate: 1,
      alerts: clone(DLB_GAME.alerts.defaults), keepAwake: true, troops: true, flip: false,
      show: {}, showStatic: { labels: true, lanes: true, zips: true, tele: true, under: true },
    }, store.get('settings', {})),
    overrides: Object.assign({ rules: {}, markers: {}, added: [], removed: [], bg: null }, store.get('overrides', {})),
    mode: 'real', god: false, draw: false, drawColor: '#ffffff', selected: null, selHero: -1,
    clock: { running: false, speed: 1, t0: 0, real0: 0 },
    heroes: [], fronts: {}, laneStates: {}, laneTroops: {}, drawings: [], lastT: 0,
  };
  S.settings.alerts = Object.assign(clone(DLB_GAME.alerts.defaults), S.settings.alerts || {});
  // Settings saved before alert styles existed: the voice was found annoying, so start them on sound only.
  if (!S.settings.alertStyleSet) { S.settings.alertStyle = DLB_GAME.alerts.style || 'sound'; S.settings.oneSound = true; S.settings.voiceRate = 1; S.settings.alertStyleSet = true; }
  delete S.settings.voiceOn;

  function deepMerge(a, b) {
    for (const k of Object.keys(b || {})) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], b[k]);
      else a[k] = clone(b[k]);
    }
    return a;
  }
  function buildGame() { S.game = deepMerge(clone(DLB_GAME), S.overrides.rules); }
  function buildMarkers() {
    const list = E.mergeMarkers(DLB_MAP.points, window.DLB_EXTRA, S.overrides);
    S.markers = list;
    S.byId = new Map(list.map(m => [m.id, m]));
  }
  function saveSettings() { store.set('settings', S.settings); }
  function saveOverrides() { store.set('overrides', S.overrides); }

  // ---------- match and clock ----------
  function newMatch(keepMode) {
    S.match = new E.Match(S.game, S.markers, { riftMode: S.mode === 'sim' ? 'sim' : 'window' });
    S.clock = { running: false, speed: S.clock.speed || 1, t0: 0, real0: 0 };
    S.lastT = 0;
    resetHeroes();
    for (const l of DLB_MAP.lanes) { S.fronts[l.key] = 0.5; S.laneStates[l.key] = { mode: 'even', team: 'amber' }; }
    resetLaneTroops();
    S.drawings = [];
    if (!keepMode) setMode(S.mode);
  }
  const now = () => performance.now();
  function clockT() {
    const c = S.clock;
    return c.running ? c.t0 + (now() - c.real0) / 1000 * c.speed : c.t0;
  }
  function start() {
    A.unlock();
    // A click on Start counts as permission to open the floating window; a hotkey doesn't, and then this quietly does nothing.
    if (S.settings.autoFloat && !PIP.win) openPip(true);
    if (S.settings.keepAwake) A.keepAwake(true);
    S.clock.t0 = clockT();
    S.clock.real0 = now();
    S.clock.running = true;
    renderClockButtons();
  }
  function pause() {
    S.clock.t0 = clockT();
    S.clock.running = false;
    A.keepAwake(false);
    renderClockButtons();
  }
  function seek(t) {
    t = Math.max(0, t);
    S.clock.t0 = t;
    S.clock.real0 = now();
    S.match.seek(t);
    S.lastT = t;
    tick(true);
  }
  function setSpeed(v) {
    S.clock.t0 = clockT();
    S.clock.real0 = now();
    S.clock.speed = v;
  }

  // ---------- lanes: wave front positions ----------
  let guardianS = {};
  function computeGuardians() {
    guardianS = {};
    for (const l of DLB_MAP.lanes) {
      const g = {};
      for (const team of ['amber', 'sapphire']) {
        const m = S.markers.find(x => x.kind === 'guardian' && x.lane === l.key && x.team === team);
        g[team] = m ? view.projectToLane(l.key, m.u, m.v).s : (team === 'amber' ? 0.3 : 0.7);
      }
      guardianS[l.key] = g;
    }
  }
  // Troopers held at each lane's front: null = not set (the map shows no count).
  function resetLaneTroops() { for (const l of DLB_MAP.lanes) S.laneTroops[l.key] = { amber: null, sapphire: null }; }
  const LANE_MODES = [
    ['even', 'Even: waves meet in the middle'],
    ['defend', 'Defensive'],
    ['push', 'Fast push'],
    ['freeze', 'Freeze'],
    ['manual', 'Manual: I drag the front'],
  ];
  const LANE_HINT = {
    even: 'Neither side has the wave. It meets near the middle of the lane.',
    defend: 'Kill the wave out of harm\'s way, chip safely, take every box and camp. Fight only once ahead on souls.',
    push: 'Kill their wave fast, keep your troopers alive, and hit the Guardian with abilities and headshots.',
    freeze: 'One trooper up, enemy kept outside the soul range of their wave. Your wave snowballs toward their Guardian.',
    manual: 'Drag the crossed swords on the map to set where the waves meet.',
  };
  function laneTarget(key) {
    const st = S.laneStates[key];
    const g = guardianS[key] || { amber: 0.3, sapphire: 0.7 };
    const enemyG = st.team === 'amber' ? g.sapphire : g.amber;
    const dir = st.team === 'amber' ? 1 : -1;
    switch (st.mode) {
      case 'even': return { s: 0.5, rate: 0.004 };
      case 'defend': return { s: 0.5 - dir * 0.06, rate: 0.004 };
      case 'push': return { s: enemyG - dir * 0.015, rate: 0.006 };
      case 'freeze': return { s: enemyG - dir * 0.015, rate: 0.0018 };
      default: return null;
    }
  }
  function moveFronts(dt) {
    if (dt <= 0 || dt > 30) return;
    for (const key of Object.keys(S.fronts)) {
      const tg = laneTarget(key);
      if (!tg) continue;
      const cur = S.fronts[key];
      const step = tg.rate * dt;
      S.fronts[key] = Math.abs(tg.s - cur) <= step ? tg.s : cur + Math.sign(tg.s - cur) * step;
    }
  }

  // ---------- heroes ----------
  const DEFAULT_HEROES = {
    amber: ['Abrams', 'Haze', 'Infernus', 'Lady Geist', 'McGinnis', 'Seven'],
    sapphire: ['Bebop', 'Dynamo', 'Kelvin', 'Lash', 'Paradox', 'Wraith'],
  };
  function resetHeroes(keepNames) {
    const lanesOrder = ['york', 'york', 'broadway', 'broadway', 'greenwich', 'greenwich'];
    const old = S.heroes;
    S.heroes = [];
    for (const team of ['amber', 'sapphire']) {
      for (let i = 0; i < 6; i++) {
        const lane = lanesOrder[i];
        const g = guardianS[lane] ? guardianS[lane][team] : 0.3;
        const s = team === 'amber' ? g + 0.03 : g - 0.03;
        const [u, v] = view ? view.lanePoint(lane, s) : [0.5, 0.5];
        const side = i % 2 ? 0.028 : -0.028;
        const prev = keepNames && old.find(h => h.team === team && h.slot === i);
        S.heroes.push({ slot: i, team, lane, name: prev ? prev.name : DEFAULT_HEROES[team][i], u: u + side, v: v + (i % 2 ? 0.012 : -0.012), deadUntil: null });
      }
    }
  }

  // ---------- alerts ----------
  function enabledMap() { return S.settings.alerts; }
  function fireAlerts() {
    const items = S.match.dueAlerts(S.settings.lead, enabledMap());
    if (!items.length) return;
    const byTime = new Map();
    for (const it of items) { const k = Math.round(it.at); if (!byTime.has(k)) byTime.set(k, []); byTime.get(k).push(it); }
    // One sound (and at most one spoken line) per tick, however many things are due.
    const style = S.settings.alertStyle;
    const firstKind = items[0].kind === 'events' ? 'events' : items[0].kind;
    if (style !== 'off') A.play(S.settings.oneSound ? 'attention' : firstKind);
    const soonest = Math.min(...items.map(i => i.at));
    const secs = Math.max(1, Math.round(soonest - S.match.t));
    if (style === 'short') setTimeout(() => A.say(joinAnd([...new Set(items.map(i => i.short || i.label))])), 450);
    if (style === 'full') setTimeout(() => A.say(joinAnd([...new Set(items.map(i => i.voice))]) + ' in ' + secs), 450);
    for (const [at, list] of byTime) {
      toast(joinAnd([...new Set(list.map(i => i.label))]), 'in ' + Math.max(1, Math.round(at - S.match.t)) + ' s, at ' + E.fmt(at));
    }
    const nu = $('#nextUp');
    nu.classList.remove('flash');
    void nu.offsetWidth;
    nu.classList.add('flash');
    flashPip();
  }
  function joinAnd(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function toast(title, sub) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    $('#toasts').prepend(d);
    setTimeout(() => d.remove(), 7000);
  }

  // ---------- main tick ----------
  let lastList = 0;
  function tick(force) {
    const t = clockT();
    const dt = t - S.lastT;
    if (S.clock.running) moveFronts(dt);
    if (t < S.match.t) S.match.seek(t); else S.match.t = t;
    S.lastT = t;
    if (S.clock.running || force) fireAlerts();
    $('#clock').textContent = E.fmt(t);
    $('#clock').classList.toggle('running', S.clock.running);
    const scrub = $('#scrub');
    if (t > Number(scrub.max)) scrub.max = Math.ceil(t / 600) * 600;
    if (document.activeElement !== scrub) scrub.value = Math.floor(t);
    view.updateMarkers(t, S.settings.lead, S.settings.show);
    checkRespawns();
    renderNextUp();
    if (force || now() - lastList > 450) { lastList = now(); renderUpcoming(); renderStatus(); renderLanes(false); if (EDIT.key) updateLaneEditor(); }
    if (force) { view.drawFronts(S.fronts, S.laneStates); view.drawTroops(t, S.fronts, S.settings.troops && S.settings.show.troops !== false); }
    if (!S.clock.running && force) A.keepAwake(false);
    autosave();
  }
  let lastAnim = 0;
  function anim(ts) {
    if (ts - lastAnim > 66) {
      lastAnim = ts;
      const t = clockT();
      view.drawTroops(t, S.fronts, S.settings.troops && S.settings.show.troops !== false);
      if (S.clock.running) view.drawFronts(S.fronts, S.laneStates);
    }
    requestAnimationFrame(anim);
  }

  // ---------- panels ----------
  function iconSvg(kind, cls) {
    const k = { events: 'midboss', waves: 'camp_small' }[kind] || kind;
    return `<svg class="${cls || 'ico'}" viewBox="-16 -16 32 32"><use href="#s-${k}" x="-16" y="-16" width="32" height="32"/></svg>`;
  }

  // ---------- Next Up card: the next objective, like the "next piece" box in Tetris ----------
  function nextItems() {
    const list = S.match.upcoming(S.match.t, 7200).filter(i => i.kind !== 'waves' && i.kind !== 'events');
    const on = list.filter(i => S.match.alertOn(i, enabledMap()));
    return (on.length ? on : list).slice(0, 3);
  }
  function riftWindow(item) {
    const r = S.game.spawns.rift;
    if (item.window) return [item.at, item.windowEnd];
    const n = Math.max(0, Math.round((item.at - r.first) / r.every));
    return [r.first + n * r.every - r.jitter, r.first + n * r.every + r.jitter];
  }
  function itemWhere(i) {
    if (i.kind === 'urn_spawn') return S.game.lanes[i.side].name + ' side, one of two spots';
    if (i.kind === 'rift') return 'York or Greenwich side bridge';
    if (i.kind === 'powerup') return 'Both bridges';
    if (i.kind === 'midboss') return 'Pit under Broadway';
    if (i.ids && i.ids.length === 1) {
      const m = S.byId.get(i.ids[0]);
      return m ? [m.label, m.place || m.area].filter(Boolean).join(' · ') : '';
    }
    return i.count > 1 ? i.count + ' on the map' : '';
  }
  function itemTime(i, t) {
    if (i.kind === 'rift') {
      const [a, b] = riftWindow(i);
      return { big: 'Random', sub: (S.match.riftMode === 'sim' ? 'window about ' : 'window ') + E.fmt(a) + '–' + E.fmt(b) };
    }
    return { big: E.fmt(i.at - t), sub: 'at ' + E.fmt(i.at) };
  }
  function buildNextUp(note) {
    const t = S.match.t;
    const items = nextItems();
    if (!items.length) return null;
    const [a, ...rest] = items;
    const tm = itemTime(a, t);
    const then = rest.map(r => {
      const rt = itemTime(r, t);
      return `<button data-key="${esc(r.key)}">${iconSvg(r.kind)}<span>${esc(r.label)}</span><b>${esc(r.kind === 'rift' ? 'random' : rt.big)}</b></button>`;
    }).join('');
    const html = `<div class="nu-head"><span>Next</span><small>${esc(note)}</small></div>
      <button class="nu-main" data-key="${esc(a.key)}">${iconSvg(a.kind, 'nu-ico')}<span class="nu-name"><b>${esc(a.label)}${a.count > 1 && a.kind !== 'powerup' ? ' ×' + a.count : ''}</b><small>${esc(itemWhere(a))}</small></span>
      <span class="nu-time">${esc(tm.big)}</span><span class="nu-at">${esc(tm.sub)}</span></button>
      ${then ? `<div class="nu-then"><small>Then</small>${then}</div>` : ''}`;
    return { html, key: a.key, soon: a.kind !== 'rift' && a.at - t <= S.settings.lead };
  }
  let nextHtml = '';
  function renderNextUp() {
    const box = $('#nextUp');
    const card = buildNextUp(PIP.win ? 'also floating · click for details' : 'click for details');
    if (!card) { box.hidden = true; renderPip(); return; }
    box.hidden = false;
    box.classList.toggle('soon', card.soon);
    box.dataset.key = card.key;
    if (card.html !== nextHtml) { box.innerHTML = card.html; nextHtml = card.html; }
    renderPip(card);
  }

  // ---------- floating Next Up window: stays on top of other windows (Chrome's Document Picture-in-Picture) ----------
  const PIP = { win: null, html: '', detail: null };
  const pipSupported = () => 'documentPictureInPicture' in window;
  async function openPip(auto) {
    if (PIP.win) return;
    if (!pipSupported()) { if (!auto) toast('The floating window needs Chrome 116 or newer'); return; }
    let w;
    try {
      w = await window.documentPictureInPicture.requestWindow({ width: 300, height: 340 });
    } catch (e) {
      if (!auto) toast('Could not open the floating window', e.message);
      return;
    }
    PIP.win = w;
    PIP.html = '';
    PIP.detail = null;
    const d = w.document;
    d.title = 'Next Up · Deadlock Board';
    for (const st of document.querySelectorAll('style')) d.head.appendChild(st.cloneNode(true));
    for (const l of document.querySelectorAll('link[rel=stylesheet]')) {
      const n = d.createElement('link');
      n.rel = 'stylesheet';
      n.href = l.href;
      d.head.appendChild(n);
    }
    d.body.className = 'pip';
    d.body.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${$('#map defs').outerHTML}</svg>
      <div class="pip-bar"><b id="pClock">0:00</b><button id="pPlay">Start</button><button id="pBack" title="Back 1 s">−1</button><button id="pFwd" title="Forward 1 s">+1</button></div>
      <div id="pNext" class="nextup pip-card"></div><div id="pDetail" class="pip-detail" hidden></div>`;
    d.getElementById('pPlay').onclick = () => { if (S.clock.running) pause(); else start(); tick(true); };
    d.getElementById('pBack').onclick = () => seek(clockT() - 1);
    d.getElementById('pFwd').onclick = () => seek(clockT() + 1);
    d.getElementById('pNext').addEventListener('click', e => {
      const b = e.target.closest('[data-key]');
      if (!b) return;
      PIP.detail = PIP.detail === b.dataset.key ? null : b.dataset.key;
      renderPipDetail();
    });
    d.getElementById('pDetail').addEventListener('click', e => { if (e.target.closest('[data-close]')) { PIP.detail = null; renderPipDetail(); } });
    w.addEventListener('pagehide', () => { PIP.win = null; updatePipButton(); renderNextUp(); });
    updatePipButton();
    renderNextUp();
  }
  function closePip() { if (PIP.win) PIP.win.close(); }
  function renderPip(card) {
    if (!PIP.win) return;
    const d = PIP.win.document;
    const clock = d.getElementById('pClock');
    if (!clock) return;
    clock.textContent = E.fmt(S.match.t);
    clock.classList.toggle('running', S.clock.running);
    d.getElementById('pPlay').textContent = S.clock.running ? 'Pause' : (S.match.t > 0 ? 'Resume' : 'Start');
    const box = d.getElementById('pNext');
    if (!card) { box.innerHTML = '<div class="muted" style="padding:10px">Nothing coming up.</div>'; PIP.html = ''; return; }
    box.classList.toggle('soon', card.soon);
    const html = card.html.replace('also floating · click for details', 'click for details');
    if (html !== PIP.html) { box.innerHTML = html; PIP.html = html; }
    if (PIP.detail) renderPipDetail();
  }
  function renderPipDetail() {
    if (!PIP.win) return;
    const box = PIP.win.document.getElementById('pDetail');
    const item = PIP.detail && S.match.upcoming(S.match.t, 7200).find(i => i.key === PIP.detail);
    if (!item) { box.hidden = true; PIP.detail = null; return; }
    const html = `<b>${esc(item.label)}</b>${describe(item.kind).map(l => `<p>${esc(l)}</p>`).join('')}<button data-close>Close</button>`;
    if (box.innerHTML !== html) box.innerHTML = html;
    box.hidden = false;
  }
  function flashPip() {
    if (!PIP.win) return;
    const box = PIP.win.document.getElementById('pNext');
    if (!box) return;
    box.classList.remove('flash');
    void box.offsetWidth;
    box.classList.add('flash');
  }
  function updatePipButton() {
    const b = $('#btnFloat');
    if (!b) return;
    b.classList.toggle('on', !!PIP.win);
    b.textContent = PIP.win ? 'Floating' : 'Float Next Up';
  }
  function itemIds(i) {
    if (i.ids && i.ids.length) return i.ids;
    if (i.kind === 'urn_spawn') return S.markers.filter(m => m.kind === 'urn_spawn' && m.side === i.side).map(m => m.id);
    return S.markers.filter(m => m.kind === i.kind).map(m => m.id);
  }
  // What each objective is, built from the numbers in data/game-data.js so a patch update changes these too.
  function describe(kind) {
    const G = S.game, sp = G.spawns[kind] || {}, f = E.fmt, h = G.haunts || { soulsByTier: {}, growthPctPerMin: 0 };
    const souls = `Souls per creature: tier I ${h.soulsByTier[1]}, tier II ${h.soulsByTier[2]}, tier III ${h.soulsByTier[3]} (grows ${h.growthPctPerMin}% a minute), split between the allies who damaged it.`;
    const camp = `First spawn ${f(sp.first)}. Back ${f(sp.respawn)} after the whole camp is cleared.`;
    switch (kind) {
      case 'camp_small': return ['Easy jungle camp (tier I creatures).', camp, souls];
      case 'camp_medium': return ['Medium jungle camp, the bulk of jungle farm.', camp, souls];
      case 'camp_large': return ['Hard jungle camp with tier III creatures. Best taken with a few items.', camp, souls];
      case 'sinners': return ["Sinner's Sacrifice: a machine that only takes melee damage and pays out souls.", `Each hit costs you ${sp.hitCost} health.`, `First spawn ${f(sp.first)}. Back ${f(sp.respawn)} after it's broken (in a mixed camp, after the whole camp is cleared).`];
      case 'snack': return [`Healing bat: walk into it to heal ${sp.healPct}% of your max health over ${sp.healSeconds} s. Either team can take it.`, `Pickup range ${sp.pickupM} m. First spawn ${f(sp.first)}, back ${f(sp.respawn)} after it's taken.`];
      case 'crate': return [`Crate: ${Math.round(sp.dropChance * 100)}% chance to drop ${sp.souls} souls + ${sp.soulsPerMin} a minute.`, `Most spawn at ${f(sp.first)} and return ${f(sp.respawn)} after they break. A few places differ; click a crate to see its timer.`];
      case 'heavy_crate': return [`Heavy crate: break it with a heavy melee. Always drops ${sp.souls} souls + ${sp.soulsPerMin} a minute.`, `Most spawn at ${f(sp.first)} and return ${f(sp.respawn)} after they break. A few places differ; click a crate to see its timer.`];
      case 'buff_box': return ['Buff container: drops a permanent stat buff.', `Most spawn at ${f(sp.first)} and return ${f(sp.respawn)} after they break.`];
      case 'powerup': return ['Bridge buff: a glowing stone on each of the two bridges. Heavy melee it to claim.', `Lasts ${sp.buffSeconds} s. Types: Casting, Gun, Movement, Survival.`, `${f(sp.first)}, then every ${f(sp.every)}. One left unclaimed is replaced at the next spawn.`];
      case 'urn_spawn': return [`Soul Urn: drops on one of two spots on its side and takes ${sp.descend} s to land.`, 'Carry it to the drop-off on the other side for souls and 4 permanent buffs. A melee or a stun makes the carrier drop it.', `${f(sp.first)}, then every ${f(sp.every)}: York side first, then alternating.`];
      case 'midboss': return ['Mid-Boss in the pit under Broadway.', `The killing team gets ${G.midboss.souls.toLocaleString()} souls + ${G.midboss.soulsPerMin} a minute, 2 permanent buffs each, and ${G.rejuv.crystals} Rejuvenator crystals (team revives for ${f(G.rejuv.buffSeconds)}).`, 'Respawns 7:00 after the first kill, 6:00 after the second, 5:00 after later ones.'];
      case 'rift': return ["Unstable Rift: hold the point on a side lane's bridge (York or Greenwich) for a large soul reward.", `The time is random: the first opens ${f(sp.first - sp.jitter)}–${f(sp.first + sp.jitter)}, then every ${f(sp.every - sp.jitter)}–${f(sp.every + sp.jitter)}.`, `The game announces it ${sp.announce} s before it opens. ${sp.hint} s before that, a visual hint shows which lane.`, 'The team behind on souls gets bonuses while contesting it.'];
      default: return [];
    }
  }
  function openNextInfo(key, anchor) {
    const item = S.match.upcoming(S.match.t, 7200).find(i => i.key === key);
    if (!item) return;
    const tm = itemTime(item, S.match.t);
    const on = S.match.alertOn(item, enabledMap());
    const r = anchor.getBoundingClientRect();
    const when = item.kind === 'rift' ? 'random, ' + tm.sub : 'in ' + tm.big + ', ' + tm.sub;
    openPop({ clientX: r.left - 320, clientY: r.top - 12 }, `<h4>${esc(item.label)}${item.count > 1 && item.kind !== 'powerup' ? ' ×' + item.count : ''}</h4><div class="sub">${esc([itemWhere(item), when].filter(Boolean).join(' · '))}</div>
      ${describe(item.kind).map(l => `<p class="nu-p">${esc(l)}</p>`).join('')}
      <div class="acts"><button data-a="show" class="primary">Show on map</button><button data-a="mute">${on ? 'Turn this alert off' : 'Turn this alert on'}</button></div>`, pop => {
      pop.querySelector('[data-a=show]').onclick = () => { view.highlight(itemIds(item), true); closePop(); };
      pop.querySelector('[data-a=mute]').onclick = () => {
        const k = item.respawn && item.kind !== 'midboss' ? 'respawns' : item.kind;
        S.settings.alerts[k] = !on;
        saveSettings();
        closePop();
        renderUpcoming();
        renderNextUp();
      };
    });
  }

  function renderUpcoming() {
    const t = S.match.t;
    const items = S.match.upcoming(t, 3600).filter(i => i.kind !== 'waves' || S.settings.alerts.waves).slice(0, 12);
    $('#upcoming').innerHTML = items.map(i => {
      const on = S.match.alertOn(i, enabledMap());
      const left = i.at - t;
      return `<li class="${left <= S.settings.lead ? 'soon' : ''}"><span class="in">${E.fmt(left)}</span>${iconSvg(i.kind)}<span class="what ${on ? '' : 'off'}">${esc(i.label)}${i.count > 1 ? ' ×' + i.count : ''}<small>at ${E.fmt(i.at)}${on ? '' : ' · no alert'}</small></span></li>`;
    }).join('') || '<li class="muted">Nothing scheduled.</li>';
  }
  function renderStatus() {
    const m = S.match, t = m.t, G = S.game;
    const mb = m.midboss;
    const mbText = t >= mb.nextAt ? 'Alive' + (mb.deaths ? ' (killed ' + mb.deaths + '×)' : '') : 'Respawns in ' + E.fmt(mb.nextAt - t);
    const rej = m.rejuv && m.rejuv.until > t ? G.teams[m.rejuv.team].name + ' ×' + m.rejuvLeft(m.rejuv.team) + ' · ' + E.fmt(m.rejuv.until - t) : 'None';
    const mine = myTeam();
    const down = side => S.heroes.filter(h => (side === 'enemy' ? h.team !== mine : h.team === mine) && heroDead(h))
      .sort((a, b) => a.deadUntil - b.deadUntil).map(h => h.name + ' ' + E.fmt(h.deadUntil - t)).join(', ') || 'None';
    const p = G.spawns.powerup;
    const pn = E.periodicNext(p.first, p.every, t);
    const us = m.urnState(t);
    const urn = us.up ? 'On the map (' + G.lanes[us.side].name + ' side)' : 'Next ' + E.fmt(E.periodicNext(G.spawns.urn_spawn.first, G.spawns.urn_spawn.every, t));
    const rs = m.riftState(t);
    let rift;
    if (m.riftMode === 'sim') rift = rs.up ? 'Open (' + G.lanes[rs.side].name + ' side)' : rs.next ? 'Next at ' + E.fmt(rs.next.at) : 'None scheduled';
    else rift = rs.possible ? 'Window open until ' + E.fmt(rs.windowEnd) : 'Window ' + E.fmt(rs.windowStart) + '–' + E.fmt(rs.windowEnd);
    const nw = E.nextWave(G.troopers, t);
    const comp = E.composition(G.troopers, nw);
    const lost = { amber: 0, sapphire: 0 };
    for (const e of m.ents.values()) if (e.hp !== undefined && e.hp <= 0 && e.m.team) lost[e.m.team]++;
    $('#matchStatus').innerHTML = [
      ['Enemies down', down('enemy')], ['Allies down', down('ally')], ['Mid-Boss', mbText], ['Rejuvenator', rej], ['Bridge buffs', 'Next ' + E.fmt(pn)], ['Soul Urn', urn], ['Unstable Rift', rift],
      ['Next wave', E.fmt(nw) + ' · every ' + E.waveInterval(G.troopers, nw) + ' s'], ['Wave', comp.join(', ')],
      ['Objectives lost', G.teams.amber.short + ' ' + lost.amber + ' · ' + G.teams.sapphire.short + ' ' + lost.sapphire],
    ].map(([k, v]) => `<div class="status-line"><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  }
  function renderLanes(full) {
    const box = $('#lanePanel');
    if (full || !box.children.length) {
      box.innerHTML = DLB_MAP.lanes.map(l => {
        const st = S.laneStates[l.key];
        const opts = [];
        for (const [mode, label] of LANE_MODES) {
          if (mode === 'even' || mode === 'manual') opts.push(`<option value="${mode}|amber">${label}</option>`);
          else for (const team of ['amber', 'sapphire']) opts.push(`<option value="${mode}|${team}">${S.game.teams[team].name}: ${label}</option>`);
        }
        return `<div class="lane" data-lane="${l.key}"><div class="lh"><span><i style="background:${S.game.lanes[l.key].color}"></i>${S.game.lanes[l.key].name}</span><small class="pos"></small><button class="small le-open" title="Set exactly where the waves meet and how many troopers each side has">Edit</button></div><select aria-label="${S.game.lanes[l.key].name} lane state">${opts.join('')}</select><div class="hint"></div></div>`;
      }).join('');
      box.querySelectorAll('.le-open').forEach(b => b.addEventListener('click', e => openLaneEditor(b.closest('.lane').dataset.lane, e)));
      box.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => {
        const key = sel.closest('.lane').dataset.lane;
        const [mode, team] = sel.value.split('|');
        S.laneStates[key] = { mode, team };
        renderLanes(false);
        view.drawFronts(S.fronts, S.laneStates);
      }));
    }
    for (const div of box.querySelectorAll('.lane')) {
      const key = div.dataset.lane;
      const st = S.laneStates[key];
      const sel = div.querySelector('select');
      const val = st.mode + '|' + (st.mode === 'even' || st.mode === 'manual' ? 'amber' : st.team);
      if (sel.value !== val) sel.value = val;
      div.querySelector('.hint').textContent = LANE_HINT[st.mode];
      const f = S.fronts[key];
      const meters = view.laneMeters(key);
      const off = Math.round((f - 0.5) * meters);
      const foes = S.heroes.filter(h => h.lane === key && h.team !== myTeam());
      const window = foes.length && foes.every(heroDead) ? Math.min(...foes.map(h => h.deadUntil)) - S.match.t : 0;
      div.classList.toggle('window', window > 0);
      div.querySelector('.pos').textContent = window > 0 ? 'Push window ' + E.fmt(window)
        : off === 0 ? 'middle' : Math.abs(off) + ' m toward ' + (off > 0 ? S.game.teams.sapphire.name : S.game.teams.amber.name);
    }
  }
  // ---------- lane editor: exactly where the waves meet and how many troopers are there ----------
  const EDIT = { key: null };
  // Guardians, Walkers and Base Guardians along a lane, from the Hidden King base to the Archmother base.
  function laneStops(key) {
    const groups = {};
    for (const m of S.markers) {
      if (m.lane !== key || !m.team || !['base_guardian', 'walker', 'guardian'].includes(m.kind)) continue;
      const g = groups[m.team + '|' + m.kind] = groups[m.team + '|' + m.kind] || { team: m.team, kind: m.kind, sum: 0, n: 0 };
      g.sum += view.projectToLane(key, m.u, m.v).s;
      g.n++;
    }
    const stops = Object.values(groups).map(g => ({ s: g.sum / g.n, team: g.team, kind: g.kind, label: g.kind === 'base_guardian' ? 'Base' : KIND_LABEL[g.kind] }));
    stops.push({ s: 0.5, label: 'Middle' });
    return stops.sort((a, b) => a.s - b.s);
  }
  function guardianOf(key, team) { return laneStops(key).find(x => x.team === team && x.kind === 'guardian'); }
  function setFront(key, s, keepState) {
    S.fronts[key] = Math.max(0, Math.min(1, s));
    if (!keepState) S.laneStates[key] = { mode: 'manual', team: 'amber' };
    laneChanged();
  }
  function laneChanged() {
    view.drawFronts(S.fronts, S.laneStates);
    renderLanes(false);
    if (EDIT.key) updateLaneEditor();
    autosave(true);
  }
  function laneStateOptions() {
    const opts = [];
    for (const [mode, label] of LANE_MODES) {
      if (mode === 'even' || mode === 'manual') opts.push(`<option value="${mode}|amber">${esc(label)}</option>`);
      else for (const team of ['amber', 'sapphire']) opts.push(`<option value="${mode}|${team}">${esc(S.game.teams[team].name)}: ${esc(label)}</option>`);
    }
    return opts.join('');
  }
  function openLaneEditor(key, evt, clickedS) {
    const G = S.game, lane = G.lanes[key];
    const stops = laneStops(key);
    const teamBtn = team => `<span class="le-count" data-team="${team}"><i style="background:${G.teams[team].color}"></i><b>${esc(G.teams[team].name)}</b>
        <button data-dec="${team}" aria-label="One fewer ${esc(G.teams[team].name)} trooper">−</button><output></output><button data-inc="${team}" aria-label="One more ${esc(G.teams[team].name)} trooper">+</button></span>`;
    const html = `<h4><i class="le-dot" style="background:${lane.color}"></i>${esc(lane.name)}</h4>
      <div class="sub le-where"></div>
      <label class="le-label">Where the waves meet
        <input type="range" class="le-range" min="0" max="1000" step="1" aria-label="${esc(lane.name)} wave front">
      </label>
      <div class="le-ends"><span style="color:${G.teams.amber.color}">${esc(G.teams.amber.name)} base</span><span style="color:${G.teams.sapphire.color}">${esc(G.teams.sapphire.name)} base</span></div>
      <div class="le-stops">${stops.map(st => `<button data-s="${st.s.toFixed(4)}" title="${esc(st.team ? G.teams[st.team].name + ' ' + KIND_LABEL[st.kind] + (st.kind === 'base_guardian' ? 's' : '') : 'Middle of the lane')}">${st.team ? `<i style="background:${G.teams[st.team].color}"></i>` : ''}${esc(st.label)}</button>`).join('')}</div>
      ${clickedS !== undefined ? `<button class="le-here" data-s="${clickedS.toFixed(4)}">Put the waves where I clicked</button>` : ''}
      <div class="row2 le-fields">
        <label>Metres from the middle<input type="number" class="le-m" step="1" title="Positive = toward the ${esc(G.teams.sapphire.name)} base"></label>
        <label>Lane state<select class="le-state">${laneStateOptions()}</select></label>
      </div>
      <div class="le-dist muted"></div>
      <div class="le-troops"><div class="le-th">Troopers where the waves meet</div>${teamBtn('amber')}${teamBtn('sapphire')}
        <div class="acts"><button data-up="amber">${esc(G.teams.amber.name)} one up (4 v 3)</button><button data-up="sapphire">${esc(G.teams.sapphire.name)} one up (3 v 4)</button><button data-clear>No count</button></div>
      </div>`;
    openPop(evt, html, pop => {
      EDIT.key = key;
      const range = pop.querySelector('.le-range');
      range.addEventListener('input', () => setFront(key, Number(range.value) / 1000));
      pop.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => setFront(key, Number(b.dataset.s))));
      const meters = pop.querySelector('.le-m');
      meters.addEventListener('change', () => {
        const L = view.laneMeters(key);
        const m = Number(meters.value);
        if (isFinite(m)) setFront(key, 0.5 + m / L);
      });
      pop.querySelector('.le-state').addEventListener('change', e => {
        const [mode, team] = e.target.value.split('|');
        S.laneStates[key] = { mode, team };
        laneChanged();
      });
      const tc = () => S.laneTroops[key];
      const clamp = n => Math.max(0, Math.min(12, n));
      // Counts start from a full wave (4 v 4) the first time either side is changed.
      const bump = (team, d) => {
        const c = tc();
        if (c.amber == null) c.amber = 4;
        if (c.sapphire == null) c.sapphire = 4;
        c[team] = clamp(c[team] + d);
        laneChanged();
      };
      pop.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => bump(b.dataset.inc, 1)));
      pop.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => bump(b.dataset.dec, -1)));
      pop.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => { const up = b.dataset.up; S.laneTroops[key] = up === 'amber' ? { amber: 4, sapphire: 3 } : { amber: 3, sapphire: 4 }; laneChanged(); }));
      pop.querySelector('[data-clear]').addEventListener('click', () => { S.laneTroops[key] = { amber: null, sapphire: null }; laneChanged(); });
      updateLaneEditor();
    }, 'wide');
  }
  function updateLaneEditor() {
    const pop = $('#pop');
    const key = EDIT.key;
    if (!key || pop.hidden) { EDIT.key = null; return; }
    const G = S.game, f = S.fronts[key], L = view.laneMeters(key);
    const off = Math.round((f - 0.5) * L);
    pop.querySelector('.le-where').textContent = off === 0 ? 'The waves meet in the middle of the lane.' :
      'The waves meet ' + Math.abs(off) + ' m from the middle, toward the ' + (off > 0 ? G.teams.sapphire.name : G.teams.amber.name) + ' base.';
    const range = pop.querySelector('.le-range');
    if (document.activeElement !== range) range.value = Math.round(f * 1000);
    const meters = pop.querySelector('.le-m');
    if (document.activeElement !== meters) meters.value = off;
    const st = S.laneStates[key];
    pop.querySelector('.le-state').value = st.mode + '|' + (st.mode === 'even' || st.mode === 'manual' ? 'amber' : st.team);
    const ga = guardianOf(key, 'amber'), gs = guardianOf(key, 'sapphire');
    const d = g => g ? Math.round(Math.abs(f - g.s) * L) + ' m' : '?';
    pop.querySelector('.le-dist').textContent = `${d(ga)} from the ${G.teams.amber.name} Guardian · ${d(gs)} from the ${G.teams.sapphire.name} Guardian`;
    for (const team of ['amber', 'sapphire']) {
      const n = S.laneTroops[key][team];
      pop.querySelector(`.le-count[data-team="${team}"] output`).textContent = n == null ? '–' : n;
    }
  }
  function renderLineup() {
    const G = S.game;
    const col = team => `<div class="col"><h5 style="color:${G.teams[team].color}">${G.teams[team].name}</h5>` +
      S.heroes.map((h, i) => h.team !== team ? '' : `<button data-i="${i}" class="${heroDead(h) ? 'dead' : ''}" title="Click to find, double-click to change, right-click for death and respawn"><i style="background:${G.teams[team].color}"></i>${esc(h.name)}${heroDead(h) ? `<b class="rt">${E.fmt(h.deadUntil - S.match.t)}</b>` : ''}</button>`).join('') + '</div>';
    $('#lineup').innerHTML = col('amber') + col('sapphire');
  }
  function renderClockButtons() {
    const b = $('#btnPlay');
    b.textContent = S.clock.running ? 'Pause' : (S.match && S.match.t > 0 ? 'Resume' : 'Start');
    b.classList.toggle('pause', S.clock.running);
  }
  function setMode(mode) {
    S.mode = mode;
    document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    if (S.match) S.match.riftMode = mode === 'sim' ? 'sim' : 'window';
    $('#speed').disabled = mode === 'real';
    if (mode === 'real') { $('#speed').value = '1'; setSpeed(1); }
  }

  // ---------- popover and inspector ----------
  function closePop() { $('#pop').hidden = true; EDIT.key = null; view && view.drawRange(null); }
  function openPop(evt, html, bind, cls) {
    const pop = $('#pop');
    pop.className = 'pop' + (cls ? ' ' + cls : '');
    pop.innerHTML = html;
    pop.hidden = false;
    bind && bind(pop); // before measuring: binding can fill in text that changes the height
    const r = $('#mapwrap').getBoundingClientRect();
    let x = evt.clientX - r.left + 12, y = evt.clientY - r.top + 12;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    if (x + w > r.width - 8) x = Math.max(8, x - w - 24);
    if (y + h > r.height - 8) y = Math.max(8, r.height - h - 8);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }
  function markerInfo(m) {
    const G = S.game, t = S.match.t;
    const st = S.match.status(m.id, t) || {};
    const lines = [];
    const k = m.kind;
    if (E.AFTER_CLEAR.includes(k)) {
      lines.push(st.up ? 'Up now' : (st.cleared ? 'Respawns in ' : 'First spawn in ') + E.fmt(st.nextAt - t) + ' (at ' + E.fmt(st.nextAt) + ')');
      lines.push('First spawn ' + E.fmt(st.first) + ' · respawn ' + E.fmt(st.respawn) + ' after ' + (k === 'snack' ? 'pickup' : 'clear') + (st.ruleName ? ' · ' + st.ruleName : ''));
      const sp = G.spawns[k] || {};
      if (Array.isArray(m.creatures) && m.creatures.length) {
        const h = G.haunts.soulsByTier;
        const souls = m.creatures.reduce((a, [n, , tier]) => a + n * (h[tier] || 0), 0);
        const mins = Math.floor(t / 60);
        lines.push(m.creatures.map(([n, name]) => n + '× ' + name).join(', '));
        lines.push('About ' + Math.round(souls * (1 + G.haunts.growthPctPerMin / 100 * mins)) + ' souls for the whole camp now (' + souls + ' at 0:00)');
      }
      if (k === 'snack') lines.push('Heals ' + sp.healPct + '% of max health over ' + sp.healSeconds + ' s · pickup range ' + sp.pickupM + ' m');
      if (k === 'crate' || k === 'heavy_crate') lines.push(Math.round(sp.dropChance * 100) + '% chance of ' + sp.souls + ' + ' + sp.soulsPerMin + '/min souls (about ' + (sp.souls + sp.soulsPerMin * Math.floor(t / 60)) + ' now)' + (k === 'heavy_crate' ? ' · heavy melee to break' : ''));
      if (k === 'sinners') lines.push('Melee only · each hit costs ' + sp.hitCost + ' health');
    } else if (k === 'midboss') {
      lines.push(st.up ? 'Alive' : 'Respawns in ' + E.fmt(st.nextAt - t));
      const hp = G.midboss.hp + G.midboss.hpPerMin * Math.floor(t / 60);
      lines.push('Health about ' + hp.toLocaleString() + ' · respawn 7:00 / 6:00 / 5:00 after deaths');
    } else if (k === 'vent') lines.push('Hide inside to drop out of sight and recover. An enemy who follows you in reveals you.');
    else if (k === 'powerup') lines.push(st.up ? 'Buff waiting (heavy melee to claim, lasts ' + G.spawns.powerup.buffSeconds + ' s)' : 'Next at ' + E.fmt(st.nextAt));
    else if (k === 'urn_spawn') lines.push(st.up ? 'The urn is on this side (one of two spots)' : 'Next urn ' + E.fmt(st.nextAt) + ' on the ' + G.lanes[st.nextSide].name + ' side');
    else if (k === 'rift') lines.push(st.up ? 'Open' : st.possible ? 'Window open now' : st.nextAt ? (S.match.riftMode === 'sim' ? 'Next at ' : 'Window opens ') + E.fmt(st.nextAt) : '');
    else if (E.OBJECTIVES.includes(k)) {
      const o = G.objectives[k] || {};
      lines.push('Health ' + Math.round(st.hp).toLocaleString() + ' / ' + st.maxHp.toLocaleString() + (o.souls ? ' · ' + o.souls.toLocaleString() + ' souls' : ''));
    }
    return lines;
  }
  function markerTitle(m) {
    const G = S.game;
    const team = m.team && G.teams[m.team] ? G.teams[m.team].name + ' ' : '';
    const lane = m.lane && G.lanes[m.lane] ? ' · ' + G.lanes[m.lane].name : '';
    const place = [m.place, m.area].filter(Boolean).join(' · ');
    return { title: (m.label || team + KIND_LABEL[m.kind] || m.kind), sub: place + lane + ((m.z || 0) < -50 ? ' · underground' : '') };
  }
  function markerClick(id, evt) {
    const m = S.byId.get(id);
    if (!m) return;
    S.selected = id;
    renderInspector();
    if (S.god) return;
    const { title, sub } = markerTitle(m);
    const k = m.kind;
    const btns = [];
    if (E.AFTER_CLEAR.includes(k)) {
      btns.push(['clear', CLEAR_WORD[k] || 'Cleared', 'primary']);
      btns.push(['restore', 'Up now']);
      if (m.camp) {
        const n = S.markers.filter(x => x.camp === m.camp && E.AFTER_CLEAR.includes(x.kind)).length;
        if (n > 1) btns.push(['clearcamp', 'Clear whole camp (' + n + ')']);
      }
    } else if (k === 'midboss') {
      btns.push(['kill:amber', 'Killed by ' + S.game.teams.amber.name, 'amber'], ['kill:sapphire', 'Killed by ' + S.game.teams.sapphire.name, 'sapphire'], ['restore', 'Alive now']);
    } else if (k === 'powerup' || k === 'urn_spawn' || (k === 'rift' && S.match.riftMode === 'sim')) {
      btns.push(['claim', k === 'urn_spawn' ? 'Urn taken' : k === 'rift' ? 'Captured' : 'Claimed', 'primary']);
    } else if (E.OBJECTIVES.includes(k)) {
      btns.push(['dmg:0.1', '−10%'], ['dmg:0.25', '−25%'], ['destroy', 'Destroyed', 'primary'], ['restore', 'Full health']);
      const o = S.game.objectives[k] || {};
      if (o.rangeM) view.drawRange(m, o.rangeM);
    }
    const info = markerInfo(m);
    openPop(evt, `<h4>${esc(title)}</h4><div class="sub">${esc(sub)}</div>${info.map(l => `<div style="font-size:13px">${esc(l)}</div>`).join('')}<div class="acts" style="margin-top:8px">${btns.map(b => `<button data-a="${b[0]}" class="${b[2] || ''}">${esc(b[1])}</button>`).join('')}</div>`, pop => {
      pop.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'clearcamp') { for (const x of S.markers) if (x.camp === m.camp && E.AFTER_CLEAR.includes(x.kind)) S.match.act(x.id, 'clear'); }
        else if (a.startsWith('kill:')) S.match.act(id, 'kill', a.split(':')[1]);
        else if (a.startsWith('dmg:')) S.match.act(id, 'damage', Number(a.split(':')[1]));
        else S.match.act(id, a);
        closePop();
        tick(true);
        renderInspector();
      }));
    });
  }
  function renderInspector() {
    const box = $('#inspect');
    const m = S.selected && S.byId.get(S.selected);
    if (!S.god) {
      if (!m) { box.innerHTML = 'Click anything on the map.'; box.className = 'muted'; return; }
      const { title, sub } = markerTitle(m);
      box.className = '';
      box.innerHTML = `<b>${esc(title)}</b><div class="muted" style="font-size:12px;margin-bottom:6px">${esc(sub)}</div>${markerInfo(m).map(l => `<div style="font-size:13px">${esc(l)}</div>`).join('')}`;
      return;
    }
    box.className = 'inspect';
    const head = `<div class="btnrow" style="margin:0 0 10px"><button id="gRules">Edit rules and timings</button><button id="gAdd">Add marker…</button></div>`;
    if (!m) { box.innerHTML = head + '<div class="muted">Click a marker to edit it. Drag markers to move them. Right-click the map to add one there.</div>'; bindGodHead(); return; }
    const G = S.game;
    const st = S.match.status(m.id) || {};
    const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    box.innerHTML = head + `
      <label>Name<input data-f="label" value="${esc(m.label || '')}" placeholder="${esc(markerTitle(Object.assign({}, m, { label: '' })).title)}"></label>
      <div class="row2"><label>Kind<select data-f="kind">${opt(ALL_KINDS.map(k => [k, KIND_LABEL[k]]), m.kind)}</select></label>
      <label>Team<select data-f="team">${opt([['', 'None'], ['amber', G.teams.amber.name], ['sapphire', G.teams.sapphire.name]], m.team || '')}</select></label></div>
      <div class="row2"><label>Lane<select data-f="lane">${opt([['', 'None'], ...Object.entries(G.lanes).map(([k, l]) => [k, l.name])], m.lane || '')}</select></label>
      <label>Area<input data-f="area" value="${esc(m.area || '')}"></label></div>
      <div class="row2"><label>First spawn (s)<input data-f="first" type="number" value="${esc(m.first ?? '')}" placeholder="${esc(st.first ?? '')}"></label>
      <label>Respawn (s)<input data-f="respawn" type="number" value="${esc(m.respawn ?? '')}" placeholder="${esc(st.respawn ?? '')}"></label></div>
      <div class="row2"><label>Height z<input data-f="z" type="number" value="${esc(m.z || 0)}"></label>
      ${st.maxHp ? `<label>Health now<input data-hp type="number" value="${Math.round(st.hp)}"></label>` : '<span></span>'}</div>
      <div class="muted" style="font-size:12px">Position u ${m.u.toFixed(4)} · v ${m.v.toFixed(4)} · id ${esc(m.id)}</div>
      <div class="btnrow"><button id="gDup">Duplicate</button><button id="gDel">Delete</button><button id="gReset">Undo my edits</button></div>`;
    bindGodHead();
    box.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
      const f = inp.dataset.f;
      let v = inp.value;
      if (['first', 'respawn', 'z'].includes(f)) v = v === '' ? undefined : Number(v);
      if (v === '') v = undefined;
      editMarker(m.id, { [f]: v });
    }));
    const hp = box.querySelector('[data-hp]');
    if (hp) hp.addEventListener('change', () => { const e = S.match.ents.get(m.id); e.hp = Math.max(0, Math.min(e.maxHp, Number(hp.value) || 0)); tick(true); });
    $('#gDup').onclick = () => {
      const copy = Object.assign({}, m, { id: 'custom-' + Date.now().toString(36), u: m.u + 0.01, v: m.v + 0.01 });
      S.overrides.added.push(copy);
      afterMarkerEdit(copy.id);
    };
    $('#gDel').onclick = () => {
      S.overrides.removed.push(m.id);
      S.selected = null;
      afterMarkerEdit(null);
    };
    $('#gReset').onclick = () => {
      delete S.overrides.markers[m.id];
      afterMarkerEdit(m.id);
    };
  }
  function bindGodHead() {
    const r = $('#gRules'); if (r) r.onclick = openGod;
    const a = $('#gAdd'); if (a) a.onclick = e => addMenu(0.5, 0.5, e, true);
  }
  function editMarker(id, patch) {
    const added = S.overrides.added.find(a => a.id === id);
    if (added) Object.assign(added, patch);
    else S.overrides.markers[id] = Object.assign(S.overrides.markers[id] || {}, patch);
    for (const k of Object.keys(patch)) if (patch[k] === undefined) { if (added) delete added[k]; else delete S.overrides.markers[id][k]; }
    afterMarkerEdit(id);
  }
  function afterMarkerEdit(selectId) {
    saveOverrides();
    buildMarkers();
    S.match.setMarkers(S.markers);
    view.rebuildMarkers();
    computeGuardians();
    S.selected = selectId;
    renderInspector();
    tick(true);
  }
  function addMenu(u, v, evt, centre) {
    openPop(evt, `<h4>Add a marker${centre ? '' : ' here'}</h4><div class="acts">${ALL_KINDS.map(k => `<button data-k="${k}">${esc(KIND_LABEL[k])}</button>`).join('')}</div>`, pop => {
      pop.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const kind = b.dataset.k;
        const m = { id: 'custom-' + Date.now().toString(36), kind, u, v, z: 0, team: null, lane: null, area: 'Custom' };
        if (E.OBJECTIVES.includes(kind) || kind === 'spawn') m.team = 'amber';
        S.overrides.added.push(m);
        closePop();
        afterMarkerEdit(m.id);
      }));
    });
  }

  // ---------- heroes UI ----------
  // Dead heroes: deadUntil is the match time they respawn (deadlock.wiki/Death curve in game-data respawn).
  const heroDead = h => h.deadUntil !== null && h.deadUntil !== undefined && h.deadUntil > (S.match ? S.match.t : 0);
  function drawHeroes() {
    const t = S.match ? S.match.t : 0;
    view.drawHeroes(S.heroes.map(h => Object.assign({}, h, { dead: heroDead(h), left: heroDead(h) ? h.deadUntil - t : 0 })), S.selHero);
  }
  function killHero(h, byUnit) {
    const t = S.match.t;
    if (S.match.useRejuv(h.team)) {
      const left = S.match.rejuvLeft(h.team);
      toast(h.name + ' revived by the Rejuvenator', left ? left + ' token' + (left > 1 ? 's' : '') + ' left' : 'that was the last token');
      return;
    }
    h.deadUntil = t + E.respawnTime(S.game, t, byUnit);
    h.diedAt = t;
    toast(h.name + ' down', 'back at ' + E.fmt(h.deadUntil) + ' (' + E.fmt(h.deadUntil - t) + ')');
  }
  // Called every tick: bring heroes back when their timer ends. Redraws only when a countdown's second changes.
  let deathKey = '';
  function checkRespawns() {
    const t = S.match.t;
    const keys = [];
    for (const h of S.heroes) {
      if (h.dead === true && h.deadUntil == null) { h.deadUntil = t + E.respawnTime(S.game, t, false); h.diedAt = t; } // older saves
      delete h.dead;
      if (h.deadUntil == null) continue;
      // The clock was moved back to before the death: they're alive at that point.
      if (h.diedAt != null && t < h.diedAt) { h.deadUntil = null; h.diedAt = null; continue; }
      if (h.deadUntil <= t) {
        const late = t - h.deadUntil;
        h.deadUntil = null; h.diedAt = null;
        if (S.clock.running && late < 2) {
          toast(h.name + ' is back', S.game.teams[h.team].name);
          if (S.settings.alertStyle !== 'off') A.play('waves');
        }
        continue;
      }
      keys.push(h.slot + h.team + Math.ceil(h.deadUntil - t));
    }
    const key = keys.join(',');
    if (key !== deathKey) { deathKey = key; drawHeroes(); renderLineup(); }
  }
  function heroClick(i) {
    S.selHero = i;
    drawHeroes();
  }
  function heroDbl(i) {
    const dlg = $('#dlgHero');
    const h = S.heroes[i];
    dlg.innerHTML = `<div class="dh"><h2>Pick a hero for ${esc(S.game.teams[h.team].name)}</h2><button class="close" value="x">✕</button></div><div class="db"><div class="heroes-grid">${S.game.heroes.map(n => `<button data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>`;
    dlg.querySelector('.close').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { h.name = b.dataset.n; dlg.close(); drawHeroes(); renderLineup(); autosave(true); });
    dlg.showModal();
  }
  function heroContext(i, evt) {
    const h = S.heroes[i];
    const t = S.match.t;
    const tokens = S.match.rejuvLeft(h.team);
    const dead = heroDead(h);
    const sub = dead ? 'Dead · back at ' + E.fmt(h.deadUntil) + ' (' + E.fmt(h.deadUntil - t) + ')'
      : tokens ? 'Rejuvenator: ' + tokens + ' token' + (tokens > 1 ? 's' : '') + ' left, so a death revives them' : 'Respawn now: ' + E.fmt(E.respawnTime(S.game, t, false));
    const acts = dead ? '<button data-a="alive" class="primary">Alive now</button>'
      : `<button data-a="hero" class="primary">Killed by a hero (${E.fmt(E.respawnTime(S.game, t, false))})</button><button data-a="unit">Killed by troopers or an objective (${E.fmt(E.respawnTime(S.game, t, true))})</button>`;
    openPop(evt, `<h4>${esc(h.name)}</h4><div class="sub">${esc(S.game.teams[h.team].name)} · ${esc(sub)}</div><div class="acts">${acts}<button data-a="pick">Change hero</button></div>`, pop => {
      const done = () => { closePop(); drawHeroes(); renderLineup(); renderStatus(); renderLanes(false); autosave(true); };
      const on = (a, fn) => { const b = pop.querySelector(`[data-a=${a}]`); if (b) b.onclick = () => { fn(); done(); }; };
      on('hero', () => killHero(h, false));
      on('unit', () => killHero(h, true));
      on('alive', () => { h.deadUntil = null; h.diedAt = null; });
      pop.querySelector('[data-a=pick]').onclick = () => { closePop(); heroDbl(i); };
    });
  }

  // ---------- context menu: pings (normal) or add (god) ----------
  const PINGS = [['Danger', '#ff6b57'], ['Gank here', '#ffb547'], ['On my way', '#7ee08a'], ['Push here', '#4fe3ff'], ['Defend', '#5b93f0'], ['Farm here', '#b48cff']];
  function contextMenu(u, v, evt) {
    if (S.god) { addMenu(u, v, evt); return; }
    openPop(evt, `<h4>Ping</h4><div class="acts">${PINGS.map(([l, c]) => `<button data-l="${esc(l)}" style="border-color:${c}">${esc(l)}</button>`).join('')}</div>${S.drawings.length ? '<div class="acts" style="margin-top:6px"><button data-clear>Clear drawings</button></div>' : ''}`, pop => {
      pop.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
        const p = PINGS.find(x => x[0] === b.dataset.l);
        A.unlock(); A.play('ping');
        view.ping(u, v, p[0], p[1]);
        closePop();
      });
      const c = pop.querySelector('[data-clear]');
      if (c) c.onclick = () => { S.drawings = []; view.drawDrawings(S.drawings); closePop(); autosave(true); };
    });
  }

  // ---------- dialogs ----------
  function dlgShell(id, title, body) {
    const d = $(id);
    d.innerHTML = `<div class="dh"><h2>${esc(title)}</h2><button class="close" aria-label="Close">✕</button></div><div class="db">${body}</div>`;
    d.querySelector('.close').onclick = () => d.close();
    d.showModal();
    return d;
  }
  function openSettings() {
    const s = S.settings;
    const voices = A.voices();
    const rows = A.kinds.map(([k, label]) => {
      const on = k === 'ping' ? null : s.alerts[k];
      return `<div class="soundrow"><label class="chk">${on === null ? '' : `<input type="checkbox" data-al="${k}" ${on ? 'checked' : ''}>`}${esc(label)} <small>(${esc(A.source(k))})</small></label><button data-test="${k}">Play</button><button data-pick="${k}">Your sound…</button><button data-built="${k}" title="Go back to the built-in sound">Built-in</button></div>`;
    }).join('');
    const d = dlgShell('#dlgSettings', 'Settings', `
      <h3>Alerts</h3>
      <div class="grid2">
        <label>Warn this many seconds before a spawn<input id="sLead" type="number" min="3" max="120" value="${s.lead}"></label>
        <label>Sound volume<input id="sVol" type="range" min="0" max="1" step="0.05" value="${s.volume}"></label>
        <label>How alerts sound<select id="sStyle">
          ${[['sound', 'Sound only: a cue to look at the board'], ['short', 'Sound + one word ("Urn")'], ['full', 'Sound + full sentence ("Soul Urn on York side in 15")'], ['off', 'Silent: cards only']].map(([v, l]) => `<option value="${v}" ${s.alertStyle === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select></label>
        <label class="chk"><input id="sOne" type="checkbox" ${s.oneSound ? 'checked' : ''}> Same cue for every alert (off: each objective has its own sound)</label>
        <label class="chk"><input id="sResp" type="checkbox" ${s.alerts.respawns ? 'checked' : ''}> Alert for camps and Mid-Boss you marked as cleared</label>
        <label>Voice (for the word or sentence styles)<select id="sVoiceName"><option value="">Most natural voice installed${A.pickVoice() ? ' (' + esc(A.pickVoice().name) + ')' : ''}</option>${voices.map(v => `<option ${v.name === s.voiceName ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
        <label>Voice speed<input id="sRate" type="range" min="0.7" max="1.4" step="0.05" value="${s.voiceRate}"></label>
        <label class="chk"><input id="sFloat" type="checkbox" ${s.autoFloat ? 'checked' : ''}> Open the floating Next Up window when I click Start</label>
        <label class="chk"><input id="sAwake" type="checkbox" ${s.keepAwake ? 'checked' : ''}> Keep alerts on time while the game is in front (plays an inaudible tone)</label>
      </div>
      <h3>Sounds</h3>
      <p class="muted">Tick what you want alerts for. To use your own sound, pick a file here, or drop a file named like <code>urn_spawn.mp3</code> into the <code>sounds</code> folder (see the README there).</p>
      ${rows}
      <input id="sFile" type="file" accept="audio/*" hidden>
      <h3>Board</h3>
      <label>Map icons<select id="sIcons">
        ${[['minimap', 'Minimap: shapes and colours like the in-game minimap'], ['detailed', 'Detailed: drawn objectives (automatons, masks)'], ['classic', "Classic: the board's first icons"]].map(([v, l]) => `<option value="${v}" ${s.iconSet === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select></label>
      <label class="chk"><input id="sTroops" type="checkbox" ${s.troops ? 'checked' : ''}> Animate trooper waves walking down the lanes</label>
      <h3>Data</h3>
      <p class="muted">Patch: ${esc(S.game.patch.name)} · map build ${esc(DLB_MAP.source.build)} · checked ${esc(S.game.patch.checked)}.</p>
      ${LOCAL ? `<p id="sPatch">${esc(patchStatusText())} <button class="btn" id="sPatchCheck">Check for a new patch</button></p>` : ''}
      <p class="muted">Unofficial fan-made tool. Not affiliated with or endorsed by Valve.</p>
      <ul class="help">${S.game.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener" style="color:var(--acc)">${esc(x.name)}</a></li>`).join('')}</ul>`);
    const set = (k, v) => { s[k] = v; saveSettings(); applyAudioSettings(); };
    d.querySelector('#sLead').onchange = e => set('lead', Math.max(3, Number(e.target.value) || 15));
    d.querySelector('#sVol').oninput = e => set('volume', Number(e.target.value));
    d.querySelector('#sStyle').onchange = e => { set('alertStyle', e.target.value); A.unlock(); previewAlert(); };
    d.querySelector('#sOne').onchange = e => { set('oneSound', e.target.checked); A.unlock(); previewAlert(); };
    d.querySelector('#sVoiceName').onchange = e => set('voiceName', e.target.value);
    d.querySelector('#sRate').onchange = e => set('voiceRate', Number(e.target.value));
    d.querySelector('#sAwake').onchange = e => set('keepAwake', e.target.checked);
    d.querySelector('#sFloat').onchange = e => set('autoFloat', e.target.checked);
    d.querySelector('#sResp').onchange = e => { s.alerts.respawns = e.target.checked; saveSettings(); };
    d.querySelector('#sTroops').onchange = e => set('troops', e.target.checked);
    if (LOCAL) d.querySelector('#sPatchCheck').onclick = async () => {
      d.querySelector('#sPatch').firstChild.textContent = 'Checking Steam… ';
      await checkPatches(true);
      d.querySelector('#sPatch').firstChild.textContent = patchStatusText() + ' ';
    };
    d.querySelector('#sIcons').onchange = e => { s.iconSet = e.target.value; saveSettings(); view.setIconSet(s.iconSet); tick(true); };
    d.querySelectorAll('[data-al]').forEach(c => c.onchange = () => { s.alerts[c.dataset.al] = c.checked; saveSettings(); renderUpcoming(); });
    d.querySelectorAll('[data-test]').forEach(b => b.onclick = () => { A.unlock(); A.play(b.dataset.test); });
    let pickKind = null;
    const file = d.querySelector('#sFile');
    d.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { pickKind = b.dataset.pick; file.value = ''; file.click(); });
    file.onchange = async () => { if (file.files[0] && pickKind) { try { await A.setCustom(pickKind, file.files[0]); A.play(pickKind); openSettings(); } catch (e) { toast('That file could not be played', 'Try an .mp3, .wav or .ogg file'); } } };
    d.querySelectorAll('[data-built]').forEach(b => b.onclick = async () => { await A.clearCustom(b.dataset.built); openSettings(); });
  }
  // Play what an alert sounds like with the current settings (used when the style changes).
  function previewAlert() {
    const st = S.settings.alertStyle;
    if (st === 'off') return;
    A.play(S.settings.oneSound ? 'attention' : 'urn_spawn');
    if (st === 'short') setTimeout(() => A.say('Urn'), 450);
    if (st === 'full') setTimeout(() => A.say('Soul Urn on York side in ' + S.settings.lead), 450);
  }
  function applyAudioSettings() {
    A.setVolume(S.settings.volume);
    A.voice.on = S.settings.alertStyle === 'short' || S.settings.alertStyle === 'full';
    A.voice.name = S.settings.voiceName;
    A.voice.rate = S.settings.voiceRate;
  }
  const LAYER_KINDS = ['guardian', 'walker', 'base_guardian', 'shrine', 'patron', 'midboss', 'camp_small', 'camp_medium', 'camp_large', 'sinners', 'urn_spawn', 'urn_dropoff', 'powerup', 'rift', 'snack', 'heavy_crate', 'crate', 'buff_box', 'vent', 'shop', 'teleporter', 'rope', 'bell', 'spawn'];
  function openLayers() {
    const sh = S.settings.show, ss = S.settings.showStatic;
    const d = dlgShell('#dlgLayers', 'Map layers', `
      <div class="grid2">${LAYER_KINDS.map(k => `<label class="chk"><input type="checkbox" data-k="${k}" ${sh[k] !== false ? 'checked' : ''}> ${esc(KIND_LABEL[k])} <small>${S.markers.filter(m => m.kind === k).length}</small></label>`).join('')}</div>
      <h3>Other</h3>
      <div class="grid2">
        <label class="chk"><input type="checkbox" data-s="labels" ${ss.labels ? 'checked' : ''}> Place names</label>
        <label class="chk"><input type="checkbox" data-s="lanes" ${ss.lanes ? 'checked' : ''}> Lanes</label>
        <label class="chk"><input type="checkbox" data-s="zips" ${ss.zips ? 'checked' : ''}> Ziplines</label>
        <label class="chk"><input type="checkbox" data-s="tele" ${ss.tele ? 'checked' : ''}> Teleporter links</label>
        <label class="chk"><input type="checkbox" data-s="under" ${ss.under ? 'checked' : ''}> Underground things</label>
        <label class="chk"><input type="checkbox" data-t ${sh.troops !== false ? 'checked' : ''}> Trooper waves</label>
      </div>
      <div class="btnrow"><button class="btn" data-preset="clean">Clean (objectives and camps)</button><button class="btn" data-preset="all">Everything</button></div>`);
    d.querySelectorAll('[data-k]').forEach(c => c.onchange = () => { sh[c.dataset.k] = c.checked; saveSettings(); tick(true); });
    d.querySelectorAll('[data-s]').forEach(c => c.onchange = () => { ss[c.dataset.s] = c.checked; saveSettings(); applyStatic(); });
    d.querySelector('[data-t]').onchange = e => { sh.troops = e.target.checked; saveSettings(); tick(true); };
    d.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
      const all = b.dataset.preset === 'all';
      for (const k of LAYER_KINDS) sh[k] = all || !['crate', 'buff_box', 'rope', 'bell', 'snack', 'vent'].includes(k);
      saveSettings(); tick(true); openLayers();
    });
  }
  function applyStatic() {
    const ss = S.settings.showStatic, Ls = view.layers;
    Ls.labels.style.display = ss.labels ? '' : 'none';
    Ls.roads.style.display = ss.lanes ? '' : 'none';
    Ls.zips.style.display = ss.zips ? '' : 'none';
    Ls.tele.style.display = ss.tele ? '' : 'none';
    document.body.classList.toggle('hide-under', !ss.under);
  }
  function openHelp() {
    dlgShell('#dlgHelp', 'How to use Deadlock Board', `
      <h3>During a real match</h3>
      <ol class="help">
        <li>Pick <b>Real match</b>. Press <b>Start</b> when the in-game clock reads 0:00. If you're off, type the game time in <b>Set time</b> (for example <code>4:32</code>) or nudge with ← →.</li>
        <li>About ${S.settings.lead} seconds before each spawn you hear a soft cue and the <b>Next</b> card in the corner of the map lights up. Change the sound, or add a word or sentence, in <b>Settings</b>.</li>
        <li>Press <b>Float Next Up</b> (or click <b>Start</b>) to keep the Next card on top of the game in its own small window. It works when Deadlock runs in <b>borderless windowed</b> mode, not exclusive fullscreen.</li>
        <li>Click a camp, crate, snack or the Mid-Boss when it's cleared or taken. Its respawn timer starts, and you get an alert before it's back.</li>
        <li>The Unstable Rift's exact time is random in the game, so in Real match the board shows its window. In <b>Simulation</b> it is rolled at random like the game does.</li>
      </ol>
      <h3>On the board</h3>
      <ul class="help">
        <li>Drag heroes like chess pieces. Double-click one to change the hero. Right-click a hero (on the map or in the lineup) and pick <b>Killed by a hero</b> or <b>Killed by troopers or an objective</b>: the token shows a respawn countdown from the deadlock.wiki curve (8 s before 5:00, up to 90 s; +10 s with no enemy hero on the kill). If their team holds the Rejuvenator, a death uses one token and they revive instead. While every enemy hero in a lane is dead, that lane shows a green <b>Push window</b> with the time left.</li>
        <li>The crossed swords on each lane are where the waves meet. They start in the middle. Drag them, or pick a lane state on the left.</li>
        <li>Click any lane (or <b>Edit</b> in the Lanes panel) to set exactly where the waves meet, jump them to a Guardian or Walker, and set how many troopers each side has there (for example 4 v 3 for a freeze). Each team's colour on the lane shows how far it has pushed.</li>
        <li>Right-click the map to ping. Press <b>Draw</b> to sketch a plan.</li>
        <li>Scroll to zoom, drag empty space to pan, <b>Flip</b> to put the other base at the bottom.</li>
      </ul>
      <h3>Lane states</h3>
      <div class="state"><b>Defensive</b><p>Kill the wave out of harm's way. Look for safe chip damage and take every box and camp you can. Avoid fights until you are ahead on souls, then look for ult windows and careful picks. Farm after each failed try. Never go stale in lane.</p></div>
      <div class="state"><b>Fast push</b> (their Guardian, enemy alive)<p>Kill the enemy wave as fast as possible while keeping as many of your troopers alive as possible. Hit the Guardian with abilities and headshots.</p></div>
      <div class="state f"><b>Freeze</b> (their Guardian, after you win the fight)<p>Start when an enemy is at or below 50%, you have ult advantage, or you can control the fight another way. Kill one enemy trooper and keep all of yours, so your wave wins on its own. Push the enemy off the wave: keep them more than ${S.game.troopers.soulOrbRangeM} m from their troopers so the wave pays them nothing. Collect souls as troopers die and don't take trooper damage. If they die, kill their troopers at once and push the Guardian. Done right, you have 3–4 troopers alive, a new wave coming, and the enemy dead or too low to contest. The board draws the ${S.game.troopers.soulOrbRangeM} m ring when a lane is set to Freeze.</p></div>
      <h3>Keys</h3>
      <p><code>Space</code> start/pause · <code>←</code> <code>→</code> 1 s (<code>Shift</code> 10 s) · <code>F</code> flip · <code>D</code> draw · <code>G</code> god mode · <code>H</code> help · <code>Esc</code> close</p>
      ${LOCAL ? `<p>These only work while the board is the active window. For keys that work while Deadlock is in front (start the clock at 0:00, Mid-Boss down, urn taken, "what's next?"), press <b>Hotkeys</b> at the top.</p>` : ''}
      <h3>Keeping it current</h3>
      <p>Timings live in <code>data/game-data.js</code>. After a patch, give Claude the patch notes and ask it to update that file (instructions are in <code>CLAUDE.md</code>). Changes you make in god mode are saved in this browser; export them from god mode to keep a copy.</p>`);
  }

  // ---------- god mode ----------
  function setGod(on) {
    S.god = on;
    $('#btnGod').classList.toggle('on', on);
    $('#godBanner').hidden = !on;
    closePop();
    renderInspector();
  }
  function openGod() {
    const G = S.game;
    const sp = Object.entries(G.spawns);
    const num = (path, v) => `<input type="number" step="any" data-path="${path}" value="${v ?? ''}">`;
    const d = dlgShell('#dlgGod', 'God mode: rules and timings', `
      <p class="muted">Changes apply right away and are saved in this browser. Export them to keep a copy or move them to another PC.</p>
      <h3>Spawns (seconds)</h3>
      <table><tr><th>What</th><th>First</th><th>Respawn</th><th>Every</th></tr>
      ${sp.map(([k, r]) => `<tr><td>${esc(r.label)}</td><td>${num('spawns.' + k + '.first', r.first)}</td><td>${r.respawn !== undefined ? num('spawns.' + k + '.respawn', r.respawn) : r.respawnSeq ? `<input data-json="spawns.${k}.respawnSeq" value="${esc(JSON.stringify(r.respawnSeq))}">` : ''}</td><td>${r.every !== undefined ? num('spawns.' + k + '.every', r.every) : ''}</td></tr>`).join('')}
      </table>
      <h3>Troopers</h3>
      <div class="grid2">
        <label>Wave intervals (JSON)<input data-json="troopers.intervals" value="${esc(JSON.stringify(G.troopers.intervals))}"></label>
        <label>Walk speed (m/s)${num('troopers.walkSpeed', G.troopers.walkSpeed)}</label>
        <label>Soul orb range (m)${num('troopers.soulOrbRangeM', G.troopers.soulOrbRangeM)}</label>
        <label>Alert lead (s)${num('alerts.leadSeconds', G.alerts.leadSeconds)}</label>
      </div>
      <h3>Objectives</h3>
      <table><tr><th>Objective</th><th>Health</th><th>Souls</th><th>Range (m)</th></tr>
      ${Object.entries(G.objectives).map(([k, o]) => `<tr><td>${esc(o.label)}</td><td>${num('objectives.' + k + '.hp', o.hp)}</td><td>${num('objectives.' + k + '.souls', o.souls)}</td><td>${num('objectives.' + k + '.rangeM', o.rangeM)}</td></tr>`).join('')}
      </table>
      <h3>Crate exceptions (JSON)</h3>
      <textarea rows="5" data-json="breakableRules">${esc(JSON.stringify(G.breakableRules, null, 1))}</textarea>
      <h3>Match events (JSON)</h3>
      <textarea rows="4" data-json="events">${esc(JSON.stringify(G.events, null, 1))}</textarea>
      <h3>Heroes (one per line)</h3>
      <textarea rows="5" id="gHeroes">${esc(G.heroes.join('\n'))}</textarea>
      <h3>Background picture</h3>
      <p class="muted">Optional: put your own picture (for example a screenshot of the minimap) under the board and line it up.</p>
      <div class="grid2"><input type="file" id="gBg" accept="image/*"><button class="btn" id="gBgClear">Remove picture</button>
      ${['opacity', 'scale', 'x', 'y'].map(k => `<label>${k}<input type="number" step="any" data-bg="${k}" value="${S.overrides.bg ? S.overrides.bg[k] ?? '' : ''}"></label>`).join('')}</div>
      <h3>Save and share</h3>
      <div class="btnrow">
        <button class="btn primary" id="gExport">Export my edits (.json)</button>
        <button class="btn" id="gImport">Import edits…</button>
        <button class="btn" id="gPatch">Download game-data.js</button>
        <button class="btn danger" id="gResetAll">Undo all god mode edits</button>
      </div>
      <input type="file" id="gImportFile" accept=".json,application/json" hidden>`);
    const setPath = (path, value) => {
      const parts = path.split('.');
      let o = S.overrides.rules;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
      o[parts[parts.length - 1]] = value;
      rulesChanged();
    };
    d.querySelectorAll('[data-path]').forEach(inp => inp.onchange = () => { if (inp.value !== '') setPath(inp.dataset.path, Number(inp.value)); });
    d.querySelectorAll('[data-json]').forEach(inp => inp.onchange = () => {
      try { setPath(inp.dataset.json, JSON.parse(inp.value)); inp.style.borderColor = ''; } catch (e) { inp.style.borderColor = 'var(--bad)'; toast('That JSON has a mistake', e.message); }
    });
    d.querySelector('#gHeroes').onchange = e => setPath('heroes', e.target.value.split('\n').map(x => x.trim()).filter(Boolean));
    d.querySelector('#gBg').onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { S.overrides.bg = Object.assign({ opacity: 0.5, scale: 1, x: 0, y: 0 }, S.overrides.bg || {}, { src: r.result }); saveOverrides(); view.rebuildStatic(); applyStatic(); };
      r.readAsDataURL(f);
    };
    d.querySelector('#gBgClear').onclick = () => { S.overrides.bg = null; saveOverrides(); view.rebuildStatic(); };
    d.querySelectorAll('[data-bg]').forEach(inp => inp.onchange = () => { if (!S.overrides.bg) return; S.overrides.bg[inp.dataset.bg] = Number(inp.value); saveOverrides(); view.rebuildStatic(); });
    d.querySelector('#gExport').onclick = () => download('deadlock-board-edits.json', JSON.stringify({ app: 'Deadlock Board', exported: new Date().toISOString(), overrides: S.overrides, settings: S.settings }, null, 1), 'application/json');
    const imp = d.querySelector('#gImportFile');
    d.querySelector('#gImport').onclick = () => imp.click();
    imp.onchange = async () => {
      try {
        const data = JSON.parse(await imp.files[0].text());
        if (!data.overrides) throw new Error('No edits found in that file');
        S.overrides = Object.assign({ rules: {}, markers: {}, added: [], removed: [], bg: null }, data.overrides);
        if (data.settings) S.settings = Object.assign(S.settings, data.settings);
        saveOverrides(); saveSettings();
        location.reload();
      } catch (e) { toast('Could not import that file', e.message); }
    };
    d.querySelector('#gPatch').onclick = () => download('game-data.js', '// Exported from Deadlock Board god mode on ' + new Date().toISOString() + '.\n// Replace data/game-data.js with this file to make the edits permanent.\nwindow.DLB_GAME = ' + JSON.stringify(S.game, null, 2) + ';\n', 'text/javascript');
    d.querySelector('#gResetAll').onclick = () => {
      if (!confirm('Undo every god mode edit (rules, moved and added markers, background)?')) return;
      S.overrides = { rules: {}, markers: {}, added: [], removed: [], bg: null };
      saveOverrides();
      location.reload();
    };
  }
  function rulesChanged() {
    saveOverrides();
    buildGame();
    const state = S.match.toJSON();
    S.match = new E.Match(S.game, S.markers, { riftMode: S.match.riftMode, seed: S.match.seed });
    S.match.load(state);
    view.rebuildStatic();
    applyStatic();
    tick(true);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- saving the session ----------
  let lastSave = 0;
  function autosave(force) {
    if (!force && now() - lastSave < 3000) return;
    lastSave = now();
    store.set('session', {
      mode: S.mode, match: S.match.toJSON(), heroes: S.heroes, fronts: S.fronts, laneStates: S.laneStates, laneTroops: S.laneTroops,
      drawings: S.drawings, speed: S.clock.speed, flip: view.isFlipped(),
    });
  }
  function restore() {
    const s = store.get('session', null);
    if (!s) return false;
    try {
      S.mode = s.mode || 'real';
      S.match = new E.Match(S.game, S.markers, { riftMode: S.mode === 'sim' ? 'sim' : 'window', seed: s.match && s.match.seed });
      S.match.load(s.match);
      S.clock = { running: false, speed: s.speed || 1, t0: S.match.t, real0: 0 };
      S.lastT = S.match.t;
      if (s.heroes && s.heroes.length === 12) S.heroes = s.heroes; else resetHeroes();
      S.fronts = Object.assign(S.fronts, s.fronts || {});
      S.laneStates = Object.assign(S.laneStates, s.laneStates || {});
      for (const [k, v] of Object.entries(s.laneTroops || {})) if (S.laneTroops[k]) S.laneTroops[k] = { amber: v.amber ?? null, sapphire: v.sapphire ?? null };
      S.drawings = s.drawings || [];
      if (s.flip) view.setFlip(true);
      return true;
    } catch (e) { return false; }
  }

  // ---------- global hotkeys (tools/hotkeys.pyw serves key presses on localhost) ----------
  const HK_PORT = 47819;
  // Opened from this PC (desktop shortcut or a local test server). A shared web link must never try to reach
  // the viewer's computer: no hotkey helper, no patch watch, no sounds-folder lookup.
  const LOCAL = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  // ---------- patch watch: Steam's patch notes (through the hotkeys helper) vs data/game-data.js ----------
  const PW = { info: null, error: null, at: 0 };
  function newerPatches() {
    if (!PW.info || !PW.info.ok) return [];
    const have = S.game.patch.date;
    const seen = S.settings.patchSeen || '';
    return PW.info.patches.filter(p => p.date > have && p.date > seen);
  }
  function patchStatusText() {
    if (PW.error) return 'Patch check: ' + PW.error;
    if (!PW.info) return 'Patch check: not run yet.';
    if (!PW.info.ok) return 'Patch check: could not reach Steam (' + (PW.info.error || 'offline') + ').';
    const latest = PW.info.patches[0];
    const when = new Date(PW.info.checkedAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const n = PW.info.patches.filter(p => p.date > S.game.patch.date).length;
    return n ? n + ' patch' + (n > 1 ? 'es' : '') + ' newer than the board\'s data (latest: ' + latest.title + '). Checked ' + when + '.'
      : 'Up to date: the latest patch on Steam is ' + (latest ? latest.title : 'unknown') + '. Checked ' + when + '.';
  }
  async function checkPatches(force) {
    try {
      const r = await fetch(`http://127.0.0.1:${HK_PORT}/patches${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      PW.info = await r.json();
      PW.error = null;
    } catch (e) {
      PW.error = 'needs the helper. Open the board from the Deadlock Board desktop shortcut.';
    }
    PW.at = now();
    const b = $('#btnPatch');
    const n = newerPatches();
    b.hidden = !n.length;
    b.textContent = n.length ? 'New patch: ' + n[0].title.replace(/^Minor Update - /, '') : '';
  }
  function patchRequestText(list) {
    const lines = ['Update Deadlock Board (C:\\Users\\Chand\\Deadlock-Board) for the new Deadlock patch' + (list.length > 1 ? 'es' : '') + '.',
      'The board\'s data is for: ' + S.game.patch.name + ' (' + S.game.patch.date + ').', ''];
    for (const p of list) {
      lines.push(p.title + ' (' + p.date + '): ' + p.url, 'Lines that may affect the board:');
      for (const l of p.relevant) lines.push('- ' + l);
      lines.push('');
    }
    lines.push('Follow "Updating after a Deadlock patch" in CLAUDE.md, run the tests and commit.');
    return lines.join('\n');
  }
  function openPatchDialog() {
    const list = newerPatches();
    if (!list.length) return;
    const d = dlgShell('#dlgHelp', 'New Deadlock patch', `
      <p>The board's timings are for <b>${esc(S.game.patch.name)}</b>. Steam has ${list.length > 1 ? 'these newer patches' : 'a newer patch'}. Until it's updated, some timers may be off.</p>
      ${list.map(p => `<h3>${esc(p.title)} <small>${esc(p.date)}</small></h3>
        <p><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:var(--acc)">Full patch notes</a> · ${p.relevant.length} of ${p.lines} lines may affect the board:</p>
        <ul class="help patch-lines">${p.relevant.map(l => `<li>${esc(l)}</li>`).join('') || '<li class="muted">None of the lines mention timings, camps, objectives or souls.</li>'}</ul>`).join('')}
      <h3>Update the board</h3>
      <p>Copy this request and paste it to Claude. It has everything Claude needs.</p>
      <div class="btnrow"><button class="btn primary" id="pCopy">Copy update request for Claude</button><button class="btn" id="pSeen">Hide until the next patch</button></div>`);
    d.querySelector('#pCopy').onclick = async () => {
      const b = d.querySelector('#pCopy');
      try { await navigator.clipboard.writeText(patchRequestText(list)); b.textContent = 'Copied'; } catch (e) { b.textContent = 'Copy blocked here'; }
    };
    d.querySelector('#pSeen').onclick = () => { S.settings.patchSeen = list[0].date; saveSettings(); $('#btnPatch').hidden = true; d.close(); };
  }
  const HK_LABEL = {
    toggle: 'Start / pause the clock',
    start_from_zero: 'New match: timers reset and the clock starts at 0:00',
    back_1s: 'Clock back 1 second',
    forward_1s: 'Clock forward 1 second',
    say_next: 'Say what spawns next',
    midboss_us: 'Mid-Boss killed by your team (the team at the bottom of the map)',
    midboss_them: 'Mid-Boss killed by the enemy',
    urn_taken: 'Soul Urn taken',
  };
  const HK_DEFAULT = [['toggle', 'ctrl+alt+s'], ['start_from_zero', 'ctrl+alt+0'], ['back_1s', 'ctrl+alt+comma'], ['forward_1s', 'ctrl+alt+period'],
    ['say_next', 'ctrl+alt+i'], ['midboss_us', 'ctrl+alt+b'], ['midboss_them', 'ctrl+alt+n'], ['urn_taken', 'ctrl+alt+u']].map(([action, combo]) => ({ action, combo, ok: null }));
  const HK = { on: false, keys: HK_DEFAULT };
  const prettyCombo = c => c.split('+').map(p => ({ ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', win: 'Win', comma: ',', period: '.', space: 'Space' }[p] || p.toUpperCase())).join('+');
  function myTeam() { return view.isFlipped() ? 'sapphire' : 'amber'; }
  function spokenTime(s) {
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60), r = s % 60;
    return (m ? m + (m === 1 ? ' minute' : ' minutes') : '') + (m && r ? ' ' : '') + (r || !m ? r + ' seconds' : '');
  }
  // Hotkey feedback: a tick in sound-only and silent modes, a word in the voice modes.
  function confirmKey(words) {
    const st = S.settings.alertStyle;
    if (st === 'short' || st === 'full') A.say(words);
    else if (st === 'sound') A.play('waves');
  }
  function runHotkey(action) {
    A.unlock();
    const t = clockT();
    const mb = S.markers.find(m => m.kind === 'midboss');
    switch (action) {
      case 'toggle':
        if (S.clock.running) { pause(); confirmKey('Paused'); }
        else { start(); confirmKey('Clock running'); }
        toast(S.clock.running ? 'Clock running' : 'Clock paused', 'hotkey');
        break;
      case 'start_from_zero':
        pause();
        S.match = new E.Match(S.game, S.markers, { riftMode: S.mode === 'sim' ? 'sim' : 'window' });
        S.clock.t0 = 0; S.lastT = 0;
        for (const h of S.heroes) { h.deadUntil = null; h.diedAt = null; }
        start();
        confirmKey('New match');
        toast('New match: clock started at 0:00', 'hotkey');
        break;
      case 'back_1s': seek(t - 1); A.play('waves'); break;
      case 'forward_1s': seek(t + 1); A.play('waves'); break;
      case 'say_next': {
        const next = S.match.upcoming(t, 3600).filter(i => S.match.alertOn(i, enabledMap()))[0];
        A.say(next ? next.voice + (next.kind === 'rift' ? ', random time' : ' in ' + spokenTime(next.at - t)) : 'Nothing coming up', true);
        break;
      }
      case 'midboss_us':
      case 'midboss_them': {
        if (!mb) break;
        const team = action === 'midboss_us' ? myTeam() : (myTeam() === 'amber' ? 'sapphire' : 'amber');
        S.match.act(mb.id, 'kill', team);
        const back = S.match.midboss.nextAt;
        confirmKey('Mid-Boss down');
        toast('Mid-Boss killed by ' + S.game.teams[team].name, 'back at ' + E.fmt(back));
        break;
      }
      case 'urn_taken': {
        const u = S.match.urnState(t);
        const spot = S.markers.find(m => m.kind === 'urn_spawn' && m.side === u.side);
        if (u.up && spot) { S.match.act(spot.id, 'claim'); confirmKey('Urn taken'); toast('Soul Urn taken', 'hotkey'); }
        else confirmKey('No urn on the map');
        break;
      }
      default: return;
    }
    tick(true);
    renderClockButtons();
  }
  function hotkeyStatus(on, keys) {
    if (keys) HK.keys = keys;
    if (HK.on === on && !keys) return;
    HK.on = on;
    const b = $('#btnHotkeys');
    b.textContent = on ? 'Hotkeys on' : 'Hotkeys off';
    b.classList.toggle('live', on);
    document.body.dataset.hotkeys = on ? 'on' : 'off';
  }
  function startHotkeyClient() {
    // Polling runs in a worker so it keeps working while the game covers this window.
    const code = `let seq=-1;const port=${HK_PORT};
      async function poll(){try{const r=await fetch('http://127.0.0.1:'+port+'/poll?since='+Math.max(seq,0),{cache:'no-store'});const j=await r.json();
        const first=seq<0||j.seq<seq;postMessage({ok:true,first,data:j});seq=j.seq;setTimeout(poll,200);}catch(e){postMessage({ok:false});setTimeout(poll,3000);}}
      poll();`;
    const onMsg = d => {
      if (!d.ok) { hotkeyStatus(false); return; }
      hotkeyStatus(true, d.data.keys && d.data.keys.length ? d.data.keys : null);
      if (!d.first) for (const ev of d.data.events) runHotkey(ev.action);
    };
    let gotMessage = false;
    let w = null;
    try {
      w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      w.onmessage = e => { gotMessage = true; onMsg(e.data); };
    } catch (e) { w = null; }
    // Fallback: poll from the page itself if the worker never reports back.
    setTimeout(() => {
      if (gotMessage) return;
      if (w) w.terminate();
      let seq = -1;
      const poll = async () => {
        try {
          const r = await fetch(`http://127.0.0.1:${HK_PORT}/poll?since=${Math.max(seq, 0)}`, { cache: 'no-store' });
          const j = await r.json();
          onMsg({ ok: true, first: seq < 0 || j.seq < seq, data: j });
          seq = j.seq;
          setTimeout(poll, 200);
        } catch (e) { onMsg({ ok: false }); setTimeout(poll, 3000); }
      };
      poll();
    }, 5000);
  }
  function openHotkeys() {
    const rows = HK.keys.map(k => `<tr><td>${esc(prettyCombo(k.combo))}</td><td>${esc(HK_LABEL[k.action] || k.action)}${k.ok === false ? ` <span class="bad">· not working: ${esc(k.error || 'key taken')}</span>` : ''}</td></tr>`).join('');
    dlgShell('#dlgHelp', 'Hotkeys', `
      <p>${HK.on ? '<b style="color:var(--good)">On.</b> These work while Deadlock is in front.' : '<b style="color:var(--bad)">Off.</b> Open the board from the <b>Deadlock Board</b> desktop shortcut to turn them on (it starts a small helper that listens for these keys).'}</p>
      <table class="hk-table">${rows}</table>
      <h3>Notes</h3>
      <ul class="help">
        <li>Click the board once after opening it, so Chrome lets it play sound.</li>
        <li>Chrome only opens the floating Next Up window from a click (Start or Float Next Up), never from a hotkey.</li>
        <li>"Your team" is the team at the bottom of the map. Press <b>Flip</b> if you're playing ${esc(S.game.teams.sapphire.name)}.</li>
        <li>To change a key, edit <code>hotkeys.json</code> in the Deadlock Board folder (for example <code>"ctrl+alt+f5"</code>), then close the board and reopen it from the shortcut.</li>
        <li>The helper only talks to this board on your PC (127.0.0.1). It never touches the game, and it closes itself about a minute and a half after you close the board.</li>
      </ul>`);
  }

  // ---------- boot ----------
  let view;
  buildGame();
  buildMarkers();
  applyAudioSettings();
  $('#patchBadge').textContent = S.game.patch.name + ' · map build ' + DLB_MAP.source.build;

  view = window.DLB_MAPVIEW($('#map'), {
    game: () => S.game,
    markers: () => S.markers,
    match: () => S.match,
    isGod: () => S.god,
    isDraw: () => S.draw,
    drawColor: () => S.drawColor,
    bgImage: () => S.overrides.bg,
    closePop,
    iconSet: () => S.settings.iconSet || 'minimap',
    titleFor(m) { const t = markerTitle(m); return t.title + (t.sub ? ' · ' + t.sub : ''); },
    moveHero(i, u, v) { S.heroes[i].u = u; S.heroes[i].v = v; drawHeroes(); },
    heroDropped(i) {
      // A hero covers the lane it was dropped nearest to (used for push windows).
      const h = S.heroes[i];
      if (h) { let best = Infinity; for (const l of DLB_MAP.lanes) { const p = view.projectToLane(l.key, h.u, h.v); if (p.d < best) { best = p.d; h.lane = l.key; } } renderLanes(false); }
      A.unlock(); A.play('waves'); autosave(true);
    },
    heroClick,
    heroDbl,
    heroContext,
    moveFront(lane, s) { S.fronts[lane] = s; S.laneStates[lane] = { mode: 'manual', team: 'amber' }; view.drawFronts(S.fronts, S.laneStates); renderLanes(false); },
    frontDropped() { autosave(true); },
    markerClick,
    markerMoved(id, u, v) { editMarker(id, { u, v }); },
    backgroundClick(u, v, e) {
      S.selected = null; S.selHero = -1; renderInspector(); drawHeroes();
      // A click on (or right next to) a lane opens that lane's editor.
      let best = null;
      for (const l of DLB_MAP.lanes) { const p = view.projectToLane(l.key, u, v); if (!best || p.d < best.d) best = Object.assign({ key: l.key }, p); }
      if (best && best.d < 0.02 && !S.god && !S.draw) openLaneEditor(best.key, e, best.s);
    },
    laneTroops: () => S.laneTroops,
    contextMenu,
    drawDone(pts) { S.drawings.push({ pts, color: S.drawColor }); view.drawDrawings(S.drawings); autosave(true); },
    redrawScaled() { if (!view) return; if (S.heroes) drawHeroes(); if (S.fronts && S.match) { view.drawFronts(S.fronts, S.laneStates); } },
  });
  computeGuardians();
  for (const l of DLB_MAP.lanes) { S.fronts[l.key] = 0.5; S.laneStates[l.key] = { mode: 'even', team: 'amber' }; }
  resetLaneTroops();
  if (!restore()) newMatch(true);
  setMode(S.mode);
  $('#speed').value = String(S.clock.speed);
  (S.selHero = -1, drawHeroes());
  view.drawDrawings(S.drawings);
  renderLineup();
  renderLanes(true);
  renderClockButtons();
  applyStatic();
  if (LOCAL) A.probeFolder(() => {});
  tick(true);
  A.startTicker(() => tick(false), 200);
  requestAnimationFrame(anim);

  // ---------- controls ----------
  $('#btnPlay').onclick = () => (S.clock.running ? pause() : start());
  $('#btnBack').onclick = e => seek(clockT() - (e.shiftKey ? 10 : 1));
  $('#btnFwd').onclick = e => seek(clockT() + (e.shiftKey ? 10 : 1));
  $('#speed').onchange = e => setSpeed(Number(e.target.value));
  $('#btnSet').onclick = () => {
    const t = E.parseTime($('#setTime').value);
    if (t === null) { toast('Type a time like 4:32'); return; }
    seek(t);
    $('#setTime').value = '';
  };
  $('#setTime').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnSet').click(); });
  $('#btnReset').onclick = () => {
    if (S.match.t > 0 && !confirm('Start a new match from 0:00? Timers, heroes and drawings reset.')) return;
    pause();
    newMatch(true);
    (S.selHero = -1, drawHeroes());
    view.drawDrawings(S.drawings);
    renderLineup();
    renderLanes(true);
    renderClockButtons();
    tick(true);
    autosave(true);
  };
  $('#scrub').oninput = e => seek(Number(e.target.value));
  document.querySelectorAll('.mode button').forEach(b => b.onclick = () => { setMode(b.dataset.mode); tick(true); });
  $('#btnFlip').onclick = () => { view.setFlip(!view.isFlipped()); $('#btnFlip').classList.toggle('on', view.isFlipped()); applyStatic(); view.drawDrawings(S.drawings); tick(true); autosave(true); };
  $('#btnFlip').classList.toggle('on', view.isFlipped());
  $('#btnDraw').onclick = () => { S.draw = !S.draw; $('#btnDraw').classList.toggle('on', S.draw); $('#map').classList.toggle('drawing', S.draw); };
  $('#btnHotkeys').onclick = openHotkeys;
  $('#btnFloat').onclick = () => (PIP.win ? closePip() : openPip(false));
  if (!pipSupported()) $('#btnFloat').title = 'Needs Chrome 116 or newer';
  $('#nextUp').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) openNextInfo(b.dataset.key, $('#nextUp')); });
  $('#btnPatch').onclick = openPatchDialog;
  if (LOCAL) {
    startHotkeyClient();
    setTimeout(() => checkPatches(false), 2500);
    setInterval(() => checkPatches(false), 30 * 60 * 1000);
  } else {
    $('#btnHotkeys').hidden = true;
  }
  const hideChip = () => { A.unlock(); $('#soundChip').hidden = true; };
  $('#soundChip').onclick = hideChip;
  document.addEventListener('pointerdown', hideChip, { once: true });
  document.addEventListener('keydown', hideChip, { once: true });
  $('#btnLayers').onclick = openLayers;
  $('#btnSettings').onclick = openSettings;
  $('#btnHelp').onclick = openHelp;
  $('#btnGod').onclick = () => setGod(!S.god);
  $('#zIn').onclick = () => view.zoomAt(1 / 1.3);
  $('#zOut').onclick = () => view.zoomAt(1.3);
  $('#zFit').onclick = () => view.fit();
  $('#btnResetHeroes').onclick = () => { resetHeroes(true); (S.selHero = -1, drawHeroes()); renderLineup(); autosave(true); };
  $('#lineup').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) heroClick(Number(b.dataset.i)); });
  $('#lineup').addEventListener('dblclick', e => { const b = e.target.closest('[data-i]'); if (b) heroDbl(Number(b.dataset.i)); });
  $('#lineup').addEventListener('contextmenu', e => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); heroContext(Number(b.dataset.i), e); } });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.pop') && !e.target.closest('#map')) closePop(); });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea') || document.querySelector('dialog[open]')) return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); $('#btnPlay').click(); }
    else if (k === 'ArrowLeft') seek(clockT() - (e.shiftKey ? 10 : 1));
    else if (k === 'ArrowRight') seek(clockT() + (e.shiftKey ? 10 : 1));
    else if (k === 'f' || k === 'F') $('#btnFlip').click();
    else if (k === 'd' || k === 'D') $('#btnDraw').click();
    else if (k === 'g' || k === 'G') $('#btnGod').click();
    else if (k === 'h' || k === 'H') openHelp();
    else if (k === 'Escape') closePop();
  });
  document.addEventListener('pointerdown', () => A.unlock(), { once: true });
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
  window.addEventListener('beforeunload', () => autosave(true));
  window.DLB_APP = S; // handy for debugging in the console
})();
