/* Cosmic Clocks — pulsar catalogue.
 *
 * Spin periods are measured values (ATNF Pulsar Catalogue, discovery papers).
 * Distances use parallax where one exists. The `sound` block describes a
 * stylised pulse profile (Gaussian components, in fractions of a turn) and how
 * much single pulses vary; the `vis` block drives the WebGL scene.
 */
window.CC = window.CC || {};

CC.PULSARS = [
  {
    id: 'J0901-4046',
    name: 'PSR J0901−4046',
    short: 'J0901',
    aka: '',
    title: 'The slow giant',
    kind: 'Ultra-long-period pulsar',
    P: 75.88, Pstr: '75.88 s', Pdot: 2.25e-13,
    distKpc: 0.4, ra: 135.37, dec: -40.77,
    constellation: 'Vela',
    year: 2020, found: 'MeerKAT, South Africa',
    story: 'Spotted by South Africa’s MeerKAT telescope in September 2020, this neutron star takes 76 seconds to turn once. It sits deep in the pulsar ‘graveyard’, well past the line where theory says a pulsar this slow should fall radio-silent, and nobody is quite sure how it still shines.',
    listen: 'One lonely pulse, then 76 seconds of static. Speed time up to hear its rhythm.',
    extra: [],
    sound: {
      w0: -0.3, win: [-0.011, 0.012],
      comps: [[0, 0.0013, 1], [0.0024, 0.0009, 0.55], [-0.0022, 0.0008, 0.3]],
      sig: 0.45, nulls: 0.06, scint: [0.2, 20]
    },
    vis: {
      alpha: 32, zeta: 36, rho: 6,
      beam: [0.78, 0.72, 1.0], halo: [0.45, 0.3, 0.95], surf: [0.8, 0.78, 1.0],
      neb: { style: 1, a: [0.16, 0.05, 0.22], b: [0.03, 0.02, 0.09], amt: 0.55, seed: 3.1 },
      band: 0.25, stars: 0.7, near: { n: 90, col: [0.8, 0.8, 1.0], r: [30, 120] }
    }
  },
  {
    id: 'B1919+21',
    name: 'PSR B1919+21',
    short: 'B1919',
    aka: 'CP 1919 · “LGM-1”',
    title: 'The first pulsar ever found',
    kind: 'Radio pulsar · discovered 1967',
    P: 1.3373022, Pstr: '1.337302 s', Pdot: 1.348e-15,
    distKpc: 0.7, ra: 290.437, dec: 21.884,
    constellation: 'Vulpecula',
    year: 1967, found: 'Jocelyn Bell Burnell & Antony Hewish, Cambridge',
    story: 'On 28 November 1967, Cambridge graduate student Jocelyn Bell Burnell confirmed that a bit of ‘scruff’ on her chart recorder was a signal ticking every 1.337 seconds. It was so regular that the team half-jokingly logged it as LGM-1, for ‘Little Green Men’. A stack of its successive pulses later became the cover of Joy Division’s album Unknown Pleasures.',
    listen: 'A slow, steady knock, about 45 a minute: slower than a resting heart.',
    extra: [],
    sound: {
      w0: -0.3, win: [-0.024, 0.024],
      comps: [[-0.0055, 0.0034, 0.85], [0.0055, 0.0032, 1.0]],
      sig: 0.38, nulls: 0.02, drift: [0.0105, 4.2], scint: [0.3, 9]
    },
    vis: {
      alpha: 42, zeta: 46, rho: 8,
      beam: [0.85, 0.93, 1.0], halo: [0.35, 0.55, 1.0], surf: [0.82, 0.9, 1.0],
      neb: { style: 0, a: [0.05, 0.12, 0.25], b: [0.14, 0.1, 0.2], amt: 0.35, seed: 7.7 },
      band: 0.9, stars: 1.0, near: { n: 140, col: [0.9, 0.92, 1.0], r: [30, 140] }
    }
  },
  {
    id: 'B0329+54',
    name: 'PSR B0329+54',
    short: 'B0329',
    aka: 'PSR J0332+5434',
    title: 'The heartbeat',
    kind: 'Radio pulsar · one of the brightest',
    P: 0.7145197, Pstr: '0.7145197 s', Pdot: 2.05e-15,
    distKpc: 1.64, ra: 53.247, dec: 54.579,
    constellation: 'Camelopardalis',
    year: 1968, found: 'early pulsar surveys',
    story: 'One of the strongest pulsars in the northern sky, and the classic ‘sound of a pulsar’ played at radio observatories for decades. Its pulse is built from several separate components, and every so often the whole pattern switches into a different mode before settling back.',
    listen: 'A thump about 84 times a minute, close to the pace of a human heart.',
    extra: [],
    sound: {
      w0: -0.3, win: [-0.038, 0.038],
      comps: [[-0.021, 0.0035, 0.28], [-0.009, 0.003, 0.35], [0, 0.0032, 1.0], [0.008, 0.003, 0.3], [0.019, 0.0038, 0.55]],
      sig: 0.33, nulls: 0.01, scint: [0.35, 7]
    },
    vis: {
      alpha: 30, zeta: 34, rho: 9,
      beam: [0.62, 0.92, 1.0], halo: [0.12, 0.55, 0.85], surf: [0.7, 0.9, 1.0],
      neb: { style: 0, a: [0.02, 0.2, 0.24], b: [0.02, 0.06, 0.14], amt: 0.6, seed: 12.4 },
      band: 0.6, stars: 1.0, near: { n: 120, col: [0.8, 0.95, 1.0], r: [30, 140] }
    }
  },
  {
    id: 'B0950+08',
    name: 'PSR B0950+08',
    short: 'B0950',
    aka: 'CP 0950',
    title: 'The near neighbour',
    kind: 'Radio pulsar · 17 million years old',
    P: 0.2530652, Pstr: '0.2530652 s', Pdot: 2.29e-16,
    distKpc: 0.262, ra: 148.289, dec: 7.927,
    constellation: 'Leo',
    year: 1968, found: 'Cambridge, among the first four pulsars',
    story: 'Found at Cambridge in 1968, among the first handful of pulsars ever detected, and only about 850 light-years away. Despite its great age, some of its single pulses flare to many times their usual strength: ‘giant pulses’ that make the rhythm stumble.',
    listen: 'A quick patter of four beats a second, with the odd louder crack.',
    extra: [],
    sound: {
      w0: -0.3, win: [-0.05, 0.05],
      comps: [[-0.018, 0.007, 0.25], [0, 0.009, 1.0], [0.44, 0.012, 0.07]],
      sig: 0.55, giant: [0.01, 5], scint: [0.5, 5]
    },
    vis: {
      alpha: 24, zeta: 27, rho: 13,
      beam: [0.8, 0.9, 1.0], halo: [0.35, 0.45, 0.9], surf: [0.85, 0.9, 1.0],
      neb: { style: 0, a: [0.06, 0.07, 0.16], b: [0.1, 0.06, 0.12], amt: 0.25, seed: 5.5 },
      band: 0.15, stars: 0.8, near: { n: 60, col: [1.0, 0.95, 0.9], r: [30, 140] }
    }
  },
  {
    id: 'B0833-45',
    name: 'Vela Pulsar',
    short: 'Vela',
    aka: 'PSR B0833−45',
    title: 'The glitcher',
    kind: 'Young pulsar · in a supernova remnant',
    P: 0.08933, Pstr: '89.33 ms', Pdot: 1.25e-13,
    distKpc: 0.287, ra: 128.836, dec: -45.176,
    constellation: 'Vela',
    year: 1968, found: 'Molonglo Observatory, Australia',
    story: 'The collapsed core of a star that exploded about 11,000 years ago, still wrapped in the glowing shreds of its supernova. Every two to three years Vela abruptly spins up, a ‘glitch’ thought to come from its superfluid interior lurching, then patiently slows down again.',
    listen: 'Eleven beats a second blur into a putt-putt ‘motorboat’ flutter.',
    extra: [['Supernova', 'about 11,000 years ago']],
    sound: {
      w0: -0.3, win: [-0.035, 0.045],
      comps: [[-0.008, 0.004, 0.2], [0, 0.0065, 1.0], [0.011, 0.007, 0.4]],
      sig: 0.22, scint: [0.3, 8]
    },
    vis: {
      alpha: 55, zeta: 60, rho: 11,
      beam: [0.95, 0.85, 1.0], halo: [0.75, 0.35, 0.95], surf: [0.9, 0.85, 1.0],
      neb: { style: 2, a: [0.42, 0.1, 0.32], b: [0.05, 0.28, 0.35], amt: 1.0, seed: 21.0 },
      band: 0.7, stars: 1.0, near: { n: 110, col: [1.0, 0.85, 0.95], r: [30, 140] }
    }
  },
  {
    id: 'B1913+16',
    name: 'PSR B1913+16',
    short: 'B1913',
    aka: 'Hulse–Taylor binary',
    title: 'Einstein’s clock',
    kind: 'Binary pulsar · orbits a neutron star',
    P: 0.05903, Pstr: '59.03000 ms', Pdot: 8.62e-18,
    distKpc: 4.1, ra: 288.867, dec: 16.108,
    constellation: 'Aquila',
    year: 1974, found: 'Russell Hulse & Joseph Taylor, Arecibo',
    story: 'Discovered at Arecibo in 1974 by Russell Hulse and Joseph Taylor, it whips around another neutron star every 7.75 hours. Decades of timing its ticks showed the orbit shrinking exactly as Einstein predicted for a system losing energy to gravitational waves, work that won the 1993 Nobel Prize in Physics.',
    listen: 'A 17-per-second flutter: too fast to count, too slow to become a note.',
    extra: [['Orbit', '7.75 h around a neutron star'], ['Nobel Prize', 'Physics, 1993']],
    sound: {
      w0: -0.3, win: [-0.045, 0.045],
      comps: [[-0.017, 0.0075, 0.75], [0, 0.01, 0.25], [0.018, 0.007, 1.0]],
      sig: 0.3, scint: [0.25, 8]
    },
    vis: {
      alpha: 48, zeta: 52, rho: 12,
      beam: [1.0, 0.9, 0.75], halo: [1.0, 0.55, 0.25], surf: [1.0, 0.92, 0.85],
      neb: { style: 0, a: [0.22, 0.1, 0.04], b: [0.06, 0.03, 0.1], amt: 0.45, seed: 33.3 },
      band: 0.8, stars: 1.0, near: { n: 120, col: [1.0, 0.9, 0.8], r: [30, 140] },
      companion: { kind: 'ns', size: 0.9, col: [0.9, 0.95, 1.0], a: 9.5, e: 0.617, period: 26, incl: 32 },
      gw: 1.0
    }
  },
  {
    id: 'B0531+21',
    name: 'Crab Pulsar',
    short: 'Crab',
    aka: 'PSR B0531+21',
    title: 'Born in the year 1054',
    kind: 'Young pulsar · powers the Crab Nebula',
    P: 0.03378, Pstr: '≈33.8 ms', Pdot: 4.2e-13,
    distKpc: 2.0, ra: 83.633, dec: 22.015,
    constellation: 'Taurus',
    year: 1968, found: 'David Staelin & Edward Reifenstein, Green Bank',
    story: 'In 1054, astronomers in China recorded a ‘guest star’ bright enough to see in daylight. Its core became this pulsar, which still spins about 30 times a second and powers the entire Crab Nebula. By pulsar standards it is slowing fast: every day its rotation period grows by about 36 billionths of a second.',
    listen: 'A low buzz near the second-lowest key of a piano, with a weaker ‘interpulse’ inside every turn.',
    extra: [['Supernova', 'seen from Earth in 1054']],
    sound: {
      w0: -0.25, win: [-0.07, 0.49],
      comps: [[0, 0.006, 1.0], [0.405, 0.007, 0.55]],
      sig: 0.5, giant: [0.02, 5], scint: [0.2, 10]
    },
    vis: {
      alpha: 72, zeta: 66, rho: 11,
      beam: [0.75, 0.9, 1.0], halo: [0.3, 0.55, 1.0], surf: [0.8, 0.9, 1.0],
      neb: { style: 2, a: [0.62, 0.22, 0.06], b: [0.05, 0.18, 0.42], amt: 1.2, seed: 54.0 },
      band: 0.5, stars: 0.9, near: { n: 90, col: [1.0, 0.8, 0.6], r: [30, 140] },
      jets: 0.7, torus: 0.6
    }
  },
  {
    id: 'J0737-3039A',
    name: 'PSR J0737−3039A',
    short: 'J0737A',
    aka: 'The Double Pulsar',
    title: 'The double pulsar',
    kind: 'Binary · both stars are pulsars',
    P: 0.022699379, Pstr: '22.69938 ms', Pdot: 1.76e-18,
    distKpc: 0.735, ra: 114.463, dec: -30.661,
    constellation: 'Puppis',
    year: 2003, found: 'Marta Burgay et al., Parkes',
    story: 'The only known system in which both neutron stars have been seen as pulsars. They circle each other every 2.4 hours on an orbit that would fit inside the Sun, and timing them has confirmed Einstein’s general relativity to better than 0.02%. Pulsar B’s beam precessed out of our view in 2008.',
    listen: 'A deep 44 Hz hum from A, with B’s slow tick every 2.8 seconds, as it sounded before it vanished.',
    extra: [['Companion', 'Pulsar B · 2.77 s spin'], ['Orbit', '2.45 hours']],
    sound: {
      w0: -0.25, win: [-0.09, 0.59],
      comps: [[0, 0.02, 1.0], [0.03, 0.012, 0.35], [0.5, 0.022, 0.75]],
      sig: 0.2, scint: [0.25, 8],
      partner: { P: 2.7734607, gain: 0.55, w0: -0.3, comps: [[0, 0.004, 1], [0.007, 0.003, 0.5]], sig: 0.5, nulls: 0.25, scint: [0.3, 6] }
    },
    vis: {
      alpha: 86, zeta: 84, rho: 14,
      beam: [0.7, 1.0, 0.92], halo: [0.15, 0.75, 0.6], surf: [0.8, 1.0, 0.95],
      neb: { style: 0, a: [0.03, 0.16, 0.14], b: [0.06, 0.04, 0.14], amt: 0.4, seed: 71.7 },
      band: 0.6, stars: 1.0, near: { n: 100, col: [0.85, 1.0, 0.95], r: [30, 140] },
      companion: { kind: 'pulsar', size: 0.95, col: [0.85, 0.95, 1.0], a: 8.5, e: 0.088, period: 30, incl: 38 },
      gw: 0.7
    }
  },
  {
    id: 'B1257+12',
    name: 'PSR B1257+12',
    short: 'B1257',
    aka: 'Lich · PSR J1300+1240',
    title: 'The planet host',
    kind: 'Millisecond pulsar · three planets',
    P: 0.006218532, Pstr: '6.218532 ms', Pdot: 1.14e-19,
    distKpc: 0.71, ra: 195.015, dec: 12.682,
    constellation: 'Virgo',
    year: 1990, found: 'Aleksander Wolszczan, Arecibo',
    story: 'In 1992 Aleksander Wolszczan and Dale Frail showed that tiny, rhythmic delays in this pulsar’s ticks were caused by orbiting planets: the first worlds ever confirmed beyond the Solar System. Its three planets, Draugr, Poltergeist and Phobetor, circle the corpse of a star.',
    listen: 'A buzzy drone at 161 Hz, a little below E3.',
    extra: [['Planets', 'Draugr, Poltergeist, Phobetor']],
    sound: {
      w0: -0.3, win: [-0.14, 0.16],
      comps: [[-0.04, 0.022, 0.45], [0, 0.02, 1.0], [0.05, 0.025, 0.35]],
      sig: 0.15, scint: [0.3, 7]
    },
    vis: {
      alpha: 50, zeta: 54, rho: 18,
      beam: [0.85, 0.9, 1.0], halo: [0.45, 0.4, 0.9], surf: [0.85, 0.88, 1.0],
      neb: { style: 0, a: [0.08, 0.06, 0.16], b: [0.14, 0.08, 0.06], amt: 0.35, seed: 88.8 },
      band: 0.2, stars: 0.9, near: { n: 80, col: [1.0, 0.95, 0.9], r: [30, 140] },
      planets: [
        { name: 'Draugr', a: 6.5, size: 0.28, col: [0.62, 0.55, 0.5], period: 14 },
        { name: 'Poltergeist', a: 10.0, size: 0.55, col: [0.5, 0.56, 0.66], period: 32 },
        { name: 'Phobetor', a: 13.5, size: 0.52, col: [0.62, 0.5, 0.44], period: 47 }
      ]
    }
  },
  {
    id: 'J0437-4715',
    name: 'PSR J0437−4715',
    short: 'J0437',
    aka: '',
    title: 'The precision clock',
    kind: 'Millisecond pulsar · white-dwarf binary',
    P: 0.005757451941593412, Pstr: '5.757451941593412 ms', Pdot: 5.73e-20,
    distKpc: 0.157, ra: 69.316, dec: -47.253,
    constellation: 'Pictor',
    year: 1993, found: 'Parkes 70 cm survey, Australia',
    story: 'The closest and brightest millisecond pulsar, just 511 light-years away, spinning 174 times a second around a white-dwarf companion. It is among the most precisely timed objects known, and one of the clocks that pulsar timing arrays use to listen for gravitational waves crossing the galaxy.',
    listen: 'A steady, buzzing tone almost exactly on F3.',
    extra: [['Companion', 'white dwarf · 5.74-day orbit']],
    sound: {
      w0: -0.3, win: [-0.24, 0.24],
      comps: [[-0.14, 0.035, 0.12], [-0.06, 0.025, 0.25], [0, 0.011, 1.0], [0.035, 0.015, 0.4], [0.1, 0.03, 0.18]],
      sig: 0.2, scint: [0.55, 6]
    },
    vis: {
      alpha: 36, zeta: 40, rho: 20,
      beam: [0.72, 0.9, 1.0], halo: [0.2, 0.5, 1.0], surf: [0.78, 0.9, 1.0],
      neb: { style: 0, a: [0.02, 0.07, 0.2], b: [0.02, 0.12, 0.16], amt: 0.4, seed: 101.0 },
      band: 0.3, stars: 1.1, near: { n: 90, col: [0.85, 0.92, 1.0], r: [30, 140] },
      companion: { kind: 'wd', size: 0.6, col: [0.92, 0.96, 1.0], a: 10.5, e: 0.0, period: 36, incl: 34 }
    }
  },
  {
    id: 'B1937+21',
    name: 'PSR B1937+21',
    short: 'B1937',
    aka: 'PSR J1939+2134',
    title: 'The first millisecond pulsar',
    kind: 'Millisecond pulsar · isolated',
    P: 0.0015578065, Pstr: '1.557806 ms', Pdot: 1.05e-19,
    distKpc: 3.5, ra: 294.911, dec: 21.583,
    constellation: 'Vulpecula',
    year: 1982, found: 'Don Backer, Shri Kulkarni et al., Arecibo',
    story: 'Found at Arecibo in 1982 spinning 642 times a second, a rate the team only caught because they sampled their data faster than originally planned. It held the record for the fastest known spin for over two decades, and still anchors pulsar timing experiments today.',
    listen: 'A high whine just below E5, with an interpulse from the opposite pole.',
    extra: [],
    sound: {
      w0: -0.25, win: [-0.08, 0.59],
      comps: [[0, 0.0085, 1.0], [0.5, 0.011, 0.55]],
      sig: 0.3, giant: [0.004, 6], scint: [0.25, 8]
    },
    vis: {
      alpha: 84, zeta: 82, rho: 12,
      beam: [0.85, 0.75, 1.0], halo: [0.55, 0.25, 1.0], surf: [0.88, 0.82, 1.0],
      neb: { style: 1, a: [0.2, 0.05, 0.3], b: [0.03, 0.03, 0.12], amt: 0.55, seed: 121.2 },
      band: 0.9, stars: 1.0, near: { n: 110, col: [0.9, 0.85, 1.0], r: [30, 140] }
    }
  },
  {
    id: 'J1748-2446ad',
    name: 'PSR J1748−2446ad',
    short: 'J1748ad',
    aka: 'Terzan 5 ad',
    title: 'The fastest spin known',
    kind: 'Millisecond pulsar · eclipsing binary',
    P: 0.00139595482, Pstr: '1.39595482 ms', Pdot: null,
    distKpc: 5.9, ra: 267.02, dec: -24.779,
    constellation: 'Sagittarius',
    year: 2004, found: 'Jason Hessels et al., Green Bank Telescope',
    story: 'Discovered in 2004 by Jason Hessels and colleagues with the Green Bank Telescope, deep inside the crowded star cluster Terzan 5. It turns 716 times every second, so its equator races along at around a fifth of the speed of light. It orbits a bloated companion star every 26 hours and is eclipsed for roughly 40% of each orbit.',
    listen: 'A thin, bright tone just above F5: 716 rotations every second.',
    extra: [['Home', 'star cluster Terzan 5'], ['Companion', 'bloated star · 26-hour orbit'], ['Eclipsed', '≈40% of each orbit']],
    sound: {
      w0: -0.3, win: [-0.18, 0.28],
      comps: [[0, 0.04, 1.0], [0.085, 0.03, 0.45]],
      sig: 0.2, scint: [0.25, 8]
    },
    vis: {
      alpha: 60, zeta: 64, rho: 20,
      beam: [1.0, 0.95, 0.85], halo: [1.0, 0.62, 0.3], surf: [1.0, 0.95, 0.9],
      neb: { style: 1, a: [0.3, 0.16, 0.05], b: [0.12, 0.05, 0.03], amt: 0.38, seed: 144.4 },
      band: 1.0, stars: 1.2, near: { n: 900, col: [1.0, 0.78, 0.45], r: [22, 110], cluster: true },
      companion: { kind: 'star', size: 1.25, col: [1.0, 0.62, 0.4], a: 11.5, e: 0.0, period: 40, incl: 30 },
      lc: true
    }
  }
];

