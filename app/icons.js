// Deadlock Board icon sets. Pick one in Settings → Map icons.
//   minimap  (default) - shapes and colours as on Deadlock's in-game minimap: your structures are diamonds in their
//                        lane's colour, the enemy's are red, walkers are big diamonds with a dark centre, shrines are
//                        hollow diamonds, each Patron sits in a horseshoe facing the middle; gold winged Mid-Boss, teal
//                        Rift ring. Neutral icons (camps, Sinner's, shop, urn, bridge buffs...) come from `detailed`.
//   detailed           - the drawn set: automatons, masks, braziers.
//   classic            - the board's first icons (in app/map.js); any icon a set doesn't define also falls back there.
// All are original drawings, not copies of the game's files. Every icon lives in a -16..16 box; `currentColor` is
// the colour map.js gives the marker (team colour, or what the set's colorFor() returns). A key like `patron_amber`
// overrides `patron` for that team; set a key to null to drop it.
(function () {
  const O = 'stroke="#05080b" stroke-width="1.5" stroke-linejoin="round"';
  const FLAME = '<path d="M0,-16C3.6,-12.8 4,-10.6 2,-8.6H-2C-4,-10.6 -3.6,-12.8 0,-16Z" fill="#ffcf6e" stroke="#05080b" stroke-width=".9"/>';
  const MASK = `<path d="M-7.5,-7C-7.5,-12.5 7.5,-12.5 7.5,-7L6.8,3C5.4,10.5 -5.4,10.5 -6.8,3Z" fill="currentColor" ${O}/>` +
    '<path d="M-5.4,-3.2C-4.4,-4.6 -2.4,-4.6 -1.6,-3C-2.6,-1.6 -4.6,-1.6 -5.4,-3.2ZM5.4,-3.2C4.4,-4.6 2.4,-4.6 1.6,-3C2.6,-1.6 4.6,-1.6 5.4,-3.2Z" fill="#05080b"/>' +
    '<path d="M-1,1.5L0,5L1,1.5" fill="none" stroke="#05080b" stroke-width="1.1"/>';
  const camp = bars => `<path d="M0,${-9 + bars * -1.5}L8.6,${4.5 - bars * 1.5}H-8.6Z" fill="#a9c6bd" ${O}/>` +
    (bars > 0 ? `<rect x="-8" y="${8 - bars * 1.5}" width="16" height="3" rx="1" fill="#a9c6bd" ${O}/>` : '') +
    (bars > 1 ? `<rect x="-8" y="${12.5 - bars * 1.5}" width="16" height="3" rx="1" fill="#a9c6bd" ${O}/>` : '');

  const detailed = {
    symbols: {
      // Lane Guardian: a metal automaton with a fiery brazier for a head.
      guardian: `<path d="M-6.5,-9H6.5L4.6,-4.6H-4.6Z" fill="currentColor" ${O}/>` + FLAME +
        `<path d="M-12,-3H12L9.5,3.5H5.5V14H-5.5V3.5H-9.5Z" fill="currentColor" ${O}/><rect x="-3" y="-1.6" width="6" height="2.2" rx="1" fill="#05080b" opacity=".7"/>`,
      // Walker: a big four-legged automaton with two arms.
      walker: '<path d="M-6.5,0L-12.5,7L-14,14M-2.5,1L-4,14M2.5,1L4,14M6.5,0L12.5,7L14,14" fill="none" stroke="#05080b" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M-6.5,0L-12.5,7L-14,14M-2.5,1L-4,14M2.5,1L4,14M6.5,0L12.5,7L14,14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M-10,-6.5L-15.5,-1M10,-6.5L15.5,-1" stroke="#05080b" stroke-width="4" stroke-linecap="round"/><path d="M-10,-6.5L-15.5,-1M10,-6.5L15.5,-1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
        `<path d="M-11,-4C-10,-13 10,-13 11,-4L9,2H-9Z" fill="currentColor" ${O}/><circle cy="-5.5" r="2.4" fill="#ffcf6e" stroke="#05080b" stroke-width=".9"/>`,
      // Base Guardian: a smaller brazier pillar.
      base_guardian: `<path d="M-6,-7H6L4.4,-3H-4.4Z" fill="currentColor" ${O}/>` + FLAME.replace('M0,-16', 'M0,-14').replace('C3.6,-12.8 4,-10.6 2,-8.6H-2C-4,-10.6 -3.6,-12.8', 'C3.2,-11 3.5,-9 1.8,-7H-1.8C-3.5,-9 -3.2,-11') +
        `<path d="M-8,-1H8L5.5,13H-5.5Z" fill="currentColor" ${O}/>`,
      // Shrine: a tall spire with a light in it.
      shrine: `<path d="M0,-15.5L6.5,-4L4.5,14H-4.5L-6.5,-4Z" fill="currentColor" ${O}/><path d="M0,-7L2.6,-1.5L0,4L-2.6,-1.5Z" fill="#fff" opacity=".85"/>`,
      // Patrons: the Hidden King's antlered mask and the Archmother's rayed crown.
      patron: MASK,
      patron_amber: MASK + '<path d="M-5,-11L-9,-15.5M-7,-13.2L-12,-13M-9,-15.5L-10.5,-17M5,-11L9,-15.5M7,-13.2L12,-13M9,-15.5L10.5,-17" fill="none" stroke="#05080b" stroke-width="3.4" stroke-linecap="round"/>' +
        '<path d="M-5,-11L-9,-15.5M-7,-13.2L-12,-13M-9,-15.5L-10.5,-17M5,-11L9,-15.5M7,-13.2L12,-13M9,-15.5L10.5,-17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      patron_sapphire: `<path d="M-7,-10L-9,-16L-4,-11.6L0,-17.5L4,-11.6L9,-16L7,-10Z" fill="currentColor" ${O}/>` + MASK,
      // Mid-Boss: shown on the in-game minimap as the gold Rejuvenator mark while it's alive.
      midboss: '<path d="M-2,-5C-6,-9 -11,-9.5 -15,-6.5C-11,-6 -8.5,-4 -7,-1.2C-5,-1.8 -3.2,-3 -2,-5ZM2,-5C6,-9 11,-9.5 15,-6.5C11,-6 8.5,-4 7,-1.2C5,-1.8 3.2,-3 2,-5Z" fill="#f5c84c" stroke="#05080b" stroke-width="1.3" stroke-linejoin="round"/>' +
        '<circle cy="-9.5" r="4" fill="#f5c84c" stroke="#05080b" stroke-width="1.3"/><path d="M-2.4,-5H2.4L1.4,10H-1.4Z" fill="#f5c84c" stroke="#05080b" stroke-width="1.3" stroke-linejoin="round"/>' +
        '<path d="M-6,10.5H6L4.5,14H-4.5Z" fill="#f5c84c" stroke="#05080b" stroke-width="1.3" stroke-linejoin="round"/>',
      // Jungle camps: grey-teal triangles, with one bar for medium and two for hard (like the in-game minimap).
      camp_small: camp(0),
      camp_medium: camp(1),
      camp_large: camp(2),
      // Sinner's Sacrifice: a grey machine with a dial.
      // Sinner's Sacrifice: electric cyan, a colour no other icon uses, so the soul machines stand out.
      sinners: `<defs><linearGradient id="dlb-sin" x1="0" y1="-10" x2="0" y2="10" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b8fdff"/><stop offset="1" stop-color="#0fd0f0"/></linearGradient></defs>` +
        `<rect x="-10.5" y="-10.5" width="21" height="21" rx="5" fill="#19e6ff" opacity=".35"/><rect x="-9.5" y="-9.5" width="19" height="19" rx="4.5" fill="url(#dlb-sin)" ${O}/><circle r="5.4" fill="none" stroke="#04343d" stroke-width="2.2"/><circle r="1.9" fill="#04343d"/>`,
      // Soul Urn: a teal urn.
      urn_spawn: '<defs><linearGradient id="dlb-urn" x1="0" y1="-14" x2="0" y2="14" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6ff6ff"/><stop offset="1" stop-color="#0b7d91"/></linearGradient></defs>' +
        `<path d="M-4.6,-14H4.6V-11.2L3.6,-9.4C9.8,-6.4 10.2,5.6 5,11.6V14H-5V11.6C-10.2,5.6 -9.8,-6.4 -3.6,-9.4L-4.6,-11.2Z" fill="url(#dlb-urn)" ${O}/><path d="M-6.4,-3H6.4" stroke="#05080b" stroke-width="1.2" opacity=".45"/>`,
      urn_dropoff: '<path d="M-4.6,-14H4.6V-11.2L3.6,-9.4C9.8,-6.4 10.2,5.6 5,11.6V14H-5V11.6C-10.2,5.6 -9.8,-6.4 -3.6,-9.4L-4.6,-11.2Z" fill="#0a1a20" stroke="#6ff6ff" stroke-width="1.8" stroke-linejoin="round"/>' +
        '<path d="M0,-5V5M-4,1.5L0,6L4,1.5" fill="none" stroke="#6ff6ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      // Bridge buff: a three-arc badge; the type is random, so the centre is a neutral spark.
      powerup: '<circle r="14" fill="#141a20" stroke="#05080b" stroke-width="1.5"/><circle r="11" fill="none" stroke="#e8b062" stroke-width="2.6" stroke-dasharray="18.5 4.54" transform="rotate(-78)"/>' +
        '<path d="M0,-6.5L1.8,-1.8L6.5,0L1.8,1.8L0,6.5L-1.8,1.8L-6.5,0L-1.8,-1.8Z" fill="#ffe2a8"/>',
      // Unstable Rift: a glowing oval tear.
      rift: '<ellipse rx="9.6" ry="14.6" fill="none" stroke="#7ef7ff" stroke-width="1.6" opacity=".4"/><ellipse rx="7" ry="12" fill="#0b1a26" stroke="#7ef7ff" stroke-width="2.4"/>' +
        '<path d="M0,-8C2,-3 -2,2 0,8" fill="none" stroke="#d8fdff" stroke-width="1.8" stroke-linecap="round"/>',
      // Healing bat: a green glowing fruit with bat wings.
      snack: '<path d="M-5,-1C-8.5,-6 -13,-5.4 -15.5,-2C-13.6,-2 -12.6,-.6 -12.2,1C-11.2,-.4 -9.6,0 -9,1.6C-8,.4 -6.4,.8 -5.6,2ZM5,-1C8.5,-6 13,-5.4 15.5,-2C13.6,-2 12.6,-.6 12.2,1C11.2,-.4 9.6,0 9,1.6C8,.4 6.4,.8 5.6,2Z" fill="#2f7a3c" stroke="#05080b" stroke-width="1" stroke-linejoin="round"/>' +
        `<circle cy="1" r="6.6" fill="#7ee08a" ${O}/><path d="M0,-5.6C1,-8.6 3.6,-9.4 5,-8.4C3.8,-6.2 1.8,-5.4 0,-5.6Z" fill="#3a8a43"/>`,
      // Crates: wood; heavy crates are teal with metal corners and a lock (break with a heavy melee).
      crate: `<rect x="-8.5" y="-7.5" width="17" height="15" rx="1.5" fill="#b98a4a" ${O}/><path d="M-8.5,-2.5H8.5M-8.5,2.5H8.5" stroke="#5e3f17" stroke-width="1.1"/>`,
      heavy_crate: `<rect x="-10" y="-9" width="20" height="18" rx="1.5" fill="#2a9d8f" ${O}/><path d="M-10,-9H-5V-4H-10ZM10,-9H5V-4H10ZM-10,9H-5V4H-10ZM10,9H5V4H10Z" fill="#46525c" stroke="#05080b" stroke-width=".8"/>` +
        '<rect x="-2.8" y="-2.8" width="5.6" height="5.6" rx="1" fill="#ffcf6e" stroke="#05080b" stroke-width=".9"/>',
      // Buff container: a violet box with a glowing plus.
      buff_box: `<rect x="-8.5" y="-8.5" width="17" height="17" rx="3" fill="#a98cff" ${O}/><path d="M0,-5V5M-5,0H5" stroke="#f3eeff" stroke-width="2.6" stroke-linecap="round"/>`,
      // Steam vent: a grate with steam rising.
      vent: `<rect x="-10" y="2" width="20" height="9" rx="2" fill="#7b8a96" ${O}/><path d="M-6,4V9M-2,4V9M2,4V9M6,4V9" stroke="#05080b" stroke-width="1.2"/>` +
        '<path d="M-5,-1C-8,-5 -2,-7 -5,-12M1,-1C-2,-5 4,-7 1,-12M7,-1C4,-5 10,-7 7,-12" fill="none" stroke="#e8f0f5" stroke-width="1.9" stroke-linecap="round"/>',
      // Curiosity Shop: a mint-green counter under an awning.
      shop: `<path d="M-12,-10H12L10,-3.5H-10Z" fill="#8df0c4" ${O}/><path d="M-9.5,-2H9.5V10H-9.5Z" fill="#8df0c4" ${O}/><rect x="-6.2" y=".6" width="12.4" height="5.2" rx="1" fill="#0d2a20"/><path d="M-11.5,11.5H11.5" stroke="#05080b" stroke-width="1.4"/>`,
      // Teleporter: a sand-coloured ring around a doorway.
      teleporter: '<circle r="12.5" fill="#1a1712" stroke="#d9c9a3" stroke-width="2.6"/><path d="M-4,8V-3C-4,-7.5 4,-7.5 4,-3V8Z" fill="#d9c9a3" stroke="#05080b" stroke-width="1"/><path d="M-1,1.5L1.8,1.5M0.4,0L1.8,1.5L0.4,3" fill="none" stroke="#1a1712" stroke-width="1.3"/>',
      // Rope: a climbing rope with knots.
      rope: '<rect x="-8" y="-12" width="16" height="24" rx="4" fill="#15191d" stroke="#05080b" stroke-width="1.2"/><path d="M0,-9C1.6,-5 -1.6,-1 0,3C1.6,7 -1,8 0,10" fill="none" stroke="#e6d6b0" stroke-width="2.2" stroke-linecap="round"/><circle cy="-9.5" r="1.8" fill="#e6d6b0"/>',
      bell: `<path d="M-9,7C-8.4,-2 -7,-10 0,-10C7,-10 8.4,-2 9,7Z" fill="#f5c84c" ${O}/><circle cy="10" r="2.4" fill="#f5c84c" stroke="#05080b" stroke-width="1"/>`,
      spawn: `<path d="M-10,12V-2L0,-11L10,-2V12Z" fill="currentColor" ${O}/><path d="M-3.5,12V4H3.5V12" fill="#05080b" opacity=".55"/>`,
    },
    // Base size of each icon in map units at full-map zoom. Camps are smaller, like the in-game minimap.
    sizes: {
      guardian: 34, walker: 40, base_guardian: 24, shrine: 28, patron: 40, midboss: 40, spawn: 18,
      camp_small: 17, camp_medium: 19, camp_large: 21, sinners: 21, urn_spawn: 26, urn_dropoff: 24, powerup: 26,
      rift: 30, snack: 13, crate: 7, heavy_crate: 11, buff_box: 8, vent: 12, shop: 20, teleporter: 19, rope: 11, bell: 13,
    },
  };

  // ---------- minimap set ----------
  const D = 'stroke="#05080b" stroke-width="2" stroke-linejoin="round"';
  const diamond = r => `M0,${-r}L${r},0L0,${r}L${-r},0Z`;
  // Detail on top of the in-game shape: a faint light upper half, like a bevel.
  const bevel = r => `<path d="M0,${-r + 1.4}L${r - 1.4},0H${-r + 1.4}Z" fill="#fff" opacity=".16"/>`;
  const minimapSymbols = Object.assign({}, detailed.symbols, {
    // Lane Guardian: a solid diamond.
    guardian: `<path d="${diamond(12)}" fill="currentColor" ${D}/>` + bevel(12),
    // Walker: a bigger diamond with a dark centre.
    walker: `<path d="${diamond(14.5)}" fill="currentColor" ${D}/>` + bevel(14.5) + `<path d="${diamond(6.8)}" fill="#000" opacity=".55"/>`,
    // Base Guardian: a smaller solid diamond near the base.
    base_guardian: `<path d="${diamond(10)}" fill="currentColor" ${D}/>` + bevel(10),
    // Shrine: a hollow diamond with a dot.
    shrine: `<path d="${diamond(10.5)}" fill="#0b0f13" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="${diamond(12.5)}" fill="none" stroke="#05080b" stroke-width="1"/><path d="${diamond(3.6)}" fill="currentColor"/>`,
    // Patron: a diamond sitting in a thick horseshoe that opens toward the middle of the map.
    patron: '<path d="M-15.5,-2A15.5,15.5 0 0 0 15.5,-2L9,-2A9,9 0 0 1 -9,-2Z" fill="currentColor" stroke="#05080b" stroke-width="1.6" stroke-linejoin="round"/>' +
      `<path d="M0,-11L7.5,-3.5L0,4L-7.5,-3.5Z" fill="currentColor" ${D}/>`,
    patron_amber: null,
    patron_sapphire: null,
    // Mid-Boss: a glowing gold winged figure with a halo.
    midboss: '<defs><radialGradient id="dlb-mb-glow"><stop offset="0" stop-color="#ffd23f" stop-opacity=".55"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient></defs><circle r="15.5" fill="url(#dlb-mb-glow)"/><circle cy="-12" r="3" fill="none" stroke="#ffd23f" stroke-width="1.6"/><circle cy="-7.4" r="2.6" fill="#ffd23f" stroke="#3a2a00" stroke-width=".8"/>' +
      '<path d="M-1.6,-4.6C-5,-6.5 -10,-8.5 -14.5,-9.5C-12.5,-6 -9.5,-2.5 -5.5,-1C-4,1.5 -2,7 0,13.5C2,7 4,1.5 5.5,-1C9.5,-2.5 12.5,-6 14.5,-9.5C10,-8.5 5,-6.5 1.6,-4.6Z" fill="#ffd23f" stroke="#3a2a00" stroke-width="1" stroke-linejoin="round"/>',
    // Unstable Rift: a white swirl inside a teal ring.
    rift: '<circle r="14" fill="#0b1a1f" stroke="#3fd0c0" stroke-width="2.4"/><ellipse rx="5.4" ry="9" fill="none" stroke="#f2fbff" stroke-width="2"/><path d="M1.5,-6C3.5,-2 -3,1 -0.5,6" fill="none" stroke="#f2fbff" stroke-width="1.4" stroke-linecap="round"/>' +
      '<circle cx="8" cy="-6" r="1.1" fill="#f2fbff"/><circle cx="-8.5" cy="5" r="1" fill="#f2fbff"/><circle cx="7.5" cy="7" r=".8" fill="#f2fbff"/>',
  });
  const OBJECTIVES = ['guardian', 'walker', 'base_guardian', 'shrine', 'patron', 'spawn'];
  const minimap = {
    symbols: minimapSymbols,
    sizes: Object.assign({}, detailed.sizes, { guardian: 24, walker: 32, base_guardian: 20, shrine: 18, patron: 40, midboss: 38, rift: 30 }),
    faceCenter: ['patron'],
    // In-game minimap colours: the enemy's structures are red; yours take their lane's colour, base ones are cream.
    colorFor(m, ctx) {
      if (!OBJECTIVES.includes(m.kind) || !m.team) return null;
      if (m.team !== ctx.myTeam) return '#e5533d';
      const lane = m.lane && ctx.game.lanes[m.lane];
      if (lane && m.kind !== 'shrine' && m.kind !== 'patron') return lane.color;
      return '#f3e4cf';
    },
  };

  window.DLB_ICON_SETS = { minimap, detailed, classic: null };
})();
