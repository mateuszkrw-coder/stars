/* Cosmic Clocks — pulse model and synthesiser.
 *
 * This factory runs twice: on the main thread (the visuals use PulseModel to
 * draw exactly the pulses you hear) and inside the AudioWorklet, where its
 * source is injected with Function.prototype.toString. Keep it self-contained:
 * no references to anything outside the function body.
 *
 * Phase convention: a voice's total phase is  PHI = k + x,  where k is the
 * turn (pulse) index and x is the phase inside that turn, x in [w0, w0 + 1).
 * The main pulse of turn k peaks at PHI = k. All randomness is a pure function
 * of k, so any thread can reconstruct any pulse.
 */
function CC_DSP_FACTORY() {
  'use strict';
  var TAU = 6.283185307179586;

  function hash2(a, b) {
    var lo = a >>> 0;
    var hi = Math.floor(a / 4294967296) >>> 0;
    var h = Math.imul(lo ^ 0x9e3779b9, 0x85ebca6b);
    h ^= Math.imul((hi + 0x632be5ab) | 0, 0xc2b2ae35);
    h ^= Math.imul((b ^ 0x27d4eb2f) | 0, 0x165667b1);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return h >>> 0;
  }
  function rnd(k, salt) { return hash2(k, salt) / 4294967296; }
  function gauss(k, salt) {
    var u1 = (hash2(k, salt) + 0.5) / 4294967296;
    var u2 = hash2(k, salt ^ 0x5bd1e995) / 4294967296;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2);
  }

  /* ---------------------------------------------------------------- model */
  function PulseModel(spec) {
    this.comps = spec.comps;
    this.n = spec.comps.length;
    this.sig = spec.sig != null ? spec.sig : 0.3;      // log-normal spread of pulse energy
    this.nulls = spec.nulls || 0;                       // fraction of turns with no pulse
    this.giant = spec.giant || null;                    // [rate, amplitude]
    this.drift = spec.drift || null;                    // [subpulse spacing, turns per drift band]
    this.w0 = spec.w0 != null ? spec.w0 : -0.3;
    this.seed = (spec.seed || 1) >>> 0;
    this.jit = spec.jit != null ? spec.jit : 0.28;      // component amplitude jitter
    this.pj = spec.pj != null ? spec.pj : 0.18;         // component position jitter (in widths)
    this.ck = -1;
    this.camp = 0;
    this.dOff = 0;
    this.ca = new Float64Array(this.n);
    this.cm = new Float64Array(this.n);
    this.cs = new Float64Array(this.n);
    var i, j, maxS = 0;
    for (i = 0; i < this.n; i++) { this.cs[i] = this.comps[i][1]; if (this.cs[i] > maxS) maxS = this.cs[i]; }
    this.maxSigma = maxS;
    var peak = 1e-9;
    for (j = 0; j < 4000; j++) {
      var v = this.mean(this.w0 + j / 4000, 1);
      if (v > peak) peak = v;
    }
    this.peak = peak;
  }
  /* Average (template) profile, unnormalised. */
  PulseModel.prototype.mean = function (x, ws) {
    var v = 0;
    for (var i = 0; i < this.n; i++) {
      var s = this.cs[i] * ws, d = x - this.comps[i][0];
      if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
      v += this.comps[i][2] * Math.exp(-0.5 * d * d / (s * s));
    }
    return v;
  };
  PulseModel.prototype.prep = function (k) {
    if (k === this.ck) return;
    this.ck = k;
    var s = this.seed * 7919, sg = this.sig, j = this.jit, i;
    var a = Math.exp(sg * gauss(k, s + 1) - 0.5 * sg * sg);
    if (this.nulls > 0 && rnd(k, s + 2) < this.nulls) a = 0;
    if (this.giant && rnd(k, s + 3) < this.giant[0]) a *= 1 + (this.giant[1] - 1) * (0.5 + rnd(k, s + 4));
    this.camp = a;
    for (i = 0; i < this.n; i++) {
      this.ca[i] = this.comps[i][2] * Math.exp(j * gauss(k, s + 11 + i) - 0.5 * j * j);
      this.cm[i] = this.comps[i][0] + this.pj * this.cs[i] * gauss(k, s + 41 + i);
    }
    if (this.drift) this.dOff = -((k / this.drift[1]) % 1) * this.drift[0];
  };
  /* Amplitude of turn k at phase x, peak of the mean profile = 1.
   * ws < 1 narrows every component (used to keep audio clicks crisp). */
  PulseModel.prototype.value = function (k, x, ws) {
    this.prep(k);
    if (this.camp === 0) return 0;
    var v = 0;
    for (var i = 0; i < this.n; i++) {
      var s = this.cs[i] * ws, d = x - this.cm[i];
      if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
      if (d < 7 * s && d > -7 * s) v += this.ca[i] * Math.exp(-0.5 * d * d / (s * s));
    }
    if (v === 0) return 0;
    if (this.drift && ws === 1) {
      var p2 = this.drift[0], t = (x - this.dOff) / p2, dd = (t - Math.round(t)) * p2, sc = 0.2 * p2;
      v *= 0.15 + 1.45 * Math.exp(-0.5 * dd * dd / (sc * sc));
    }
    return v * this.camp / this.peak;
  };
  PulseModel.prototype.amp = function (k) { this.prep(k); return this.camp; };
  PulseModel.prototype.isGiant = function (k) {
    return !!this.giant && rnd(k, this.seed * 7919 + 3) < this.giant[0] && !(this.nulls > 0 && rnd(k, this.seed * 7919 + 2) < this.nulls);
  };

  /* ---------------------------------------------------------------- voice */
  function Voice(id, spec) {
    this.id = id;
    this.m = new PulseModel(spec);
    this.f = 1 / spec.P;
    this.w0 = this.m.w0;
    this.k = spec.k0 || 0;
    this.x = spec.x0 != null ? spec.x0 : this.w0;
    this.g = spec.g0 || 0;
    this.gt = spec.gain != null ? spec.gain : 1;
    this.tau = spec.tau || 0.3;
    this.base = spec.base != null ? spec.base : 1;
    this.kill = false;
    var sc = spec.scint || [0.2, 8];
    this.scD = sc[0];
    this.scW = [TAU / sc[1], TAU / (sc[1] * 1.618), TAU / (sc[1] * 0.413)];
    this.scP = [rnd(this.m.seed, 5) * TAU, rnd(this.m.seed, 6) * TAU, rnd(this.m.seed, 7) * TAU];
    this.ws = 1;
    this.norm = 0.3;
    this.lastF = -1;
    this.lastC = null;
    this.glD = 0;       // glitch: fractional spin-up that decays away
    this.glTau = 1;
    this.glT = 0;
  }
  Voice.prototype.fmul = function () { return this.glD ? 1 + this.glD * Math.exp(-this.glT / this.glTau) : 1; };
  /* Loudness normalisation: clicks are peak-limited, tones are RMS-limited. */
  Voice.prototype.update = function (fEff, clean) {
    if (fEff === this.lastF && clean === this.lastC) return;
    this.lastF = fEff; this.lastC = clean;
    var capS = clean ? 0.00022 : 0.02;                  // widest audible Gaussian, in seconds
    var ws = Math.min(1, capS * fEff / this.m.maxSigma);
    this.ws = ws;
    var ms = 0, N = 4096, j;
    for (j = 0; j < N; j++) {
      var v = this.m.mean(this.w0 + (j + 0.5) / N, ws) / this.m.peak;
      ms += v * v;
    }
    ms /= N;
    var s2 = this.m.sig * this.m.sig;
    var carrier = clean ? 1 : 0.1 * 0.1 + 0.9 * 0.9 * 1.44 / 3;   // uniform noise has variance 1/3
    var rms = Math.sqrt(ms * Math.exp(s2) * carrier) + 1e-9;
    this.norm = clean ? Math.min(0.38, 0.065 / rms) : Math.min(0.3, 0.055 / rms);
  };

  /* ---------------------------------------------------------------- synth */
  function Synth(sr) {
    this.sr = sr;
    this.voices = [];
    this.warp = 1;
    this.clean = false;
    this.hiss = 0; this.hissT = 0.12;
    this.stat = 0; this.statT = 0;
    this.wh = 0; this.whT = 0; this.whF = 700; this.whFT = 700; this.whPh = 0;
    this.seed = 22695477;
    this.lpL = 0; this.lpR = 0; this.br = 0; this.crk = 0;
    this.dcxL = 0; this.dcyL = 0; this.dcxR = 0; this.dcyR = 0;
    this.frame = 0;
    this.dirty = true;
    this.dcR = 1 - TAU * 12 / sr;
    this.bm = 0; this.bmDur = 3; this.bmT = 1e9; this.bmLp = 0; this.bmLp2 = 0; this.bmPh = 0;
  }
  Synth.prototype.white = function () {
    var s = this.seed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.seed = s;
    return (s >>> 0) / 2147483648 - 1;
  };
  Synth.prototype.find = function (id) {
    for (var i = 0; i < this.voices.length; i++) if (this.voices[i].id === id) return this.voices[i];
    return null;
  };
  Synth.prototype.handle = function (m) {
    var v, i;
    switch (m.type) {
      case 'voice':
        v = this.find(m.id);
        var nv = new Voice(m.id, m.spec);
        if (v && m.spec.keepPhase) { nv.k = v.k; nv.x = v.x; nv.g = v.g; }
        if (v) this.voices.splice(this.voices.indexOf(v), 1);
        this.voices.push(nv);
        break;
      case 'gain':
        v = this.find(m.id);
        if (v) { v.gt = m.gain; if (m.tau) v.tau = m.tau; v.kill = !!m.kill; }
        break;
      case 'phase':
        v = this.find(m.id);
        if (v) { v.k = m.k; v.x = m.x; }
        break;
      case 'drop':
        for (i = this.voices.length - 1; i >= 0; i--) {
          if (!m.keep || m.keep.indexOf(this.voices[i].id) < 0) { this.voices[i].gt = 0; this.voices[i].tau = m.tau || 0.25; this.voices[i].kill = true; }
        }
        break;
      case 'glitch':
        v = this.find(m.id);
        if (v) { v.glD = m.df; v.glTau = m.tau || 5; v.glT = 0; }
        break;
      case 'boom':
        this.bm = m.amp != null ? m.amp : 1;
        this.bmDur = m.dur || 3;
        this.bmT = 0;
        break;
      case 'global':
        if (m.warp != null) this.warp = m.warp;
        if (m.clean != null) this.clean = m.clean;
        if (m.hiss != null) this.hissT = m.hiss;
        if (m.stat != null) this.statT = m.stat;
        if (m.wh != null) this.whT = m.wh;
        if (m.whF != null) this.whFT = m.whF;
        break;
    }
    this.dirty = true;
  };
  Synth.prototype.status = function () {
    var out = [];
    for (var i = 0; i < this.voices.length; i++) {
      var v = this.voices[i];
      out.push([v.id, v.k, v.x, v.f * this.warp * v.fmul(), v.g]);
    }
    return out;
  };
  Synth.prototype.render = function (L, R, n) {
    var sr = this.sr, i, j, nv = this.voices.length;
    for (i = 0; i < n; i++) { L[i] = 0; R[i] = 0; }
    var t0 = this.frame / sr;
    var clean = this.clean;

    for (j = 0; j < nv; j++) {
      var v = this.voices[j];
      var fEff = v.f * this.warp;
      v.update(fEff, clean);
      var inc = fEff * v.fmul() / sr;
      if (v.glD) { v.glT += n / sr; if (v.glT > v.glTau * 12) v.glD = 0; }
      if (inc > 0.45) inc = 0.45;
      var w1 = v.w0 + 1, ws = v.ws, m = v.m;
      var sc = Math.exp(v.scD * (Math.sin(v.scW[0] * t0 + v.scP[0]) + 0.7 * Math.sin(v.scW[1] * t0 + v.scP[1]) + 0.5 * Math.sin(v.scW[2] * t0 + v.scP[2])) / 1.4);
      var coef = 1 - Math.exp(-1 / (v.tau * sr));
      var g = v.g, gt = v.gt * v.base * v.norm * sc;
      if (g < 1e-5 && gt < 1e-5) {
        // silent voice: advance phase in one go
        v.x += inc * n;
        while (v.x >= w1) { v.x -= 1; v.k++; }
        v.g = 0;
        continue;
      }
      for (i = 0; i < n; i++) {
        v.x += inc;
        if (v.x >= w1) { v.x -= 1; v.k++; }
        g += (gt - g) * coef;
        var e = m.value(v.k, v.x, ws);
        if (e !== 0) {
          var s = clean ? e : e * (0.1 + 0.9 * 1.2 * this.white());
          s *= g;
          L[i] += s; R[i] += s;
        }
      }
      v.g = g;
    }
    // voices that have faded out are removed
    for (j = this.voices.length - 1; j >= 0; j--) {
      var vv = this.voices[j];
      if (vv.kill && vv.g < 2e-4 && vv.gt === 0) { this.voices.splice(j, 1); this.dirty = true; }
    }

    // receiver hiss, tuning static and heterodyne whistle
    var k = 1 - Math.exp(-1 / (0.08 * sr));
    var hiss = this.hiss, stat = this.stat, wh = this.wh, whF = this.whF;
    var hT = this.hissT, sT = this.statT, wT = this.whT, fT = this.whFT;
    var lpa = 0.45, lpL = this.lpL, lpR = this.lpR, br = this.br, crk = this.crk, ph = this.whPh;
    for (i = 0; i < n; i++) {
      hiss += (hT - hiss) * k; stat += (sT - stat) * k; wh += (wT - wh) * k; whF += (fT - whF) * k;
      if (hiss > 1e-5 || stat > 1e-5) {
        var wl = this.white(), wr = this.white();
        lpL += lpa * (wl - lpL); lpR += lpa * (wr - lpR);
        var aL = lpL * hiss * 0.5, aR = lpR * hiss * 0.5;
        if (stat > 1e-5) {
          br = br * 0.996 + (wl + wr) * 0.03;
          if (this.white() > 0.9993) crk = 0.5 + 0.5 * Math.abs(this.white());
          crk *= 0.93;
          var flutter = 0.75 + 0.25 * Math.sin(TAU * 6.3 * (this.frame + i) / sr);
          var st = (br * 1.5 + wl * 0.22) * flutter + crk * wr;
          aL += st * stat * 0.55; aR += (br * 1.5 + wr * 0.22) * flutter * stat * 0.55 + crk * wl * stat * 0.55;
        }
        L[i] += aL; R[i] += aR;
      }
      if (wh > 1e-5) {
        ph += TAU * whF / sr;
        if (ph > TAU) ph -= TAU;
        var w = Math.sin(ph) * wh * 0.08;
        L[i] += w; R[i] += w;
      }
    }
    this.hiss = hiss; this.stat = stat; this.wh = wh; this.whF = whF;
    this.lpL = lpL; this.lpR = lpR; this.br = br; this.crk = crk; this.whPh = ph;

    // supernova / starquake rumble: a noise burst whose low-pass closes as it fades, over a falling sub-bass sweep
    if (this.bmT < this.bmDur * 3) {
      var bt = this.bmT, lp1 = this.bmLp, lp2 = this.bmLp2, bph = this.bmPh;
      for (i = 0; i < n; i++) {
        var tt = bt + i / sr;
        var env = this.bm * (tt < 0.012 ? tt / 0.012 : Math.exp(-(tt - 0.012) / (this.bmDur * 0.45)));
        var cut = 0.02 + 0.5 * Math.exp(-tt / (this.bmDur * 0.18));
        var wn = this.white();
        lp1 += cut * (wn - lp1); lp2 += cut * (lp1 - lp2);
        bph += TAU * (28 + 60 * Math.exp(-tt / 0.35)) / sr;
        var sub = Math.sin(bph) * Math.exp(-tt / (this.bmDur * 0.35));
        var bs = (lp2 * 2.2 + sub * 0.9) * env;
        L[i] += bs; R[i] += bs * 0.94 + lp1 * env * 0.15;
      }
      this.bmT = bt + n / sr; this.bmLp = lp1; this.bmLp2 = lp2; this.bmPh = bph % TAU;
    }

    // DC blocker and a soft ceiling
    var dcR = this.dcR, xl = this.dcxL, yl = this.dcyL, xr = this.dcxR, yr = this.dcyR;
    for (i = 0; i < n; i++) {
      var a = L[i], b = R[i];
      yl = a - xl + dcR * yl; xl = a;
      yr = b - xr + dcR * yr; xr = b;
      L[i] = soft(yl); R[i] = soft(yr);
    }
    this.dcxL = xl; this.dcyL = yl; this.dcxR = xr; this.dcyR = yr;
    this.frame += n;
  };
  function soft(x) {
    var a = x < 0 ? -x : x;
    if (a <= 0.8) return x;
    var y = 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2);
    return x < 0 ? -y : y;
  }

  return { hash2: hash2, rnd: rnd, gauss: gauss, PulseModel: PulseModel, Voice: Voice, Synth: Synth };
}

window.CC = window.CC || {};
CC.DSP = CC_DSP_FACTORY();
