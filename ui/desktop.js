(() => {
  'use strict';

  const tld = window.tld;
  const recentKeys = new Map();
  window.tldDedupe = (key) => {
    const t = Date.now();
    if (t - (recentKeys.get(key) || 0) < 400) return false;
    recentKeys.set(key, t);
    return true;
  };
  const $ = (s, el) => (el || document).querySelector(s);
  const POLL_MS = 4000, GAME_POLL_MS = 5000;
  const SKIP_EXT = /\.(png|jpe?g|gif|txt|log|json|xml|zip|bak|varmuuskopio|tmp|ini|cfg|md|exe|dll|dat\.old)$/i;

  const D = {
    dir: null, tried: [], auto: true, listError: null, watchError: null,
    entries: [], hidden: 0, info: new Map(),
    running: null, procName: '', changes: 0,
    file: null,
    prev: null,
    pending: null,
    ack: null,
    blockedBytes: null,
    updating: false, listing: null,
    lastBackup: null, scanned: false, savedTimer: 0,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const basename = (p) => String(p).split(/[\\/]/).pop();
  const dirOf = (p) => String(p).replace(/[\\/][^\\/]*$/, '');
  const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
  const joinPath = (dir, name) => dir + (dir.includes('\\') ? '\\' : '/') + name;
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const ago = (ms) => {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return fmtDate(ms);
  };
  const code = (e) => String(e && e.message ? e.message : e);
  const sameBytes = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  function ask(o) {
    return new Promise((resolve) => {
      let result = false;
      const yes = h('button', { class: o.danger ? 'danger' : 'primary' }, o.ok || 'Continue');
      const no = h('button', {}, o.cancel || 'Cancel');
      const dlg = h('dialog', { 'aria-label': o.title },
        h('div', { class: 'dlg' },
          h('div', { class: 'dlg-head' }, h('h2', {}, o.title)),
          h('p', {}, o.text),
          h('div', { class: 'dlg-foot' }, yes, no)));
      yes.addEventListener('click', () => { result = true; dlg.close(); });
      no.addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      document.body.append(dlg);
      dlg.showModal();
      no.focus();
    });
  }

  function askText(o) {
    return new Promise((resolve) => {
      let result = null;
      const input = h('input', { type: 'text', maxlength: String(o.max || 60), value: o.value || '', placeholder: o.placeholder || '', autocomplete: 'off', spellcheck: 'false' });
      const yes = h('button', { class: 'primary', type: 'submit' }, o.ok || 'Save');
      const no = h('button', { type: 'button' }, 'Cancel');
      const form = h('form', { method: 'dialog' }, h('label', { class: 'setrow' }, h('span', {}, o.label || ''), input), h('div', { class: 'dlg-foot' }, yes, no));
      const dlg = h('dialog', { 'aria-label': o.title }, h('div', { class: 'dlg' }, h('div', { class: 'dlg-head' }, h('h2', {}, o.title)), form));
      form.addEventListener('submit', (e) => { e.preventDefault(); result = input.value.trim(); dlg.close(); });
      no.addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      document.body.append(dlg);
      dlg.showModal();
      input.focus();
      input.select();
    });
  }

  function choose(o) {
    return new Promise((resolve) => {
      let result = null;
      const btns = o.buttons.map(([id, label, cls]) => {
        const b = h('button', { type: 'button', class: cls || '' }, label);
        b.addEventListener('click', () => { result = id; dlg.close(); });
        return b;
      });
      const dlg = h('dialog', { 'aria-label': o.title },
        h('div', { class: 'dlg' },
          h('div', { class: 'dlg-head' }, h('h2', {}, o.title)),
          ...(Array.isArray(o.text) ? o.text : [o.text]).map((t) => h('p', {}, t)),
          h('div', { class: 'dlg-foot' }, btns)));
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      document.body.append(dlg);
      dlg.showModal();
      btns[btns.length - 1].focus();
    });
  }

  function slotMeta(bytes) {
    try {
      const text = dec(lzfDecompress(bytes));
      if (text.charCodeAt(0) !== 123 || text.indexOf('"m_Dict"') < 0 || !/"global"\s*:/.test(text)) return null;
      const pick = (key) => {
        const m = new RegExp('"' + key + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")').exec(text);
        if (!m) return '';
        try { return String(JSON.parse(m[1])); } catch (e) { return ''; }
      };
      return { title: pick('m_DisplayName') || pick('m_InternalName'), mode: pick('m_GameMode'), stamp: pick('m_Timestamp') };
    } catch (e) { return null; }
  }

  function summaryOf(bytes) {
    return summarize(readerFor(parseJSON(dec(lzfDecompress(new Uint8Array(bytes))))), false);
  }

  function isDirty() {
    if (!state.outer) return false;
    try { return Object.keys(state.sec).some((k) => ser(state.sec[k]) !== state.origText[k]); } catch (e) { return true; }
  }
  async function confirmDiscard(title) {
    if (!isDirty()) return true;
    document.querySelectorAll('dialog[open]').forEach((d) => { if (!d.classList.contains('tour')) d.close(); });
    return ask({ title, text: 'The open slot has unsaved changes. They will be lost.', ok: title.startsWith('Quit') ? 'Quit' : 'Close', danger: true });
  }
  function markClean() {
    for (const k of Object.keys(state.sec)) state.origText[k] = ser(state.sec[k]);
  }
  const isLinked = () => !!(D.file && state.outer && state.origBytes === D.file.bytes);

  async function readStable(path) {
    for (let i = 0; i < 6; i++) {
      try {
        const a = await tld.invoke('stat_file', { path });
        const bytes = new Uint8Array(await tld.invoke('read_save', { path }));
        const b = await tld.invoke('stat_file', { path });
        if (a.size === b.size && a.modified === b.modified && bytes.length === b.size) return { bytes, stamp: b };
      } catch (e) { }
      await sleep(400);
    }
    return null;
  }

  async function writeRaw(cmd, bytes, headers) {
    const enc = {};
    for (const k of Object.keys(headers)) enc[k] = encodeURIComponent(headers[k]);
    return tld.invoke(cmd, bytes, { headers: enc });
  }

  function writeErrText(c) {
    if (c === 'game_running') return 'The game is running, so the slot was not written.';
    if (c === 'changed') return 'The file has changed since you opened it.';
    if (c.startsWith('io:')) return 'Write failed (' + c.slice(3).trim() + ').';
    return 'Save failed (' + c + ').';
  }

  async function resolveDir() {
    try { await findDir(); } finally { D.scanned = true; }
  }
  async function findDir() {
    const s = tld.settings();
    D.tried = [];
    if (s.saveDir) { D.dir = s.saveDir; D.auto = false; return; }
    D.auto = true;
    try {
      const r = await tld.invoke('find_save_dir');
      D.tried = r.tried || [];
      D.dir = r.found || null;
    } catch (e) { D.dir = null; }
  }

  async function startWatch() {
    D.watchError = null;
    try {
      if (D.dir) await tld.invoke('watch_dir', { dir: D.dir });
      else await tld.invoke('unwatch_dir');
    } catch (e) { D.watchError = code(e); }
  }

  async function classify(entry) {
    const old = D.info.get(entry.name);
    if (old && old.modified === entry.modified && old.size === entry.size) return;
    let slot = false, meta = null;
    if (!SKIP_EXT.test(entry.name) && !/^profile_/i.test(entry.name) && entry.size > 100 && entry.size < 64 * 1048576) {
      try {
        const bytes = new Uint8Array(await tld.invoke('read_save', { path: joinPath(D.dir, entry.name) }));
        meta = slotMeta(bytes);
        slot = !!meta;
      } catch (e) { return; }
    }
    D.info.set(entry.name, { modified: entry.modified, size: entry.size, slot, meta });
  }

  function refreshList() {
    if (D.listing) return D.listing;
    D.listing = (async () => {
      try {
        let list = [];
        if (D.dir) {
          try { list = await tld.invoke('list_saves', { dir: D.dir }); D.listError = null; }
          catch (e) { D.listError = code(e); list = []; }
        }
        const names = new Set(list.map((e) => e.name));
        for (const k of Array.from(D.info.keys())) if (!names.has(k)) D.info.delete(k);
        for (const e of list) await classify(e);
        const slots = list.filter((e) => D.info.get(e.name) && D.info.get(e.name).slot);
        slots.sort((a, b) => b.modified - a.modified);
        D.entries = slots;
        D.hidden = list.length - slots.length;
        renderAll();
        await checkOpenFile(list);
      } finally { D.listing = null; }
    })();
    return D.listing;
  }

  function showBar(text, o) {
    o = o || {};
    $('#liveText').textContent = text;
    $('#liveDiffBtn').hidden = !o.diff;
    $('#liveReloadBtn').hidden = !o.reload;
    $('#liveKeepBtn').hidden = !o.keep;
    $('#liveBar').classList.toggle('warn', !!o.warn);
    $('#liveBar').hidden = false;
  }
  function hideBar() { $('#liveBar').hidden = true; }

  async function checkOpenFile(list) {
    if (!isLinked()) return;
    const e = list.find((x) => x.name === D.file.name);
    if (!e) return;
    const st = D.file.stamp;
    if (e.modified === st.modified && e.size === st.size) return;
    if (D.ack && e.modified === D.ack.modified && e.size === D.ack.size) return;
    await onExternalUpdate();
  }

  async function autoBackup(path) {
    if (tld.settings().autoBackup !== false) {
      try { await tld.invoke('backup_now', { path, auto: true, label: null }); } catch (e) { }
    }
    refreshBackupInfo();
  }

  async function refreshBackupInfo() {
    if (!isLinked()) { D.lastBackup = null; renderSaveInfo(); return; }
    const path = D.file.path;
    try {
      const list = await tld.invoke('list_backups', { path });
      if (!isLinked() || D.file.path !== path) return;
      D.lastBackup = list.reduce((m, b) => Math.max(m, Number(b.modified) || 0), 0) || null;
    } catch (e) { D.lastBackup = null; }
    renderSaveInfo();
  }

  function renderSaveInfo() {
    const box = $('#saveInfo'), txt = $('#saveInfoText'), rev = $('#reviewBtn');
    if (!box) return;
    const n = D.changes;
    rev.hidden = n === 0;
    rev.textContent = 'Review ' + n + (n === 1 ? ' change' : ' changes');
    txt.textContent = isLinked() ? (D.lastBackup ? 'Last backup ' + ago(D.lastBackup) : 'A backup is made when you save') : '';
    box.hidden = !state.outer || (n === 0 && !txt.textContent);
  }

  function reviewChanges() {
    if (!state.outer || !state.base) return;
    try {
      const issues = window.tldValidate ? tldValidate.checkSave() : null;
      showChanges({ title: 'Review changes', lead: 'These changes are not saved yet:', empty: 'No changes compared to the last save.', sections: diffSections(state.base, summarize(liveReader(), state.cheat)), confirmLabel: null, issues });
    } catch (e) { toast('Could not list the changes: ' + e.message, 'err'); }
  }
  $('#reviewBtn').addEventListener('click', reviewChanges);
  setInterval(() => { if (!document.hidden) renderSaveInfo(); }, 30000);

  const TESTED = { version: 100, changelist: 189457 };

  function formatCheck() {
    if (!state.outer) return;
    const version = Number(state.outer.m_Version), changelist = Number(state.outer.m_Changelist);
    const missing = ['m_Inventory_Serialized', 'm_PlayerManagerSerialized', 'm_Condition_Serialized'].filter((k) => { try { return !gs(k); } catch (e) { return true; } });
    if (missing.length) toast('This save has an unexpected structure (' + missing.length + ' parts missing). Create a backup before editing.', 'warn');
    else if (version > TESTED.version || changelist > TESTED.changelist) {
      toast('This save is from a newer game build (' + changelist + ') than Whiteout was tested with (' + TESTED.changelist + '). The save format may have changed, so back up first and review your changes carefully.', 'warn');
    }
  }

  async function onExternalUpdate() {
    if (D.updating || !isLinked()) return;
    D.updating = true;
    try {
      const r = await readStable(D.file.path);
      if (!r || !slotMeta(r.bytes)) return;
      if (sameBytes(r.bytes, D.file.bytes)) { D.file.stamp = r.stamp; return; }
      autoBackup(D.file.path);
      if (isDirty()) {
        D.pending = r;
        showBar('The game saved at ' + fmtTime(r.stamp.modified) + '. This slot has unsaved changes.', { reload: true, keep: true, warn: true });
        return;
      }
      if (!tld.settings().liveReload) {
        D.pending = r;
        showBar('The game saved at ' + fmtTime(r.stamp.modified) + '.', { reload: true });
        return;
      }
      applyExternal(r);
    } finally { D.updating = false; }
  }

  function applyExternal(r) {
    const prev = D.file.bytes;
    const sy = window.scrollY;
    const wasMap = document.body.classList.contains('mode-map');
    const mode = window.tldMode;
    window.tldMode = null;
    try { openBytes(r.bytes, D.file.name, null); } finally { window.tldMode = mode; }
    if (state.origBytes !== r.bytes) return;
    D.file = { path: D.file.path, name: D.file.name, bytes: r.bytes, stamp: r.stamp };
    D.prev = prev;
    D.pending = null;
    D.ack = null;
    if (wasMap && mode && mode.refresh) mode.refresh(); else window.scrollTo(0, sy);
    showBar('Updated from the game at ' + fmtTime(r.stamp.modified) + '.', { diff: true });
    toast('Slot updated.');
    formatCheck();
    if (window.tldHooks && tldHooks.opened) tldHooks.opened(true);
    syncUi();
  }

  $('#liveCloseBtn').addEventListener('click', hideBar);
  $('#liveReloadBtn').addEventListener('click', () => { if (D.pending && isLinked()) applyExternal(D.pending); else hideBar(); });
  $('#liveKeepBtn').addEventListener('click', () => {
    if (D.pending) D.ack = { modified: D.pending.stamp.modified, size: D.pending.stamp.size };
    D.pending = null;
    hideBar();
  });
  $('#liveDiffBtn').addEventListener('click', () => {
    if (!D.prev || !isLinked()) return;
    try {
      showChanges({ title: 'What changed in the game', lead: 'Previous save → latest save:', empty: 'No visible differences.', sections: diffSections(summaryOf(D.prev), summaryOf(D.file.bytes)), confirmLabel: null });
    } catch (e) { toast('Could not compare the versions: ' + e.message, 'err'); }
  });

  async function openPath(path) {
    const r = await readStable(path);
    if (!r) { toast('Could not read the file. The game may be writing it right now, try again in a moment.', 'err'); return false; }
    if (!slotMeta(r.bytes)) { toast('This is not a slot file. Pick something like sandbox1.', 'err'); return false; }
    if (state.outer && isDirty() && !(await ask({ title: 'Discard changes?', text: 'Unsaved changes in the open slot will be lost.', ok: 'Discard and open', danger: true }))) return false;
    const name = basename(path);
    openBytes(r.bytes, name, null);
    if (state.origBytes !== r.bytes) return false;
    D.file = { path, name, bytes: r.bytes, stamp: r.stamp };
    tld.invoke('guard_track', { path, offsetMin: -new Date().getTimezoneOffset() }).catch(() => { });
    D.prev = null; D.pending = null; D.ack = null;
    hideBar();
    D.lastBackup = null;
    syncUi();
    autoBackup(path);
    formatCheck();
    if (window.tldMode && tldMode.slotOpened) tldMode.slotOpened();
    if (window.tldHooks && tldHooks.opened) tldHooks.opened(false);
    return true;
  }

  async function pickNative() {
    if (!tld.dialog) return;
    try {
      const path = await tld.dialog.open({ multiple: false, directory: false, title: 'Choose a slot file', defaultPath: D.dir || undefined });
      if (path) await openPath(Array.isArray(path) ? path[0] : path);
    } catch (e) { toast('Could not open the file: ' + code(e), 'err'); }
  }

  function onSaved(bytes, stamp) {
    state.origBytes = bytes;
    D.file = { path: D.file.path, name: D.file.name, bytes, stamp };
    D.prev = null; D.pending = null; D.ack = null;
    rebase();
    markClean();
    hideBar();
    flashSaved();
    refreshBackupInfo();
    syncUi();
    if (window.tldHooks && tldHooks.saved) tldHooks.saved();
    refreshList().catch(() => { });
  }

  function flashSaved() {
    const b = $('#saveBtn');
    b.classList.add('saved');
    clearTimeout(D.savedTimer);
    D.savedTimer = setTimeout(() => { b.classList.remove('saved'); syncUi(); }, 2400);
  }

  async function saveToFile() {
    if (!state.outer || D.saving) return;
    D.saving = true;
    try { await saveToFileNow(); } finally { D.saving = false; }
  }
  async function saveToFileNow() {
    if (!isLinked()) { await saveCopyNow(); return; }
    if (!(await confirmChanges())) return;
    let bytes;
    try { bytes = buildOutput(); } catch (e) { toast('Save failed: ' + e.message, 'err'); return; }
    const s = tld.settings();
    const attempt = async (expected) => {
      const stamp = await writeRaw('write_save', bytes, {
        'x-path': D.file.path,
        'x-expected-size': String(expected.size),
        'x-expected-modified': String(expected.modified),
        'x-allow-running': s.allowRunningWrite ? '1' : '0',
        'x-process-name': s.processName || '',
      });
      onSaved(bytes, stamp);
      toast('Saved, backup made.');
    };
    try {
      await attempt(D.file.stamp);
    } catch (e) {
      const c = code(e);
      if (c === 'game_running') { D.blockedBytes = bytes; D.running = true; renderChip(); $('#blockDlg').showModal(); }
      else if (c === 'changed') {
        const ok = await ask({ title: 'The game saved a newer version', text: 'The game saved a newer version after you opened this slot. If you continue, it will be replaced with your changes. A copy of it stays in your backups.', ok: 'Overwrite', danger: true });
        if (!ok) return;
        try { await attempt(await tld.invoke('stat_file', { path: D.file.path })); }
        catch (e2) { toast(writeErrText(code(e2)), 'err'); }
      } else toast(writeErrText(c), 'err');
    }
  }

  async function saveCopy(bytesIn) {
    if (D.saving) return;
    D.saving = true;
    try { await saveCopyNow(bytesIn); } finally { D.saving = false; }
  }
  async function saveCopyNow(bytesIn) {
    if (!tld.dialog) return;
    let bytes = bytesIn;
    try {
      if (!bytes) {
        if (!state.outer || !(await confirmChanges())) return;
        bytes = buildOutput();
      }
      const path = await tld.dialog.save({ title: 'Save a copy', defaultPath: state.fileName || 'slot' });
      if (!path) return;
      await writeRaw('write_copy', bytes, { 'x-path': path });
      toast('Copy saved: ' + path);
    } catch (e) { toast(writeErrText(code(e)), 'err'); }
  }
  $('#blockCopyBtn').addEventListener('click', async () => { $('#blockDlg').close(); await saveCopy(D.blockedBytes); });

  const PART_GROUPS = [
    ['inv', 'Inventory', ['m_Inventory_Serialized']],
    ['skills', 'Skills', ['m_SkillsManagerSerialized', 'm_PlayerSkillsSerialized']],
    ['needs', 'Needs (health, calories, thirst, fatigue, cold)', ['m_Condition_Serialized', 'm_Hunger_Serialized', 'm_Thirst_Serialized', 'm_Fatigue_Serialized', 'm_Freezing_Serialized']],
    ['aff', 'Afflictions', AFFLICTIONS.map((a) => a[0])],
    ['pos', 'Location', null],
  ];

  function restoreParts(bytes, ids) {
    const R = readerFor(parseJSON(dec(lzfDecompress(new Uint8Array(bytes)))));
    const done = [];
    for (const [id, label, keys] of PART_GROUPS) {
      if (!ids.includes(id)) continue;
      if (id === 'pos') {
        const pm = R.gs('m_PlayerManagerSerialized'), boot = R.sec('boot');
        if (!pm || !boot || !Array.isArray(pm.m_SaveGamePosition) || !boot.m_SceneName) continue;
        const [x, y, z] = pm.m_SaveGamePosition.map((v) => num(v));
        applyTeleport(boot.m_SceneName, x, y, z);
        if (pm.m_SaveGameRotation) gs('m_PlayerManagerSerialized').m_SaveGameRotation = JSON.parse(ser(pm.m_SaveGameRotation));
        done.push(label);
        continue;
      }
      let any = false;
      for (const k of keys) {
        const src = R.gs(k);
        if (src === undefined) continue;
        G()[k] = ser(src);
        any = true;
      }
      if (any) done.push(label);
    }
    return done;
  }

  async function partialRestore(entry, bytes, when) {
    if (!(isLinked() && D.file.name === entry.name)) { toast('Open the slot ' + entry.name + ' first, then you can restore parts into it.', 'err'); return; }
    const dlg = $('#partDlg'), list = $('#partList');
    $('#partLead').textContent = 'Choose which parts to copy from the backup of ' + when + ' into the open slot. Nothing is saved until you press Save.';
    list.replaceChildren(...PART_GROUPS.map(([id, label]) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', value: id }), h('span', {}, label))));
    const chosen = await new Promise((resolve) => {
      let out = null;
      const yes = $('#partOk'), no = $('#partCancel');
      const cleanup = () => { yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); dlg.removeEventListener('close', onClose); };
      const onYes = () => { out = [...list.querySelectorAll('input:checked')].map((i) => i.value); dlg.close(); };
      const onNo = () => dlg.close();
      const onClose = () => { cleanup(); resolve(out); };
      yes.addEventListener('click', onYes); no.addEventListener('click', onNo); dlg.addEventListener('close', onClose);
      dlg.showModal();
    });
    if (!chosen || !chosen.length) return;
    if (window.tldHooks && tldHooks.before) tldHooks.before();
    let done;
    try { done = restoreParts(bytes, chosen); } catch (e) { toast('Could not restore parts: ' + code(e), 'err'); return; }
    if (!done.length) { toast('The backup did not contain the selected parts.', 'err'); return; }
    if (window.tldHooks && tldHooks.after) tldHooks.after('Partial restore');
    $('#bakDlg').close();
    toast('Restored from backup: ' + done.join(', ') + '. Review and save.');
  }

  async function openBackups(entry) {
    const path = joinPath(D.dir, entry.name);
    const list = $('#bakList'), status = $('#bakStatus');
    const say = (t, err) => { status.textContent = t || ''; status.classList.toggle('err', !!err); };
    $('#bakTitle').textContent = 'Backups: ' + entry.name;
    say('');
    const nowBtn = $('#bakNowBtn');
    nowBtn.onclick = async () => {
      const label = await askText({ title: 'New backup', label: 'Name (optional)', ok: 'Create backup', placeholder: 'e.g. before the mountain' });
      if (label === null) return;
      try {
        const id = await tld.invoke('backup_now', { path, auto: false, label: label || null });
        if (id === null) say('File not found.', true);
        await fill();
      } catch (e) { say('Could not create the backup: ' + code(e), true); }
    };
    async function fill() {
      list.replaceChildren();
      let backups = [];
      try { backups = await tld.invoke('list_backups', { path }); } catch (e) { say('Could not read backups: ' + code(e), true); }
      if (!backups.length) list.append(h('li', { class: 'empty muted' }, 'No backups yet. They are created when you save a slot or the game saves.'));
      for (const b of backups) list.append(row(b));
    }
    function row(b) {
      const when = fmtDate(b.modified);
      const open = async () => {
        const bytes = new Uint8Array(await tld.invoke('read_backup', { path, id: b.id }));
        $('#bakDlg').close();
        if (state.outer && isDirty() && !(await ask({ title: 'Discard changes?', text: 'The open slot has unsaved changes.', ok: 'Discard and open', danger: true }))) return;
        openBytes(bytes, entry.name + ' (backup ' + when + ')', null);
      };
      const compare = async () => {
        say('Comparing…');
        try {
          const old = new Uint8Array(await tld.invoke('read_backup', { path, id: b.id }));
          const cur = await readStable(path);
          if (!cur) { say('Could not read the current file.', true); return; }
          say('');
          showChanges({ title: 'Changes: ' + entry.name, lead: 'Backup ' + when + ' → current file:', empty: 'The backup and the current file are identical.', sections: diffSections(summaryOf(old), summaryOf(cur.bytes)), confirmLabel: null });
        } catch (e) { say('Could not compare the versions: ' + code(e), true); }
      };
      const restore = async () => {
        if (!(await ask({ title: 'Restore this backup?', text: 'Slot ' + entry.name + ' will be replaced with the backup of ' + when + '. The current file is backed up first.', ok: 'Restore', danger: true }))) return;
        try {
          const bytes = new Uint8Array(await tld.invoke('read_backup', { path, id: b.id }));
          const cur = await tld.invoke('stat_file', { path }).catch(() => null);
          const s = tld.settings();
          const headers = { 'x-path': path, 'x-allow-running': s.allowRunningWrite ? '1' : '0', 'x-process-name': s.processName || '' };
          if (cur) { headers['x-expected-size'] = String(cur.size); headers['x-expected-modified'] = String(cur.modified); }
          await writeRaw('write_save', bytes, headers);
          say('Restored: ' + entry.name);
          if (isLinked() && D.file.name === entry.name) { D.file.stamp = { size: -1, modified: -1 }; await onExternalUpdate(); }
          refreshList().catch(() => { });
        } catch (e) { say(writeErrText(code(e)), true); }
      };
      const part = async () => {
        try { await partialRestore(entry, await tld.invoke('read_backup', { path, id: b.id }), when); }
        catch (e) { say('Could not read the backup: ' + code(e), true); }
      };
      const rename = async () => {
        const label = await askText({ title: 'Rename backup', label: 'Name', value: b.label || '', ok: 'Save' });
        if (label === null) return;
        try { await tld.invoke('backup_set', { path, id: b.id, label: label || null, locked: !!b.locked }); await fill(); } catch (e) { say('Could not save the name: ' + code(e), true); }
      };
      const lock = async () => {
        try { await tld.invoke('backup_set', { path, id: b.id, label: b.label || null, locked: !b.locked }); await fill(); } catch (e) { say('Could not change the lock: ' + code(e), true); }
      };
      const del = async () => {
        if (!(await ask({ title: 'Delete this backup?', text: (b.label ? '“' + b.label + '”, ' : '') + when + '. This cannot be undone.', ok: 'Delete', danger: true }))) return;
        try { await tld.invoke('backup_delete', { path, id: b.id }); await fill(); } catch (e) { say('Delete failed: ' + code(e), true); }
      };
      return h('li', { class: 'slot' },
        h('div', { class: 'slot-main' },
          h('strong', {}, b.label || when, b.locked ? h('span', { class: 'tag' }, 'locked') : null, b.auto ? h('span', { class: 'tag' }, 'automatic') : null),
          h('small', {}, (b.label ? when + ' · ' : '') + fmtSize(b.size))),
        h('div', { class: 'slot-actions' },
          h('button', { onclick: open }, 'Open'),
          h('button', { class: 'ghost', onclick: compare }, 'Compare with current'),
          h('button', { class: 'ghost', onclick: part, title: 'Copy only the selected parts into the open slot' }, 'Restore part…'),
          h('button', { class: 'ghost danger', onclick: restore }, 'Restore'),
          h('button', { class: 'ghost', onclick: rename }, 'Rename'),
          h('button', { class: 'ghost', onclick: lock, 'aria-pressed': String(!!b.locked) }, b.locked ? 'Unlock' : 'Lock'),
          b.locked ? null : h('button', { class: 'ghost danger', onclick: del }, 'Delete')));
    }
    await fill();
    $('#bakDlg').showModal();
  }

  async function fillBackups() {
    const box = $('#bakSlots'), usage = $('#bakUsage');
    $('#keepBackups').value = String(tld.settings().keepBackups == null ? 20 : tld.settings().keepBackups);
    tld.invoke('backup_usage').then((u) => {
      usage.textContent = u.files ? 'Backups use ' + fmtSize(u.bytes) + ' in ' + u.files + (u.files === 1 ? ' file.' : ' files.') : 'No backups yet.';
    }).catch((e) => { usage.textContent = 'Could not read the backup folder: ' + code(e); });
    if (!D.dir || !D.entries.length) { box.replaceChildren(h('p', { class: 'muted small' }, 'Slots from the save folder appear here with their backups.')); return; }
    const open = new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.slot));
    const parts = await Promise.all(D.entries.map(async (entry) => {
      const path = joinPath(D.dir, entry.name);
      let list = [];
      try { list = await tld.invoke('list_backups', { path }); } catch (e) { list = []; }
      return { entry, path, list };
    }));
    box.replaceChildren(...parts.map(({ entry, path, list }) => {
      const info = D.info.get(entry.name);
      const title = (info && info.meta && info.meta.title) || entry.name;
      const total = list.reduce((n, b) => n + (Number(b.size) || 0), 0);
      const rows = list.map((b) => {
        const when = fmtDate(b.modified);
        const rename = async () => {
          const label = await askText({ title: 'Rename backup', label: 'Name or note', value: b.label || '', ok: 'Save', placeholder: 'e.g. before the mountain' });
          if (label === null) return;
          try { await tld.invoke('backup_set', { path, id: b.id, label: label || null, locked: !!b.locked }); await fillBackups(); } catch (e) { toast('Could not save the name: ' + code(e), 'err'); }
        };
        const del = async () => {
          if (!(await ask({ title: 'Delete this backup?', text: (b.label ? '“' + b.label + '”, ' : '') + title + ', ' + when + '. This cannot be undone.', ok: 'Delete', danger: true }))) return;
          try { await tld.invoke('backup_delete', { path, id: b.id }); await fillBackups(); } catch (e) { toast('Delete failed: ' + code(e), 'err'); }
        };
        return h('li', { class: 'slot' },
          h('div', { class: 'slot-main' },
            h('strong', {}, b.label || when, b.locked ? h('span', { class: 'tag' }, 'locked') : null, b.auto ? h('span', { class: 'tag' }, 'automatic') : null),
            h('small', {}, [b.label ? when : null, fmtSize(b.size)].filter(Boolean).join(' · '))),
          h('div', { class: 'slot-actions' },
            h('button', { type: 'button', class: 'ghost', onclick: rename }, 'Rename'),
            b.locked ? null : h('button', { type: 'button', class: 'ghost danger', onclick: del }, 'Delete')));
      });
      return h('details', { class: 'bakslot', 'data-slot': entry.name, open: open.has(entry.name) },
        h('summary', {}, h('strong', {}, title), h('small', { class: 'muted' }, ' ' + (list.length === 1 ? '1 backup' : list.length + ' backups') + (total ? ' · ' + fmtSize(total) : ''))),
        list.length ? h('ul', { class: 'slots' }, rows) : h('p', { class: 'muted small' }, 'No backups yet.'),
        h('div', { class: 'dlg-foot' }, h('button', { type: 'button', onclick: () => { $('#settingsDlg').close(); openBackups(entry); } }, 'Restore or compare…')));
    }));
  }

  function slotRow(e, withBackups) {
    const info = D.info.get(e.name);
    const meta = info && info.meta ? info.meta : {};
    const open = isLinked() && D.file.name === e.name;
    return h('li', { class: 'slot' },
      h('div', { class: 'slot-main' },
        h('strong', {}, meta.title || e.name), open ? h('span', { class: 'tag' }, 'open') : null,
        h('small', {}, [e.name, meta.mode, fmtSize(e.size), 'updated ' + ago(e.modified)].filter(Boolean).join(' · '))),
      h('div', { class: 'slot-actions' },
        h('button', { onclick: async () => { if (await openPath(joinPath(D.dir, e.name))) $('#slotsDlg').close(); } }, 'Open'),
        withBackups ? h('button', { class: 'ghost', onclick: () => openBackups(e) }, 'Backups') : null));
  }

  function renderSlots() {
    const dlg = $('#slotsDlg');
    if (!dlg.open) return;
    $('#slotCount').textContent = String(D.entries.length);
    $('#slotsPath').textContent = D.dir ? D.dir + (D.auto ? ' (detected automatically)' : '') : 'Folder not found. Choose it manually.';
    const list = $('#slotList');
    list.replaceChildren();
    if (!D.entries.length) {
      list.append(h('li', { class: 'empty muted' }, D.dir ? 'No slots found in the folder.' : 'Tried: ' + (D.tried.join(', ') || 'nothing') + '.'));
    }
    for (const e of D.entries) list.append(slotRow(e, true));
    const st = $('#slotsStatus');
    st.classList.toggle('err', !!D.listError);
    st.textContent = D.listError ? 'Could not read the folder: ' + D.listError : (D.hidden ? 'The folder also contains ' + D.hidden + ' other files, e.g. the profile.' : '');
  }

  function renderQuick() {
    const box = $('#quickSaves');
    if (state.outer || !D.scanned) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;
    const latest = D.entries[0];
    if (latest) {
      const titleOf = (e) => { const i = D.info.get(e.name); return (i && i.meta && i.meta.title) || e.name; };
      const meta = (D.info.get(latest.name) || {}).meta || {};
      const others = D.entries.slice(1, 4);
      box.replaceChildren(
        h('div', { class: 'startcard' },
          h('p', { class: 'eyebrow' }, 'Latest save'),
          h('h2', {}, titleOf(latest)),
          h('p', { class: 'muted' }, [meta.mode, 'updated ' + ago(latest.modified)].filter(Boolean).join(' · ')),
          h('button', { class: 'primary big', onclick: () => openPath(joinPath(D.dir, latest.name)) }, 'Open this save')),
        others.length ? h('p', { class: 'startmore muted' }, 'Other slots: ', ...others.map((e) => h('button', { class: 'linkbtn', onclick: () => openPath(joinPath(D.dir, e.name)) }, titleOf(e)))) : null);
      return;
    }
    if (D.dir && !D.listError) {
      box.replaceChildren(h('div', { class: 'startcard' },
        h('h2', {}, 'No saves yet'),
        h('p', { class: 'muted' }, 'Whiteout is watching this folder, but there are no slot files in it yet. Start the game and save once, or open a slot file from somewhere else.'),
        h('p', { class: 'path small muted' }, D.dir)));
      return;
    }
    box.replaceChildren(h('div', { class: 'startcard' },
      h('h2', {}, D.dir ? 'Could not read the save folder' : 'Save folder not found'),
      h('p', { class: 'muted' }, D.dir
        ? D.listError + '. Check the folder or choose another one.'
        : 'Whiteout looks in the usual places for The Long Dark. If the game is installed elsewhere, choose the folder yourself. You can also open a slot file directly.'),
      !D.dir && D.tried.length ? h('p', { class: 'path small muted' }, 'Tried: ' + D.tried.join(', ')) : null,
      h('button', { class: 'primary big', onclick: pickDir }, 'Choose save folder…')));
  }

  function renderChip() {
    const chip = $('#gameChip'), txt = $('#gameChipText');
    if (D.running === null) { chip.dataset.state = 'unknown'; txt.textContent = 'Game ?'; chip.title = 'Could not determine the game status'; }
    else if (D.running) { chip.dataset.state = 'open'; txt.textContent = 'Game running'; chip.title = 'Writing slots is blocked' + (D.procName ? ' (process ' + D.procName + ')' : ''); }
    else { chip.dataset.state = 'closed'; txt.textContent = 'Game closed'; chip.title = 'Slots can be saved'; }
  }

  function syncUi() {
    const linked = isLinked();
    const btn = $('#saveBtn');
    btn.textContent = btn.classList.contains('saved') ? 'Saved ✓' : (linked ? (D.dir && norm(dirOf(D.file.path)) === norm(D.dir) ? 'Save to game' : 'Save') : 'Save a copy…');
    $('#dlBtn').textContent = 'Save a copy…';
    let tag = $('#linkTag');
    if (!tag) {
      tag = h('span', { id: 'linkTag', class: 'tag ok', title: 'The open slot updates when the game saves' }, 'Live');
      $('.docactions').prepend(tag);
    }
    tag.hidden = !(linked && tld.settings().liveReload);
    renderSaveInfo();
    renderQuick();
  }

  function renderAll() {
    renderChip();
    renderSlots();
    renderQuick();
  }

  new MutationObserver(syncUi).observe($('#slotInfo'), { childList: true });

  async function pollGame() {
    let name = null, ok = true;
    try { name = await tld.invoke('game_running', { extra: tld.settings().processName || null }); } catch (e) { ok = false; }
    const was = D.running;
    D.running = ok ? !!name : null;
    D.procName = name || '';
    renderChip();
    if (was === true && D.running === false && isLinked() && isDirty()) toast('Game closed. You can save now.');
  }

  function applyDefaultCheat() {
    state.cheat = tld.settings().defaultCheat;
    if (state.outer) viewRender();
  }

  function fillSettings() {
    const s = tld.settings();
    $('#setDirPath').textContent = D.dir || 'Not found';
    $('#setDirNote').textContent = D.dir
      ? (s.saveDir ? 'Chosen manually.' : 'Detected automatically.')
      : 'Save folder not found. Tried: ' + (D.tried.join(', ') || 'nothing') + '. Choose the folder manually.';
    $('#liveReloadChk').checked = s.liveReload !== false;
    $('#autoBackupChk').checked = s.autoBackup !== false;
    $('#mapSteamChk').checked = s.mapSteam === true;
    $('#remoteChk').checked = s.mapRemote !== false;
    $('#remoteKey').value = s.mapRemoteKey || RK_DEFAULT;
    $('#defaultCheat').checked = s.defaultCheat;
    $('#confirmSaveChk').checked = s.confirmSave !== false;
    $('#procName').value = s.processName || '';
    $('#allowRunningChk').checked = !!s.allowRunningWrite;
    fillData();
    fillBackups().catch(() => { });
    $('#setGameNote').textContent = D.running === null ? 'Could not determine the game status.' : D.running ? 'The game is running (process ' + D.procName + ').' : 'The game is not running.';
  }

  function renderDataBar(st) {
    st = st || tldStore.status();
    const bar = $('#dataBar');
    const lines = [];
    if (st.checked && !st.available) lines.push('Your data folder is not available. Using a temporary local copy.');
    for (const b of st.available ? st.bad : []) {
      lines.push(b.code === 'newer'
        ? b.name + ' in your data folder was saved by a newer version of Whiteout, so it is not changed. Your changes are kept in a local copy.'
        : b.name + ' in your data folder could not be read, so it is not changed. Your changes are kept in a local copy.');
    }
    $('#dataText').textContent = lines.join(' ');
    bar.hidden = !lines.length;
  }

  function fillData() {
    const st = tldStore.status();
    $('#dataDirPath').textContent = st.dir || 'Not set';
    $('#dataDirNote').textContent = (st.isDefault ? 'Default folder.' : 'Chosen folder.') + (st.checked && !st.available ? ' Not available right now, so a temporary local copy is used.' : '');
    $('#dataDirReset').hidden = st.isDefault;
  }

  async function changeDataDir(target) {
    const st = tldStore.status();
    const dest = target || st.defaultDir;
    if (!dest) return;
    if (norm(dest) === norm(st.dir) && (target !== null || st.isDefault)) { toast('That is already your data folder.'); return; }
    let info;
    try { info = await tldStore.inspectDir(dest); } catch (e) { info = { available: false, files: [] }; }
    if (!info.available) { toast('That folder cannot be read. Choose another one.', 'err'); return; }
    const mine = tldStore.hasData(), there = info.files;
    const text = ['Whiteout will keep your pins, trails, loadouts and bookmarks in ' + dest + '.'];
    if (there.length) {
      text.push('That folder already has Whiteout data: ' + there.join(', ') + '.');
      text.push(mine
        ? 'Move my data here combines your data with those files. Nothing is overwritten: if the same item was changed in both, the older copy is kept with "(conflict)" in its name. Use the files already in that folder switches to them, and your current data stays where it is now.'
        : 'Use the files already in that folder to load them. You have no data of your own yet, so nothing is lost either way.');
    } else {
      text.push(mine
        ? 'The folder has no Whiteout data yet. Move my data here copies your data there. Use the files already in that folder starts empty, and your current data stays where it is now.'
        : 'The folder has no Whiteout data yet.');
    }
    const pick = await choose({ title: 'Change data folder', text, buttons: [['move', 'Move my data here', 'primary'], ['use', 'Use the files already in that folder'], ['cancel', 'Cancel']] });
    if (pick !== 'move' && pick !== 'use') return;
    const res = await tldStore.changeDataDir(target, pick);
    fillData();
    renderDataBar(res);
    toast(res.available ? 'Data folder changed.' : 'Data folder changed, but it is not available right now.', res.available ? undefined : 'err');
  }

  async function pickDataDir() {
    if (!tld.dialog) return;
    try {
      const p = await tld.dialog.open({ directory: true, multiple: false, title: 'Choose a data folder', defaultPath: tldStore.status().dir || undefined });
      if (p) await changeDataDir(Array.isArray(p) ? p[0] : p);
    } catch (e) { toast('Could not change the data folder: ' + code(e), 'err'); }
  }

  addEventListener('whiteout-data-status', (e) => { renderDataBar(e.detail); if ($('#settingsDlg').open) fillData(); });
  $('#keepBackups').addEventListener('change', async (e) => {
    const keep = Number(e.target.value);
    if (await setting({ keepBackups: keep })) tld.invoke('set_backup_keep', { keep }).catch((err) => toast('Could not change the backup limit: ' + code(err), 'err'));
  });
  $('#noticesBtn').addEventListener('click', () => tld.invoke('open_notices').catch((e) => toast('Could not open the license list: ' + code(e), 'err')));
  $('#bakOpenFolder').addEventListener('click', () => tld.invoke('open_backup_folder').catch((e) => toast('Could not open the backup folder: ' + code(e), 'err')));
  $('#dataDirPick').addEventListener('click', pickDataDir);
  $('#dataDirReset').addEventListener('click', () => changeDataDir(null).catch((e) => toast('Could not change the data folder: ' + code(e), 'err')));
  $('#dataDirOpen').addEventListener('click', () => tld.invoke('open_folder', { path: tldStore.status().dir }).catch((e) => toast('Could not open the folder: ' + code(e), 'err')));
  $('#dataRetryBtn').addEventListener('click', () => tldStore.sync());
  $('#dataSetBtn').addEventListener('click', () => { fillSettings(); $('#settingsDlg').showModal(); });

  const RK_DEFAULT = 'Ctrl+Alt+W';
  function remoteStatus(msg, bad) {
    const n = $('#remoteNote');
    n.textContent = msg || 'Click the box and press the keys you want. Use Ctrl or Alt with a letter or a function key.';
    n.classList.toggle('bad', !!bad);
  }
  async function applyRemote() {
    const s = tld.settings();
    const on = s.mapRemote !== false;
    try {
      await tld.invoke('remote_set', { accel: on ? (s.mapRemoteKey || RK_DEFAULT) : null });
      remoteStatus();
      return true;
    } catch (e) {
      remoteStatus('Could not reserve ' + (s.mapRemoteKey || RK_DEFAULT) + ': another program may already use it. Choose a different shortcut.', true);
      return false;
    }
  }
  function accelOf(e) {
    const c = e.code;
    let k = null;
    if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
    else if (/^Digit[0-9]$/.test(c)) k = c.slice(5);
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) k = c;
    else if (['Space', 'Backquote', 'Minus', 'Equal', 'Comma', 'Period', 'Slash', 'Tab', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete'].includes(c)) k = c;
    if (!k) return null;
    const m = [];
    if (e.ctrlKey) m.push('Ctrl');
    if (e.altKey) m.push('Alt');
    if (e.shiftKey) m.push('Shift');
    if (e.metaKey) m.push('Super');
    if (!e.ctrlKey && !e.altKey && !/^F/.test(k)) return null;
    return m.concat(k).join('+');
  }
  async function chooseRemoteKey(key) {
    const before = tld.settings().mapRemoteKey || RK_DEFAULT;
    await setting({ mapRemoteKey: key });
    if (!(await applyRemote()) && tld.settings().mapRemote !== false) {
      if (key !== before) {
        await setting({ mapRemoteKey: before });
        const ok = await applyRemote();
        remoteStatus(key + ' is already used by another program. ' + (ok ? 'Kept ' + before + '.' : 'The shortcut is off until you choose another.'), true);
      }
    }
    fillSettings();
  }
  $('#remoteChk').addEventListener('change', async (e) => { await setting({ mapRemote: e.target.checked }); applyRemote(); });
  $('#remoteKey').addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    const k = accelOf(e);
    if (!k) { if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) remoteStatus('Use Ctrl or Alt together with a letter or a function key.', true); return; }
    chooseRemoteKey(k);
  });
  $('#remoteReset').addEventListener('click', () => chooseRemoteKey(RK_DEFAULT));

  async function setting(patch) {
    try { await tld.saveSettings(patch); return true; }
    catch (e) { toast('Could not save the setting: ' + code(e), 'err'); return false; }
  }

  async function changeDir(path) {
    if (!(await setting({ saveDir: path }))) return;
    await resolveDir();
    await startWatch();
    await refreshList();
    fillSettings();
    if (!D.dir) toast('Folder not found. Choose it manually.', 'err');
  }
  async function pickDir() {
    if (!tld.dialog) return;
    try {
      const p = await tld.dialog.open({ directory: true, multiple: false, title: 'Choose The Long Dark save folder', defaultPath: D.dir || undefined });
      if (p) await changeDir(Array.isArray(p) ? p[0] : p);
    } catch (e) { toast('Could not choose the folder: ' + code(e), 'err'); }
  }

  $('#liveReloadChk').addEventListener('change', async (e) => { await setting({ liveReload: e.target.checked }); syncUi(); });
  $('#autoBackupChk').addEventListener('change', (e) => setting({ autoBackup: e.target.checked }));
  $('#mapSteamChk').addEventListener('change', async (e) => { if (await setting({ mapSteam: e.target.checked }) && window.tldMode && tldMode.reloadMap) tldMode.reloadMap(); });
  $('#defaultCheat').addEventListener('change', async (e) => { if (await setting({ defaultCheat: e.target.checked })) applyDefaultCheat(); });
  $('#confirmSaveChk').addEventListener('change', (e) => setting({ confirmSave: e.target.checked }));
  $('#allowRunningChk').addEventListener('change', (e) => setting({ allowRunningWrite: e.target.checked }));
  $('#procName').addEventListener('change', async (e) => { await setting({ processName: e.target.value }); pollGame(); });
  $('#setDirPick').addEventListener('click', pickDir);
  $('#setDirAuto').addEventListener('click', () => changeDir(null));
  $('#slotFolderBtn').addEventListener('click', pickDir);
  $('#slotRefreshBtn').addEventListener('click', () => refreshList());
  $('#settingsBtn').addEventListener('click', () => { fillSettings(); $('#settingsDlg').showModal(); });
  $('#tourBtn').addEventListener('click', () => { $('#settingsDlg').close(); if (window.tldTour) tldTour.start(); });

  async function openSlotsDlg() {
    $('#slotsDlg').showModal();
    renderSlots();
    await refreshList();
  }
  $('#slotsBtn').addEventListener('click', openSlotsDlg);
  $('#openSrvBtn').addEventListener('click', openSlotsDlg);

  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('#openBtn, #openBtn2, #saveBtn, #dlBtn') : null;
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const menu = b.closest('#docMenu');
    if (menu && menu.hidePopover) { try { menu.hidePopover(); } catch (err) { } }
    if (b.id === 'saveBtn') saveToFile(); else if (b.id === 'dlBtn') saveCopy(); else pickNative();
  }, true);

  window.tldSaveTime = () => (D.file && D.file.stamp && Number(D.file.stamp.modified)) || null;

  async function start() {
    await tld.ready;
    if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    if (!tld.inTauri) {
      $('#welcome .lead').textContent = 'This page only works inside the Whiteout desktop app.';
      D.running = null; renderChip();
      return;
    }
    if (tld.loadError) toast('Could not read settings, using defaults: ' + tld.loadError, 'err');
    renderDataBar();
    applyRemote();
    tld.listen('remote', (ev) => { if (window.tldMode && tldMode.remote) tldMode.remote(ev.payload); });
    tld.invoke('set_backup_keep', { keep: tld.settings().keepBackups == null ? 20 : tld.settings().keepBackups }).catch(() => { });
    const T = window.__TAURI__;
    if (T.app && T.app.getVersion) T.app.getVersion().then((v) => { const el = $('#appVersion'); if (el) el.textContent = 'v' + v; }).catch(() => { });
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="https://"]');
      if (!a || !T.opener) return;
      e.preventDefault();
      T.opener.openUrl(a.href).catch(() => toast('Could not open the link', 'err'));
    });
    applyDefaultCheat();
    syncUi();
    await resolveDir();
    await startWatch();
    const W = T.window && T.window.getCurrentWindow ? T.window.getCurrentWindow() : null;
    if (W && W.onCloseRequested) {
      await W.onCloseRequested(async (e) => {
        if (!(await confirmDiscard('Close without saving?'))) e.preventDefault();
      });
    }
    await tld.listen('menu', async (ev) => {
      if (!ev || ev.payload !== 'quit') return;
      if (await confirmDiscard('Quit without saving?')) tld.invoke('quit_app').catch((e) => toast('Could not quit: ' + code(e), 'err'));
    });
    await tld.listen('saves-changed', () => { refreshList().catch(() => { }); });
    await tld.listen('save-rescued', (ev) => {
      const p = ev.payload || {};
      toast('The slot ' + p.name + ' disappeared while the game was running. A copy was saved to ' + p.path, 'warn');
    });
    await tld.listen('save-rescue-failed', (ev) => toast('Could not save a copy of the slot that disappeared (' + String(ev.payload).replace(/^io:\s*/, '') + ').', 'err'));
    await Promise.all([refreshList(), pollGame()]);
    setInterval(() => { if (!document.hidden) refreshList().catch(() => { }); }, POLL_MS);
    setInterval(() => { if (!document.hidden) pollGame(); }, GAME_POLL_MS);
    addEventListener('focus', () => { refreshList().catch(() => { }); pollGame(); });
    if (!tld.settings().tourDone && window.tldTour) setTimeout(() => tldTour.start({ auto: true }), 700);
  }
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const MOD = MAC ? '\u2318' : 'Ctrl+';
  const SHORTCUTS = { s: 'saveBtn', o: 'openBtn', ',': 'settingsBtn', '1': 'modeEdit', '2': 'modeMap', '3': 'followBtn' };
  const shortcutTarget = (id) => (id === 'modeEdit' ? $('.mode[data-mode="edit"]') : id === 'modeMap' ? $('.mode[data-mode="map"]') : $('#' + id));
  for (const [key, id] of Object.entries(SHORTCUTS)) {
    const b = shortcutTarget(id);
    if (b) b.setAttribute('title', (b.getAttribute('title') || b.textContent.trim()) + ' (' + MOD + key + ')');
  }
  addEventListener('keydown', (e) => {
    if (!(MAC ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return;
    const id = SHORTCUTS[e.key];
    if (!id || document.querySelector('dialog[open]')) return;
    const b = shortcutTarget(id);
    if (!b || (id === 'followBtn' && !document.body.classList.contains('mode-map'))) return;
    e.preventDefault();
    if (!tldDedupe('mod+' + e.key)) return;
    if (!b.hidden && !b.disabled) b.click();
  });
  const followBtn = $('#followBtn');
  function setFollow(on, stay) {
    window.tldMode.follow(on, stay);
    followBtn.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('whiteout-follow-player', on ? '1' : '0'); } catch (e) { }
  }
  followBtn.addEventListener('click', () => setFollow(followBtn.getAttribute('aria-pressed') !== 'true', false));
  try { if (localStorage.getItem('whiteout-follow-player') === '1') setFollow(true, true); } catch (e) { }

  start().catch((e) => { console.error(e); toast('Startup failed: ' + code(e), 'err'); });

  window.tldDesktop = { D, choose, fillBackups, changeDataDir, renderDataBar, openPath, refreshList, pollGame, isDirty, isLinked, ask, askText, syncUi, renderSaveInfo, reviewChanges, openSlotsDlg, openBackups, writeRaw, formatCheck, saveToFile, saveCopy, pickNative, summaryOf, fmtDate, fmtSize, code, joinPath, readStable };
})();
