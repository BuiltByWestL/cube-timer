/* Scramble generators for each supported event. */
(function () {
  const CT = (window.CT = window.CT || {});

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const SUFFIX = ['', "'", '2'];

  /* NxN cubes: random-move scrambles that never repeat a face within a same-axis run. */
  function cube(len, faces, variants) {
    const out = [];
    let lastAxis = -1;
    let used = new Set();
    while (out.length < len) {
      const ax = rnd(faces.length);
      if (ax === lastAxis && used.size >= faces[ax].length) continue;
      const face = pick(faces[ax]);
      if (ax === lastAxis && used.has(face)) continue;
      if (ax !== lastAxis) used = new Set();
      used.add(face);
      lastAxis = ax;
      const v = pick(variants);
      const move = (v === '3w' ? '3' : '') + face + (v ? 'w' : '') + pick(SUFFIX);
      out.push(move);
    }
    return out.join(' ');
  }
  const FACES3 = [['U', 'D'], ['R', 'L'], ['F', 'B']];
  const FACES2 = [['U'], ['R'], ['F']];

  function pyraminx() {
    const L = ['U', 'L', 'R', 'B'];
    const out = [];
    let last = -1;
    while (out.length < 10) {
      const i = rnd(4);
      if (i === last) continue;
      last = i;
      out.push(L[i] + pick(['', "'"]));
    }
    ['u', 'l', 'r', 'b'].forEach((t) => {
      if (Math.random() < 0.5) out.push(t + pick(['', "'"]));
    });
    return out.join(' ');
  }

  function skewb() {
    const L = ['U', 'R', 'L', 'B'];
    const out = [];
    let last = -1;
    while (out.length < 9) {
      const i = rnd(4);
      if (i === last) continue;
      last = i;
      out.push(L[i] + pick(['', "'"]));
    }
    return out.join(' ');
  }

  /* Pochmann-style megaminx scramble: 7 lines of R/D ++/-- then U or U'. */
  function megaminx() {
    const lines = [];
    for (let i = 0; i < 7; i++) {
      const parts = [];
      for (let j = 0; j < 10; j++) parts.push((j % 2 ? 'D' : 'R') + (Math.random() < 0.5 ? '++' : '--'));
      parts.push(Math.random() < 0.5 ? 'U' : "U'");
      lines.push(parts.join(' '));
    }
    return lines.join('\n');
  }

  /* Square-1: simulate the two layers so every slice is legal.
     A layer is 12 slots: 2 = start of a corner, 0 = its second half, 1 = an edge. */
  function square1() {
    const start = () => [2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1];
    let top = start();
    let bottom = start();
    const rot = (a, k) => {
      const r = new Array(12);
      for (let i = 0; i < 12; i++) r[(i + k) % 12] = a[i];
      return r;
    };
    const cutOk = (a) => a[0] !== 0 && a[6] !== 0;
    const sign = (k) => (k > 6 ? k - 12 : k);
    const out = [];
    for (let n = 0; n < 11; n++) {
      let a, b, t, bo;
      do {
        a = rnd(12);
        b = rnd(12);
        t = rot(top, a);
        bo = rot(bottom, b);
      } while ((a === 0 && b === 0) || !cutOk(t) || !cutOk(bo));
      for (let j = 6; j < 12; j++) {
        const tmp = t[j];
        t[j] = bo[j];
        bo[j] = tmp;
      }
      top = t;
      bottom = bo;
      out.push(`(${sign(a)},${sign(b)})`);
    }
    return out.join(' / ');
  }

  function clock() {
    const turn = () => {
      const n = rnd(12) - 5;
      return Math.abs(n) + (n < 0 ? '-' : '+');
    };
    const front = ['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL'].map((k) => k + turn()).join(' ');
    const back = ['U', 'R', 'D', 'L', 'ALL'].map((k) => k + turn()).join(' ');
    const pins = ['UR', 'DR', 'DL', 'UL'].filter(() => Math.random() < 0.5).join(' ');
    return `${front} y2 ${back}${pins ? ' ' + pins : ''}`;
  }

  /* previewN: size of the cube net to draw (0 = no preview). */
  const EVENTS = [
    { id: '222', name: '2×2', previewN: 2, gen: () => cube(11, FACES2, ['']) },
    { id: '333', name: '3×3', previewN: 3, gen: () => cube(20, FACES3, ['']) },
    { id: '444', name: '4×4', previewN: 4, gen: () => cube(40, FACES3, ['', 'w']) },
    { id: '555', name: '5×5', previewN: 5, gen: () => cube(60, FACES3, ['', 'w']) },
    { id: '666', name: '6×6', previewN: 6, gen: () => cube(80, FACES3, ['', 'w', '3w']) },
    { id: '777', name: '7×7', previewN: 7, gen: () => cube(100, FACES3, ['', 'w', '3w']) },
    { id: 'pyra', name: 'Pyraminx', previewN: 0, gen: pyraminx },
    { id: 'mega', name: 'Megaminx', previewN: 0, gen: megaminx },
    { id: 'skewb', name: 'Skewb', previewN: 0, gen: skewb },
    { id: 'sq1', name: 'Square-1', previewN: 0, gen: square1 },
    { id: 'clock', name: 'Clock', previewN: 0, gen: clock },
  ];

  CT.Scramblers = {
    events: EVENTS,
    get: (id) => EVENTS.find((e) => e.id === id) || EVENTS[1],
    generate: (id) => (EVENTS.find((e) => e.id === id) || EVENTS[1]).gen(),
  };
})();
