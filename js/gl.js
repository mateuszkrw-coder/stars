/* Cosmic Clocks — small WebGL2 + math toolkit. */
(function () {
  'use strict';
  var CC = window.CC;

  /* ------------------------------------------------------------- vectors */
  var V = {
    add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    mul: function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    len: function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); },
    norm: function (a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
    /* rotate v about unit axis k by angle a (Rodrigues) */
    rot: function (v, k, a) {
      var c = Math.cos(a), s = Math.sin(a), d = V.dot(k, v), x = V.cross(k, v);
      return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
    }
  };

  /* ------------------------------------------------------ 4x4 matrices
   * Column-major, like WebGL expects. */
  var M = {
    ident: function () { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    mul: function (a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    /* perspective with an off-axis lens shift (sx, sy in NDC units) */
    persp: function (fovy, aspect, near, far, sx, sy) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        -(sx || 0), -(sy || 0), (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
    },
    lookAt: function (eye, at, up) {
      var z = V.norm(V.sub(eye, at)), x = V.norm(V.cross(up, z)), y = V.cross(z, x);
      return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -V.dot(x, eye), -V.dot(y, eye), -V.dot(z, eye), 1
      ]);
    },
    /* model matrix from basis columns and origin */
    basis: function (x, y, z, o) {
      return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o ? o[0] : 0, o ? o[1] : 0, o ? o[2] : 0, 1]);
    },
    xform: function (m, v) {
      var x = v[0], y = v[1], z = v[2];
      var w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w];
    }
  };

  /* --------------------------------------------------------------- WebGL */
  function compile(gl, type, src, label) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      var lines = src.split('\n').map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n');
      throw new Error('Shader "' + label + '" failed:\n' + log + '\n' + lines);
    }
    return s;
  }

  function Program(gl, vs, fs, label) {
    this.gl = gl;
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, label + '.vs'));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, label + '.fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link "' + label + '": ' + gl.getProgramInfoLog(p));
    this.p = p;
    this.loc = {};
  }
  Program.prototype.use = function () { this.gl.useProgram(this.p); return this; };
  Program.prototype.u = function (name) {
    var l = this.loc[name];
    if (l === undefined) { l = this.gl.getUniformLocation(this.p, name); this.loc[name] = l; }
    return l;
  };
  Program.prototype.f1 = function (n, a) { this.gl.uniform1f(this.u(n), a); return this; };
  Program.prototype.i1 = function (n, a) { this.gl.uniform1i(this.u(n), a); return this; };
  Program.prototype.f2 = function (n, a, b) { this.gl.uniform2f(this.u(n), a, b); return this; };
  Program.prototype.f3 = function (n, v) { this.gl.uniform3f(this.u(n), v[0], v[1], v[2]); return this; };
  Program.prototype.f4 = function (n, v) { this.gl.uniform4f(this.u(n), v[0], v[1], v[2], v[3]); return this; };
  Program.prototype.v3 = function (n, arr) { this.gl.uniform3fv(this.u(n), arr); return this; };
  Program.prototype.v4 = function (n, arr) { this.gl.uniform4fv(this.u(n), arr); return this; };
  Program.prototype.v2 = function (n, arr) { this.gl.uniform2fv(this.u(n), arr); return this; };
  Program.prototype.v1 = function (n, arr) { this.gl.uniform1fv(this.u(n), arr); return this; };
  Program.prototype.m3 = function (n, m) { this.gl.uniformMatrix3fv(this.u(n), false, m); return this; };
  Program.prototype.m4 = function (n, m) { this.gl.uniformMatrix4fv(this.u(n), false, m); return this; };

  function Target(gl, w, h, opt) {
    this.gl = gl;
    this.opt = opt || {};
    this.fb = gl.createFramebuffer();
    this.tex = gl.createTexture();
    this.depth = null;
    this.resize(w, h);
  }
  Target.prototype.resize = function (w, h) {
    var gl = this.gl, o = this.opt;
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (o.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    if (o.depth) {
      if (!this.depth) this.depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    this.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  Target.prototype.bind = function () {
    var gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
  };

  /* A vertex array with interleaved float attributes.
   * layout: [[location, size], ...] in order. */
  function Mesh(gl, data, layout, index, mode) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    var stride = 0, i;
    for (i = 0; i < layout.length; i++) stride += layout[i][1];
    var off = 0;
    for (i = 0; i < layout.length; i++) {
      gl.enableVertexAttribArray(layout[i][0]);
      gl.vertexAttribPointer(layout[i][0], layout[i][1], gl.FLOAT, false, stride * 4, off * 4);
      off += layout[i][1];
    }
    this.count = data.length / stride;
    if (index) {
      this.ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      this.icount = index.length;
      this.itype = index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    }
    this.mode = mode != null ? mode : gl.TRIANGLES;
    gl.bindVertexArray(null);
  }
  Mesh.prototype.draw = function (mode) {
    var gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (this.ibo) gl.drawElements(mode != null ? mode : this.mode, this.icount, this.itype, 0);
    else gl.drawArrays(mode != null ? mode : this.mode, 0, this.count);
  };
  Mesh.prototype.dispose = function () {
    var gl = this.gl;
    gl.deleteBuffer(this.vbo);
    if (this.ibo) gl.deleteBuffer(this.ibo);
    gl.deleteVertexArray(this.vao);
  };

  /* Seeded random numbers for geometry. */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  CC.V = V;
  CC.M = M;
  CC.GL = { Program: Program, Target: Target, Mesh: Mesh, rng: rng };
})();
