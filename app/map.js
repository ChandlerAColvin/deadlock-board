// Deadlock Board map: draws the map in SVG and handles zoom, pan, dragging and drawing.
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  // Icons share a -16..16 box. currentColor = team colour where it matters.
  const SYMBOLS = {
    guardian: '<path d="M-7,14V0L-10,-3V-7H10V-3L7,0V14Z" fill="currentColor" stroke="#05080b" stroke-width="1.6"/><rect x="-4" y="-5" width="8" height="3" fill="#05080b" opacity=".55"/><path d="M0,-16C5,-11 5,-8 0,-6C-5,-8 -5,-11 0,-16Z" fill="#ffcf6e" stroke="#05080b" stroke-width=".8"/>',
    walker: '<path d="M-8,5L-14,15M-3,6L-5,15M3,6L5,15M8,5L14,15" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M-13,-7H13L10,6H-10Z" fill="currentColor" stroke="#05080b" stroke-width="1.6"/><path d="M-13,-2L-16,5M13,-2L16,5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M0,-16C5,-12 5,-9 0,-7C-5,-9 -5,-12 0,-16Z" fill="#ffcf6e" stroke="#05080b" stroke-width=".8"/>',
    base_guardian: '<path d="M-9,-7H9V2C9,9 0,13 0,13C0,13 -9,9 -9,2Z" fill="currentColor" stroke="#05080b" stroke-width="1.6"/><path d="M0,-15C4,-11 4,-9 0,-7C-4,-9 -4,-11 0,-15Z" fill="#ffcf6e"/>',
    shrine: '<path d="M0,-15L7,-2L5,14H-5L-7,-2Z" fill="currentColor" stroke="#05080b" stroke-width="1.6"/><path d="M0,-7L3,-1L0,6L-3,-1Z" fill="#fff" opacity=".8"/>',
    patron: '<circle r="15" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"/><circle r="11" fill="currentColor" stroke="#05080b" stroke-width="1.6"/><path d="M-7,-3L-4,-8L0,-4L4,-8L7,-3Z" fill="#fff" opacity=".85"/><circle cy="3" r="3.5" fill="#fff" opacity=".9"/>',
    midboss: '<circle r="14" fill="#0b0f13" stroke="#ffcf6e" stroke-width="2.4"/><path d="M0,-11L3,-3L11,0L3,3L0,11L-3,3L-11,0L-3,-3Z" fill="#ffcf6e"/>',
    camp_small: '<path d="M0,-11L11,8H-11Z" fill="#3fd6c6" stroke="#05080b" stroke-width="1.6"/>',
    camp_medium: '<path d="M0,-13L11,5H-11Z" fill="#3fd6c6" stroke="#05080b" stroke-width="1.6"/><path d="M-10,10H10" stroke="#3fd6c6" stroke-width="3"/>',
    camp_large: '<path d="M0,-15L11,3H-11Z" fill="#3fd6c6" stroke="#05080b" stroke-width="1.6"/><path d="M-10,8H10M-10,13H10" stroke="#3fd6c6" stroke-width="3"/>',
    sinners: '<rect x="-9" y="-13" width="18" height="26" rx="4" fill="#ffc93a" stroke="#05080b" stroke-width="1.6"/><rect x="-6" y="-8" width="12" height="7" rx="1.5" fill="#24170a"/><text y="10" text-anchor="middle" font-size="10" font-weight="800" fill="#24170a">$</text>',
    urn_spawn: '<path d="M-6,-13H6V-10C12,-6 12,8 5,13H-5C-12,8 -12,-6 -6,-10Z" fill="#8ef0ff" stroke="#05080b" stroke-width="1.6"/><path d="M-6,-2H6" stroke="#05080b" stroke-width="1.5" opacity=".5"/>',
    urn_dropoff: '<circle r="13" fill="none" stroke="#8ef0ff" stroke-width="2.4" stroke-dasharray="4 3"/><path d="M0,-8V5M-5,1L0,7L5,1" stroke="#8ef0ff" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    powerup: '<path d="M0,-14L14,0L0,14L-14,0Z" fill="#4fe3ff" stroke="#05080b" stroke-width="1.6"/><path d="M0,-6L6,0L0,6L-6,0Z" fill="#05191d"/>',
    rift: '<circle r="13" fill="#2a1240" stroke="#c77dff" stroke-width="2.4"/><path d="M0,0C0,-4 5,-4 5,0C5,6 -6,6 -6,0C-6,-8 8,-9 9,0" fill="none" stroke="#e5c2ff" stroke-width="2"/>',
    snack: '<circle cy="2" r="9" fill="#7ee08a" stroke="#05080b" stroke-width="1.6"/><path d="M0,-6C2,-11 6,-11 7,-9C5,-6 2,-6 0,-6Z" fill="#3a8a43"/>',
    crate: '<rect x="-8" y="-8" width="16" height="16" rx="2" fill="#b98a4a" stroke="#05080b" stroke-width="1.6"/><path d="M-8,-8L8,8M8,-8L-8,8" stroke="#05080b" stroke-width="1" opacity=".45"/>',
    heavy_crate: '<rect x="-10" y="-9" width="20" height="18" rx="2" fill="#2a9d8f" stroke="#05080b" stroke-width="1.6"/><rect x="-7" y="-6" width="14" height="12" fill="none" stroke="#bff3ea" stroke-width="1.6"/><rect x="-3" y="-2" width="6" height="5" rx="1" fill="#ffcf6e" stroke="#05080b" stroke-width=".8"/>',
    vent: '<rect x="-10" y="2" width="20" height="9" rx="2" fill="#5d6c7a" stroke="#05080b" stroke-width="1.4"/><path d="M-6,4V9M-2,4V9M2,4V9M6,4V9" stroke="#05080b" stroke-width="1.2"/><path d="M-5,-1C-8,-5 -2,-7 -5,-12M1,-1C-2,-5 4,-7 1,-12M7,-1C4,-5 10,-7 7,-12" fill="none" stroke="#dfe8ef" stroke-width="1.8" stroke-linecap="round"/>',
    buff_box: '<rect x="-8" y="-8" width="16" height="16" rx="3" fill="#b48cff" stroke="#05080b" stroke-width="1.6"/><path d="M0,-5V5M-5,0H5" stroke="#1b0b33" stroke-width="2.4"/>',
    shop: '<rect x="-10" y="-6" width="20" height="17" rx="3" fill="#e8d7a8" stroke="#05080b" stroke-width="1.6"/><path d="M-5,-6C-5,-13 5,-13 5,-6" fill="none" stroke="#e8d7a8" stroke-width="2.4"/><text y="8" text-anchor="middle" font-size="11" font-weight="800" fill="#2a2210">$</text>',
    teleporter: '<circle r="11" fill="none" stroke="#c77dff" stroke-width="3"/><circle r="4" fill="#c77dff"/>',
    rope: '<path d="M0,-13V13" stroke="#c8b48a" stroke-width="2.6"/><circle cy="-13" r="3" fill="#c8b48a"/>',
    bell: '<path d="M-9,7C-8,-2 -7,-10 0,-10C7,-10 8,-2 9,7Z" fill="#ffcf6e" stroke="#05080b" stroke-width="1.4"/><circle cy="10" r="2.5" fill="#ffcf6e"/>',
    spawn: '<path d="M-10,12V-2L0,-11L10,-2V12Z" fill="currentColor" stroke="#05080b" stroke-width="1.6" opacity=".9"/>',
  };
  // Base icon size in map units at full map view.
  const SIZE = {
    guardian: 34, walker: 40, base_guardian: 24, shrine: 28, patron: 40, midboss: 38, spawn: 18,
    camp_small: 20, camp_medium: 22, camp_large: 24, sinners: 20, urn_spawn: 26, urn_dropoff: 26, powerup: 24,
    rift: 30, snack: 11, crate: 7, heavy_crate: 11, buff_box: 8, vent: 12, shop: 18, teleporter: 18, rope: 11, bell: 13,
  };
  // These are the "Classic" icons. app/icons.js adds other sets (window.DLB_ICON_SETS) that replace any of them.
  const BASE_SYMBOLS = Object.assign({}, SYMBOLS);
  const BASE_SIZE = Object.assign({}, SIZE);
  const OBJ =['guardian', 'walker', 'base_guardian', 'shrine', 'patron'];
  const TIMED = ['camp_small', 'camp_medium', 'camp_large', 'sinners', 'snack', 'crate', 'heavy_crate', 'buff_box'];

  window.DLB_MAPVIEW = function (svg, api) {
    const MAP = window.DLB_MAP;
    const GAME = () => api.game();
    let flip = false;
    let vb = { x: 0, y: 0, w: 1000, h: 1000 };
    const view = {};

    // ---------- geometry ----------
    const X = u => (flip ? 1 - u : u) * 1000;
    const Y = v => (flip ? 1 - v : v) * 1000;
    const toUV = (x, y) => [flip ? 1 - x / 1000 : x / 1000, flip ? 1 - y / 1000 : y / 1000];
    const unitsPerMeter = () => 1000 / (MAP.worldUnitsPerU * GAME().metersPerWorldUnit);
    view.metersToMap = m => m * unitsPerMeter();

    const lanes = {};
    for (const l of MAP.lanes) {
      const pts = l.path;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      lanes[l.key] = { key: l.key, pts, cum, len: cum[cum.length - 1] };
    }
    view.laneMeters = key => lanes[key].len * MAP.worldUnitsPerU * GAME().metersPerWorldUnit;
    view.lanePoint = function (key, s) {
      const L = lanes[key];
      const d = Math.max(0, Math.min(1, s)) * L.len;
      let i = 1;
      while (i < L.cum.length - 1 && L.cum[i] < d) i++;
      const seg = L.cum[i] - L.cum[i - 1] || 1;
      const f = (d - L.cum[i - 1]) / seg;
      const a = L.pts[i - 1], b = L.pts[i];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    // Points of the lane between two fractions of its length (0 = Hidden King end, 1 = Archmother end).
    view.laneSubPath = function (key, s0, s1) {
      const L = lanes[key];
      const a = Math.max(0, Math.min(1, Math.min(s0, s1))) * L.len;
      const b = Math.max(0, Math.min(1, Math.max(s0, s1))) * L.len;
      const out = [view.lanePoint(key, a / L.len)];
      for (let i = 1; i < L.pts.length - 1; i++) if (L.cum[i] > a && L.cum[i] < b) out.push(L.pts[i]);
      out.push(view.lanePoint(key, b / L.len));
      return out;
    };
    view.projectToLane = function (key, u, v) {
      const L = lanes[key];
      let best = { d: Infinity, s: 0 };
      for (let i = 1; i < L.pts.length; i++) {
        const a = L.pts[i - 1], b = L.pts[i];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy || 1e-9;
        const f = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / l2));
        const px = a[0] + dx * f, py = a[1] + dy * f;
        const d = Math.hypot(u - px, v - py);
        if (d < best.d) best = { d, s: (L.cum[i - 1] + f * (L.cum[i] - L.cum[i - 1])) / L.len };
      }
      return best;
    };

    // ---------- build ----------
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    let iconSet = null;
    // Switch icon set: rebuild the shared <symbol>s (also used by the side lists and the floating window).
    function useIconSet(name) {
      iconSet = (window.DLB_ICON_SETS || {})[name] || null;
      for (const k of Object.keys(SYMBOLS)) delete SYMBOLS[k];
      Object.assign(SYMBOLS, BASE_SYMBOLS, iconSet ? iconSet.symbols : {});
      for (const k of Object.keys(SIZE)) delete SIZE[k];
      Object.assign(SIZE, BASE_SIZE, iconSet ? iconSet.sizes : {});
      defs.querySelectorAll('symbol').forEach(s => s.remove());
      for (const [k, body] of Object.entries(SYMBOLS)) {
        if (!body) continue;
        const s = el('symbol', { id: 's-' + k, viewBox: '-16 -16 32 32', overflow: 'visible' }, defs);
        s.innerHTML = body;
      }
    }
    useIconSet(api.iconSet ? api.iconSet() : 'minimap');
    defs.insertAdjacentHTML('beforeend', '<pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25,0H0V25" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern>' +
      '<marker id="tparrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="#c77dff"/></marker>');
    const root = el('g', {}, svg);
    const L = {};
    for (const name of ['bg', 'labels', 'roads', 'push', 'zips', 'tele', 'routes', 'ground', 'mid', 'obj', 'rings', 'troops', 'fronts', 'draw', 'heroes', 'pings']) L[name] = el('g', { class: 'L-' + name }, root);
    view.layers = L;

    let markerEls = new Map();
    let iconK = 1;

    function buildStatic() {
      L.bg.innerHTML = '';
      el('rect', { x: -500, y: -500, width: 2000, height: 2000, fill: 'url(#grid)' }, L.bg);
      if (api.bgImage && api.bgImage()) {
        const b = api.bgImage();
        el('image', { href: b.src, x: b.x || 0, y: b.y || 0, width: (b.scale || 1) * 1000, height: (b.scale || 1) * 1000, opacity: b.opacity ?? 0.5, preserveAspectRatio: 'none', transform: flip ? 'rotate(180 500 500)' : '' }, L.bg);
      }
      // City plan drawn from the game's navigation mesh (tools/render_map.py): streets, buildings and roofs at true
      // scale. It lines up with the markers exactly (same world-to-map scale), and flips with the board.
      const plan = el('image', { href: 'assets/map-base.png', x: 0, y: 0, width: 1000, height: 1000, class: 'cityplan', preserveAspectRatio: 'none', transform: flip ? 'rotate(180 500 500)' : '' }, L.bg);
      plan.style.imageRendering = 'auto';
      // Soft colour washes so districts read at a glance (park green, docks water, team bases).
      const TINT = { 'Central Park': '#2f9e57', Docks: '#2a6f9e', 'Haunted Lot': '#7a4bb5', Chinatown: '#b53a3a', Theater: '#a8325e', Plaza: '#5a7da8',
        Campus: '#8a6a3a', Factory: '#a8552a', 'Stock Exchange': '#a8902a', 'Times Square': '#2aa8a8', 'Hidden King': '#f0a63c', Archmother: '#5b93f0',
        Downtown: '#4a5a6a', Uptown: '#4a5a6a', Brownstones: '#7a5a4a', 'Sunken Plaza': '#ffcf6e', Pit: '#4a5a6a' };
      for (const l of MAP.labels) {
        const c = TINT[l.text];
        if (!c) continue;
        const id = 'tint-' + l.text.replace(/\W/g, '');
        if (!defs.querySelector('#' + id)) defs.insertAdjacentHTML('beforeend', `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity=".2"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`);
        el('circle', { cx: X(l.u), cy: Y(l.v), r: l.tier === 0 ? 120 : 95, fill: `url(#${id})`, class: 'tint' }, L.bg);
      }
      L.labels.innerHTML = '';
      for (const l of MAP.labels) {
        const t = el('text', { x: X(l.u), y: Y(l.v), 'text-anchor': 'middle', 'font-size': l.tier === 0 ? 17 : 13, 'font-weight': 700, fill: '#ffffff', 'fill-opacity': l.tier === 0 ? 0.16 : 0.12, 'letter-spacing': 1.5 }, L.labels);
        t.textContent = l.text.toUpperCase();
      }
      L.roads.innerHTML = '';
      L.zips.innerHTML = '';
      const G = GAME();
      for (const l of MAP.lanes) {
        const d = 'M' + l.path.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L');
        const color = (G.lanes[l.key] || {}).color || l.color;
        // Without the city plan the lane is drawn as a road; with it, only a street-wide tint (about 9 m) so the real
        // street and the buildings beside it stay visible.
        el('path', { d, fill: 'none', stroke: color, 'stroke-opacity': 0.22, 'stroke-width': 30, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'lane-road' }, L.roads);
        el('path', { d, fill: 'none', stroke: '#141d26', 'stroke-width': 22, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'lane-road' }, L.roads);
        el('path', { d, fill: 'none', stroke: color, 'stroke-opacity': 0.14, 'stroke-width': 14, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'lane-tint' }, L.roads);
        el('path', { d, fill: 'none', stroke: color, 'stroke-opacity': 0.55, 'stroke-width': 1.2, 'stroke-dasharray': '2 6' }, L.roads);
      }
      for (const z of MAP.ziplines) {
        const color = (G.lanes[z.lane] || {}).color || '#888';
        const d = 'M' + z.path.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L');
        el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.4, 'stroke-opacity': 0.9, 'stroke-linejoin': 'round', class: 'zipline' }, L.zips);
      }
      drawRoutes();
      L.tele.innerHTML = '';
      for (const t of MAP.teleports) {
        el('line', { x1: X(t.from[0]), y1: Y(t.from[1]), x2: X(t.to[0]), y2: Y(t.to[1]), stroke: '#c77dff', 'stroke-opacity': 0.45, 'stroke-width': 1.5, 'stroke-dasharray': '5 6', 'marker-end': 'url(#tparrow)' }, L.tele);
      }
    }

    // Box routes (data/box-routes.js, from the game's navmesh). A line is solid at lane height, dashed where the
    // walk goes up a floor (stairs, a balcony), dotted where it goes below the street. The dot is where you leave
    // the lane, the arrow where you rejoin it.
    const ROUTE_BAND = 96; // units (2.4 m) above or below the lane before a stretch counts as another floor
    let routeEnds = [];
    function drawRoutes() {
      L.routes.innerHTML = '';
      routeEnds = [];
      const R = window.DLB_ROUTES;
      if (!R) return;
      const G = GAME();
      for (const r of R.routes) {
        const color = (G.lanes[r.lane] || {}).color || '#fff';
        const g = el('g', { class: 'route', 'data-route': r.id }, L.routes);
        const band = z => z - r.laneZ > ROUTE_BAND ? 1 : z - r.laneZ < -ROUTE_BAND ? -1 : 0;
        let floors = 0;
        let run = [r.pts[0]], cur = band(r.pts[0][2]);
        const flush = () => {
          if (run.length < 2) return;
          const d = 'M' + run.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L');
          el('path', { d, class: 'route-under', fill: 'none' }, g);
          el('path', { d, class: 'route-line' + (cur > 0 ? ' up' : cur < 0 ? ' down' : ''), fill: 'none', stroke: color }, g);
        };
        for (let i = 1; i < r.pts.length; i++) {
          const p = r.pts[i], b = band(p[2]);
          run.push(p);
          if (b !== cur) { flush(); run = [p]; cur = b; if (b !== 0) floors++; }
        }
        flush();
        const a = r.pts[0], z = r.pts[r.pts.length - 1], y = r.pts[r.pts.length - 2];
        // Jumps/mantles up and drops down (from the navmesh links): a small up or down chevron mid-step.
        for (const [k, dz] of r.moves || []) {
          const p = r.pts[k], q = r.pts[k + 1];
          const mv = el('path', { d: dz > 0 ? 'M-3.5,2L0,-2L3.5,2' : 'M-3.5,-2L0,2L3.5,-2', class: 'route-move', stroke: color }, g);
          routeEnds.push({ e: mv, x: (X(p[0]) + X(q[0])) / 2, y: (Y(p[1]) + Y(q[1])) / 2, rot: '' });
        }
        // The dot and arrow keep their size on screen like the icons do (see placeMarkers).
        const dot = el('circle', { r: 3.6, fill: color, stroke: '#05080b', 'stroke-width': 1.4 }, g);
        routeEnds.push({ e: dot, x: X(a[0]), y: Y(a[1]), rot: '' });
        const ang = Math.atan2(Y(z[1]) - Y(y[1]), X(z[0]) - X(y[0])) * 180 / Math.PI;
        const arrow = el('path', { d: 'M-5,-4.5L4,0L-5,4.5z', fill: color, stroke: '#05080b', 'stroke-width': 1.2 }, g);
        routeEnds.push({ e: arrow, x: X(z[0]), y: Y(z[1]), rot: ` rotate(${ang.toFixed(0)})` });
        const name = (G.lanes[r.lane] || {}).name || r.lane, half = (G.teams[r.side] || {}).name || r.side;
        const heights = r.pts.map(p => p[2] - r.laneZ);
        const up = Math.max(...heights), down = Math.min(...heights);
        const ups = (r.moves || []).filter(m => m[1] > 0), downs = (r.moves || []).filter(m => m[1] < 0);
        const mvTxt = (ups.length ? ` Jump or mantle up ${ups.map(m => Math.round(m[1] * GAME().metersPerWorldUnit) + ' m').join(', ')}.` : '') +
          (downs.length ? ` Drop down ${downs.map(m => Math.round(-m[1] * GAME().metersPerWorldUnit) + ' m').join(', ')}.` : '');
        const lvl = up > ROUTE_BAND ? ` Goes up about ${Math.round(up * GAME().metersPerWorldUnit)} m.` : down < -ROUTE_BAND ? ` Goes down about ${Math.round(-down * GAME().metersPerWorldUnit)} m.` : ' Stays at lane height.';
        el('title', {}, g).textContent = `${name} box run (${half} half): ${r.boxes.length} box${r.boxes.length > 1 ? 'es' : ''}${r.heavy ? ', ' + r.heavy + ' heavy' : ''}, ${r.lengthM} m lane to lane.${lvl}${mvTxt}`;
        // Hovering a route rings the boxes it breaks.
        g.addEventListener('mouseenter', () => {
          g.classList.add('hot');
          for (const id of r.boxes) {
            const m = markerEls.get(id);
            if (m) el('circle', { class: 'route-ring', cx: X(m.m.u), cy: Y(m.m.v), r: 8, stroke: color }, L.pings);
          }
        });
        g.addEventListener('mouseleave', () => { g.classList.remove('hot'); L.pings.querySelectorAll('.route-ring').forEach(e => e.remove()); });
      }
    }

    function layerFor(kind) {
      if (OBJ.includes(kind) || kind === 'spawn') return L.obj;
      if (['crate', 'heavy_crate', 'buff_box', 'vent', 'snack', 'rope', 'bell', 'shop', 'teleporter'].includes(kind)) return L.ground;
      return L.mid;
    }

    function buildMarkers() {
      for (const g of [L.ground, L.mid, L.obj]) g.innerHTML = '';
      markerEls = new Map();
      const G = GAME();
      const ctx = { myTeam: flip ? 'sapphire' : 'amber', game: G };
      for (const m of api.markers()) {
        const parent = layerFor(m.kind);
        const g = el('g', { class: 'mk k-' + m.kind + ((m.z || 0) < -50 ? ' under' : ''), 'data-id': m.id }, parent);
        const ring = el('circle', { r: 0, fill: 'none', stroke: '#ffb547', 'stroke-width': 2, opacity: 0 }, g);
        const s = SIZE[m.kind] || 14;
        const sym = m.team && SYMBOLS[m.kind + '_' + m.team] ? m.kind + '_' + m.team : SYMBOLS[m.kind] ? m.kind : 'crate';
        const use = el('use', { href: '#s-' + sym, x: -s / 2, y: -s / 2, width: s, height: s }, g);
        const color = iconSet && iconSet.colorFor ? iconSet.colorFor(m, ctx) : (m.team && G.teams[m.team] ? G.teams[m.team].color : null);
        if (color) use.style.color = color;
        // Icons like the Patron's horseshoe open toward the middle of the map, as in the game.
        if (iconSet && iconSet.faceCenter && iconSet.faceCenter.includes(m.kind) && Y(m.v) < 500) use.setAttribute('transform', 'rotate(180)');
        const bar = OBJ.includes(m.kind) ? el('rect', { x: -s / 2, y: s / 2 + 2, width: s, height: 3.5, rx: 1.5, fill: '#7ee08a', opacity: 0 }, g) : null;
        if (api.titleFor) el('title', {}, g).textContent = api.titleFor(m);
        const txt = el('text', { y: s / 2 + 11, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#fff', stroke: '#05080b', 'stroke-width': 3, 'paint-order': 'stroke' }, g);
        markerEls.set(m.id, { g, use, ring, bar, txt, m, s, last: '' });
      }
      placeMarkers();
    }

    function placeMarkers() {
      const k = Math.min(1, iconK * 1.6).toFixed(3);
      for (const r of routeEnds) r.e.setAttribute('transform', `translate(${r.x.toFixed(1)},${r.y.toFixed(1)}) scale(${k})${r.rot}`);
      for (const r of markerEls.values()) r.g.setAttribute('transform', `translate(${X(r.m.u).toFixed(1)},${Y(r.m.v).toFixed(1)}) scale(${iconK.toFixed(3)})`);
    }

    // ---------- dynamic ----------
    const BOXES = ['crate', 'heavy_crate', 'buff_box'];
    let boxLevel = 1;
    view.setBoxLevel = function (f) {
      boxLevel = f;
      svg.classList.toggle('box-glow', f > 1.5);
    };
    view.updateMarkers = function (t, lead, show) {
      const match = api.match();
      for (const r of markerEls.values()) {
        const k = r.m.kind;
        if (show && show[k] === false) { if (r.g.style.display !== 'none') r.g.style.display = 'none'; continue; }
        if (r.g.style.display === 'none') r.g.style.display = '';
        const st = match.status(r.m.id, t) || {};
        let opacity = 1, text = '', ring = 0, ringColor = '#ffb547';
        if (TIMED.includes(k) || k === 'midboss') {
          // 669 crates and buff containers: keep them quiet so camps and objectives stand out.
          if (k === 'crate' || k === 'buff_box') opacity = st.up ? 0.6 : 0.14;
          else if (!st.up) opacity = k === 'heavy_crate' ? 0.2 : k === 'sinners' ? 0.5 : 0.26;
          // Box brightness (Map layers): scales every crate and buff container, glowing when turned up.
          if (BOXES.includes(k)) opacity = Math.min(1, opacity * boxLevel);
          if (!st.up) {
            const left = st.nextAt - t;
            const quiet = k === 'crate' || k === 'buff_box' || k === 'snack' || k === 'heavy_crate';
            const showText = k === 'midboss' || st.cleared > 0 && k !== 'crate' && k !== 'buff_box' || (!quiet && left <= 60);
            if (showText) text = DLB_ENGINE.fmt(left);
            if (left <= lead && k !== 'crate' && k !== 'buff_box') ring = 1;
          }
          if (k === 'midboss' && match.rejuv && match.rejuv.until > t) {
            text = 'Rejuv ' + DLB_ENGINE.fmt(match.rejuv.until - t);
          }
        } else if (k === 'powerup') {
          if (st.up) { text = 'BUFF'; ring = 2; ringColor = '#4fe3ff'; }
          else { opacity = 0.3; const left = st.nextAt - t; if (left <= 60) text = DLB_ENGINE.fmt(left); if (left <= lead) ring = 1; }
        } else if (k === 'urn_spawn') {
          if (st.up) { text = st.landing ? 'URN LANDING' : st.walking ? 'URN WALKING' : 'URN HERE'; ring = 2; ringColor = '#8ef0ff'; }
          else if (st.deliver) { text = 'DELIVER HERE'; ring = 2; ringColor = '#ffd36e'; opacity = 0.85; }
          else {
            opacity = 0.35;
            const left = st.nextAt - t;
            if (st.nextSide === r.m.side && left <= 60) { text = DLB_ENGINE.fmt(left); if (left <= lead) ring = 1; }
          }
        } else if (k === 'rift') {
          if (st.up) { text = 'RIFT'; ring = 2; ringColor = '#c77dff'; }
          else if (st.possible) { text = 'RIFT?'; ring = 2; ringColor = '#c77dff'; opacity = 0.75; }
          else { opacity = 0.35; if (st.nextAt && st.nextAt - t <= 60) { text = DLB_ENGINE.fmt(st.nextAt - t); if (st.nextAt - t <= lead) ring = 1; } }
        } else if (OBJ.includes(k)) {
          if (st.hp <= 0) { opacity = 0.22; text = '✕'; }
          if (r.bar) {
            const f = st.maxHp ? st.hp / st.maxHp : 1;
            r.bar.setAttribute('opacity', f < 1 && f > 0 ? 1 : 0);
            r.bar.setAttribute('width', (r.s * f).toFixed(1));
            r.bar.setAttribute('fill', f > 0.5 ? '#7ee08a' : f > 0.25 ? '#ffb547' : '#ff6b57');
          }
        }
        const key = opacity + '|' + text + '|' + ring + ringColor;
        if (key === r.last) continue;
        r.last = key;
        r.use.style.opacity = opacity;
        r.txt.textContent = text;
        if (ring) {
          r.ring.setAttribute('r', r.s * 0.75);
          r.ring.setAttribute('stroke', ringColor);
          r.ring.setAttribute('opacity', 1);
          r.ring.setAttribute('class', ring === 1 ? 'soonring' : 'livering');
        } else r.ring.setAttribute('opacity', 0);
      }
    };

    // ---------- heroes ----------
    view.drawHeroes = function (heroes, selected) {
      L.heroes.innerHTML = '';
      const G = GAME();
      // Distance circles first, so every token sits above every circle. Radius is true distance on the map.
      heroes.forEach(h => {
        if (!h.ring || h.dead) return;
        const color = G.teams[h.team].color;
        const r = view.metersToMap(h.ring);
        el('circle', { class: 'hero-ring', cx: X(h.u).toFixed(1), cy: Y(h.v).toFixed(1), r: r.toFixed(1), fill: color, 'fill-opacity': 0.06, stroke: color, 'stroke-opacity': 0.85, 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }, L.heroes);
        const lab = el('text', { class: 'hero-ring-label', x: X(h.u).toFixed(1), y: (Y(h.v) - r - 3).toFixed(1), 'text-anchor': 'middle', 'font-size': (11 * iconK).toFixed(1), 'font-weight': 800, fill: color, stroke: '#05080b', 'stroke-width': 3 * iconK, 'paint-order': 'stroke' }, L.heroes);
        lab.textContent = h.ring + ' m';
      });
      heroes.forEach((h, i) => {
        const team = G.teams[h.team];
        const g = el('g', { class: 'hero', 'data-hero': i, transform: `translate(${X(h.u).toFixed(1)},${Y(h.v).toFixed(1)}) scale(${iconK.toFixed(3)})`, style: 'cursor:grab' }, L.heroes);
        el('circle', { r: 15, fill: '#05080b', opacity: 0.5, cy: 1.5 }, g);
        el('circle', { r: 13.5, fill: h.dead ? '#59636e' : team.color, stroke: i === selected ? '#ffffff' : '#05080b', 'stroke-width': i === selected ? 3.2 : 2 }, g);
        const t = el('text', { y: 4, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 900, fill: team.ink }, g);
        t.textContent = abbr(h.name);
        const n = el('text', { y: 25, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, fill: '#fff', stroke: '#05080b', 'stroke-width': 3, 'paint-order': 'stroke' }, g);
        n.textContent = h.name;
        if (h.dead) {
          el('path', { d: 'M-8,-8L8,8M8,-8L-8,8', stroke: '#fff', 'stroke-width': 3 }, g);
          // Respawn countdown above the token.
          if (h.left > 0) {
            const s = Math.ceil(h.left);
            const c = el('text', { class: 'respawn', y: -19, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 900, fill: '#ff8a7a', stroke: '#05080b', 'stroke-width': 3, 'paint-order': 'stroke' }, g);
            c.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
          }
        }
      });
    };
    function abbr(name) {
      const w = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
      if (w.length > 1 && w[0].toLowerCase() === 'the') w.shift();
      return (w.length > 1 ? w[0][0] + w[1][0] + (w[1][1] || '') : w[0].slice(0, 3)).toUpperCase();
    }
    view.abbr = abbr;

    // ---------- troopers, fronts, rings ----------
    view.drawTroops = function (t, fronts, on) {
      L.troops.innerHTML = '';
      if (!on) return;
      const G = GAME();
      const tr = G.troopers;
      const fight = 12;
      for (const key of Object.keys(lanes)) {
        const meters = view.laneMeters(key);
        const front = fronts[key];
        const maxTravel = meters / tr.walkSpeed + fight;
        const waves = DLB_ENGINE.waveTimes(tr, Math.max(0, t - maxTravel), t);
        for (const w of waves) {
          const units = DLB_ENGINE.composition(tr, w);
          const dist = (t - w) * tr.walkSpeed / meters;
          for (const team of ['amber', 'sapphire']) {
            const reach = team === 'amber' ? front : 1 - front;
            let s, op = 1;
            if (dist < reach) s = dist;
            else {
              const since = (dist - reach) * meters / tr.walkSpeed;
              if (since > fight) continue;
              s = reach;
              op = 1 - since / fight;
            }
            const pos = team === 'amber' ? s : 1 - s;
            const dir = team === 'amber' ? -1 : 1;
            units.forEach((u, i) => {
              const off = (i - (units.length - 1) / 2) * 0.008;
              const [pu, pv] = view.lanePoint(key, Math.max(0, Math.min(1, pos + dir * Math.abs(off) * 0.6)));
              const ox = (i % 2 ? 5 : -5) * iconK;
              const c = el('circle', { cx: (X(pu) + ox).toFixed(1), cy: (Y(pv) + (i - 1.5) * 3 * iconK).toFixed(1), r: (u === 'melee' ? 4.2 : 3.4) * iconK, fill: G.teams[team].color, stroke: u === 'medic' ? '#fff' : '#05080b', 'stroke-width': 1.1 * iconK, opacity: op.toFixed(2) }, L.troops);
              c.style.pointerEvents = 'none';
            });
          }
        }
      }
    };

    view.drawFronts = function (fronts, states) {
      L.fronts.innerHTML = '';
      L.rings.innerHTML = '';
      L.push.innerHTML = '';
      const G = GAME();
      const troops = (api.laneTroops && api.laneTroops()) || {};
      const line = pts => 'M' + pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L');
      for (const key of Object.keys(lanes)) {
        const [u, v] = view.lanePoint(key, fronts[key]);
        const st = states[key] || {};
        // How far the lane is pushed: each team's colour from its own base up to where the waves meet.
        for (const [team, s0, s1] of [['amber', 0, fronts[key]], ['sapphire', fronts[key], 1]]) {
          if (Math.abs(s1 - s0) < 0.002) continue;
          el('path', { d: line(view.laneSubPath(key, s0, s1)), fill: 'none', stroke: G.teams[team].color, 'stroke-opacity': 0.35, 'stroke-width': 8, 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' }, L.push);
        }
        // Troopers held at the front, when set in the lane editor.
        const tc = troops[key] || {};
        if (tc.amber != null || tc.sapphire != null) {
          for (const [team, dir] of [['amber', -1], ['sapphire', 1]]) {
            const n = tc[team] || 0;
            const perUnit = 1 / (lanes[key].len * 1000); // lane fraction per map unit
            for (let i = 0; i < n; i++) {
              const s = fronts[key] + dir * (17 + Math.floor(i / 2) * 8) * iconK * perUnit;
              const [pu, pv] = view.lanePoint(key, s);
              el('circle', { cx: (X(pu) + (i % 2 ? 4.5 : -4.5) * iconK).toFixed(1), cy: Y(pv).toFixed(1), r: 3.8 * iconK, fill: G.teams[team].color, stroke: '#05080b', 'stroke-width': 1.1 * iconK }, L.fronts);
            }
          }
          const lab = el('text', { x: X(u), y: Y(v) - 17 * iconK, 'text-anchor': 'middle', 'font-size': 12 * iconK, 'font-weight': 900, stroke: '#05080b', 'stroke-width': 3 * iconK, 'paint-order': 'stroke' }, L.fronts);
          lab.innerHTML = `<tspan fill="${G.teams.amber.color}">${tc.amber ?? '?'}</tspan><tspan fill="#fff"> v </tspan><tspan fill="${G.teams.sapphire.color}">${tc.sapphire ?? '?'}</tspan>`;
        }
        if (st.mode === 'freeze') {
          const r = view.metersToMap(G.troopers.soulOrbRangeM);
          el('circle', { cx: X(u), cy: Y(v), r, fill: '#ffb547', 'fill-opacity': 0.06, stroke: '#ffb547', 'stroke-width': 1.6, 'stroke-dasharray': '6 5' }, L.rings);
          const lt = el('text', { x: X(u), y: Y(v) - r - 4, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#ffb547', stroke: '#05080b', 'stroke-width': 3, 'paint-order': 'stroke' }, L.rings);
          lt.textContent = G.troopers.soulOrbRangeM + ' m soul range: keep them out';
        }
        const g = el('g', { class: 'front', 'data-front': key, transform: `translate(${X(u).toFixed(1)},${Y(v).toFixed(1)}) scale(${iconK.toFixed(3)})`, style: 'cursor:grab' }, L.fronts);
        el('circle', { r: 11, fill: '#0b1117', stroke: G.lanes[key].color, 'stroke-width': 2.6 }, g);
        el('path', { d: 'M-6,-6L6,6M6,-6L-6,6M-6,3L-3,6M6,3L3,6', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
        g.appendChild(document.createElementNS(NS, 'title')).textContent = G.lanes[key].name + ' wave front: drag along the lane';
      }
    };

    // Make a set of markers easy to find: pulse them and, if there are only a few, zoom to them.
    view.highlight = function (ids, zoomTo) {
      L.pings.querySelectorAll('.hl').forEach(e => e.remove());
      const pts = ids.map(id => markerEls.get(id)).filter(Boolean).map(r => [X(r.m.u), Y(r.m.v)]);
      for (const [x, y] of pts) {
        const c = el('circle', { class: 'hl', cx: x, cy: y, r: 14, fill: 'none', stroke: '#ffffff', 'stroke-width': 3 }, L.pings);
        c.innerHTML = '<animate attributeName="r" values="10;30;10" dur="1.2s" repeatCount="6"/><animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="6"/>';
      }
      setTimeout(() => L.pings.querySelectorAll('.hl').forEach(e => e.remove()), 7400);
      if (zoomTo && pts.length) {
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const pad = 90;
        let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
        const size = Math.max(320, x1 - x0, y1 - y0);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        vb = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
        applyVB();
      }
    };

    view.drawRange = function (m, meters) {
      const old = L.rings.querySelector('.sel-range');
      if (old) old.remove();
      if (!m || !meters) return;
      el('circle', { class: 'sel-range', cx: X(m.u), cy: Y(m.v), r: view.metersToMap(meters), fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.5, 'stroke-width': 1.4, 'stroke-dasharray': '4 4' }, L.rings);
    };

    // ---------- drawings and pings ----------
    view.drawDrawings = function (list) {
      L.draw.innerHTML = '';
      for (const d of list) {
        el('path', { d: 'M' + d.pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L'), fill: 'none', stroke: d.color || '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9 }, L.draw);
      }
    };
    view.ping = function (u, v, label, color) {
      const g = el('g', { transform: `translate(${X(u)},${Y(v)})` }, L.pings);
      el('circle', { r: 6, fill: color }, g);
      const ring = el('circle', { r: 6, fill: 'none', stroke: color, 'stroke-width': 3 }, g);
      ring.innerHTML = '<animate attributeName="r" from="6" to="34" dur="1.1s" repeatCount="4"/><animate attributeName="opacity" from="1" to="0" dur="1.1s" repeatCount="4"/>';
      const t = el('text', { y: -12, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: color, stroke: '#05080b', 'stroke-width': 3, 'paint-order': 'stroke' }, g);
      t.textContent = label;
      setTimeout(() => g.remove(), 6000);
    };

    // ---------- zoom / pan ----------
    function applyVB() {
      svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
      const k = Math.pow(vb.w / 1000, 0.7);
      if (Math.abs(k - iconK) > 0.01) {
        iconK = k;
        placeMarkers();
        api.redrawScaled();
      }
    }
    view.iconK = () => iconK;
    view.fit = function () { vb = { x: 0, y: 0, w: 1000, h: 1000 }; applyVB(); };
    view.zoomAt = function (factor, cx, cy) {
      const nw = Math.max(120, Math.min(1400, vb.w * factor));
      const f = nw / vb.w;
      if (cx === undefined) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
      vb = { x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w: nw, h: vb.h * f };
      applyVB();
    };
    function svgPoint(evt) {
      const p = svg.createSVGPoint();
      p.x = evt.clientX; p.y = evt.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    }
    view.svgPoint = svgPoint;
    view.screenOf = function (u, v) {
      const p = svg.createSVGPoint();
      p.x = X(u); p.y = Y(v);
      const s = p.matrixTransform(svg.getScreenCTM());
      return [s.x, s.y];
    };

    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const p = svgPoint(e);
      view.zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    }, { passive: false });

    let drag = null;
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      api.closePop();
      const p = svgPoint(e);
      const heroEl = e.target.closest('.hero');
      const frontEl = e.target.closest('.front');
      const mkEl = e.target.closest('.mk');
      if (heroEl) drag = { type: 'hero', i: Number(heroEl.dataset.hero), start: p, moved: false };
      else if (frontEl) drag = { type: 'front', lane: frontEl.dataset.front, start: p, moved: false };
      else if (mkEl) drag = { type: 'marker', id: mkEl.dataset.id, start: p, moved: false, god: api.isGod() };
      else if (api.isDraw()) drag = { type: 'draw', pts: [toUV(p.x, p.y)], start: p, moved: false, path: el('path', { fill: 'none', stroke: api.drawColor(), 'stroke-width': 3, 'stroke-linecap': 'round' }, L.draw) };
      else { drag = { type: 'pan', start: p, sx: e.clientX, sy: e.clientY, vb0: { ...vb }, moved: false }; svg.classList.add('panning'); }
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = svgPoint(e);
      if (drag.type === 'pan') {
        const rect = svg.getBoundingClientRect();
        const scale = Math.max(vb.w / rect.width, vb.h / rect.height);
        const dx = (e.clientX - drag.sx) * scale, dy = (e.clientY - drag.sy) * scale;
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
        vb = { ...drag.vb0, x: drag.vb0.x - dx, y: drag.vb0.y - dy };
        applyVB();
        return;
      }
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 3 * (vb.w / 1000)) drag.moved = true;
      if (!drag.moved) return;
      const [u, v] = toUV(p.x, p.y);
      if (drag.type === 'hero') api.moveHero(drag.i, u, v);
      else if (drag.type === 'front') api.moveFront(drag.lane, view.projectToLane(drag.lane, u, v).s);
      else if (drag.type === 'marker' && drag.god) {
        const r = markerEls.get(drag.id);
        if (r) { r.m.u = u; r.m.v = v; r.g.setAttribute('transform', `translate(${X(u).toFixed(1)},${Y(v).toFixed(1)}) scale(${iconK.toFixed(3)})`); }
      } else if (drag.type === 'marker' && api.markerDragMove) {
        // Outside god mode a marker can be dragged off the map onto a side panel to pin its details there.
        api.markerDragMove(drag.id, e.clientX, e.clientY);
      } else if (drag.type === 'draw') {
        drag.pts.push([u, v]);
        drag.path.setAttribute('d', 'M' + drag.pts.map(q => X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1)).join('L'));
      }
    });
    svg.addEventListener('pointerup', e => {
      if (!drag) return;
      const d = drag;
      drag = null;
      svg.classList.remove('panning');
      const p = svgPoint(e);
      const [u, v] = toUV(p.x, p.y);
      if (d.type === 'hero') { if (!d.moved) api.heroClick(d.i, e); else api.heroDropped(d.i); }
      else if (d.type === 'marker') {
        if (d.moved && d.god) { const r = markerEls.get(d.id); api.markerMoved(d.id, r.m.u, r.m.v); }
        else if (d.moved && api.markerDragEnd) api.markerDragEnd(d.id, e.clientX, e.clientY);
        else api.markerClick(d.id, e);
      } else if (d.type === 'front') { if (d.moved) api.frontDropped(d.lane); }
      else if (d.type === 'draw') { if (d.pts.length > 1) api.drawDone(d.pts); else d.path.remove(); }
      else if (d.type === 'pan' && !d.moved) api.backgroundClick(u, v, e);
    });
    svg.addEventListener('dblclick', e => {
      const heroEl = e.target.closest('.hero');
      if (heroEl) api.heroDbl(Number(heroEl.dataset.hero));
    });
    svg.addEventListener('contextmenu', e => {
      e.preventDefault();
      const p = svgPoint(e);
      const [u, v] = toUV(p.x, p.y);
      const heroEl = e.target.closest('.hero');
      if (heroEl) { api.heroContext(Number(heroEl.dataset.hero), e); return; }
      api.contextMenu(u, v, e);
    });

    view.setFlip = function (f) { flip = f; view.rebuild(); };
    view.setIconSet = function (name) { useIconSet(name); buildMarkers(); api.redrawScaled(); };
    view.isFlipped = () => flip;
    view.rebuild = function () { buildStatic(); buildMarkers(); api.redrawScaled(); };
    view.rebuildMarkers = buildMarkers;
    view.rebuildStatic = buildStatic;
    view.markerEl = id => markerEls.get(id);
    view.rebuild();
    applyVB();
    return view;
  };
})();
