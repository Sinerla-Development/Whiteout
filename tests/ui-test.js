const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.join(__dirname, '..', 'ui');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

const MOCK = () => {
  const DIR = 'C:\\Users\\Tester\\AppData\\Local\\Hinterland\\TheLongDark';
  const m = window.__mock = { dir: DIR, files: new Map(), running: null, state: '{}', backups: [], copies: [], listeners: {}, calls: [], clock: 1000, dialogOpen: null, dialogSave: null, watch: null };
  const base = (p) => String(p).split(/[\\/]/).pop();
  const hdr = (o) => { const r = {}; for (const k of Object.keys((o && o.headers) || {})) r[k] = decodeURIComponent(o.headers[k]); return r; };
  const tick = () => ++m.clock;
  m.manual = () => m.backups.filter((b) => !b.auto);
  m.menuState = null;
  if (!window.__freshStart) m.state = JSON.stringify({ settings: { tourDone: true } });
  try { if (sessionStorage.getItem('__mockState')) m.state = sessionStorage.getItem('__mockState'); } catch (e) { }
  m.setFile = (name, bytes) => { m.files.set(name, { bytes: new Uint8Array(bytes), modified: tick() }); };
  m.emit = (name, payload) => (m.listeners[name] || []).forEach((cb) => cb({ payload }));
  m.dataDefault = 'C:\\Users\\Tester\\AppData\\Roaming\\whiteout\\data';
  m.fs = new Map();
  m.dirs = new Set();
  m.dataKey = (dir, name) => dir + '/' + name + '.json';
  m.putData = (dir, name, text) => { m.dirs.add(dir); m.fs.set(m.dataKey(dir, name), { text, modified: tick() }); };
  m.getData = (dir, name) => { const f = m.fs.get(m.dataKey(dir, name)); return f ? JSON.parse(f.text) : null; };
  const checkData = (text) => { let v; try { v = JSON.parse(text); } catch (e) { throw 'corrupt'; } if (!v || typeof v !== 'object' || Array.isArray(v)) throw 'corrupt'; if (v.version > 1) throw 'newer'; if (v.version !== 1) throw 'corrupt'; };
  if (window.__setup) window.__setup(m);
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args, opts) => {
        m.calls.push(cmd);
        switch (cmd) {
          case 'state_load': return m.state;
          case 'state_save': m.state = args.json; try { sessionStorage.setItem('__mockState', args.json); } catch (e) { } return null;
          case 'find_save_dir': return { found: m.dir, tried: [m.dir] };
          case 'list_saves': return [...m.files].map(([name, f]) => ({ name, size: f.bytes.length, modified: f.modified }));
          case 'stat_file': { const f = m.files.get(base(args.path)); if (!f) throw 'io: not found'; return { size: f.bytes.length, modified: f.modified }; }
          case 'read_save': { const f = m.files.get(base(args.path)); if (!f) throw 'io: not found'; return f.bytes.slice().buffer; }
          case 'write_save': {
            const h = hdr(opts), name = base(h['x-path']), f = m.files.get(name);
            if (m.running && h['x-allow-running'] !== '1') throw 'game_running';
            if (f && h['x-expected-size'] && (Number(h['x-expected-size']) !== f.bytes.length || Number(h['x-expected-modified']) !== f.modified)) throw 'changed';
            if (f) m.backups.push({ name, bytes: f.bytes.slice(), modified: tick() });
            m.setFile(name, args);
            m.selfWrite = name;
            const nf = m.files.get(name);
            return { size: nf.bytes.length, modified: nf.modified };
          }
          case 'write_copy': { const h = hdr(opts); m.copies.push({ path: h['x-path'], bytes: new Uint8Array(args) }); return { size: args.length, modified: tick() }; }
          case 'list_backups': return m.backups.filter((b) => b.name === base(args.path)).map((b) => ({ id: b.modified + '.bak', size: b.bytes.length, modified: b.modified, label: b.label || null, locked: !!b.locked, auto: !!b.auto })).reverse();
          case 'backup_now': {
            const name = base(args.path), f = m.files.get(name);
            if (!f) return null;
            const last = [...m.backups].reverse().find((b) => b.name === name);
            if (args.auto && last && last.bytes.length === f.bytes.length && last.bytes.every((v, i) => v === f.bytes[i])) return null;
            const b = { name, bytes: f.bytes.slice(), modified: tick(), label: args.label || null, locked: false, auto: !!args.auto };
            m.backups.push(b);
            return b.modified + '.bak';
          }
          case 'backup_set': { const b = m.backups.find((x) => x.modified + '.bak' === args.id); b.label = args.label || null; b.locked = !!args.locked; return null; }
          case 'backup_delete': { const i = m.backups.findIndex((x) => x.modified + '.bak' === args.id); if (i >= 0 && !m.backups[i].locked) m.backups.splice(i, 1); return null; }
          case 'data_default_dir': m.dirs.add(m.dataDefault); return m.dataDefault;
          case 'data_stat': {
            if (!m.dirs.has(args.dir)) return { available: false, files: {} };
            const files = {};
            for (const n of ['pins', 'trail', 'loadouts', 'bookmarks']) { const f = m.fs.get(m.dataKey(args.dir, n)); if (f) files[n] = f.modified; }
            return { available: true, files };
          }
          case 'data_read': {
            if (!m.dirs.has(args.dir)) throw 'unavailable';
            const f = m.fs.get(m.dataKey(args.dir, args.name));
            if (!f) return { text: null, modified: null };
            checkData(f.text);
            return { text: f.text, modified: f.modified };
          }
          case 'data_write': {
            if (!m.dirs.has(args.dir)) throw 'unavailable';
            const k = m.dataKey(args.dir, args.name), f = m.fs.get(k);
            if (f) { checkData(f.text); if (args.expect !== f.modified) throw 'changed'; }
            m.fs.set(k, { text: args.json, modified: tick() });
            return m.fs.get(k).modified;
          }
          case 'open_folder': m.openedFolder = args.path; return null;
          case 'updater_ready': return !!m.updaterReady;
          case 'set_backup_keep': m.keep = args.keep; return null;
          case 'backup_usage': return { bytes: m.backups.reduce((n, b) => n + b.bytes.length, 0), files: m.backups.length };
          case 'open_backup_folder': m.openedBackups = true; return null;
          case 'set_menu_state': m.menuState = args; return null;
          case 'read_backup': { const b = m.backups.find((x) => x.modified + '.bak' === args.id); return b.bytes.slice().buffer; }
          case 'game_running': return m.running ? 'tld.exe' : null;
          case 'guard_track': m.guard = args; return null;
          case 'watch_dir': m.watch = args.dir; return null;
          case 'unwatch_dir': m.watch = null; return null;
          case 'quit_app': m.quit = true; return null;
          case 'open_notices': m.notices = true; return null;
          default: throw 'unknown command ' + cmd;
        }
      },
    },
    event: { listen: async (name, cb) => { (m.listeners[name] = m.listeners[name] || []).push(cb); return () => { }; } },
    app: { getVersion: async () => '0.1.0' },
    updater: {
      check: async () => {
        m.updateChecks = (m.updateChecks || 0) + 1;
        if (m.updateFail) throw 'network down';
        if (!m.update) return null;
        return { version: m.update, body: 'Notes', downloadAndInstall: async (cb) => { cb({ event: 'Started', data: { contentLength: 10 } }); cb({ event: 'Progress', data: { chunkLength: 10 } }); cb({ event: 'Finished' }); m.installed = m.update; } };
      },
    },
    process: { relaunch: async () => { m.relaunched = true; } },
    window: { getCurrentWindow: () => ({ onCloseRequested: async (cb) => { m.closeHandler = cb; } }) },
    opener: { openUrl: async (u) => { m.opened = u; } },
    dialog: { open: async (o) => (m.dialogOpen ? m.dialogOpen(o) : null), save: async (o) => (m.dialogSave ? m.dialogSave(o) : null) },
  };
};

