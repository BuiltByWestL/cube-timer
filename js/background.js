/* Animated background: soft drifting colour fields bent by low-frequency simplex noise, rendered in a
   fragment shader at low resolution (the upscale is part of the blur). Falls back to static CSS gradients without WebGL. */
(function () {
  const CT = (window.CT = window.CT || {});

  const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg, uC1, uC2, uC3, uC4;
uniform float uInt, uScale;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  // slow, low-frequency warp: this is what makes the colour fields undulate like silk
  vec2 wp = p * uScale * 0.9;
  vec2 warp = vec2(snoise(wp + vec2(t * 0.20, 0.0)), snoise(wp + vec2(5.2, t * 0.17)));
  p += 0.22 * warp;
  p += 0.05 * vec2(sin(p.y * 3.2 + t * 0.55), cos(p.x * 2.7 - t * 0.45));

  // four drifting colour fields
  vec2 c1 = vec2(-0.42 * asp + 0.30 * sin(t * 0.21 + 0.0), 0.26 + 0.24 * cos(t * 0.17 + 1.0));
  vec2 c2 = vec2( 0.40 * asp + 0.28 * cos(t * 0.19 + 2.0), 0.24 + 0.26 * sin(t * 0.23 + 0.5));
  vec2 c3 = vec2(-0.18 * asp + 0.32 * sin(t * 0.16 + 4.0), -0.30 + 0.22 * cos(t * 0.22 + 2.5));
  vec2 c4 = vec2( 0.46 * asp + 0.26 * cos(t * 0.20 + 5.0), -0.28 + 0.24 * sin(t * 0.18 + 3.5));
  float k = 3.2 * uScale * uScale / 1.44;
  float w1 = exp(-dot(p - c1, p - c1) * k);
  float w2 = exp(-dot(p - c2, p - c2) * k);
  float w3 = exp(-dot(p - c3, p - c3) * k);
  float w4 = exp(-dot(p - c4, p - c4) * k);
  float sum = w1 + w2 + w3 + w4;
  vec3 blend = (uC1 * w1 + uC2 * w2 + uC3 * w3 + uC4 * w4) / (sum + 1e-4);

  // soft ribbons of light riding the warp
  float band = 0.82 + 0.18 * sin(p.x * 2.4 + p.y * 1.7 + warp.x * 2.2 + t * 0.4);
  float a = (1.0 - exp(-sum * 1.35)) * band;
  vec3 col = mix(uBg, blend, clamp(a * uInt, 0.0, 1.0));

  // gentle vignette keeps the edges calm
  float v = smoothstep(1.4, 0.2, length((uv - 0.5) * vec2(1.0, 0.9)));
  col = mix(uBg, col, 0.6 + 0.4 * v);
  gl_FragColor = vec4(col, 1.0);
}`;

  const QUALITY = { low: 0.22, medium: 0.4, high: 0.7 };

  let gl = null;
  let canvas = null;
  let prog = null;
  let U = {};
  let ok = false;
  let animated = true;
  let scale = QUALITY.medium;
  let time = 0;
  let lastDraw = 0;
  let dirty = true;
  // current and target state: bg, c1..c4 (3 floats each), intensity, scale, speed
  let cur = null;
  let tgt = null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function resize() {
    if (!ok) return;
    const w = Math.max(2, Math.round(window.innerWidth * scale));
    const h = Math.max(2, Math.round(window.innerHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      dirty = true;
    }
  }

  function init(el) {
    canvas = el;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
      if (!gl) return false;
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['uRes', 'uTime', 'uBg', 'uC1', 'uC2', 'uC3', 'uC4', 'uInt', 'uScale'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
    } catch (e) {
      console.warn('Background: WebGL unavailable, using static fallback.', e);
      return false;
    }
    ok = true;
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
    return true;
  }

  function vec(theme) {
    const c = theme.c;
    const R = CT.Themes.rgb01;
    return [].concat(R(c.bg), R(c.b1), R(c.b2), R(c.b3), R(c.b4), [theme.p.intensity, theme.p.scale, theme.p.speed]);
  }

  /* Smoothly transition to a new scheme. */
  function setTheme(theme, instant) {
    tgt = vec(theme);
    if (!cur || instant) cur = tgt.slice();
    dirty = true;
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden || !cur) {
      lastDraw = ts; // so the first frame after returning doesn't count the hidden time
      return;
    }
    // ~30fps is plenty for a slow gradient and keeps GPU use low
    if (ts - lastDraw < 30) return;
    const step = Math.min(0.1, (ts - lastDraw) / 1000);
    lastDraw = ts;

    let moving = false;
    const k = 1 - Math.exp(-step * 5);
    for (let i = 0; i < cur.length; i++) {
      const d = tgt[i] - cur[i];
      if (Math.abs(d) > 0.0015) {
        cur[i] += d * k;
        moving = true;
      } else cur[i] = tgt[i];
    }
    if (animated) time += step * cur[17] * 0.6;
    if (!animated && !moving && !dirty) return;
    dirty = false;

    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, time);
    gl.uniform3f(U.uBg, cur[0], cur[1], cur[2]);
    gl.uniform3f(U.uC1, cur[3], cur[4], cur[5]);
    gl.uniform3f(U.uC2, cur[6], cur[7], cur[8]);
    gl.uniform3f(U.uC3, cur[9], cur[10], cur[11]);
    gl.uniform3f(U.uC4, cur[12], cur[13], cur[14]);
    gl.uniform1f(U.uInt, cur[15]);
    gl.uniform1f(U.uScale, cur[16]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  CT.Background = {
    init,
    setTheme,
    get ok() { return ok; },
    setAnimated(v) { animated = !!v; dirty = true; },
    setQuality(q) { scale = QUALITY[q] || QUALITY.medium; resize(); dirty = true; },
    // jump the animation clock so each page load starts from a different spot
    seed(t) { time = t; },
  };
})();
