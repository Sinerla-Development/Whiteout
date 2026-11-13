(() => {
  'use strict';

  const T = window.__TAURI__;
  const inTauri = !!(T && T.core && typeof T.core.invoke === 'function');
  const invoke = inTauri ? T.core.invoke : () => Promise.reject('Tauri is missing: open this as the desktop app.');
  const listen = inTauri && T.event ? T.event.listen : () => Promise.resolve(() => { });

  const MAX_PINS = 300, MAX_LOADOUTS = 100, MAX_BOOKMARKS = 200, MAX_LOADOUT_ITEMS = 80;
  const PIN_COLORS = ['ember', 'frost', 'green', 'rose', 'violet'];
  const DEFAULT_SETTINGS = { defaultCheat: true, confirmSave: true, liveReload: true, saveDir: null, dataDir: null, processName: '', allowRunningWrite: false, autoBackup: true, tourDone: false, mapSteam: null, mapRemote: true, mapRemoteKey: 'Ctrl+Alt+W', keepBackups: 20, autoUpdate: null, lastUpdateCheck: 0 };
  const FILES = {
    pins: { key: 'pins', label: 'name' },
    trail: { key: 'trails', label: 'slot' },
    loadouts: { key: 'loadouts', label: 'name' },
    bookmarks: { key: 'bookmarks', label: 'name' },
  };
  const NAMES = Object.keys(FILES);
  const OLD_KEYS = [['tld-jalki', 'whiteout-trail'], ['tld-jalki-nakyy', 'whiteout-trail-visible'], ['tld-bookmarks', 'whiteout-bookmarks']];

  let settings = { ...DEFAULT_SETTINGS };
  const files = {};
  for (const n of NAMES) files[n] = { local: [], base: null, mtime: null, bad: null };
  const status = { dir: null, defaultDir: null, available: true, checked: false };
  let loadError = null;
  let writing = Promise.resolve();
  let syncing = Promise.resolve();

  const fail = (code, extra) => Object.assign(new Error(code), { code }, extra || {});
  const errCode = (e) => String(e && e.message ? e.message : e);
  const now = () => new Date().toISOString();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const clip = (v, max) => {
    const s = typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '').trim() : '';
    return Array.from(s).slice(0, max).join('');
  };
  const clipText = (v, max) => {
    const s = typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim() : '';
    return Array.from(s).slice(0, max).join('');
  };
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  const finite = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));
  const isId = (v) => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
  const stamp = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const meta = (b, rec) => {
    rec.id = isId(b.id) ? b.id : newId();
    rec.created = stamp(b.created) || now();
    rec.updatedAt = stamp(b.updatedAt) || rec.created;
    return rec;
  };

  function cleanPin(b) {
    const map = String(b.map == null ? '' : b.map);
    if (!/^[a-z0-9&-]{1,80}$/.test(map)) throw fail('bad_request');
    for (const k of ['x', 'y']) if (!finite(b[k]) || Math.abs(Number(b[k])) > 100000) throw fail('bad_request');
    const name = clip(b.name, 60);
    return {
      id: '', map,
      x: Math.round(Number(b.x) * 10) / 10,
      y: Math.round(Number(b.y) * 10) / 10,
      name: name !== '' ? name : 'Pin',
      note: clipText(b.note, 500),
      color: PIN_COLORS.includes(b.color) ? b.color : 'ember',
    };
  }

  function cleanLoadoutItem(it) {
    if (!it || typeof it.id !== 'string' || !/^[A-Za-z0-9_]{1,80}$/.test(it.id)) return null;
    const qty = it.qty;
    const cond = it.cond === undefined || it.cond === null || it.cond === '' ? null : it.cond;
    return {
      id: it.id,
      qty: finite(qty) && Number(qty) >= 0 && Number(qty) <= 1000000 ? Math.round(Number(qty) * 1000) / 1000 : null,
      cond: finite(cond) ? Math.max(1, Math.min(100, Math.round(Number(cond)))) : null,
    };
  }

  function cleanLoadout(b) {
    const name = clip(b.name, 40);
    if (name === '') throw fail('bad_request');
    const items = [];
    for (const it of Array.isArray(b.items) ? b.items : []) {
      const c = cleanLoadoutItem(it);
      if (c) items.push(c);
      if (items.length >= MAX_LOADOUT_ITEMS) break;
    }
    if (!items.length) throw fail('bad_request');
    return { id: '', name, note: clipText(b.note, 500), items };
  }

  function cleanBookmark(b) {
    const region = String(b.region == null ? '' : b.region);
    if (!/^[A-Za-z0-9_]{1,80}$/.test(region)) throw fail('bad_request');
    for (const k of ['x', 'y', 'z']) if (!finite(b[k]) || Math.abs(Number(b[k])) > 100000) throw fail('bad_request');
    const name = clip(b.name, 60);
    return { id: '', name: name || 'Place', region, x: Number(b.x), y: Number(b.y), z: Number(b.z) };
  }

  function cleanTrail(b) {
    const slot = clip(b.slot, 120);
    if (!slot) throw fail('bad_request');
    const points = [];
    for (const p of Array.isArray(b.points) ? b.points : []) {
      if (Array.isArray(p) && p.length === 3 && typeof p[0] === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(p[0]) && finite(p[1]) && finite(p[2])) points.push([p[0], Number(p[1]), Number(p[2])]);
    }
    return { id: '', slot, points: points.slice(-300) };
  }

  const CLEAN = { pins: cleanPin, trail: cleanTrail, loadouts: cleanLoadout, bookmarks: cleanBookmark };

  function sanitize(name, list) {
    const out = [];
    for (const r of Array.isArray(list) ? list : []) {
      if (!r || typeof r !== 'object') continue;
      try { out.push(meta(r, CLEAN[name](r))); } catch (e) { }
    }
    return out;
  }

  function merge(name, base, local, remote) {
    const label = FILES[name].label;
    const byId = (list) => new Map((list || []).map((r) => [r.id, r]));
    const B = byId(base), L = byId(local), R = byId(remote);
    const out = [];
    for (const id of new Set([...R.keys(), ...L.keys()])) {
      const b = B.get(id), l = L.get(id), r = R.get(id);
      if (l && r) {
        if (same(l, r) || (b && same(b, l))) out.push(r);
        else if (b && same(b, r)) out.push(l);
        else {
          const [win, lose] = String(l.updatedAt) > String(r.updatedAt) ? [l, r] : [r, l];
          out.push(win);
          out.push({ ...lose, id: newId(), [label]: Array.from(String(lose[label])).slice(0, label === 'slot' ? 108 : 28).join('') + ' (conflict)' });
        }
      } else if (l) {
        if (!b || !same(b, l)) out.push(l);
      } else if (r) {
        if (!b || !same(b, r)) out.push(r);
      }
    }
    return out;
  }

  function persistLocal() {
    const cache = {};
    for (const n of NAMES) cache[n] = { local: files[n].local, base: files[n].base, mtime: files[n].mtime, dir: status.dir };
    const json = JSON.stringify({ settings, cache });
    writing = writing.then(() => invoke('state_save', { json })).catch((e) => { console.error('Saving state failed', e); });
    return writing;
  }

  function emit(type, detail) {
    try { window.dispatchEvent(new CustomEvent(type, { detail })); } catch (e) { }
  }

  const fileText = (n) => JSON.stringify({ version: 1, [FILES[n].key]: files[n].local }, null, 2);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  async function syncFile(n, info, depth) {
    const f = files[n];
    const remoteTime = has(info.files, n) ? info.files[n] : null;
    let changed = false;
    if (remoteTime !== null && remoteTime !== f.mtime) {
      let r;
      try { r = await invoke('data_read', { dir: status.dir, name: n }); }
      catch (e) {
        const c = errCode(e);
        if (c === 'unavailable') status.available = false; else f.bad = c;
        return false;
      }
      f.bad = null;
      if (r.text !== null) {
        let remote;
        try { remote = sanitize(n, JSON.parse(r.text)[FILES[n].key]); } catch (e) { f.bad = 'corrupt'; return false; }
        const merged = merge(n, f.base, f.local, remote);
        changed = !same(merged, f.local);
        f.local = merged;
        f.base = remote;
        f.mtime = r.modified;
      }
    } else if (remoteTime !== null) f.bad = null;
    if (f.bad) return changed;
    const dirty = f.base === null ? f.local.length > 0 : !same(f.local, f.base) || (remoteTime === null && f.local.length > 0);
    if (!dirty) return changed;
    try {
      const m = await invoke('data_write', { dir: status.dir, name: n, json: fileText(n), expect: remoteTime === null ? null : f.mtime });
      f.base = copy(f.local);
      f.mtime = m;
    } catch (e) {
      const c = errCode(e);
      if (c === 'unavailable') status.available = false;
      else if (c === 'changed' && (depth || 0) < 3) {
        f.mtime = -1;
        return (await syncFile(n, await invoke('data_stat', { dir: status.dir }), (depth || 0) + 1)) || changed;
      } else f.bad = c;
    }
    return changed;
  }

  function dataStatus() {
    return {
      dir: status.dir, defaultDir: status.defaultDir, isDefault: !settings.dataDir, available: status.available, checked: status.checked,
      bad: NAMES.filter((n) => files[n].bad).map((n) => ({ name: n + '.json', code: files[n].bad })),
    };
  }

  function sync(only) {
    syncing = syncing.then(async () => {
      if (!status.dir) return;
      const before = JSON.stringify(dataStatus());
      let info;
      try { info = await invoke('data_stat', { dir: status.dir }); } catch (e) { info = { available: false, files: {} }; }
      status.available = !!info.available;
      const changed = [];
      if (status.available) for (const n of only ? [only] : NAMES) if (await syncFile(n, info)) changed.push(n);
      status.checked = true;
      await persistLocal();
      if (changed.length) emit('whiteout-data', { files: changed });
      if (!only || before !== JSON.stringify(dataStatus())) emit('whiteout-data-status', dataStatus());
    }).catch((e) => console.error('Sync failed', e));
    return syncing;
  }

  const readLs = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  function migrateLocalStorage() {
    try {
      for (const [from, to] of OLD_KEYS) {
        const v = localStorage.getItem(from);
        if (v === null) continue;
        if (localStorage.getItem(to) === null) localStorage.setItem(to, v);
        localStorage.removeItem(from);
      }
    } catch (e) { }
  }
  function importOldLocal() {
    const trailRaw = readLs('whiteout-trail'), bmRaw = readLs('whiteout-bookmarks');
    if (trailRaw !== null) {
      try {
        const all = JSON.parse(trailRaw) || {};
        for (const t of sanitize('trail', Object.entries(all).map(([slot, points]) => ({ slot, points })))) {
          if (!files.trail.local.some((x) => x.slot === t.slot)) files.trail.local.push(t);
        }
      } catch (e) { }
    }
    if (bmRaw !== null) {
      try { files.bookmarks.local.push(...sanitize('bookmarks', JSON.parse(bmRaw))); } catch (e) { }
    }
    try { localStorage.removeItem('whiteout-trail'); localStorage.removeItem('whiteout-bookmarks'); } catch (e) { }
  }

  const ready = (async () => {
    migrateLocalStorage();
    const dirs = {};
    try {
      const raw = JSON.parse(await invoke('state_load'));
      settings = { ...DEFAULT_SETTINGS, ...(raw && typeof raw.settings === 'object' && raw.settings ? raw.settings : {}) };
      const cache = raw && raw.cache && typeof raw.cache === 'object' ? raw.cache : null;
      if (cache) {
        for (const n of NAMES) {
          const c = cache[n];
          if (!c) continue;
          files[n].local = sanitize(n, c.local);
          files[n].base = Array.isArray(c.base) ? sanitize(n, c.base) : null;
          files[n].mtime = typeof c.mtime === 'number' ? c.mtime : null;
          dirs[n] = typeof c.dir === 'string' ? c.dir : null;
        }
      } else if (raw) {
        files.pins.local = sanitize('pins', raw.pins);
        files.loadouts.local = sanitize('loadouts', raw.kits);
      }
    } catch (e) { loadError = String(e); }
    importOldLocal();
    try { status.defaultDir = await invoke('data_default_dir'); } catch (e) { status.defaultDir = null; }
    status.dir = settings.dataDir || status.defaultDir;
    for (const n of NAMES) if (dirs[n] && dirs[n] !== status.dir) { files[n].base = null; files[n].mtime = null; }
    if (inTauri) await sync();
  })();

  async function changeDataDir(dir, how) {
    await ready;
    await syncing;
    for (const n of NAMES) files[n] = how === 'use' ? { local: [], base: [], mtime: null, bad: null } : { ...files[n], base: null, mtime: null, bad: null };
    settings.dataDir = dir || null;
    status.dir = dir || status.defaultDir;
    status.available = true;
    await sync();
    emit('whiteout-data', { files: NAMES.slice() });
    return dataStatus();
  }

  async function inspectDir(dir) {
    const info = await invoke('data_stat', { dir });
    return { available: !!info.available, files: Object.keys(info.files || {}).map((n) => n + '.json') };
  }

  function touch(name) {
    persistLocal();
    sync(name);
  }

  function upsertByName(name, rec, max) {
    const list = files[name].local;
    const i = list.findIndex((k) => k.name.toLowerCase() === rec.name.toLowerCase());
    const t = now();
    if (i >= 0) { list[i] = { ...rec, id: list[i].id, created: list[i].created, updatedAt: t }; return list[i]; }
    if (list.length >= max) throw fail('full', { max });
    const r = { ...rec, id: newId(), created: t, updatedAt: t };
    list.push(r);
    return r;
  }

  function saveById(name, rec, b, max) {
    const list = files[name].local;
    const id = String(b.id == null ? '' : b.id);
    const t = now();
    if (id !== '') {
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) throw fail('not_found');
      list[i] = { ...rec, id, created: list[i].created, updatedAt: t };
      return list[i];
    }
    if (list.length >= max) throw fail('full', { max });
    const r = { ...rec, id: newId(), created: t, updatedAt: t };
    list.push(r);
    return r;
  }

  const idOf = (b) => String(b.id == null ? '' : b.id);
  const drop = (name, b) => { files[name].local = files[name].local.filter((r) => r.id !== idOf(b)); };

  const routes = {
    pins: async () => ({ pins: files.pins.local }),
    pin_save: async (b) => { saveById('pins', cleanPin(b), b, MAX_PINS); touch('pins'); return { pins: files.pins.local }; },
    pin_del: async (b) => { drop('pins', b); touch('pins'); return { pins: files.pins.local }; },
    kits: async () => ({ kits: files.loadouts.local }),
    kit_save: async (b) => {
      const rec = cleanLoadout(b);
      const kit = b.id ? saveById('loadouts', rec, b, MAX_LOADOUTS) : upsertByName('loadouts', rec, MAX_LOADOUTS);
      touch('loadouts');
      return { kits: files.loadouts.local, kit };
    },
    kit_del: async (b) => { drop('loadouts', b); touch('loadouts'); return { kits: files.loadouts.local }; },
    bookmarks: async () => ({ bookmarks: files.bookmarks.local }),
    bookmark_save: async (b) => { saveById('bookmarks', cleanBookmark(b), b, MAX_BOOKMARKS); touch('bookmarks'); return { bookmarks: files.bookmarks.local }; },
    bookmark_del: async (b) => { drop('bookmarks', b); touch('bookmarks'); return { bookmarks: files.bookmarks.local }; },
  };

  async function call(action, body) {
    await ready;
    const fn = routes[action];
    if (!fn) throw fail('not_found');
    return fn(body || {});
  }

  function trailOf(slot) {
    const t = files.trail.local.find((x) => x.slot === slot);
    return t ? t.points.map((p) => p.slice()) : [];
  }
  function setTrail(slot, points) {
    const list = files.trail.local;
    const i = list.findIndex((x) => x.slot === slot);
    const t = now();
    if (!points.length) { if (i < 0) return; list.splice(i, 1); }
    else if (i >= 0) list[i] = { ...list[i], points: points.slice(-300), updatedAt: t };
    else list.push({ id: newId(), slot, points: points.slice(-300), created: t, updatedAt: t });
    touch('trail');
  }

  addEventListener('focus', () => { if (inTauri) ready.then(() => sync()); });

  function patchSettings(b) {
    const s = settings;
    const flag = (k) => { if (k in b) { if (typeof b[k] !== 'boolean') throw fail('bad_request'); s[k] = b[k]; } };
    ['defaultCheat', 'confirmSave', 'liveReload', 'allowRunningWrite', 'autoBackup', 'tourDone', 'mapRemote'].forEach(flag);
    for (const k of ['autoUpdate', 'mapSteam']) if (k in b) { if (b[k] !== null && typeof b[k] !== 'boolean') throw fail('bad_request'); s[k] = b[k]; }
    if ('processName' in b) { if (typeof b.processName !== 'string') throw fail('bad_request'); s.processName = clip(b.processName, 60); }
    if ('mapRemoteKey' in b) { if (typeof b.mapRemoteKey !== 'string') throw fail('bad_request'); s.mapRemoteKey = clip(b.mapRemoteKey, 40) || 'Ctrl+Alt+W'; }
    if ('saveDir' in b) { if (b.saveDir !== null && typeof b.saveDir !== 'string') throw fail('bad_request'); s.saveDir = b.saveDir ? b.saveDir : null; }
    if ('keepBackups' in b) { const v = b.keepBackups; if (v !== 0 && !(Number.isInteger(v) && v >= 5 && v <= 200)) throw fail('bad_request'); s.keepBackups = v; }
    if ('lastUpdateCheck' in b) { if (!finite(b.lastUpdateCheck)) throw fail('bad_request'); s.lastUpdateCheck = Number(b.lastUpdateCheck); }
    return s;
  }

  window.tldStore = {
    call, ready, trailOf, setTrail, changeDataDir, inspectDir,
    peek: (name) => (files[name] ? files[name].local : []),
    status: dataStatus,
    sync: () => sync(),
    hasData: () => NAMES.some((n) => files[n].local.length > 0),
    limits: { pins: MAX_PINS, loadouts: MAX_LOADOUTS, loadoutItems: MAX_LOADOUT_ITEMS },
  };
  window.tldPrefs = { get confirmSave() { return settings.confirmSave !== false; } };

  window.tld = {
    inTauri, invoke, listen, ready,
    dialog: inTauri ? T.dialog : null,
    get loadError() { return loadError; },
    settings: () => settings,
    async saveSettings(patch) { await ready; patchSettings(patch); await persistLocal(); return settings; },
  };
})();