const SLOT = () => {
  window.__slot = (o) => {
    const g = {
      m_PlayerManagerSerialized: JSON.stringify({ m_SaveGamePosition: [100, 5, 200], m_SaveGameRotation: [0, 0, 0, 1], m_CheatsUsed: false }),
      m_Condition_Serialized: JSON.stringify({ m_CurrentHPProxy: o.hp, m_NeverDieProxy: false }),
      m_Inventory_Serialized: JSON.stringify({ m_SerializedItems: o.items || [] }),
      m_TimeOfDay_Serialized: JSON.stringify({ m_HoursPlayedNotPausedProxy: 10, m_TimeProxy: 0.25, m_UniStormDayNumberProxy: 4, m_UniStormDayCounterProxy: 4 }),
      m_Weather_Serialized: JSON.stringify({ m_WeatherStageProxy: 'Clear', m_TempHighProxy: -3.5, m_TempLowProxy: -12 }),
      m_Thirst_Serialized: JSON.stringify({ m_CurrentThirstProxy: 40 }),
      m_Fatigue_Serialized: JSON.stringify({ m_CurrentFatigueProxy: 55 }),
      m_Freezing_Serialized: JSON.stringify({ m_CurrentFreezingProxy: 30 }),
      m_AuroraManagerSerialized: JSON.stringify({ m_ForceAuroraEarlyWindowAllowed: false, m_ForceAuroraLateWindowAllowed: false, m_HasForcedAuroraStarted: true, m_NumAurorasForSave: 6, m_LastAuroraDays: 565.659 }),
      m_SevereLacerationSerialized: { m_IsActive: true, m_TimeWhenActivated: 9.5, m_TimeWhenLastWoundEscalation: 9.5, m_CauseLocID: 'GAMEPLAY_CougarAttack' },
      m_CougarManagerSerialized: { m_IsEnabled: true, m_Version: 4, m_TerritoryLocIDs: [''], m_CougarStates: [5], m_RegionThreatLevelNames: ['MountainTownRegion'], m_RegionThreatLevels: [3] },
    };
    const outer = { m_DisplayName: o.name || 'Test slot', m_InternalName: 'sandbox1', m_GameMode: 'Survival', m_Timestamp: '2026-10-27', m_Version: o.version || 100, m_Changelist: o.changelist || 188966, m_Dict: { global: b64encode(lzfCompress(enc(JSON.stringify(g)))), boot: b64encode(lzfCompress(enc(JSON.stringify({ m_SceneName: o.scene || 'LakeRegion' })))) } };
    for (const k of o.regions || []) outer.m_Dict[k] = b64encode(lzfCompress(enc('{}')));
    return lzfCompress(enc(JSON.stringify(outer)));
  };
};

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok   ' + msg); else { failures++; console.log('  FAIL ' + msg); } };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route(/steamusercontent/, (r) => r.abort());
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|steamusercontent/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(MOCK);
  await page.goto(url);
  await page.waitForFunction(() => window.tldDesktop && document.querySelector('#gameChip').dataset.state !== 'unknown');

  console.log('Startup');
  ok(await page.$eval('#gameChipText', (e) => e.textContent) === 'Game closed', 'game state is shown');
  ok(await page.evaluate(() => __mock.watch) === 'C:\\Users\\Tester\\AppData\\Local\\Hinterland\\TheLongDark', 'save folder is being watched');
  await page.waitForFunction(() => document.querySelector('#appVersion').textContent === 'v0.1.0');
  ok(true, 'app version is shown in Settings');

  await page.evaluate(SLOT);
  await page.evaluate(() => {
    __mock.setFile('sandbox1', __slot({ hp: 80 }));
    __mock.setFile('newer', __slot({ hp: 80, name: 'Newer', version: 101, changelist: 190000 }));
    __mock.setFile('profile_survival', new Uint8Array(500).fill(7));
  });
  await page.evaluate(() => tldDesktop.refreshList());
  const entries = await page.evaluate(() => tldDesktop.D.entries.map((e) => e.name).sort());
  ok(JSON.stringify(entries) === '["newer","sandbox1"]', 'only slots are listed: ' + JSON.stringify(entries));

  console.log('Start screen');
  await page.waitForSelector('#quickSaves .startcard h2');
  ok(await page.$eval('#quickSaves .startcard h2', (e) => e.textContent) === 'Newer', 'the latest save is the main choice');
  ok(/Open this save/.test(await page.$eval('#quickSaves .startcard .primary', (e) => e.textContent)), 'main card has an open button');
  ok(/Test slot/.test(await page.$eval('.startmore', (e) => e.textContent)), 'other slots are small links');
  ok(await page.$eval('#followBtn', (e) => getComputedStyle(e).display) === 'none', 'Follow player is hidden outside the Map view');
  ok(await page.evaluate(() => !document.querySelector('dialog.tour[open]')), 'the tour does not open once it has been seen');

  console.log('Version warning');
  await page.evaluate(() => { tldToasts.clear(); return tldDesktop.openPath('C:\\Users\\Tester\\AppData\\Local\\Hinterland\\TheLongDark\\sandbox1'); });
  await page.waitForFunction(() => state.outer);
  ok(await page.evaluate(() => document.querySelectorAll('.toast-item.warn').length) === 0, 'no warning for the tested game version');
  await page.evaluate(() => { tldToasts.clear(); return tldDesktop.openPath('C:\\Users\\Tester\\AppData\\Local\\Hinterland\\TheLongDark\\newer'); });
  await page.waitForSelector('.toast-item.warn');
  ok(/newer game build/.test(await page.$eval('.toast-item.warn', (e) => e.textContent)), 'warning for a newer game version');

  console.log('Save and backup');
  await page.evaluate(() => { tldToasts.clear(); return tldDesktop.openPath('C:\\Users\\Tester\\AppData\\Local\\Hinterland\\TheLongDark\\sandbox1'); });
  await page.waitForFunction(() => state.outer && state.outer.m_DisplayName === 'Test slot');
  await page.evaluate(() => { gs('m_Condition_Serialized').m_CurrentHPProxy = 99; tldUndo.commit(); });
  ok(await page.evaluate(() => tldDesktop.isDirty()), 'edit is detected');
  ok(/Live/.test(await page.$eval('#linkTag', (e) => e.textContent)), 'the live tag says Live');
  await page.waitForFunction(() => /Review 1 change/.test(document.querySelector('#reviewBtn').textContent) && !document.querySelector('#reviewBtn').hidden);
  ok(true, 'change count shows next to Save');
  await page.click('#reviewBtn');
  await page.waitForSelector('#diffDlg[open]');
  ok(/Health/.test(await page.$eval('#diffBody', (e) => e.textContent)), 'Review lists the pending change');
  await page.evaluate(() => document.querySelector('#diffDlg').close());
  await page.click('#saveBtn');
  await page.waitForSelector('#diffDlg[open]');
  ok(/Health/.test(await page.$eval('#diffBody', (e) => e.textContent)), 'change preview lists the edit');
  await page.click('#diffOk');
  await page.waitForFunction(() => __mock.selfWrite === 'sandbox1');
  ok(await page.evaluate(() => __mock.backups.length) >= 1, 'a backup of the old file was made before writing');
  const hp = await page.evaluate(() => { const o = parseJSON(dec(lzfDecompress(__mock.files.get('sandbox1').bytes))); const g = parseJSON(dec(lzfDecompress(b64decode(o.m_Dict.global)))); return sub(g, 'm_Condition_Serialized').m_CurrentHPProxy; });
  ok(hp === 99, 'edited slot was written (hp ' + hp + ')');

  ok(/Saved/.test(await page.$eval('#saveBtn', (e) => e.textContent)), 'Save button confirms with Saved');
  await page.waitForFunction(() => /Last backup/.test(document.querySelector('#saveInfoText').textContent));
  ok(true, 'last backup time is shown');
  ok(await page.evaluate(() => [...document.querySelectorAll('.toast-item')].some((t) => /Saved, backup made/.test(t.textContent))), 'toast says the backup was made');

  console.log('Validation');
  const slotHp = () => page.evaluate(() => { const o = parseJSON(dec(lzfDecompress(__mock.files.get('sandbox1').bytes))); const g = parseJSON(dec(lzfDecompress(b64decode(o.m_Dict.global)))); return sub(g, 'm_Condition_Serialized').m_CurrentHPProxy; });
  const closeDiff = async () => { await page.evaluate(() => document.querySelector('#diffDlg').close()); await page.waitForFunction(() => !document.querySelector('#diffDlg').open); };
  await page.evaluate(() => { document.querySelector('#saveBtn').classList.remove('saved'); gs('m_Condition_Serialized').m_CurrentHPProxy = 150; tldUndo.commit(); });
  await page.click('#saveBtn');
  await page.waitForSelector('#diffDlg[open]');
  const errBox = await page.$eval('#diffIssues', (e) => e.textContent);
  ok(/Fix this first/.test(errBox) && /Health: 99 → 150\. This must be 100 or less\./.test(errBox), 'an out-of-range value is shown with its old and new value: ' + errBox.slice(0, 120));
  ok(await page.$eval('#diffOk', (e) => e.hidden), 'an error blocks saving');
  await closeDiff();
  ok(await slotHp() === 99, 'nothing was written');
  await page.evaluate(() => { gs('m_Condition_Serialized').m_CurrentHPProxy = 0; tldUndo.commit(); });
  await page.click('#saveBtn');
  await page.waitForSelector('#diffDlg[open]');
  ok(/Check these values/.test(await page.$eval('#diffIssues', (e) => e.textContent)) && await page.$eval('#diffOk', (e) => !e.hidden && e.textContent === 'Save anyway'), 'a suspicious value is a warning with Save anyway');
  await page.click('#diffOk');
  await page.waitForFunction(async () => true);
  for (let i = 0; i < 40 && (await slotHp()) !== 0; i++) await page.waitForTimeout(50);
  ok(await slotHp() === 0, 'Save anyway writes the slot');
  await page.evaluate(() => tld.saveSettings({ confirmSave: false }));
  await page.evaluate(() => { gs('m_Condition_Serialized').m_CurrentHPProxy = -4; const t = gs('m_TimeOfDay_Serialized'); t.m_TimeProxy = 1.5; tldUndo.commit(); });
  await page.click('#saveBtn');
  await page.waitForSelector('#diffDlg[open]');
  const both = await page.$eval('#diffIssues', (e) => e.textContent);
  ok(/Health: 0 → -4\. This cannot be negative\./.test(both) && /Time of day: .* outside the day/.test(both), 'validation runs even when the summary before saving is turned off');
  await closeDiff();
  await page.evaluate(() => { gs('m_Condition_Serialized').m_CurrentHPProxy = 80; gs('m_TimeOfDay_Serialized').m_TimeProxy = 0.25; tldUndo.commit(); return tld.saveSettings({ confirmSave: true }); });
  await page.click('#saveBtn');
  await page.waitForSelector('#diffDlg[open]');
  ok(await page.$eval('#diffIssues', (e) => e.textContent) === '' && await page.$eval('#diffOk', (e) => e.textContent) === 'Save', 'valid changes show the normal preview');
  await page.click('#diffOk');
  for (let i = 0; i < 40 && (await slotHp()) !== 80; i++) await page.waitForTimeout(50);
  ok(await slotHp() === 80, 'and save normally');
  await page.evaluate(() => { const items = gs('m_Inventory_Serialized').m_SerializedItems; items.push(makeItem('GEAR_ScrapMetal', 3, 1)); gearOf(items[0]).m_NormalizedCondition = -0.5; tldUndo.commit(); });
  await page.click('#saveBtn');
  await page.waitForSelector('#diffDlg[open]');
  ok(/Scrap Metal, condition: new item → -50 %\. The condition cannot be negative\./.test(await page.$eval('#diffIssues', (e) => e.textContent)), 'item condition is checked');
  await closeDiff();
  const collectible = await page.evaluate(() => DATA.items.find((i) => i.cat === 'Collectible' && i.sample && !i.hide).id);
  await page.evaluate((id) => { gs('m_Inventory_Serialized').m_SerializedItems.length = 0; tldUndo.commit(); return tldStore.call('kit_save', { name: 'Two notes', items: [{ id, qty: 2 }] }); }, collectible);
  await page.evaluate(() => tldLoadouts.open({}));
  await page.click('#loadoutsDlg li[data-loadout]:has-text("Two notes") button:has-text("Add to inventory")');
  await page.waitForSelector('#diffDlg[open]');
  ok(/2 copies of .*normally has only one/.test(await page.$eval('#diffIssues', (e) => e.textContent)) && await page.$eval('#diffOk', (e) => e.textContent) === 'Add to inventory anyway', 'adding a loadout is validated too (duplicate unique items)');
  await page.click('#diffBack');
  await page.evaluate(async () => { document.querySelector('#loadoutsDlg').close(); for (const k of tldStore.peek('loadouts').slice()) await tldStore.call('kit_del', { id: k.id }); });

  console.log('Player tab');
  ok(await page.evaluate(() => [...document.querySelectorAll('#view details.fold')].map((d) => d.dataset.fold).join(',')) === 'time,cougar', 'time and cougar are collapsible and Quick profiles are gone');
  ok(await page.evaluate(() => [...document.querySelectorAll('#view details.fold')].every((d) => !d.open)), 'they start collapsed');
  ok(!/Quick profiles|Save current state/.test(await page.$eval('#view', (e) => e.textContent)), 'no Quick profiles text is left');
  await page.click('#view details[data-fold="cougar"] summary');
  ok(/Mountain Town \(threat 3\)/.test(await page.$eval('#view details[data-fold="cougar"]', (e) => e.textContent)), 'the cougar card shows the territory');
  await page.click('#cougarResetBtn');
  ok(await page.evaluate(() => gs('m_CougarManagerSerialized').m_RegionThreatLevels[0] === 0 && gs('m_CougarManagerSerialized').m_RegionThreatLevelNames[0] === 'MountainTownRegion'), 'the cougar threat can be reset to 0');
  ok(/Mountain Town \(threat 0\)/.test(await page.$eval('#view details[data-fold="cougar"]', (e) => e.textContent)) && !(await page.$('#cougarResetBtn')), 'the card shows threat 0 and hides the button');
  await page.uncheck('#cougarChk');
  ok(await page.evaluate(() => gs('m_CougarManagerSerialized').m_IsEnabled === false), 'turning the cougar off changes the slot');
  ok(await page.evaluate(() => document.querySelector('#view details[data-fold="cougar"]').open && /Off/.test(document.querySelector('#view details[data-fold="cougar"] summary').textContent)), 'the card stays open and says Off');
  await page.evaluate(() => { state.tab = 'injury'; viewRender(); });
  ok(/Severe laceration\s*1 active/.test(await page.$eval('#view', (e) => e.textContent)), 'Afflictions lists the severe laceration');
  await page.click('#view .row:has-text("Severe laceration") button:has-text("Cure")');
  ok(await page.evaluate(() => gs('m_SevereLacerationSerialized').m_IsActive === false) && /Severe laceration\s*none/.test(await page.$eval('#view', (e) => e.textContent)), 'the severe laceration can be cured');
  await page.evaluate(() => { state.tab = 'player'; viewRender(); });
  await page.click('#saveBtn');
  if (await page.$('#diffDlg[open]')) await page.click('#diffOk');
  await page.waitForFunction(() => { try { const o = parseJSON(dec(lzfDecompress(__mock.files.get('sandbox1').bytes))); const g = parseJSON(dec(lzfDecompress(b64decode(o.m_Dict.global)))); return g.m_CougarManagerSerialized.m_IsEnabled === false; } catch (e) { return false; } });
  ok(await page.evaluate(() => { const o = parseJSON(dec(lzfDecompress(__mock.files.get('sandbox1').bytes))); const g = parseJSON(dec(lzfDecompress(b64decode(o.m_Dict.global)))); return g.m_SevereLacerationSerialized.m_IsActive === false && typeof g.m_CougarManagerSerialized === 'object' && g.m_CougarManagerSerialized.m_RegionThreatLevels[0] === 0 && g.m_CougarManagerSerialized.m_CougarStates[0] === 5; }), 'the cougar changes are written and the rest of the section is kept');
  await page.evaluate(() => { document.querySelector('#view details[data-fold="cougar"]').open = false; });

  console.log('Vanishing slot');
  ok(await page.evaluate(() => !!__mock.guard && /sandbox1$/.test(__mock.guard.path) && typeof __mock.guard.offsetMin === 'number'), 'the open slot is reported to the rescue guard');
  await page.evaluate(() => __mock.emit('save-rescued', { name: 'sandbox1', path: 'C:\\Users\\Tester\\AppData\\Local\\Hinterland\\TheLongDark\\Whiteout-backups\\sandbox1-2026-11-04_18-30-12' }));
  ok(await page.evaluate(() => { const t = document.querySelector('.toast-item.warn'); return !!t && /sandbox1 disappeared/.test(t.textContent) && /Whiteout-backups/.test(t.textContent); }), 'a warning names the slot and where the copy went');
  await page.evaluate(() => __mock.emit('save-rescue-failed', 'io: disk full'));
  ok(await page.evaluate(() => /disk full/.test((document.querySelector('.toast-item.err') || {}).textContent || '')), 'a failed copy is reported');

  console.log('Item picker');
  ok(await page.evaluate(() => Object.keys(CAT_LABEL).every((k) => CAT_ICONS[k])), 'every category has its own icon');
  await page.evaluate(() => { state.tab = 'inv'; viewRender(); });
  ok(await page.evaluate(() => {
    const card = document.querySelector('#view .tablecard'), th = card && card.querySelector('th');
    if (!th) return false;
    const filler = card.querySelector('tbody').appendChild(document.createElement('tr'));
    filler.style.height = '3000px';
    card.scrollTop = 800;
    const gap = th.getBoundingClientRect().top - card.getBoundingClientRect().top;
    filler.remove();
    card.scrollTop = 0;
    return getComputedStyle(card).paddingTop === '0px' && Math.abs(gap) < 1.5;
  }), 'the inventory header sticks to the very top of the list');
  await page.click('#view button:has-text("Add item")');
  await page.waitForSelector('dialog[aria-labelledby="addTitle"][open] .itempick');
  const pk = 'dialog[aria-labelledby="addTitle"][open] ';
  ok(await page.$$eval(pk + '.itempick [role=option] svg.caticon', (els) => els.length > 50 && els.every((e) => e.getAttribute('aria-hidden') === 'true')), 'picker rows have category icons hidden from screen readers');
  ok(/^(\d+ items|Showing 400 of \d+ items)$/.test(await page.$eval(pk + '.pickfoot .count', (e) => e.textContent)), 'the number of results is shown');
  await page.fill(pk + 'input[type=search]', 'zzzz-nothing');
  ok(await page.$eval(pk + '.pickfoot .count', (e) => e.textContent) === 'No items' && /No items match/.test(await page.$eval(pk + '.itempick', (e) => e.textContent)), 'an empty result says so');
  await page.fill(pk + 'input[type=search]', '');
  await page.selectOption(pk + 'select[aria-label=Category]', 'Tools');
  ok(await page.$$eval(pk + '.itempick [role=option]', (els) => els.length > 0 && els.every((e) => catOf(e.dataset.id) === 'Tools')), 'the category filter works in the picker');
  await page.selectOption(pk + 'select[aria-label=Category]', 'all');
  await page.selectOption(pk + 'select[aria-label=Sort]', 'cat');
  ok(await page.$$eval(pk + '.itempick [role=option]', (els) => { const c = els.map((e) => CAT_LABEL[catOf(e.dataset.id)]); return c.every((x, i) => i === 0 || c[i - 1].localeCompare(x) <= 0); }), 'sorting by category works');
  await page.selectOption(pk + 'select[aria-label=Sort]', 'name');
  await page.fill(pk + 'input[type=search]', 'fuse');
  await page.focus(pk + 'input[type=search]');
  await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(() => document.activeElement.classList.contains('itempick') && !!document.activeElement.getAttribute('aria-activedescendant')), 'arrow down moves from the search into the list');
  const before3 = await page.evaluate(() => gs('m_Inventory_Serialized').m_SerializedItems.length);
  const chosen = await page.evaluate(() => document.querySelector('.itempick [aria-selected=true]').dataset.id);
  await page.keyboard.press('Enter');
  ok(await page.evaluate((n) => gs('m_Inventory_Serialized').m_SerializedItems.length === n + 1, before3) && chosen === 'GEAR_Fuse', 'Enter adds the selected item');
  await page.evaluate(() => document.querySelector('dialog[aria-labelledby="addTitle"]').close());
  ok(await page.$$eval('#view tbody .iname svg.caticon', (els) => els.length === 1 && els[0].getAttribute('aria-hidden') === 'true'), 'inventory rows show the category icon');
  await page.evaluate(() => { gs('m_Inventory_Serialized').m_SerializedItems.length = 0; tldUndo.commit(); state.tab = 'player'; viewRender(); });

  console.log('Loadouts');
  await page.evaluate(() => { state.tab = 'inv'; viewRender(); });
  ok(await page.$eval('#view .listbar-actions', (e) => /Loadouts/.test(e.textContent) && !/Kits/.test(e.textContent)), 'the inventory button says Loadouts');
  await page.click('#view button:has-text("Loadouts")');
  await page.waitForSelector('#loadoutsDlg[open] .lo-empty');
  ok(/No loadouts yet/.test(await page.$eval('#loadoutsDlg .lo-empty', (e) => e.textContent)) && await page.evaluate(() => tldStore.peek('loadouts').length === 0), 'there are no loadouts by default and the empty state explains them');
  ok(await page.evaluate(() => !/null/.test(document.querySelector('#loadoutsDlg').textContent) && !/null/.test(document.querySelector('#view').textContent)), 'no stray "null" text in the dialog or the inventory');
  await page.click('#loadoutsDlg .lo-empty button:has-text("Create loadout")');
  await page.fill('#loadoutsDlg input[maxlength="40"]', 'Tales from the Far Territory mission 1');
  ok(await page.$eval('#loadoutsDlg input[maxlength="40"]', (e) => e.maxLength) === 40, 'the name is limited to 40 characters');
  const LP = '#loadoutsDlg .picker-wrap ';
  for (const [q, id] of [['car battery', 'GEAR_CarBattery'], ['wire bundle', 'GEAR_WireBundle'], ['fuse', 'GEAR_Fuse'], ['scrap metal', 'GEAR_ScrapMetal']]) {
    await page.fill(LP + 'input[type=search]', q);
    await page.click(LP + '.itempick [data-id="' + id + '"]');
    await page.click('#loadoutsDlg button:has-text("Add to list")');
  }
  ok(await page.$$eval('#loadoutsDlg .lo-rows tbody tr', (r) => r.length) === 4, 'items are added to the loadout with the picker');
  for (const i of [1, 2, 3]) await page.fill('#loadoutsDlg .lo-rows tr[data-row="' + i + '"] input[aria-label^="Amount"]', '5');
  await page.click('#loadoutsDlg .lo-rows tr[data-row="0"] button[aria-label^="Move down"]');
  ok(await page.$eval('#loadoutsDlg .lo-rows tr[data-row="1"] .iname', (e) => e.textContent) === 'Car Battery', 'rows can be reordered');
  await page.click('#loadoutsDlg .lo-rows tr[data-row="1"] button[aria-label^="Move up"]');
  await page.click('#loadoutsDlg button:has-text("Save loadout")');
  await page.waitForSelector('#loadoutsDlg li[data-loadout]');
  const lo = await page.evaluate(() => tldStore.peek('loadouts')[0]);
  ok(lo && lo.name === 'Tales from the Far Territory mission 1' && JSON.stringify(lo.items.map((r) => [r.id, r.qty])) === '[["GEAR_CarBattery",null],["GEAR_WireBundle",5],["GEAR_Fuse",5],["GEAR_ScrapMetal",5]]', 'the loadout is saved with its amounts');
  await page.waitForFunction(() => { const d = __mock.getData(__mock.dataDefault, 'loadouts'); return d && d.loadouts.length === 1; });
  ok(true, 'it is written to loadouts.json');

  const inv0 = await page.evaluate(() => gs('m_Inventory_Serialized').m_SerializedItems.length);
  await page.click('#loadoutsDlg li[data-loadout] button:has-text("Add to inventory")');
  await page.waitForSelector('#diffDlg[open]');
  ok(/Added: .*Car Battery/.test(await page.$eval('#diffBody', (e) => e.textContent)) && await page.$eval('#diffOk', (e) => e.textContent) === 'Add to inventory', 'a preview shows what will be added');
  ok(await page.evaluate((n) => gs('m_Inventory_Serialized').m_SerializedItems.length === n, inv0), 'nothing is added while the preview is open');
  await page.click('#diffBack');
  await page.waitForFunction(() => !document.querySelector('#diffDlg').open);
  ok(await page.evaluate((n) => gs('m_Inventory_Serialized').m_SerializedItems.length === n, inv0), 'cancelling the preview adds nothing');
  await page.click('#loadoutsDlg li[data-loadout] button:has-text("Add to inventory")');
  await page.waitForSelector('#diffDlg[open]');
  await page.click('#diffOk');
  await page.waitForFunction((n) => gs('m_Inventory_Serialized').m_SerializedItems.length === n + 4, inv0);
  const units = await page.evaluate(() => gs('m_Inventory_Serialized').m_SerializedItems.slice(-4).map((it) => { const q = qtyInfo(gearOf(it)); return [it.m_PrefabName, q ? q.get() : null]; }));
  ok(JSON.stringify(units) === '[["GEAR_CarBattery",null],["GEAR_WireBundle",5],["GEAR_Fuse",5],["GEAR_ScrapMetal",5]]', 'stackable items become one stack, the battery one item: ' + JSON.stringify(units));
  await page.waitForFunction(() => document.querySelectorAll('#view tbody tr').length === 4);
  ok(true, 'the inventory list updates');

  await page.click('#loadoutsDlg li[data-loadout] button:has-text("Edit")');
  await page.fill('#loadoutsDlg input[maxlength="40"]', 'Mission 1');
  await page.fill('#loadoutsDlg textarea', 'Batteries for the radio');
  await page.fill('#loadoutsDlg .lo-rows tr[data-row="0"] input[aria-label^="Amount"]', '3');
  await page.click('#loadoutsDlg .lo-rows tr[data-row="3"] button[aria-label^="Remove"]');
  await page.click('#loadoutsDlg button:has-text("Save changes")');
  await page.waitForSelector('#loadoutsDlg li[data-loadout]');
  const edited = await page.evaluate(() => tldStore.peek('loadouts'));
  ok(edited.length === 1 && edited[0].id === lo.id && edited[0].name === 'Mission 1' && edited[0].note === 'Batteries for the radio' && edited[0].items.length === 3, 'a loadout can be edited');
  await page.click('#loadoutsDlg li[data-loadout] button:has-text("Add to inventory")');
  await page.click('#diffOk');
  await page.waitForFunction((n) => gs('m_Inventory_Serialized').m_SerializedItems.length === n + 4 + 5, inv0);
  ok(await page.evaluate(() => gs('m_Inventory_Serialized').m_SerializedItems.filter((it) => it.m_PrefabName === 'GEAR_CarBattery').length) === 4, 'a non-stackable amount adds that many separate items');

  await page.click('#loadoutsDlg li[data-loadout] button:has-text("Copy")');
  await page.waitForFunction(() => tldStore.peek('loadouts').length === 2);
  ok(await page.evaluate(() => tldStore.peek('loadouts')[1].name) === 'Mission 1 copy', 'a loadout can be copied');
  await page.click('#loadoutsDlg li[data-loadout]:last-child button:has-text("Delete")');
  await page.waitForSelector('dialog[aria-label="Delete this loadout?"]');
  await page.click('dialog[aria-label="Delete this loadout?"] button:has-text("Delete")');
  await page.waitForFunction(() => tldStore.peek('loadouts').length === 1);
  ok(true, 'deleting asks first and removes the loadout');

  await page.evaluate(() => { __mock.dialogSave = () => 'C:\\Users\\Tester\\loadouts.json'; });
  await page.click('#loadoutsDlg button:has-text("Export to file")');
  await page.waitForFunction(() => __mock.copies.some((c) => /loadouts\.json$/.test(c.path)));
  const exported = await page.evaluate(() => JSON.parse(new TextDecoder().decode(__mock.copies.find((c) => /loadouts\.json$/.test(c.path)).bytes)));
  ok(exported.format === 'whiteout-loadouts' && exported.version === 1 && exported.loadouts[0].name === 'Mission 1' && exported.loadouts[0].note === 'Batteries for the radio', 'export writes a loadout file');
  await page.evaluate((ex) => {
    __mock.setFile('loadouts.json', new TextEncoder().encode(JSON.stringify(ex)));
    __mock.setFile('old-kits.json', new TextEncoder().encode(JSON.stringify({ format: 'whiteout-kits', version: 1, kits: [{ name: 'Old winter kit', items: [{ id: 'GEAR_Fuse', qty: null, cond: 100 }] }] })));
    __mock.dialogOpen = () => 'C:\\Users\\Tester\\loadouts.json';
  }, exported);
  await page.click('#loadoutsDlg button:has-text("Import from file")');
  await page.waitForFunction(() => tldStore.peek('loadouts').length === 2);
  ok(await page.evaluate(() => tldStore.peek('loadouts')[1].name) === 'Mission 1 2', 'import adds loadouts and keeps names unique');
  await page.evaluate(() => { __mock.dialogOpen = () => 'C:\\Users\\Tester\\old-kits.json'; });
  await page.click('#loadoutsDlg button:has-text("Import from file")');
  await page.waitForFunction(() => tldStore.peek('loadouts').some((k) => k.name === 'Old winter kit'));
  ok(true, 'an old kit file can still be imported');
  await page.evaluate(() => { __mock.files.delete('loadouts.json'); __mock.files.delete('old-kits.json'); });
  await page.evaluate(() => tldStore.call('kit_save', { name: 'Odd one', items: [{ id: 'GEAR_NotInThisGame', qty: 1 }, { id: 'GEAR_Fuse', qty: 2 }] }));
  await page.evaluate(() => tldLoadouts.open({}));
  await page.click('#loadoutsDlg li[data-loadout]:last-child button:has-text("Add to inventory")');
  await page.waitForSelector('#diffDlg[open]');
  ok(/Not supported in this save, skipped: NotInThisGame/.test(await page.$eval('#diffBody', (e) => e.textContent)), 'unsupported items are skipped and listed');
  await page.click('#diffBack');
  ok(await page.evaluate(() => tldAct.byId('loadouts') && tldAct.byId('loadouts-export').title === 'Export loadouts to a file…' && !tldAct.byId('kits-export')), 'the command palette says Loadouts');
  await page.evaluate(() => { document.querySelector('#loadoutsDlg').close(); gs('m_Inventory_Serialized').m_SerializedItems.length = 0; tldUndo.commit(); state.tab = 'player'; viewRender(); });

  console.log('Restore');
  const before = await page.evaluate(() => __mock.backups.length);
  await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); });
  await page.click('#slotsBtn');
  await page.waitForSelector('#slotsDlg[open] .slot');
  await page.locator('#slotList .slot').filter({ hasText: 'Test slot' }).first().locator('button', { hasText: 'Backups' }).click();
  await page.waitForSelector('#bakDlg[open] .slot');
  ok(await page.locator('#bakList .slot').count() >= 1, 'backup is listed');
  ok(before >= 1, 'backup store has entries');

  console.log('Backup management');
  ok(await page.evaluate(() => __mock.keep) === 20, 'the backup limit is sent to the backend at startup');
  await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); __mock.backups.push({ name: 'sandbox1', bytes: new Uint8Array(2048), modified: ++__mock.clock, label: null, locked: false, auto: true }); });
  await page.click('#settingsBtn');
  await page.waitForSelector('#bakSlots details.bakslot[data-slot="sandbox1"]');
  ok(/^Backups use .+ in \d+ files\.$/.test(await page.$eval('#bakUsage', (e) => e.textContent)), 'total disk use is shown');
  ok(await page.$eval('#keepBackups', (e) => e.value) === '20' && await page.$$eval('#keepBackups option', (o) => o.map((x) => x.textContent).join('|')) === '5 backups|10 backups|20 backups|30 backups|50 backups|100 backups|200 backups|Keep all', 'Keep last offers 5 to 200 and Keep all, 20 by default');
  await page.selectOption('#keepBackups', '50');
  await page.waitForFunction(() => __mock.keep === 50 && JSON.parse(__mock.state).settings.keepBackups === 50);
  await page.selectOption('#keepBackups', '0');
  await page.waitForFunction(() => __mock.keep === 0 && JSON.parse(__mock.state).settings.keepBackups === 0);
  ok(true, 'changing the limit saves it and tells the backend');
  await page.click('#bakSlots details[data-slot="sandbox1"] summary');
  const nBak = await page.$$eval('#bakSlots details[data-slot="sandbox1"] li.slot', (l) => l.length);
  ok(nBak >= 2 && /backups/.test(await page.$eval('#bakSlots details[data-slot="sandbox1"] summary', (e) => e.textContent)), 'backups are listed per slot with date and size');
  await page.click('#bakSlots details[data-slot="sandbox1"] li.slot:first-child button:has-text("Rename")');
  await page.fill('dialog[aria-label="Rename backup"] input', 'Before the dam');
  await page.click('dialog[aria-label="Rename backup"] button:has-text("Save")');
  await page.waitForFunction(() => __mock.backups.some((b) => b.label === 'Before the dam'));
  await page.waitForFunction(() => /Before the dam/.test(document.querySelector('#bakSlots details[open]').textContent));
  ok(true, 'a backup can be renamed and the name is shown');
  await page.click('#bakSlots details[data-slot="sandbox1"] li.slot:last-child button:has-text("Delete")');
  await page.waitForSelector('dialog[aria-label="Delete this backup?"]');
  ok(true, 'deleting asks for confirmation');
  await page.click('dialog[aria-label="Delete this backup?"] button:has-text("Delete")');
  await page.waitForFunction((n) => __mock.backups.filter((b) => b.name === 'sandbox1').length === n - 1, nBak);
  ok(true, 'the confirmed backup is deleted');
  await page.click('#bakOpenFolder');
  await page.waitForFunction(() => __mock.openedBackups === true);
  ok(true, 'Open backup folder works');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

  ok(await page.evaluate(() => { document.querySelector('a[href^="https://steamcommunity.com/"]').click(); return true; }), 'link click handled');
  await page.waitForFunction(() => __mock.opened);
  ok(/^https:\/\/steamcommunity\.com\//.test(await page.evaluate(() => __mock.opened)), 'external links go through the opener');

  console.log('Tour');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await page.click('#settingsBtn');
  await page.click('#tourBtn');
  await page.waitForSelector('dialog.tour[open]');
  ok(await page.evaluate(() => !document.querySelector('#settingsDlg').open), 'Replay closes Settings and starts the tour');
  const titles = [];
  const problems = [];
  const tabsSeen = {};
  for (let i = 0; i < 60; i++) {
    const info = await page.evaluate(() => {
      const c = document.querySelector('.tour-card').getBoundingClientRect();
      const d = document.querySelector('dialog.tour');
      const sp = document.querySelector('.tour-spot').getBoundingClientRect();
      return { tab: state.tab, title: document.querySelector('#tourTitle').textContent, next: document.querySelector('.tour-next').textContent, inView: c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight, center: d.dataset.center === '1', spot: sp.width > 0 && sp.height > 0 };
    });
    titles.push(info.title);
    tabsSeen[info.title] = info.tab;
    if (!info.inView) problems.push('card off screen: ' + info.title);
    if (!info.center && !info.spot) problems.push('no spotlight: ' + info.title);
    if (info.next === 'Done') break;
    await page.click('.tour-next');
  }
  ok(titles.length >= 20, 'the tour has ' + titles.length + ' steps');
  ok(titles[titles.length - 1] === 'That is the tour', 'the tour reaches the end');
  ok(problems.length === 0, 'every step is laid out on screen' + (problems.length ? ': ' + problems.join(', ') : ''));
  ok(tabsSeen.Inventory === 'inv' && tabsSeen.Skills === 'skills' && tabsSeen.Teleport === 'tele' && tabsSeen.Afflictions === 'injury', 'the tour switches tabs while it explains them');
  ok(!titles.includes('Open a save'), 'the start screen step is skipped when a slot is open');
  await page.click('.tour-next');
  await page.waitForFunction(() => !document.querySelector('dialog.tour[open]'));
  ok(true, 'Done closes the tour');
  ok(await page.evaluate(() => state.tab) === 'player', 'the tab you were on is restored');

  console.log('Fixes from the release check');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await page.evaluate(() => tld.saveSettings({ confirmSave: false }));
  await page.evaluate(() => { document.querySelector('#saveBtn').classList.remove('saved'); gs('m_Condition_Serialized').m_CurrentHPProxy = 77; tldUndo.commit(); __mock.calls.length = 0; });
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => __mock.calls.filter((c) => c === 'write_save').length) === 1, 'Ctrl+S writes the slot once when the summary is off');
  await page.evaluate(() => tld.saveSettings({ confirmSave: true }));

  await page.evaluate(() => { state.tab = 'tele'; viewRender(); });
  ok(await page.evaluate(() => !document.querySelector('#view img') && !/data:image/.test(document.querySelector('#view').innerHTML)), 'the Teleport tab shows no bundled map image');
  ok(await page.evaluate(() => Object.values(DATA.regions).every((r) => !('img' in r))), 'data.js has no map images');
  await page.click('#teleMapBtn');
  await page.waitForFunction(() => /^#map\//.test(location.hash) && document.querySelector('#mapTeleBtn').getAttribute('aria-pressed') === 'true');
  ok(true, 'Choose on the map opens the Map view with the teleport tool on');
  await page.click('.mode[data-mode="edit"]');
  await page.waitForFunction(() => !document.body.classList.contains('mode-map'));

  const unlabeled = [];
  for (const tab of ['player', 'inv', 'skills', 'tele', 'injury']) {
    await page.evaluate((x) => { state.tab = x; viewRender(); }, tab);
    unlabeled.push(...await page.evaluate((x) => [...document.querySelectorAll('#view input, #view select, #view textarea')].filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !(el.labels && el.labels.length)).map((el) => x + ':' + el.tagName + '[' + el.type + ']'), tab));
  }
  ok(unlabeled.length === 0, 'every form field in the editor has a name' + (unlabeled.length ? ': ' + unlabeled.join(', ') : ''));
  await page.evaluate(() => { state.tab = 'inv'; viewRender(); });
  ok(await page.$eval('#view .listbar-actions', (e) => /Compare slots/.test(e.textContent)), 'Compare slots has a button on the Inventory tab');

  await page.evaluate(() => {
    const worn = { m_PrefabName: 'GEAR_WoolToque', m_SerializedGear: JSON.stringify({ m_InstanceIDProxy: 5, m_NormalizedCondition: 1, m_CurrentHPProxy: 1, m_ClothingItemSerialized: JSON.stringify({ m_WearingProxy: true }) }) };
    __mock.setFile('wornslot', __slot({ hp: 80, name: 'Worn', items: [worn] }));
    return tldDesktop.refreshList();
  });
  await page.evaluate(() => tldTools.copyItemsFrom('wornslot'));
  await page.click('dialog[aria-label="Copy items"] .kitpick input');
  await page.click('dialog[aria-label="Copy items"] button:has-text("Copy selected")');
  ok(await page.evaluate(() => { const it = gs('m_Inventory_Serialized').m_SerializedItems.slice(-1)[0]; return it.m_PrefabName === 'GEAR_WoolToque' && sub(gearOf(it), 'm_ClothingItemSerialized').m_WearingProxy === false; }), 'clothing copied from another slot is not worn');
  await page.evaluate(() => { __mock.files.delete('wornslot'); state.tab = 'player'; viewRender(); return tldDesktop.refreshList(); });

  ok(await page.evaluate(() => typeof __mock.closeHandler === 'function'), 'the window close is watched');
  await page.evaluate(() => {
    gs('m_Condition_Serialized').m_CurrentHPProxy = 55; tldUndo.commit();
    window.__closeResult = 'waiting';
    __mock.closeHandler({ preventDefault: () => { window.__closeResult = 'prevented'; } }).then(() => { if (window.__closeResult === 'waiting') window.__closeResult = 'closed'; });
  });
  await page.waitForSelector('dialog[aria-label="Close without saving?"]');
  ok(await page.evaluate(() => window.__closeResult) === 'waiting', 'closing with unsaved changes asks first');
  await page.click('dialog[aria-label="Close without saving?"] button:has-text("Cancel")');
  await page.waitForFunction(() => window.__closeResult === 'prevented');
  ok(true, 'Cancel keeps the window open');
  await page.evaluate(() => __mock.emit('menu', 'quit'));
  await page.waitForSelector('dialog[aria-label="Quit without saving?"]');
  await page.click('dialog[aria-label="Quit without saving?"] button:has-text("Cancel")');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !__mock.quit), 'Quit asks before discarding changes and Cancel stays');
  await page.evaluate(() => __mock.emit('menu', 'quit'));
  await page.waitForSelector('dialog[aria-label="Quit without saving?"]');
  await page.click('dialog[aria-label="Quit without saving?"] button:has-text("Quit")');
  await page.waitForFunction(() => __mock.quit === true);
  ok(true, 'confirming Quit quits');
  await page.click('#settingsBtn');
  await page.click('#noticesBtn');
  await page.waitForFunction(() => __mock.notices === true);
  ok(true, 'Settings opens the open source license list');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

  console.log('First run');
  const fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fresh.addInitScript(() => { window.__freshStart = true; });
  await fresh.addInitScript(MOCK);
  await fresh.goto(url);
  await fresh.waitForSelector('dialog.tour[open]', { timeout: 8000 });
  ok(true, 'the tour opens by itself on the first launch');
  await fresh.keyboard.press('Escape');
  await fresh.waitForFunction(() => !document.querySelector('dialog.tour[open]'));
  await fresh.waitForFunction(() => (JSON.parse(__mock.state).settings || {}).tourDone === true);
  ok(true, 'closing the tour remembers that it was seen');
  await fresh.close();

  console.log('Map');
  const mp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let steamHits = 0;
  await mp.route(/steamusercontent/, (r) => { steamHits++; r.abort(); });
  mp.on('pageerror', (e) => errors.push('map pageerror: ' + e.message));
  await mp.addInitScript(MOCK);
  await mp.goto(url);
  await mp.waitForFunction(() => window.tldDesktop && document.querySelector('#gameChip').dataset.state !== 'unknown');
  await mp.click('.mode[data-mode="map"]');
  await mp.waitForFunction(() => location.hash === '#map/mystery-lake');
  ok(true, 'without a slot or history the map opens in Mystery Lake');
  ok(await mp.$eval('#mapTitle', (e) => e.textContent) === 'Mystery Lake', 'the title names the region');
  const groups = await mp.$$eval('#mapList .mapnav-group', (els) => els.map((e) => e.textContent));
  ok(JSON.stringify(groups) === '["Island","Wintermute","Tales from the Far Territory","Iron Road"]', 'regions are grouped into Island, Wintermute, Far Territory and Iron Road: ' + JSON.stringify(groups));
  const navIds = await mp.$$eval('#mapList [data-region]', (els) => els.map((e) => e.dataset.go));
  const gone = ['game-world', 'connections-between-regions', 'forsaken-airfield-map-locations', 'sundered-pass-map-locations', 'zone-of-contamination-map-locations'];
  ok(navIds.length === 25 && navIds[0] === 'overview' && ['langston-mine', 'transition-cave'].every((g) => navIds.includes(g)) && !navIds.includes('game-world-map') && gone.every((g) => !navIds.includes(g)), 'Krueger maps are listed, the world map is merged into the overview, the location guides are not (' + navIds.length + ' entries including the overview)');
  await mp.click('#mapList [data-go="overview"]');
  await mp.waitForFunction(() => location.hash === '#map/overview' && document.querySelectorAll('#mapLayer .ovnode').length === 21);
  ok(await mp.$eval('#mapTitle', (e) => e.textContent) === 'Island overview', 'the overview opens from the list and names itself');
  ok(await mp.evaluate(() => document.querySelector('#mapState').hidden && !document.querySelector('#mapLayer').style.visibility), 'the overview needs no map download and asks nothing');
  ok(await mp.evaluate(() => document.querySelector('#mapPinBtn').hidden && document.querySelector('.seg').hidden), 'pins and difficulty are hidden on the overview');
  await mp.click('#mapLayer .ovnode[aria-label="Open map: Mountain Town"]');
  await mp.waitForFunction(() => location.hash === '#map/mountain-town');
  ok(await mp.evaluate(() => !document.querySelector('#mapPinBtn').hidden), 'a region from the overview opens its map and brings the pin tool back');
  await mp.evaluate(() => { location.hash = '#map/mystery-lake'; });
  await mp.waitForFunction(() => location.hash === '#map/mystery-lake' && document.querySelector('#mapTitle').textContent === 'Mystery Lake');
  ok(await mp.$eval('#mapSearch', (e) => e.placeholder === 'Regions, places and pins' && e.getAttribute('aria-label') === 'Search regions, places and pins'), 'the search field says what it finds');
  await mp.waitForFunction(() => /Load the maps from Steam\?/.test(document.querySelector('#mapState').textContent));
  ok(/IP address/.test(await mp.$eval('#mapState', (e) => e.textContent)), 'the first time, the Map asks before loading anything from Steam and explains why');
  await mp.hover('#mapList [data-go="ravine"]');
  await mp.click('#mapList [data-go="bleak-inlet"]');
  await mp.waitForFunction(() => location.hash === '#map/bleak-inlet' && /Load the maps from Steam\?/.test(document.querySelector('#mapState').textContent));
  await mp.click('#mapList [data-go="mystery-lake"]');
  await mp.waitForTimeout(300);
  ok(steamHits === 0, 'nothing is requested from Steam before the user allows it');
  await mp.click('#mapState button:has-text("Load maps")');
  await mp.waitForFunction(() => JSON.parse(__mock.state).settings.mapSteam === true);
  await mp.waitForFunction(() => /could not be loaded/.test(document.querySelector('#mapState').textContent));
  ok(steamHits > 0, 'Load maps remembers the choice and loads the image');
  ok(true, 'a map image that does not load shows a message instead of breaking the view');
  ok(!/connections-between-regions|map-locations|HOMEID/.test(fs.readFileSync(path.join(ROOT, 'map.js'), 'utf8')), 'map data has no images, transition points or hotspots from the location guides');
  await mp.click('#mapList [data-go="coastal-highway"]');
  await mp.waitForFunction(() => location.hash === '#map/coastal-highway');
  await mp.goto(url);
  await mp.waitForFunction(() => window.tldDesktop && document.querySelector('#gameChip').dataset.state !== 'unknown');
  await mp.click('.mode[data-mode="map"]');
  await mp.waitForFunction(() => location.hash === '#map/coastal-highway');
  ok(true, 'the map reopens in the region viewed last');
  await mp.waitForFunction(() => /could not be loaded/.test(document.querySelector('#mapState').textContent));
  ok(true, 'after a restart the choice is remembered and the map loads without asking');
  await mp.click('#settingsBtn');
  ok(await mp.$eval('#mapSteamChk', (e) => e.checked), 'Settings shows that Steam maps are allowed');
  await mp.click('#mapSteamChk');
  await mp.waitForFunction(() => JSON.parse(__mock.state).settings.mapSteam === false && /Load the maps from Steam\?/.test(document.querySelector('#mapState').textContent));
  ok(true, 'turning it off in Settings asks again instead of loading');
  await mp.click('#mapSteamChk');
  await mp.waitForFunction(() => JSON.parse(__mock.state).settings.mapSteam === true);
  await mp.evaluate(() => document.querySelector('#settingsDlg').close());
  await mp.evaluate(SLOT);
  await mp.evaluate(() => { __mock.setFile('sandbox1', __slot({ hp: 80, regions: ['LakeRegion', 'MineTransitionZone'] })); return tldDesktop.openPath(__mock.dir + '\\sandbox1'); });
  await mp.waitForFunction(() => state.outer && !document.body.classList.contains('mode-map'));
  await mp.click('.mode[data-mode="map"]');
  await mp.waitForFunction(() => location.hash === '#map/mystery-lake');
  ok(true, "with a slot open the map opens in the player's region");
  await mp.click('#followBtn');
  ok(await mp.$eval('#mapNote', (e) => e.hidden), 'no note while the player is in a mapped region');
  await mp.evaluate(() => { loadSec('boot').m_SceneName = 'MineTransitionZone'; tldMode.refresh(); });
  await mp.waitForFunction(() => !document.querySelector('#mapNote').hidden);
  ok(await mp.$eval('#mapNote', (e) => e.textContent) === 'The player is in an area without a map', 'follow player shows a note in an area without a map');
  ok(await mp.evaluate(() => location.hash === '#map/mystery-lake' && document.querySelector('#mapTitle').textContent === 'Mystery Lake'), 'the current map stays open');
  await mp.evaluate(() => { loadSec('boot').m_SceneName = 'CoastalRegion'; state.outer.m_Dict.CoastalRegion = b64encode(lzfCompress(enc('{}'))); tldMode.refresh(); });
  await mp.waitForFunction(() => location.hash === '#map/coastal-highway');
  ok(await mp.$eval('#mapNote', (e) => e.hidden), 'the note goes away when the player reaches a mapped region');

  console.log('Credits');
  const credits = await mp.evaluate(() => [...document.querySelectorAll('ul.credits')].map((u) => u.querySelector('li').textContent.replace(/\s+/g, ' ').trim()));
  const thanks = 'Huge thanks to HokuOwl, whose Updated Region Maps [2025] guide makes the map view in Whiteout possible, and who kindly allowed Whiteout to use the maps.';
  ok(credits[0] === thanks && credits[1] === thanks, 'HokuOwl is thanked first in Settings and in the map credits');
  ok(await mp.evaluate(() => { const a = [...document.querySelectorAll('ul.credits li:first-child a')]; return a.length === 4 && a.every((x) => x.textContent === 'HokuOwl' ? /76561198212232496/.test(x.href) : x.textContent === 'Updated Region Maps [2025]' && /id=3255435617/.test(x.href)); }), 'the guide and the author are linked');
  ok(await mp.evaluate(() => { const html = document.documentElement.innerHTML; return /Krueger/.test(html) && html.includes('76561198054890338') && html.includes('2899955301') && !/\[2024\]/.test(html); }), 'Krueger is credited and linked for the maps he made, and the old 2024 guide is not mentioned');
  ok(await mp.evaluate(() => !/Elektronixx/.test(document.documentElement.innerHTML) && [...document.querySelectorAll('ul.credits')][0].textContent.includes('Wiki')), 'the wiki credit is kept and Elektronixx is not mentioned');
  await mp.close();

  console.log('Data folder');
  const ready = async (pg) => { await pg.waitForFunction(() => window.tldDesktop && window.tldStore && tldStore.status().checked); };
  const dp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  dp.on('pageerror', (e) => errors.push('data pageerror: ' + e.message));
  await dp.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tld-bookmarks', JSON.stringify([{ name: 'Cabin', region: 'LakeRegion', x: 1, y: 2, z: 3 }]));
    localStorage.setItem('tld-jalki', JSON.stringify({ sandbox1: [['LakeRegion', 1, 2], ['LakeRegion', 30, 40]] }));
    localStorage.setItem('tld-jalki-nakyy', '0');
    window.__setup = (m) => {
      m.state = JSON.stringify({
        settings: { tourDone: true },
        pins: [{ id: '00000000000000aa', map: 'mystery-lake', x: 1, y: 2, name: 'Old pin', note: '', color: 'ember', created: '2026-01-01T00:00:00.000Z' }],
        kits: [{ id: '00000000000000ab', name: 'Old kit', items: [{ id: 'GEAR_Fuse', qty: null, cond: 100 }], created: '2026-01-01T00:00:00.000Z' }],
        profiles: [],
      });
    };
  });
  await dp.addInitScript(MOCK);
  await dp.goto(url);
  await ready(dp);
  const def = await dp.evaluate(() => ({ pins: __mock.getData(__mock.dataDefault, 'pins'), kits: __mock.getData(__mock.dataDefault, 'loadouts'), bm: __mock.getData(__mock.dataDefault, 'bookmarks'), trail: __mock.getData(__mock.dataDefault, 'trail') }));
  ok(def.pins && def.pins.version === 1 && def.pins.pins[0].name === 'Old pin', 'old pins are moved to pins.json in the default folder');
  ok(def.kits && def.kits.version === 1 && def.kits.loadouts[0].name === 'Old kit', 'old kits are moved to loadouts.json');
  ok(def.bm && def.bm.bookmarks[0].name === 'Cabin' && def.trail && def.trail.trails[0].slot === 'sandbox1' && def.trail.trails[0].points.length === 2, 'bookmarks and the trail are moved from browser storage');
  const ls = await dp.evaluate(() => ({ keys: Object.keys(localStorage).sort(), vis: localStorage.getItem('whiteout-trail-visible') }));
  ok(JSON.stringify(ls.keys) === '["whiteout-trail-visible"]' && ls.vis === '0', 'old browser storage keys are renamed and migrated once: ' + JSON.stringify(ls.keys));
  const st0 = await dp.evaluate(() => JSON.parse(__mock.state));
  ok(!st0.pins && !st0.kits && st0.cache && st0.settings.tourDone === true, 'settings stay local and the old copies are gone from state.json');
  await dp.click('#settingsBtn');
  ok(await dp.$eval('#dataDirPath', (e) => e.textContent) === 'C:\\Users\\Tester\\AppData\\Roaming\\whiteout\\data' && await dp.$eval('#dataDirReset', (e) => e.hidden), 'Settings shows the default data folder');
  await dp.click('#dataDirOpen');
  await dp.waitForFunction(() => __mock.openedFolder === __mock.dataDefault);
  ok(true, 'Open folder opens the data folder');

  await dp.evaluate(() => {
    __mock.putData('/cloud', 'pins', JSON.stringify({ version: 1, pins: [{ id: '00000000000000bb', map: 'ravine', x: 5, y: 5, name: 'Cloud pin', note: '', color: 'frost', created: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }] }));
    __mock.dialogOpen = () => '/cloud';
  });
  await dp.click('#dataDirPick');
  await dp.waitForSelector('dialog[aria-label="Change data folder"]');
  const choiceText = await dp.$eval('dialog[aria-label="Change data folder"]', (e) => e.textContent);
  ok(/already has Whiteout data: pins\.json/.test(choiceText) && /Nothing is overwritten/.test(choiceText), 'switching to a folder with data says so clearly');
  ok(await dp.$$eval('dialog[aria-label="Change data folder"] button', (b) => b.map((x) => x.textContent).join('|')) === 'Move my data here|Use the files already in that folder|Cancel', 'the three choices are offered');
  await dp.click('dialog[aria-label="Change data folder"] button:has-text("Cancel")');
  ok(await dp.evaluate(() => tldStore.status().dir === __mock.dataDefault && __mock.getData('/cloud', 'pins').pins.length === 1), 'Cancel changes nothing');
  await dp.click('#dataDirPick');
  await dp.click('dialog[aria-label="Change data folder"] button:has-text("Move my data here")');
  await dp.waitForFunction(() => tldStore.status().dir === '/cloud' && __mock.getData('/cloud', 'loadouts'));
  const moved = await dp.evaluate(() => ({ pins: __mock.getData('/cloud', 'pins').pins.map((p) => p.name).sort(), local: tldStore.peek('pins').map((p) => p.name).sort(), dir: JSON.parse(__mock.state).settings.dataDir }));
  ok(JSON.stringify(moved.pins) === '["Cloud pin","Old pin"]' && JSON.stringify(moved.local) === '["Cloud pin","Old pin"]', 'Move my data here combines both without losing anything');
  ok(moved.dir === '/cloud', 'the folder path is kept in the local settings');
  ok(await dp.$eval('#dataDirPath', (e) => e.textContent) === '/cloud' && !(await dp.$eval('#dataDirReset', (e) => e.hidden)), 'Settings shows the chosen folder and Reset to default');

  await dp.evaluate(() => {
    const cur = __mock.getData('/cloud', 'pins');
    cur.pins.push({ id: '00000000000000cc', map: 'ravine', x: 9, y: 9, name: 'Phone pin', note: '', color: 'green', created: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' });
    __mock.putData('/cloud', 'pins', JSON.stringify(cur));
    window.dispatchEvent(new Event('focus'));
  });
  await dp.waitForFunction(() => tldStore.peek('pins').some((p) => p.name === 'Phone pin'));
  ok(true, 'changes from another device are read when the window gets focus');

  await dp.evaluate(async () => {
    const cur = __mock.getData('/cloud', 'pins');
    const p = cur.pins.find((x) => x.name === 'Old pin');
    p.name = 'Remote name'; p.updatedAt = '2099-01-01T00:00:00.000Z';
    __mock.putData('/cloud', 'pins', JSON.stringify(cur));
    const mine = tldStore.peek('pins').find((x) => x.name === 'Old pin');
    await tldStore.call('pin_save', { ...mine, name: 'Local name' });
    await tldStore.sync();
  });
  const conflict = await dp.evaluate(() => ({ local: tldStore.peek('pins').map((p) => p.name).sort(), file: __mock.getData('/cloud', 'pins').pins.map((p) => p.name).sort() }));
  ok(JSON.stringify(conflict.local) === '["Cloud pin","Local name (conflict)","Phone pin","Remote name"]', 'a conflict keeps the newer copy and the other one as "(conflict)": ' + JSON.stringify(conflict.local));
  ok(JSON.stringify(conflict.file) === JSON.stringify(conflict.local), 'the merged result is written back');

  await dp.evaluate(() => {
    __mock.putData('/other', 'loadouts', JSON.stringify({ version: 1, loadouts: [{ id: '00000000000000dd', name: 'Shared loadout', note: '', items: [{ id: 'GEAR_Fuse', qty: 5, cond: null }], created: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }] }));
    __mock.dialogOpen = () => '/other';
  });
  const cloudBefore = await dp.evaluate(() => __mock.fs.get('/cloud/pins.json').text);
  await dp.click('#dataDirPick');
  await dp.click('dialog[aria-label="Change data folder"] button:has-text("Use the files already in that folder")');
  await dp.waitForFunction(() => tldStore.status().dir === '/other');
  const used = await dp.evaluate(() => ({ kits: tldStore.peek('loadouts').map((k) => k.name), pins: tldStore.peek('pins').length }));
  ok(JSON.stringify(used.kits) === '["Shared loadout"]' && used.pins === 0, 'Use the files already in that folder loads them');
  ok(await dp.evaluate((t) => __mock.fs.get('/cloud/pins.json').text === t, cloudBefore), 'the previous folder is left untouched');
  await dp.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await dp.close();

  const off = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  off.on('pageerror', (e) => errors.push('offline pageerror: ' + e.message));
  await off.addInitScript(() => {
    window.__setup = (m) => {
      m.state = JSON.stringify({ settings: { tourDone: true, dataDir: '/Volumes/GoogleDrive/Whiteout' }, cache: { pins: { local: [{ id: '00000000000000ee', map: 'ravine', x: 1, y: 1, name: 'Cached pin', note: '', color: 'ember', created: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }], base: [], mtime: 5, dir: '/Volumes/GoogleDrive/Whiteout' } } });
    };
  });
  await off.addInitScript(MOCK);
  await off.goto(url);
  await ready(off);
  await off.waitForFunction(() => !document.querySelector('#dataBar').hidden);
  ok(await off.$eval('#dataText', (e) => e.textContent) === 'Your data folder is not available. Using a temporary local copy.', 'a missing data folder shows a clear banner');
  await off.evaluate(() => tldStore.call('pin_save', { map: 'ravine', x: 2, y: 2, name: 'Offline pin' }));
  ok(await off.evaluate(() => tldStore.peek('pins').map((p) => p.name).join() === 'Cached pin,Offline pin' && ![...__mock.fs.keys()].some((k) => k.startsWith('/Volumes'))), 'the local copy keeps working and nothing is written to the missing folder');
  await off.evaluate(() => { __mock.dirs.add('/Volumes/GoogleDrive/Whiteout'); __mock.putData('/Volumes/GoogleDrive/Whiteout', 'pins', JSON.stringify({ version: 1, pins: [{ id: '00000000000000ee', map: 'ravine', x: 1, y: 1, name: 'Cached pin', note: '', color: 'ember', created: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] })); });
  await off.click('#dataRetryBtn');
  await off.waitForFunction(() => document.querySelector('#dataBar').hidden && (__mock.getData('/Volumes/GoogleDrive/Whiteout', 'pins').pins || []).length === 2);
  ok(true, 'when the folder comes back, the local copy is merged into it and the banner goes away');
  await off.close();

  const bad = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  bad.on('pageerror', (e) => errors.push('bad pageerror: ' + e.message));
  await bad.addInitScript(() => { window.__setup = (m) => { m.putData(m.dataDefault, 'pins', '{ broken'); m.putData(m.dataDefault, 'bookmarks', JSON.stringify({ version: 7, bookmarks: [] })); }; });
  await bad.addInitScript(MOCK);
  await bad.goto(url);
  await ready(bad);
  await bad.waitForFunction(() => !document.querySelector('#dataBar').hidden);
  const badText = await bad.$eval('#dataText', (e) => e.textContent);
  ok(/pins\.json in your data folder could not be read/.test(badText) && /bookmarks\.json .* newer version/.test(badText), 'a broken or newer data file is reported');
  await bad.evaluate(() => tldStore.call('pin_save', { map: 'ravine', x: 2, y: 2, name: 'New pin' }));
  ok(await bad.evaluate(() => __mock.fs.get(__mock.dataKey(__mock.dataDefault, 'pins')).text === '{ broken' && tldStore.peek('pins').length === 1), 'the broken file is not overwritten and the change is kept locally');
  await bad.close();

  console.log('Updates');
  const fresh2 = async (setup) => {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    pg.on('pageerror', (e) => errors.push('update pageerror: ' + e.message));
    await pg.addInitScript(setup);
    await pg.addInitScript(MOCK);
    await pg.goto(url);
    await ready(pg);
    return pg;
  };
  const off2 = await fresh2(() => { window.__setup = (m) => { m.updaterReady = false; m.update = '9.9.9'; }; });
  await off2.waitForTimeout(2000);
  ok(await off2.evaluate(() => !__mock.updateChecks && document.querySelector('#updateBar').hidden), 'with the placeholder key the app never checks for updates');
  await off2.click('#settingsBtn');
  await off2.waitForFunction(() => /not set up/.test(document.querySelector('#updateNote').textContent));
  ok(await off2.$eval('#updateCheckBtn', (e) => e.disabled) && /Version 0\.1\.0/.test(await off2.$eval('#updateVersion', (e) => e.textContent)), 'Settings says update checks are off and shows the version');
  await off2.close();

  const ask = await fresh2(() => { window.__setup = (m) => { m.updaterReady = true; m.update = '0.2.0'; }; });
  await ask.waitForFunction(() => !document.querySelector('#updateAskBar').hidden, null, { timeout: 8000 });
  ok(await ask.evaluate(() => !__mock.updateChecks && /GitHub/.test(document.querySelector('#updateAskBar').textContent)), 'the first launch asks before checking for updates and names GitHub');
  await ask.click('#updateAskYes');
  await ask.waitForFunction(() => __mock.updateChecks === 1 && JSON.parse(__mock.state).settings.autoUpdate === true);
  ok(true, 'allowing it saves the choice and checks');
  await ask.close();
  const no = await fresh2(() => { window.__setup = (m) => { m.updaterReady = true; m.update = '0.2.0'; }; });
  await no.waitForFunction(() => !document.querySelector('#updateAskBar').hidden, null, { timeout: 8000 });
  await no.click('#updateAskNo');
  await no.waitForFunction(() => JSON.parse(__mock.state).settings.autoUpdate === false);
  ok(await no.evaluate(() => !__mock.updateChecks), 'Not now never checks');
  await no.close();

  const up = await fresh2(() => { window.__setup = (m) => { m.updaterReady = true; m.update = '0.2.0'; m.state = JSON.stringify({ settings: { tourDone: true, autoUpdate: true } }); }; });
  await up.waitForFunction(() => !document.querySelector('#updateBar').hidden, null, { timeout: 8000 });
  ok(await up.$eval('#updateText', (e) => e.textContent) === 'Whiteout 0.2.0 is available.' && await up.$$eval('#updateBar button', (b) => b.map((x) => x.textContent).join('|')) === 'Install|Later|Release notes', 'a found update shows a small notice with Install, Later and Release notes');
  ok(await up.evaluate(() => !__mock.installed && __mock.updateChecks === 1 && JSON.parse(__mock.state).settings.lastUpdateCheck > 0), 'nothing is downloaded before Install, and the check time is saved');
  await up.click('#updateNotesBtn');
  await up.waitForFunction(() => __mock.opened === 'https://github.com/Sinerla-Development/Whiteout/releases/tag/v0.2.0');
  ok(true, 'Release notes open the release page');
  await up.click('#updateLaterBtn');
  ok(await up.$eval('#updateBar', (e) => e.hidden), 'Later hides the notice');
  await up.click('#settingsBtn');
  await up.waitForFunction(() => /connects to GitHub/.test(document.querySelector('#updateNote').textContent));
  ok(await up.$eval('#autoUpdateChk', (e) => e.checked && !e.disabled), 'Settings shows automatic checks on and explains the GitHub connection');
  await up.click('#updateCheckBtn');
  await up.waitForFunction(() => /0\.2\.0 is available/.test(document.querySelector('#updateStatus').textContent) && !document.querySelector('#updateBar').hidden);
  await up.evaluate(() => document.querySelector('#settingsDlg').close());
  await up.click('#updateInstallBtn');
  await up.waitForFunction(() => __mock.installed === '0.2.0' && __mock.relaunched === true);
  ok(true, 'Install downloads, installs and restarts');
  await up.close();

  const recent = await fresh2(() => { window.__setup = (m) => { m.updaterReady = true; m.update = '0.2.0'; m.state = JSON.stringify({ settings: { tourDone: true, autoUpdate: true, lastUpdateCheck: Date.now() - 3600000 } }); }; });
  await recent.waitForTimeout(2000);
  ok(await recent.evaluate(() => !__mock.updateChecks), 'it checks at most once a day');
  await recent.close();

  const quiet = await fresh2(() => { window.__setup = (m) => { m.updaterReady = true; m.updateFail = true; m.state = JSON.stringify({ settings: { tourDone: true, autoUpdate: true } }); }; });
  await quiet.waitForFunction(() => __mock.updateChecks === 1, null, { timeout: 8000 });
  await quiet.waitForTimeout(300);
  ok(await quiet.evaluate(() => document.querySelector('#updateBar').hidden && !document.querySelector('.toast-item.err') && !/network/.test(document.body.textContent)), 'a network error during the automatic check is silent');
  await quiet.click('#settingsBtn');
  await quiet.click('#updateCheckBtn');
  await quiet.waitForFunction(() => /Could not check for updates/.test(document.querySelector('#updateStatus').textContent));
  ok(true, 'Check now reports a network error');
  await quiet.close();

  const optout = await fresh2(() => { window.__setup = (m) => { m.updaterReady = true; m.update = '0.2.0'; m.state = JSON.stringify({ settings: { tourDone: true, autoUpdate: false } }); }; });
  await optout.waitForTimeout(2000);
  ok(await optout.evaluate(() => !__mock.updateChecks), 'turning automatic checks off stops them');
  await optout.close();

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  server.close();
  console.log(failures ? failures + ' failed' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
