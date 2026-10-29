/* Draws a flat net of an NxN cube after applying a scramble.
   Stickers are tracked as points in 3D and rotated by each move, so it works for any N. */
(function () {
  const CT = (window.CT = window.CT || {});

  const NORMALS = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
  const COLORS = { U: '#f3f3ef', D: '#f2d23c', R: '#dc4a3f', L: '#ee8a2b', F: '#38b06f', B: '#3a7fdc' };
  // where each face sits in the net, in face-sized units
  const LAYOUT = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  const AXIS = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
  const SIGN = { U: 1, D: -1, R: 1, L: -1, F: 1, B: -1 };

  function rot(v, axis, dir) {
    const [x, y, z] = v;
    if (axis === 0) return dir > 0 ? [x, -z, y] : [x, z, -y];
    if (axis === 1) return dir > 0 ? [z, y, -x] : [-z, y, x];
    return dir > 0 ? [-y, x, z] : [y, -x, z];
  }

  function solved(n) {
    const m = n - 1;
    const coords = [];
    for (let i = 0; i < n; i++) coords.push(-m + 2 * i);
    const st = [];
    for (const f of Object.keys(NORMALS)) {
      const nv = NORMALS[f];
      const k = AXIS[f];
      for (const a of coords) {
        for (const b of coords) {
          const pos = [0, 0, 0];
          const others = [0, 1, 2].filter((i) => i !== k);
          pos[k] = SIGN[f] * m;
          pos[others[0]] = a;
          pos[others[1]] = b;
          st.push({ pos, nrm: nv.slice(), color: f });
        }
      }
    }
    return st;
  }

  function apply(st, n, token) {
    const mt = /^(\d)?([UDLRFB])(w)?(2|')?$/.exec(token);
    if (!mt) return;
    const num = mt[1] ? +mt[1] : 0;
    const face = mt[2];
    const wide = !!mt[3];
    const turns = mt[4] === '2' ? 2 : mt[4] === "'" ? 3 : 1;
    let lo = 1;
    let hi = 1;
    if (wide) hi = num || 2;
    else if (num) lo = hi = num;
    const m = n - 1;
    const axis = AXIS[face];
    const s = SIGN[face];
    const dir = -s; // a clockwise turn of face F is -90° about the axis pointing out of F
    const cMax = m - 2 * (lo - 1);
    const cMin = m - 2 * (hi - 1);
    for (const stk of st) {
      const c = stk.pos[axis] * s;
      if (c > cMax || c < cMin) continue;
      for (let i = 0; i < turns; i++) {
        stk.pos = rot(stk.pos, axis, dir);
        stk.nrm = rot(stk.nrm, axis, dir);
      }
    }
  }

  function faceOf(nrm) {
    for (const f of Object.keys(NORMALS)) {
      const v = NORMALS[f];
      if (v[0] === nrm[0] && v[1] === nrm[1] && v[2] === nrm[2]) return f;
    }
    return 'U';
  }

  // (row, col) of a sticker inside its face, seen from outside the cube
  function cell(face, pos, n) {
    const m = n - 1;
    const [x, y, z] = pos;
    switch (face) {
      case 'U': return [(z + m) / 2, (x + m) / 2];
      case 'D': return [(-z + m) / 2, (x + m) / 2];
      case 'F': return [(-y + m) / 2, (x + m) / 2];
      case 'B': return [(-y + m) / 2, (-x + m) / 2];
      case 'R': return [(-y + m) / 2, (-z + m) / 2];
      default: return [(-y + m) / 2, (z + m) / 2]; // L
    }
  }

  function render(n, scramble) {
    if (!n) return '';
    const st = solved(n);
    String(scramble).split(/\s+/).filter(Boolean).forEach((t) => apply(st, n, t));
    const cs = 10;
    const gap = n > 3 ? 4 : 5;
    const fs = n * cs;
    const W = 4 * fs + 3 * gap;
    const H = 3 * fs + 2 * gap;
    let out = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="Scramble preview">`;
    for (const stk of st) {
      const f = faceOf(stk.nrm);
      const [r, c] = cell(f, stk.pos, n);
      const [lx, ly] = LAYOUT[f];
      const x = lx * (fs + gap) + c * cs;
      const y = ly * (fs + gap) + r * cs;
      out += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cs - 1}" height="${cs - 1}" rx="2" fill="${COLORS[stk.color]}"/>`;
    }
    return out + '</svg>';
  }

  CT.Preview = { render, _solved: solved, _apply: apply, _faceOf: faceOf, _cell: cell };
})();
