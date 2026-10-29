/* Colour schemes: presets, applying a scheme to the page, and a random-scheme generator. */
(function () {
  const CT = (window.CT = window.CT || {});

  // c: colours. p: background look (intensity 0-1, scale = pattern zoom, speed, grain 0-0.4)
  const mk = (id, name, bg, fg, accent, ready, hold, blobs, p) => ({
    id, name, builtin: true,
    c: { bg, fg, accent, ready, hold, b1: blobs[0], b2: blobs[1], b3: blobs[2], b4: blobs[3] },
    p: Object.assign({ intensity: 0.75, scale: 1.2, speed: 0.8, grain: 0.1 }, p),
  });

  const PRESETS = [
    mk('dusk', 'Dusk', '#0c0a13', '#f3effa', '#b9a2ff', '#62e8ab', '#ff6d7d', ['#5a3cf0', '#ff4ea0', '#2aa8ff', '#ffad5a']),
    mk('aurora', 'Aurora', '#050f0e', '#e9fff9', '#6af5cf', '#7dff9e', '#ff7a8a', ['#00d9a0', '#1560ff', '#8b3dff', '#00c4ff'], { intensity: 0.7 }),
    mk('sunset', 'Sunset', '#130a0b', '#fff1e9', '#ffb36b', '#8dee9b', '#ff5d6e', ['#ff5a36', '#ff2f7a', '#ffb12e', '#7a2cff'], { intensity: 0.8 }),
    mk('ocean', 'Ocean', '#040c16', '#e7f4ff', '#5cc8ff', '#4df0b0', '#ff7a85', ['#0a6cff', '#00b8d4', '#5a38ff', '#0ad39a']),
    mk('neon', 'Neon', '#07060b', '#fbf6ff', '#ff5bd8', '#4dffb0', '#ff5470', ['#ff00c8', '#00e5ff', '#7a00ff', '#ffe600'], { intensity: 0.85, grain: 0.12 }),
    mk('graphite', 'Graphite', '#0b0b0c', '#ececec', '#ffffff', '#a6e3b8', '#f09a9a', ['#3b3b40', '#26262a', '#55555c', '#17171a'], { intensity: 0.9, speed: 0.5, grain: 0.12 }),
    mk('paper', 'Paper', '#f3efe7', '#1c1a17', '#e0562b', '#1e9e60', '#d6403a', ['#ffd2ad', '#ffb9c8', '#c9dcff', '#fff0b8'], { intensity: 0.85, grain: 0.07 }),
    mk('lavender', 'Lavender', '#f0ecfa', '#231a3d', '#6b3df2', '#1c9d6a', '#d8406a', ['#c6b2ff', '#ffc0e4', '#b4d6ff', '#e2d2ff'], { intensity: 0.9, grain: 0.06 }),
    mk('matcha', 'Matcha', '#edf1e4', '#1d2a1b', '#3d8c40', '#1f9d57', '#d4503c', ['#bde0a0', '#f1e79a', '#a5dfcf', '#d3efb4'], { intensity: 0.9, grain: 0.07 }),
    mk('bone', 'Bone', '#ebebe9', '#111111', '#111111', '#1f9d57', '#d4403a', ['#ffffff', '#d6d6d2', '#f4f4f1', '#c9c9c5'], { intensity: 0.9, speed: 0.6, grain: 0.08 }),
  ];

  const COLOR_FIELDS = [
    ['bg', 'Background'], ['fg', 'Text'], ['accent', 'Accent'], ['ready', 'Ready'], ['hold', 'Holding'],
    ['b1', 'Glow 1'], ['b2', 'Glow 2'], ['b3', 'Glow 3'], ['b4', 'Glow 4'],
  ];

  const hexToRgb = (h) => {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const rgb01 = (h) => hexToRgb(h).map((v) => v / 255);
  const luma = (h) => {
    const [r, g, b] = hexToRgb(h);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const isHex = (s) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(s).trim());
  const normHex = (s) => {
    let h = String(s).trim().replace('#', '').toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return '#' + h;
  };

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }

  /* A harmonious random scheme: pick a hue, spread the glows around it. */
  function random(light) {
    const h = Math.random() * 360;
    const spread = 30 + Math.random() * 60;
    const hues = [h, h + spread, h + 180 + (Math.random() - 0.5) * 40, h - spread * 1.2];
    const t = light
      ? { bg: hslToHex(h, 35, 94), fg: hslToHex(h, 45, 12), blob: (x) => hslToHex(x, 85, 80), accent: hslToHex(h, 75, 48) }
      : { bg: hslToHex(h, 40, 6), fg: hslToHex(h, 45, 95), blob: (x) => hslToHex(x, 88, 56), accent: hslToHex(h, 90, 76) };
    return {
      c: {
        bg: t.bg, fg: t.fg, accent: t.accent,
        ready: light ? '#1e9e60' : '#62e8ab', hold: light ? '#d6403a' : '#ff6d7d',
        b1: t.blob(hues[0]), b2: t.blob(hues[1]), b3: t.blob(hues[2]), b4: t.blob(hues[3]),
      },
      p: { intensity: light ? 0.88 : 0.75, scale: 0.9 + Math.random() * 0.9, speed: 0.6 + Math.random() * 0.6, grain: light ? 0.07 : 0.1 },
    };
  }

  /* Push a scheme into CSS variables. */
  function apply(theme) {
    const r = document.documentElement.style;
    const c = theme.c;
    r.setProperty('--bg', c.bg);
    r.setProperty('--fg', c.fg);
    r.setProperty('--accent', c.accent);
    r.setProperty('--ready', c.ready);
    r.setProperty('--hold', c.hold);
    ['b1', 'b2', 'b3', 'b4'].forEach((k) => r.setProperty('--' + k, c[k]));
    r.setProperty('--grain', String(theme.p.grain));
    const light = luma(c.bg) > 0.5;
    document.documentElement.dataset.mode = light ? 'light' : 'dark';
    r.setProperty('color-scheme', light ? 'light' : 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c.bg);
  }

  /* Validate/clean a theme object that came from an import. */
  function sanitize(o) {
    if (!o || typeof o !== 'object' || !o.c) return null;
    const out = { id: '', name: String(o.name || 'Imported').slice(0, 28), builtin: false, c: {}, p: {} };
    for (const [k] of COLOR_FIELDS) {
      if (!isHex(o.c[k])) return null;
      out.c[k] = normHex(o.c[k]);
    }
    const p = o.p || {};
    const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    out.p = {
      intensity: num(p.intensity, 0, 1, 0.75), scale: num(p.scale, 0.4, 3, 1.2),
      speed: num(p.speed, 0, 3, 0.8), grain: num(p.grain, 0, 0.4, 0.1),
    };
    return out;
  }

  CT.Themes = { presets: PRESETS, fields: COLOR_FIELDS, apply, random, sanitize, rgb01, luma, isHex, normHex };
})();
