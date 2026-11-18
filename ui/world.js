(() => {
  'use strict';

  const TRIGGERS = 'm_LoadSceneTriggersSerialized';
  const SPAWNERS = 'm_RadialObjectSpawnersSerialized';
  const EXTRA_REGIONS = ['MountainPassRegion'];
  const EXTRA_NAMES = { MountainPassRegion: 'Sundered Pass' };
  const PREFAB_NAMES = {
    GEAR_Stick: 'Sticks', GEAR_Stone: 'Stones', INTERACTIVE_BranchA_Prefab: 'Branches', INTERACTIVE_LimbA_Prefab: 'Limbs', INTERACTIVE_LimbB_Prefab: 'Limbs',
    GEAR_CrowFeather: 'Crow feathers', GEAR_BarkTinder: 'Bark', GEAR_Coal: 'Coal',
  };

  const jsonLike = (s) => typeof s === 'string' && (s.trim()[0] === '{' || s.trim()[0] === '[');
  const kid = (o, key) => {
    if (!o || typeof o !== 'object') return undefined;
    const v = o[key];
    if (v instanceof Nested) return v.val;
    return jsonLike(v) ? sub(o, key) : v;
  };

  function entries(sec, key) {
    const o = kid(sec, key);
    if (!o || !Array.isArray(o.strings)) return [];
    const out = [];
    for (let i = 0; i < o.strings.length; i++) {
      const e = kid(o.strings, i);
      if (e && typeof e === 'object') out.push(e);
    }
    return out;
  }

  function bunkers(sg) {
    const list = sg && Array.isArray(sg.m_BunkerSetup) ? sg.m_BunkerSetup : [];
    return list.map((b) => {
      const id = String(b.m_InteriorId || '');
      const m = /^PrepperCache([A-Z])(Empty)?_/.exec(id);
      const letter = m ? m[1] : '?';
      const full = !!m && !m[2];
      return { id: String(b.m_BunkerId || ''), interior: id, letter, full, type: full ? 'Stocked cache' : 'Abandoned cache' };
    }).filter((b) => b.id);
  }

  function hatches(sec, ids) {
    const out = [];
    for (const e of entries(sec, TRIGGERS)) if (ids.has(String(e.m_GameGuid || ''))) out.push(e);
    return out;
  }

  function cacheView(sg, regions, read) {
    const list = bunkers(sg);
    const ids = new Set(list.map((b) => b.id));
    const where = new Map();
    for (const r of regions) {
      let sec = null;
      try { sec = read(r); } catch (e) { sec = null; }
      if (!sec) continue;
      for (const e of hatches(sec, ids)) where.set(String(e.m_GameGuid), { region: r, explored: e.m_Explored === true });
    }
    return list.map((b) => Object.assign({}, b, where.get(b.id) || { region: null, explored: false }));
  }

  function revealHatches(sec, ids) {
    let n = 0;
    for (const e of hatches(sec, ids)) if (e.m_Explored !== true) { e.m_Explored = true; n++; }
    return n;
  }

  function unlockRegions(md, names) {
    if (!md || typeof md !== 'object') return 0;
    if (!Array.isArray(md.m_UnlockedRegionNames)) md.m_UnlockedRegionNames = [];
    let n = 0;
    for (const r of names) if (!md.m_UnlockedRegionNames.includes(r)) { md.m_UnlockedRegionNames.push(r); n++; }
    return n;
  }

  const prefabName = (p) => {
    const base = String(p).split(' ')[0];
    if (PREFAB_NAMES[base]) return PREFAB_NAMES[base];
    return base.replace(/^(GEAR|INTERACTIVE)_/, '').replace(/_Prefab$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  };

  function spawnerView(sec, now) {
    const v = { total: 0, waiting: 0, soonest: null, latest: null, items: new Map() };
    for (const e of entries(sec, SPAWNERS)) {
      v.total++;
      const t = num(e.m_GameHourTimeToRespawn, 0);
      if (t > now) {
        v.waiting++;
        if (v.soonest === null || t < v.soonest) v.soonest = t;
        if (v.latest === null || t > v.latest) v.latest = t;
      }
      for (const p of Array.isArray(e.m_SpawnedPrefabNames) ? e.m_SpawnedPrefabNames : []) {
        const n = prefabName(p);
        v.items.set(n, (v.items.get(n) || 0) + 1);
      }
    }
    return v;
  }

  function respawnNow(sec, now) {
    let n = 0;
    for (const e of entries(sec, SPAWNERS)) if (num(e.m_GameHourTimeToRespawn, 0) > now) { e.m_GameHourTimeToRespawn = now; n++; }
    return n;
  }

  function changes(orig, live, ids, now, label) {
    const lines = [];
    const exp = (s) => hatches(s, ids).filter((e) => e.m_Explored === true).length;
    const a = exp(orig), b = exp(live);
    if (a !== b) lines.push(label + ': prepper hatches visited ' + a + ' → ' + b);
    const wa = spawnerView(orig, now).waiting, wb = spawnerView(live, now).waiting;
    if (wa !== wb) lines.push(label + ': sticks and stones waiting to respawn ' + wa + ' → ' + wb);
    return lines;
  }

  function unlockedChanges(orig, live) {
    const a = orig && Array.isArray(orig.m_UnlockedRegionNames) ? orig.m_UnlockedRegionNames : [];
    const b = live && Array.isArray(live.m_UnlockedRegionNames) ? live.m_UnlockedRegionNames : [];
    const added = b.filter((r) => !a.includes(r)), removed = a.filter((r) => !b.includes(r));
    const lines = [];
    if (added.length) lines.push('Regions unlocked on the map, added: ' + added.join(', '));
    if (removed.length) lines.push('Regions unlocked on the map, removed: ' + removed.join(', '));
    return lines;
  }

  const api = { bunkers, cacheView, revealHatches, unlockRegions, spawnerView, respawnNow, changes, unlockedChanges, prefabName, entries };
  if (typeof document === 'undefined' || typeof TABS === 'undefined') { if (typeof module !== 'undefined') module.exports = api; return; }
  window.tldWorld = api;

  const peeked = { outer: null, secs: new Map() };
  function peek(k) {
    if (state.sec[k]) return state.sec[k];
    if (peeked.outer !== state.outer) { peeked.outer = state.outer; peeked.secs = new Map(); }
    if (!peeked.secs.has(k)) {
      const raw = state.outer.m_Dict[k];
      peeked.secs.set(k, typeof raw === 'string' ? parseJSON(dec(lzfDecompress(b64decode(raw)))) : null);
    }
    return peeked.secs.get(k);
  }
  const placeName = (k) => EXTRA_NAMES[k] || regionName(k);
  const regionKeys = () => Object.keys(state.outer.m_Dict).filter((k) => REGION_RE.test(k));
  const nowHours = () => num((gs('m_TimeOfDay_Serialized') || {}).m_HoursPlayedNotPausedProxy, 0);
  const bunkerIds = () => new Set(bunkers(loadSec('sandbox_global')).map((b) => b.id));

  const origCache = { text: null, val: null };
  function origOf(k) {
    const t = state.origText[k];
    if (typeof t !== 'string') return null;
    if (origCache.text !== t) { origCache.text = t; origCache.val = parseJSON(t); }
    return origCache.val;
  }

  function pending() {
    if (!state.outer) return [];
    const lines = [];
    let ids = null;
    for (const k of Object.keys(state.sec)) {
      if (!REGION_RE.test(k) || ser(state.sec[k]) === state.origText[k]) continue;
      if (!ids) ids = bunkerIds();
      lines.push(...changes(parseJSON(state.origText[k]), state.sec[k], ids, nowHours(), placeName(k)));
    }
    const g = origOf('global');
    if (g) lines.push(...unlockedChanges(sub(g, 'm_MapDataSerialized'), gs('m_MapDataSerialized')));
    return lines;
  }
  api.pending = pending;

  function fold(id, title, hint, kids) {
    return h('div', { class: 'card', 'data-fold': 'more-' + id }, h('h3', {}, title), ...[].concat(kids()).flat().filter(Boolean));
  }

  function forceReveal() {
    const ids = bunkerIds();
    let hatchN = 0;
    for (const k of regionKeys()) {
      const p = peek(k);
      if (!p || !hatches(p, ids).some((e) => e.m_Explored !== true)) continue;
      hatchN += revealHatches(loadSec(k), ids);
    }
    const md = gs('m_MapDataSerialized');
    const names = Array.from(new Set([...Object.keys(DATA.regions), ...EXTRA_REGIONS, ...regionKeys().filter((k) => /Region$/.test(k) || k in DATA.regions)]));
    const regN = unlockRegions(md, names);
    viewRender();
    toast(hatchN + ' hatch' + (hatchN === 1 ? '' : 'es') + ' marked visited and ' + regN + ' region' + (regN === 1 ? '' : 's') + ' opened on the map. Remember to save.');
  }

  function cachesFold() {
    return fold('caches', 'Prepper caches', '', () => {
      let list;
      try { list = cacheView(loadSec('sandbox_global'), regionKeys(), peek); } catch (e) { return [h('p', { class: 'muted' }, 'Could not read the prepper caches. ' + e.message)]; }
      if (!list.length) return [h('p', { class: 'muted' }, 'This save has no prepper caches.')];
      const stocked = list.filter((c) => c.full), empty = list.filter((c) => !c.full);
      const byName = (a, b) => (!a.region - !b.region) || (a.region ? placeName(a.region).localeCompare(placeName(b.region)) : 0);
      const group = (title, items) => [h('p', { class: 'cgroup' }, title)].concat(items.sort(byName).map((c) => h('div', { class: 'cacherow' },
        h('div', { class: 'cname' }, h('span', { class: c.region ? '' : 'muted' }, c.region ? placeName(c.region) : 'Region not visited yet'), h('small', {}, c.type)),
        h('span', { class: c.explored ? 'tag ok' : 'tag warn' }, c.explored ? 'visited' : 'not visited'))));
      return [
        ...group('Stocked', stocked),
        ...group('Abandoned', empty),
        h('p', { class: 'small muted' }, 'A cache shows its region once you\'ve been to that region.'),
        h('div', { class: 'actions' }, h('button', { onclick: forceReveal }, 'Force reveal')),
        h('p', { class: 'small muted' }, 'Marks every hatch in the save as visited and opens every region on the map. Regions you haven\'t been to have no hatch yet, so those stay unknown. Not tried in the game yet.'),
      ];
    });
  }

  const fmtWait = (hrs) => (hrs >= 48 ? Math.round(hrs / 24) + ' days' : Math.max(0, Math.round(hrs)) + ' h');

  function spawnersFold() {
    return fold('spawners', 'Sticks and stones', 'respawn times of sticks, stones, branches and feathers per region', () => {
      const now = nowHours();
      const rows = [];
      for (const k of regionKeys()) {
        let v;
        try { v = spawnerView(peek(k), now); } catch (e) { continue; }
        if (v.total) rows.push([k, v]);
      }
      if (!rows.length) return [h('p', { class: 'muted' }, 'No spawners found in this save.')];
      rows.sort((a, b) => placeName(a[0]).localeCompare(placeName(b[0])));
      const respawn = (keys) => {
        let n = 0;
        for (const k of keys) n += respawnNow(loadSec(k), now);
        viewRender();
        toast(n + ' spawner' + (n === 1 ? '' : 's') + ' set to respawn now. Remember to save.');
      };
      const kids = [];
      for (const [k, v] of rows) {
        const items = Array.from(v.items).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => c + ' ' + n.toLowerCase()).join(', ');
        kids.push(h('div', { class: 'row r3' },
          h('label', {}, placeName(k), h('small', {}, v.waiting ? 'Next in ' + fmtWait(v.soonest - now) + ', all back in ' + fmtWait(v.latest - now) : v.total + ' spawners'), items ? h('small', {}, items) : null),
          h('span', { class: v.waiting ? 'tag warn' : 'tag ok' }, v.waiting ? v.waiting + ' waiting' : 'all ready'),
          h('button', { class: 'ghost', disabled: !v.waiting, onclick: () => respawn([k]) }, 'Respawn now')));
      }
      const waitingKeys = rows.filter(([, v]) => v.waiting).map(([k]) => k);
      kids.push(h('div', { class: 'actions' }, h('button', { disabled: !waitingKeys.length, onclick: () => respawn(waitingKeys) }, 'Respawn all')));
      kids.push(h('p', { class: 'small muted' }, 'Respawn now makes the waiting ones ready right away, so the game should roll new sticks and stones next time you load the region. Not tried in the game yet.'));
      return kids;
    });
  }

  api.folds = () => [cachesFold(), spawnersFold()];
})();
