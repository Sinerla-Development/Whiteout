(() => {
  'use strict';

  const tld = window.tld;
  const TD = window.tldDesktop;
  const ACT = window.tldAct;
  if (!tld || !TD || !ACT) return;
  const loaded = () => typeof state !== 'undefined' && !!state.outer;
  const pad = (n) => String(n).padStart(2, '0');
  const settle = () => { if (window.tldUndo) tldUndo.commit(); };
  const invItems = () => {
    const inv = gs('m_Inventory_Serialized');
    return inv && Array.isArray(inv.m_SerializedItems) ? inv.m_SerializedItems : null;
  };

  function quickAdd(id) {
    const items = invItems();
    if (!items) { toast('No inventory found in this file.', 'err'); return; }
    try { items.push(makeItem(id, null, 1)); } catch (e) { toast('Could not add the item: ' + e.message, 'err'); return; }
    if (state.tab === 'inv') viewRender();
    settle();
    toast('Added to inventory: ' + itemName(id) + '. The inventory has ' + items.length + ' items.');
  }

  const openFolds = new Set();
  function fold(id, title, hint, children) {
    const d = h('details', { class: 'card fold', 'data-fold': id }, h('summary', {}, h('span', { class: 'fold-title' }, title), h('small', { class: 'muted' }, hint)), h('div', { class: 'fold-body' }, children));
    d.open = openFolds.has(id);
    d.addEventListener('toggle', () => { if (d.open) openFolds.add(id); else openFolds.delete(id); });
    return d;
  }

  const toHM = (f) => {
    const m = Math.round((((f % 1) + 1) % 1) * 1440) % 1440;
    return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  };
  const fromHM = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    return m ? Math.round(((+m[1] * 60 + +m[2]) / 1440) * 1e6) / 1e6 : null;
  };

  const auroraSection = () => gs('m_AuroraManagerSerialized');

  function auroraNext() {
    const a = auroraSection();
    if (!a) { toast('This file has no aurora data.', 'err'); return; }
    const wasOff = a.m_ForceDisable === true;
    if ('m_ForceDisable' in a) a.m_ForceDisable = false;
    a.m_ForceAuroraEarlyWindowAllowed = true;
    a.m_ForceAuroraLateWindowAllowed = true;
    a.m_HasForcedAuroraStarted = false;
    const dur = Number(a.m_ForceAuroraDurationOverride);
    if (!(dur > 0)) a.m_ForceAuroraDurationOverride = 8;
    if ('m_LastAuroraDays' in a) a.m_LastAuroraDays = 0;
    settle();
    if (state.tab === 'player') viewRender();
    toast(wasOff ? 'Aurora block removed and an aurora set for the next night.' : 'Aurora set for the next night. Save and reload the game.');
  }

  function auroraText() {
    const a = auroraSection();
    if (!a) return null;
    if (a.m_ForceDisable === true) return 'Auroras are disabled in this save.';
    const n = a.m_NumAurorasForSave;
    return typeof n === 'number' ? 'Auroras so far: ' + n + '.' : null;
  }

  function timeCard() {
    const tod = gs('m_TimeOfDay_Serialized');
    if (!tod || typeof tod.m_TimeProxy === 'undefined') return null;
    const t = num(tod.m_TimeProxy);
    const time = h('input', { type: 'time', value: toHM(t), 'aria-label': 'Time of day' });
    const setTime = (frac) => { tod.m_TimeProxy = frac; time.value = toHM(frac); settle(); };
    time.addEventListener('change', () => { const f = fromHM(time.value); if (f !== null) setTime(f); });
    const dayKeys = ['m_UniStormDayNumberProxy', 'm_UniStormDayCounterProxy'].filter((k) => k in tod);
    const day = h('input', { type: 'number', min: 1, max: 99999, step: 1, value: dayKeys.length ? num(tod[dayKeys[0]]) : '', 'aria-label': 'Day', class: 'narrow' });
    day.addEventListener('change', () => { const v = Math.round(parseFloat(day.value)); if (v >= 1) { for (const k of dayKeys) tod[k] = v; settle(); } });
    const presets = [['Morning', '06:00'], ['Noon', '12:00'], ['Evening', '18:00'], ['Midnight', '00:00']];
    const wx = gs('m_Weather_Serialized');
    const wxText = wx && ('m_WeatherStageProxy' in wx || 'm_TempHighProxy' in wx)
      ? 'Weather (read only): ' + [wx.m_WeatherStageProxy !== undefined ? 'stage ' + wx.m_WeatherStageProxy : null, 'm_TempHighProxy' in wx ? 'high ' + (+num(wx.m_TempHighProxy).toFixed(1)) + ' °C' : null, 'm_TempLowProxy' in wx ? 'low ' + (+num(wx.m_TempLowProxy).toFixed(1)) + ' °C' : null].filter(Boolean).join(', ') + '.'
      : null;
    return fold('time', 'Time and aurora', 'Time of day, day number, next aurora', [
      h('div', { class: 'row' }, h('label', {}, 'Time of day', h('small', {}, 'estimate')), time, h('span', {})),
      dayKeys.length ? h('div', { class: 'row' }, h('label', {}, 'Day'), day, h('span', {})) : null,
      h('div', { class: 'actions' }, presets.map(([label, hm]) => h('button', { class: 'ghost', onclick: () => setTime(fromHM(hm)) }, label))),
      auroraSection() ? h('div', { class: 'actions' }, h('button', { id: 'auroraBtn', onclick: auroraNext }, 'Next night: aurora')) : null,
      auroraText() ? h('p', { class: 'muted small' }, auroraText()) : null,
      wxText ? h('p', { class: 'muted small' }, wxText) : null,
      h('p', { class: 'muted small' }, 'Weather cannot be changed because the game calculates it from the time.')]);
  }

  function cougarCard() {
    const cm = gs('m_CougarManagerSerialized');
    if (!cm || typeof cm.m_IsEnabled !== 'boolean') return null;
    const names = Array.isArray(cm.m_RegionThreatLevelNames) ? cm.m_RegionThreatLevelNames : [];
    const levels = Array.isArray(cm.m_RegionThreatLevels) ? cm.m_RegionThreatLevels : [];
    const where = names.map((r, i) => r ? regionName(r) + (Number.isFinite(levels[i]) ? ' (threat ' + levels[i] + ')' : '') : '').filter(Boolean);
    const toggle = h('label', { class: 'chk' },
      h('input', { type: 'checkbox', id: 'cougarChk', checked: cm.m_IsEnabled, onchange: (e) => { cm.m_IsEnabled = e.target.checked; settle(); viewRender(); toast(e.target.checked ? 'Cougar on. Remember to save.' : 'Cougar off. Remember to save.'); } }),
      h('span', {}, 'Cougar', h('small', {}, 'Off stops the cougar in this slot.')));
    return fold('cougar', 'Cougar', cm.m_IsEnabled ? 'On' : 'Off', [
      toggle,
      where.length ? h('p', { class: 'muted small' }, 'Territory: ' + where.join(', ') + '.') : null,
      levels.some((v) => Number.isFinite(v) && v > 0) ? h('div', { class: 'actions' }, h('button', { id: 'cougarResetBtn', onclick: () => { cm.m_RegionThreatLevels = levels.map((v) => (Number.isFinite(v) ? 0 : v)); settle(); viewRender(); toast('Cougar threat reset to 0. Remember to save.'); } }, 'Reset threat to 0')) : null,
      h('p', { class: 'muted small' }, 'In the game the threat may only go down a little, not all the way to zero. Whiteout backs up the slot before saving.'),
    ]);
  }

  if (typeof TABS !== 'undefined' && TABS[0] && TABS[0][0] === 'player') {
    const original = TABS[0][2];
    TABS[0][2] = function () {
      const base = original();
      const extra = [];
      try { const t = timeCard(); if (t) extra.push(t); } catch (e) { console.error(e); }
      try { const c = cougarCard(); if (c) extra.push(c); } catch (e) { console.error(e); }
      return h('div', {}, base, h('div', { class: 'folds' }, extra));
    };
  }

  async function readOther(name) {
    const r = await TD.readStable(TD.joinPath(TD.D.dir, name));
    if (!r) throw new Error('could not read the file');
    return r.bytes;
  }

  async function copyItemsFrom(name) {
    const items = invItems();
    if (!items) { toast('The open slot has no inventory.', 'err'); return; }
    let src;
    try {
      const bytes = await readOther(name);
      const R = readerFor(parseJSON(dec(lzfDecompress(new Uint8Array(bytes)))));
      const inv = R.gs('m_Inventory_Serialized');
      src = inv && Array.isArray(inv.m_SerializedItems) ? inv.m_SerializedItems : [];
    } catch (e) { toast('Could not read the slot: ' + TD.code(e), 'err'); return; }
    if (!src.length) { toast('Slot ' + name + ' has an empty inventory.'); return; }
    const rows = src.map((it, i) => {
      const g = gearOf(it), q = g ? qtyInfo(g) : null;
      const c = h('input', { type: 'checkbox', checked: false });
      c.dataset.i = i;
      return h('label', { class: 'chk' }, c, h('span', {}, itemName(it.m_PrefabName), h('small', { class: 'muted' }, [g ? Math.round(num(g.m_NormalizedCondition) * 100) + ' %' : '', q ? +q.get().toFixed(2) + ' ' + q.label : ''].filter(Boolean).join(' · '))));
    });
    const list = h('div', { class: 'kitpick' }, rows);
    const all = h('button', { type: 'button', class: 'ghost', onclick: () => { const on = list.querySelector('input:not(:checked)') !== null; list.querySelectorAll('input').forEach((c) => { c.checked = on; }); } }, 'Select all');
    const go = h('button', { type: 'button', class: 'primary' }, 'Copy selected');
    const close = h('button', { type: 'button' }, 'Cancel');
    const dlg = h('dialog', { 'aria-label': 'Copy items' }, h('div', { class: 'dlg' },
      h('div', { class: 'dlg-head' }, h('h2', {}, 'Copy items: ' + name)),
      h('p', { class: 'muted small' }, 'Selected items are added to the inventory of the open slot. Nothing is saved until you press Save.'),
      list, h('div', { class: 'dlg-foot' }, go, all, close)));
    close.addEventListener('click', () => dlg.close());
    go.addEventListener('click', () => {
      const chosen = [...list.querySelectorAll('input:checked')].map((c) => src[+c.dataset.i]);
      if (!chosen.length) { toast('Select at least one item.', 'err'); return; }
      let n = 0;
      for (const it of chosen) {
        try {
          const copy = parseJSON(ser(it));
          const g = gearOf(copy);
          if (g) {
            g.m_InstanceIDProxy = uniqueId(items);
            const cc = compObj(g, 'm_ClothingItemSerialized');
            if (cc && cc.m_WearingProxy) cc.m_WearingProxy = false;
          }
          items.push(copy);
          n++;
        } catch (e) { console.error(e); }
      }
      dlg.close();
      if (state.tab === 'inv') viewRender();
      settle();
      toast('Copied ' + n + ' items from slot ' + name + '. Review and save.');
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  async function compareSlots() {
    if (!loaded() || !TD.D.dir) { toast('Open a slot first.', 'err'); return; }
    try { await TD.refreshList(); } catch (e) { }
    const current = TD.isLinked() ? TD.D.file.name : null;
    const others = TD.D.entries.filter((e) => e.name !== current);
    if (!others.length) { toast('There is no other slot in the folder to compare with.'); return; }
    const info = (e) => { const m = TD.D.info.get(e.name); return (m && m.meta && m.meta.title ? m.meta.title + ' · ' : '') + e.name + ' · ' + TD.fmtDate(e.modified); };
    const sel = h('select', { 'aria-label': 'Other slot' }, others.map((e) => h('option', { value: e.name }, info(e))));
    const cmp = h('button', { type: 'button', class: 'primary' }, 'Compare with open');
    const cp = h('button', { type: 'button' }, 'Copy items…');
    const close = h('button', { type: 'button' }, 'Close');
    const dlg = h('dialog', { 'aria-label': 'Compare slots' }, h('div', { class: 'dlg' },
      h('div', { class: 'dlg-head' }, h('h2', {}, 'Compare slots')),
      h('p', { class: 'muted small' }, 'Choose a slot to compare with the open one. The comparison shows what differs in the open slot.'),
      h('label', { class: 'setrow' }, h('span', {}, 'Other slot'), sel),
      h('div', { class: 'dlg-foot' }, cmp, cp, close)));
    close.addEventListener('click', () => dlg.close());
    cmp.addEventListener('click', async () => {
      try {
        const bytes = await readOther(sel.value);
        const sections = diffSections(TD.summaryOf(bytes), summarize(liveReader(), false));
        dlg.close();
        showChanges({ title: 'Slots: ' + sel.value + ' and open', lead: sel.value + ' → open slot:', empty: 'No visible differences between the slots.', sections, confirmLabel: null });
      } catch (e) { toast('Comparison failed: ' + TD.code(e), 'err'); }
    });
    cp.addEventListener('click', () => { const name = sel.value; dlg.close(); copyItemsFrom(name); });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  ACT.add({ id: 'aurora-next', title: 'Next night: aurora', group: 'Tool', when: () => loaded() && !!auroraSection(), run: auroraNext });
  ACT.add({ id: 'compare', title: 'Compare slots…', group: 'Tool', when: () => loaded() && !!TD.D.dir, run: compareSlots });

  window.tldTools = { quickAdd, compareSlots, copyItemsFrom, auroraNext };
})();
