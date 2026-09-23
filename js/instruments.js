/* Cosmic Clocks — 2D instruments: pulse stack, rotation clock, tuning dial. */
(function () {
  'use strict';
  var CC = window.CC, DSP = CC.DSP;
  var TAU = Math.PI * 2;

  var INK = '#e9edf6', INK2 = '#aab3c7', INK3 = '#6b7489', ICE = '#9fe7ff', AMBER = '#ffb547', BG = '#05070e';

  function fit(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  /* ------------------------------------------------------------------
   * Single pulses, stacked like the famous 1970 plot of CP 1919 that became
   * the cover of Unknown Pleasures. Newest turn at the bottom; each row
   * occludes the ones behind it. */
  function Stack(canvas) { this.c = canvas; this.every = 1; }
  Stack.prototype.draw = function (model, phi, fEff, p, calm) {
    var F = fit(this.c);
    if (!F) return;
    var ctx = F.ctx, W = F.w, H = F.h;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    var win = p.sound.win;
    var m = Math.max(1, Math.ceil(fEff / (calm ? 2 : 3.2)));
    this.every = m;
    var rows = Math.max(12, Math.min(34, Math.floor(H / 5.2)));
    var R = (phi - win[0]) / m;
    var jNow = Math.floor(R), frac = R - jNow;
    var top = 10, bottom = H - 8;
    var gap = (bottom - top) / (rows + 4.5);
    var amp = gap * 5.4;
    var x0 = W * 0.12, x1 = W * 0.88, N = Math.max(60, Math.min(150, Math.round((x1 - x0) / 2.2)));
    var span = win[1] - win[0];
    ctx.lineJoin = 'round';
    for (var r = rows; r >= 0; r--) {
      var j = jNow - r;
      var k = j * m;
      var base = bottom - (r + frac) * gap;
      if (base < top + amp * 0.2) continue;
      var upto = 1;
      if (r === 0 && m === 1) upto = Math.max(0, Math.min(1, (phi - (k + win[0])) / span));
      var n = Math.max(2, Math.round(N * upto));
      var xs = this.xs || (this.xs = new Float32Array(200)), ys = this.ys || (this.ys = new Float32Array(200));
      for (var i = 0; i < n; i++) {
        var u = i / (N - 1), v = model.value(k, win[0] + span * u, 1);
        xs[i] = x0 + (x1 - x0) * u;
        ys[i] = base - (Math.min(v, 2.6) + 0.045 * DSP.gauss(k, 7000 + i)) * amp;
      }
      ctx.beginPath();
      ctx.moveTo(x0, base);
      for (i = 0; i < n; i++) ctx.lineTo(xs[i], ys[i]);
      ctx.lineTo(xs[n - 1], base);
      ctx.closePath();
      ctx.fillStyle = BG;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i]);
      var fresh = r === 0 ? 1 : r === 1 ? 0.5 * (1 - frac) : 0;
      var fadeTop = Math.min(1, (base - top) / (gap * 6));
      ctx.strokeStyle = fresh > 0 ? 'rgba(159,231,255,' + (0.55 + 0.45 * fresh) + ')' : 'rgba(233,237,246,' + (0.78 * fadeTop).toFixed(3) + ')';
      ctx.lineWidth = fresh > 0 ? 1.4 : 1.05;
      ctx.stroke();
    }
  };

  /* ------------------------------------------------------------------
   * Rotation clock: the folded (averaged) pulse profile drawn around a dial,
   * with a hand that turns once per rotation. Folding thousands of noisy
   * single pulses is how astronomers get a pulsar's stable "fingerprint". */
  var NB = 240;
  function Clock(canvas) {
    this.c = canvas;
    this.sum = new Float64Array(NB);
    this.tmpl = new Float64Array(NB);
    this.count = 0;
    this.lastK = null;
    this.key = '';
  }
  Clock.prototype.reset = function (model, p, id) {
    this.sum.fill(0);
    this.count = 0;
    this.lastK = null;
    this.key = id;
    this.w0 = p.sound.w0;
    var mx = 0, i;
    for (i = 0; i < NB; i++) { var x = this.w0 + (i + 0.5) / NB; this.tmpl[i] = model.mean(x, 1) / model.peak; if (this.tmpl[i] > mx) mx = this.tmpl[i]; }
  };
  Clock.prototype.accumulate = function (model, phi) {
    var kNow = Math.floor(phi - this.w0);
    if (this.lastK === null || kNow < this.lastK || kNow - this.lastK > 100000) { this.lastK = kNow; return; }
    var todo = kNow - this.lastK;
    if (todo <= 0) return;
    var from = Math.max(this.lastK, kNow - 24);
    for (var k = from; k < kNow; k++) {
      for (var i = 0; i < NB; i++) {
        var x = this.w0 + (i + 0.5) / NB;
        this.sum[i] += model.value(k, x, 1) + 0.32 * DSP.gauss(k, 9001 + i);
      }
      this.count++;
    }
    this.lastK = kNow;
  };
  Clock.prototype.draw = function (phi, fEff, p, calm) {
    var F = fit(this.c);
    if (!F) return;
    var ctx = F.ctx, W = F.w, H = F.h;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2 + 2, Rr = Math.min(W, H) * 0.44, r0 = Rr * 0.36;
    var i, a;
    // dial ticks: twelve, like a clock face
    ctx.strokeStyle = 'rgba(170,179,199,0.35)';
    ctx.lineWidth = 1;
    for (i = 0; i < 12; i++) {
      a = -Math.PI / 2 + i / 12 * TAU;
      var len = i % 3 === 0 ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (Rr + 3), cy + Math.sin(a) * (Rr + 3));
      ctx.lineTo(cx + Math.cos(a) * (Rr + 3 + len), cy + Math.sin(a) * (Rr + 3 + len));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, TAU);
    ctx.strokeStyle = 'rgba(170,179,199,0.18)';
    ctx.stroke();

    var w0 = this.w0;
    function ang(x) { return -Math.PI / 2 + x * TAU; }
    // template (expected shape) as a faint dashed outline
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    for (i = 0; i <= NB; i++) {
      var ii = i % NB, x = w0 + (ii + 0.5) / NB, rr = r0 + (Rr - r0) * this.tmpl[ii];
      a = ang(x);
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.strokeStyle = 'rgba(255,181,71,0.45)';
    ctx.stroke();
    ctx.setLineDash([]);

    // folded profile
    if (this.count > 0) {
      var avg = new Float64Array(NB), mx = -1e9, mn = 1e9;
      for (i = 0; i < NB; i++) { avg[i] = this.sum[i] / this.count; if (avg[i] > mx) mx = avg[i]; if (avg[i] < mn) mn = avg[i]; }
      var sc = Math.max(mx, 0.25);
      ctx.beginPath();
      for (i = 0; i <= NB; i++) {
        var j = i % NB, xx = w0 + (j + 0.5) / NB, v = Math.max(-0.35, avg[j] / sc);
        var r2 = r0 + (Rr - r0) * v;
        a = ang(xx);
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); else ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      }
      ctx.closePath();
      var gr = ctx.createRadialGradient(cx, cy, r0 * 0.6, cx, cy, Rr);
      gr.addColorStop(0, 'rgba(159,231,255,0.02)');
      gr.addColorStop(1, 'rgba(159,231,255,0.28)');
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.strokeStyle = 'rgba(159,231,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // the hand
    var ph = ((phi % 1) + 1) % 1;
    var ha = ang(ph);
    if (fEff > 3 || calm && fEff > 1) {
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rr);
      g.addColorStop(0, 'rgba(255,181,71,0.18)');
      g.addColorStop(1, 'rgba(255,181,71,0.02)');
      ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, TAU); ctx.fillStyle = g; ctx.fill();
    } else {
      var trail = Math.min(TAU * 0.9, TAU * fEff * 0.18 + 0.25);
      var steps = 18;
      for (i = 0; i < steps; i++) {
        var t0 = ha - trail * (i + 1) / steps, t1 = ha - trail * i / steps;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, Rr, t0, t1);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,181,71,' + (0.13 * (1 - i / steps)).toFixed(3) + ')';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ha) * (Rr + 2), cy + Math.sin(ha) * (Rr + 2));
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fillStyle = AMBER; ctx.fill();
    // pulse marker at 12 o'clock
    ctx.fillStyle = INK3;
    ctx.font = '500 9px "Martian Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PULSE', cx, cy - Rr - 14 > 8 ? cy - Rr - 14 : 9);
  };

  /* ------------------------------------------------------------------
   * The tuning dial: a logarithmic scale of spin rates, like the backlit
   * glass of an old radio. Drag to scan; release to lock onto a station. */
  var LOG_MIN = -2.25, LOG_MAX = 3.2;
  function Dial(canvas, pulsars, handlers) {
    this.c = canvas;
    this.P = pulsars;
    this.h = handlers;
    this.logs = pulsars.map(function (p) { return Math.log10(1 / p.P); });
    this.pos = this.logs[0];
    this.target = this.pos;
    this.view = null;
    this.dragging = false;
    this.hover = -1;
    var self = this;
    canvas.addEventListener('pointerdown', function (e) { self.down(e); });
    canvas.addEventListener('pointermove', function (e) { self.move(e); });
    canvas.addEventListener('pointerup', function (e) { self.up(e); });
    canvas.addEventListener('pointercancel', function (e) { self.up(e); });
    canvas.addEventListener('pointerleave', function () { self.hover = -1; });
  }
  Dial.prototype.layout = function (W) {
    var pad = 22, full = (W - pad * 2) / (LOG_MAX - LOG_MIN);
    var ppd = Math.max(full, 150);
    var center;
    if (ppd === full) center = (LOG_MIN + LOG_MAX) / 2;
    else {
      var half = (W / 2 - pad) / ppd;
      center = Math.max(LOG_MIN + half, Math.min(LOG_MAX - half, this.pos));
      if (this.view != null && !this.dragging) center = this.view + (center - this.view) * 0.15;
      this.view = center;
    }
    this.ppd = ppd; this.center = center; this.W = W;
  };
  Dial.prototype.xOf = function (lg) { return this.W / 2 + (lg - this.center) * this.ppd; };
  Dial.prototype.lgOf = function (x) { return this.center + (x - this.W / 2) / this.ppd; };
  Dial.prototype.nearest = function (lg) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < this.logs.length; i++) { var d = Math.abs(this.logs[i] - lg); if (d < bd) { bd = d; best = i; } }
    return { i: best, d: bd };
  };
  Dial.prototype.evX = function (e) { var r = this.c.getBoundingClientRect(); return e.clientX - r.left; };
  Dial.prototype.down = function (e) {
    this.dragging = true;
    this.moved = 0;
    this.startX = this.evX(e);
    try { this.c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.grab = this.lgOf(this.startX) - this.pos;
    if (Math.abs(this.xOf(this.pos) - this.startX) > 14) this.grab = 0;
    if (this.grab === 0) this.setPos(this.lgOf(this.startX));
    e.preventDefault();
  };
  Dial.prototype.move = function (e) {
    var x = this.evX(e);
    if (!this.dragging) {
      var n = this.nearest(this.lgOf(x));
      this.hover = Math.abs(this.xOf(this.logs[n.i]) - x) < 16 ? n.i : -1;
      return;
    }
    this.moved += Math.abs(x - (this.lastX == null ? x : this.lastX));
    this.lastX = x;
    this.setPos(this.lgOf(x) - this.grab);
  };
  Dial.prototype.setPos = function (lg) {
    this.pos = Math.max(LOG_MIN + 0.02, Math.min(LOG_MAX - 0.02, lg));
    this.target = this.pos;
    if (this.h.scan) this.h.scan(this.pos);
  };
  Dial.prototype.up = function () {
    if (!this.dragging) return;
    this.dragging = false;
    this.lastX = null;
    var n = this.nearest(this.pos);
    this.target = this.logs[n.i];
    if (this.h.tune) this.h.tune(n.i);
  };
  Dial.prototype.to = function (i) { this.target = this.logs[i]; };

  Dial.prototype.draw = function (cur, dt) {
    var F = fit(this.c);
    if (!F) return;
    var ctx = F.ctx, W = F.w, H = F.h, i;
    if (!this.dragging) this.pos += (this.target - this.pos) * (1 - Math.exp(-dt * 7));
    this.layout(W);
    // backlit glass
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#07080c');
    bg.addColorStop(1, '#120d07');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    var glow = ctx.createRadialGradient(this.xOf(this.pos), H, 0, this.xOf(this.pos), H, W * 0.45);
    glow.addColorStop(0, 'rgba(255,170,60,0.16)');
    glow.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    var yScale = Math.round(H * 0.56);
    // perception zones
    var zones = [[LOG_MIN, Math.log10(8), 'BEATS'], [Math.log10(8), Math.log10(20), 'FLUTTER'], [Math.log10(20), LOG_MAX, 'TONES']];
    ctx.font = '500 8.5px "Martian Mono", ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';
    for (i = 0; i < zones.length; i++) {
      var za = this.xOf(zones[i][0]), zb = this.xOf(zones[i][1]);
      ctx.fillStyle = i === 1 ? 'rgba(255,181,71,0.05)' : 'rgba(255,255,255,0.0)';
      ctx.fillRect(za, yScale + 1, zb - za, H - yScale);
      if (i > 0) { ctx.fillStyle = 'rgba(255,181,71,0.25)'; ctx.fillRect(Math.round(za), yScale + 2, 1, H - yScale - 4); }
      var zx = Math.max(za, 0) + 6;
      if (zx < zb - 30) { ctx.fillStyle = 'rgba(255,196,120,0.42)'; ctx.textAlign = 'left'; ctx.fillText(zones[i][2], zx, H - 7); }
    }
    // scale line and ticks
    ctx.strokeStyle = 'rgba(255,196,120,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.xOf(LOG_MIN), yScale + 0.5);
    ctx.lineTo(this.xOf(LOG_MAX), yScale + 0.5);
    ctx.stroke();
    ctx.textAlign = 'center';
    for (var d = -2; d <= 3; d++) {
      for (var m = 1; m < 10; m++) {
        var lg = d + Math.log10(m);
        if (lg < LOG_MIN || lg > LOG_MAX) continue;
        var x = Math.round(this.xOf(lg)) + 0.5;
        if (x < -10 || x > W + 10) continue;
        var major = m === 1;
        ctx.beginPath();
        ctx.moveTo(x, yScale - (major ? 7 : m === 5 ? 4.5 : 3));
        ctx.lineTo(x, yScale + (major ? 7 : 3));
        ctx.strokeStyle = major ? 'rgba(255,196,120,0.8)' : 'rgba(255,196,120,0.35)';
        ctx.stroke();
        if (major) {
          ctx.fillStyle = 'rgba(255,205,140,0.75)';
          var lab = d < 0 ? (d === -2 ? '0.01' : '0.1') : d === 3 ? '1k' : String(Math.pow(10, d));
          ctx.fillText(lab + (d === 0 ? ' Hz' : ''), x, yScale + 18);
        }
      }
    }
    // heartbeat marker at 72 per minute
    var hx = this.xOf(Math.log10(1.2));
    ctx.fillStyle = 'rgba(255,122,150,0.75)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText('♥', hx, yScale - 10);

    // stations, labels staggered on two rows
    ctx.font = '500 9.5px "Martian Mono", ui-monospace, monospace';
    var placed = [[], []];
    var order = this.logs.map(function (l, k) { return k; });
    for (i = 0; i < order.length; i++) {
      var k2 = order[i], sx = this.xOf(this.logs[k2]);
      if (sx < -40 || sx > W + 40) continue;
      var isCur = k2 === cur, isHover = k2 === this.hover;
      ctx.beginPath();
      ctx.arc(sx, yScale, isCur ? 3.6 : 2.6, 0, TAU);
      ctx.fillStyle = isCur ? '#fff3dc' : isHover ? AMBER : 'rgba(255,196,120,0.85)';
      ctx.fill();
      var label = this.P[k2].short, tw = ctx.measureText(label).width + 8;
      var row = 0;
      for (var rr = 0; rr < 2; rr++) {
        var ok = true;
        for (var q = 0; q < placed[rr].length; q++) { if (Math.abs(placed[rr][q] - sx) < tw) { ok = false; break; } }
        if (ok) { row = rr; break; }
        row = 1;
      }
      placed[row].push(sx);
      var ly = row === 0 ? yScale - 13 : yScale - 26;
      if (row === 1) { ctx.strokeStyle = 'rgba(255,196,120,0.25)'; ctx.beginPath(); ctx.moveTo(sx + 0.5, yScale - 4); ctx.lineTo(sx + 0.5, ly + 3); ctx.stroke(); }
      ctx.fillStyle = isCur ? '#fff3dc' : isHover ? AMBER : 'rgba(255,205,150,0.62)';
      ctx.textAlign = 'center';
      ctx.fillText(label, sx, ly);
    }
    // the pointer
    var px = this.xOf(this.pos);
    var pg = ctx.createLinearGradient(px - 10, 0, px + 10, 0);
    pg.addColorStop(0, 'rgba(255,90,40,0)');
    pg.addColorStop(0.5, 'rgba(255,110,50,0.35)');
    pg.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.fillStyle = pg;
    ctx.fillRect(px - 10, 0, 20, H);
    ctx.fillStyle = '#ff6a3a';
    ctx.fillRect(Math.round(px) - 1, 2, 2, H - 4);
    if (this.dragging) {
      var fr = Math.pow(10, this.pos);
      var txt = fr >= 100 ? fr.toFixed(0) + ' Hz' : fr >= 1 ? fr.toFixed(1) + ' Hz' : fr.toFixed(3) + ' Hz';
      ctx.font = '600 10px "Martian Mono", ui-monospace, monospace';
      var bw = ctx.measureText(txt).width + 12, bx = Math.max(2, Math.min(W - bw - 2, px - bw / 2));
      ctx.fillStyle = 'rgba(20,12,6,0.92)';
      ctx.fillRect(bx, 3, bw, 16);
      ctx.fillStyle = AMBER;
      ctx.textAlign = 'left';
      ctx.fillText(txt, bx + 6, 15);
    }
  };

  CC.Stack = Stack;
  CC.Clock = Clock;
  CC.Dial = Dial;
  CC.INK = { ink: INK, ink2: INK2, ink3: INK3, ice: ICE, amber: AMBER };
})();
