// Deadlock Board engine: match clock rules, spawn state and alerts. No DOM here, so tests can run it in Node.
(function (root) {
  'use strict';

  const AFTER_CLEAR = ['camp_small', 'camp_medium', 'camp_large', 'sinners', 'snack', 'crate', 'heavy_crate', 'buff_box'];

  // Board markers = generated map points + extra data (heavy crates, vents, camp names) + god mode edits.
  function mergeMarkers(points, extra, ov, fixes) {
    ov = ov || {};
    fixes = fixes || {};
    const removed = new Set([...(ov.removed || []), ...(fixes.retired || [])]);
    const kindFix = fixes.kind || {};
    const edits = ov.markers || {};
    const ex = (extra && extra.markers) || {};
    const list = [];
    for (const p of points) {
      const [id, kind, u, v, z, team, lane, area, camp, side] = p;
      if (removed.has(id)) continue;
      list.push(Object.assign({ id, kind: kindFix[id] || kind, u, v, z: z || 0, team, lane, area, camp, side }, ex[id] || {}, edits[id] || {}));
    }
    for (const a of (extra && extra.added) || []) if (!removed.has(a.id)) list.push(Object.assign({ z: 0 }, a, edits[a.id] || {}));
    for (const a of ov.added || []) if (!removed.has(a.id)) list.push(Object.assign({}, a, edits[a.id] || {}));
    return list;
  }
  const PRIORITY = ['midboss', 'urn_spawn', 'rift', 'powerup', 'camp_large', 'sinners', 'camp_medium', 'camp_small', 'heavy_crate', 'snack', 'buff_box', 'crate', 'events', 'waves'];
  const RESPAWN_ALERT_KINDS =['camp_small', 'camp_medium', 'camp_large', 'sinners', 'midboss'];
  const OBJECTIVES = ['guardian', 'walker', 'base_guardian', 'shrine', 'patron'];

  function fmt(sec) {
    const neg = sec < 0;
    let s = Math.floor(Math.abs(sec) + 1e-6);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    s = s % 60;
    const body = (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
    return (neg ? '-' : '') + body;
  }

  function parseTime(text) {
    const t = String(text).trim();
    if (!t) return null;
    const parts = t.split(':').map(Number);
    if (parts.some(n => !isFinite(n) || n < 0)) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  function waveInterval(troopers, t) {
    let every = troopers.intervals[0].every;
    for (const iv of troopers.intervals) if (t >= iv.from) every = iv.every;
    return every;
  }

  // All wave spawn times in [from, to].
  function waveTimes(troopers, from, to) {
    const out = [];
    let t = troopers.firstWaveAt;
    let guard = 0;
    while (t <= to && guard++ < 100000) {
      if (t >= from) out.push(t);
      t += waveInterval(troopers, t);
    }
    return out;
  }

  function nextWave(troopers, now) {
    let t = troopers.firstWaveAt;
    let guard = 0;
    while (t <= now && guard++ < 100000) t += waveInterval(troopers, t);
    return t;
  }

  function composition(troopers, t) {
    let units = troopers.composition[0].units;
    for (const c of troopers.composition) if (t >= c.from) units = c.units;
    return units;
  }

  // Index of the latest occurrence at or before now, or -1.
  function periodicIndex(first, every, now) {
    if (now < first) return -1;
    return Math.floor((now - first) / every + 1e-9);
  }

  function periodicNext(first, every, now) {
    const n = periodicIndex(first, every, now);
    return first + (n + 1) * every;
  }

  function breakableRule(marker, rules) {
    for (const r of rules || []) {
      const m = r.match || {};
      const z = marker.z || 0;
      if (m.area && marker.area !== m.area) continue;
      if (m.zMin !== undefined && z < m.zMin) continue;
      if (m.zMax !== undefined && z > m.zMax) continue;
      if (m.nearCenter !== undefined && Math.hypot(marker.u - 0.5, marker.v - 0.5) > m.nearCenter) continue;
      return r;
    }
    return null;
  }

  // Seconds a hero who dies at match time t stays dead (game.respawn: straight line between curve points, capped).
  function respawnTime(game, t, byUnit) {
    const r = game.respawn;
    const c = r.curve;
    let s;
    if (t <= c[0][0]) s = c[0][1];
    else {
      let i = 1;
      while (i < c.length - 1 && t > c[i][0]) i++;
      const [t0, s0] = c[i - 1], [t1, s1] = c[i];
      s = s0 + (s1 - s0) * (t - t0) / (t1 - t0);
    }
    return Math.round(Math.min(r.cap, s) + (byUnit ? r.unitPenalty : 0));
  }

  function midbossRespawn(seq, deaths) {
    return seq[Math.min(Math.max(deaths, 1), seq.length) - 1];
  }

  // Small seeded random generator so a simulated match can be saved and replayed.
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function rollRift(rule, seed, count) {
    const r = rng(seed);
    const out = [];
    let t = rule.first + (r() * 2 - 1) * rule.jitter;
    for (let i = 0; i < count; i++) {
      out.push({ at: Math.round(t), side: r() < 0.5 ? 'york' : 'greenwich' });
      t += rule.every + (r() * 2 - 1) * rule.jitter;
    }
    return out;
  }

  class Match {
    // game: DLB_GAME; markers: [{id, kind, u, v, z, team, lane, area, camp, side, first?, respawn?}]
    constructor(game, markers, opts) {
      opts = opts || {};
      this.game = game;
      this.t = 0;
      this.riftMode = opts.riftMode || 'window'; // 'window' = real match, 'sim' = rolled
      this.seed = opts.seed || Math.floor(Math.random() * 1e9);
      this.rift = rollRift(game.spawns.rift, this.seed, 12);
      this.riftClaims = {}; // index -> time captured
      this.powerClaims = {}; // spawner id -> time claimed
      this.urnClaims = {}; // occurrence index -> time taken
      this.midboss = { deaths: 0, nextAt: game.spawns.midboss.first, killer: null };
      this.rejuv = null; // {team, until}
      this.fired = new Set();
      this.ents = new Map();
      this.setMarkers(markers);
    }

    ruleFor(m) {
      const base = this.game.spawns[m.kind] || {};
      let first = base.first;
      let respawn = base.respawn;
      let ruleName = null;
      if (m.kind === 'crate' || m.kind === 'buff_box') {
        const br = breakableRule(m, this.game.breakableRules);
        if (br) { first = br.first; respawn = br.respawn; ruleName = br.name; }
      }
      if (m.first !== undefined && m.first !== null && m.first !== '') first = Number(m.first);
      if (m.respawn !== undefined && m.respawn !== null && m.respawn !== '') respawn = Number(m.respawn);
      return { first, respawn, ruleName };
    }

    setMarkers(markers) {
      const old = this.ents;
      this.ents = new Map();
      for (const m of markers) {
        const prev = old.get(m.id);
        const e = { id: m.id, m };
        if (AFTER_CLEAR.includes(m.kind)) {
          const r = this.ruleFor(m);
          e.first = r.first;
          e.respawn = r.respawn;
          e.ruleName = r.ruleName;
          e.nextAt = prev && prev.cleared ? prev.nextAt : r.first;
          e.cleared = prev ? prev.cleared : 0;
        } else if (OBJECTIVES.includes(m.kind)) {
          const o = this.game.objectives[m.kind] || {};
          e.maxHp = (o.hp || 1) + (o.hp2 || 0);
          e.hp = prev ? Math.min(prev.hp, e.maxHp) : e.maxHp;
        }
        this.ents.set(m.id, e);
      }
    }

    // ---- state ----
    isUp(id, t) {
      t = t === undefined ? this.t : t;
      const e = this.ents.get(id);
      if (!e) return false;
      const k = e.m.kind;
      if (AFTER_CLEAR.includes(k)) return t >= e.nextAt;
      if (k === 'midboss') return t >= this.midboss.nextAt;
      if (k === 'powerup') {
        const s = this.game.spawns.powerup;
        const n = periodicIndex(s.first, s.every, t);
        if (n < 0) return false;
        const occ = s.first + n * s.every;
        const c = this.powerClaims[id];
        return !(c !== undefined && c >= occ);
      }
      if (k === 'urn_spawn') return this.urnState(t).up && this.urnState(t).side === e.m.side;
      if (OBJECTIVES.includes(k)) return e.hp > 0;
      return true;
    }

    urnState(t) {
      const s = this.game.spawns.urn_spawn;
      const n = periodicIndex(s.first, s.every, t);
      if (n < 0) return { up: false, n: -1 };
      const occ = s.first + n * s.every;
      const side = s.sides[n % s.sides.length];
      const taken = this.urnClaims[n];
      return { up: taken === undefined || taken < occ, n, occ, side, landing: t < occ + (s.descend || 0) };
    }

    // Rift: in 'sim' mode the rolled times are used; in 'window' mode only the window is known.
    riftState(t) {
      const s = this.game.spawns.rift;
      if (this.riftMode === 'sim') {
        let idx = -1;
        for (let i = 0; i < this.rift.length; i++) if (this.rift[i].at <= t) idx = i;
        if (idx < 0) return { up: false, next: this.rift[0] };
        const cur = this.rift[idx];
        const captured = this.riftClaims[idx] !== undefined;
        return { up: !captured, idx, side: cur.side, at: cur.at, next: this.rift[idx + 1] };
      }
      // window mode: centre = first + n*every, window = centre +/- jitter
      let n = 0;
      while (s.first + n * s.every + s.jitter < t && n < 50) n++;
      const centre = s.first + n * s.every;
      const open = t >= centre - s.jitter && t <= centre + s.jitter;
      return { up: false, possible: open, idx: n, windowStart: centre - s.jitter, windowEnd: centre + s.jitter };
    }

    status(id, t) {
      t = t === undefined ? this.t : t;
      const e = this.ents.get(id);
      if (!e) return null;
      const k = e.m.kind;
      if (AFTER_CLEAR.includes(k)) {
        const up = t >= e.nextAt;
        return { up, nextAt: up ? null : e.nextAt, first: e.first, respawn: e.respawn, cleared: e.cleared, ruleName: e.ruleName };
      }
      if (k === 'midboss') {
        const up = t >= this.midboss.nextAt;
        return { up, nextAt: up ? null : this.midboss.nextAt, deaths: this.midboss.deaths };
      }
      if (k === 'powerup') {
        const s = this.game.spawns.powerup;
        return { up: this.isUp(id, t), nextAt: periodicNext(s.first, s.every, t) };
      }
      if (k === 'urn_spawn') {
        const u = this.urnState(t);
        const s = this.game.spawns.urn_spawn;
        const nextN = u.n + 1;
        // The site on the other side is where this urn gets delivered.
        return { up: u.up && u.side === e.m.side, landing: u.landing && u.side === e.m.side, deliver: u.up && u.side !== e.m.side,
          walking: u.up && u.side === e.m.side && t >= u.occ + (s.walksAfter || 1e9), nextAt: s.first + nextN * s.every, nextSide: s.sides[nextN % s.sides.length] };
      }
      if (k === 'rift') {
        const r = this.riftState(t);
        if (this.riftMode === 'sim') {
          const mine = r.side === (e.m.u < 0.5 ? 'york' : 'greenwich');
          return { up: r.up && mine, nextAt: r.next ? r.next.at : null };
        }
        return { up: false, possible: r.possible, nextAt: r.windowStart > t ? r.windowStart : null, windowEnd: r.windowEnd };
      }
      if (OBJECTIVES.includes(k)) return { up: e.hp > 0, hp: e.hp, maxHp: e.maxHp };
      return { up: true };
    }

    // ---- actions ----
    act(id, action, arg) {
      const e = this.ents.get(id);
      if (!e) return false;
      const t = this.t;
      const k = e.m.kind;
      if (AFTER_CLEAR.includes(k)) {
        if (action === 'clear') {
          e.nextAt = t + e.respawn;
          e.cleared++;
          this.forget(k);
          return true;
        }
        if (action === 'restore') { e.nextAt = Math.min(e.nextAt, t); return true; }
      }
      if (k === 'midboss') {
        if (action === 'kill') {
          this.midboss.deaths++;
          this.midboss.nextAt = t + midbossRespawn(this.game.spawns.midboss.respawnSeq, this.midboss.deaths);
          this.midboss.killer = arg || null;
          if (arg) this.rejuv = { team: arg, until: t + this.game.rejuv.buffSeconds, tokens: this.game.rejuv.crystals };
          this.forget('midboss');
          return true;
        }
        if (action === 'restore') { this.midboss.nextAt = t; return true; }
      }
      if (k === 'powerup' && action === 'claim') { this.powerClaims[id] = t; return true; }
      if (k === 'urn_spawn' && action === 'claim') {
        const u = this.urnState(t);
        if (u.n >= 0) this.urnClaims[u.n] = t;
        return true;
      }
      if (k === 'rift' && action === 'claim') {
        const r = this.riftState(t);
        if (r.idx !== undefined && r.idx >= 0) this.riftClaims[r.idx] = t;
        return true;
      }
      if (OBJECTIVES.includes(k)) {
        if (action === 'damage') { e.hp = Math.max(0, Math.round(e.hp - e.maxHp * arg)); return true; }
        if (action === 'destroy') { e.hp = 0; return true; }
        if (action === 'restore') { e.hp = e.maxHp; return true; }
      }
      return false;
    }

    // A hero on `team` died: if that team holds Rejuvenator tokens, one is used and the hero revives (returns true).
    useRejuv(team) {
      const r = this.rejuv;
      if (!r || r.team !== team || this.t >= r.until) return false;
      if (r.tokens === undefined) r.tokens = this.game.rejuv.crystals;
      if (r.tokens <= 0) return false;
      r.tokens--;
      if (r.tokens === 0) r.until = this.t;  // all tokens used: the team loses the buff
      return true;
    }
    rejuvLeft(team) {
      const r = this.rejuv;
      if (!r || r.team !== team || this.t >= r.until) return 0;
      return r.tokens === undefined ? this.game.rejuv.crystals : r.tokens;
    }

    forget(kind) {
      // a new respawn time exists for this kind: allow its alert to fire
      for (const key of [...this.fired]) if (key.startsWith(kind + '@')) {
        const at = Number(key.split('@')[1].split('#')[0]);
        if (at > this.t) this.fired.delete(key);
      }
    }

    // ---- clock ----
    seek(t) {
      const back = t < this.t;
      this.t = Math.max(0, t);
      if (back) for (const key of [...this.fired]) {
        const at = Number(key.split('@')[1].split('#')[0]);
        if (at > this.t) this.fired.delete(key);
      }
    }

    // Upcoming spawns after now, grouped (e.g. all small camps at 2:00 become one line).
    upcoming(now, horizon) {
      now = now === undefined ? this.t : now;
      horizon = horizon === undefined ? 3600 : horizon;
      const g = this.game;
      const groups = new Map();
      const add = (kind, at, label, voice, extra) => {
        if (at === null || at === undefined || at <= now || at > now + horizon) return;
        const key = kind + '@' + Math.round(at * 10) / 10 + (extra && extra.tag ? '#' + extra.tag : '');
        let gr = groups.get(key);
        if (!gr) { gr = Object.assign({ key, kind, at, label, voice, count: 0, ids: [] }, extra || {}); groups.set(key, gr); }
        gr.count++;
        if (extra && extra.id) gr.ids.push(extra.id);
      };
      for (const e of this.ents.values()) {
        const k = e.m.kind;
        if (AFTER_CLEAR.includes(k) && e.nextAt > now) {
          const s = g.spawns[k];
          const respawn = e.cleared > 0;
          add(k, e.nextAt, s.label + (respawn ? ' respawn' : ''), s.voice + (respawn ? ' respawn' : ''), { respawn, id: e.id, tag: respawn ? 'r' : '', short: s.short || s.label });
        }
      }
      if (this.midboss.nextAt > now) add('midboss', this.midboss.nextAt, 'Mid-Boss respawns', 'Mid-Boss respawns', { respawn: true, short: 'Mid-Boss' });
      const p = g.spawns.powerup;
      add('powerup', periodicNext(p.first, p.every, now), p.label, p.voice, { short: p.short });
      const us = g.spawns.urn_spawn;
      const un = periodicIndex(us.first, us.every, now) + 1;
      const side = us.sides[un % us.sides.length];
      const sideName = (g.lanes[side] || {}).name || side;
      add('urn_spawn', us.first + un * us.every, us.label + ' (' + sideName + ' side)', us.voice + ' on ' + sideName + ' side', { side, short: (us.short || 'Urn') + ' ' + sideName });
      const rs = g.spawns.rift;
      if (this.riftMode === 'sim') {
        const nx = this.rift.find(r => r.at > now);
        if (nx) add('rift', nx.at, rs.label + ' (' + (g.lanes[nx.side] || {}).name + ' side)', rs.voice, { side: nx.side, short: rs.short });
      } else {
        let n = 0;
        while (rs.first + n * rs.every - rs.jitter <= now && n < 50) n++;
        add('rift', rs.first + n * rs.every - rs.jitter, rs.label + ' window opens', rs.voice + ' window opens', { window: true, windowEnd: rs.first + n * rs.every + rs.jitter, short: rs.short });
      }
      for (const ev of g.events || []) add('events', ev.at, ev.label, ev.voice, { tag: ev.id, eventAlert: ev.alert, short: ev.voice });
      add('waves', nextWave(g.troopers, now), 'Trooper wave', 'Trooper wave', { short: 'Wave' });
      // Same time: the bigger objective first (the Next Up card shows the first one).
      const rank = k => { const i = PRIORITY.indexOf(k); return i < 0 ? PRIORITY.length : i; };
      return [...groups.values()].sort((a, b) => a.at - b.at || rank(a.kind) - rank(b.kind));
    }

    // Alerts that should fire now: upcoming items within `lead` seconds that are switched on.
    dueAlerts(lead, enabled) {
      const out = [];
      for (const item of this.upcoming(this.t, lead + 0.001)) {
        if (this.fired.has(item.key)) continue;
        if (!this.alertOn(item, enabled)) continue;
        this.fired.add(item.key);
        out.push(item);
      }
      return out;
    }

    alertOn(item, enabled) {
      if (item.kind === 'events') return !!enabled.events && item.eventAlert !== false;
      if (!enabled[item.kind]) return false;
      if (item.respawn) return !!enabled.respawns && RESPAWN_ALERT_KINDS.includes(item.kind);
      return true;
    }

    toJSON() {
      const ents = {};
      for (const e of this.ents.values()) {
        if (e.cleared) ents[e.id] = { nextAt: e.nextAt, cleared: e.cleared };
        else if (e.hp !== undefined && e.hp !== e.maxHp) ents[e.id] = { hp: e.hp };
      }
      return {
        t: this.t, riftMode: this.riftMode, seed: this.seed, riftClaims: this.riftClaims, powerClaims: this.powerClaims,
        urnClaims: this.urnClaims, midboss: this.midboss, rejuv: this.rejuv, ents,
      };
    }

    load(s) {
      if (!s) return;
      this.t = s.t || 0;
      this.riftMode = s.riftMode || this.riftMode;
      if (s.seed) { this.seed = s.seed; this.rift = rollRift(this.game.spawns.rift, this.seed, 12); }
      this.riftClaims = s.riftClaims || {};
      this.powerClaims = s.powerClaims || {};
      this.urnClaims = s.urnClaims || {};
      this.midboss = s.midboss || this.midboss;
      this.rejuv = s.rejuv || null;
      for (const [id, v] of Object.entries(s.ents || {})) {
        const e = this.ents.get(id);
        if (!e) continue;
        if (v.nextAt !== undefined) { e.nextAt = v.nextAt; e.cleared = v.cleared; }
        if (v.hp !== undefined) e.hp = v.hp;
      }
      // Don't replay alerts for things already in the past.
      if (this.t > 0) for (const item of this.upcoming(0, this.t)) this.fired.add(item.key);
    }
  }

  const api = { mergeMarkers, respawnTime, fmt, parseTime, waveInterval, waveTimes, nextWave, composition, periodicIndex, periodicNext, breakableRule, midbossRespawn, rollRift, Match, AFTER_CLEAR, OBJECTIVES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DLB_ENGINE = api;
})(typeof window !== 'undefined' ? window : globalThis);
