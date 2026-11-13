(() => {
  'use strict';

  const $ = (s, el) => (el || document).querySelector(s);
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const MOD = MAC ? '⌘' : 'Ctrl+';
  const SHIFT = MAC ? '⇧' : 'Shift+';
  const hasSlot = () => typeof state !== 'undefined' && !!state.outer;
  const visible = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? el : null;
  };
  const gotoTab = (id) => {
    if (!hasSlot()) return;
    state.tab = id;
    viewRender();
  };
  const firstCard = () => visible($('#view .card, #view .fold'));

  const STEPS = [
    {
      title: 'Welcome to Whiteout',
      body: 'A quick look around, about two minutes. Press Esc to leave, you can replay it from Settings.',
      bullets: ['Every save makes a backup first.', 'No accounts, your saves stay on this computer.'],
    },
    {
      title: 'Open a save',
      skip: hasSlot,
      target: () => visible($('#quickSaves:not([hidden])')) || visible($('.startlinks')),
      body: 'Your latest save is right here, and the other slots are the small links below it. You can also drag a slot file into the window, it opens as a copy so the original stays untouched.',
      action: () => {
        const e = window.tldDesktop && tldDesktop.D.entries[0];
        if (!e || hasSlot()) return null;
        const info = tldDesktop.D.info.get(e.name);
        return { label: 'Open ' + ((info && info.meta && info.meta.title) || e.name), run: () => tldDesktop.openPath(tldDesktop.joinPath(tldDesktop.D.dir, e.name)) };
      },
    },
    {
      title: 'Game status',
      target: () => visible($('#gameChip')),
      body: 'Shows whether The Long Dark is running. While it is, saving to the game is blocked because the game would overwrite your changes. Close the game, edit, save, then start it again.',
    },
    {
      title: 'Saves',
      target: () => visible($('#slotsBtn')),
      body: 'Every slot in your save folder, newest first. Open one or look at its backups, and pick the folder here if Whiteout didn\'t find it.',
    },
    {
      title: 'Editor and Map',
      target: () => visible($('.modes')),
      body: 'Editor changes the save and Map shows the island with your pins and your position. The first time you open the Map, Whiteout asks before loading the images from Steam. ' + MOD + '1 and ' + MOD + '2 switch between them.',
      bullets: ['Pin adds your own notes to the map.', 'Teleport picks the destination with a click.', 'Follow player and Trail show up on the Map when a slot is open.'],
    },
    {
      title: 'Settings',
      target: () => visible($('#settingsBtn')),
      body: 'Save folder, data folder, live updates, how many backups to keep, update checks and the credits. And this tour.',
    },
    {
      title: 'Your slot',
      needsSlot: true,
      target: () => visible($('#slotInfo')),
      body: 'The open slot with its name, mode, hours played and save time. Nothing is written until you press Save.',
    },
    {
      title: 'Five sections',
      needsSlot: true,
      target: () => visible($('#tabs')),
      body: 'Player, Inventory, Skills, Teleport, Afflictions and More. ' + MOD + 'K opens a command palette that finds any action by name.',
    },
    {
      title: 'Player',
      needsSlot: true,
      prep: () => gotoTab('player'),
      target: firstCard,
      body: 'Set health, calories, thirst, fatigue and cold, or fill them all at once. Special options make you unable to die, invulnerable or able to carry anything. Mark as cheated sets the cheats flag in the save.',
    },
    {
      title: 'Time, aurora and cougar',
      needsSlot: true,
      prep: () => gotoTab('player'),
      target: () => visible($('#view .folds')),
      body: 'Time and aurora sets the time and day and can bring an aurora the next night. Weather can\'t be changed, the game works it out from the time. Cougar turns the cougar on or off and lowers its threat.',
    },
    {
      title: 'Inventory',
      needsSlot: true,
      prep: () => gotoTab('inv'),
      target: () => visible($('#view .listbar')) || firstCard(),
      body: 'Search, filter and sort your items, change condition and amounts, remove things or add anything from the full list. Loadouts are your own item lists you can add to any save, and Compare slots copies items from another slot.',
    },
    {
      title: 'Skills',
      needsSlot: true,
      prep: () => gotoTab('skills'),
      target: firstCard,
      body: 'Set the points for each skill and see the level next to it, or raise everything to level 5 in one click. The levels come from the wiki and may change in game updates.',
    },
    {
      title: 'Teleport',
      needsSlot: true,
      prep: () => gotoTab('tele'),
      target: firstCard,
      body: 'Pick a region and type coordinates, or choose the spot on the Map. The height is guessed from places you\'ve been, so if you fall through the ground restore a backup and set it higher. The teleport happens when you load the slot.',
    },
    {
      title: 'Afflictions',
      needsSlot: true,
      prep: () => gotoTab('injury'),
      target: firstCard,
      body: 'Cure sprains, bleeding, broken ribs, infections, frostbite and severe lacerations one by one or all at once. Food poisoning, dysentery and the rest aren\'t handled.',
    },
    {
      title: 'Undo and redo',
      body: 'Undo with ' + MOD + 'Z and redo with ' + MOD + SHIFT + 'Z, step by step. Nothing goes to the game until you save.',
    },
    {
      title: 'Changes and backups at a glance',
      needsSlot: true,
      prep: () => gotoTab('player'),
      target: () => visible($('#saveInfo')),
      body: 'Next to Save you see how many changes are waiting and when the last backup was made. Review shows exactly what will be written.',
    },
    {
      title: 'Save to game',
      needsSlot: true,
      target: () => visible($('#saveBtn')),
      body: 'Save shows your changes first, then backs up the current file and writes the slot. If the game saved something newer in the meantime, Whiteout tells you before replacing it.',
    },
    {
      title: 'Backups and restore',
      target: () => visible($('#slotsBtn')),
      body: 'A backup is made every time you save and every time the game saves. In Saves you can name and lock backups, compare them with the current file and restore all of it or just some parts. Locked backups are never deleted.',
    },
    {
      title: 'Stays in sync with the game',
      target: () => visible($('#linkTag')),
      body: 'When the game saves, the open slot updates by itself and asks first if you have unsaved changes. What changed? shows the difference, and the Live tag shows this is on.',
    },
    {
      title: 'Newer game versions',
      body: 'If a save comes from a newer game build than Whiteout was tested with, you get a warning. Make a backup and check your changes carefully.',
    },
    {
      title: 'Map remote',
      body: 'While you play, press Ctrl+Alt+W. Whiteout opens the map on your current region with numbers on the exits. Press a number to open that map, 0 to come back to your own region, and the shortcut again to return to what you were doing. You can change or turn off the shortcut in Settings.',
    },
    {
      title: 'Keyboard shortcuts',
      bullets: [MOD + 'S: save', MOD + 'O: open a file', MOD + 'Z and ' + MOD + SHIFT + 'Z: undo and redo', MOD + 'K: command palette', MOD + '1 and ' + MOD + '2: Editor and Map', MOD + '3: follow player (on the Map)', MOD + ',: settings'],
      body: 'Most things have one.',
    },
    {
      title: 'That is the tour',
      body: 'Replay it any time from Settings or the command palette. Good luck out there.',
    },
  ];

  let dlg = null, spot = null, card = null, steps = [], at = 0, running = false, prev = null, busy = false;

  function build() {
    if (dlg) return;
    spot = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
    const skipBtn = h('button', { type: 'button', class: 'linkbtn tour-skip' }, 'Skip tour');
    const act = h('button', { type: 'button', class: 'tour-act', hidden: true });
    const back = h('button', { type: 'button', class: 'tour-back' }, 'Back');
    const next = h('button', { type: 'button', class: 'primary tour-next' }, 'Next');
    card = h('div', { class: 'tour-card' },
      h('div', { class: 'tour-meta' }, h('span', { class: 'tour-count muted small' }), h('span', { class: 'tour-bar', 'aria-hidden': 'true' }, h('i'))),
      h('div', { class: 'tour-text', 'aria-live': 'polite' }, h('h2', { id: 'tourTitle' }), h('p', { class: 'tour-body' }), h('ul', { class: 'tour-list' }), h('p', { class: 'tour-note muted small' })),
      h('div', { class: 'tour-foot' }, skipBtn, h('span', { class: 'tour-spacer' }), act, back, next));
    dlg = h('dialog', { class: 'tour', 'aria-labelledby': 'tourTitle' }, spot, card);
    document.body.append(dlg);
    skipBtn.addEventListener('click', () => dlg.close());
    back.addEventListener('click', () => go(at - 1));
    next.addEventListener('click', () => (at >= steps.length - 1 ? dlg.close() : go(at + 1)));
    dlg.addEventListener('close', finish);
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (at > 0) back.click(); }
    });
    const again = () => { if (running) layout(); };
    addEventListener('resize', again);
    addEventListener('scroll', again, true);
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

  function layout() {
    const s = steps[at];
    const el = s && s.target ? s.target() : null;
    const vw = innerWidth, vh = innerHeight, m = 14;
    let rect = null;
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 6;
      rect = { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad };
      rect.width = rect.right - rect.left;
      rect.height = rect.bottom - rect.top;
      Object.assign(spot.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    }
    dlg.dataset.center = rect ? '' : '1';
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left, top;
    if (!rect) { left = (vw - cw) / 2; top = (vh - ch) / 2; }
    else if (vh - rect.bottom >= ch + m * 2) { top = rect.bottom + m; left = rect.left + rect.width / 2 - cw / 2; }
    else if (rect.top >= ch + m * 2) { top = rect.top - ch - m; left = rect.left + rect.width / 2 - cw / 2; }
    else if (vw - rect.right >= cw + m * 2) { left = rect.right + m; top = rect.top; }
    else if (rect.left >= cw + m * 2) { left = rect.left - cw - m; top = rect.top; }
    else { left = (vw - cw) / 2; top = vh - ch - m; }
    card.style.left = clamp(left, m, Math.max(m, vw - cw - m)) + 'px';
    card.style.top = clamp(top, m, Math.max(m, vh - ch - m)) + 'px';
  }

  async function go(i) {
    if (busy) return;
    busy = true;
    try {
      let dir = i >= at ? 1 : -1;
      i = clamp(i, 0, steps.length - 1);
      while (steps[i].skip && steps[i].skip() && i > 0 && i < steps.length - 1) i += dir;
      at = i;
      const s = steps[i];
      if (s.prep) { try { s.prep(); } catch (e) { console.error(e); } }
      let el = s.target ? s.target() : null;
      if (el) {
        const r = el.getBoundingClientRect();
        el.scrollIntoView({ block: r.height > innerHeight * 0.6 ? 'start' : 'center', inline: 'nearest', behavior: 'instant' });
      }
      const $c = (sel) => $(sel, card);
      $c('.tour-count').textContent = (i + 1) + ' / ' + steps.length;
      $c('.tour-bar i').style.width = ((i + 1) / steps.length * 100) + '%';
      $c('#tourTitle').textContent = s.title;
      $c('.tour-body').textContent = s.body || '';
      $c('.tour-body').hidden = !s.body;
      const list = $c('.tour-list');
      list.replaceChildren(...(s.bullets || []).map((b) => h('li', {}, b)));
      list.hidden = !(s.bullets && s.bullets.length);
      const note = $c('.tour-note');
      note.textContent = s.needsSlot && !hasSlot() ? 'Open a save to see this live. You can replay the tour from Settings.' : '';
      note.hidden = !note.textContent;
      const a = s.action ? s.action() : null;
      const actBtn = $c('.tour-act');
      actBtn.hidden = !a;
      actBtn.onclick = a ? async () => { actBtn.disabled = true; try { await a.run(); } finally { actBtn.disabled = false; } if (hasSlot()) go(at + 1); } : null;
      if (a) actBtn.textContent = a.label;
      $c('.tour-back').hidden = i === 0;
      $c('.tour-next').textContent = i === steps.length - 1 ? 'Done' : 'Next';
      $c('.tour-skip').hidden = i === steps.length - 1;
      layout();
      $c('.tour-next').focus({ preventScroll: true });
    } finally { busy = false; }
  }

  async function finish() {
    running = false;
    if (prev && hasSlot() && prev.tab && state.tab !== prev.tab) { state.tab = prev.tab; viewRender(); }
    if (prev) window.scrollTo(0, prev.scroll);
    prev = null;
    try { if (window.tld && !tld.settings().tourDone) await tld.saveSettings({ tourDone: true }); } catch (e) { console.error(e); }
  }

  function start(o) {
    if (running) return;
    if (o && o.auto && (document.querySelector('dialog[open]') || document.hidden)) return;
    build();
    steps = STEPS.filter((x) => !(x.skip && x.skip()));
    running = true;
    at = 0;
    prev = { tab: hasSlot() ? state.tab : null, scroll: window.scrollY };
    document.querySelectorAll('dialog[open]').forEach((d) => { if (d !== dlg) d.close(); });
    dlg.showModal();
    go(0);
  }

  window.tldTour = { start, steps: STEPS };
})();