/* Derived numbers used across the UI. Everything shown as a "calculation" on
 * the page comes from here, so the arithmetic lives in one place. */
CC.C_KMS = 299792.458;
CC.R_NS_KM = 12;          // nominal neutron-star radius used for equator speed
CC.YEAR_S = 31557600;     // Julian year

CC.derive = function (p) {
  var f = 1 / p.P;
  var d = {
    f: f,
    perMinute: 60 * f,
    perDay: 86400 * f,
    lcKm: CC.C_KMS / (2 * Math.PI * f),
    vEqKms: 2 * Math.PI * CC.R_NS_KM * f,
    distLy: p.distKpc * 3261.56
  };
  d.vEqFrac = d.vEqKms / CC.C_KMS;
  if (p.Pdot) {
    d.agePerYear = p.Pdot * CC.YEAR_S;                 // seconds added to P each year
    d.ageYears = p.P / (2 * p.Pdot) / CC.YEAR_S;       // characteristic age
    d.bGauss = 3.2e19 * Math.sqrt(p.P * p.Pdot);       // dipole field estimate
  }
  return d;
};

/* Equatorial (J2000, degrees) to galactic longitude/latitude (degrees). */
CC.toGalactic = function (raDeg, decDeg) {
  var r = Math.PI / 180;
  var aG = 192.85948 * r, dG = 27.12825 * r, lN = 122.93192 * r;
  var a = raDeg * r, dd = decDeg * r;
  var sb = Math.sin(dd) * Math.sin(dG) + Math.cos(dd) * Math.cos(dG) * Math.cos(a - aG);
  var b = Math.asin(sb);
  var y = Math.cos(dd) * Math.sin(a - aG);
  var x = Math.sin(dd) * Math.cos(dG) - Math.cos(dd) * Math.sin(dG) * Math.cos(a - aG);
  var l = lN - Math.atan2(y, x);
  l = ((l / r) % 360 + 360) % 360;
  return { l: l, b: b / r };
};

/* Galactocentric position in kpc: Galactic Centre at the origin, Sun at x = -8.2. */
CC.R_SUN_KPC = 8.2;
CC.galacticXYZ = function (p) {
  var g = CC.toGalactic(p.ra, p.dec);
  var r = Math.PI / 180, d = p.distKpc;
  var X = d * Math.cos(g.b * r) * Math.cos(g.l * r);
  var Y = d * Math.cos(g.b * r) * Math.sin(g.l * r);
  var Z = d * Math.sin(g.b * r);
  return { x: -CC.R_SUN_KPC + X, y: Y, z: 0.02 + Z, l: g.l, b: g.b };
};
