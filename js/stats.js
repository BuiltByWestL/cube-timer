/* Time formatting, averages and parsing. Times are milliseconds; DNF is Infinity. */
(function () {
  const CT = (window.CT = window.CT || {});

  // penalty p: 0 none, 1 = +2, 2 = DNF
  const eff = (s) => (s.p === 2 ? Infinity : s.t + (s.p === 1 ? 2000 : 0));

  /* Format ms. Singles truncate to the hundredth (as in competition), averages round. */
  function fmt(ms, dec = 2, round = false) {
    if (ms === null || ms === undefined || Number.isNaN(ms)) return '–';
    if (ms === Infinity) return 'DNF';
    const v = dec === 3 ? Math.round(ms) : round ? Math.round(ms / 10) * 10 : Math.floor(ms / 10) * 10;
    const total = v / 1000;
    const m = Math.floor(total / 60);
    const sec = total - m * 60;
    const str = sec.toFixed(dec === 3 ? 3 : 2);
    return m ? `${m}:${sec < 10 ? '0' : ''}${str}` : str;
  }

  /* Display text for a solve record, e.g. "12.34", "12.34+", "DNF". */
  function fmtSolve(s, dec) {
    if (s.p === 2) return 'DNF';
    return fmt(s.t + (s.p === 1 ? 2000 : 0), dec) + (s.p === 1 ? '+' : '');
  }

  /* Average of the n solves ending at index i. n=3 is a plain mean, otherwise trim 5% off both ends. */
  function aoAt(e, i, n) {
    if (i + 1 < n) return null;
    const w = e.slice(i - n + 1, i + 1);
    if (n === 3) {
      let sum = 0;
      for (const x of w) {
        if (x === Infinity) return Infinity;
        sum += x;
      }
      return sum / 3;
    }
    const trim = Math.ceil(n * 0.05);
    w.sort((a, b) => a - b);
    const mid = w.slice(trim, n - trim);
    let sum = 0;
    for (const x of mid) {
      if (x === Infinity) return Infinity;
      sum += x;
    }
    return sum / mid.length;
  }

  const series = (e, n) => e.map((_, i) => aoAt(e, i, n));

  function bestOf(arr) {
    let b = null;
    for (const x of arr) if (x !== null && x !== Infinity && (b === null || x < b)) b = x;
    return b;
  }

  function summarize(solves) {
    const e = solves.map(eff);
    const fin = e.filter((x) => x !== Infinity);
    const out = { count: e.length, e };
    out.last = e.length ? e[e.length - 1] : null;
    out.best = fin.length ? Math.min.apply(null, fin) : null;
    out.worst = fin.length ? Math.max.apply(null, fin) : null;
    out.mean = fin.length ? fin.reduce((a, b) => a + b, 0) / fin.length : null;
    out.series = {};
    [3, 5, 12, 100].forEach((n) => {
      const s = series(e, n);
      out.series[n] = s;
      out[n === 3 ? 'mo3' : 'ao' + n] = { cur: e.length ? s[s.length - 1] : null, best: bestOf(s) };
    });
    return out;
  }

  /* Parse typed input: "12.34", "1:02.5", "1234" -> 12.34s, "DNF". Returns { t, p } or null. */
  function parse(str) {
    str = String(str).trim().toLowerCase();
    if (!str) return null;
    if (str === 'dnf') return { t: 0, p: 2 };
    let penalty = 0;
    if (str.endsWith('+')) {
      penalty = 1;
      str = str.slice(0, -1);
    }
    let ms = null;
    if (/^\d+$/.test(str)) {
      const d = str.padStart(3, '0');
      const cs = +d.slice(-2);
      const rest = d.slice(0, -2);
      const sec = +rest.slice(-2) || 0;
      const min = rest.length > 2 ? +rest.slice(0, -2) : 0;
      ms = (min * 60 + sec) * 1000 + cs * 10;
    } else if (/^(\d+:)?\d+(\.\d+)?$/.test(str)) {
      const parts = str.split(':');
      const sec = parseFloat(parts.pop());
      const min = parts.length ? +parts[0] : 0;
      ms = Math.round((min * 60 + sec) * 1000);
    }
    if (ms === null || ms <= 0) return null;
    return { t: ms, p: penalty };
  }

  CT.Stats = { eff, fmt, fmtSolve, aoAt, series, summarize, parse };
})();
