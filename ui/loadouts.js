(() => {
  'use strict';

  const tld = window.tld;
  const TD = window.tldDesktop;
  const ACT = window.tldAct;
  if (!tld || !TD || !window.tldStore) return;
  const MAX = tldStore.limits.loadouts, MAX_ROWS = tldStore.limits.loadoutItems, MAX_COPIES = 100;
  const FORMATS = ['whiteout-loadouts', 'whiteout-kits', 'tld-muokkain-kits'];
  const loaded = () => typeof state !== 'undefined' && !!state.outer;
  const invItems = () => {
    const inv = loaded() ? gs('m_Inventory_Serialized') : null;
    return inv && Array.isArray(inv.m_SerializedItems) ? inv.m_SerializedItems : null;
  };
  const supported = (id) => !!(catalogById()[id] || DATA.samples[id]);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  function qtyKind(id) {
    const sample = DATA.samples[id] || {}, comp = (catalogById()[id] || {}).comp || {};
    const has = (k) => k in sample || k in comp;
    if (has('m_StackableItemSerialized')) return { kind: 'stack', unit: 'in the stack' };
    if (has('m_LiquidItemSerialized') || has('m_WaterSupplySerialized') || has('m_KeroseneLampItemSerialized')) return { kind: 'amount', unit: 'liters' };
    if (has('m_FoodItemSerialized')) return { kind: 'amount', unit: 'kcal' };
    return { kind: 'count', unit: 'copies' };
  }

  function plan(lo) {
    const out = [], skipped = [];
    for (const r of lo.items) {
      if (!supported(r.id)) { skipped.push(r.id); continue; }
      const cond = (r.cond == null ? 100 : r.cond) / 100;
      if (qtyKind(r.id).kind === 'count') {
        const n = Math.max(0, Math.min(MAX_COPIES, Math.round(r.qty == null ? 1 : r.qty)));
        for (let i = 0; i < n; i++) out.push({ id: r.id, qty: null, cond });
      } else out.push({ id: r.id, qty: r.qty, cond });
    }
    return { out, skipped };
  }

  const summaryLine = (lo) => {
    const parts = lo.items.slice(0, 4).map((r) => itemName(r.id) + (r.qty != null && r.qty !== 1 ? ' ×' + (+r.qty.toFixed(2)) : ''));
    return plural(lo.items.length, 'item', 'items') + ': ' + parts.join(', ') + (lo.items.length > 4 ? ', …' : '');
  };

  let list = [];
  let onChange = null;
  let view = 'list';
  let draft = null;

  const dlg = h('dialog', { id: 'loadoutsDlg', 'aria-labelledby': 'loadoutsTitle' });
  const title = h('h2', { id: 'loadoutsTitle' }, 'Loadouts');
  const body = h('div', { class: 'loadouts-body' });
  const status = h('p', { class: 'dlg-status', role: 'status' });
  const say = (t, err) => { status.textContent = t || ''; status.classList.toggle('err', !!err); };
  dlg.append(h('div', { class: 'dlg' },
    h('div', { class: 'dlg-head' }, title, h('button', { type: 'button', class: 'ghost', onclick: () => dlg.close() }, 'Done')),
    body, status));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);

  const errText = (e) => (e.code === 'full' ? 'You already have the maximum number of loadouts (' + (e.max || MAX) + '). Delete one first.' : 'Could not save (' + (e.code || 'unknown') + ').');

  async function reload() {
    try { list = (await tldStore.call('kits')).kits || []; } catch (e) { list = []; say(errText(e), true); }
  }

  function uniqueName(base, except) {
    const taken = (n) => list.some((k) => k.id !== except && k.name.toLowerCase() === n.toLowerCase());
    let name = Array.from(base).slice(0, 40).join('');
    for (let i = 2; taken(name); i++) {
      const tail = ' ' + i;
      name = Array.from(base).slice(0, 40 - tail.length).join('') + tail;
    }
    return name;
  }

  function drawList() {
    view = 'list';
    title.textContent = 'Loadouts';
    const rows = list.map((lo) => h('li', { class: 'slot', 'data-loadout': lo.id },
      h('div', { class: 'slot-main' },
        h('strong', {}, lo.name),
        lo.note ? h('small', { class: 'lo-note' }, lo.note) : null,
        h('small', {}, summaryLine(lo))),
      h('div', { class: 'slot-actions' },
        loaded() ? h('button', { type: 'button', class: 'primary', onclick: () => applyKit(lo) }, 'Add to inventory') : null,
        h('button', { type: 'button', class: 'ghost', onclick: () => edit(lo) }, 'Edit'),
        h('button', { type: 'button', class: 'ghost', onclick: () => duplicate(lo) }, 'Copy'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => remove(lo) }, 'Delete'))));
    const empty = h('div', { class: 'lo-empty' },
      h('p', {}, h('strong', {}, 'No loadouts yet')),
      h('p', { class: 'muted small' }, 'A loadout is your own list of items, for example the gear for a mission. Build it from scratch, then add it to any save in one go.'),
      h('button', { type: 'button', class: 'primary', onclick: () => create() }, 'Create loadout'));
    body.replaceChildren(...[
      list.length ? h('p', { class: 'muted small' }, 'Add a loadout to the open slot in one go. Loadouts are kept in your data folder.') : null,
      list.length ? h('ul', { class: 'slots' }, rows) : empty,
      h('div', { class: 'dlg-foot' },
        list.length ? h('button', { type: 'button', class: 'primary', onclick: () => create() }, 'Create loadout') : null,
        invItems() && invItems().length ? h('button', { type: 'button', onclick: fromInventory }, 'Create from inventory') : null,
        h('button', { type: 'button', onclick: () => exportFile(list) }, 'Export to file…'),
        h('button', { type: 'button', onclick: async () => { if (await importFile()) { await reload(); drawList(); } } }, 'Import from file…'))].filter(Boolean));
  }

  function create(rows) {
    draft = { id: null, name: '', note: '', items: rows || [] };
    drawBuilder();
  }
  function edit(lo) {
    draft = { id: lo.id, name: lo.name, note: lo.note || '', items: lo.items.map((r) => ({ ...r })) };
    drawBuilder();
  }

  function fromInventory() {
    const rows = [];
    for (const it of invItems() || []) {
      const g = gearOf(it);
      if (!g) continue;
      const cond = Math.max(1, Math.round(num(g.m_NormalizedCondition) * 100));
      const q = qtyInfo(g);
      if (q) { rows.push({ id: it.m_PrefabName, qty: +q.get().toFixed(3), cond }); continue; }
      const same = rows.find((r) => r.id === it.m_PrefabName && r.cond === cond && qtyKind(r.id).kind === 'count');
      if (same) same.qty += 1; else rows.push({ id: it.m_PrefabName, qty: 1, cond });
    }
    create(rows.slice(0, MAX_ROWS));
    if (rows.length > MAX_ROWS) say('Only the first ' + MAX_ROWS + ' rows were included.');
  }

  async function duplicate(lo) {
    try {
      await tldStore.call('kit_save', { name: uniqueName(lo.name + ' copy'), note: lo.note, items: lo.items });
      await reload(); drawList();
      say('Copied: ' + lo.name);
    } catch (e) { say(errText(e), true); }
  }

  async function remove(lo) {
    if (!(await TD.ask({ title: 'Delete this loadout?', text: '“' + lo.name + '” (' + plural(lo.items.length, 'item', 'items') + ') will be deleted. This cannot be undone.', ok: 'Delete', danger: true }))) return;
    try { await tldStore.call('kit_del', { id: lo.id }); await reload(); drawList(); say('Deleted: ' + lo.name); }
    catch (e) { say(errText(e), true); }
  }

  function drawBuilder() {
    view = 'builder';
    title.textContent = draft.id ? 'Edit loadout' : 'New loadout';
    say('');
    const name = h('input', { type: 'text', maxlength: '40', value: draft.name, placeholder: 'e.g. Far Territory mission 1', autocomplete: 'off', 'aria-required': 'true' });
    const note = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Optional, e.g. what it is for' });
    note.value = draft.note;
    name.addEventListener('input', () => { draft.name = name.value; });
    note.addEventListener('input', () => { draft.note = note.value; });
    const rowsBox = h('div', { class: 'lo-rows' });
    const iconBtn = (icon, label, fn, disabled) => h('button', { type: 'button', class: 'ghost iconbtn ico', style: '--i: var(--ico-' + icon + ')', title: label, 'aria-label': label, onclick: fn, disabled: !!disabled });
    function drawRows(focusIdx) {
      if (!draft.items.length) { rowsBox.replaceChildren(h('p', { class: 'muted small pad' }, 'No items yet. Pick items below and add them to the list.')); return; }
      const tbody = h('tbody', {});
      draft.items.forEach((r, i) => {
        const nm = itemName(r.id), k = qtyKind(r.id);
        const qty = h('input', { type: 'number', min: '0', step: 'any', class: 'narrow', value: r.qty == null ? '' : r.qty, placeholder: k.kind === 'amount' ? 'auto' : '1', 'aria-label': 'Amount, ' + nm });
        qty.addEventListener('change', () => { r.qty = qty.value === '' ? null : Number(qty.value); });
        const cond = h('input', { type: 'number', min: '1', max: '100', step: '1', class: 'narrow', value: r.cond == null ? '' : r.cond, placeholder: '100', 'aria-label': 'Condition percent, ' + nm });
        cond.addEventListener('change', () => { r.cond = cond.value === '' ? null : Number(cond.value); });
        const move = (d) => () => { const j = i + d; [draft.items[i], draft.items[j]] = [draft.items[j], draft.items[i]]; drawRows(j); };
        tbody.append(h('tr', { 'data-row': i },
          h('td', {}, h('div', { class: 'iname' }, catIcon(catOf(r.id)), h('span', {}, nm), supported(r.id) ? null : h('span', { class: 'tag warn' }, 'not supported'))),
          h('td', {}, h('span', { class: 'qty' }, qty, ' ', h('small', { class: 'muted' }, k.unit))),
          h('td', {}, cond, ' %'),
          h('td', { class: 'rowbtns' },
            iconBtn('arrow-up', 'Move up: ' + nm, move(-1), i === 0),
            iconBtn('arrow-down', 'Move down: ' + nm, move(1), i === draft.items.length - 1),
            iconBtn('trash', 'Remove: ' + nm, () => { draft.items.splice(i, 1); drawRows(Math.min(i, draft.items.length - 1)); }))));
      });
      rowsBox.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Amount'), h('th', {}, 'Condition'), h('th', {}, h('span', { class: 'sr-only' }, 'Actions')))), tbody));
      if (focusIdx !== undefined && focusIdx >= 0) { const b = rowsBox.querySelector('[data-row="' + focusIdx + '"] input'); if (b) b.focus(); }
    }
    const addRow = () => {
      const id = picker.value;
      if (!id) { say('Choose an item from the list first.', true); return; }
      if (draft.items.length >= MAX_ROWS) { say('A loadout can have up to ' + MAX_ROWS + ' rows.', true); return; }
      draft.items.push({ id, qty: null, cond: null });
      drawRows();
      say('Added to the list: ' + itemName(id) + '.');
    };
    const picker = itemPicker({ state: state.pick, label: 'Items for the loadout', onPick: addRow });
    const save = async () => {
      const nm = name.value.trim();
      if (!nm) { say('Give the loadout a name.', true); name.focus(); return; }
      if (!draft.items.length) { say('Add at least one item.', true); return; }
      if (list.some((k) => k.id !== draft.id && k.name.toLowerCase() === nm.toLowerCase())) { say('A loadout with this name already exists.', true); name.focus(); return; }
      const bad = draft.items.find((r) => (r.qty != null && !(Number.isFinite(r.qty) && r.qty >= 0)) || (r.cond != null && !(Number.isFinite(r.cond) && r.cond >= 1 && r.cond <= 100)));
      if (bad) { say(itemName(bad.id) + ': the amount must be 0 or more and the condition between 1 and 100 %.', true); return; }
      try {
        await tldStore.call('kit_save', { id: draft.id || undefined, name: nm, note: note.value, items: draft.items });
        await reload(); drawList();
        say('Saved: ' + nm);
      } catch (e) { say(errText(e), true); }
    };
    body.replaceChildren(
      h('div', { class: 'pwgrid' },
        h('label', {}, 'Name', name),
        h('label', {}, 'Note', note)),
      h('h3', { class: 'lo-h' }, 'Items'),
      h('div', { class: 'card tablecard lo-table' }, rowsBox),
      h('p', { class: 'muted small' }, 'Amount is the stack size for stackable items, the number of copies for other items, and liters or calories for water, fuel and food. Empty condition means 100 %.'),
      h('details', { class: 'lo-pick', open: true }, h('summary', {}, 'Add items'), picker.el, h('div', { class: 'dlg-foot' }, h('button', { type: 'button', onclick: addRow }, 'Add to list'))),
      h('div', { class: 'dlg-foot' }, h('button', { type: 'button', class: 'primary', onclick: save }, draft.id ? 'Save changes' : 'Save loadout'), h('button', { type: 'button', onclick: drawList }, 'Cancel')));
    drawRows();
    name.focus();
  }

  async function applyKit(lo) {
    const items = invItems();
    if (!items) { say('Open a slot with an inventory first.', true); return false; }
    const { out, skipped } = plan(lo);
    const skippedNames = Array.from(new Set(skipped.map(itemName)));
    if (!out.length) { say('Nothing to add.' + (skippedNames.length ? ' Not supported in this save: ' + skippedNames.join(', ') + '.' : ''), true); return false; }
    const n0 = items.length;
    const build = () => {
      let failed = 0;
      for (const p of out) {
        try { items.push(makeItem(p.id, p.qty, p.cond)); } catch (e) { failed++; }
      }
      return { made: items.slice(n0), failed };
    };
    let sections = [], preview = { made: [], failed: 0 };
    try {
      const before = summarize(liveReader(), false);
      preview = build();
      sections = diffSections(before, summarize(liveReader(), false));
    } catch (e) { console.error(e); } finally { items.splice(n0); }
    const notes = [];
    if (skippedNames.length) notes.push('Not supported in this save, skipped: ' + skippedNames.join(', '));
    if (preview.failed) notes.push(plural(preview.failed, 'item', 'items') + ' could not be created and were skipped');
    if (notes.length) sections.push(['Skipped', notes]);
    let issues = { errors: [], warnings: [] };
    if (window.tldValidate) { try { issues = tldValidate.checkItems(preview.made, items); } catch (e) { console.error(e); } }
    const ok = await showChanges({ title: 'Add loadout: ' + lo.name, lead: 'These items will be added to the inventory:', empty: 'Nothing would be added.', sections, confirmLabel: 'Add to inventory', issues });
    if (!ok) return false;
    const { made: added, failed } = build();
    if (window.tldUndo) tldUndo.commit();
    if (onChange) onChange();
    say('Added to inventory: ' + plural(added.length, 'item', 'items') + (skipped.length || failed ? ', ' + plural(skipped.length + failed, 'row', 'rows') + ' skipped' : '') + '. The inventory now has ' + plural(items.length, 'item', 'items') + '.');
    return true;
  }

  async function exportFile(loadouts) {
    if (!tld.dialog) return;
    try {
      const all = loadouts && loadouts.length ? loadouts : (await tldStore.call('kits')).kits;
      if (!all.length) { toast('There are no loadouts to export.', 'err'); return; }
      const path = await tld.dialog.save({ title: 'Export loadouts', defaultPath: 'whiteout-loadouts.json', filters: [{ name: 'Whiteout loadouts', extensions: ['json'] }] });
      if (!path) return;
      const payload = { format: 'whiteout-loadouts', version: 1, loadouts: all.map((k) => ({ name: k.name, note: k.note || '', items: k.items.map((i) => ({ id: i.id, qty: i.qty, cond: i.cond })) })) };
      await TD.writeRaw('write_copy', new TextEncoder().encode(JSON.stringify(payload, null, 2)), { 'x-path': path });
      toast('Exported ' + plural(all.length, 'loadout', 'loadouts') + '.');
    } catch (e) { toast('Export failed: ' + TD.code(e), 'err'); }
  }

  async function importFile() {
    if (!tld.dialog) return false;
    try {
      const picked = await tld.dialog.open({ multiple: false, directory: false, title: 'Import loadouts', filters: [{ name: 'Whiteout loadouts', extensions: ['json'] }] });
      if (!picked) return false;
      const path = Array.isArray(picked) ? picked[0] : picked;
      let data;
      try { data = JSON.parse(new TextDecoder().decode(new Uint8Array(await tld.invoke('read_save', { path })))); } catch (e) { toast('This file is not a loadout file.', 'err'); return false; }
      const rows = data && FORMATS.includes(data.format) ? (Array.isArray(data.loadouts) ? data.loadouts : data.kits) : null;
      if (!Array.isArray(rows)) { toast('This file is not a loadout file.', 'err'); return false; }
      await reload();
      let added = 0, failed = 0;
      for (const k of rows.slice(0, MAX)) {
        try { await tldStore.call('kit_save', { name: uniqueName(String((k && k.name) || 'Loadout')), note: k && k.note, items: k && k.items }); added++; await reload(); }
        catch (e) { failed++; if (e.code === 'full') break; }
      }
      toast('Imported ' + plural(added, 'loadout', 'loadouts') + (failed ? ', ' + failed + ' skipped' : '') + '.', failed && !added ? 'err' : undefined);
      return added > 0;
    } catch (e) { toast('Import failed: ' + TD.code(e), 'err'); return false; }
  }

  async function open(o) {
    onChange = (o && o.onChange) || null;
    say('');
    await reload();
    drawList();
    if (!dlg.open) dlg.showModal();
  }

  addEventListener('whiteout-data', async (e) => {
    if (!dlg.open || view !== 'list' || !((e.detail && e.detail.files) || []).includes('loadouts')) return;
    await reload();
    drawList();
  });

  if (ACT) {
    ACT.add({ id: 'loadouts', title: 'Loadouts…', group: 'Tool', run: () => { if (loaded()) { window.tldMode && tldMode.set('edit'); state.tab = 'inv'; viewRender(); } return open({ onChange: () => { if (loaded() && state.tab === 'inv') viewRender(); } }); } });
    ACT.add({ id: 'loadouts-export', title: 'Export loadouts to a file…', group: 'Tool', run: () => exportFile() });
    ACT.add({ id: 'loadouts-import', title: 'Import loadouts from a file…', group: 'Tool', run: () => importFile() });
  }

  window.tldLoadouts = { open, applyKit, plan, qtyKind, exportFile, importFile, create, get view() { return view; } };
})();
