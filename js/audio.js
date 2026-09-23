/* Cosmic Clocks — Web Audio engine.
 *
 * The synthesiser (dsp.js) runs in an AudioWorklet created from a Blob. Where
 * that is not allowed, the same code runs in a ScriptProcessorNode instead.
 * Either way the synth reports each voice's phase with the audio-clock time it
 * refers to, so the visuals can show the exact pulse you are hearing.
 */
(function () {
  'use strict';
  var CC = window.CC;

  var WORKLET_SRC =
    'var DSP = (' + CC_DSP_FACTORY.toString() + ')();\n' +
    'class CCProc extends AudioWorkletProcessor {\n' +
    '  constructor() {\n' +
    '    super();\n' +
    '    this.core = new DSP.Synth(sampleRate);\n' +
    '    this.n = 0;\n' +
    '    this.scratch = new Float32Array(128);\n' +
    '    this.port.onmessage = (e) => { const d = e.data; if (Array.isArray(d)) { for (const m of d) this.core.handle(m); } else this.core.handle(d); };\n' +
    '  }\n' +
    '  process(inputs, outputs) {\n' +
    '    const o = outputs[0];\n' +
    '    const L = o[0];\n' +
    '    let R = o[1];\n' +
    '    if (!R) { if (this.scratch.length < L.length) this.scratch = new Float32Array(L.length); R = this.scratch; }\n' +
    '    this.core.render(L, R, L.length);\n' +
    '    if (this.core.dirty || (++this.n & 7) === 0) {\n' +
    '      this.core.dirty = false;\n' +
    '      this.port.postMessage({ t: currentTime + L.length / sampleRate, s: this.core.status() });\n' +
    '    }\n' +
    '    return true;\n' +
    '  }\n' +
    '}\n' +
    'registerProcessor("cc-pulsar", CCProc);\n';

  function makeIR(ctx, secs, decay) {
    var sr = ctx.sampleRate, n = Math.floor(secs * sr), buf = ctx.createBuffer(2, n, sr);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c), lp = 0;
      for (var i = 0; i < n; i++) {
        var t = i / sr;
        lp += (Math.random() * 2 - 1 - lp) * (0.12 + 0.55 * Math.exp(-t * 2.5));
        var env = Math.pow(1 - i / n, decay);
        if (t < 0.015) env *= t / 0.015;
        d[i] = lp * env;
      }
    }
    return buf;
  }

  function Engine() {
    this.ctx = null;
    this.node = null;
    this.mode = 'off';
    this.snaps = [];
    this.queue = [];
    this.ready = false;
    this.volume = 0.8;
    this.clean = false;
    this.initPromise = null;
  }

  Engine.prototype.init = function () {
    if (this.initPromise) return this.initPromise;
    var self = this;
    this.initPromise = (async function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('This browser has no Web Audio support.');
      var ctx;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      self.ctx = ctx;
      // resume inside the user gesture that called init()
      var resumed = ctx.resume ? ctx.resume() : Promise.resolve();

      self.input = ctx.createGain();
      self.lp = ctx.createBiquadFilter();
      self.lp.type = 'lowpass';
      self.lp.Q.value = 0.4;
      self.lp.frequency.value = self.clean ? 11000 : 6800;
      self.dry = ctx.createGain(); self.dry.gain.value = 0.9;
      self.wet = ctx.createGain(); self.wet.gain.value = 0.28;
      self.verb = ctx.createConvolver();
      self.verb.buffer = makeIR(ctx, 3.2, 2.6);
      self.comp = ctx.createDynamicsCompressor();
      self.comp.threshold.value = -14;
      self.comp.knee.value = 10;
      self.comp.ratio.value = 4;
      self.comp.attack.value = 0.003;
      self.comp.release.value = 0.25;
      self.master = ctx.createGain();
      self.master.gain.value = 0;
      self.analyser = ctx.createAnalyser();
      self.analyser.fftSize = 1024;
      self.meterBuf = new Float32Array(self.analyser.fftSize);

      self.input.connect(self.lp);
      self.lp.connect(self.dry);
      self.lp.connect(self.verb);
      self.verb.connect(self.wet);
      self.dry.connect(self.comp);
      self.wet.connect(self.comp);
      self.comp.connect(self.master);
      self.master.connect(ctx.destination);
      self.master.connect(self.analyser);

      try {
        if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('no worklet');
        var url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        var node = new AudioWorkletNode(ctx, 'cc-pulsar', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
        });
        node.port.onmessage = function (e) { self.pushSnap(e.data.t, e.data.s); };
        self.node = node;
        self.mode = 'worklet';
      } catch (err) {
        var core = self.core = new CC.DSP.Synth(ctx.sampleRate);
        var sp = ctx.createScriptProcessor(2048, 1, 2);
        sp.onaudioprocess = function (e) {
          var L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
          core.render(L, R, L.length);
          self.pushSnap(e.playbackTime + L.length / ctx.sampleRate, core.status());
        };
        self.node = sp;
        self.mode = 'script';
      }
      self.node.connect(self.input);
      self.ready = true;
      if (self.queue.length) { self.send(self.queue); self.queue = []; }
      await resumed;
      return self;
    })();
    return this.initPromise;
  };

  Engine.prototype.send = function (msg) {
    if (!this.ready) { if (Array.isArray(msg)) this.queue.push.apply(this.queue, msg); else this.queue.push(msg); return; }
    if (this.mode === 'worklet') this.node.port.postMessage(msg);
    else if (Array.isArray(msg)) { for (var i = 0; i < msg.length; i++) this.core.handle(msg[i]); }
    else this.core.handle(msg);
  };

  Engine.prototype.pushSnap = function (t, s) {
    var map = {};
    for (var i = 0; i < s.length; i++) map[s[i][0]] = s[i];
    this.snaps.push({ t: t, v: map });
    while (this.snaps.length > 4 && this.snaps[0].t < t - 2) this.snaps.shift();
  };

  Engine.prototype.running = function () {
    return !!(this.ready && this.ctx && this.ctx.state === 'running');
  };

  /* Audio-clock time of the sample leaving the speakers right now. */
  Engine.prototype.heardTime = function () {
    var ctx = this.ctx;
    if (ctx.getOutputTimestamp) {
      var ts = ctx.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
        return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      }
    }
    return ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
  };

  /* Phase (turns) of a voice as currently heard, or null when unknown. */
  Engine.prototype.phase = function (id, tHeard) {
    var sn = this.snaps;
    if (!sn.length) return null;
    var t = tHeard != null ? tHeard : this.heardTime();
    var best = null;
    for (var i = sn.length - 1; i >= 0; i--) {
      if (sn[i].v[id] && sn[i].t <= t) { best = sn[i]; break; }
    }
    if (!best) {
      for (i = 0; i < sn.length; i++) if (sn[i].v[id]) { best = sn[i]; break; }
    }
    if (!best) return null;
    var e = best.v[id];
    return { phi: e[1] + e[2] + e[3] * (t - best.t), f: e[3], g: e[4] };
  };

  Engine.prototype.clearSnaps = function () { this.snaps.length = 0; };

  Engine.prototype.setVolume = function (v, fade) {
    this.volume = v;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(v * 1.7, this.ctx.currentTime, fade || 0.06);
  };

  Engine.prototype.setClean = function (clean) {
    this.clean = clean;
    if (this.ctx) this.lp.frequency.setTargetAtTime(clean ? 11000 : 6800, this.ctx.currentTime, 0.05);
  };

  Engine.prototype.resume = function () {
    if (!this.ctx) return Promise.resolve();
    return this.ctx.resume();
  };

  Engine.prototype.suspend = function () {
    if (!this.ctx || this.ctx.state !== 'running') return Promise.resolve();
    return this.ctx.suspend();
  };

  /* Output level 0..1 for the VU meter. */
  Engine.prototype.level = function () {
    if (!this.running()) return 0;
    this.analyser.getFloatTimeDomainData(this.meterBuf);
    var s = 0, b = this.meterBuf;
    for (var i = 0; i < b.length; i++) s += b[i] * b[i];
    return Math.sqrt(s / b.length);
  };

  CC.AudioEngine = Engine;
})();
