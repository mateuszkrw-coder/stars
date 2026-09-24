/* Cosmic Clocks — application glue. */
(function () {
  'use strict';
  var CC = window.CC, P = CC.PULSARS, DSP = CC.DSP, N = P.length;
  function $(s) { return document.querySelector(s); }
  var SLUGS = ['j0901', 'b1919', 'b0329', 'b0950', 'vela', 'b1913', 'crab', 'j0737', 'b1257', 'j0437', 'b1937', 'j1748'];
  var WARPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  var WARP_ONE = 9;
  var byId = {};
  P.forEach(function (p) { byId[p.id] = p; });

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = {
    idx: 1, started: false, playing: false, warp: 1, clean: false, volume: 0.75,
    calm: !!reduced, view: 'close', scanning: false, tunedAt: performance.now(), timers: [], intro: true,
    lastGiantK: null, lastFlare: 0, evMuted: false
  };
  var hashIdx = SLUGS.indexOf((location.hash || '').replace('#', '').toLowerCase());
  if (hashIdx >= 0) state.idx = hashIdx;

  var models = P.map(function (p) { return new DSP.PulseModel(Object.assign({ seed: 7 }, p.sound)); });

  /* ------------------------------------------------------------- clocks
   * Every voice has a phase clock. While sound plays, the clock is read from
   * the synthesiser (so the picture shows the pulse you hear); otherwise it
   * free-runs at the same rate. */
  var clocks = {};
  function parts(id) {
    var isB = id.slice(-2) === ':B';
    var p = byId[isB ? id.slice(0, -2) : id];
    return { p: p, s: isB ? p.sound.partner : p.sound, isB: isB };
  }
  function voiceIds(p) { return p.sound.partner ? [p.id, p.id + ':B'] : [p.id]; }
  function clockFor(id) {
    var c = clocks[id];
    if (!c) {
      var q = parts(id), f = 1 / (q.isB ? q.s.P : q.p.P);
      c = clocks[id] = { f: f, w0: q.s.w0, phi: Math.max(q.s.w0 + 0.001, -1.1 * f * state.warp) };
    }
    return c;
  }

  /* -------------------------------------------------------------- audio */
  var engine = new CC.AudioEngine();
  var live = {};
  function audioOn() { return state.started && engine.ready; }
  function hiss() { return state.clean ? 0.012 : 0.1; }
  function specFor(id) {
    var q = parts(id), c = clockFor(id), s = q.s;
    var k = Math.floor(c.phi - c.w0);
    return {
      P: 1 / c.f, comps: s.comps, sig: s.sig, nulls: s.nulls, giant: s.giant, drift: s.drift, w0: s.w0,
      scint: s.scint, seed: q.isB ? 11 : 7, base: q.isB ? s.gain : 1, k0: k, x0: c.phi - k, g0: 0, gain: 0, tau: 0.3
    };
  }
  function setGain(id, g, tau) {
    if (!audioOn()) return;
    if (g > 0 && live[id] == null) engine.send({ type: 'voice', id: id, spec: specFor(id) });
    if (g > 0 || live[id] != null) engine.send({ type: 'gain', id: id, gain: g, tau: tau || 0.3, kill: g === 0 });
    if (g > 0) live[id] = g; else delete live[id];
  }
  function reseed() {
    Object.keys(live).forEach(function (id) {
      var c = clockFor(id), k = Math.floor(c.phi - c.w0);
      engine.send({ type: 'phase', id: id, k: k, x: c.phi - k });
    });
    engine.clearSnaps();
  }
  function startAudio() {
    if (state.started) { play(); return; }
    state.started = true;
    var init = engine.init();
    init.then(function () {
      engine.setClean(state.clean);
      engine.send({ type: 'global', warp: state.warp, clean: state.clean, hiss: hiss() });
      voiceIds(P[state.idx]).forEach(function (id) { setGain(id, 1, 0.6); });
      engine.setVolume(state.volume, 0.3);
      state.playing = true;
      playUI();
    }).catch(function (e) {
      state.started = false;
      console.warn(e);
      toast('Sound is not available in this browser, but everything else works.');
    });
    state.playing = true;
    playUI();
  }
  function play() {
    if (!state.started) { startAudio(); return; }
    state.playing = true;
    playUI();
    engine.resume().then(function () {
      reseed();
      engine.setVolume(state.volume, 0.12);
    });
  }
  function pause() {
    state.playing = false;
    playUI();
    if (!engine.ready) return;
    engine.setVolume(0, 0.06);
    later(320, function () { if (!state.playing) engine.suspend(); }, true);
  }
  function togglePlay() { if (state.playing) pause(); else play(); }
  function playUI() {
    var b = $('#btn-play');
    b.classList.toggle('on', state.playing);
    b.setAttribute('aria-label', state.playing ? 'Pause' : 'Listen');
  }

  function later(ms, fn, keep) {
    var t = setTimeout(fn, ms);
    if (!keep) state.timers.push(t);
    return t;
  }
  function clearTimers() { state.timers.forEach(clearTimeout); state.timers = []; }

  /* ------------------------------------------------------------- visual */
  var scene = null;
  var canvas = $('#sky');
  try {
    scene = new CC.Scene(canvas);
    scene.applyPreset(state.idx, true);
    scene.cur = state.idx;
    scene.mode = 'map';
    scene.wClose = 0;
  } catch (e) {
    console.warn('WebGL scene unavailable:', e);
    document.body.classList.add('no-webgl');
    scene = null;
  }
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    scene = null;
    document.body.classList.add('no-webgl');
  });

  var stack = new CC.Stack($('#cv-stack'));
  var rclock = new CC.Clock($('#cv-clock'));
  var dial = new CC.Dial($('#cv-dial'), P, { scan: onScan, tune: endScan });
  dial.pos = dial.target = dial.logs[state.idx];

  /* -------------------------------------------------------- formatting */
  var nf = new Intl.NumberFormat('en-US');
  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function sup(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }
  function sci(x, d) {
    var e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e);
    if (m >= 9.95) { m /= 10; e++; }
    return m.toFixed(d == null ? 1 : d) + '×10' + sup(e);
  }
  function fmtRate(f) {
    if (f < 0.1) return f.toFixed(4);
    if (f < 1) return f.toFixed(3);
    if (f < 10) return f.toFixed(2);
    if (f < 100) return f.toFixed(1);
    return f.toFixed(2);
  }
  function fmtHz(f) { return (f >= 100 ? f.toFixed(0) : f >= 10 ? f.toFixed(1) : f >= 1 ? f.toFixed(2) : f.toFixed(3)) + ' Hz'; }
  function fmtLy(ly) {
    var n = ly < 1000 ? Math.round(ly) : Math.round(ly / Math.pow(10, Math.floor(Math.log10(ly)) - 1)) * Math.pow(10, Math.floor(Math.log10(ly)) - 1);
    return nf.format(n);
  }
  function fmtTiny(s) {
    var U = [['s', 1], ['ms', 1e-3], ['µs', 1e-6], ['ns', 1e-9], ['ps', 1e-12], ['fs', 1e-15]];
    for (var i = 0; i < U.length; i++) {
      if (s >= U[i][1] * 0.9995) { var v = s / U[i][1]; return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + U[i][0]; }
    }
    return sci(s) + ' s';
  }
  function fmtBig(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n < 1e10 ? 2 : 1) + ' billion';
    if (n >= 1e6) return (n / 1e6).toFixed(n < 1e7 ? 2 : 1) + ' million';
    return nf.format(Math.round(n));
  }
  function fmtAge(y) {
    if (y < 1e4) return nf.format(Math.round(y / 100) * 100) + ' years';
    if (y < 1e6) return nf.format(Math.round(y / 1000) * 1000) + ' years';
    if (y < 1e9) return (y / 1e6).toFixed(y < 1e7 ? 1 : 0) + ' million years';
    return (y / 1e9).toFixed(1) + ' billion years';
  }
  function fmtDur(s) {
    if (s >= 60) return Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s';
    if (s >= 10) return Math.round(s) + ' s';
    return s.toFixed(1) + ' s';
  }
  var NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  function note(f) {
    var n = 12 * Math.log2(f / 440) + 69, m = Math.round(n);
    return { name: NOTES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1), cents: Math.round((n - m) * 100) };
  }
  function warpLabel(w) {
    if (w === 1) return 'Real time';
    if (w < 1) return Math.round(1 / w) + '× slower';
    return (w < 10 ? w.toFixed(w % 1 ? 1 : 0) : Math.round(w)) + '× faster';
  }
  function hearText(fEff) {
    if (fEff < 0.1) return 'one tick every ' + fmtDur(1 / fEff);
    if (fEff < 8) return Math.round(fEff * 60) + ' beats a minute';
    if (fEff < 20) return 'a ' + fEff.toFixed(1) + ' Hz flutter';
    var n = note(fEff);
    var c = n.cents === 0 ? 'right on it' : (n.cents > 0 ? '+' : '−') + Math.abs(n.cents) + ' cents';
    return 'a tone near ' + n.name + ' (' + c + ')';
  }

  /* ------------------------------------------------------------ station */
  function setText(sel, t) { var el = $(sel); if (el.textContent !== t) el.textContent = t; }
  function swap(el) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }

  function renderStation(i, animate) {
    var p = P[i], d = CC.derive(p);
    setText('#st-index', String(i + 1).padStart(2, '0') + ' / ' + N);
    setText('#st-kind', p.kind);
    setText('#st-name', p.name);
    setText('#st-aka', p.aka || '');
    setText('#st-title', p.title);
    setText('#st-rate', fmtRate(d.f));
    setText('#st-period', 'One turn every ' + p.Pstr);
    setText('#st-story', p.story);
    setText('#st-listen', p.listen);
    $('#st-rec-row').hidden = !p.rec;
    $('#st-rec').href = CC.REC_URL;
    renderHear();

    var rows = [
      ['Distance', '≈ ' + fmtLy(d.distLy) + ' light-years'],
      ['Constellation', p.constellation],
      ['Found', p.year + ' · ' + p.found]
    ];
    if (p.Pdot) {
      rows.push(['Slowing down', 'period +' + fmtTiny(d.agePerYear) + ' per year']);
      rows.push(['Spin-down age', '≈ ' + fmtAge(d.ageYears)]);
      rows.push(['Magnetic field', '≈ ' + sci(d.bGauss) + ' gauss']);
    }
    p.extra.forEach(function (r) { rows.push(r); });
    var dl = $('#facts');
    dl.textContent = '';
    rows.forEach(function (r) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = r[0]; dd.textContent = r[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });

    var calcs = [
      ['Turns per second', 'f = 1 / P = 1 / ' + p.Pstr.replace('≈', '') + ' = <b>' + fmtRate(d.f) + ' Hz</b>'],
      ['Turns per day', '86,400 s × ' + fmtRate(d.f) + ' Hz = <b>' + fmtBig(d.perDay) + '</b>'],
      ['Light cylinder', 'c / 2πf = <b>' + (d.lcKm < 1e5 ? nf.format(Math.round(d.lcKm)) + ' km' : fmtBig(d.lcKm) + ' km') + '</b>' + (d.lcKm < 500 ? ' (only ' + (d.lcKm / CC.R_NS_KM).toFixed(1) + ' star radii)' : '')],
      ['Speed of the equator', '2π × 12 km × f = <b>' + nf.format(Math.round(d.vEqKms)) + ' km/s</b>' + (d.vEqFrac > 0.01 ? ' (' + (d.vEqFrac * 100).toFixed(0) + '% of light speed)' : '')]
    ];
    if (p.Pdot) {
      calcs.push(['Spin-down age', 'P / 2Ṗ = ' + p.Pstr.replace('≈', '') + ' / (2 × ' + sci(p.Pdot) + ') = <b>' + fmtAge(d.ageYears) + '</b>']);
      calcs.push(['Magnetic field', '3.2×10¹⁹ √(PṖ) = <b>' + sci(d.bGauss) + ' G</b>']);
    }
    var ol = $('#calcs');
    ol.textContent = '';
    calcs.forEach(function (c) {
      var li = document.createElement('li'), w = document.createElement('span'), code = document.createElement('code');
      w.className = 'what'; w.textContent = c[0];
      code.innerHTML = c[1];
      li.appendChild(w); li.appendChild(code);
      ol.appendChild(li);
    });

    var dialEl = $('#cv-dial');
    dialEl.setAttribute('aria-valuenow', String(i));
    dialEl.setAttribute('aria-valuetext', p.name + ', ' + fmtRate(d.f) + ' turns per second');
    if (animate) {
      swap($('#identity'));
      swap($('#logbook'));
    }
    $('#logbook').scrollTop = 0;
  }

  function maxWarp(p) { return Math.min(100, 2000 * p.P); }
  function renderHear() {
    var p = P[state.idx], fEff = state.warp / p.P;
    setText('#st-hear-tag', state.warp === 1 ? 'You hear' : warpLabel(state.warp));
    setText('#st-hear', hearText(fEff));
  }

  /* --------------------------------------------------------- navigation */
  function goTo(i, opts) {
    opts = opts || {};
    i = ((i % N) + N) % N;
    var inSky = state.view === 'sky' && !!scene && !opts.close;
    if (i === state.idx && state.view === 'close' && !opts.force) return;
    if (i === state.idx && inSky && !opts.force) return;
    clearTimers();
    stopEvent();
    state.idx = i;
    if (!inSky) state.view = 'close';
    viewUI();
    var p = P[i];
    if (state.warp > maxWarp(p)) setWarpIndex(nearestWarpIndex(maxWarp(p)), true);
    voiceIds(p).forEach(function (id) { if (live[id] == null) delete clocks[id]; clockFor(id); });
    state.tunedAt = performance.now();
    state.lastGiantK = null;
    renderStation(i, true);
    setText('#announce', 'Tuned to ' + p.name + ', ' + p.title + ': ' + fmtRate(1 / p.P) + ' turns per second.');
    rclock.reset(models[i], p, p.id);
    dial.to(i);
    try { history.replaceState(null, '', '#' + SLUGS[i]); } catch (e) { /* sandboxed */ }

    var dur = 1;
    if (scene) {
      if (inSky) { scene.skyTurnTo(i); dur = scene.skyTurn ? scene.skyTurn.dur * 0.6 : 1; }
      else { scene.travel(i, { calm: state.calm }); dur = scene.tr ? scene.tr.dur : 1; }
    }
    if (audioOn()) {
      var keep = voiceIds(p);
      Object.keys(live).forEach(function (id) { if (keep.indexOf(id) < 0) setGain(id, 0, 0.25); });
      var already = keep.every(function (id) { return live[id] != null; });
      engine.send({ type: 'global', stat: already ? 0 : 0.3, wh: 0 });
      later(already ? 0 : Math.max(250, dur * 620), function () {
        keep.forEach(function (id) { setGain(id, 1, 0.45); });
        engine.send({ type: 'global', stat: 0 });
      });
    }
    renderEvents();
  }

  function toggleMap() {
    if (!scene) return;
    if (state.view === 'map') { goTo(state.idx, { force: true, close: true }); return; }
    stopEvent();
    state.view = 'map';
    viewUI();
    renderEvents();
    scene.travel('map', { calm: state.calm });
  }
  function toggleSky() {
    if (!scene) return;
    if (state.view === 'sky') { goTo(state.idx, { force: true, close: true }); return; }
    stopEvent();
    state.view = 'sky';
    viewUI();
    renderEvents();
    scene.travel('sky', { calm: state.calm });
  }
  function viewUI() {
    var name = P[state.idx].short;
    [['#btn-map', '#btn-map-label', 'map', 'Galaxy map'], ['#btn-sky', '#btn-sky-label', 'sky', 'Sky from Earth']].forEach(function (b) {
      var on = state.view === b[2], label = on ? 'Back to ' + name : b[3];
      $(b[0]).setAttribute('aria-pressed', on ? 'true' : 'false');
      $(b[0]).setAttribute('aria-label', label);
      setText(b[1], label);
    });
  }

  /* ------------------------------------------------------ cosmic events */
  var evTimers = [];
  function renderEvents() {
    var p = P[state.idx], ev = p.events || [];
    $('#ev-sn').hidden = ev.indexOf('supernova') < 0;
    $('#ev-glitch').hidden = ev.indexOf('glitch') < 0;
  }
  function evCap(main, sub) {
    var box = $('#evcap');
    if (!main) { box.classList.remove('show'); return; }
    setText('#evcap-main', main);
    setText('#evcap-sub', sub || '');
    box.classList.add('show');
  }
  function stopEvent() {
    evTimers.forEach(clearTimeout);
    evTimers = [];
    evCap(null);
    if (scene) { scene.ev = null; scene.evp = null; }
    if (state.evMuted) {
      state.evMuted = false;
      if (audioOn()) voiceIds(P[state.idx]).forEach(function (id) { setGain(id, 1, 0.4); });
    }
  }
  function canRunEvent() { return !!scene && state.view === 'close' && scene.mode === 'close'; }
  /* A few seconds of history: the star, its collapse, the explosion, and the
   * pulsar switching on inside the remnant. */
  function runSupernova() {
    if (!canRunEvent()) return;
    stopEvent();
    var p = P[state.idx], ids = voiceIds(p);
    scene.startEvent('supernova');
    if (audioOn()) { ids.forEach(function (id) { setGain(id, 0, 0.35); }); state.evMuted = true; }
    evCap(p.snWhen[0], p.snWhen[1]);
    evTimers.push(setTimeout(function () { evCap(null); }, 3300));
    evTimers.push(setTimeout(function () { if (audioOn()) engine.send({ type: 'boom', amp: 0.6, dur: 3.4 }); }, 3700));
    evTimers.push(setTimeout(function () {
      if (audioOn()) ids.forEach(function (id) { setGain(id, 1, 0.9); });
      state.evMuted = false;
      evCap(p.snNow[0], p.snNow[1]);
    }, 7400));
    evTimers.push(setTimeout(function () { evCap(null); }, 11400));
  }
  /* A glitch: the crust cracks, the spin jumps and slowly relaxes. Real Vela
   * glitches change the rate by about a millionth; this one is exaggerated so
   * you can hear it. */
  function runGlitch() {
    if (!canRunEvent()) return;
    stopEvent();
    var p = P[state.idx], c = clockFor(p.id);
    scene.startEvent('glitch');
    c.glD = 0.03; c.glT0 = performance.now(); c.glTau = 6;
    if (audioOn()) {
      engine.send({ type: 'glitch', id: p.id, df: 0.03, tau: 6 });
      engine.send({ type: 'boom', amp: 0.3, dur: 0.5 });
    }
    evCap('Glitch', 'the spin suddenly jumps, then relaxes (exaggerated so you can hear it)');
    evTimers.push(setTimeout(function () { evCap(null); }, 4600));
  }

  /* ------------------------------------------------------------- dial */
  function onScan(lg) {
    state.scanning = true;
    var best = 0, bw = 0, bd = 9, weights = [];
    P.forEach(function (p, k) {
      var d = lg - Math.log10(1 / p.P), w = Math.exp(-(d / 0.045) * (d / 0.045));
      weights[k] = w;
      if (w > bw) { bw = w; best = k; }
      if (Math.abs(d) < bd) bd = Math.abs(d);
    });
    if (audioOn() && state.playing) {
      P.forEach(function (p, k) {
        var w = weights[k] > 0.01 ? weights[k] : 0;
        voiceIds(p).forEach(function (id) { if (w > 0 || live[id] != null) setGain(id, w, 0.06); });
      });
      engine.send({ type: 'global', stat: 0.42 * Math.pow(1 - bw, 1.3), wh: bw > 0.02 ? 0.45 * (1 - bw) : 0.12, whF: 220 + 2600 * Math.min(1, bd / 0.35) });
    }
    setText('#dial-status', bw > 0.5 ? 'Receiving ' + P[best].short : 'Scanning ' + fmtHz(Math.pow(10, lg)));
  }
  function endScan(i) {
    state.scanning = false;
    setText('#dial-status', '');
    if (audioOn()) engine.send({ type: 'global', stat: 0, wh: 0 });
    if (i === state.idx && state.view !== 'map') {
      if (audioOn() && state.playing) {
        var keep = voiceIds(P[i]);
        Object.keys(live).forEach(function (id) { if (keep.indexOf(id) < 0) setGain(id, 0, 0.2); });
        keep.forEach(function (id) { setGain(id, 1, 0.2); });
      }
      return;
    }
    goTo(i);
  }

  /* ----------------------------------------------------- time and signal */
  var warpIn = $('#in-warp');
  warpIn.min = '0'; warpIn.max = String(WARPS.length - 1); warpIn.step = '1'; warpIn.value = String(WARP_ONE);
  function nearestWarpIndex(w) {
    var best = 0;
    for (var i = 0; i < WARPS.length; i++) if (WARPS[i] <= w + 1e-9) best = i;
    return best;
  }
  function setWarpIndex(i, silent) {
    i = Math.max(0, Math.min(WARPS.length - 1, i));
    var w = WARPS[i], mw = maxWarp(P[state.idx]);
    if (w > mw) { i = nearestWarpIndex(mw); w = WARPS[i]; if (!silent) toast('Capped at ' + warpLabel(w) + ': any faster and this pulsar would sing above 2 kHz.'); }
    warpIn.value = String(i);
    state.warp = w;
    setText('#out-warp', warpLabel(w));
    if (audioOn()) engine.send({ type: 'global', warp: w });
    renderHear();
  }
  warpIn.addEventListener('input', function () { setWarpIndex(+warpIn.value); });

  function setSignal(clean) {
    state.clean = clean;
    $('#sig-raw').setAttribute('aria-pressed', clean ? 'false' : 'true');
    $('#sig-clean').setAttribute('aria-pressed', clean ? 'true' : 'false');
    if (audioOn()) { engine.setClean(clean); engine.send({ type: 'global', clean: clean, hiss: hiss() }); }
  }
  $('#sig-raw').addEventListener('click', function () { setSignal(false); });
  $('#sig-clean').addEventListener('click', function () { setSignal(true); });

  var volIn = $('#in-vol');
  volIn.addEventListener('input', function () {
    state.volume = +volIn.value / 100;
    if (audioOn() && state.playing) engine.setVolume(state.volume);
  });

  /* ------------------------------------------------------------ buttons */
  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-prev').addEventListener('click', function () { goTo(state.idx - 1); });
  $('#btn-next').addEventListener('click', function () { goTo(state.idx + 1); });
  $('#btn-map').addEventListener('click', toggleMap);
  $('#btn-sky').addEventListener('click', toggleSky);
  $('#btn-tour').addEventListener('click', startTour);
  $('#btn-watch').addEventListener('click', startTour);
  $('#btn-exit-tour').addEventListener('click', stopTour);
  $('#ev-sn').addEventListener('click', runSupernova);
  $('#ev-glitch').addEventListener('click', runGlitch);
  $('#btn-log').addEventListener('click', function () {
    var open = document.body.classList.toggle('log-open');
    $('#btn-log').setAttribute('aria-expanded', open ? 'true' : 'false');
    $('#btn-log').setAttribute('aria-pressed', open ? 'true' : 'false');
    updateLens();
  });

  function closeIntro() {
    if (!state.intro) return;
    state.intro = false;
    $('#intro').classList.add('gone');
    $('#intro').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('intro-on');
    setTimeout(updateLens, 50);
  }
  function openIntro() {
    state.intro = true;
    var el = $('#intro');
    el.classList.remove('gone');
    el.removeAttribute('aria-hidden');
    document.body.classList.add('intro-on');
    $('#btn-start').focus();
  }
  $('#btn-start').addEventListener('click', function () { closeIntro(); startAudio(); goTo(state.idx, { force: true }); });
  $('#btn-silent').addEventListener('click', function () { closeIntro(); goTo(state.idx, { force: true }); });
  $('#jump-fastest').addEventListener('click', function (e) { e.preventDefault(); closeIntro(); startAudio(); goTo(11, { force: true }); });
  $('#jump-first').addEventListener('click', function (e) { e.preventDefault(); closeIntro(); startAudio(); goTo(1, { force: true }); });
  $('#brand').addEventListener('click', function (e) { e.preventDefault(); openIntro(); });

  var about = $('#about'), lastFocus = null;
  function openAbout() { lastFocus = document.activeElement; about.hidden = false; $('#btn-close').focus(); }
  function closeAbout() { about.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  $('#btn-about').addEventListener('click', openAbout);
  $('#btn-close').addEventListener('click', closeAbout);
  about.addEventListener('click', function (e) { if (e.target === about) closeAbout(); });
  var calmIn = $('#in-calm');
  calmIn.checked = state.calm;
  calmIn.addEventListener('change', function () { state.calm = calmIn.checked; });

  document.addEventListener('keydown', function (e) {
    if (tour) { e.preventDefault(); stopTour(); return; }
    if (!about.hidden) { if (e.key === 'Escape') closeAbout(); return; }
    if (state.intro) { if (e.key === 'Escape') { closeIntro(); goTo(state.idx, { force: true }); } return; }
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': goTo(state.idx + 1); e.preventDefault(); break;
      case 'ArrowLeft': goTo(state.idx - 1); e.preventDefault(); break;
      case ' ':
        if (tag === 'BUTTON' || tag === 'A') return;
        togglePlay(); e.preventDefault(); break;
      case 'm': case 'M': toggleMap(); break;
      case 's': case 'S': toggleSky(); break;
      case 't': case 'T': startTour(); break;
      case '[': setWarpIndex(+warpIn.value - 1); break;
      case ']': setWarpIndex(+warpIn.value + 1); break;
      case '0': setWarpIndex(WARP_ONE); break;
      case 'Escape':
        if (document.body.classList.contains('log-open')) $('#btn-log').click();
        else if (state.view !== 'close') goTo(state.idx, { force: true, close: true });
        break;
      case '?': case 'i': case 'I': openAbout(); break;
    }
  });

  /* ------------------------------------------------ dragging the sky */
  var drag = null;
  canvas.addEventListener('pointerdown', function (e) {
    if (!scene) return;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, id: e.pointerId };
    scene.dragging = true;
    canvas.classList.add('dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag || !scene) return;
    scene.orbit(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  function endDrag(e) {
    if (!drag) return;
    var moved = Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0);
    drag = null;
    if (scene) scene.dragging = false;
    canvas.classList.remove('dragging');
    if (moved < 6 && scene && scene.mode === 'map') {
      var r = canvas.getBoundingClientRect(), k = scene.pick(e.clientX - r.left, e.clientY - r.top);
      if (k >= 0) goTo(k, { force: true });
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', function (e) {
    if (!scene) return;
    e.preventDefault();
    scene.zoomBy(Math.exp(-e.deltaY * 0.0012));
  }, { passive: false });

  /* ------------------------------------------------------------ labels */
  var labelRoot = $('#labels'), labelEls = {}, blockers = [];
  /* Screen areas covered by panels: scene labels there are hidden. */
  function measureBlockers() {
    blockers = [];
    if (window.innerWidth <= 760) {
      // phones: the text scrolls up over the scene, so labels stay above it
      var t = $('#identity').getBoundingClientRect().top;
      blockers.push([-1e5, t - 6, 1e5, 1e5]);
      return;
    }
    ['#identity', '.instruments', '.settings', '#logbook', '.console', '.topbar .top-actions'].forEach(function (sel) {
      var el = $(sel);
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.width && r.height && r.right > 0 && r.left < window.innerWidth) blockers.push([r.left - 6, r.top - 6, r.right + 6, r.bottom + 6]);
    });
  }
  function blocked(x, y, w, h) {
    for (var i = 0; i < blockers.length; i++) {
      var b = blockers[i];
      if (x < b[2] && x + w > b[0] && y < b[3] && y + h > b[1]) return true;
    }
    return false;
  }
  function syncLabels() {
    var L = scene ? scene.labels : [], seen = {}, placed = [];
    L.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < L.length; i++) {
      var l = L[i], el = labelEls[l.key];
      if (!el) {
        el = document.createElement(l.kind === 'marker' ? 'button' : 'div');
        el.className = 'lbl ' + l.kind;
        if (l.kind === 'marker') {
          el.type = 'button';
          el.tabIndex = -1;
          el.addEventListener('click', function () { goTo(this._idx, { force: true }); });
        }
        labelRoot.appendChild(el);
        labelEls[l.key] = el;
      }
      var txt = l.text + (l.sub ? '|' + l.sub : '');
      if (el._t !== txt) {
        el._t = txt;
        el.textContent = l.text;
        if (l.sub) { var s = document.createElement('small'); s.textContent = l.sub; el.appendChild(s); }
        el._w = el.offsetWidth; el._h = el.offsetHeight;
      }
      el._idx = l.idx;
      var x, y;
      if (l.kind === 'marker' || l.kind === 'sun' || l.kind === 'skycur') {
        x = l.x + (l.kind === 'skycur' ? 20 : 10); y = l.y - el._h / 2;
        for (var tries = 0; tries < 8; tries++) {
          var hit = false;
          for (var j = 0; j < placed.length; j++) {
            var q = placed[j];
            if (x < q.x + q.w && x + el._w > q.x && y < q.y + q.h && y + el._h > q.y) { hit = true; y = q.y + q.h + 1; }
          }
          if (!hit) break;
        }
        placed.push({ x: x, y: y, w: el._w, h: el._h });
      } else if (l.kind === 'const') {
        x = l.x - el._w / 2; y = l.y - el._h / 2;
      } else {
        x = l.x - el._w / 2; y = l.y - el._h - 4;
      }
      el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      var hide = !state.intro && blocked(x, y, el._w, el._h);
      el.style.opacity = hide ? '0' : String(Math.min(1, l.a * (l.kind === 'note' ? 0.75 + 0.5 * (l.glow || 0) : 1)));
      el.style.visibility = hide ? 'hidden' : '';
      el.classList.toggle('cur', !!l.cur);
      seen[l.key] = 1;
    }
    for (var k in labelEls) if (!seen[k]) { labelEls[k].remove(); delete labelEls[k]; }
  }

  /* ------------------------------------------------------------ layout */
  function updateLens() {
    measureBlockers();
    if (!scene) return;
    var W = window.innerWidth, H = window.innerHeight;
    if (W <= 760) return;
    var left = $('#identity').getBoundingClientRect().right;
    var lb = $('#logbook'), right = W;
    var drawer = getComputedStyle(lb).position === 'fixed';
    if (!drawer || document.body.classList.contains('log-open')) right = lb.getBoundingClientRect().left;
    var top = $('.topbar').getBoundingClientRect().bottom, bottom = $('.console').getBoundingClientRect().top;
    var cx = (left + right) / 2, cy = (top + bottom) / 2;
    scene.lensShift = [cx / W * 2 - 1, 1 - cy / H * 2];
    $('#events').style.left = cx.toFixed(0) + 'px';
    $('#evcap').style.left = cx.toFixed(0) + 'px';
  }
  window.addEventListener('resize', updateLens);
  window.addEventListener('scroll', function () { if (window.innerWidth <= 760) measureBlockers(); }, { passive: true });

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, 4200);
  }

  /* -------------------------------------------------------------- tour */
  var tour = null;
  function startTour() {
    if (tour) return;
    if (!scene) { toast('The tour needs WebGL, which is not available in this browser.'); return; }
    closeIntro();
    if (!state.started) startAudio(); else if (!state.playing) play();
    tour = { i: -1, phase: 'travel', t: 0, dwell: 10, fs: false, fired: false };
    scene.cinema = true;
    document.body.classList.add('cinema');
    var el = document.documentElement;
    try {
      if (el.requestFullscreen && !document.fullscreenElement) {
        var req = el.requestFullscreen();
        if (req && req.then) req.then(function () { if (tour) tour.fs = true; }).catch(function () { /* not allowed here */ });
      }
    } catch (e) { /* not allowed here */ }
    tourNext();
  }
  function tourNext() {
    if (!tour) return;
    $('#cine').classList.remove('show');
    tour.i = tour.i >= N ? 0 : tour.i + 1;
    tour.t = 0; tour.phase = 'travel'; tour.fired = false;
    if (tour.i < N) goTo(tour.i, { force: true, close: true });
    else if (state.view !== 'sky') toggleSky();
  }
  function showCine() {
    var p = P[state.idx], home = tour && tour.i >= N;
    setText('#cine-eyebrow', home ? 'All twelve, seen from home' : String(state.idx + 1).padStart(2, '0') + ' / ' + N + ' \u00b7 ' + p.constellation);
    setText('#cine-name', home ? 'The sky from Earth' : p.name);
    setText('#cine-title', home ? 'Every marker is a dead star, still keeping time' : p.title);
    setText('#cine-rate', home ? '' : fmtRate(1 / p.P));
    setText('#cine-unit', home ? '' : 'turns per second');
    $('#cine').classList.add('show');
  }
  function tourTick(dt) {
    if (!tour || !scene) return;
    tour.t += dt;
    var p = P[state.idx];
    if (tour.phase === 'travel') {
      if (scene.mode !== 'travel') {
        tour.phase = 'dwell';
        tour.t = 0;
        tour.dwell = tour.i >= N ? 12 : p.id === 'B0531+21' ? 16 : 11;
        showCine();
      }
      return;
    }
    if (!tour.fired && tour.i < N) {
      if (p.id === 'B0531+21' && tour.t > 2.2) { tour.fired = true; runSupernova(); }
      else if (p.id === 'B0833-45' && tour.t > 4) { tour.fired = true; runGlitch(); }
    }
    if (tour.t > tour.dwell - 1.2) $('#cine').classList.remove('show');
    if (tour.t > tour.dwell) tourNext();
  }
  function stopTour() {
    if (!tour) return;
    var fs = tour.fs;
    tour = null;
    $('#cine').classList.remove('show');
    if (scene) scene.cinema = false;
    document.body.classList.remove('cinema');
    if (fs && document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }
    setTimeout(updateLens, 80);
  }
  document.addEventListener('pointerdown', function () { if (tour) stopTour(); }, true);
  document.addEventListener('fullscreenchange', function () { if (tour && tour.fs && !document.fullscreenElement) stopTour(); });

  /* -------------------------------------------------------------- loop */
  var flashState = 0, lastT = performance.now(), textT = 0, blockT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;

    // phases: from the synthesiser while it plays, otherwise free-running
    var tH = state.playing && engine.running() ? engine.heardTime() : null;
    for (var id in clocks) {
      var c = clocks[id], got = tH != null && live[id] != null ? engine.phase(id, tH) : null;
      if (got) { c.phi = got.phi; c.fNow = got.f; }
      else {
        var fm = c.glD ? 1 + c.glD * Math.exp(-(now - c.glT0) / 1000 / c.glTau) : 1;
        c.fNow = c.f * state.warp * fm;
        c.phi += c.fNow * dt;
      }
    }
    var p = P[state.idx], m = models[state.idx], cc = clockFor(p.id);
    var fEff = cc.fNow || cc.f * state.warp;
    var k = Math.floor(cc.phi - cc.w0), env = m.value(k, cc.phi - k, 1);
    // giant pulses: flash the beam that points at us, in step with the crack you hear
    var gk = Math.floor(cc.phi);
    if (state.lastGiantK === null || gk < state.lastGiantK || gk - state.lastGiantK > 5000) state.lastGiantK = gk;
    else if (m.giant && gk > state.lastGiantK) {
      for (var kk = Math.max(state.lastGiantK + 1, gk - 80); kk <= gk; kk++) {
        if (m.isGiant(kk) && now - state.lastFlare > 450) { state.lastFlare = now; if (scene && !state.calm) scene.flare(1); break; }
      }
      state.lastGiantK = gk;
    }
    flashState = Math.max(Math.min(env, 2), flashState * Math.exp(-dt / 0.16));
    // flashes fade out above 2 turns a second (no strobing), and in calm mode
    var fg = state.calm ? 0.1 : fEff <= 2 ? 1 : fEff >= 4 ? 0 : 1 - (fEff - 2) / 2;
    var flash = flashState * fg + 0.22 * (1 - fg);
    var envVis = fEff < 4 ? Math.min(1, flashState) : 0.4;
    var partner = null;
    if (p.sound.partner) { var cb = clockFor(p.id + ':B'); partner = { phi: cb.phi, f: cb.f * state.warp }; }

    stack.draw(m, cc.phi, fEff, p, state.calm);
    rclock.accumulate(m, cc.phi);
    rclock.draw(cc.phi, fEff, p, state.calm);
    dial.draw(state.idx, dt);
    if (scene) {
      try {
        scene.frame({ dt: dt, phi: cc.phi, f: fEff, env: env, flash: flash, envVis: envVis, partner: partner, calm: state.calm });
      } catch (err) {
        console.warn('Scene stopped:', err);
        scene = null;
        document.body.classList.add('no-webgl');
      }
    }
    syncLabels();
    tourTick(dt);

    textT -= dt;
    if (textT <= 0) {
      textT = 0.12;
      var pe = 1 / fEff;
      if (pe >= 3) {
        var next = (Math.ceil(cc.phi) - cc.phi) * pe;
        $('#st-since').innerHTML = 'Next pulse in <b>' + fmtDur(next) + '</b>';
      } else {
        var turns = (now - state.tunedAt) / 1000 * cc.f;
        $('#st-since').innerHTML = 'Since you tuned in, it has turned <b>' + nf.format(Math.floor(turns)) + '</b> times';
      }
      var every = stack.every;
      setText('#stack-meta', every === 1 ? '1 line = 1 turn' : '1 line per ' + nf.format(every) + ' turns');
      setText('#clock-meta', rclock.count ? nf.format(rclock.count) + ' folded' : 'listening');
      var lv = engine.level();
      $('#vu').style.height = Math.min(100, lv * 380).toFixed(0) + '%';
      var evShow = state.view === 'close' && !tour && !!P[state.idx].events && !!scene && scene.mode === 'close';
      var evBox = $('#events');
      if (evBox.hidden === evShow) evBox.hidden = !evShow;
      blockT -= 0.12;
      if (blockT <= 0) { blockT = 1; measureBlockers(); }
    }
  }

  /* -------------------------------------------------------------- boot */
  if (state.intro) document.body.classList.add('intro-on');
  renderStation(state.idx, false);
  rclock.reset(models[state.idx], P[state.idx], P[state.idx].id);
  setWarpIndex(WARP_ONE, true);
  viewUI();
  renderEvents();
  playUI();
  if (scene) {
    scene.onArrive = function () { updateLens(); };
    requestAnimationFrame(function () { updateLens(); });
  }
  requestAnimationFrame(frame);
  window.CCApp = { state: state, goTo: goTo, scene: function () { return scene; }, engine: engine };
})();
