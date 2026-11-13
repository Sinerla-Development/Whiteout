(() => {
  'use strict';

  const tld = window.tld;
  const TD = window.tldDesktop;
  const $ = (s, el) => (el || document).querySelector(s);
  if (!tld || !TD) return;
  const MAX_STEPS = 60;
  const loaded = () => typeof state !== 'undefined' && !!state.outer;
  const dialogOpen = () => !!document.querySelector('dialog[open]');
  const typing = (el) => !!el && (el.isContentEditable || (el.tagName === 'TEXTAREA') || (el.tagName === 'INPUT' && /^(text|search|number|email|url|tel|password)$/.test(el.type || 'text')));

  const REG = [];
  const ACT = {
    add(a) { REG.push(a); return a; },
    list() { return REG.filter((a) => !a.when || a.when()); },
    byId(id) { return REG.find((a) => a.id === id); },
    run(id) {
      const a = ACT.byId(id);
      if (!a || (a.when && !a.when())) return false;
      Promise.resolve(a.run()).catch((e) => toast('Action failed: ' + TD.code(e), 'err'));
      return true;
    },
  };
  window.tldAct = ACT;

  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const MOD = MAC ? '⌘' : 'Ctrl+';
  const click = (sel) => () => { const b = $(sel); if (b && !b.hidden && !b.disabled) b.click(); };
  const tab = (id) => () => { if (window.tldMode) window.tldMode.set('edit'); state.tab = id; viewRender(); window.scrollTo(0, 0); };

  ACT.add({ id: 'open', title: 'Open file…', hint: MOD + 'O', combo: 'mod+o', run: () => TD.pickNative() });
  ACT.add({ id: 'slots', title: 'Game saves…', hint: MOD + '⇧O', combo: 'mod+shift+o', run: () => TD.openSlotsDlg() });
  ACT.add({ id: 'save', title: 'Save to game', hint: MOD + 'S', combo: 'mod+s', when: loaded, run: click('#saveBtn') });
  ACT.add({ id: 'savecopy', title: 'Save a copy…', hint: MOD + '⇧S', combo: 'mod+shift+s', when: loaded, run: click('#dlBtn') });
  ACT.add({ id: 'settings', title: 'Settings…', hint: MOD + ',', combo: 'mod+,', run: click('#settingsBtn') });
  ACT.add({ id: 'view-edit', title: 'Show editor', hint: MOD + '1', combo: 'mod+1', run: click('.mode[data-mode="edit"]') });
  ACT.add({ id: 'view-map', title: 'Show map', hint: MOD + '2', combo: 'mod+2', run: click('.mode[data-mode="map"]') });
  ACT.add({ id: 'follow', title: 'Follow player', hint: MOD + '3', combo: 'mod+3', when: () => document.body.classList.contains('mode-map'), run: click('#followBtn') });
  ACT.add({ id: 'tour', title: 'Replay the tour', run: () => { if (window.tldTour) tldTour.start(); } });
  ACT.add({ id: 'palette', title: 'Command palette', hint: MOD + 'K', combo: 'mod+k', run: () => openPalette() });
  ACT.add({ id: 'undo', title: 'Undo', hint: MOD + 'Z', combo: 'mod+z', when: loaded, run: () => undo() });
  ACT.add({ id: 'redo', title: 'Redo', hint: MOD + '⇧Z', combo: 'mod+shift+z', when: loaded, run: () => redo() });
  for (const [id, label] of [['player', 'Player'], ['inv', 'Inventory'], ['skills', 'Skills'], ['tele', 'Teleport'], ['injury', 'Afflictions']]) {
    ACT.add({ id: 'tab-' + id, title: 'Go to: ' + label, group: 'Tab', when: loaded, run: tab(id) });
  }
  ACT.add({
    id: 'backups', title: 'Backups: open slot', when: () => TD.isLinked(),
    run: async () => {
      await TD.openSlotsDlg();
      const e = TD.D.entries.find((x) => x.name === TD.D.file.name);
      if (e) { $('#slotsDlg').close(); TD.openBackups(e); }
    },
  });

  const comboOf = (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return ((MAC ? e.metaKey : e.ctrlKey) ? 'mod+' : '') + (e.shiftKey ? 'shift+' : '') + key;
  };
  addEventListener('keydown', (e) => {
    if (!(MAC ? e.metaKey : e.ctrlKey) || e.altKey) return;
    let combo = comboOf(e);
    if (combo === 'mod+y') combo = 'mod+shift+z';
    const a = REG.find((x) => x.combo === combo);
    if (!a) return;
    if (a.id === 'palette') { e.preventDefault(); if (tldDedupe(combo)) { const d = $('#paletteDlg'); if (d && d.open) d.close(); else ACT.run('palette'); } return; }
    if (dialogOpen()) return;
    if ((a.id === 'undo' || a.id === 'redo') && typing(e.target)) return;
    if (['mod+s', 'mod+o', 'mod+,', 'mod+1', 'mod+2', 'mod+3'].includes(combo)) return;
    e.preventDefault();
    if (tldDedupe(combo)) ACT.run(a.id);
  });

  tld.listen('menu', (ev) => {
    const id = ev && ev.payload;
    const a = ACT.byId(id);
    if (!a) return;
    if (dialogOpen() && id !== 'palette') return;
    if (!tldDedupe(a.combo || id)) return;
    ACT.run(id);
  });

  const U = { stack: [], idx: -1, timer: 0, busy: false };

  function snap(prev) {
    const o = {};
    for (const k of Object.keys(state.sec)) {
      const t = ser(state.sec[k]);
      o[k] = prev && prev[k] === t ? prev[k] : t;
    }
    return o;
  }
  const sameSnap = (a, b) => Object.keys(a).every((k) => !(k in b) || a[k] === b[k]);
  function backfill(cur) {
    for (const k of Object.keys(cur)) {
      for (const e of U.stack) if (!(k in e)) e[k] = state.origText[k];
    }
  }
  function reset() {
    clearTimeout(U.timer);
    U.stack = []; U.idx = -1;
    if (!loaded()) return;
    U.stack.push(snap(null)); U.idx = 0;
    recount();
  }
  function commit() {
    clearTimeout(U.timer);
    if (!loaded() || U.busy || U.idx < 0) return false;
    let cur;
    try { cur = snap(U.stack[U.idx]); } catch (e) { return false; }
    backfill(cur);
    recount();
    if (sameSnap(cur, U.stack[U.idx])) return false;
    U.stack.length = U.idx + 1;
    U.stack.push(cur);
    while (U.stack.length > MAX_STEPS) U.stack.shift();
    U.idx = U.stack.length - 1;
    return true;
  }
  const later = () => { clearTimeout(U.timer); U.timer = setTimeout(commit, 260); };

  function restore(i) {
    const target = U.stack[i];
    U.busy = true;
    try {
      for (const k of Object.keys(state.sec)) {
        const text = k in target ? target[k] : state.origText[k];
        state.sec[k] = parseJSON(text);
      }
      U.idx = i;
      const mode = window.tldMode;
      window.tldMode = null;
      try { render(); } finally { window.tldMode = mode; }
      if (mode && mode.refresh) mode.refresh();
      recount();
      TD.syncUi();
    } finally { U.busy = false; }
  }
  function undo() {
    commit();
    if (U.idx <= 0) { toast('Nothing to undo.'); return; }
    restore(U.idx - 1);
    toast('Undone.');
  }
  function redo() {
    commit();
    if (U.idx >= U.stack.length - 1) { toast('Nothing to redo.'); return; }
    restore(U.idx + 1);
    toast('Redone.');
  }

  function recount() {
    let n = 0;
    if (loaded() && state.base) {
      try { n = diffSections(state.base, summarize(liveReader(), false)).reduce((s, [, lines]) => s + lines.length, 0); } catch (e) { n = 0; }
      if (n === 0 && TD.isDirty()) n = 1;
    }
    if (n !== TD.D.changes) { TD.D.changes = n; TD.syncUi(); }
    pushMenuState();
  }

  let lastMenu = '';
  function pushMenuState() {
    if (!tld.inTauri) return;
    const st = { slotOpen: loaded(), follow: $('#followBtn') ? $('#followBtn').getAttribute('aria-pressed') === 'true' : false };
    const key = JSON.stringify(st);
    if (key === lastMenu) return;
    lastMenu = key;
    tld.invoke('set_menu_state', st).catch(() => { lastMenu = ''; });
  }

  for (const ev of ['input', 'change', 'click', 'keyup']) document.addEventListener(ev, () => { if (loaded() && !U.busy) later(); }, true);
  new MutationObserver(pushMenuState).observe($('#followBtn'), { attributes: true, attributeFilter: ['aria-pressed'] });

  const prevOpen = window.tldHooks || {};
  window.tldHooks = Object.assign(prevOpen, {
    opened() { reset(); if (window.tldMode && tldMode.record) tldMode.record(); },
    saved() {
      clearTimeout(U.timer);
      if (U.idx >= 0) { try { U.stack[U.idx] = snap(U.stack[U.idx]); } catch (e) { reset(); } }
      recount();
    },
    before() { commit(); },
    after() { commit(); recount(); },
  });
  const origOpenBytes = window.openBytes;
  window.openBytes = function () { const r = origOpenBytes.apply(this, arguments); reset(); return r; };

  window.tldUndo = { undo, redo, commit, reset, steps: () => U.stack.length };

  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let pal = null;

  function sources(q) {
    const out = [];
    const f = fold(q);
    const push = (kind, title, hint, run, extra) => out.push({ kind, title, hint, run, f: fold(title + ' ' + (extra || '')) });
    for (const a of ACT.list()) if (a.id !== 'palette') push('Action', a.title, a.hint || '', () => ACT.run(a.id));
    if (f.length >= 2 && loaded()) {
      if (window.tldTools && tldTools.quickAdd && typeof DATA !== 'undefined') {
        for (const it of DATA.items) {
          if (it.hide) continue;
          let nm = it.name;
          try { nm = itemName(it.id) || it.name; } catch (e) { }
          push('Item', 'Add to inventory: ' + nm, it.cat || '', () => tldTools.quickAdd(it.id), it.name + ' ' + it.id);
        }
      }
      if (typeof SKILL_NAMES !== 'undefined') {
        for (const [k, v] of Object.entries(SKILL_NAMES)) push('Skill', 'Skill: ' + v, '', () => { tab('skills')(); }, k);
      }
    }
    if (window.tldMode && tldMode.regions) {
      for (const r of tldMode.regions()) push('Region', 'Map: ' + r.name, '', () => tldMode.go(r.id));
    }
    return out;
  }

  function rank(items, q) {
    const f = fold(q).trim();
    if (!f) return items.filter((i) => i.kind === 'Action').slice(0, 12);
    const words = f.split(/\s+/);
    const scored = [];
    for (const it of items) {
      if (!words.every((w) => it.f.includes(w))) continue;
      const t = fold(it.title);
      const s = (t.startsWith(f) ? 0 : t.split(/[\s:]+/).some((w) => w.startsWith(words[0])) ? 1 : 2) + (it.kind === 'Action' ? 0 : 0.5);
      scored.push([s, it]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].title.length - b[1].title.length);
    return scored.slice(0, 12).map((x) => x[1]);
  }

  function ensurePalette() {
    if (pal) return pal;
    const dlg = h('dialog', { id: 'paletteDlg', class: 'palette', 'aria-label': 'Command palette' });
    const input = h('input', { type: 'text', class: 'pal-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palList', 'aria-autocomplete': 'list', placeholder: 'Search actions, items, skills or regions', autocomplete: 'off', spellcheck: 'false' });
    const list = h('ul', { id: 'palList', class: 'pal-list', role: 'listbox' });
    dlg.append(input, list);
    document.body.append(dlg);
    pal = { dlg, input, list, items: [], sel: 0, all: [] };
    const draw = () => {
      pal.items = rank(pal.all, input.value);
      if (pal.sel >= pal.items.length) pal.sel = Math.max(0, pal.items.length - 1);
      list.replaceChildren(...(pal.items.length ? pal.items.map((it, i) => h('li', { id: 'pal' + i, role: 'option', class: 'pal-row', 'aria-selected': String(i === pal.sel), onclick: () => choose(i), onmousemove: () => { if (pal.sel !== i) { pal.sel = i; mark(); } } },
        h('span', { class: 'pal-kind' }, it.kind), h('span', { class: 'pal-title' }, it.title), it.hint ? h('kbd', {}, it.hint) : null)) : [h('li', { class: 'pal-empty muted' }, 'No results.')]));
      input.setAttribute('aria-activedescendant', pal.items.length ? 'pal' + pal.sel : '');
    };
    const mark = () => {
      list.querySelectorAll('.pal-row').forEach((r, i) => r.setAttribute('aria-selected', String(i === pal.sel)));
      input.setAttribute('aria-activedescendant', 'pal' + pal.sel);
      const r = list.children[pal.sel];
      if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
    };
    const choose = (i) => {
      const it = pal.items[i];
      if (!it) return;
      dlg.close();
      setTimeout(() => { try { it.run(); } catch (e) { toast('Action failed: ' + TD.code(e), 'err'); } }, 0);
    };
    input.addEventListener('input', () => { pal.sel = 0; pal.all = sources(input.value); draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (pal.items.length) { pal.sel = (pal.sel + 1) % pal.items.length; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (pal.items.length) { pal.sel = (pal.sel - 1 + pal.items.length) % pal.items.length; mark(); } }
      else if (e.key === 'Enter') { e.preventDefault(); choose(pal.sel); }
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { input.value = ''; });
    pal.open = () => { input.value = ''; pal.sel = 0; pal.all = sources(''); draw(); dlg.showModal(); input.focus(); };
    return pal;
  }
  function openPalette() {
    if (dialogOpen() && !(pal && pal.dlg.open)) return;
    ensurePalette().open();
  }

  pushMenuState();
  window.tldMenuState = pushMenuState;
})();
