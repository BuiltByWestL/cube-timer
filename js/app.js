/* Cube Timer – app logic: state, timer, UI. */
(function () {
  'use strict';
  const { Scramblers, Preview, Stats, Themes, Background } = window.CT;

  /* ====================================================================
     Small helpers
     ==================================================================== */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }

  const app = $('#app');
  const timerEl = $('#timer');
  const subEl = $('#sub');
  const typeInput = $('#typeInput');
  const panel = $('#panel');
  const pop = $('#popover');
  const dlg = $('#dlg');
  const toastEl = $('#toast');

  /* ====================================================================
     State + persistence
     ==================================================================== */
  const KEY = 'cubetimer.v1';
  const DEFAULTS = {
    v: 1,
    settings: {
      inspection: false, holdMs: 300, decimals: 2, live: 'live', input: 'timer', timerScale: 1,
      preview: true, statline: true, recent: true, focus: true, animate: true, quality: 'medium', motion: 'full',
    },
    themeId: 'dusk', custom: [], event: '333', sessions: [], active: {},
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        const d = clone(DEFAULTS);
        const out = Object.assign(d, o, { settings: Object.assign(d.settings, o.settings || {}) });
        // The first version turned the background off whenever the OS asked for reduced motion.
        // Motion is an in-app setting now, so undo that once.
        if (!(o.settings && 'motion' in o.settings)) out.settings.animate = true;
        return out;
      }
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return clone(DEFAULTS);
  }
  let S = load();

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 200);
  }
  function flush() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);

  /* ---- sessions ---- */
  const sessionsOf = (ev) => S.sessions.filter((s) => s.event === ev);
  function newSession(ev, name) {
    const s = { id: uid(), event: ev, name: name || 'Session ' + (sessionsOf(ev).length + 1), solves: [] };
    S.sessions.push(s);
    return s;
  }
  function session() {
    let s = S.sessions.find((x) => x.id === S.active[S.event] && x.event === S.event);
    if (!s) s = sessionsOf(S.event)[0] || newSession(S.event, 'Session 1');
    S.active[S.event] = s.id;
    return s;
  }

  /* ---- cached stats for the current session ---- */
  let statsCache = null;
  const stats = () => statsCache || (statsCache = Stats.summarize(session().solves));
  const invalidate = () => { statsCache = null; save(); };

  /* ====================================================================
     Motion: things fly in from transparent + blurred and settle into place
     ==================================================================== */
  const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';
  const EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';
  const motion = () => S.settings.motion !== 'reduced';

  function flyIn(el, o = {}) {
    if (!el || !el.animate || !motion()) return null;
    const { delay = 0, dur = 800, x = 0, y = 14, blur = 12, scale = 0.98 } = o;
    return el.animate([
      { opacity: 0, filter: `blur(${blur}px)`, transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})` },
      { opacity: 1, filter: 'blur(0px)', transform: 'translate3d(0, 0, 0) scale(1)' },
    ], { duration: dur, delay, easing: EASE_OUT, fill: 'backwards' });
  }
  /* The reverse. Holds the end state; the caller cancels it once the element is gone or replaced. */
  function flyOut(el, o = {}) {
    const { dur = 200, x = 0, y = -8, blur = 8, scale = 0.98 } = o;
    return el.animate([
      { opacity: 1, filter: 'blur(0px)', transform: 'translate3d(0, 0, 0) scale(1)' },
      { opacity: 0, filter: `blur(${blur}px)`, transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})` },
    ], { duration: dur, easing: EASE_IN, fill: 'forwards' });
  }
  /* One after another; delays level off so long lists don't drag. */
  function stagger(els, o = {}, step = 45, cap = 12) {
    Array.from(els).forEach((el, i) => flyIn(el, Object.assign({}, o, { delay: (o.delay || 0) + Math.min(i, cap) * step })));
  }
  // a quick blur-swap for a value that just changed
  const swapIn = (el, delay = 0) => flyIn(el, { delay, y: 6, blur: 8, scale: 1, dur: 600 });

  /* ====================================================================
     Toast, popover, dialog
     ==================================================================== */
  let toastTimer = 0;
  function toast(msg, action) {
    clearTimeout(toastTimer);
    toastEl.replaceChildren(h('span', { text: msg }));
    toastEl.classList.toggle('plain', !action);
    if (action) toastEl.append(h('button', { text: action.label, onClick: () => { toastEl.classList.remove('show'); action.run(); } }));
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), action ? 6000 : 2400);
  }

  let popOut = null;
  const popOpen = () => !pop.hidden && !popOut;
  function closePopover() {
    if (!popOpen()) return;
    pop._anchor = null;
    if (!motion()) { pop.hidden = true; return; }
    popOut = flyOut(pop, { dur: 170, y: -6, blur: 8, scale: 0.97 });
    popOut.onfinish = () => { pop.hidden = true; popOut.cancel(); popOut = null; };
  }
  function openPopover(anchor, content) {
    if (popOpen() && pop._anchor === anchor) return closePopover();
    if (popOut) { popOut.cancel(); popOut = null; }
    pop.replaceChildren(content);
    pop.hidden = false;
    pop._anchor = anchor;
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth;
    pop.style.left = Math.max(12, Math.min(r.left, innerWidth - pw - 12)) + 'px';
    pop.style.top = r.bottom + 8 + 'px';
    flyIn(pop, { y: -10, blur: 12, scale: 0.95, dur: 550 });
    stagger($$('button', pop), { delay: 50, y: -4, blur: 6, scale: 1, dur: 550 }, 22, 12);
  }
  let dlgOnClose = null; // the open dialog's "dismissed" callback
  function openDialog({ title, sub, body, buttons, wide, onClose }) {
    const foot = h('div', { class: 'foot' });
    (buttons || [{ label: 'Close' }]).forEach((b) => {
      foot.append(h('button', {
        class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '') + (b.left ? ' left' : ''),
        text: b.label,
        onClick: () => { if (!b.run || b.run() !== false) closeDialog(); },
      }));
    });
    if (dlgOut) { dlg.getAnimations({ subtree: true }).forEach((a) => a.cancel()); dlgOut = null; }
    // whatever was showing before is finished now
    if (dlgOnClose) { const f = dlgOnClose; dlgOnClose = null; f(); }
    dlgOnClose = onClose || null;
    const content = h('div', { class: 'dlg' }, title && h('h2', { text: title }), sub && h('div', { class: 'sub', text: sub }), body, foot);
    dlg.replaceChildren(content);
    dlg.style.width = wide ? 'min(560px, calc(100vw - 32px))' : '';
    const wasOpen = dlg.open;
    if (!wasOpen) {
      dlg.showModal();
      flyIn(dlg, { y: 22, blur: 18, scale: 0.95, dur: 700 });
      if (motion()) dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: EASE_OUT, pseudoElement: '::backdrop' });
    }
    stagger(content.children, { delay: wasOpen ? 0 : 70, y: 10, blur: 8, scale: 1, dur: 700 }, 40, 8);
    const first = $('input.text, textarea.text', dlg);
    if (first) first.focus();
  }
  let dlgOut = null;
  function closeDialog() {
    if (!dlg.open || dlgOut) return;
    if (!motion()) { dlg.close(); return; }
    dlgOut = flyOut(dlg, { dur: 220, y: 12, blur: 12, scale: 0.97 });
    dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'linear', fill: 'forwards', pseudoElement: '::backdrop' });
    dlgOut.onfinish = () => dlg.close();
  }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(); }); // Esc: animate out instead of vanishing
  dlg.addEventListener('close', () => {
    dlgOut = null;
    if (dlg.open) return; // a new dialog was opened before this (queued) event arrived
    dlg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    dlg.replaceChildren();
    if (dlgOnClose) { const f = dlgOnClose; dlgOnClose = null; f(); }
    focusTypeInput();
  });

  function confirmDialog(title, text, okLabel, danger) {
    return new Promise((res) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; res(v); } };
      openDialog({
        title, sub: text, onClose: () => finish(false),
        buttons: [{ label: 'Cancel', run: () => finish(false) }, { label: okLabel || 'OK', primary: !danger, danger, run: () => finish(true) }],
      });
    });
  }
  function promptDialog(title, value, okLabel) {
    return new Promise((res) => {
      let done = false;
      const input = h('input', { class: 'text', type: 'text', value, maxlength: 28 });
      const finish = (v) => { if (!done) { done = true; res(v); } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { finish(input.value.trim() || null); closeDialog(); } });
      openDialog({
        title, body: input, onClose: () => finish(null),
        buttons: [{ label: 'Cancel', run: () => finish(null) }, { label: okLabel || 'Save', primary: true, run: () => finish(input.value.trim() || null) }],
      });
      input.select();
    });
  }

  /* ====================================================================
     Scrambles
     ==================================================================== */
  const SC = { list: [], idx: -1 };
  const curScramble = () => SC.list[SC.idx] || '';

  function resetScrambles() {
    SC.list = [Scramblers.generate(S.event)];
    SC.idx = 0;
  }
  function nextScramble() {
    if (SC.idx + 1 < SC.list.length) SC.idx++;
    else { SC.list.push(Scramblers.generate(S.event)); SC.idx = SC.list.length - 1; }
    if (SC.list.length > 60) { SC.list.shift(); SC.idx--; }
    renderScramble(true);
  }
  function prevScramble() {
    if (SC.idx > 0) { SC.idx--; renderScramble(true); }
  }

  /* how: falsy = just paint, 'enter' = first appearance, anything else = old scramble out, new one in.
     Each move is its own span so they can arrive one after another. */
  let scrOut = null;
  function renderScramble(how) {
    const el = $('#scramble');
    const build = () => {
      const s = curScramble();
      el.replaceChildren();
      s.split('\n').forEach((line, li) => {
        if (li) el.append(h('br'));
        const moves = line.split(' ').filter(Boolean);
        moves.forEach((m, i) => {
          el.append(h('span', { class: 'mv', text: m }));
          if (i < moves.length - 1) el.append(' ');
        });
      });
      el.className = s.length > 150 ? 's' : s.length > 70 ? 'm' : '';
      renderPreview(how);
      if (how) {
        const moves = $$('.mv', el);
        const step = Math.min(24, 520 / Math.max(1, moves.length));
        moves.forEach((m, i) => flyIn(m, { delay: (how === 'enter' ? 320 : 0) + i * step, y: 10, blur: 8, scale: 1, dur: 750 }));
      }
    };
    if (scrOut) { scrOut.cancel(); scrOut = null; }
    if (how && how !== 'enter' && motion() && el.childNodes.length) {
      const a = (scrOut = flyOut(el, { dur: 170, y: -6, blur: 6, scale: 1 }));
      a.onfinish = () => { scrOut = null; build(); a.cancel(); };
    } else build();
  }
  function renderPreview(how) {
    const ev = Scramblers.get(S.event);
    const pv = $('#preview');
    pv.innerHTML = ev.previewN ? Preview.render(ev.previewN, curScramble()) : '';
    app.classList.toggle('no-preview', !S.settings.preview || !ev.previewN);
    if (how && pv.firstChild) flyIn(pv.firstChild, { delay: how === 'enter' ? 700 : 40, y: 10, blur: 10, scale: 0.97, dur: 900 });
  }
  $('#scramble').addEventListener('click', () => {
    const t = curScramble();
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Scramble copied'), () => {});
  });
  $('#prevScr').addEventListener('click', prevScramble);
  $('#nextScr').addEventListener('click', nextScramble);

  /* ====================================================================
     Timer
     ==================================================================== */
  const T = {
    phase: 'idle', press: 'none', source: null, holdTimer: 0, startAt: 0, inspAt: 0, raf: 0,
    suppress: false, ignorePointer: false, warnTimer: 0, lastWarn: 0, stoppedAt: 0,
  };
  const setPhase = (p) => { T.phase = p; app.dataset.phase = p; };
  const setPress = (p) => { T.press = p; app.dataset.press = p; };
  const isTyping = () => S.settings.input === 'type';

  function timeHTML(text) {
    const m = /^(.*?)(\.\d+)$/.exec(text);
    return m ? `${m[1]}<span class="dec">${m[2]}</span>` : text;
  }
  function showTime(text, opts = {}) {
    timerEl.innerHTML = timeHTML(text) + (opts.tag ? `<span class="tag">${opts.tag}</span>` : '');
    timerEl.className = (opts.word ? 'word ' : '') + (text.length >= 7 && !opts.word ? 'small ' : '') + (opts.pb ? 'pb' : '');
  }
  function showSub(html) { subEl.innerHTML = html || ''; }

  /* Show the most recent solve (or the empty state) while idle, optionally animated:
     'stop' = a solve just finished, 'swap' = the value changed, 'enter' = first appearance. */
  function renderIdle(flags, how) {
    paintIdle(flags);
    if (!how || !motion()) return;
    const chips = $('#actions').hidden ? [] : $$('#actions .chip');
    if (how === 'stop') {
      timerEl.animate([{ transform: 'scale(1.045)', filter: 'blur(2px)' }, { transform: 'scale(1)', filter: 'blur(0px)' }], { duration: 750, easing: EASE_OUT });
      flyIn(subEl, { delay: 90, y: 8, blur: 8, scale: 1, dur: 750 });
      stagger(chips, { delay: 170, y: 10, blur: 8, scale: 0.94, dur: 750 }, 55);
    } else if (how === 'enter') {
      flyIn(timerEl, { delay: 220, y: 28, blur: 24, scale: 0.96, dur: 1400 });
      flyIn(subEl, { delay: 520, y: 10, blur: 10, scale: 1, dur: 1100 });
      stagger(chips, { delay: 620, y: 10, blur: 8, scale: 0.94, dur: 900 }, 60);
    } else {
      flyIn(timerEl, { y: 12, blur: 14, scale: 0.98, dur: 700 });
      flyIn(subEl, { delay: 60, y: 6, blur: 8, scale: 1, dur: 700 });
    }
  }
  function paintIdle(flags) {
    const solves = session().solves;
    const last = solves[solves.length - 1];
    const dec = S.settings.decimals;
    const parts = [];
    if (!last) {
      showTime(Stats.fmt(0, dec));
      const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      showSub(isTyping() ? 'Type a time and press enter'
        : S.settings.inspection ? (touch ? 'Tap for inspection' : 'Press space for inspection')
        : (touch ? 'Press and hold to start' : 'Hold space to start'));
      $('#actions').hidden = true;
      return;
    }
    if (last.p === 2) {
      showTime('DNF');
      parts.push('was ' + Stats.fmt(last.t, dec));
    } else {
      showTime(Stats.fmt(Stats.eff(last), dec), { tag: last.p === 1 ? '+2' : '', pb: !!(flags && flags.length) });
      if (last.p === 1) parts.push('inspection penalty');
    }
    (flags || []).forEach((f) => parts.unshift(`<span class="hl">${f}</span>`));
    showSub(parts.join(' &nbsp;·&nbsp; '));
    $('#actions').hidden = false;
    $('#actPlus2').classList.toggle('on', last.p === 1);
    $('#actDnf').classList.toggle('on', last.p === 2);
  }

  function tickRunning() {
    if (T.phase !== 'running') return;
    const el = performance.now() - T.startAt;
    const mode = S.settings.live;
    if (mode === 'live') showTime(Stats.fmt(el, S.settings.decimals));
    else if (mode === 'seconds') showTime(String(Math.floor(el / 1000)));
    T.raf = requestAnimationFrame(tickRunning);
  }

  function tickInspection() {
    if (T.phase !== 'inspecting') return;
    const el = performance.now() - T.inspAt;
    const txt = el < 15000 ? String(15 - Math.floor(el / 1000)) : el < 17000 ? '+2' : 'DNF';
    if (txt !== T.inspShown) {
      T.inspShown = txt;
      showTime(txt, { word: el >= 15000 });
      if (motion() && T.press === 'none') {
        timerEl.animate([{ opacity: 0.2, filter: 'blur(8px)', transform: 'scale(1.06)' }, { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' }], { duration: 550, easing: EASE_OUT });
      }
    }
    for (const w of [8000, 12000]) {
      if (el >= w && T.lastWarn < w) {
        T.lastWarn = w;
        app.dataset.warn = '1';
        clearTimeout(T.warnTimer);
        T.warnTimer = setTimeout(() => delete app.dataset.warn, 900);
      }
    }
    T.raf = requestAnimationFrame(tickInspection);
  }

  function startInspection() {
    setPhase('inspecting');
    T.inspAt = performance.now();
    T.lastWarn = 0;
    T.inspShown = '';
    $('#actions').hidden = true;
    showSub('Inspection');
    swapIn(subEl);
    tickInspection();
  }
  function cancelInspection() {
    cancelAnimationFrame(T.raf);
    delete app.dataset.warn;
    setPhase('idle');
    renderIdle(null, 'swap');
  }

  function startSolve(now) {
    let penalty = 0;
    if (T.phase === 'inspecting') {
      const el = now - T.inspAt;
      penalty = el > 17000 ? 2 : el > 15000 ? 1 : 0;
      cancelAnimationFrame(T.raf);
      delete app.dataset.warn;
    }
    T.penalty = penalty;
    T.startAt = now;
    setPhase('running');
    $('#actions').hidden = true;
    showSub('');
    if (S.settings.live === 'hidden') showTime('Solving', { word: true });
    else showTime(S.settings.live === 'seconds' ? '0' : Stats.fmt(0, S.settings.decimals));
    tickRunning();
  }

  function stopSolve(now) {
    cancelAnimationFrame(T.raf);
    const ms = Math.max(1, Math.round(now - T.startAt));
    T.stoppedAt = performance.now();
    setPhase('idle');
    addSolve({ t: ms, p: T.penalty || 0 });
  }

  function discardSolve() {
    cancelAnimationFrame(T.raf);
    setPhase('idle');
    renderIdle(null, 'swap');
    toast('Solve discarded');
  }

  /* Add a finished solve to the session and work out which records it broke. */
  function addSolve({ t, p }) {
    const s = session();
    const before = stats();
    const solve = { id: uid(), t, p, s: curScramble(), d: Date.now() };
    s.solves.push(solve);
    invalidate();
    const after = stats();
    const flags = [];
    if (after.count > 1 && p !== 2) {
      const eff = Stats.eff(solve);
      if (before.best !== null && eff < before.best) flags.push('New best');
      if (after.ao5.cur !== null && isFinite(after.ao5.cur) && before.ao5.best !== null && after.ao5.cur < before.ao5.best) flags.push('Best ao5');
      if (after.ao12.cur !== null && isFinite(after.ao12.cur) && before.ao12.best !== null && after.ao12.cur < before.ao12.best) flags.push('Best ao12');
    }
    nextScramble();
    renderIdle(flags, 'stop');
    renderStatline();
    renderRecent();
    refreshPanel();
  }

  /* ---- press handling (shared by keyboard and pointer) ---- */
  function pressDown(source) {
    if (isTyping() || T.press !== 'none') return;
    if (T.suppress) return;
    T.source = source;
    if (T.phase === 'idle' && S.settings.inspection) {
      setPress('armed');
      return;
    }
    setPress('holding');
    const hold = S.settings.holdMs;
    if (hold <= 0) setPress('ready');
    else T.holdTimer = setTimeout(() => { if (T.press === 'holding') setPress('ready'); }, hold);
  }
  function pressUp(source, now) {
    if (T.suppress) { T.suppress = false; return; }
    if (T.press === 'none' || T.source !== source) return;
    clearTimeout(T.holdTimer);
    const p = T.press;
    setPress('none');
    if (p === 'armed') startInspection();
    else if (p === 'ready') startSolve(now);
  }
  function cancelPress() {
    clearTimeout(T.holdTimer);
    setPress('none');
  }

  function evTime(e) {
    const n = performance.now();
    return e && e.timeStamp && Math.abs(n - e.timeStamp) < 1500 ? e.timeStamp : n;
  }

  /* ---- editing solves ---- */
  const lastSolve = () => { const a = session().solves; return a[a.length - 1]; };

  function setPenalty(solve, p) {
    solve.p = solve.p === p ? 0 : p;
    invalidate();
    if (solve === lastSolve()) renderIdle(null, 'swap');
    renderStatline();
    renderRecent();
    refreshPanel();
  }
  function deleteSolve(solve) {
    const s = session();
    const i = s.solves.indexOf(solve);
    if (i < 0) return;
    s.solves.splice(i, 1);
    invalidate();
    renderIdle(null, 'swap');
    renderStatline();
    renderRecent();
    refreshPanel();
    toast('Solve deleted', {
      label: 'Undo',
      run: () => { s.solves.splice(i, 0, solve); invalidate(); renderIdle(null, 'swap'); renderStatline(); renderRecent(); refreshPanel(); },
    });
  }
  // The tap that stops the timer is followed by a click at the same spot, right where these chips appear.
  const settled = () => performance.now() - T.stoppedAt > 500;
  $('#actPlus2').addEventListener('click', () => { const l = lastSolve(); if (l && settled()) setPenalty(l, 1); });
  $('#actDnf').addEventListener('click', () => { const l = lastSolve(); if (l && settled()) setPenalty(l, 2); });
  $('#actDel').addEventListener('click', () => { const l = lastSolve(); if (l && settled()) deleteSolve(l); });

  /* ====================================================================
     Typing mode
     ==================================================================== */
  function focusTypeInput() {
    if (isTyping() && !dlg.open && !app.classList.contains('panel-open')) typeInput.focus({ preventScroll: true });
  }
  typeInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const r = Stats.parse(typeInput.value);
    if (!r) { toast('Enter a time like 12.34, 1:02.5 or 1234'); return; }
    typeInput.value = '';
    addSolve(r);
  });
  function applyInputMode() {
    const typing = isTyping();
    typeInput.hidden = !typing;
    timerEl.hidden = typing;
    if (typing) { cancelPress(); focusTypeInput(); }
    renderIdle();
    if (typing) {
      const l = lastSolve();
      showSub(l ? 'Last  ' + Stats.fmtSolve(l, S.settings.decimals) : 'Type a time and press enter');
    }
  }

  /* ====================================================================
     Stats line
     ==================================================================== */
  let statPrev = {};
  function renderStatline(how) {
    const st = stats();
    const dec = S.settings.decimals;
    const item = (label, text) => h('div', { class: 'stat', 'data-k': label }, h('b', { text }), h('span', { text: label }));
    const el = $('#statline');
    el.replaceChildren(...[
      item('ao5', Stats.fmt(st.ao5.cur, dec, true)), item('ao12', Stats.fmt(st.ao12.cur, dec, true)),
      st.count >= 100 ? item('ao100', Stats.fmt(st.ao100.cur, dec, true)) : null,
      item('best', Stats.fmt(st.best, dec)), item('mean', Stats.fmt(st.mean, dec, true)),
      item('solves', String(st.count)),
    ].filter(Boolean));
    const next = {};
    $$('.stat', el).forEach((node, i) => {
      const k = node.dataset.k;
      const v = (next[k] = node.firstChild.textContent);
      if (how === 'enter') flyIn(node, { delay: 680 + i * 60, y: 12, blur: 10, scale: 1, dur: 1100 });
      else if (how) flyIn(node, { delay: i * 40, y: 8, blur: 8, scale: 1, dur: 700 });
      else if (!(k in statPrev)) flyIn(node, { delay: 150, y: 8, blur: 8, scale: 0.96, dur: 700 });
      else if (statPrev[k] !== v) swapIn(node.firstChild, 140 + i * 45);
    });
    statPrev = next;
  }

  /* ====================================================================
     Recent times: a quiet column of times on the left. New ones fly in at the top,
     the rest glide down; deleted ones blur away and the gap closes.
     ==================================================================== */
  const RECENT_N = 24;
  const recentEl = $('#recent');
  function paintRecent(li, sv, i, bestId, dec) {
    const text = Stats.fmtSolve(sv, dec);
    const changed = li._text !== undefined && li._text !== text;
    if (li._text !== text) { li.innerHTML = timeHTML(text); li._text = text; }
    li.classList.toggle('pb', sv.id === bestId);
    li.style.setProperty('--a', Math.max(22, 100 - i * 9) + '%');
    return changed;
  }
  function recentItem(sv) {
    return h('li', { 'data-id': sv.id, title: 'Solve details', onClick: () => openSolveDialog(sv) });
  }
  function leaveRecent(li) {
    li._leaving = true;
    li.style.pointerEvents = 'none';
    if (!motion()) { li.remove(); return; }
    const a = li.animate([
      { opacity: 1, filter: 'blur(0px)', transform: 'translateX(0)', height: li.offsetHeight + 'px' },
      { opacity: 0, filter: 'blur(10px)', transform: 'translateX(-18px)', height: '0px' },
    ], { duration: 560, easing: EASE_OUT, fill: 'forwards' });
    a.onfinish = () => li.remove();
  }
  function renderRecent(how) {
    const solves = session().solves;
    const want = solves.slice(-RECENT_N).reverse();
    const dec = S.settings.decimals;
    const st = stats();
    const best = st.count > 1 && st.best !== null ? solves.find((x) => Stats.eff(x) === st.best) : null;
    const bestId = best && best.id;

    if (how || !motion()) {
      recentEl.replaceChildren(...want.map((sv, i) => { const li = recentItem(sv); paintRecent(li, sv, i, bestId, dec); return li; }));
      if (how) stagger(recentEl.children, { delay: how === 'enter' ? 640 : 0, x: -16, y: 0, blur: 10, scale: 1, dur: 950 }, 45, 10);
      return;
    }
    const live = Array.from(recentEl.children).filter((li) => !li._leaving);
    const byId = new Map(live.map((li) => [li.dataset.id, li]));
    const tops = new Map(live.map((li) => [li, li.offsetTop]));
    const keep = new Set(want.map((x) => x.id));
    live.forEach((li) => { if (!keep.has(li.dataset.id)) leaveRecent(li); });
    const added = [];
    let prev = null;
    want.forEach((sv, i) => {
      let li = byId.get(sv.id);
      if (!li) { li = recentItem(sv); added.push(li); }
      if (paintRecent(li, sv, i, bestId, dec)) flyIn(li, { x: -6, y: 0, blur: 8, scale: 1, dur: 600 });
      const ref = prev ? prev.nextSibling : recentEl.firstChild;
      if (ref !== li) recentEl.insertBefore(li, ref);
      prev = li;
    });
    // FLIP: everything that moved glides from where it was
    tops.forEach((top, li) => {
      if (li._leaving) return;
      const dy = top - li.offsetTop;
      if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 750, easing: EASE_OUT });
    });
    added.forEach((li) => flyIn(li, { delay: 140, x: -20, y: 0, blur: 12, scale: 0.95, dur: 950 }));
  }

  /* ====================================================================
     Header: event + session pickers
     ==================================================================== */
  function renderHeader() {
    $('#eventLabel').textContent = Scramblers.get(S.event).name;
    $('#sessionLabel').textContent = session().name;
  }

  function setEvent(id) {
    if (S.event === id) return;
    S.event = id;
    statsCache = null;
    resetScrambles();
    renderAll('swap');
    save();
  }
  function setSession(id) {
    S.active[S.event] = id;
    statsCache = null;
    renderAll('swap');
    save();
  }

  $('#eventBtn').addEventListener('click', (e) => {
    const grid = h('div', { class: 'menu evgrid' });
    Scramblers.events.forEach((ev) => {
      grid.append(h('button', { class: ev.id === S.event ? 'on' : '', text: ev.name, onClick: () => { closePopover(); setEvent(ev.id); } }));
    });
    openPopover(e.currentTarget, grid);
  });

  $('#sessionBtn').addEventListener('click', (e) => {
    const menu = h('div', { class: 'menu' });
    sessionsOf(S.event).forEach((s) => {
      menu.append(h('button', { class: s.id === session().id ? 'on' : '', onClick: () => { closePopover(); setSession(s.id); } },
        h('span', { text: s.name }), h('small', { text: s.solves.length + ' solves' })));
    });
    menu.append(h('hr'));
    menu.append(h('button', { text: 'New session', onClick: () => { closePopover(); const s = newSession(S.event); setSession(s.id); } }));
    menu.append(h('button', { text: 'Rename…', onClick: async () => {
      closePopover();
      const n = await promptDialog('Rename session', session().name);
      if (n) { session().name = n; renderHeader(); save(); }
    } }));
    menu.append(h('button', { text: 'Delete session…', onClick: async () => {
      closePopover();
      const cur = session();
      const ok = await confirmDialog('Delete “' + cur.name + '”?', `This removes its ${cur.solves.length} solves permanently.`, 'Delete', true);
      if (!ok) return;
      S.sessions = S.sessions.filter((x) => x !== cur);
      delete S.active[S.event];
      statsCache = null;
      renderAll();
      save();
    } }));
    openPopover(e.currentTarget, menu);
  });

  /* ====================================================================
     Panel
     ==================================================================== */
  let tab = 'solves';
  function openPanel(t) {
    if (app.classList.contains('panel-open') && tab === t) return closePanel();
    showPanel(t);
  }
  function showPanel(t) {
    const switching = app.classList.contains('panel-open');
    tab = t;
    app.classList.add('panel-open');
    panel.setAttribute('aria-hidden', 'false');
    $$('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('[data-pane]').forEach((p) => p.classList.toggle('active', p.dataset.pane === t));
    $('#btnSolves').classList.toggle('on', t === 'solves');
    $('#btnLook').classList.toggle('on', t === 'look');
    $('#btnSettings').classList.toggle('on', t === 'settings');
    renderPane(t, true);
    moveInk(!switching);
    if (document.activeElement === typeInput) typeInput.blur();
  }
  /* The tab underline glides to the selected tab (or jumps there when the panel first opens). */
  function moveInk(instant) {
    const ink = $('.tabs .ink');
    const b = $(`.tabs [data-tab="${tab}"]`);
    if (!ink || !b) return;
    ink.classList.toggle('instant', !!instant);
    ink.style.width = b.offsetWidth - 24 + 'px';
    ink.style.transform = `translateX(${b.offsetLeft + 12}px)`;
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => ink.classList.remove('instant')));
  }
  function closePanel() {
    app.classList.remove('panel-open');
    panel.setAttribute('aria-hidden', 'true');
    $$('.topbar .icon').forEach((b) => b.classList.remove('on'));
    if (document.activeElement && panel.contains(document.activeElement)) document.activeElement.blur();
    focusTypeInput();
  }
  $('#btnSolves').addEventListener('click', () => openPanel('solves'));
  $('#btnLook').addEventListener('click', () => openPanel('look'));
  $('#btnSettings').addEventListener('click', () => openPanel('settings'));
  $('#panelClose').addEventListener('click', closePanel);
  $$('.tabs [role=tab]').forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.tab)));

  function renderPane(t, animate) {
    if (t === 'solves') renderSolvesPane(animate);
    else if (t === 'look') renderLookPane(animate);
    else renderSettingsPane(animate);
    if (animate) stagger($(`[data-pane=${t}]`).children, { delay: 90, y: 16, blur: 10, scale: 1, dur: 850 }, 35, 14);
  }
  function refreshPanel() {
    if (app.classList.contains('panel-open') && tab === 'solves') renderSolvesPane();
  }

  /* ---- Solves pane ---- */
  let listLimit = 100;
  let paneSeen = { id: null, count: -1 };
  function renderSolvesPane(animate) {
    const root = $('[data-pane=solves]');
    const scrollTop = $('.scroll').scrollTop;
    const st = stats();
    const s = session();
    const dec = S.settings.decimals;
    root.replaceChildren();

    const row = (label, v, best) => h('tr', null,
      h('td', { text: label }),
      h('td', { text: Stats.fmt(v, dec, label !== 'Single') }),
      h('td', { class: 'pb', text: Stats.fmt(best, dec, label !== 'Single') }));
    root.append(
      h('div', { class: 'h', text: s.name + ' · ' + Scramblers.get(S.event).name }),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th'), h('th', { text: 'Current' }), h('th', { text: 'Best' }))),
        h('tbody', null,
          row('Single', st.last, st.best), row('Mean of 3', st.mo3.cur, st.mo3.best),
          row('Average of 5', st.ao5.cur, st.ao5.best), row('Average of 12', st.ao12.cur, st.ao12.best),
          row('Average of 100', st.ao100.cur, st.ao100.best))),
      h('div', { class: 'summary' },
        h('span', null, 'Solves ', h('b', { text: String(st.count) })),
        h('span', null, 'Mean ', h('b', { text: Stats.fmt(st.mean, dec, true) })),
        h('span', null, 'Worst ', h('b', { text: Stats.fmt(st.worst, dec) }))));

    if (st.count >= 2) {
      root.append(h('div', { class: 'h', text: 'Progress' }), buildGraph(st), h('div', { class: 'legend' },
        h('span', null, h('i', { style: 'background:var(--faint)' }), 'Single'),
        h('span', null, h('i', { style: 'background:var(--accent)' }), 'ao5'),
        h('span', null, h('i', { style: 'background:color-mix(in srgb,var(--fg) 55%,transparent)' }), 'ao12')));
    }

    root.append(h('div', { class: 'h', text: 'History' }));
    if (!st.count) root.append(h('div', { class: 'empty', text: 'No solves yet' }));
    else {
      const list = h('ul', { class: 'solves' }, h('li', { class: 'head' }, h('span', { text: '#' }), h('span', { text: 'Time' }), h('span', { class: 'a', text: 'ao5' }), h('span', { class: 'a', text: 'ao12' })));
      const from = Math.max(0, s.solves.length - listLimit);
      for (let i = s.solves.length - 1; i >= from; i--) {
        const sv = s.solves[i];
        list.append(h('li', { onClick: () => openSolveDialog(sv) },
          h('span', { class: 'n', text: String(i + 1) }),
          h('span', { class: 't' + (sv.p === 2 ? ' dnf' : ''), text: Stats.fmtSolve(sv, dec) }),
          h('span', { class: 'a', text: Stats.fmt(st.series[5][i], dec, true) }),
          h('span', { class: 'a', text: Stats.fmt(st.series[12][i], dec, true) })));
      }
      root.append(list);
      if (from > 0) root.append(h('div', { class: 'btns', style: 'margin-top:12px' }, h('button', { class: 'btn', text: 'Show more', onClick: () => { listLimit += 200; renderSolvesPane(); } })));
    }
    $('.scroll').scrollTop = scrollTop;
    if (animate) {
      stagger($$('.solves li', root).slice(0, 16), { delay: 300, y: 8, blur: 6, scale: 1, dur: 750 }, 28);
      drawGraph(root);
    } else if (paneSeen.id === s.id && st.count === paneSeen.count + 1) {
      flyIn($('.solves li:not(.head)', root), { delay: 120, x: -12, y: 0, blur: 8, scale: 1, dur: 750 });
    }
    paneSeen = { id: s.id, count: st.count };
  }

  /* The graph lines draw themselves in; the dots follow. */
  function drawGraph(root) {
    if (!motion()) return;
    $$('.graph path', root).forEach((p, i) => {
      const len = p.getTotalLength();
      if (!len) return;
      p.style.strokeDasharray = len;
      const a = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1500, delay: 300 + i * 160, easing: EASE_OUT, fill: 'backwards' });
      a.onfinish = () => { p.style.strokeDasharray = ''; };
    });
    $$('.graph .dot', root).forEach((d, i) => d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 350 + i * 9, easing: EASE_OUT, fill: 'backwards' }));
  }

  /* Time-series graph of the last 100 solves with ao5/ao12 overlays. */
  function buildGraph(st) {
    const NS = 'http://www.w3.org/2000/svg';
    const N = Math.min(100, st.count);
    const off = st.count - N;
    const W = 360, H = 150, L = 30, B = 6, Tp = 8;
    const vals = [];
    for (let i = off; i < st.count; i++) {
      [st.e[i], st.series[5][i], st.series[12][i]].forEach((v) => { if (v !== null && isFinite(v)) vals.push(v); });
    }
    const wrap = h('div', { class: 'graph' });
    if (!vals.length) return wrap;
    let lo = Math.min.apply(null, vals);
    let hi = Math.max.apply(null, vals);
    if (hi - lo < 500) { hi += 250; lo = Math.max(0, lo - 250); }
    const pad = (hi - lo) * 0.08;
    lo = Math.max(0, lo - pad); hi += pad;
    const x = (i) => L + (N === 1 ? 0 : (i / (N - 1)) * (W - L - 4));
    const y = (v) => Tp + (1 - (v - lo) / (hi - lo)) * (H - Tp - B);

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const add = (tag, attrs, parent = svg) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      parent.append(el);
      return el;
    };
    for (let g = 0; g < 4; g++) {
      const v = lo + ((hi - lo) * g) / 3;
      add('line', { class: 'grid', x1: L, x2: W, y1: y(v), y2: y(v) });
      const t = add('text', { x: 0, y: y(v) + 3 });
      t.textContent = (v / 1000).toFixed(1);
    }
    const path = (arr) => {
      let d = '';
      let pen = false;
      for (let i = 0; i < N; i++) {
        const v = arr[off + i];
        if (v === null || v === undefined || !isFinite(v)) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
        pen = true;
      }
      return d;
    };
    add('path', { class: 'l12', d: path(st.series[12]) });
    add('path', { class: 'l5', d: path(st.series[5]) });
    for (let i = 0; i < N; i++) {
      const v = st.e[off + i];
      if (isFinite(v)) add('circle', { class: 'dot', cx: x(i), cy: y(v), r: N > 60 ? 1.6 : 2.2 });
    }
    const cursor = add('line', { class: 'cursor', y1: Tp, y2: H - B, x1: 0, x2: 0, style: 'display:none' });
    const tip = h('div', { class: 'tip', style: 'display:none' });
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(N - 1, Math.round(((px - L) / (W - L - 4)) * (N - 1))));
      const gi = off + i;
      const dec = S.settings.decimals;
      cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.style.display = '';
      const a5 = st.series[5][gi];
      tip.textContent = `#${gi + 1}  ${Stats.fmt(st.e[gi], dec)}` + (a5 !== null ? `  ·  ao5 ${Stats.fmt(a5, dec, true)}` : '');
      tip.style.display = '';
      tip.style.left = Math.max(60, Math.min(r.width - 60, (x(i) / W) * r.width)) + 'px';
    });
    svg.addEventListener('pointerleave', () => { cursor.style.display = 'none'; tip.style.display = 'none'; });
    wrap.append(svg, tip);
    return wrap;
  }

  /* ---- Solve detail dialog ---- */
  function openSolveDialog(sv) {
    const s = session();
    const idx = s.solves.indexOf(sv);
    const st = stats();
    const dec = S.settings.decimals;
    const big = h('div', { class: 'big', text: Stats.fmtSolve(sv, dec) });
    const seg = makeSeg([[0, 'OK'], [1, '+2'], [2, 'DNF']], sv.p, (p) => {
      sv.p = p;
      invalidate();
      big.textContent = Stats.fmtSolve(sv, dec);
      swapIn(big);
      renderIdle(null, sv === lastSolve() ? 'swap' : null);
      renderStatline();
      renderRecent();
      refreshPanel();
    });
    const ev = Scramblers.get(S.event);
    const when = new Date(sv.d);
    openDialog({
      title: `Solve ${idx + 1}`,
      sub: when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      body: h('div', null,
        big,
        h('div', { class: 'meta' },
          h('span', { text: 'ao5 ' + Stats.fmt(st.series[5][idx], dec, true) }),
          h('span', { text: 'ao12 ' + Stats.fmt(st.series[12][idx], dec, true) })),
        h('div', { class: 'scr', text: sv.s }),
        ev.previewN ? h('div', { class: 'pv', html: Preview.render(ev.previewN, sv.s) }) : null,
        seg),
      buttons: [
        { label: 'Delete', danger: true, left: true, run: () => { setTimeout(() => deleteSolve(sv), 0); } },
        { label: 'Copy scramble', run: () => { if (navigator.clipboard) navigator.clipboard.writeText(sv.s).then(() => toast('Scramble copied'), () => {}); } },
        { label: 'Done', primary: true },
      ],
    });
  }

  /* ---- Settings pane ---- */
  const setting = (k, v) => { S.settings[k] = v; save(); };
  function swRow(label, sub, key, onChange) {
    const input = h('input', { type: 'checkbox', checked: !!S.settings[key] });
    input.addEventListener('change', () => { setting(key, input.checked); onChange && onChange(); input.blur(); });
    return h('div', { class: 'row' }, h('div', { class: 'lbl' }, label, sub && h('small', { text: sub })), h('label', { class: 'switch' }, input, h('i')));
  }
  /* Segmented control whose thumb glides to the picked option. */
  function makeSeg(options, current, onPick) {
    const thumb = h('span', { class: 'thumb instant' });
    const seg = h('div', { class: 'seg' }, thumb);
    const place = () => {
      const on = $('button.on', seg);
      if (!on || !on.offsetWidth) return;
      thumb.style.width = on.offsetWidth + 'px';
      thumb.style.transform = `translateX(${on.offsetLeft}px)`;
    };
    options.forEach(([val, text]) => {
      const b = h('button', { class: val === current ? 'on' : '', text, onClick: () => {
        $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
        place();
        onPick(val);
      } });
      seg.append(b);
    });
    // it's often built before it's attached or visible, so place the thumb once it has a size
    new ResizeObserver(() => {
      place();
      requestAnimationFrame(() => thumb.classList.remove('instant'));
    }).observe(seg);
    return seg;
  }
  function segRow(label, key, options, onChange, sub) {
    const seg = makeSeg(options, S.settings[key], (val) => { setting(key, val); onChange && onChange(); });
    return h('div', { class: 'row' }, h('div', { class: 'lbl' }, label, sub && h('small', { text: sub })), seg);
  }
  function rangeRow(label, get, set, min, max, step, format) {
    const input = h('input', { type: 'range', min, max, step, value: get() });
    const out = h('output', { text: format(get()) });
    input.addEventListener('input', () => { const v = parseFloat(input.value); out.textContent = format(v); set(v); });
    input.addEventListener('change', () => input.blur());
    return h('div', { class: 'row' }, h('div', { class: 'lbl', text: label }), h('div', { class: 'range' }, input, out));
  }

  function renderSettingsPane() {
    const root = $('[data-pane=settings]');
    const st = S.settings;
    root.replaceChildren(
      h('div', { class: 'h', text: 'Timer' }),
      segRow('Input', 'input', [['timer', 'Timer'], ['type', 'Typing']], applyInputMode, 'Type times in by hand'),
      rangeRow('Hold to start', () => st.holdMs, (v) => setting('holdMs', v), 0, 800, 50, (v) => (v ? v + ' ms' : 'Instant')),
      swRow('Inspection', '15 seconds, +2 and DNF applied automatically', 'inspection', () => { cancelPress(); renderIdle(); }),
      segRow('While solving', 'live', [['live', 'Live'], ['seconds', 'Seconds'], ['hidden', 'Hidden']]),
      segRow('Decimals', 'decimals', [[2, '0.01'], [3, '0.001']], () => { renderIdle(null, 'swap'); renderStatline(); renderRecent(); refreshPanel(); }),
      rangeRow('Timer size', () => st.timerScale, (v) => { setting('timerScale', v); applySettings(); }, 0.6, 1.4, 0.05, (v) => Math.round(v * 100) + '%'),

      h('div', { class: 'h', text: 'Interface' }),
      swRow('Scramble preview', 'Cube diagram for 2×2 – 7×7', 'preview', applySettings),
      swRow('Recent times', 'Your latest times down the left side', 'recent', applySettings),
      swRow('Stats bar', null, 'statline', applySettings),
      swRow('Focus mode', 'Blur the interface away while solving', 'focus', applySettings),
      segRow('Motion', 'motion', [['full', 'Full'], ['reduced', 'Reduced']], applySettings, 'Fly-in animations and transitions'),

      h('div', { class: 'h', text: 'Background' }),
      swRow('Animate', 'Flowing gradient behind everything', 'animate', applySettings),
      segRow('Quality', 'quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], applySettings, 'Lower is lighter on the GPU'),
      h('div', { class: 'row' }, h('div', { class: 'lbl' }, 'Colors & grain', h('small', { text: 'Edit schemes in the Appearance tab' })),
        h('button', { class: 'btn', text: 'Open', onClick: () => openPanel('look') })),

      h('div', { class: 'h', text: 'Data' }),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', text: 'Export backup', onClick: exportBackup }),
        h('button', { class: 'btn', text: 'Import backup', onClick: importBackup }),
        h('button', { class: 'btn', text: 'Export session CSV', onClick: exportCSV }),
        h('button', { class: 'btn danger', text: 'Reset everything', onClick: async () => {
          if (await confirmDialog('Reset everything?', 'All sessions, solves and custom color schemes will be deleted.', 'Reset', true)) {
            try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
            S = clone(DEFAULTS);
            location.reload();
          }
        } })),

      h('div', { class: 'h', text: 'Shortcuts' }),
      h('div', { class: 'kbd' },
        ...[['Space', 'Hold, release to start · any key stops'], ['Esc', 'Cancel / discard solve'], ['← →', 'Previous / next scramble'],
          ['2', '+2 on last solve'], ['D', 'DNF on last solve'], ['⌫', 'Delete last solve'],
          ['H', 'Solves'], ['T', 'Appearance'], ['S', 'Settings']].flatMap(([k, d]) => [h('kbd', { text: k }), h('span', { text: d })])));
  }

  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportBackup() {
    flush();
    download(`cube-timer-backup-${stamp()}.json`, JSON.stringify(S, null, 1), 'application/json');
  }
  function exportCSV() {
    const s = session();
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = ['No,Time,Penalty,Scramble,Date'];
    s.solves.forEach((sv, i) => rows.push([i + 1, Stats.fmt(sv.p === 2 ? sv.t : Stats.eff(sv), 2), ['', '+2', 'DNF'][sv.p], q(sv.s.replace(/\n/g, ' ')), new Date(sv.d).toISOString()].join(',')));
    download(`${Scramblers.get(S.event).name}-${s.name}-${stamp()}.csv`.replace(/\s+/g, '_'), rows.join('\n'), 'text/csv');
  }
  function importBackup() {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      try {
        const o = JSON.parse(await input.files[0].text());
        if (!o || !Array.isArray(o.sessions)) throw new Error('not a backup');
        let n = 0;
        o.sessions.forEach((s) => {
          if (!s || !Scramblers.events.some((e) => e.id === s.event) || !Array.isArray(s.solves)) return;
          S.sessions.push({ id: uid(), event: s.event, name: String(s.name || 'Imported').slice(0, 28), solves: s.solves.filter((v) => v && typeof v.t === 'number').map((v) => ({ id: uid(), t: v.t, p: v.p | 0, s: String(v.s || ''), d: v.d || Date.now() })) });
          n++;
        });
        (o.custom || []).forEach((t) => { const c = Themes.sanitize(t); if (c) { c.id = uid(); S.custom.push(c); } });
        statsCache = null;
        save();
        renderAll();
        toast(`Imported ${n} session${n === 1 ? '' : 's'}`);
      } catch (e) {
        toast('That file isn’t a Cube Timer backup');
      }
    });
    input.click();
  }

  /* ====================================================================
     Themes
     ==================================================================== */
  const allThemes = () => Themes.presets.concat(S.custom);
  const curTheme = () => allThemes().find((t) => t.id === S.themeId) || Themes.presets[0];

  function swatch(t) {
    const c = t.c;
    return `radial-gradient(60% 70% at 15% 15%, ${c.b1}, transparent 70%), radial-gradient(60% 70% at 90% 25%, ${c.b2}, transparent 70%), radial-gradient(70% 70% at 30% 100%, ${c.b3}, transparent 70%), radial-gradient(60% 60% at 100% 100%, ${c.b4}, transparent 70%), ${c.bg}`;
  }
  function applyFallback(t) {
    $('#fallbackBg').style.background = swatch(t);
  }

  /* Push the active theme everywhere. */
  function applyTheme(instant) {
    const t = curTheme();
    Themes.apply(t);
    Background.setTheme(t, instant);
    applyFallback(t);
    if (window.cubeShell) window.cubeShell.titleBar(t.c.fg);
  }
  function selectTheme(id) {
    S.themeId = id;
    applyTheme();
    save();
    if (tab === 'look') { renderThemeGrid(); syncEditor(); }
  }
  function forkTheme(t, name) {
    const c = clone(t);
    c.id = uid();
    c.builtin = false;
    c.name = name || (t.builtin ? t.name + ' copy' : t.name + ' 2');
    delete c.rand;
    S.custom.push(c);
    S.themeId = c.id;
    return c;
  }
  /* Edit the active theme; presets are forked into a custom copy on first change. */
  function editTheme(fn) {
    let t = curTheme();
    const forked = t.builtin;
    if (forked) t = forkTheme(t);
    delete t.rand;
    fn(t);
    Themes.apply(t);
    Background.setTheme(t);
    applyFallback(t);
    if (window.cubeShell) window.cubeShell.titleBar(t.c.fg);
    renderThemeGrid();
    if (forked) syncEditorMeta();
    save();
  }

  let ed = null; // references to editor inputs
  function renderThemeGrid() {
    const grid = $('#themeGrid');
    if (!grid) return;
    const list = allThemes();
    const cards = Array.from(grid.children);
    if (cards.length === list.length && cards.every((c, i) => c.dataset.id === list[i].id)) {
      cards.forEach((c, i) => {
        const t = list[i];
        c.classList.toggle('sel', t.id === S.themeId);
        c.title = t.name;
        c.firstChild.style.background = swatch(t);
        c.lastChild.style.color = t.c.fg;
        c.lastChild.textContent = t.name;
      });
      return;
    }
    const had = new Set(cards.map((c) => c.dataset.id));
    grid.replaceChildren(...list.map((t) =>
      h('button', { class: 'theme' + (t.id === S.themeId ? ' sel' : ''), 'data-id': t.id, title: t.name, onClick: () => selectTheme(t.id) },
        h('div', { class: 'sw', style: 'background:' + swatch(t) }),
        h('div', { class: 'nm', style: 'color:' + t.c.fg, text: t.name }))));
    // a scheme that was just created pops into the grid
    if (had.size) Array.from(grid.children).forEach((c) => { if (!had.has(c.dataset.id)) flyIn(c, { y: 10, blur: 10, scale: 0.9, dur: 750 }); });
  }

  function renderLookPane(animate) {
    const root = $('[data-pane=look]');
    ed = { colors: {}, sliders: {} };
    const colorGrid = h('div', { class: 'colors' });
    Themes.fields.forEach(([key, label]) => {
      const color = h('input', { type: 'color', 'aria-label': label });
      const hex = h('input', { class: 'hex', type: 'text', maxlength: 7, spellcheck: 'false', 'aria-label': label + ' hex' });
      const apply = (v) => editTheme((t) => { t.c[key] = v; });
      color.addEventListener('input', () => { hex.value = color.value; apply(color.value); });
      hex.addEventListener('input', () => { if (Themes.isHex(hex.value)) { const v = Themes.normHex(hex.value); color.value = v; apply(v); } });
      hex.addEventListener('focus', () => hex.select());
      hex.addEventListener('blur', () => { hex.value = curTheme().c[key]; });
      hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') hex.blur(); });
      ed.colors[key] = { color, hex };
      colorGrid.append(h('div', { class: 'colorf' }, h('div', { class: 'sw' }, color), h('div', { class: 'meta' }, h('span', { text: label }), hex)));
    });

    const sliders = [
      ['intensity', 'Glow strength', 0, 1, 0.01, (v) => Math.round(v * 100) + '%'],
      ['scale', 'Pattern size', 0.5, 2.5, 0.05, (v) => v.toFixed(2) + '×'],
      ['speed', 'Motion speed', 0, 2, 0.05, (v) => (v === 0 ? 'Still' : v.toFixed(2) + '×')],
      ['grain', 'Film grain', 0, 0.4, 0.01, (v) => Math.round((v / 0.4) * 100) + '%'],
    ].map(([key, label, min, max, step, fmt]) => {
      const input = h('input', { type: 'range', min, max, step });
      const out = h('output');
      input.addEventListener('input', () => { const v = parseFloat(input.value); out.textContent = fmt(v); editTheme((t) => { t.p[key] = v; }); });
      input.addEventListener('change', () => input.blur());
      ed.sliders[key] = { input, out, fmt };
      return h('div', { class: 'row' }, h('div', { class: 'lbl', text: label }), h('div', { class: 'range' }, input, out));
    });

    ed.name = h('input', { class: 'text', type: 'text', maxlength: 28, 'aria-label': 'Scheme name' });
    ed.name.addEventListener('input', () => editTheme((t) => { t.name = ed.name.value || 'Untitled'; }));
    ed.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') ed.name.blur(); });
    ed.del = h('button', { class: 'btn danger', text: 'Delete', onClick: deleteTheme });

    root.replaceChildren(
      h('div', { class: 'h', text: 'Color schemes' }),
      h('div', { class: 'themes', id: 'themeGrid' }),
      h('div', { class: 'h', text: 'Customize' }),
      h('div', { class: 'row col' }, h('div', { class: 'lbl', text: 'Name' }), ed.name),
      colorGrid,
      h('div', { class: 'h', text: 'Background' }),
      ...sliders,
      h('div', { class: 'h', text: 'Make it yours' }),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', text: 'Random dark', onClick: () => shuffle(false) }),
        h('button', { class: 'btn', text: 'Random light', onClick: () => shuffle(true) }),
        h('button', { class: 'btn', text: 'Duplicate', onClick: () => { forkTheme(curTheme()); applyTheme(); renderThemeGrid(); syncEditor(); save(); toast('Duplicated as a custom scheme'); } }),
        h('button', { class: 'btn', text: 'Export', onClick: exportTheme }),
        h('button', { class: 'btn', text: 'Import', onClick: importTheme }),
        ed.del));
    renderThemeGrid();
    syncEditor();
    if (animate) stagger($$('.theme', root), { delay: 140, y: 12, blur: 10, scale: 0.94, dur: 850 }, 30);
  }

  /* Refresh editor controls from the current theme. */
  function syncEditor() {
    if (!ed) return;
    const t = curTheme();
    for (const [key, { color, hex }] of Object.entries(ed.colors)) { color.value = t.c[key]; hex.value = t.c[key]; }
    for (const [key, { input, out, fmt }] of Object.entries(ed.sliders)) { input.value = t.p[key]; out.textContent = fmt(t.p[key]); }
    syncEditorMeta();
  }
  function syncEditorMeta() {
    if (!ed) return;
    const t = curTheme();
    if (document.activeElement !== ed.name) ed.name.value = t.name;
    ed.del.hidden = !!t.builtin;
    const grid = $('#themeGrid');
    if (grid) grid.scrollTop = 0;
  }

  async function deleteTheme() {
    const t = curTheme();
    if (t.builtin) return;
    if (!(await confirmDialog('Delete “' + t.name + '”?', 'This color scheme will be removed.', 'Delete', true))) return;
    S.custom = S.custom.filter((x) => x.id !== t.id);
    S.themeId = Themes.presets[0].id;
    applyTheme();
    renderThemeGrid();
    syncEditor();
    save();
  }

  /* Random schemes: keep rerolling one working draft instead of piling up copies. */
  function shuffle(light) {
    const r = Themes.random(light);
    let t = curTheme();
    if (!t.rand) t = forkTheme(t, 'Random');
    t.c = r.c;
    t.p = r.p;
    t.rand = true;
    applyTheme();
    renderThemeGrid();
    syncEditor();
    save();
  }

  function exportTheme() {
    const t = curTheme();
    const json = JSON.stringify({ name: t.name, c: t.c, p: t.p }, null, 1);
    const ta = h('textarea', { class: 'text', readonly: true });
    ta.value = json;
    openDialog({
      title: 'Export scheme', sub: 'Copy this text and share it, or save it for later.', body: ta,
      buttons: [{ label: 'Copy', primary: true, run: () => {
        ta.select();
        const ok = navigator.clipboard ? navigator.clipboard.writeText(json).then(() => true, () => false) : Promise.resolve(false);
        ok.then((v) => { if (!v) document.execCommand('copy'); toast('Copied to clipboard'); });
        return false;
      } }, { label: 'Close' }],
    });
  }
  function importTheme() {
    const ta = h('textarea', { class: 'text', placeholder: '{ "name": "…", "c": { … }, "p": { … } }' });
    openDialog({
      title: 'Import scheme', sub: 'Paste a scheme exported from Cube Timer.', body: ta,
      buttons: [{ label: 'Cancel' }, { label: 'Import', primary: true, run: () => {
        let t = null;
        try { t = Themes.sanitize(JSON.parse(ta.value)); } catch (e) { /* invalid */ }
        if (!t) { toast('That doesn’t look like a color scheme'); return false; }
        t.id = uid();
        S.custom.push(t);
        selectTheme(t.id);
        toast('Imported “' + t.name + '”');
      } }],
    });
  }

  /* ====================================================================
     Settings -> DOM
     ==================================================================== */
  function applySettings() {
    const st = S.settings;
    app.dataset.focus = st.focus ? '1' : '0';
    app.classList.toggle('no-stats', !st.statline);
    app.classList.toggle('no-preview', !st.preview || !Scramblers.get(S.event).previewN);
    app.classList.toggle('no-recent', !st.recent);
    document.documentElement.classList.toggle('reduce-motion', st.motion === 'reduced');
    document.body.classList.toggle('still', !st.animate);
    timerEl.style.setProperty('--ts', st.timerScale);
    typeInput.style.setProperty('--ts', st.timerScale);
    Background.setAnimated(st.animate);
    Background.setQuality(st.quality);
  }

  /* Film grain tile, generated once. */
  function makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d');
    const img = g.createImageData(180, 180);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    $('#grain').style.backgroundImage = `url(${c.toDataURL('image/png')})`;
  }

  /* ====================================================================
     Input
     ==================================================================== */
  const isTextEntry = (el) => el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' && !['range', 'checkbox', 'button', 'color'].includes(el.type)));

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11' && window.cubeShell) { e.preventDefault(); window.cubeShell.toggleFullscreen(); return; }
    if (e.repeat && e.key === ' ') { if (!isTextEntry(e.target)) e.preventDefault(); return; }
    // anything stops a running solve
    if (T.phase === 'running') {
      if (e.key === 'Escape') { e.preventDefault(); discardSolve(); return; }
      if (e.key.length > 1 && !['Enter', 'Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete'].includes(e.key)) return; // modifier keys
      e.preventDefault();
      stopSolve(evTime(e));
      if (e.key === ' ') T.suppress = true;
      return;
    }
    if (dlg.open) return;
    if (isTextEntry(e.target)) {
      if (e.key === 'Escape' && e.target !== typeInput) e.target.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === ' ') { e.preventDefault(); pressDown('key'); return; }
    switch (e.key) {
      case 'Escape':
        if (popOpen()) closePopover();
        else if (T.phase === 'inspecting') cancelInspection();
        else if (T.press !== 'none') cancelPress();
        else if (app.classList.contains('panel-open')) closePanel();
        break;
      case 'ArrowRight': if (T.phase === 'idle') nextScramble(); break;
      case 'ArrowLeft': if (T.phase === 'idle') prevScramble(); break;
      case '2': { const l = lastSolve(); if (l && T.phase === 'idle') setPenalty(l, 1); break; }
      case 'd': case 'D': { const l = lastSolve(); if (l && T.phase === 'idle') setPenalty(l, 2); break; }
      case 'Backspace': case 'Delete': { const l = lastSolve(); if (l && T.phase === 'idle') deleteSolve(l); break; }
      case 'h': case 'H': openPanel('solves'); break;
      case 't': case 'T': openPanel('look'); break;
      case 's': case 'S': openPanel('settings'); break;
      default: break;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key !== ' ') return;
    if (isTextEntry(e.target)) return;
    e.preventDefault();
    pressUp('key', evTime(e));
  });
  window.addEventListener('blur', () => { if (T.phase !== 'running') cancelPress(); });

  const NO_START = 'button, input, textarea, select, a, #scramble, #panel, #popover, dialog, #statline, #actions, #recent';
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (T.phase === 'running') {
      e.preventDefault();
      stopSolve(evTime(e));
      T.suppress = true;
      return;
    }
    if (popOpen() && !pop.contains(e.target) && !(pop._anchor && pop._anchor.contains(e.target))) {
      closePopover();
      T.ignorePointer = true; // the click that dismissed the menu shouldn't also arm the timer
      return;
    }
    if (T.ignorePointer) return;
    if (dlg.open || e.target.closest(NO_START) || !e.target.closest('#app')) return;
    pressDown('pointer');
  }, true);
  const pointerEnd = (e) => {
    if (T.ignorePointer) { T.ignorePointer = false; return; }
    pressUp('pointer', evTime(e));
  };
  window.addEventListener('pointerup', pointerEnd, true);
  window.addEventListener('pointercancel', () => { T.suppress = false; T.ignorePointer = false; if (T.source === 'pointer') cancelPress(); }, true);
  // clicking empty space in typing mode puts the cursor back in the field
  $('#stage').addEventListener('click', (e) => { if (isTyping() && !e.target.closest(NO_START)) focusTypeInput(); });

  /* ====================================================================
     Boot
     ==================================================================== */
  function renderAll(how = 'swap') {
    if (T.phase === 'inspecting') cancelInspection();
    renderHeader();
    renderScramble(how);
    renderIdle(null, how);
    renderStatline(how);
    renderRecent(how);
    applyInputMode();
    if (app.classList.contains('panel-open')) renderPane(tab);
    if (how !== 'enter') flyIn($('#sessionLabel'), { y: 0, x: 6, blur: 6, scale: 1, dur: 600 });
  }

  /* The opening sequence: background fades up, then the interface flies in piece by piece. */
  function entrance() {
    if (!motion()) return;
    const bg = document.body.classList.contains('no-webgl') ? $('#fallbackBg') : $('#bg');
    bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1800, easing: 'ease-out' });
    stagger($$('.topbar .pill, .topbar .icon'), { delay: 120, y: -10, blur: 10, scale: 0.94, dur: 1000 }, 60);
  }

  function boot() {
    if (window.cubeShell) document.body.classList.add('electron');
    makeGrain();
    if (!Background.init($('#bg'))) document.body.classList.add('no-webgl');
    Background.seed(Math.random() * 100);
    applyTheme(true);
    applySettings();
    resetScrambles();
    session();
    renderAll('enter');
    entrance();
    // colours were applied above without their crossfade; from here on scheme changes animate
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('booting')));
  }
  boot();

  // tiny hook for tests / debugging from the console
  window.CubeTimer = { get state() { return S; }, openPanel, setEvent };
})();
