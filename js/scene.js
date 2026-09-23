/* Cosmic Clocks — WebGL2 scene.
 *
 * Two worlds share one canvas: a close-up of the current pulsar (neutron star,
 * dipole field, volumetric radio beams, companions) and a particle model of
 * the Milky Way with every pulsar placed at its real Galactic position.
 * Travelling between pulsars zooms out of one close-up, flies across the
 * galaxy and zooms into the next.
 *
 * Units: close-up scenes use neutron-star radii (1 = ~12 km, not to scale
 * with orbits); the galaxy uses kiloparsecs with the Galactic Centre at the
 * origin (world x = galactic x, world y = galactic z, world z = -galactic y).
 */
(function () {
  'use strict';
  var CC = window.CC, V = CC.V, M = CC.M, G = CC.GL;
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ================================================================ GLSL */
  var HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

  var NOISE = [
    'float hash31(vec3 p){ p = fract(p*0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
    'float vnoise(vec3 x){',
    '  vec3 i = floor(x); vec3 f = fract(x);',
    '  vec3 u = f*f*f*(f*(f*6.0-15.0)+10.0);',
    '  float a = hash31(i), b = hash31(i+vec3(1,0,0)), c = hash31(i+vec3(0,1,0)), d = hash31(i+vec3(1,1,0));',
    '  float e = hash31(i+vec3(0,0,1)), g = hash31(i+vec3(1,0,1)), h = hash31(i+vec3(0,1,1)), k = hash31(i+vec3(1,1,1));',
    '  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,g,u.x), mix(h,k,u.x), u.y), u.z);',
    '}',
    'float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a*vnoise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; } return s; }',
    'float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = p*2.07 + vec3(4.1,2.7,7.9); a *= 0.5; } return s; }'
  ].join('\n');

  var VS_QUAD = HEAD + [
    'layout(location=0) in vec2 aPos;',
    'out vec2 vUv;',
    'void main(){ vUv = aPos*0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  /* Sky cubemap generator: Milky Way band, dust and a nebula, per pulsar. */
  var FS_CUBE = HEAD + NOISE + [
    'in vec2 vUv; out vec4 o;',
    'uniform vec3 uO, uS, uT;',
    'uniform vec3 uNebA, uNebB, uBandN, uGc, uFocus;',
    'uniform float uAmt, uStyle, uSeed, uBand, uBandW;',
    'void main(){',
    '  vec3 d = normalize(uO + (vUv.x*2.0-1.0)*uS + (vUv.y*2.0-1.0)*uT);',
    '  float lat = dot(d, uBandN);',
    '  float core = exp(-lat*lat/uBandW);',
    '  float lane = exp(-lat*lat/(uBandW*0.125));',
    '  float mwn = fbm(d*3.1 + uSeed);',
    '  float dust = smoothstep(0.38, 0.72, fbm(d*7.0 + uSeed*1.7 + 4.0));',
    '  float grain = fbm(d*22.0 + uSeed*2.3);',
    '  float gc = pow(max(dot(d, uGc), 0.0), 5.0);',
    '  vec3 mw = vec3(0.55,0.5,0.46) * core * (0.25 + 1.1*mwn*mwn) * (1.0 + 2.2*gc);',
    '  mw += vec3(0.45,0.5,0.65) * core * pow(grain, 3.0) * 1.6;',
    '  mw *= 1.0 - 0.85*dust*lane;',
    '  vec3 q = d*1.7 + uSeed;',
    '  vec3 w = vec3(fbm(q), fbm(q + vec3(5.2,1.3,2.8)), fbm(q + vec3(1.7,9.2,4.4)));',
    '  float n = fbm(q + 1.9*w);',
    '  float neb;',
    '  if (uStyle < 0.5) { neb = smoothstep(0.42, 0.86, n); neb *= neb*1.6; }',
    '  else if (uStyle < 1.5) { neb = smoothstep(0.3, 0.92, n) * 0.7; }',
    '  else {',
    '    float r = 1.0 - abs(2.0*fbm(q*1.9 + 2.3*w) - 1.0);',
    '    neb = pow(r, 8.0) * smoothstep(0.36, 0.72, n) * 2.6 + smoothstep(0.52, 0.92, n) * 0.35;',
    '  }',
    '  vec3 nc = mix(uNebB, uNebA, clamp(n*1.6 - 0.35, 0.0, 1.0)) * neb * uAmt;',
    '  float focus = 0.3 + 0.7*pow(max(dot(d, uFocus)*0.5 + 0.5, 0.0), 2.5);',
    '  vec3 col = mw * uBand * 0.34 + nc * focus;',
    '  o = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* Background: nebula cubemap plus a procedural star field. */
  var FS_SKY = HEAD + [
    'in vec2 vUv; out vec4 o;',
    'uniform samplerCube uCubeA, uCubeB;',
    'uniform float uMix, uSky, uStarGain, uPix, uTime, uOut, uGal;',
    'uniform vec3 uR, uU, uF; uniform vec2 uTan, uShift;',
    'float h13(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y)*p.z); }',
    'vec3 stars(vec3 d, float scale, float thresh, float gain){',
    '  vec3 a = abs(d); vec2 uv; float face;',
    '  if (a.x >= a.y && a.x >= a.z) { uv = d.yz/a.x; face = d.x > 0.0 ? 1.0 : 2.0; }',
    '  else if (a.y >= a.z) { uv = d.xz/a.y; face = d.y > 0.0 ? 3.0 : 4.0; }',
    '  else { uv = d.xy/a.z; face = d.z > 0.0 ? 5.0 : 6.0; }',
    '  vec2 g = uv*scale; vec2 c = floor(g); vec2 f = g - c;',
    '  vec3 key = vec3(c, face*131.7 + scale);',
    '  float h = h13(key);',
    '  if (h > thresh) return vec3(0.0);',
    '  vec2 p = vec2(h13(key + 3.1), h13(key + 7.3))*0.7 + 0.15;',
    '  float m = max(a.x, max(a.y, a.z));',
    '  float dpx = length(f - p)/scale*m*m/uPix;',
    '  float r = dpx/1.05;',
    '  float b = h13(key + 11.9); b = b*b*b;',
    '  vec3 tint = mix(vec3(1.0,0.8,0.62), vec3(0.72,0.84,1.0), h13(key + 5.5));',
    '  float tw = 0.78 + 0.22*sin(uTime*(1.3 + 3.0*h13(key + 2.2)) + h*60.0);',
    '  return tint*exp(-r*r)*(0.07 + 2.6*b)*gain*tw;',
    '}',
    'void main(){',
    '  vec2 ndc = vUv*2.0 - 1.0;',
    '  vec3 d = normalize(uF + (ndc.x - uShift.x)*uTan.x*uR + (ndc.y - uShift.y)*uTan.y*uU);',
    '  vec3 col = vec3(0.0);',
    '  if (uSky > 0.001) col += mix(texture(uCubeA, d).rgb, texture(uCubeB, d).rgb, uMix)*uSky;',
    '  col += (stars(d, 50.0, 0.09, 1.0) + stars(d, 125.0, 0.11, 0.55) + stars(d, 280.0, 0.14, 0.3))*uStarGain;',
    '  col += vec3(0.010, 0.012, 0.028)*uGal*(1.0 - 0.45*length(ndc));',
    '  o = vec4(col*uOut, 1.0);',
    '}'
  ].join('\n');

  /* Galaxy particles. */
  var VS_GAL = HEAD + [
    'layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol;',
    'uniform mat4 uVP; uniform vec3 uEye; uniform float uPx, uGain;',
    'out vec3 vC; out float vA;',
    'void main(){',
    '  gl_Position = uVP*vec4(aPos, 1.0);',
    '  float dist = max(length(aPos - uEye), 1e-5);',
    '  float sz = aCol.a*uPx/dist;',
    '  float s = clamp(sz, 1.4, 56.0);',
    '  gl_PointSize = s;',
    '  vC = aCol.rgb;',
    '  vA = uGain*min(1.0, (sz*sz)/(s*s))*smoothstep(1.2, 4.0, dist/aCol.a);',
    '  if (gl_Position.w <= 0.0) vA = 0.0;',
    '}'
  ].join('\n');
  var FS_GAL = HEAD + [
    'in vec3 vC; in float vA; out vec4 o; uniform float uOut;',
    'void main(){ vec2 p = gl_PointCoord*2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard; o = vec4(vC*exp(-r2*4.5)*vA*uOut, 1.0); }'
  ].join('\n');

  /* Ray-traced sphere impostor: neutron star, companions, planets. */
  var VS_SPH = HEAD + [
    'layout(location=0) in vec2 aCorner;',
    'uniform mat4 uVP; uniform vec3 uCenter, uCamR, uCamU, uEye; uniform float uRad;',
    'out vec3 vW;',
    'void main(){',
    '  float D = length(uCenter - uEye);',
    '  float k = uRad*D/sqrt(max(D*D - uRad*uRad, 1e-4))*1.06;',
    '  vW = uCenter + (aCorner.x*uCamR + aCorner.y*uCamU)*k;',
    '  gl_Position = uVP*vec4(vW, 1.0);',
    '}'
  ].join('\n');
  var FS_SPH = HEAD + NOISE + [
    'in vec3 vW; out vec4 o;',
    'uniform mat4 uVP; uniform mat3 uBody; uniform vec3 uEye, uCenter, uCol, uLight, uMagB;',
    'uniform float uRad, uKind, uFlash, uTexAmt, uOut, uTime, uBright, uQuake;',
    'void main(){',
    '  vec3 rd = normalize(vW - uEye);',
    '  vec3 oc = uEye - uCenter;',
    '  float b = dot(oc, rd), c = dot(oc, oc) - uRad*uRad, h = b*b - c;',
    '  if (h < 0.0) discard;',
    '  float t = -b - sqrt(h);',
    '  vec3 P = uEye + rd*t; vec3 N = (P - uCenter)/uRad;',
    '  vec4 clip = uVP*vec4(P, 1.0);',
    '  gl_FragDepth = clamp(clip.z/clip.w*0.5 + 0.5, 0.0, 1.0);',
    '  float mu = max(dot(N, -rd), 0.0);',
    '  vec3 nb = uBody*N;',
    '  vec3 col;',
    '  if (uKind < 0.5) {',
    '    float tex = mix(0.55, fbm3(nb*4.5 + 3.0), uTexAmt);',
    '    float ring = mix(0.5, vnoise(vec3(nb.z*14.0, 0.0, 1.0)), uTexAmt*0.6);',
    '    float cap = exp(-(1.0 - abs(dot(nb, uMagB)))*16.0);',
    '    col = uCol*vec3(0.8, 0.9, 1.06)*(0.3 + 0.7*mu)*(0.45 + 0.8*tex + 0.3*ring)*0.72;',
    '    col += vec3(0.85, 0.93, 1.0)*cap*1.9;',
    '    col += vec3(0.3, 0.5, 1.0)*pow(1.0 - mu, 3.0)*1.0;',
    '    col *= 1.0 + uFlash*0.8;',
    '    if (uQuake > 0.001) { float cr = pow(1.0 - abs(2.0*fbm3(nb*6.5 + 1.7) - 1.0), 12.0); col += vec3(0.8, 0.9, 1.0)*cr*uQuake*7.0; }',
    '  } else if (uKind < 1.5) {',
    '    float gran = fbm3(nb*6.0 + uTime*0.05);',
    '    float limb = 0.35 + 0.65*pow(mu, 0.55);',
    '    col = uCol*limb*(0.8 + 0.4*gran)*uBright;',
    '    col += uCol*pow(1.0 - mu, 4.0)*0.6*uBright;',
    '  } else if (uKind > 2.5) {',
    '    float g1 = fbm(nb*3.0 + uTime*0.06);',
    '    float g2 = fbm3(nb*9.0 - uTime*0.12);',
    '    float hot = smoothstep(0.38, 0.78, g1*0.75 + g2*0.4);',
    '    col = mix(vec3(0.75, 0.16, 0.04), vec3(1.0, 0.66, 0.3), hot)*(0.2 + 0.95*pow(mu, 0.5))*uBright;',
    '    col += vec3(1.0, 0.35, 0.12)*pow(1.0 - mu, 3.0)*0.45*uBright;',
    '  } else {',
    '    float lam = max(dot(N, uLight), 0.0);',
    '    float tex = fbm(nb*2.6 + 11.0);',
    '    col = uCol*(0.015 + lam*(0.55 + 0.7*tex))*1.4;',
    '    col += vec3(0.35, 0.55, 1.0)*pow(1.0 - mu, 5.0)*0.25*lam;',
    '  }',
    '  o = vec4(col*uOut, 1.0);',
    '}'
  ].join('\n');

  /* Screen-space ribbons for field lines, orbits and the gravitational-wave grid. */
  var VS_LINE = HEAD + [
    'layout(location=0) in vec3 aPos; layout(location=1) in vec3 aPrev; layout(location=2) in vec3 aNext; layout(location=3) in vec3 aMisc;',
    'uniform mat4 uVP, uModel; uniform vec2 uRes; uniform float uWidth, uGrid; uniform vec4 uGW;',
    'out float vSide; out float vU; out float vA;',
    'vec3 disp(vec3 p){',
    '  if (uGrid < 0.5) return p;',
    '  float r = length(p.xz); float ph = atan(p.z, p.x);',
    '  float h = uGW.x*cos(2.0*ph - uGW.z + uGW.y*r)*smoothstep(1.5, 5.5, r)/(1.0 + r*uGW.w);',
    '  h -= 2.2*exp(-r*r/22.0);',
    '  return vec3(p.x, p.y + h, p.z);',
    '}',
    'void main(){',
    '  mat4 T = uVP*uModel;',
    '  vec4 c = T*vec4(disp(aPos), 1.0), cp = T*vec4(disp(aPrev), 1.0), cn = T*vec4(disp(aNext), 1.0);',
    '  vec2 sp = cp.xy/max(cp.w, 1e-4), sn = cn.xy/max(cn.w, 1e-4);',
    '  vec2 dir = (sn - sp)*uRes; float L = length(dir);',
    '  dir = L > 1e-5 ? dir/L : vec2(1.0, 0.0);',
    '  vec2 nrm = vec2(-dir.y, dir.x);',
    '  c.xy += nrm*aMisc.x*uWidth/uRes*2.0*c.w;',
    '  gl_Position = c;',
    '  vSide = aMisc.x; vU = aMisc.y; vA = c.w > 0.0 ? aMisc.z : 0.0;',
    '}'
  ].join('\n');
  var FS_LINE = HEAD + [
    'in float vSide; in float vU; in float vA; out vec4 o;',
    'uniform vec3 uCol; uniform float uAlpha, uDash, uFlow, uTime, uOut;',
    'void main(){',
    '  float e = 1.0 - abs(vSide); e = e*e*(3.0 - 2.0*e);',
    '  float a = uAlpha*vA*e;',
    '  if (uDash > 0.0) a *= mix(0.1, 1.0, step(0.5, fract(vU*uDash)));',
    '  if (uFlow > 0.0) a *= 0.5 + 0.5*sin(vU*uFlow - uTime*2.4);',
    '  o = vec4(uCol*a*uOut, 1.0);',
    '}'
  ].join('\n');

  /* Points: static stars, particles riding field lines, particles in the beams. */
  var VS_PTS = HEAD + [
    'layout(location=0) in vec4 aA; layout(location=1) in vec4 aB;',
    'uniform mat4 uVP, uMag; uniform vec3 uEye, uB1, uQ1, uPCol; uniform float uPx, uTime, uMode, uLc, uLen, uRho, uDpr, uEv;',
    'out vec3 vC; out float vA;',
    'void main(){',
    '  vec3 wp; float size; float a = 1.0; vec3 col = uPCol; bool pix = false;',
    '  if (uMode < 0.5) {',
    '    wp = aA.xyz; size = aA.w; col = aB.rgb;',
    '    a = 0.72 + 0.28*sin(uTime*(0.6 + aB.a*2.2) + aB.a*50.0);',
    '  } else if (uMode < 1.5) {',
    '    float L = aA.x; float th0 = asin(sqrt(1.0/L));',
    '    float s = fract(aA.z + uTime*aA.w);',
    '    float th = th0 + (3.14159265 - 2.0*th0)*s;',
    '    float r = L*sin(th)*sin(th);',
    '    vec3 mp = vec3(r*sin(th)*cos(aA.y), r*sin(th)*sin(aA.y), r*cos(th));',
    '    wp = (uMag*vec4(mp, 1.0)).xyz; size = aB.y;',
    '    a = sin(s*3.14159265)*(1.0 - smoothstep(uLc*0.8, uLc*1.1, r));',
    '  } else if (uMode > 3.5) {',
    '    float tau = uEv;',
    '    float r = 4.0 + aA.w*tau*(1.0 - 0.03*tau);',
    '    wp = aA.xyz*r; size = aB.a*(1.0 + 0.12*tau); col = aB.rgb;',
    '    a = tau > 0.0 ? smoothstep(0.0, 0.12, tau)*exp(-tau/4.5) : 0.0;',
    '  } else if (uMode > 2.5) {',
    '    wp = aA.xyz; size = aA.w; col = aB.rgb; pix = true;',
    '    a = 0.86 + 0.14*sin(uTime*(1.1 + aB.a*2.5) + aB.a*40.0);',
    '  } else {',
    '    float s = fract(aA.z + uTime*aA.w);',
    '    float r = 1.4 + s*uLen;',
    '    vec3 dir = aB.x > 0.0 ? uB1 : -uB1;',
    '    vec3 q2 = normalize(cross(dir, uQ1));',
    '    vec2 off = (aA.xy*2.0 - 1.0)*tan(uRho*0.5);',
    '    wp = dir*r + (uQ1*off.x + q2*off.y)*r; size = aB.y;',
    '    a = (1.0 - s)*smoothstep(0.0, 0.06, s);',
    '  }',
    '  gl_Position = uVP*vec4(wp, 1.0);',
    '  if (pix) { gl_PointSize = size*uDpr; vC = col; vA = a; }',
    '  else {',
    '    float dist = max(length(wp - uEye), 1e-4);',
    '    float sz = size*uPx/dist;',
    '    float ps = clamp(sz, 1.3, 28.0);',
    '    gl_PointSize = ps;',
    '    vC = col; vA = a*min(1.0, (sz*sz)/(ps*ps));',
    '  }',
    '  if (gl_Position.w <= 0.0) vA = 0.0;',
    '}'
  ].join('\n');
  var FS_PTS = HEAD + [
    'in vec3 vC; in float vA; out vec4 o; uniform float uOut, uGain;',
    'void main(){ vec2 p = gl_PointCoord*2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard; o = vec4(vC*(exp(-r2*5.0) + 0.4*exp(-r2*40.0))*vA*uGain*uOut, 1.0); }'
  ].join('\n');

  /* Soft glow sprites (corona, flare streaks, map markers). */
  var VS_GLOW = HEAD + [
    'layout(location=0) in vec2 aCorner;',
    'uniform mat4 uVP; uniform vec3 uCenter, uR, uU; uniform float uSize, uPixSize; uniform vec2 uRes, uStretch;',
    'out vec2 vP;',
    'void main(){',
    '  vP = aCorner;',
    '  if (uPixSize > 0.0) {',
    '    vec4 c = uVP*vec4(uCenter, 1.0);',
    '    c.xy += aCorner*uStretch*uPixSize/uRes*2.0*c.w;',
    '    gl_Position = c;',
    '  } else {',
    '    vec3 w = uCenter + (aCorner.x*uR*uStretch.x + aCorner.y*uU*uStretch.y)*uSize;',
    '    gl_Position = uVP*vec4(w, 1.0);',
    '  }',
    '}'
  ].join('\n');
  var FS_GLOW = HEAD + [
    'in vec2 vP; out vec4 o; uniform vec3 uCol; uniform float uInt, uOut, uCore, uRing;',
    'void main(){',
    '  float r2 = dot(vP, vP); if (r2 > 1.0) discard;',
    '  float g = exp(-r2*7.0)*0.55 + exp(-r2*48.0)*uCore + (1.0 - sqrt(r2))*0.06;',
    '  if (uRing > 0.0) { float rr = sqrt(r2), q = (rr - uRing)/0.035; g = exp(-q*q) + 0.25*exp(-q*q*0.08); }',
    '  o = vec4(uCol*g*uInt*uOut, 1.0);',
    '}'
  ].join('\n');

  /* Volumetric radio beams, ray-marched at reduced resolution.
   * Rotation blur is analytic: the beam's azimuthal Gaussian is averaged over
   * the angle swept during one frame (a difference of error functions). */
  var FS_BEAM = HEAD + [
    'in vec2 vUv; out vec4 o;',
    'uniform vec3 uEye, uR, uU, uF; uniform vec2 uTan, uShift;',
    'uniform int uN;',
    'uniform vec3 uC[2]; uniform mat3 uS[2]; uniform vec4 uP[2]; uniform vec2 uW[2];',
    'uniform vec3 uCc[2]; uniform vec3 uCh[2]; uniform float uRad[2];',
    'uniform float uJet, uTorus, uTime, uOut, uFrame, uBound;',
    'uniform vec4 uShell; uniform vec3 uShellA, uShellB;',
    'const float PI = 3.14159265;',
    'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }',
    'float h3(vec3 p){ p = fract(p*0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
    'float vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),',
    '             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }',
    'float erfA(float x){ float s = sign(x); x = abs(x); float t = 1.0/(1.0 + 0.3275911*x);',
    '  float y = 1.0 - (((((1.061405429*t - 1.453152027)*t) + 1.421413741)*t - 0.284496736)*t + 0.254829592)*t*exp(-x*x); return s*y; }',
    'float winG(float x0, float s, float D){',
    '  if (D < 0.002) return exp(-0.5*x0*x0/(s*s));',
    '  float k = 0.70710678/s;',
    '  return clamp((erfA((0.5*D - x0)*k) + erfA((0.5*D + x0)*k))*s*1.2533141/D, 0.0, 1.0);',
    '}',
    'float az(float dp, float s, float D){',
    '  float v = winG(dp, s, D);',
    '  if (0.5*D + 4.0*s > PI - abs(dp)) v += winG(dp - sign(dp)*2.0*PI, s, D);',
    '  return min(v, 1.0);',
    '}',
    'float wrapPi(float a){ return a - 2.0*PI*floor((a + PI)/(2.0*PI)); }',
    'vec3 beam(int e, vec3 p){',
    '  vec3 q = transpose(uS[e])*(p - uC[e]);',
    '  float R = uRad[e]; float r = length(q);',
    '  if (r < R*1.02) return vec3(0.0);',
    '  float len = uP[e].z;',
    '  float fall = smoothstep(R*1.1, R*3.2, r)*(1.0 - smoothstep(len*0.5, len, r))/(1.0 + r/(len*0.3));',
    '  if (fall <= 0.0) return vec3(0.0);',
    '  vec3 n = q/r;',
    '  float th = acos(clamp(n.z, -1.0, 1.0)); float ph = atan(n.y, n.x);',
    '  float al = uP[e].x, rho = uP[e].y, rr = rho*rho;',
    '  float sAz = min(rho/sqrt(2.0*max(sin(th)*sin(al), 1e-4)), 30.0);',
    '  float psi = uW[e].x, D = uW[e].y;',
    '  float d1 = th - al, d2 = th - (PI - al);',
    '  vec3 col = vec3(0.0);',
    '  float p1 = exp(-d1*d1/rr);',
    '  if (p1 > 0.002) { float dp = wrapPi(ph - psi);',
    '    col += uCh[e]*p1*az(dp, sAz, D) + uCc[e]*exp(-d1*d1/(rr*0.1))*az(dp, sAz*0.32, D)*2.8; }',
    '  float p2 = exp(-d2*d2/rr);',
    '  if (p2 > 0.002) { float dp = wrapPi(ph - psi - PI);',
    '    col += uCh[e]*p2*az(dp, sAz, D) + uCc[e]*exp(-d2*d2/(rr*0.1))*az(dp, sAz*0.32, D)*2.8; }',
    '  if (e == 0) {',
    '    if (uJet > 0.0) { float rc = r*sin(th);',
    '      col += vec3(0.45, 0.65, 1.0)*exp(-rc*rc/0.1)*smoothstep(1.2, 2.2, r)*(1.0 - smoothstep(4.0, 9.5, r))*uJet*0.55; }',
    '    if (uTorus > 0.0) { float td = length(vec2(length(q.xy) - 6.0, q.z*1.7));',
    '      col += vec3(0.5, 0.62, 1.0)*exp(-td*td/1.2)*0.045*uTorus; }',
    '  }',
    '  return col*fall*uP[e].w;',
    '}',
    'void main(){',
    '  vec2 ndc = vUv*2.0 - 1.0;',
    '  vec3 rd = normalize(uF + (ndc.x - uShift.x)*uTan.x*uR + (ndc.y - uShift.y)*uTan.y*uU);',
    '  vec3 ro = uEye;',
    '  float b = dot(ro, rd), c = dot(ro, ro) - uBound*uBound, h = b*b - c;',
    '  if (h < 0.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }',
    '  h = sqrt(h);',
    '  float t0 = max(-b - h, 0.0), t1 = -b + h;',
    '  if (t1 <= 0.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }',
    '  for (int e = 0; e < 2; e++) {',
    '    if (e >= uN) break;',
    '    vec3 oc = ro - uC[e]; float bb = dot(oc, rd), cc = dot(oc, oc) - uRad[e]*uRad[e], hh = bb*bb - cc;',
    '    if (hh > 0.0) { float th = -bb - sqrt(hh); if (th > 0.0) t1 = min(t1, th); }',
    '  }',
    '  const int STEPS = 44;',
    '  float dt = (t1 - t0)/float(STEPS);',
    '  float j = hash12(gl_FragCoord.xy + fract(uFrame*0.618)*97.0);',
    '  vec3 acc = vec3(0.0);',
    '  for (int i = 0; i < STEPS; i++) {',
    '    vec3 p = ro + rd*(t0 + (float(i) + j)*dt);',
    '    vec3 s = beam(0, p);',
    '    if (uN > 1) s += beam(1, p);',
    '    if (s.r + s.g + s.b > 1e-4) s *= 0.55 + 0.9*vn(p*0.8 - normalize(p)*uTime*1.6);',
    '    if (uShell.z > 0.0) {',
    '      float rs = length(p), d = (rs - uShell.x)/uShell.y;',
    '      if (d > -3.0 && d < 3.0) {',
    '        float nn = vn(p*0.2 + uShell.w*0.25);',
    '        float fil = pow(1.0 - abs(2.0*vn(p*0.5 - uShell.w*0.15) - 1.0), 5.0);',
    '        s += mix(uShellB, uShellA, clamp(0.55 - d*0.3, 0.0, 1.0))*exp(-d*d)*(0.15 + 0.7*nn + 1.9*fil)*uShell.z/uShell.y;',
    '      }',
    '    }',
    '    acc += s;',
    '  }',
    '  o = vec4(acc*dt*uOut, 1.0);',
    '}'
  ].join('\n');

  var FS_COPY = HEAD + [
    'in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform float uGain;',
    'void main(){ o = vec4(texture(uTex, vUv).rgb*uGain, 1.0); }'
  ].join('\n');

  var FS_DOWN = HEAD + [
    'in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh, uFirst;',
    'vec3 tp(vec2 d){ return texture(uTex, vUv + d*uTexel).rgb; }',
    'void main(){',
    '  vec3 col = tp(vec2(0.0))*0.125 + (tp(vec2(-2,2)) + tp(vec2(2,2)) + tp(vec2(-2,-2)) + tp(vec2(2,-2)))*0.03125',
    '    + (tp(vec2(0,2)) + tp(vec2(-2,0)) + tp(vec2(2,0)) + tp(vec2(0,-2)))*0.0625',
    '    + (tp(vec2(-1,1)) + tp(vec2(1,1)) + tp(vec2(-1,-1)) + tp(vec2(1,-1)))*0.125;',
    '  if (uFirst > 0.5) { float br = max(col.r, max(col.g, col.b)); col *= max(br - uThresh, 0.0)/max(br, 1e-4); }',
    '  o = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var FS_UP = HEAD + [
    'in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;',
    'vec3 tp(vec2 d){ return texture(uTex, vUv + d*uTexel).rgb; }',
    'void main(){',
    '  vec3 s = tp(vec2(0.0))*4.0 + (tp(vec2(1,0)) + tp(vec2(-1,0)) + tp(vec2(0,1)) + tp(vec2(0,-1)))*2.0',
    '    + tp(vec2(1,1)) + tp(vec2(-1,1)) + tp(vec2(1,-1)) + tp(vec2(-1,-1));',
    '  o = vec4(s/16.0, 1.0);',
    '}'
  ].join('\n');

  var FS_FINAL = HEAD + [
    'in vec2 vUv; out vec4 o;',
    'uniform sampler2D uScene, uBloom; uniform float uBloomAmt, uExposure, uWarp, uTime, uIn, uGrain, uFade;',
    'uniform vec2 uRes, uCenter;',
    'vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }',
    'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }',
    'void main(){',
    '  vec2 uv = vUv; vec3 col;',
    '  if (uWarp > 0.001) {',
    '    vec3 acc = vec3(0.0); float ws = 0.0;',
    '    for (int i = 0; i < 14; i++) { float f = float(i)/13.0; vec2 u2 = uCenter + (uv - uCenter)*(1.0 - uWarp*0.22*f);',
    '      float w = 1.0 - f*0.55; acc += (texture(uScene, u2).rgb + texture(uBloom, u2).rgb*uBloomAmt)*w; ws += w; }',
    '    col = acc/ws;',
    '  } else col = texture(uScene, uv).rgb + texture(uBloom, uv).rgb*uBloomAmt;',
    '  col *= uIn*uExposure;',
    '  col = aces(col);',
    '  vec2 q = (uv - 0.5)*vec2(uRes.x/uRes.y, 1.0);',
    '  col *= mix(1.0, smoothstep(1.35, 0.25, length(q)), 0.55);',
    '  col = pow(col, vec3(1.0/2.2));',
    '  col += (hash12(uv*uRes + fract(uTime*7.13)*113.0) - 0.5)*uGrain;',
    '  o = vec4(col*uFade, 1.0);',
    '}'
  ].join('\n');

  /* ============================================================ geometry */

  /* Build a ribbon mesh from polylines: [{pts:[[x,y,z]...], alpha:[...]?}] */
  function lineMesh(gl, lines) {
    var nv = 0, ni = 0, i, j;
    for (i = 0; i < lines.length; i++) { nv += lines[i].pts.length * 2; ni += (lines[i].pts.length - 1) * 6; }
    var data = new Float32Array(nv * 12), idx = new Uint32Array(ni);
    var v = 0, k = 0, base = 0;
    for (i = 0; i < lines.length; i++) {
      var P = lines[i].pts, A = lines[i].alpha, n = P.length;
      var total = 0, acc = [0];
      for (j = 1; j < n; j++) { total += V.len(V.sub(P[j], P[j - 1])); acc.push(total); }
      for (j = 0; j < n; j++) {
        var p = P[j], pr = P[Math.max(0, j - 1)], nx = P[Math.min(n - 1, j + 1)];
        var a = A ? A[j] : 1, u = total > 0 ? acc[j] / total : 0;
        for (var s = -1; s <= 1; s += 2) {
          data.set([p[0], p[1], p[2], pr[0], pr[1], pr[2], nx[0], nx[1], nx[2], s, u * (lines[i].uScale || 1), a], v * 12);
          v++;
        }
      }
      for (j = 0; j < n - 1; j++) {
        var q = base + j * 2;
        idx[k++] = q; idx[k++] = q + 1; idx[k++] = q + 2;
        idx[k++] = q + 1; idx[k++] = q + 3; idx[k++] = q + 2;
      }
      base += n * 2;
    }
    return new G.Mesh(gl, data, [[0, 3], [1, 3], [2, 3], [3, 3]], idx);
  }

  function circlePts(r, n, y) {
    var pts = [];
    for (var i = 0; i <= n; i++) { var a = i / n * TAU; pts.push([Math.cos(a) * r, y || 0, Math.sin(a) * r]); }
    return pts;
  }

  /* Dipole field lines r = L sin^2(theta), in the magnetic frame (z = magnetic axis). */
  function fieldLines(lcUnits) {
    var lines = [], Ls = [1.6, 2.4, 3.6, 5.4, 8.0], az = 6, i, j, k;
    for (i = 0; i < Ls.length; i++) {
      for (j = 0; j < az; j++) {
        var L = Ls[i], ph = (j + (i % 2) * 0.5) / az * TAU, th0 = Math.asin(Math.sqrt(1 / L));
        var pts = [], al = [];
        for (k = 0; k <= 72; k++) {
          var th = th0 + (PI - 2 * th0) * k / 72, r = L * Math.sin(th) * Math.sin(th);
          pts.push([r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)]);
          al.push((1 - smooth(lcUnits * 0.85, lcUnits * 1.25, r)) * (0.55 + 0.45 * (1 - i / Ls.length)));
        }
        lines.push({ pts: pts, alpha: al, uScale: L });
      }
    }
    // open field lines leaving the polar caps
    var open = [18, 40];
    for (i = 0; i < open.length; i++) {
      for (j = 0; j < 6; j++) {
        var Lo = open[i], pho = (j + 0.25) / 6 * TAU, t0 = Math.asin(Math.sqrt(1 / Lo));
        for (var hemi = 0; hemi < 2; hemi++) {
          var p2 = [], a2 = [];
          for (k = 0; k <= 40; k++) {
            var tt = t0 + k / 40 * 0.55, rr = Lo * Math.sin(tt) * Math.sin(tt);
            var zz = rr * Math.cos(tt) * (hemi ? -1 : 1);
            p2.push([rr * Math.sin(tt) * Math.cos(pho), rr * Math.sin(tt) * Math.sin(pho), zz]);
            a2.push((1 - smooth(4, 14, rr)) * 0.7);
          }
          lines.push({ pts: p2, alpha: a2, uScale: 6 });
        }
      }
    }
    return lines;
  }

  /* Polar grid for the gravitational-wave "rubber sheet". */
  function gwGrid() {
    var lines = [], R = 30, i, j;
    for (i = 0; i < 40; i++) {
      var a = i / 40 * TAU, pts = [], al = [];
      for (j = 0; j <= 48; j++) { var r = 1.2 + (R - 1.2) * j / 48; pts.push([Math.cos(a) * r, 0, Math.sin(a) * r]); al.push(1 - smooth(R * 0.55, R, r)); }
      lines.push({ pts: pts, alpha: al });
    }
    for (i = 1; i <= 20; i++) {
      var rr = 1.2 + (R - 1.2) * Math.pow(i / 20, 1.25), p = circlePts(rr, 120), aa = [];
      for (j = 0; j < p.length; j++) aa.push(1 - smooth(R * 0.55, R, rr));
      lines.push({ pts: p, alpha: aa });
    }
    return lines;
  }

  function gaussRand(r) {
    var u = Math.max(r(), 1e-9), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  /* Procedural Milky Way: bulge, bar, exponential disc, four trailing arms,
   * the local spur and a dense sprinkling of stars around the Sun. */
  function buildGalaxy(gl) {
    var r = G.rng(1967), out = [];
    function put(gx, gy, gz, c, b, s) { out.push(gx, gz, -gy, c[0] * b, c[1] * b, c[2] * b, s); }
    var i, R, a, t;
    for (i = 0; i < 7000; i++) {
      R = Math.abs(gaussRand(r)) * 0.8 + 0.05; a = r() * TAU;
      var cz = gaussRand(r) * 0.32 * Math.exp(-R * 0.4);
      put(Math.cos(a) * R, Math.sin(a) * R * 0.8, cz, [1.0, 0.72, 0.42], 0.022 + 0.045 * r(), 0.12 + 0.18 * r());
    }
    var barA = PI - 27 * DEG;
    for (i = 0; i < 5000; i++) {
      var u = gaussRand(r) * 2.1, w = gaussRand(r) * 0.5;
      put(Math.cos(barA) * u - Math.sin(barA) * w, Math.sin(barA) * u + Math.cos(barA) * w, gaussRand(r) * 0.18, [1.0, 0.78, 0.5], 0.022 + 0.03 * r(), 0.1 + 0.15 * r());
    }
    for (i = 0; i < 16000; i++) {
      R = -3.0 * Math.log(1 - r() * 0.985) + 1.5; if (R > 17) continue;
      a = r() * TAU;
      put(Math.cos(a) * R, Math.sin(a) * R, gaussRand(r) * 0.1, [0.82, 0.83, 0.95], 0.014 + 0.022 * r(), 0.06 + 0.1 * r());
    }
    var pitch = Math.tan(12 * DEG), th0 = PI - Math.log(6.94 / 4) / pitch;
    for (var arm = 0; arm < 4; arm++) {
      for (i = 0; i < 11000; i++) {
        t = r() * 6.6;
        R = 4 * Math.exp(t * pitch); if (R > 17.5) continue;
        a = th0 + arm * PI / 2 + t;
        var sc = gaussRand(r) * (0.16 + R * 0.018), sa = gaussRand(r) * 0.035;
        var x = Math.cos(a + sa) * (R + sc), y = Math.sin(a + sa) * (R + sc);
        var young = r();
        var col = young < 0.72 ? [0.6, 0.75, 1.0] : young < 0.94 ? [0.93, 0.91, 1.0] : [1.0, 0.42, 0.6];
        var hii = young >= 0.94;
        put(x, y, gaussRand(r) * 0.07, col, hii ? 0.14 + 0.12 * r() : 0.06 + 0.08 * r(), hii ? 0.06 + 0.08 * r() : 0.04 + 0.1 * r());
      }
    }
    for (i = 0; i < 3500; i++) {
      t = (r() - 0.55) * 1.3;
      a = PI + t; R = 8.35 * Math.exp(t * Math.tan(10 * DEG)) + gaussRand(r) * 0.25;
      put(Math.cos(a) * R, Math.sin(a) * R, gaussRand(r) * 0.06, [0.72, 0.82, 1.0], 0.04 + 0.06 * r(), 0.04 + 0.08 * r());
    }
    var sun = [-CC.R_SUN_KPC, 0];
    for (i = 0; i < 9000; i++) {
      var d = Math.pow(r(), 0.6) * 2.4, b = r() * TAU;
      put(sun[0] + Math.cos(b) * d, sun[1] + Math.sin(b) * d, gaussRand(r) * 0.12, r() < 0.5 ? [1.0, 0.9, 0.8] : [0.8, 0.88, 1.0], 0.04 + 0.12 * r(), 0.0025 + 0.004 * r());
    }
    return new G.Mesh(gl, new Float32Array(out), [[0, 3], [1, 4]], null, gl.POINTS);
  }

  function galToWorld(g) { return [g.x, g.z, -g.y]; }

  /* Equatorial coordinates to the sky-view world frame (celestial north = +y). */
  function eqToWorld(raDeg, decDeg) {
    var a = raDeg * DEG, d = decDeg * DEG;
    return [Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a)];
  }
  function slerp(a, b, t) {
    var th = Math.acos(clamp(V.dot(a, b), -1, 1));
    if (th < 1e-4) return V.norm(V.lerp(a, b, t));
    var sn = Math.sin(th);
    return V.add(V.mul(a, Math.sin((1 - t) * th) / sn), V.mul(b, Math.sin(t * th) / sn));
  }
  /* Star colour from its B-V index. */
  var BV = [[-0.4, [0.62, 0.72, 1.0]], [0.0, [0.8, 0.86, 1.0]], [0.4, [1.0, 0.97, 0.93]], [0.8, [1.0, 0.88, 0.72]], [1.2, [1.0, 0.78, 0.56]], [1.8, [1.0, 0.66, 0.42]]];
  function bvColor(b) {
    if (b <= BV[0][0]) return BV[0][1];
    for (var i = 1; i < BV.length; i++) {
      if (b <= BV[i][0]) return V.lerp(BV[i - 1][1], BV[i][1], (b - BV[i - 1][0]) / (BV[i][0] - BV[i - 1][0]));
    }
    return BV[BV.length - 1][1];
  }
  /* Debris thrown out by the supernova replay. */
  function buildEjecta(gl) {
    var r = G.rng(1054), d = [];
    for (var i = 0; i < 1600; i++) {
      var dir = V.norm([gaussRand(r), gaussRand(r) * 0.85, gaussRand(r)]);
      var sp = 1.2 + 4.5 * Math.pow(r(), 0.7), roll = r();
      var c = roll < 0.55 ? [1.0, 0.5 + 0.3 * r(), 0.18] : roll < 0.72 ? [1.0, 0.3, 0.25] : [0.6, 0.75, 1.0];
      var b = 0.6 + 1.2 * r();
      d.push(dir[0], dir[1], dir[2], sp, c[0] * b, c[1] * b, c[2] * b, 0.12 + 0.3 * r());
    }
    return new G.Mesh(gl, new Float32Array(d), [[0, 4], [1, 4]], null, gl.POINTS);
  }

  /* ================================================================ Scene */
  function Scene(canvas) {
    this.canvas = canvas;
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    this.enc = this.floatOK ? 1 : 0.25;

    this.pQuadCube = new G.Program(gl, VS_QUAD, FS_CUBE, 'cube');
    this.pSky = new G.Program(gl, VS_QUAD, FS_SKY, 'sky');
    this.pGal = new G.Program(gl, VS_GAL, FS_GAL, 'galaxy');
    this.pSph = new G.Program(gl, VS_SPH, FS_SPH, 'sphere');
    this.pLine = new G.Program(gl, VS_LINE, FS_LINE, 'line');
    this.pPts = new G.Program(gl, VS_PTS, FS_PTS, 'points');
    this.pGlow = new G.Program(gl, VS_GLOW, FS_GLOW, 'glow');
    this.pBeam = new G.Program(gl, VS_QUAD, FS_BEAM, 'beam');
    this.pCopy = new G.Program(gl, VS_QUAD, FS_COPY, 'copy');
    this.pDown = new G.Program(gl, VS_QUAD, FS_DOWN, 'down');
    this.pUp = new G.Program(gl, VS_QUAD, FS_UP, 'up');
    this.pFinal = new G.Program(gl, VS_QUAD, FS_FINAL, 'final');

    this.tri = new G.Mesh(gl, new Float32Array([-1, -1, 3, -1, -1, 3]), [[0, 2]]);
    this.quad = new G.Mesh(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), [[0, 2]], null, gl.TRIANGLE_STRIP);

    var fl = this.floatOK;
    this.tScene = new G.Target(gl, 4, 4, { float: fl, depth: true });
    this.tBeam = new G.Target(gl, 4, 4, { float: fl });
    this.mips = [];
    for (var i = 0; i < 6; i++) this.mips.push(new G.Target(gl, 4, 4, { float: fl }));

    this.cubeSize = Math.min(gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE), window.innerWidth < 700 ? 384 : 512);
    this.cubes = [this.makeCube(), this.makeCube()];
    this.cubeFb = gl.createFramebuffer();
    this.cubeActive = 0;
    this.cubeMix = 0;
    this.cubeJob = null;

    this.galaxy = buildGalaxy(gl);
    this.grid = lineMesh(gl, gwGrid());

    this.pulsars = CC.PULSARS;
    this.gpos = this.pulsars.map(function (p) { return galToWorld(CC.galacticXYZ(p)); });
    this.sunPos = [-CC.R_SUN_KPC, 0.02, 0];

    // camera state
    this.close = { az: 0, el: 0.12, dist: 25, fov: 38 * DEG, userAz: 0, userEl: 0, zoom: 1, velAz: 0, velEl: 0 };
    this.gal = { target: [-5.2, 0, 0], dist: 17, az: -2.0, el: 0.95, fov: 50 * DEG };
    this.mapUser = { az: 0, el: 0, zoom: 1, pan: [0, 0, 0], velAz: 0 };
    this.mode = 'map';
    this.tr = null;
    this.wClose = 0;
    this.warpFx = 0;
    this.cur = -1;
    this.preset = null;
    this.frameNo = 0;
    this.time = 0;
    this.lensShift = [0, 0];
    this.labels = [];
    this.res = 1;
    this.perf = { acc: 0, n: 0 };
    this.lastEye = [0, 0, 20];
    this.fade = 0;
    this.wSky = 0;
    this.sky = null;
    this.skyCam = { yaw: 0, pitch: 0, fov: 60 * DEG, fovTarget: 60 * DEG };
    this.skyTurn = null;
    this.skyDir = this.pulsars.map(function (p) { return eqToWorld(p.ra, p.dec); });
    this.ev = null;
    this.evp = null;
    this.flareT = 9;
    this.flareAmp = 0;
    this.cinema = false;
  }

  Scene.prototype.makeCube = function () {
    var gl = this.gl, tex = gl.createTexture(), s = this.cubeSize;
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
    for (var f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA8, s, s, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };

  var FACES = [
    [[1, 0, 0], [0, 0, -1], [0, -1, 0]], [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, 0, 1], [1, 0, 0], [0, -1, 0]], [[0, 0, -1], [-1, 0, 0], [0, -1, 0]]
  ];

  Scene.prototype.renderCubeFace = function (tex, face, pr) {
    var gl = this.gl, p = this.pQuadCube, s = this.cubeSize, v = pr.vis, f = FACES[face];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.cubeFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, tex, 0);
    gl.viewport(0, 0, s, s);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    p.use().f3('uO', f[0]).f3('uS', f[1]).f3('uT', f[2])
      .f3('uNebA', v.neb.a).f3('uNebB', v.neb.b).f1('uAmt', v.neb.amt).f1('uStyle', v.neb.style).f1('uSeed', v.neb.seed)
      .f1('uBand', v.band).f3('uBandN', pr.bandN || V.norm([0.35, 0.86, -0.36])).f3('uGc', pr.gc || V.norm([-0.8, 0.28, -0.55]))
      .f1('uBandW', pr.bandW || 0.028).f3('uFocus', pr.focus);
    this.tri.draw();
  };

  /* Everything that depends on which pulsar is on screen. */
  Scene.prototype.buildPreset = function (idx) {
    var gl = this.gl, p = this.pulsars[idx], v = p.vis, d = CC.derive(p), pr = { idx: idx, p: p, vis: v };
    var r = G.rng(1000 + idx * 7919);
    // spin frame: axis tilted toward screen-right, x_s leaning toward the viewer
    var Om = V.norm([0.27, 1, 0.08]);
    var tv = V.norm([0.62, 0, 1]);
    var xs = V.norm(V.sub(tv, V.mul(Om, V.dot(tv, Om)))), ys = V.cross(Om, xs);
    pr.Om = Om; pr.xs = xs; pr.ys = ys;
    pr.alpha = v.alpha * DEG; pr.zeta = v.zeta * DEG; pr.rho = v.rho * DEG;
    pr.earth = V.add(V.mul(xs, Math.sin(pr.zeta)), V.mul(Om, Math.cos(pr.zeta)));
    // default camera sits ~42 degrees round from the Earth line
    var e = pr.earth;
    pr.camAz = Math.atan2(e[0], e[2]) - 0.74;
    pr.camEl = clamp(Math.asin(e[1]) * 0.35, -0.1, 0.32);
    pr.focus = V.mul(V.norm([Math.sin(pr.camAz) * Math.cos(pr.camEl), Math.sin(pr.camEl), Math.cos(pr.camAz) * Math.cos(pr.camEl)]), -1);
    pr.lc = d.lcKm / CC.R_NS_KM;                           // light cylinder in star radii
    pr.showLc = pr.lc < 40;

    if (this.preset) this.disposePreset(this.preset);
    pr.field = lineMesh(gl, fieldLines(pr.lc));
    var aux = [];
    aux.push({ pts: [V.mul(Om, -6.5), V.mul(Om, 6.5)], key: 'axis' });
    var elines = [];
    for (var i = 0; i <= 24; i++) elines.push(V.mul(e, 1.2 + i * 0.75));
    pr.earthLine = lineMesh(gl, [{ pts: elines, uScale: 1 }]);
    pr.axis = lineMesh(gl, [{ pts: aux[0].pts }]);
    if (pr.showLc) {
      var lcp = [], n = 160;
      for (i = 0; i <= n; i++) {
        var a = i / n * TAU;
        lcp.push(V.add(V.mul(xs, Math.cos(a) * pr.lc), V.mul(ys, Math.sin(a) * pr.lc)));
      }
      pr.lcRing = lineMesh(gl, [{ pts: lcp, uScale: 1 }]);
    }
    // orbits
    var orbitLines = [];
    pr.orbitFrame = null;
    if (v.companion || v.planets) {
      var inc = ((v.companion && v.companion.incl) || 24) * DEG;
      var ox = V.norm([1, 0, 0.25]), oy = V.norm(V.rot([0, 1, 0], ox, inc)), oz = V.cross(ox, oy);
      pr.orbitFrame = { x: ox, y: oy, z: oz };
      if (v.companion) {
        var c = v.companion, pts = [];
        for (i = 0; i <= 200; i++) {
          var E = i / 200 * TAU, rr = c.a * (1 - c.e * Math.cos(E));
          var nu = 2 * Math.atan2(Math.sqrt(1 + c.e) * Math.sin(E / 2), Math.sqrt(1 - c.e) * Math.cos(E / 2));
          pts.push(V.add(V.mul(ox, rr * Math.cos(nu)), V.mul(oz, rr * Math.sin(nu))));
        }
        orbitLines.push({ pts: pts, uScale: 1 });
      }
      if (v.planets) {
        v.planets.forEach(function (pl) {
          var pp = [];
          for (var k = 0; k <= 160; k++) { var aa = k / 160 * TAU; pp.push(V.add(V.mul(ox, Math.cos(aa) * pl.a), V.mul(oz, Math.sin(aa) * pl.a))); }
          orbitLines.push({ pts: pp, uScale: 1 });
        });
      }
      pr.orbits = lineMesh(gl, orbitLines);
    }
    // near-field stars (or the swarm of a globular cluster)
    var nn = v.near.n, pts2 = [];
    for (i = 0; i < nn; i++) {
      var dir = V.norm([gaussRand(r), gaussRand(r), gaussRand(r)]);
      var rad = lerp(v.near.r[0], v.near.r[1], v.near.cluster ? Math.pow(r(), 1.6) : r());
      var pos = V.mul(dir, rad);
      var tint = v.near.cluster && r() < 0.12 ? [0.7, 0.82, 1.0] : v.near.col;
      var br = 0.5 + 1.8 * Math.pow(r(), 3);
      pts2.push(pos[0], pos[1], pos[2], (v.near.cluster ? 0.1 : 0.07) + r() * 0.12, tint[0] * br, tint[1] * br, tint[2] * br, r());
    }
    pr.near = new G.Mesh(gl, new Float32Array(pts2), [[0, 4], [1, 4]], null, gl.POINTS);
    // particles: 260 on field lines, 180 in the beams
    var pa = [];
    for (i = 0; i < 260; i++) {
      var Ls = [1.6, 2.4, 3.6, 5.4];
      pa.push(Ls[Math.floor(r() * Ls.length)], Math.floor(r() * 8) / 8 * TAU + (r() - 0.5) * 0.1, r(), (0.04 + r() * 0.08) * (r() < 0.5 ? 1 : -1), 0, 0.05 + r() * 0.05, 0, 0);
    }
    pr.fparts = new G.Mesh(gl, new Float32Array(pa), [[0, 4], [1, 4]], null, gl.POINTS);
    var pb = [];
    for (i = 0; i < 180; i++) pb.push(r(), r(), r(), 0.12 + r() * 0.2, r() < 0.5 ? 1 : -1, 0.06 + r() * 0.08, 0, 0);
    pr.bparts = new G.Mesh(gl, new Float32Array(pb), [[0, 4], [1, 4]], null, gl.POINTS);
    pr.lenBeam = v.rho > 15 ? 26 : 30;
    return pr;
  };

  Scene.prototype.disposePreset = function (pr) {
    ['field', 'earthLine', 'axis', 'lcRing', 'orbits', 'near', 'fparts', 'bparts'].forEach(function (k) { if (pr[k]) pr[k].dispose(); });
  };

  /* Switch the close-up to pulsar idx; the sky is regenerated one cube face per frame. */
  Scene.prototype.applyPreset = function (idx, immediate) {
    if (this.preset && this.preset.idx === idx) return;
    this.preset = this.buildPreset(idx);
    this.cur = idx;
    var target = this.preset ? 1 - this.cubeActive : 0;
    if (immediate) {
      for (var f = 0; f < 6; f++) this.renderCubeFace(this.cubes[target], f, this.preset);
      this.cubeActive = target;
      this.cubeJob = null;
    } else {
      this.cubeJob = { target: target, face: 0, preset: this.preset };
    }
    this.close.userAz = 0; this.close.userEl = 0;
  };

  /* --------------------------------------------------------- navigation */
  var DNEAR = 0.1;

  Scene.prototype.mapView = function () {
    var u = this.mapUser;
    return { target: V.add([-5.0, 0, 0.4], u.pan), dist: 16.5 / u.zoom, az: -2.05 + u.az, el: clamp(1.0 + u.el, 0.25, 1.45) };
  };

  Scene.prototype.nearView = function (idx) {
    return { target: this.gpos[idx], dist: DNEAR, az: -2.05 + idx * 0.37, el: 0.42 };
  };

  Scene.prototype.sunView = function () {
    return { target: this.sunPos, dist: DNEAR, az: -1.2, el: 0.5 };
  };

  /* Start a trip. From the close-up, the map or the sky; to a pulsar index, 'map' or 'sky'. */
  Scene.prototype.travel = function (to, opts) {
    opts = opts || {};
    var fromClose = this.mode === 'close', fromSky = this.mode === 'sky';
    var gFrom = fromClose ? this.nearView(this.cur) : fromSky ? this.sunView() : this.currentGal();
    var gTo = to === 'map' ? this.mapView() : to === 'sky' ? this.sunView() : this.nearView(to);
    var span = V.len(V.sub(gFrom.target, gTo.target));
    var dur;
    if (opts.calm) dur = 1.1;
    else if (to === 'map') dur = fromClose || fromSky ? 2.3 : 1.2;
    else dur = (fromClose || fromSky ? 2.2 : 1.6) + 0.35 * Math.log(1 + span * 4);
    if (to === 'sky') {
      this.ensureSky();
      this.skyCam.yaw = 0; this.skyCam.pitch = 0;
      this.skyCam.fov = 100 * DEG; this.skyCam.fovTarget = (this.cssW < 760 ? 72 : 60) * DEG;
      this.skyTurn = null;
    }
    this.tr = {
      to: to, t: 0, dur: dur, gFrom: gFrom, gTo: gTo, span: span, calm: !!opts.calm, fromIdx: this.cur,
      aOut: fromClose, bIn: typeof to === 'number', skyOut: fromSky, skyIn: to === 'sky'
    };
    this.mode = 'travel';
  };

  /* In the sky view: swing the telescope across the sky to another pulsar. */
  Scene.prototype.skyLook = function () {
    var base = this.skyDir[this.cur] || [0, 0, -1];
    if (this.skyTurn) base = slerp(this.skyTurn.from, base, ease(clamp(this.skyTurn.t / this.skyTurn.dur, 0, 1)));
    var up = Math.abs(base[1]) > 0.985 ? [0, 0, 1] : [0, 1, 0];
    var f = V.rot(base, up, this.skyCam.yaw);
    var r = V.norm(V.cross(f, up));
    return { f: V.norm(V.rot(f, r, this.skyCam.pitch)), up: up };
  };
  Scene.prototype.skyTurnTo = function (idx) {
    var from = this.skyLook().f;
    this.applyPreset(idx, false);
    this.skyCam.yaw = 0; this.skyCam.pitch = 0;
    var ang = Math.acos(clamp(V.dot(from, this.skyDir[idx]), -1, 1));
    this.skyTurn = { from: from, t: 0, dur: 1.4 + 0.7 * ang };
  };

  /* Stars, constellations and the Milky Way as seen from Earth (built on first use). */
  Scene.prototype.ensureSky = function () {
    if (this.sky) return this.sky;
    var gl = this.gl, SK = CC.SKY, sky = {}, i;
    var bin = atob(SK.stars), n = SK.starCount, u16 = new Uint16Array(n * 4);
    for (i = 0; i < n * 4; i++) u16[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    var data = new Float32Array(n * 8), rnd = G.rng(4242);
    for (i = 0; i < n; i++) {
      var ra = u16[i * 4] / 65535 * 360, dec = u16[i * 4 + 1] / 65535 * 180 - 90;
      var mag = u16[i * 4 + 2] / 1000 - 2, bv = u16[i * 4 + 3] / 10000 - 0.5;
      var d = eqToWorld(ra, dec), flux = Math.pow(10, -0.4 * (mag - 1));
      var size = clamp(1.25 + 2.4 * Math.pow(flux, 0.33), 1.25, 7.5);
      var inten = clamp(0.28 + 0.95 * Math.pow(flux, 0.5), 0.18, 2.6);
      var c = bvColor(bv);
      data.set([d[0] * 100, d[1] * 100, d[2] * 100, size, c[0] * inten, c[1] * inten, c[2] * inten, rnd()], i * 8);
    }
    sky.stars = new G.Mesh(gl, data, [[0, 4], [1, 4]], null, gl.POINTS);
    var all = [];
    sky.figures = {};
    SK.lines.forEach(function (fig) {
      var polys = [];
      fig[1].forEach(function (arr) {
        var pts = [];
        for (var k = 0; k + 3 < arr.length; k += 2) {
          var a = eqToWorld(arr[k], arr[k + 1]), b = eqToWorld(arr[k + 2], arr[k + 3]);
          for (var q = 0; q < 8; q++) pts.push(V.mul(slerp(a, b, q / 8), 100));
        }
        pts.push(V.mul(eqToWorld(arr[arr.length - 2], arr[arr.length - 1]), 100));
        polys.push({ pts: pts });
      });
      sky.figures[fig[0]] = polys;
      all.push.apply(all, polys);
    });
    sky.lines = lineMesh(gl, all);
    var grid = [], h, dd;
    for (h = 0; h < 24; h += 2) { var gp = []; for (dd = -80; dd <= 80; dd += 4) gp.push(V.mul(eqToWorld(h * 15, dd), 100)); grid.push({ pts: gp }); }
    [-60, -30, 0, 30, 60].forEach(function (de) { var cp = []; for (var a2 = 0; a2 <= 360; a2 += 3) cp.push(V.mul(eqToWorld(a2, de), 100)); grid.push({ pts: cp }); });
    sky.grid = lineMesh(gl, grid);
    sky.names = SK.names.map(function (nm) { return { abbr: nm[0], name: nm[1], dir: eqToWorld(nm[2], nm[3]) }; });
    sky.cube = this.makeCube();
    var ngp = eqToWorld(192.85948, 27.12825), gc = eqToWorld(266.40499, -28.93617);
    var earth = { vis: { neb: { a: [0, 0, 0], b: [0, 0, 0], amt: 0, style: 0, seed: 9.1 }, band: 0.72 }, focus: gc, bandN: ngp, gc: gc, bandW: 0.04 };
    for (var fc = 0; fc < 6; fc++) this.renderCubeFace(sky.cube, fc, earth);
    this.sky = sky;
    return sky;
  };

  Scene.prototype.skyHighlight = function () {
    var p = this.pulsars[this.cur], sky = this.sky;
    if (!p || !sky) return null;
    var hit = null;
    for (var i = 0; i < sky.names.length; i++) if (sky.names[i].name.toLowerCase() === p.constellation.toLowerCase()) hit = sky.names[i].abbr;
    if (sky.hlKey === hit) return sky.hl;
    if (sky.hl) sky.hl.dispose();
    sky.hl = hit && sky.figures[hit] ? lineMesh(this.gl, sky.figures[hit]) : null;
    sky.hlKey = hit;
    return sky.hl;
  };

  /* ------------------------------------------------------------- events */
  Scene.prototype.startEvent = function (kind) {
    if (!this.preset) return 0;
    this.ev = { kind: kind, t: 0, dur: kind === 'supernova' ? 12.5 : 3.2 };
    if (kind === 'supernova' && !this.ejecta) this.ejecta = buildEjecta(this.gl);
    return this.ev.dur;
  };
  Scene.prototype.flare = function (amp) { this.flareT = 0; this.flareAmp = amp || 1; };
  Scene.prototype.updateEvents = function (dt) {
    this.flareT += dt;
    var ev = this.ev;
    if (!ev) { this.evp = null; return; }
    ev.t += dt;
    var t = ev.t, e = { kind: ev.kind, vis: 1, neb: 1, zoom: 1, prog: 0, progR: 6.5, progBright: 1, flash: 0, shell: null, ejT: -1, quake: 0, ring: null, shake: null };
    if (ev.kind === 'supernova') {
      var tx = 3.7;
      e.vis = Math.max(1 - smooth(0, 0.8, t), smooth(7.2, 8.8, t));
      e.neb = t < tx ? lerp(1, 0.08, smooth(0, 1.2, t)) : lerp(0.08, 1, smooth(6.2, 10, t));
      e.zoom = 1 + 1.4 * smooth(0.2, 2.6, t) - 1.4 * smooth(8.5, 11.8, t);
      e.prog = smooth(0.5, 1.5, t) * (1 - smooth(tx - 0.02, tx + 0.18, t));
      e.progR = 6.5 - 1.6 * smooth(3.2, tx, t);
      e.progBright = 1 + 1.8 * smooth(3.2, tx, t);
      if (t > tx) {
        var te = t - tx, R = 2.5 + 16 * (1 - Math.exp(-te / 1.8));
        e.flash = 1.8 * Math.exp(-te / 0.25) + 0.15 * Math.exp(-te / 2.0);
        e.shell = { R: R, W: 0.8 + 0.1 * R, amp: 0.2 * Math.exp(-te / 3.2) * smooth(0, 0.12, te) };
        e.ejT = te;
      }
    } else if (ev.kind === 'glitch') {
      e.quake = Math.exp(-t / 0.45);
      e.ring = { r: 1.3 + 15 * (1 - Math.exp(-t / 0.55)), a: Math.exp(-t / 0.75) };
      var sh = 0.3 * Math.exp(-t / 0.28);
      e.shake = [sh * Math.sin(t * 83), sh * Math.sin(t * 67 + 1.3), sh * Math.sin(t * 71 + 2.1)];
      e.flash = 0.9 * Math.exp(-t / 0.22);
    }
    if (t >= ev.dur) { this.ev = null; this.evp = null; return; }
    this.evp = e;
  };

  Scene.prototype.currentGal = function () {
    return { target: this.gal.target.slice(), dist: this.gal.dist, az: this.gal.az, el: this.gal.el };
  };

  Scene.prototype.snapTo = function (idx) {
    this.applyPreset(idx, true);
    this.mode = 'close';
    this.tr = null;
    this.wClose = 1;
    this.wSky = 0;
  };

  Scene.prototype.updateTravel = function (dt) {
    var tr = this.tr;
    tr.t += dt;
    var u = clamp(tr.t / tr.dur, 0, 1);
    var goOut = tr.aOut || tr.skyOut, comeIn = tr.bIn || tr.skyIn;
    var A = goOut ? 0.3 : 0, B = comeIn ? 0.7 : 1;
    if (tr.calm) { A = goOut ? 0.45 : 0; B = comeIn ? 0.55 : 1; }
    var wA = tr.aOut ? 1 - smooth(A * 0.35, A, u) : 0;
    var wB = tr.bIn ? smooth(B, B + (1 - B) * 0.6, u) : 0;
    this.wSky = tr.skyOut ? 1 - smooth(A * 0.35, A, u) : tr.skyIn ? smooth(B, B + (1 - B) * 0.6, u) : 0;
    // swap the close-up preset once the old one has faded out
    if (tr.bIn && u >= A && this.cur !== tr.to) this.applyPreset(tr.to, false);
    this.wClose = u < 0.5 ? wA : wB;
    this.closeZoom = u < 0.5 ? Math.exp(Math.log(34) * ease(clamp(u / Math.max(A, 1e-3), 0, 1))) : Math.exp(Math.log(34) * (1 - ease(clamp((u - B) / (1 - B + 1e-3), 0, 1))));
    // galaxy camera: pull out of A, fly, drop into B
    var s = ease(clamp((u - A * 0.6) / ((B + (1 - B) * 0.4) - A * 0.6), 0, 1));
    var gA = tr.gFrom, gB = tr.gTo;
    var hop = tr.calm ? 0 : clamp(tr.span * 1.35, 0.55, 15);
    var dist = Math.exp(lerp(Math.log(gA.dist), Math.log(gB.dist), s)) + hop * Math.sin(PI * s);
    if (goOut && u < A) dist = Math.exp(lerp(Math.log(gA.dist * 0.04), Math.log(gA.dist), ease(u / A)));
    if (comeIn && u > B) dist = Math.exp(lerp(Math.log(gB.dist), Math.log(gB.dist * 0.04), ease((u - B) / (1 - B))));
    this.gal.target = V.lerp(gA.target, gB.target, s);
    this.gal.dist = dist;
    var dAz = gB.az - gA.az;
    this.gal.az = gA.az + dAz * s;
    this.gal.el = lerp(gA.el, gB.el, s) + (tr.calm ? 0 : 0.35 * Math.sin(PI * s) * (tr.span > 0.5 ? 1 : 0.4));
    this.warpFx = tr.calm ? 0 : 0.9 * (smooth(A * 0.15, A * 0.7, u) * (1 - smooth(A * 0.7, A * 1.15, u)) + smooth(B - 0.1, B + 0.05, u) * (1 - smooth(B + 0.05, B + 0.22, u)));
    if (u >= 1) {
      this.tr = null;
      this.warpFx = 0;
      if (tr.to === 'map') { this.mode = 'map'; this.wClose = 0; this.wSky = 0; }
      else if (tr.to === 'sky') { this.mode = 'sky'; this.wClose = 0; this.wSky = 1; }
      else { this.mode = 'close'; this.wClose = 1; this.closeZoom = 1; this.wSky = 0; }
      if (this.onArrive) this.onArrive(tr.to);
    }
  };

  /* ------------------------------------------------------------ input */
  Scene.prototype.orbit = function (dx, dy) {
    if (this.mode === 'sky') {
      var k = this.skyCam.fov / (60 * DEG);
      this.skyCam.yaw += dx * 0.0032 * k;
      this.skyCam.pitch = clamp(this.skyCam.pitch + dy * 0.0032 * k, -1.3, 1.3);
      return;
    }
    if (this.mode === 'map') {
      this.mapUser.az -= dx * 0.005;
      this.mapUser.el = clamp(this.mapUser.el + dy * 0.004, -0.75, 0.45);
    } else {
      this.close.userAz -= dx * 0.006;
      this.close.userEl = clamp(this.close.userEl + dy * 0.005, -0.9, 0.9);
    }
  };
  Scene.prototype.zoomBy = function (f) {
    if (this.mode === 'sky') { this.skyCam.fovTarget = clamp(this.skyCam.fovTarget / f, 18 * DEG, 100 * DEG); return; }
    if (this.mode === 'map') this.mapUser.zoom = clamp(this.mapUser.zoom * f, 0.6, 9);
    else this.close.zoom = clamp(this.close.zoom * f, 0.55, 2.2);
  };

  /* ----------------------------------------------------------- render */
  Scene.prototype.resize = function () {
    var c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight);
    var budget = Math.sqrt(2.6e6 / (w * h * dpr * dpr));
    var s = Math.min(1, budget) * this.res;
    var W = Math.round(w * dpr * s), H = Math.round(h * dpr * s);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    this.W = W; this.H = H; this.cssW = w; this.cssH = h;
    this.tScene.resize(W, H);
    this.tBeam.resize(Math.ceil(W / 2), Math.ceil(H / 2));
    var mw = Math.ceil(W / 2), mh = Math.ceil(H / 2);
    for (var i = 0; i < this.mips.length; i++) { this.mips[i].resize(mw, mh); mw = Math.max(1, Math.ceil(mw / 2)); mh = Math.max(1, Math.ceil(mh / 2)); }
  };

  function camBasis(eye, at, up) {
    var f = V.norm(V.sub(at, eye)), rr = V.norm(V.cross(f, up)), u = V.cross(rr, f);
    return { f: f, r: rr, u: u };
  }

  /* st: { dt, time, phi, f, env, flash, partner: {phi, f}, calm } */
  Scene.prototype.frame = function (st) {
    var gl = this.gl, dt = Math.min(st.dt, 0.1);
    this.time += dt;
    this.frameNo++;
    this.perf.acc += st.dt; this.perf.n++;
    if (this.perf.n >= 90) {
      var avg = this.perf.acc / this.perf.n;
      if (avg > 0.024 && this.res > 0.55) this.res = Math.max(0.55, this.res * 0.85);
      else if (avg < 0.0135 && this.res < 1) this.res = Math.min(1, this.res + 0.08);
      this.perf.acc = 0; this.perf.n = 0;
    }
    this.resize();
    if (this.tr) this.updateTravel(dt);
    else this.closeZoom = 1;
    this.updateEvents(dt);
    this.fade = Math.min(1, this.fade + dt * 0.8);

    // finish sky generation, one face per frame
    if (this.cubeJob) {
      this.renderCubeFace(this.cubes[this.cubeJob.target], this.cubeJob.face, this.cubeJob.preset);
      this.cubeJob.face++;
      if (this.cubeJob.face >= 6) { this.cubeActive = this.cubeJob.target; this.cubeJob = null; }
    }

    // idle drift
    if (this.mode === 'map' && !this.dragging) this.mapUser.az += dt * 0.018;
    var aspect = this.W / this.H;
    var narrow = this.cssW < 760;

    /* ---- galaxy camera */
    var gv = this.mode === 'map' ? this.mapView() : this.gal;
    if (this.mode === 'map') { this.gal.target = gv.target; this.gal.dist = gv.dist; this.gal.az = gv.az; this.gal.el = gv.el; }
    var gEye = V.add(gv.target, V.mul([Math.cos(gv.el) * Math.sin(gv.az), Math.sin(gv.el), Math.cos(gv.el) * Math.cos(gv.az)], gv.dist));
    var gView = M.lookAt(gEye, gv.target, [0, 1, 0]);
    var gShift = narrow ? [0, 0.12] : [0.08, 0.02];
    var gProj = M.persp(this.gal.fov, aspect, gv.dist * 0.01, gv.dist * 60 + 60, gShift[0], gShift[1]);
    var gVP = M.mul(gProj, gView);
    var gB = camBasis(gEye, gv.target, [0, 1, 0]);

    /* ---- close-up camera */
    var pr = this.preset, cl = this.close;
    var shift = narrow ? [0, 0.2] : this.cinema ? [0, 0.03] : [this.lensShift[0], this.lensShift[1]];
    var cEye = [0, 0, 20], cVP = gVP, cB = gB, cView, cProj, ep = this.evp;
    if (pr) {
      if (!this.dragging) { cl.userAz += cl.velAz; cl.velAz *= 0.92; if (!st.calm) cl.userAz += dt * (this.cinema ? 0.05 : 0.012); }
      var az = pr.camAz + cl.userAz, el = clamp(pr.camEl + cl.userEl + (this.cinema ? 0.12 * Math.sin(this.time * 0.13) : 0), -1.2, 1.2);
      var breathe = this.cinema ? 1.04 - 0.14 * Math.sin(this.time * 0.19) : 1;
      var dist = cl.dist * (narrow ? 1.35 : 1) / cl.zoom * (this.closeZoom || 1) * breathe * (ep ? ep.zoom : 1);
      cEye = V.mul([Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)], dist);
      if (ep && ep.shake) cEye = V.add(cEye, ep.shake);
      cView = M.lookAt(cEye, [0, 0, 0], [0, 1, 0]);
      cProj = M.persp(cl.fov, aspect, 0.05, 900, shift[0], shift[1]);
      cVP = M.mul(cProj, cView);
      cB = camBasis(cEye, [0, 0, 0], [0, 1, 0]);
    }
    /* ---- sky from Earth */
    var wS = this.mode === 'sky' ? 1 : this.mode === 'close' ? 0 : (this.wSky || 0);
    var sVP = null, sB = null, sFov = this.skyCam.fov;
    if (wS > 0.001 && this.sky) {
      if (this.skyTurn) { this.skyTurn.t += dt; if (this.skyTurn.t >= this.skyTurn.dur) this.skyTurn = null; }
      this.skyCam.fov += (this.skyCam.fovTarget - this.skyCam.fov) * (1 - Math.exp(-dt * 1.4));
      var lk = this.skyLook();
      sFov = this.skyCam.fov + (this.skyTurn ? 26 * DEG * Math.sin(PI * clamp(this.skyTurn.t / this.skyTurn.dur, 0, 1)) : 0);
      sVP = M.mul(M.persp(sFov, aspect, 0.5, 400, shift[0], shift[1]), M.lookAt([0, 0, 0], lk.f, lk.up));
      sB = camBasis([0, 0, 0], lk.f, lk.up);
    }
    this.cVP = cVP; this.gVP = gVP; this.sVP = sVP;
    var wC = pr && this.mode !== 'sky' ? this.wClose : 0;
    var wG = this.mode === 'close' || this.mode === 'sky' ? 0 : Math.max(0, 1 - wC - wS);
    var enc = this.enc;
    var pxPerRad = this.H / (2 * Math.tan(cl.fov / 2));

    /* ================= scene target */
    this.tScene.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // background: whichever view dominates (Earth's sky, the close-up, or the galaxy)
    var skyB, skyFov, skyShift, skyCube = this.cubes[this.cubeActive], skyW, starGain;
    if (wS > 0.5 && sB) { skyB = sB; skyFov = sFov; skyShift = shift; skyCube = this.sky.cube; skyW = wS; starGain = 0.34; }
    else if (wC > 0.5) { skyB = cB; skyFov = cl.fov; skyShift = shift; skyW = wC * (ep ? ep.neb : 1); starGain = lerp(0.45, 1.0, wC); }
    else { skyB = gB; skyFov = this.gal.fov; skyShift = gShift; skyW = 0; starGain = 0.45; }
    var tanY = Math.tan(skyFov / 2);
    var sky = this.pSky.use();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyCube);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyCube);
    sky.i1('uCubeA', 0).i1('uCubeB', 1).f1('uMix', 0).f1('uSky', skyW).f1('uStarGain', starGain)
      .f1('uPix', 2 * tanY / this.H).f1('uTime', this.time).f1('uOut', enc).f1('uGal', wG)
      .f3('uR', skyB.r).f3('uU', skyB.u).f3('uF', skyB.f).f2('uTan', tanY * aspect, tanY).f2('uShift', skyShift[0], skyShift[1]);
    this.tri.draw();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    /* ---- galaxy */
    if (wG > 0.001) this.drawGalaxy(gVP, gEye, gB, wG, st);

    /* ---- close-up */
    var beamParams = null;
    if (pr && wC > 0.001) beamParams = this.drawClose(pr, cVP, cEye, cB, wC, st, pxPerRad);

    /* ---- Earth's sky */
    if (wS > 0.001 && sVP) this.drawSky(sVP, wS, st);

    /* ================= beams (half resolution) */
    if (beamParams) {
      this.tBeam.bind();
      gl.disable(gl.BLEND);
      var bp = this.pBeam.use();
      bp.f3('uEye', cEye).f3('uR', cB.r).f3('uU', cB.u).f3('uF', cB.f)
        .f2('uTan', Math.tan(cl.fov / 2) * aspect, Math.tan(cl.fov / 2)).f2('uShift', shift[0], shift[1])
        .i1('uN', beamParams.n).v3('uC', beamParams.C).m3('uS', beamParams.S).v4('uP', beamParams.P).v2('uW', beamParams.W)
        .v3('uCc', beamParams.Cc).v3('uCh', beamParams.Ch).v1('uRad', beamParams.R)
        .f1('uJet', pr.vis.jets || 0).f1('uTorus', pr.vis.torus || 0).f1('uTime', this.time).f1('uOut', enc)
        .f1('uFrame', this.frameNo).f1('uBound', beamParams.bound)
        .f4('uShell', beamParams.shell ? [beamParams.shell.R, beamParams.shell.W, beamParams.shell.amp, this.time] : [0, 0, 0, 0])
        .f3('uShellA', [1.0, 0.86, 0.62]).f3('uShellB', [1.0, 0.36, 0.18]);
      this.tri.draw();
      this.tScene.bind();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.disable(gl.DEPTH_TEST);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tBeam.tex);
      this.pCopy.use().i1('uTex', 0).f1('uGain', wC);
      this.tri.draw();
    }

    /* ================= bloom */
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    var src = this.tScene, i;
    for (i = 0; i < this.mips.length; i++) {
      var dst = this.mips[i];
      dst.bind();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
      this.pDown.use().i1('uTex', 0).f2('uTexel', 1 / src.w, 1 / src.h).f1('uThresh', 0.8 * enc).f1('uFirst', i === 0 ? 1 : 0);
      this.tri.draw();
      src = dst;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (i = this.mips.length - 1; i > 0; i--) {
      this.mips[i - 1].bind();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.mips[i].tex);
      this.pUp.use().i1('uTex', 0).f2('uTexel', 1 / this.mips[i].w, 1 / this.mips[i].h);
      this.tri.draw();
    }
    gl.disable(gl.BLEND);

    /* ================= final */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tScene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.mips[0].tex);
    var centre = [0.5 + shift[0] * 0.5, 0.5 + shift[1] * 0.5];
    this.pFinal.use().i1('uScene', 0).i1('uBloom', 1).f1('uBloomAmt', 0.62).f1('uExposure', 1.05 + (st.flash || 0) * 0.08 + (ep ? ep.flash * (ep.kind === 'supernova' ? 1.4 : 0.25) : 0))
      .f1('uWarp', this.warpFx).f1('uTime', this.time).f1('uIn', 1 / enc).f1('uGrain', 0.028).f1('uFade', this.fade)
      .f2('uRes', this.W, this.H).f2('uCenter', centre[0], centre[1]);
    this.tri.draw();

    this.buildLabels(pr, cVP, gVP, wC, wG, st, wS);
  };

  Scene.prototype.drawGalaxy = function (VP, eye, B, w, st) {
    var gl = this.gl, enc = this.enc;
    var px = this.H / (2 * Math.tan(this.gal.fov / 2));
    this.pGal.use().m4('uVP', VP).f3('uEye', eye).f1('uPx', px).f1('uGain', w * 1.0).f1('uOut', enc);
    this.galaxy.draw();
    // markers
    var g = this.pGlow.use();
    g.m4('uVP', VP).f2('uRes', this.W, this.H).f1('uOut', enc).f2('uStretch', 1, 1).f1('uSize', 0).f1('uRing', 0);
    var dpr = this.W / this.cssW;
    for (var i = 0; i < this.gpos.length; i++) {
      var p = this.pulsars[i], f = 1 / p.P;
      var blink = f < 3 ? Math.pow(0.5 + 0.5 * Math.cos(TAU * this.time * f), 8) : 0.6 + 0.2 * Math.sin(this.time * 9 + i);
      if (st.calm) blink = 0.6;
      var isCur = (this.tr && this.tr.to === i) || i === this.cur;
      var col = isCur ? [0.75, 0.95, 1.0] : [1.0, 0.78, 0.45];
      g.f3('uCenter', this.gpos[i]).f1('uPixSize', (isCur ? 26 : 18) * dpr).f3('uCol', col).f1('uInt', w * (0.5 + 1.6 * blink) * (isCur ? 1.6 : 1)).f1('uCore', 1.2);
      this.quad.draw();
    }
    g.f3('uCenter', this.sunPos).f1('uPixSize', 16 * dpr).f3('uCol', [1.0, 0.9, 0.55]).f1('uInt', w * 1.2).f1('uCore', 1.0);
    this.quad.draw();
  };

  /* The sky seen from Earth: real stars, constellation figures, and the pulsars
   * blinking where they really are. */
  Scene.prototype.drawSky = function (VP, w, st) {
    var gl = this.gl, enc = this.enc, sky = this.sky, dpr = this.W / this.cssW, i;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    var lp = this.pLine.use();
    lp.m4('uVP', VP).m4('uModel', M.ident()).f2('uRes', this.W, this.H).f1('uTime', this.time).f1('uOut', enc * w)
      .f1('uGrid', 0).f4('uGW', [0, 0, 0, 0]).f1('uFlow', 0).f1('uDash', 0);
    lp.f3('uCol', [0.5, 0.6, 0.85]).f1('uAlpha', 0.06).f1('uWidth', 1 * dpr);
    sky.grid.draw();
    lp.f3('uCol', [0.55, 0.72, 1.0]).f1('uAlpha', 0.3).f1('uWidth', 1.1 * dpr);
    sky.lines.draw();
    var hl = this.skyHighlight();
    if (hl) { lp.f3('uCol', [1.0, 0.74, 0.38]).f1('uAlpha', 0.6).f1('uWidth', 1.6 * dpr); hl.draw(); }
    var pp = this.pPts.use();
    pp.m4('uVP', VP).m4('uMag', M.ident()).f1('uMode', 3).f1('uDpr', dpr).f1('uTime', this.time).f1('uOut', enc * w)
      .f1('uGain', 1).f3('uEye', [0, 0, 0]).f1('uPx', 1);
    sky.stars.draw();
    var g = this.pGlow.use();
    g.m4('uVP', VP).f2('uRes', this.W, this.H).f1('uOut', enc * w).f2('uStretch', 1, 1).f1('uSize', 0).f1('uRing', 0);
    for (i = 0; i < this.skyDir.length; i++) {
      var pos = V.mul(this.skyDir[i], 100);
      if (i === this.cur) {
        var fl = st.calm ? 0.3 : (st.flash || 0);
        g.f3('uCenter', pos).f1('uPixSize', 14 * dpr).f3('uCol', [0.75, 0.95, 1.0]).f1('uInt', 0.7 + 2.2 * fl).f1('uCore', 1.6).f1('uRing', 0);
        this.quad.draw();
        var ph = st.f < 3 ? ((st.phi % 1) + 1) % 1 : (this.time * 0.7) % 1;
        g.f1('uPixSize', 46 * dpr).f1('uRing', 0.25 + 0.7 * ph).f1('uInt', (1 - ph) * 0.9).f3('uCol', [0.7, 0.92, 1.0]);
        this.quad.draw();
        g.f1('uRing', 0);
      } else {
        g.f3('uCenter', pos).f1('uPixSize', 9 * dpr).f3('uCol', [1.0, 0.75, 0.42]).f1('uInt', 0.55).f1('uCore', 1.0);
        this.quad.draw();
      }
    }
  };

  /* Close-up of the current pulsar. Returns the parameters for the beam pass. */
  Scene.prototype.drawClose = function (pr, VP, eye, B, w, st, pxPerRad) {
    var gl = this.gl, enc = this.enc, v = pr.vis, t = this.time;
    var f = st.f || (1 / pr.p.P);
    var psi = TAU * (((st.phi || 0) % 1) + 1) % TAU;
    // rotation blur window: what the beam sweeps during one frame, widened into
    // a steady hollow cone for fast spinners (and to avoid strobing)
    var D = TAU * f / 60 + TAU * smooth(2.5, 9, f);
    if (st.calm) D = Math.max(D, TAU * smooth(1.2, 4, f));
    D = Math.min(D, TAU);
    var Om = pr.Om, xs = pr.xs, ys = pr.ys, al = pr.alpha;
    function bodyAt(ps) {
      var bx = V.add(V.mul(xs, Math.cos(ps)), V.mul(ys, Math.sin(ps)));
      var by = V.add(V.mul(xs, -Math.sin(ps)), V.mul(ys, Math.cos(ps)));
      return { bx: bx, by: by };
    }
    var body = bodyAt(psi);
    var mu = V.add(V.mul(body.bx, Math.sin(al)), V.mul(Om, Math.cos(al)));
    var ep = this.evp, vis = ep ? ep.vis : 1;
    var flash = (st.flash || 0) * vis + (ep && ep.kind === 'glitch' ? ep.flash : 0);
    var fl = st.calm ? 0 : this.flareAmp * Math.exp(-this.flareT / 0.12);

    // --- opaque spheres
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    var sp = this.pSph.use();
    sp.m4('uVP', VP).f3('uEye', eye).f3('uCamR', B.r).f3('uCamU', B.u).f1('uOut', enc * w).f1('uTime', t);
    var bodyM = new Float32Array([body.bx[0], body.by[0], Om[0], body.bx[1], body.by[1], Om[1], body.bx[2], body.by[2], Om[2]]);
    sp.f3('uCenter', [0, 0, 0]).f1('uRad', 1).f1('uKind', 0).m3('uBody', bodyM).f3('uMagB', [Math.sin(al), 0, Math.cos(al)])
      .f3('uCol', V.mul(v.surf, vis)).f1('uFlash', flash + fl * 1.5).f1('uTexAmt', 1 / (1 + D * 2.5)).f1('uBright', 1).f3('uLight', [0, 1, 0])
      .f1('uQuake', ep ? ep.quake : 0);
    if (vis > 0.03) this.quad.draw();
    sp.f1('uQuake', 0);
    if (ep && ep.prog > 0.01) {
      sp.f1('uRad', ep.progR).f1('uKind', 3).f1('uBright', ep.prog * ep.progBright);
      this.quad.draw();
    }

    var comp = null, planets = [];
    var ofr = pr.orbitFrame;
    if (v.companion && ofr) {
      var c = v.companion, Mn = TAU * t / c.period, E = Mn;
      for (var it = 0; it < 6; it++) E = E - (E - c.e * Math.sin(E) - Mn) / (1 - c.e * Math.cos(E));
      var rr = c.a * (1 - c.e * Math.cos(E));
      var nu = 2 * Math.atan2(Math.sqrt(1 + c.e) * Math.sin(E / 2), Math.sqrt(1 - c.e) * Math.cos(E / 2));
      comp = { pos: V.add(V.mul(ofr.x, rr * Math.cos(nu)), V.mul(ofr.z, rr * Math.sin(nu))), nu: nu, c: c };
      var kind = 1, bright = c.kind === 'wd' ? 0.95 : c.kind === 'star' ? 0.85 : 0.72;
      sp.f3('uCenter', comp.pos).f1('uRad', c.size).f1('uKind', kind).m3('uBody', new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]))
        .f3('uCol', c.col).f1('uBright', bright).f1('uFlash', 0).f1('uTexAmt', 1);
      this.quad.draw();
    }
    if (v.planets && ofr) {
      for (var k = 0; k < v.planets.length; k++) {
        var pl = v.planets[k], a = TAU * t / pl.period + k * 2.1;
        var ppos = V.add(V.mul(ofr.x, Math.cos(a) * pl.a), V.mul(ofr.z, Math.sin(a) * pl.a));
        planets.push({ pos: ppos, pl: pl });
        sp.f3('uCenter', ppos).f1('uRad', pl.size).f1('uKind', 2).m3('uBody', new Float32Array([Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)]))
          .f3('uCol', pl.col).f3('uLight', V.norm(V.mul(ppos, -1))).f1('uBright', 1);
        this.quad.draw();
      }
    }
    this.compNow = comp; this.planetsNow = planets;

    // --- additive layers
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    var lp = this.pLine.use();
    lp.m4('uVP', VP).f2('uRes', this.W, this.H).f1('uTime', t).f1('uOut', enc * w).f1('uGrid', 0).f4('uGW', [0, 0, 0, 0]);
    var dpr = this.W / this.cssW;

    // field lines, smeared over the frame's rotation when spinning fast
    var K = clamp(Math.ceil(D / 0.16), 1, 22);
    var fieldCol = V.mul(v.halo, 0.9);
    lp.f3('uCol', V.add(fieldCol, [0.12, 0.12, 0.16])).f1('uWidth', 1.1 * dpr).f1('uDash', 0).f1('uFlow', 14);
    for (var j = 0; j < K; j++) {
      var ps = K === 1 ? psi : psi - D / 2 + D * (j + 0.5) / K;
      var bd = bodyAt(ps);
      var zm = V.add(V.mul(bd.bx, Math.sin(al)), V.mul(Om, Math.cos(al)));
      var xm = V.sub(V.mul(bd.bx, Math.cos(al)), V.mul(Om, Math.sin(al)));
      lp.m4('uModel', M.basis(xm, bd.by, zm)).f1('uAlpha', 0.22 / Math.sqrt(K) * (K > 1 ? 1.25 : 1) * vis * (1 + 2.5 * (ep ? ep.quake : 0)));
      pr.field.draw();
    }
    lp.m4('uModel', M.ident());
    // spin axis and Earth line
    lp.f3('uCol', [0.55, 0.62, 0.8]).f1('uAlpha', 0.28 * vis).f1('uWidth', 1 * dpr).f1('uDash', 14).f1('uFlow', 0);
    pr.axis.draw();
    var earthGlow = (0.28 + (st.envVis || 0) * 0.9) * vis;
    lp.f3('uCol', [1.0, 0.72, 0.32]).f1('uAlpha', earthGlow).f1('uWidth', 1.4 * dpr).f1('uDash', 20);
    pr.earthLine.draw();
    if (fl > 0.02) {
      // a giant pulse is a flash in the beam that points at us
      lp.f3('uCol', [0.85, 0.95, 1.0]).f1('uAlpha', Math.min(1.6, fl * 1.6)).f1('uWidth', 2.6 * dpr).f1('uDash', 0);
      pr.earthLine.draw();
    }
    if (pr.showLc && pr.lcRing) {
      lp.f3('uCol', [1.0, 0.7, 0.35]).f1('uAlpha', 0.3 * vis).f1('uWidth', 1.2 * dpr).f1('uDash', 60);
      pr.lcRing.draw();
    }
    if (pr.orbits) {
      lp.f3('uCol', [0.7, 0.78, 0.95]).f1('uAlpha', 0.22 * vis).f1('uWidth', 1 * dpr).f1('uDash', 0);
      pr.orbits.draw();
    }
    if (v.gw && ofr) {
      var nuG = comp ? comp.nu : t * 0.3;
      lp.m4('uModel', M.basis(ofr.x, ofr.y, ofr.z, V.mul(ofr.y, -0.0))).f1('uGrid', 1)
        .f4('uGW', [0.9 * v.gw, 0.55, 2 * nuG, 0.08]).f3('uCol', [0.55, 0.65, 1.0]).f1('uAlpha', 0.2 * v.gw).f1('uWidth', 1 * dpr).f1('uDash', 0);
      this.grid.draw();
      lp.f1('uGrid', 0).m4('uModel', M.ident());
    }

    // particles
    var pp = this.pPts.use();
    var pxs = this.H / (2 * Math.tan(this.close.fov / 2));
    pp.m4('uVP', VP).f3('uEye', eye).f1('uPx', pxs).f1('uTime', t).f1('uOut', enc * w).f1('uLc', pr.showLc ? pr.lc : 999)
      .f1('uLen', pr.lenBeam * 0.8).f1('uRho', pr.rho).f1('uGain', 1);
    pp.f1('uMode', 0).m4('uMag', M.ident()).f3('uB1', [0, 1, 0]).f3('uQ1', [1, 0, 0]).f3('uPCol', [1, 1, 1]);
    pr.near.draw();
    var zmN = mu, xmN = V.sub(V.mul(body.bx, Math.cos(al)), V.mul(Om, Math.sin(al)));
    pp.f1('uMode', 1).m4('uMag', M.basis(xmN, body.by, zmN)).f3('uPCol', V.mul(v.halo, 1.3)).f1('uGain', (D > 2 ? 0.5 : 1) * vis);
    pr.fparts.draw();
    var q1 = V.norm(V.cross(mu, Om));
    if (D < 2.5) {
      pp.f1('uMode', 2).f3('uB1', mu).f3('uQ1', q1).f3('uPCol', V.mul(v.beam, 1.2)).f1('uGain', (1 - D / 2.5) * vis);
      pr.bparts.draw();
    }
    if (ep && ep.ejT >= 0 && this.ejecta) {
      pp.f1('uMode', 4).f1('uEv', ep.ejT).f1('uGain', 1.2);
      this.ejecta.draw();
    }

    // glow sprites
    gl.disable(gl.DEPTH_TEST);
    var g = this.pGlow.use();
    g.m4('uVP', VP).f3('uR', B.r).f3('uU', B.u).f2('uRes', this.W, this.H).f1('uOut', enc * w).f1('uPixSize', 0).f2('uStretch', 1, 1).f1('uRing', 0);
    g.f3('uCenter', [0, 0, 0]).f1('uSize', 2.5).f3('uCol', V.mul(v.halo, 0.7)).f1('uInt', (0.28 + flash * 0.8) * vis).f1('uCore', 0.1);
    this.quad.draw();
    g.f1('uSize', 1.12).f3('uCol', [0.9, 0.95, 1.0]).f1('uInt', (0.12 + flash * 1.1) * vis + fl * 2.2).f1('uCore', 1.0);
    this.quad.draw();
    if (ep && ep.prog > 0.01) {
      g.f1('uSize', ep.progR * 2.3).f3('uCol', [1.0, 0.42, 0.16]).f1('uInt', 0.5 * ep.prog * ep.progBright).f1('uCore', 0.05);
      this.quad.draw();
    }
    if (ep && ep.kind === 'supernova' && ep.flash > 0.01) {
      g.f1('uSize', 16).f3('uCol', [1.0, 0.92, 0.8]).f1('uInt', ep.flash * 1.3).f1('uCore', 0.6);
      this.quad.draw();
    }
    if (ep && ep.ring) {
      g.f1('uSize', ep.ring.r).f1('uRing', 0.92).f3('uCol', [0.75, 0.9, 1.0]).f1('uInt', ep.ring.a * 1.1);
      this.quad.draw();
      g.f1('uRing', 0);
    }
    var fa = st.calm ? 0 : this.flareAmp * Math.exp(-this.flareT / 0.28) * 0.8;
    if (fa > 0.01) {
      g.f1('uSize', 1.4 + 9 * (1 - Math.exp(-this.flareT / 0.2))).f1('uRing', 0.92).f3('uCol', [0.8, 0.92, 1.0]).f1('uInt', fa);
      this.quad.draw();
      g.f1('uRing', 0);
    }
    if (flash > 0.02) {
      g.f1('uSize', 7).f2('uStretch', 1.6, 0.03).f3('uCol', V.mul(v.beam, 0.8)).f1('uInt', flash * 0.8).f1('uCore', 0.8);
      this.quad.draw();
      g.f2('uStretch', 1, 1);
    }
    if (comp) {
      var cc = comp.c;
      g.f3('uCenter', comp.pos).f1('uSize', cc.size * 3.0).f3('uCol', V.mul(cc.col, cc.kind === 'star' ? 0.5 : 0.35)).f1('uInt', 0.55).f1('uCore', 0.15);
      this.quad.draw();
    }

    // beam parameters (second emitter: pulsar B of the double pulsar)
    // a beam smeared into a full cone covers far more sky, so keep its glow in check
    var ints = 0.28 * (v.rho > 15 ? 0.75 : 1) * (1 - 0.72 * smooth(0.6, TAU, D));
    var out = {
      n: 1, bound: pr.lenBeam + 2,
      C: new Float32Array(6), S: new Float32Array(18), P: new Float32Array(8), W: new Float32Array(4),
      Cc: new Float32Array(6), Ch: new Float32Array(6), R: new Float32Array([1, 1])
    };
    out.S.set([xs[0], xs[1], xs[2], ys[0], ys[1], ys[2], Om[0], Om[1], Om[2]], 0);
    out.P.set([al, pr.rho, pr.lenBeam, ints * (1 + flash * 0.25) * vis], 0);
    if (ep && ep.shell) { out.shell = ep.shell; out.bound = Math.max(out.bound, ep.shell.R + ep.shell.W * 3 + 2); }
    out.W.set([psi, D], 0);
    out.Cc.set(v.beam, 0); out.Ch.set(v.halo, 0);
    if (comp && comp.c.kind === 'pulsar' && st.partner) {
      var fB = st.partner.f, psiB = TAU * (((st.partner.phi % 1) + 1) % 1);
      var DB = Math.min(TAU, TAU * fB / 60 + TAU * smooth(2.5, 9, fB));
      var OmB = V.norm([-0.35, 1, 0.25]), xB = V.norm(V.cross([0, 0, 1], OmB)), yB = V.cross(OmB, xB);
      out.n = 2;
      out.C.set(comp.pos, 3);
      out.S.set([xB[0], xB[1], xB[2], yB[0], yB[1], yB[2], OmB[0], OmB[1], OmB[2]], 9);
      out.P.set([55 * DEG, 14 * DEG, 9, 0.3], 4);
      out.W.set([psiB, DB], 2);
      out.Cc.set([0.95, 0.85, 1.0], 3); out.Ch.set([0.55, 0.35, 1.0], 3);
      out.R[1] = comp.c.size;
      out.bound = Math.max(out.bound, V.len(comp.pos) + 11);
    }
    this.muNow = mu;
    return out;
  };

  /* Screen positions for the HTML labels. */
  Scene.prototype.project = function (VP, p) {
    var c = M.xform(VP, p);
    if (c[3] <= 0) return null;
    var sx = (c[0] * 0.5 + 0.5) * this.cssW, sy = (1 - (c[1] * 0.5 + 0.5)) * this.cssH;
    return { x: sx, y: sy, z: c[2] };
  };

  Scene.prototype.buildLabels = function (pr, cVP, gVP, wC, wG, st, wS) {
    var L = [], self = this, i;
    var vis = this.evp ? this.evp.vis : 1;
    if (wS > 0.5 && this.sVP && this.sky) {
      var SV = this.sVP, W = this.cssW, H = this.cssH;
      this.sky.names.forEach(function (n) {
        var q = self.project(SV, V.mul(n.dir, 100));
        if (q && q.x > -60 && q.x < W + 60 && q.y > -20 && q.y < H + 20) L.push({ key: 'c_' + n.abbr, text: n.name, x: q.x, y: q.y, a: wS * 0.9, kind: 'const' });
      });
      for (i = 0; i < this.skyDir.length; i++) {
        var q2 = this.project(SV, V.mul(this.skyDir[i], 100));
        if (!q2) continue;
        var ps = this.pulsars[i];
        if (i === this.cur) L.push({ key: 'sc' + i, text: ps.name, sub: 'in ' + ps.constellation + ' \u00b7 ' + fmtLy(CC.derive(ps).distLy), x: q2.x, y: q2.y, a: wS, kind: 'skycur' });
        else L.push({ key: 's' + i, idx: i, text: ps.short, x: q2.x, y: q2.y, a: wS * 0.9, kind: 'marker' });
      }
    }
    if (wG > 0.35) {
      for (i = 0; i < this.gpos.length; i++) {
        var q = this.project(gVP, this.gpos[i]);
        if (q) L.push({ key: 'g' + i, idx: i, text: this.pulsars[i].short, x: q.x, y: q.y, a: wG, kind: 'marker', cur: i === this.cur });
      }
      var s = this.project(gVP, this.sunPos);
      if (s) L.push({ key: 'sun', text: 'Sun', x: s.x, y: s.y, a: wG, kind: 'sun' });
    }
    if (pr && wC > 0.6 && !st.calm && this.flareT < 0.9 && this.flareAmp > 0) {
      var gq = this.project(cVP, [0, 1.6, 0]);
      if (gq) L.push({ key: 'giant', text: 'giant pulse', x: gq.x, y: gq.y - 18, a: wC * (1 - this.flareT / 0.9), kind: 'tag' });
    }
    if (pr && wC > 0.6 && vis > 0.5) {
      var d = CC.derive(pr.p);
      var e = this.project(cVP, V.mul(pr.earth, 6.8));
      if (e) L.push({ key: 'earth', text: 'to Earth', sub: fmtLy(d.distLy), x: e.x, y: e.y, a: wC, kind: 'note', glow: st.envVis || 0 });
      if (pr.showLc) {
        var lcp = this.project(cVP, V.add(V.mul(pr.xs, -pr.lc * 0.72), V.mul(pr.ys, -pr.lc * 0.7)));
        if (lcp) L.push({ key: 'lc', text: 'light cylinder', sub: Math.round(d.lcKm) + ' km', x: lcp.x, y: lcp.y, a: wC, kind: 'note' });
      }
      if (this.compNow) {
        var cn = this.compNow, names = { wd: 'white dwarf', ns: 'neutron star', pulsar: 'pulsar B', star: 'companion star' };
        var cp = this.project(cVP, V.add(cn.pos, [0, cn.c.size + 0.5, 0]));
        if (cp) L.push({ key: 'comp', text: names[cn.c.kind] || 'companion', x: cp.x, y: cp.y, a: wC, kind: 'tag' });
      }
      (this.planetsNow || []).forEach(function (o, k) {
        var pp = self.project(cVP, V.add(o.pos, [0, o.pl.size + 0.45, 0]));
        if (pp) L.push({ key: 'pl' + k, text: o.pl.name, x: pp.x, y: pp.y, a: wC, kind: 'tag' });
      });
    }
    this.labels = L;
  };

  Scene.prototype.pick = function (x, y) {
    if (this.mode !== 'map') return -1;
    var best = -1, bd = 26 * 26;
    for (var i = 0; i < this.gpos.length; i++) {
      var q = this.project(this.gVP, this.gpos[i]);
      if (!q) continue;
      var dd = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y);
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  };

  function fmtLy(ly) {
    var n = ly >= 1000 ? Math.round(ly / 100) * 100 : Math.round(ly / 10) * 10;
    return n.toLocaleString('en-US') + ' ly';
  }

  CC.Scene = Scene;
})();
