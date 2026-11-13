class Raw {
  constructor(t) { this.t = t; }
  valueOf() { return Number(this.t); }
  toString() { return this.t; }
}

class Nested {
  constructor(orig, val) {
    this.orig = orig;
    this.val = val;
    this.snap = ser(val);
  }
}

function parseJSON(src) {
  let i = 0;
  const n = src.length;
  const numRe = /-?(?:Infinity|NaN|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
  function fail(msg) { throw new Error('JSON error at ' + i + (msg ? ': ' + msg : '')); }
  function ws() {
    while (i < n) {
      const c = src.charCodeAt(i);
      if (c === 32 || c === 10 || c === 13 || c === 9) i++; else break;
    }
  }
  function str() {
    if (src[i] !== '"') fail('expected a string');
    const start = i;
    let j = i + 1;
    for (;;) {
      const q = src.indexOf('"', j);
      if (q < 0) fail('unterminated string');
      let b = 0, k = q - 1;
      while (k > start && src.charCodeAt(k) === 92) { b++; k--; }
      if (b % 2 === 0) {
        const raw = src.slice(start, q + 1);
        i = q + 1;
        return raw.indexOf('\\') < 0 ? raw.slice(1, -1) : JSON.parse(raw);
      }
      j = q + 1;
    }
  }
  function val() {
    ws();
    const c = src[i];
    if (c === '{') {
      i++;
      const o = {};
      ws();
      if (src[i] === '}') { i++; return o; }
      for (;;) {
        ws();
        const k = str();
        ws();
        if (src[i] !== ':') fail('expected :');
        i++;
        const v = val();
        if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
        else o[k] = v;
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return o; }
        fail('expected , or }');
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      ws();
      if (src[i] === ']') { i++; return a; }
      for (;;) {
        a.push(val());
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return a; }
        fail('expected , or ]');
      }
    }
    if (c === '"') return str();
    if (src.startsWith('true', i)) { i += 4; return true; }
    if (src.startsWith('false', i)) { i += 5; return false; }
    if (src.startsWith('null', i)) { i += 4; return null; }
    numRe.lastIndex = i;
    const m = numRe.exec(src);
    if (!m) fail('unexpected character ' + JSON.stringify(c));
    i += m[0].length;
    const t = m[0];
    if (/Infinity|NaN/.test(t)) return new Raw(t);
    const num = Number(t);
    return String(num) === t ? num : new Raw(t);
  }
  const v = val();
  ws();
  if (i < n) fail('extra content');
  return v;
}

function ser(v) {
  const out = [];
  (function w(x) {
    if (x === null || x === undefined) { out.push('null'); return; }
    const t = typeof x;
    if (t === 'string') { out.push(JSON.stringify(x)); return; }
    if (t === 'boolean') { out.push(x ? 'true' : 'false'); return; }
    if (t === 'number') {
      if (!isFinite(x)) { out.push(Number.isNaN(x) ? 'NaN' : (x > 0 ? 'Infinity' : '-Infinity')); return; }
      out.push(String(x));
      return;
    }
    if (x instanceof Raw) { out.push(x.t); return; }
    if (x instanceof Nested) {
      const cur = ser(x.val);
      out.push(JSON.stringify(cur === x.snap ? x.orig : cur));
      return;
    }
    if (Array.isArray(x)) {
      out.push('[');
      for (let k = 0; k < x.length; k++) { if (k) out.push(','); w(x[k]); }
      out.push(']');
      return;
    }
    out.push('{');
    let first = true;
    for (const k of Object.keys(x)) {
      if (x[k] === undefined) continue;
      if (!first) out.push(',');
      first = false;
      out.push(JSON.stringify(k), ':');
      w(x[k]);
    }
    out.push('}');
  })(v);
  return out.join('');
}

function sub(parent, key) {
  if (parent === null || parent === undefined) return undefined;
  const v = parent[key];
  if (v instanceof Nested) return v.val;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || (s[0] !== '{' && s[0] !== '[')) return undefined;
    let p;
    try { p = parseJSON(v); } catch (e) { return undefined; }
    parent[key] = new Nested(v, p);
    return p;
  }
  if (v && typeof v === 'object') return v;
  return undefined;
}

function num(v, d) {
  if (v === undefined || v === null) return d === undefined ? 0 : d;
  const n = Number(v);
  return Number.isNaN(n) ? (d === undefined ? 0 : d) : n;
}

function lzfDecompress(inp) {
  const n = inp.length;
  let out = new Uint8Array(Math.max(n * 4, 1024));
  let op = 0, ip = 0;
  function need(extra) {
    if (op + extra > out.length) {
      let cap = out.length * 2;
      while (cap < op + extra) cap *= 2;
      const b = new Uint8Array(cap);
      b.set(out.subarray(0, op));
      out = b;
    }
  }
  while (ip < n) {
    const c = inp[ip++];
    if (c < 32) {
      const l = c + 1;
      if (ip + l > n) throw new Error('LZF: compressed data ends unexpectedly');
      need(l);
      out.set(inp.subarray(ip, ip + l), op);
      op += l;
      ip += l;
    } else {
      let l = c >> 5;
      if (l === 7) l += inp[ip++];
      let ref = op - ((c & 31) << 8) - 1 - inp[ip++];
      l += 2;
      if (ref < 0) throw new Error('LZF: invalid back-reference');
      need(l);
      for (let k = 0; k < l; k++) out[op++] = out[ref++];
    }
  }
  return out.slice(0, op);
}

function lzfCompress(inp) {
  const n = inp.length;
  const out = new Uint8Array(n * 2 + 64);
  const HLOG = 16;
  const ht = new Int32Array(1 << HLOG).fill(-1);
  let ip = 0, op = 0, lit = 0;
  const hash = (p) => Math.imul((inp[p] << 16) | (inp[p + 1] << 8) | inp[p + 2], 2654435761) >>> (32 - HLOG);
  function flush(end) {
    while (lit < end) {
      const l = Math.min(32, end - lit);
      out[op++] = l - 1;
      for (let k = 0; k < l; k++) out[op++] = inp[lit++];
    }
  }
  while (ip + 2 < n) {
    const h = hash(ip);
    const ref = ht[h];
    ht[h] = ip;
    if (ref >= 0 && ip - ref - 1 < 8192 && inp[ref] === inp[ip] && inp[ref + 1] === inp[ip + 1] && inp[ref + 2] === inp[ip + 2]) {
      let len = 3;
      const maxlen = Math.min(264, n - ip);
      while (len < maxlen && inp[ref + len] === inp[ip + len]) len++;
      flush(ip);
      const off = ip - ref - 1;
      const l = len - 2;
      if (l < 7) out[op++] = (off >> 8) | (l << 5);
      else { out[op++] = (off >> 8) | (7 << 5); out[op++] = l - 7; }
      out[op++] = off & 255;
      for (let k = 1; k < len; k++) {
        const p = ip + k;
        if (p + 2 < n) ht[hash(p)] = p;
      }
      ip += len;
      lit = ip;
    } else ip++;
  }
  flush(n);
  return out.slice(0, op);
}

function b64decode(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function b64encode(u) {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

const enc = (s) => new TextEncoder().encode(s);
const dec = (u) => new TextDecoder('utf-8').decode(u);

if (typeof module !== 'undefined') module.exports = { Raw, Nested, parseJSON, ser, sub, num, lzfCompress, lzfDecompress, b64decode, b64encode, enc, dec };

const SKILL_LEVELS = { Firestarting: [0, 20, 50, 100, 200], CarcassHarvesting: [0, 15, 30, 50, 100], Cooking: [0, 25, 75, 150, 350], IceFishing: [0, 10, 50, 150, 250], Rifle: [0, 10, 25, 50, 100],
  Archery: [0, 15, 40, 75, 125], ClothingRepair: [0, 25, 75, 150, 350], Revolver: [0, 10, 25, 50, 100], Gunsmithing: [0, 15, 30, 50, 100] };
function skillLv(id, pts) {
  const th = SKILL_LEVELS[id];
  if (!th) return 0;
  let lv = 1;
  for (let i = 1; i < th.length; i++) if (pts >= th[i]) lv = i + 1;
  return lv;
}
function skillLevel(id, pts) {
  const th = SKILL_LEVELS[id];
  if (!th) return id;
  const lv = skillLv(id, pts);
  return lv >= 5 ? 'Level 5 / 5, maximum' : 'Level ' + lv + ' / 5, ' + (th[lv] - pts) + ' points to next level';
}
const CAT_LABEL = { FirstAid: 'First aid', Clothing: 'Clothing', Food: 'Food and drink', Tools: 'Tools', Materials: 'Materials', Collectible: 'Collectibles', Books: 'Books', Hidden: 'Hidden', Unknown: 'Other' };
const SKILL_NAMES = { Firestarting: 'Firestarting', CarcassHarvesting: 'Carcass harvesting', Cooking: 'Cooking', IceFishing: 'Ice fishing', Rifle: 'Rifle', Archery: 'Archery', ClothingRepair: 'Clothing repair', Revolver: 'Revolver', Gunsmithing: 'Gunsmithing' };
const AFFLICTIONS = [
  ['m_SprainedAnkleSerialized', 'Sprained ankle'],
  ['m_SprainedWristSerialized', 'Sprained wrist'],
  ['m_SprainPainSerialized', 'Sprain pain'],
  ['m_BloodLossSerialized', 'Bleeding'],
  ['m_BrokenRibSerialized', 'Broken rib'],
  ['m_InfectionSerialized', 'Infection'],
  ['m_InfectionRiskSerialized', 'Infection risk'],
  ['m_FrostbiteSerialized', 'Frostbite'],
  ['m_SevereLacerationSerialized', 'Severe laceration']
];
const LIST_FIELDS = new Set(['m_CausesLocIDs', 'm_Locations', 'm_ElapsedHoursList', 'm_DurationHoursList', 'm_ElapsedRestList', 'm_PainKillersTaken', 'm_BandagesApplied', 'm_NumHoursRestForCureList', 'm_AntibioticsTakenList', 'm_AntisepticTakenList', 'm_Causes', 'm_EndTimes', 'm_LocationsWithActiveFrostbite', 'm_LocationsWithFrostbiteRisk']);
const REGION_RE = /(Region|TransitionZone[A-Za-z]*)$/;
const SYSTEM_SECTIONS = new Set(['global', 'boot', 'screenshot', 'info', 'sandbox_global']);

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const state = { fileName: '', origBytes: null, outer: null, sec: {}, origText: {}, tab: 'player', cheat: true, backedUp: false, heights: {}, tele: null, itemFilter: '', pick: { q: '', cat: 'all', sort: 'name', hidden: false } };

function loadSec(k) {
  if (state.sec[k]) return state.sec[k];
  if (!state.outer.m_Dict || typeof state.outer.m_Dict[k] !== 'string') return null;
  const text = dec(lzfDecompress(b64decode(state.outer.m_Dict[k])));
  state.origText[k] = text;
  state.sec[k] = parseJSON(text);
  return state.sec[k];
}
const G = () => loadSec('global');
const gs = (name) => sub(G(), name);

function fmtHours(hh) {
  const d = Math.floor(hh / 24);
  return 'day ' + (d + 1) + ', ' + hh.toFixed(1) + ' h played';
}

function openBytes(bytes, name) {
  let outer;
  try {
    outer = parseJSON(dec(lzfDecompress(bytes)));
  } catch (e) {
    toast('Could not read the file: ' + e.message, 'err');
    return;
  }
  if (!outer || typeof outer !== 'object' || !outer.m_Dict || typeof outer.m_Dict !== 'object') {
    toast('This is not a game slot. Profile and settings files cannot be edited with this tool. Choose a slot file such as sandbox1.', 'err');
    return;
  }
  state.fileName = name;
  state.origBytes = bytes;
  state.outer = outer;
  state.sec = {};
  state.origText = {};
  state.heights = {};
  state.tele = null;
  state.backedUp = false;
  try { G(); } catch (e) {
    state.outer = null;
    toast('Could not read the slot\'s global section: ' + e.message, 'err');
    return;
  }
  rebase();
  render();
  toast('Opened: ' + name);
}

function buildOutput() {
  if (state.cheat) {
    const pm = gs('m_PlayerManagerSerialized');
    if (pm) pm.m_CheatsUsed = true;
  }
  for (const k of Object.keys(state.sec)) {
    const text = ser(state.sec[k]);
    if (text !== state.origText[k]) state.outer.m_Dict[k] = b64encode(lzfCompress(enc(text)));
  }
  return lzfCompress(enc(ser(state.outer)));
}

function readerFor(outer) {
  const secs = {};
  const sec = (k) => {
    if (!(k in secs)) secs[k] = outer.m_Dict && typeof outer.m_Dict[k] === 'string' ? parseJSON(dec(lzfDecompress(b64decode(outer.m_Dict[k])))) : null;
    return secs[k];
  };
  return { sec, gs: (n) => sub(sec('global'), n) };
}
const liveReader = () => ({ sec: loadSec, gs });

function afflictionCount(o, key) {
  let n = 0;
  for (const f of Object.keys(o)) if (LIST_FIELDS.has(f) && Array.isArray(o[f])) n = Math.max(n, o[f].length);
  if (key === 'm_FrostbiteSerialized' && Array.isArray(o.m_LocationsCurrentFrostbiteDamage)) n = Math.max(n, o.m_LocationsCurrentFrostbiteDamage.filter((v) => num(v) > 0).length);
  if (o.m_IsActive === true) n = Math.max(n, 1);
  return n;
}

function summarize(R, willCheat) {
  const o = (n) => R.gs(n) || {};
  const cond = o('m_Condition_Serialized'), hun = o('m_Hunger_Serialized'), thi = o('m_Thirst_Serialized'), fat = o('m_Fatigue_Serialized'), fre = o('m_Freezing_Serialized');
  const inv = o('m_Inventory_Serialized'), pm = o('m_PlayerManagerSerialized'), sm = o('m_SkillsManagerSerialized'), ps = o('m_PlayerSkillsSerialized');
  const val = (obj, k) => (obj[k] === undefined ? null : num(obj[k]));
  const S = {
    values: [['Health', val(cond, 'm_CurrentHPProxy')], ['Calories', val(hun, 'm_CurrentReserveCaloriesProxy')], ['Thirst', val(thi, 'm_CurrentThirstProxy')], ['Fatigue', val(fat, 'm_CurrentFatigueProxy')], ['Cold', val(fre, 'm_CurrentFreezingProxy')]],
    flags: [['Cannot die', !!cond.m_NeverDieProxy], ['Invulnerable', !!cond.m_Invulnerable], ['Unlimited carry', !!inv.m_ForceOverrideWeight], ['Marked as cheated', !!pm.m_CheatsUsed || !!willCheat]],
    items: new Map(), skills: [], aff: [],
    more: typeof tldMore !== 'undefined' ? tldMore.snap(R) : new Map(),
  };
  for (const it of Array.isArray(inv.m_SerializedItems) ? inv.m_SerializedItems : []) {
    const g = gearOf(it);
    if (!g) continue;
    const q = qtyInfo(g);
    S.items.set(num(g.m_InstanceIDProxy) + ':' + it.m_PrefabName, { prefab: it.m_PrefabName, cond: Math.round(num(g.m_NormalizedCondition) * 100), qty: q ? +q.get().toFixed(2) : null, unit: q ? q.label : '' });
  }
  for (const k of Object.keys(sm)) {
    if (!/^m_Skill_.+Serialized$/.test(k)) continue;
    const s = sub(sm, k);
    if (s && 'm_Points' in s) S.skills.push([k.replace(/^m_Skill_/, '').replace(/Serialized$/, ''), num(s.m_Points)]);
  }
  for (const k of Object.keys(ps)) S.skills.push([k, num(ps[k])]);
  for (const [key, label] of AFFLICTIONS) { const a = R.gs(key); if (a) S.aff.push([label, afflictionCount(a, key)]); }
  const boot = R.sec('boot') || {};
  S.pos = { scene: boot.m_SceneName || '', p: (pm.m_SaveGamePosition || [0, 0, 0]).map((x) => num(x)) };
  return S;
}

function rebase() {
  try { state.base = summarize(liveReader(), false); } catch (e) { state.base = null; }
}

const fmtNum = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','));
function listNames(arr) {
  const c = new Map();
  for (const it of arr) c.set(it.prefab, (c.get(it.prefab) || 0) + 1);
  const parts = Array.from(c, ([p, n]) => (n > 1 ? n + ' × ' : '') + itemName(p));
  return parts.slice(0, 6).join(', ') + (parts.length > 6 ? ' and ' + (parts.length - 6) + ' more' : '');
}
function diffSections(a, b) {
  const out = [];
  const add = (title, lines) => { if (lines.length) out.push([title, lines]); };
  add('Needs', a.values.flatMap(([k, x], i) => { const y = b.values[i][1]; return x !== null && y !== null && Math.abs(x - y) > 0.049 ? [k + ': ' + fmtNum(x) + ' → ' + fmtNum(y)] : []; }));
  add('Settings', a.flags.flatMap(([k, x], i) => (x !== b.flags[i][1] ? [k + ': ' + (b.flags[i][1] ? 'on' : 'off')] : [])));
  const added = [], removed = [], changed = [];
  for (const [id, it] of b.items) {
    const old = a.items.get(id);
    if (!old) { added.push(it); continue; }
    if (old.cond !== it.cond) changed.push(itemName(it.prefab) + ': condition ' + old.cond + ' → ' + it.cond + ' %');
    if (old.qty !== null && it.qty !== null && Math.abs(old.qty - it.qty) > 0.004) changed.push(itemName(it.prefab) + ': amount ' + fmtNum(old.qty) + ' → ' + fmtNum(it.qty) + ' ' + it.unit);
  }
  for (const [id, it] of a.items) if (!b.items.has(id)) removed.push(it);
  const rl = [];
  if (added.length) rl.push('Added: ' + listNames(added));
  if (removed.length) rl.push('Removed: ' + listNames(removed));
  rl.push(...changed.slice(0, 8));
  if (changed.length > 8) rl.push('… and ' + (changed.length - 8) + ' more changes');
  add('Inventory', rl);
  const bs = new Map(b.skills);
  add('Skills', a.skills.flatMap(([k, x]) => (bs.has(k) && bs.get(k) !== x ? [(SKILL_NAMES[k] || { m_RepairSkill: 'Repair', m_CleanSkill: 'Cleaning', m_SharpenSkill: 'Sharpening' }[k] || k) + ': ' + x + ' → ' + bs.get(k) + ' points'] : [])));
  const ba = new Map(b.aff);
  add('Afflictions', a.aff.flatMap(([k, x]) => (ba.has(k) && ba.get(k) !== x ? [k + ': ' + (ba.get(k) === 0 ? 'cured' : x + ' → ' + ba.get(k) + ' active')] : [])));
  if (typeof tldMore !== 'undefined' && a.more && b.more) {
    const ml = tldMore.diff(a.more, b.more);
    add('More', ml.length > 30 ? ml.slice(0, 30).concat(['… and ' + (ml.length - 30) + ' more changes']) : ml);
  }
  const moved = Math.hypot(a.pos.p[0] - b.pos.p[0], a.pos.p[2] - b.pos.p[2]) > 5;
  if (moved || a.pos.scene !== b.pos.scene) {
    const at = (s) => regionName(s.scene) + ', x ' + s.p[0].toFixed(0) + ', z ' + s.p[2].toFixed(0);
    add('Location', [at(a.pos) + ' → ' + at(b.pos)]);
  }
  return out;
}

function showChanges(o) {
  const dlg = $('#diffDlg');
  const issues = o.issues || { errors: [], warnings: [] };
  const blocked = issues.errors.length > 0, warned = issues.warnings.length > 0;
  $('#diffTitle').textContent = o.title;
  $('#diffLead').textContent = o.sections.length ? o.lead : o.empty;
  const issueList = (list) => h('ul', { class: 'changes' }, list.map((i) => h('li', {}, h('strong', {}, i.field + ': '), i.from + ' → ' + i.to + '. ', h('span', { class: 'muted' }, i.msg))));
  $('#diffIssues').replaceChildren(...[
    blocked ? h('div', { class: 'issues err', role: 'alert' }, h('h3', {}, issues.errors.length === 1 ? 'Fix this first' : 'Fix these first'), h('p', { class: 'small' }, o.confirmLabel ? 'These values would break the save, so ' + (o.confirmLabel === 'Save' ? 'saving' : 'this') + ' is blocked until they are fixed.' : 'These values would break the save.'), issueList(issues.errors)) : null,
    warned ? h('div', { class: 'issues warn', role: blocked ? null : 'alert' }, h('h3', {}, 'Check these values'), h('p', { class: 'small' }, 'They are allowed, but the game does not normally produce them.'), issueList(issues.warnings)) : null].filter(Boolean));
  $('#diffBody').replaceChildren(...o.sections.flatMap(([title, lines]) => [h('h3', {}, title), h('ul', { class: 'changes' }, lines.map((l) => h('li', {}, l)))]));
  const ok = $('#diffOk'), back = $('#diffBack');
  ok.hidden = !o.confirmLabel || blocked;
  ok.textContent = o.confirmLabel ? (warned ? (o.confirmLabel === 'Save' ? 'Save anyway' : o.confirmLabel + ' anyway') : o.confirmLabel) : '';
  ok.classList.toggle('danger', warned);
  ok.classList.toggle('primary', !warned);
  back.textContent = o.confirmLabel ? 'Back' : 'Close';
  return new Promise((resolve) => {
    let result = false;
    const done = () => { ok.removeEventListener('click', yes); back.removeEventListener('click', no); dlg.removeEventListener('close', done); resolve(result); };
    const yes = () => { result = true; dlg.close(); };
    const no = () => dlg.close();
    ok.addEventListener('click', yes); back.addEventListener('click', no); dlg.addEventListener('close', done);
    dlg.showModal();
    (o.confirmLabel && !blocked && !warned ? ok : back).focus();
  });
}

async function confirmChanges() {
  let issues = { errors: [], warnings: [] };
  if (window.tldValidate) { try { issues = tldValidate.checkSave(); } catch (e) { console.error(e); } }
  const clean = !issues.errors.length && !issues.warnings.length;
  if (clean && window.tldPrefs && window.tldPrefs.confirmSave === false) return true;
  let sections = [];
  if (state.base) { try { sections = diffSections(state.base, summarize(liveReader(), state.cheat)); } catch (e) { console.error(e); if (clean) return true; } }
  else if (clean) return true;
  return showChanges({ title: clean ? 'Review changes' : 'Check before saving', lead: 'These changes will be saved:', empty: 'No changes compared to the last save.', sections, confirmLabel: 'Save', issues });
}

function slider(label, obj, key, min, max, step, hint) {
  const cur = num(obj[key]);
  const rng = h('input', { type: 'range', min, max, step, value: cur, 'aria-label': label });
  const box = h('input', { type: 'number', min, max, step, value: +cur.toFixed(3), 'aria-label': label + ' value' });
  const set = (v) => { obj[key] = v; rng.value = v; box.value = +(+v).toFixed(3); };
  rng.addEventListener('input', () => set(parseFloat(rng.value)));
  box.addEventListener('change', () => { const v = parseFloat(box.value); if (!Number.isNaN(v)) set(v); });
  return h('div', { class: 'row' }, h('label', {}, label, hint ? h('small', {}, hint) : null), rng, box);
}

function check(label, get, set, hint) {
  const c = h('input', { type: 'checkbox', checked: get() });
  c.addEventListener('change', () => set(c.checked));
  return h('label', { class: 'chk' }, c, h('span', {}, label, hint ? h('small', {}, hint) : null));
}

function viewPlayer() {
  const cond = gs('m_Condition_Serialized') || {};
  const hun = gs('m_Hunger_Serialized') || {};
  const thi = gs('m_Thirst_Serialized') || {};
  const fat = gs('m_Fatigue_Serialized') || {};
  const fre = gs('m_Freezing_Serialized') || {};
  const inv = gs('m_Inventory_Serialized') || {};
  const tod = gs('m_TimeOfDay_Serialized') || {};
  const rows = [
    slider('Health', cond, 'm_CurrentHPProxy', 0, 100, 0.5, '0 – 100'),
    h('div', { class: 'row' }, h('label', {}, 'Calories', h('small', {}, 'stored')),
      (() => {
        const b = h('input', { type: 'number', min: 0, max: 100000, step: 10, value: +num(hun.m_CurrentReserveCaloriesProxy).toFixed(1), 'aria-label': 'Calories' });
        b.addEventListener('change', () => { const v = parseFloat(b.value); if (!Number.isNaN(v)) hun.m_CurrentReserveCaloriesProxy = v; });
        return b;
      })(), h('span', {}), h('button', { class: 'ghost', onclick: () => { hun.m_CurrentReserveCaloriesProxy = 2500; viewRender(); } }, 'Set 2500')),
    slider('Thirst', thi, 'm_CurrentThirstProxy', 0, 100, 0.5, '0 = not thirsty'),
    slider('Fatigue', fat, 'm_CurrentFatigueProxy', 0, 100, 0.5, '0 = rested'),
    'm_CurrentFreezingProxy' in fre ? slider('Cold', fre, 'm_CurrentFreezingProxy', 0, 100, 0.5, '0 = warm') : null
  ];
  const full = h('button', { onclick: () => {
    cond.m_CurrentHPProxy = 100;
    hun.m_CurrentReserveCaloriesProxy = 2500;
    thi.m_CurrentThirstProxy = 0;
    fat.m_CurrentFatigueProxy = 0;
    if ('m_CurrentFreezingProxy' in fre) fre.m_CurrentFreezingProxy = 0;
    viewRender();
    toast('Needs filled. Remember to save.');
  } }, 'Fill all needs');
  const toggles = h('div', { class: 'card' },
    h('h3', {}, 'Special options'),
    check('Cannot die', () => !!cond.m_NeverDieProxy, (v) => { cond.m_NeverDieProxy = v; }),
    check('Invulnerable', () => !!cond.m_Invulnerable, (v) => { cond.m_Invulnerable = v; }),
    check('Unlimited carry', () => !!inv.m_ForceOverrideWeight, (v) => { inv.m_ForceOverrideWeight = v; if (v && inv.m_OverridedWeight === undefined) inv.m_OverridedWeight = 0; }));
  const info = h('div', { class: 'card' }, h('h3', {}, 'Slot'),
    h('p', { class: 'muted' }, 'Time played: ' + fmtHours(num(tod.m_HoursPlayedNotPausedProxy))),
    check('Mark as cheated', () => state.cheat, (v) => { state.cheat = v; }, 'Sets the cheats-used flag in the save.'));
  return h('div', { class: 'grid2' }, h('div', { class: 'card' }, h('h3', {}, 'Needs'), rows, h('div', { class: 'actions' }, full)), h('div', {}, toggles, info));
}

let _nc = null;
function nameCount() {
  if (!_nc) { _nc = {}; for (const it of DATA.items) _nc[it.name] = (_nc[it.name] || 0) + 1; }
  return _nc;
}

function catOf(prefab) {
  const it = catalogById()[prefab];
  return it ? it.cat : 'Unknown';
}

let _catalog = null;
function catalogById() {
  if (!_catalog) { _catalog = {}; for (const it of DATA.items) _catalog[it.id] = it; }
  return _catalog;
}
const itemName = (p) => (catalogById()[p] && catalogById()[p].name) || DATA.names[p] || p.replace('GEAR_', '');

function gearOf(item) { return sub(item, 'm_SerializedGear'); }

const CAT_ICONS = {
  FirstAid: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
  Clothing: '<path d="M9 3.5 4 6l-1.5 5 3 1V20.5h13V12l3-1L20 6l-5-2.5c-.5 1.5-1.6 2.5-3 2.5S9.5 5 9 3.5Z"/>',
  Food: '<ellipse cx="12" cy="6" rx="6.5" ry="2.5"/><path d="M5.5 6v12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6M5.5 11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5"/>',
  Tools: '<path d="M14.5 4.5a4 4 0 0 0-4.8 5.2l-6.2 6.2a1.8 1.8 0 0 0 2.6 2.6l6.2-6.2a4 4 0 0 0 5.2-4.8l-2.4 2.4-2.6-.6-.6-2.6Z"/>',
  Materials: '<circle cx="7" cy="12" r="4.5"/><circle cx="7" cy="12" r="1.5"/><path d="M7 7.5h12a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H7"/>',
  Collectible: '<path d="m12 3.5 2.6 5.3 5.9.8-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.8Z"/>',
  Books: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5Zm0 0v13"/>',
  Hidden: '<path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/><path d="m4 4 16 16"/>',
  Unknown: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9.7 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1.1.9-1.1 1.6v.4M12 16.5h.01"/>',
};
function catIcon(cat) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'caticon cat-' + (CAT_ICONS[cat] ? cat : 'Unknown'));
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  el.innerHTML = CAT_ICONS[cat] || CAT_ICONS.Unknown;
  return el;
}

function pickable(it, showHidden) {
  if (it.hide && !showHidden) return false;
  return !!(it.sample || it.src === 'game' || Object.keys(it.comp).length || ['Collectible', 'Materials', 'Tools', 'Books', 'Hidden'].includes(it.cat));
}

function itemPicker(o) {
  o = o || {};
  const st = o.state || { q: '', cat: 'all', sort: 'name', hidden: false };
  const uid = 'pick' + (itemPicker.n = (itemPicker.n || 0) + 1);
  const search = h('input', { type: 'search', placeholder: 'Search items', 'aria-label': 'Search items', value: st.q, autocomplete: 'off', spellcheck: 'false', 'aria-controls': uid });
  const cat = h('select', { 'aria-label': 'Category' }, h('option', { value: 'all' }, 'All categories'), Object.entries(CAT_LABEL).filter(([k]) => k !== 'Hidden').map(([k, v]) => h('option', { value: k }, v)));
  cat.value = st.cat;
  const sort = h('select', { 'aria-label': 'Sort' }, h('option', { value: 'name' }, 'Sort: name'), h('option', { value: 'cat' }, 'Sort: category'));
  sort.value = st.sort;
  const hidden = h('input', { type: 'checkbox', checked: st.hidden });
  const count = h('span', { class: 'muted small count', role: 'status', 'aria-live': 'polite' });
  const list = h('ul', { id: uid, class: 'itempick', role: 'listbox', tabindex: '0', 'aria-label': o.label || 'Items' });
  let rows = [], sel = -1;
  const LIMIT = 400;
  function mark(i, scroll) {
    sel = rows.length ? Math.max(0, Math.min(rows.length - 1, i)) : -1;
    list.querySelectorAll('[role=option]').forEach((li, k) => li.setAttribute('aria-selected', String(k === sel)));
    if (sel >= 0) {
      list.setAttribute('aria-activedescendant', uid + '-' + sel);
      const li = list.children[sel];
      if (scroll && li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
    } else list.removeAttribute('aria-activedescendant');
    if (o.onSelect) o.onSelect(sel >= 0 ? rows[sel].id : null);
  }
  function draw() {
    const q = search.value.trim().toLowerCase();
    const all = DATA.items.filter((it) => pickable(it, hidden.checked)
      && (cat.value === 'all' || it.cat === cat.value)
      && (!q || it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q)));
    all.sort((a, b) => (sort.value === 'cat' ? (CAT_LABEL[a.cat] || '').localeCompare(CAT_LABEL[b.cat] || '') : 0) || a.name.localeCompare(b.name, 'en'));
    rows = all.slice(0, LIMIT);
    list.replaceChildren(...rows.map((it, i) => {
      const dupe = nameCount()[it.name] > 1;
      return h('li', { id: uid + '-' + i, role: 'option', 'aria-selected': 'false', 'data-id': it.id, onclick: () => mark(i), ondblclick: () => { mark(i); if (o.onPick) o.onPick(it.id); } },
        catIcon(it.cat), h('span', { class: 'pick-name' }, it.name, dupe ? h('small', { class: 'muted' }, ' ' + it.id.replace('GEAR_', '')) : null),
        it.sample ? null : h('span', { class: 'tag', title: it.src === 'game' ? 'Found in the game files, never seen in a save, so it keeps the game defaults' : null }, it.src === 'game' ? 'untested' : 'legacy'), h('small', { class: 'muted pick-cat' }, CAT_LABEL[it.cat] || ''));
    }));
    if (!rows.length) list.append(h('li', { class: 'empty muted' }, 'No items match. Try another search or category.'));
    count.textContent = !all.length ? 'No items' : all.length > LIMIT ? 'Showing ' + LIMIT + ' of ' + all.length + ' items' : all.length === 1 ? '1 item' : all.length + ' items';
    mark(rows.length ? Math.min(Math.max(sel, 0), rows.length - 1) : -1);
    st.q = search.value; st.cat = cat.value; st.sort = sort.value; st.hidden = hidden.checked;
  }
  const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
  list.addEventListener('keydown', (e) => {
    if (e.key in step) { e.preventDefault(); mark(sel + step[e.key], true); }
    else if (e.key === 'Home') { e.preventDefault(); mark(0, true); }
    else if (e.key === 'End') { e.preventDefault(); mark(rows.length - 1, true); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); if (o.onPick) o.onPick(rows[sel].id); }
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); list.focus(); mark(sel < 0 ? 0 : sel, true); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); if (o.onPick) o.onPick(rows[sel].id); }
  });
  search.addEventListener('input', () => { sel = 0; draw(); });
  cat.addEventListener('change', () => { sel = 0; draw(); });
  sort.addEventListener('change', draw);
  hidden.addEventListener('change', draw);
  draw();
  const el = h('div', { class: 'picker-wrap' },
    h('div', { class: 'toolbar' }, search, cat, sort),
    list,
    h('div', { class: 'toolbar pickfoot' }, count, h('label', { class: 'chk inline' }, hidden, h('span', {}, 'Show hidden'))));
  return { el, get value() { return sel >= 0 ? rows[sel].id : null; }, focus() { search.focus(); }, refresh: draw };
}

function compObj(g, key) { return sub(g, key); }

function qtyInfo(g) {
  let c = compObj(g, 'm_StackableItemSerialized');
  if (c && 'm_UnitsProxy' in c) return { label: 'pcs', get: () => num(c.m_UnitsProxy), set: (v) => { c.m_UnitsProxy = Math.max(0, Math.round(v)); }, scaleWeight: true, step: 1 };
  c = compObj(g, 'm_LiquidItemSerialized');
  if (c) return { label: 'liters', get: () => num(c.m_LiquidLitersProxy) / 1e9, set: (v) => { c.m_LiquidLitersProxy = Math.round(v * 1e9); }, scaleWeight: true, step: 0.05 };
  c = compObj(g, 'm_WaterSupplySerialized');
  if (c) return { label: 'liters', get: () => num(c.m_VolumeProxy) / 1e9, set: (v) => { c.m_VolumeProxy = Math.round(v * 1e9); }, step: 0.05 };
  c = compObj(g, 'm_FoodItemSerialized');
  if (c && 'm_CaloriesRemainingProxy' in c) return { label: 'kcal', get: () => num(c.m_CaloriesRemainingProxy), set: (v) => { c.m_CaloriesRemainingProxy = v; if (num(c.m_CaloriesTotal) < v) c.m_CaloriesTotal = v; }, step: 10 };
  c = compObj(g, 'm_KeroseneLampItemSerialized');
  if (c && 'm_CurrentFuelLitersProxy' in c) return { label: 'liters', get: () => num(c.m_CurrentFuelLitersProxy) / 1e9, set: (v) => { c.m_CurrentFuelLitersProxy = Math.round(v * 1e9); }, step: 0.05 };
  return null;
}

function setQty(g, v) {
  const q = qtyInfo(g);
  if (!q) return;
  const old = q.get();
  q.set(v);
  if (q.scaleWeight && old > 0 && g.m_WeightKG !== undefined) g.m_WeightKG = Math.round(num(g.m_WeightKG) * (q.get() / old));
}

function maxHpFor(g, prefab) {
  const n = num(g.m_NormalizedCondition), hp = num(g.m_CurrentHPProxy);
  if (n > 0.001 && hp > 0) return Math.round(hp / n * 100) / 100;
  const items = gs('m_Inventory_Serialized').m_SerializedItems;
  for (const it of items) {
    if (it.m_PrefabName !== prefab) continue;
    const og = gearOf(it);
    if (og && num(og.m_NormalizedCondition) > 0.001 && num(og.m_CurrentHPProxy) > 0) return Math.round(num(og.m_CurrentHPProxy) / num(og.m_NormalizedCondition) * 100) / 100;
  }
  const s = DATA.samples[prefab];
  if (s && num(s.m_NormalizedCondition) > 0.001 && num(s.m_CurrentHPProxy) > 0) return Math.round(num(s.m_CurrentHPProxy) / num(s.m_NormalizedCondition) * 100) / 100;
  return 100;
}

function setCond(g, prefab, c) {
  c = Math.max(0, Math.min(1, c));
  const mx = maxHpFor(g, prefab);
  g.m_NormalizedCondition = c;
  g.m_CurrentHPProxy = +(c * mx).toFixed(4);
  if (c > 0) g.m_WornOut = false;
}

function uniqueId(items) {
  const used = new Set();
  for (const it of items) { const g = gearOf(it); if (g) used.add(num(g.m_InstanceIDProxy)); }
  for (;;) {
    const id = (Math.floor(Math.random() * 4294967295) - 2147483648) | 0;
    if (id !== 0 && !used.has(id)) return id;
  }
}

function makeItem(prefab, qty, cond) {
  const inv = gs('m_Inventory_Serialized');
  const items = inv.m_SerializedItems;
  const now = num(gs('m_TimeOfDay_Serialized').m_HoursPlayedNotPausedProxy);
  const pos = (gs('m_PlayerManagerSerialized').m_SaveGamePosition || [0, 0, 0]).map((x) => num(x));
  const meta = catalogById()[prefab] || { comp: {} };
  let g;
  if (DATA.samples[prefab]) g = JSON.parse(JSON.stringify(DATA.samples[prefab]));
  else {
    g = { m_CurrentHPProxy: 100, m_NormalizedCondition: 1, m_GearItemSaveVersion: 5, m_InspectSerialized: '{}' };
    for (const [k, v] of Object.entries(meta.comp || {})) g[k] = JSON.stringify(v);
  }
  g.m_HoursPlayed = now;
  g.m_Position = pos;
  g.m_Rotation = [0, 0, 0, 1];
  g.m_InstanceIDProxy = uniqueId(items);
  g.m_BeenInPlayerInventoryProxy = true;
  g.m_BeenInspectedProxy = true;
  g.m_ItemLootedProxy = true;
  g.m_HasBeenOwnedByPlayer = true;
  g.m_BeenInContainerProxy = false;
  g.m_NonInteractive = false;
  for (const k of Object.keys(g)) {
    if (typeof g[k] === 'string' && k.endsWith('Serialized') && g[k][0] === '{') {
      g[k] = g[k].replace(/"m_HoursPlayed":-?[\d.eE+-]+/g, '"m_HoursPlayed":' + now).replace(/"m_WearingProxy":true/g, '"m_WearingProxy":false');
    }
  }
  const item = { m_PrefabName: prefab, m_SerializedGear: ser(g) };
  const gg = gearOf(item);
  if (qty !== null && qty !== undefined && qty !== '') setQty(gg, qty);
  setCond(gg, prefab, cond);
  return item;
}

function viewInventory() {
  const inv = gs('m_Inventory_Serialized');
  if (!inv || !Array.isArray(inv.m_SerializedItems)) return h('div', { class: 'card' }, 'No inventory found in this file.');
  const wrap = h('div', {});
  const items = inv.m_SerializedItems;
  const iconBtn = (icon, label, cls, fn) => h('button', { type: 'button', class: 'ghost iconbtn ico ' + cls, style: '--i: var(--ico-' + icon + ')', title: label, 'aria-label': label, onclick: fn });
  const weightOf = (it) => { const g = gearOf(it); return g ? num(g.m_WeightKG) / 1e9 : 0; };
  const fmtKg = (x) => (Math.round(x * 10) / 10).toFixed(1) + ' kg';
  if (!state.invSort) state.invSort = 'order';
  if (!state.invCat) state.invCat = 'all';

  const count = h('span', { class: 'muted small count' });
  const updateCount = () => {
    const total = items.reduce((s, it) => s + weightOf(it), 0);
    count.textContent = (items.length === 1 ? '1 item' : items.length + ' items') + (total > 0 ? ' · ' + fmtKg(total) : '');
  };
  const search = h('input', { type: 'search', placeholder: 'Search inventory', 'aria-label': 'Search inventory', value: state.itemFilter, oninput: (e) => { state.itemFilter = e.target.value; drawList(); } });
  const catFilter = h('select', { 'aria-label': 'Category', onchange: (e) => { state.invCat = e.target.value; drawList(); } },
    h('option', { value: 'all' }, 'All categories'), Object.entries(CAT_LABEL).filter(([k]) => k !== 'Hidden').map(([k, v]) => h('option', { value: k }, v)));
  catFilter.value = state.invCat;
  const sortSel = h('select', { 'aria-label': 'Sort', onchange: (e) => { state.invSort = e.target.value; drawList(); } },
    h('option', { value: 'order' }, 'Order: inventory'), h('option', { value: 'name' }, 'Name'), h('option', { value: 'cond' }, 'Condition, worst first'), h('option', { value: 'weight' }, 'Weight, heaviest first'));
  sortSel.value = state.invSort;
  const fixBtn = h('button', { onclick: () => {
    let n = 0;
    for (const it of items) {
      const g = gearOf(it);
      if (!g) continue;
      setCond(g, it.m_PrefabName, 1);
      for (const k of ['m_FlareItemSerialized', 'm_TorchItemSerialized']) {
        const c = compObj(g, k);
        if (c && 'm_StateProxy' in c) c.m_StateProxy = 'Fresh';
      }
      n++;
    }
    drawList();
    toast('All ' + n + ' items repaired to 100%.');
  } }, 'Repair all');
  const clearBtn = (() => {
    let armed = false;
    const b = h('button', { class: 'danger' }, 'Clear inventory');
    b.addEventListener('click', () => {
      if (!armed) { armed = true; b.textContent = 'Press again to confirm'; setTimeout(() => { armed = false; b.textContent = 'Clear inventory'; }, 4000); return; }
      items.length = 0;
      armed = false; b.textContent = 'Clear inventory';
      drawList(); updateCount();
      toast('Inventory cleared. Remember to save.');
    });
    return b;
  })();
  const addBtn = h('button', { class: 'primary', onclick: () => { addSay(''); addDlg.showModal(); picker.focus(); } }, 'Add item');
  const kitsBtn = h('button', { onclick: () => { if (window.tldLoadouts) tldLoadouts.open({ onChange: () => { drawList(); updateCount(); list.scrollTop = list.scrollHeight; } }); } }, 'Loadouts');
  const cmpBtn = window.tldTools && window.tldDesktop && tldDesktop.D.dir ? h('button', { onclick: () => tldTools.compareSlots() }, 'Compare slots…') : null;
  const bar = h('div', { class: 'listbar' }, h('div', { class: 'listbar-search' }, search, catFilter, sortSel, count), h('div', { class: 'listbar-actions' }, cmpBtn, kitsBtn, fixBtn, clearBtn, addBtn));

  const list = h('div', { class: 'card tablecard' });
  function drawList() {
    const q = state.itemFilter.trim().toLowerCase();
    const body = h('tbody', {});
    let shown = 0;
    const rows = items.map((it, idx) => ({ it, idx, nm: itemName(it.m_PrefabName), g: gearOf(it) })).filter((r) => r.g);
    if (state.invSort === 'name') rows.sort((a, b) => a.nm.localeCompare(b.nm, 'en'));
    else if (state.invSort === 'cond') rows.sort((a, b) => num(a.g.m_NormalizedCondition) - num(b.g.m_NormalizedCondition));
    else if (state.invSort === 'weight') rows.sort((a, b) => num(b.g.m_WeightKG) - num(a.g.m_WeightKG));
    for (const { it, idx, nm, g } of rows) {
      if (q && !(nm.toLowerCase().includes(q) || it.m_PrefabName.toLowerCase().includes(q))) continue;
      if (state.invCat !== 'all' && catOf(it.m_PrefabName) !== state.invCat) continue;
      shown++;
      const cond = Math.round(num(g.m_NormalizedCondition) * 100);
      const condBox = h('input', { type: 'number', min: 0, max: 100, step: 1, value: cond, class: 'narrow', 'aria-label': 'Condition, ' + nm });
      condBox.addEventListener('change', () => { const v = parseFloat(condBox.value); if (!Number.isNaN(v)) setCond(g, it.m_PrefabName, v / 100); });
      const qi = qtyInfo(g);
      let qcell = h('span', { class: 'muted' }, '–');
      if (qi) {
        const qb = h('input', { type: 'number', min: 0, step: qi.step, value: +qi.get().toFixed(3), class: 'narrow', 'aria-label': 'Amount, ' + nm });
        qb.addEventListener('change', () => { const v = parseFloat(qb.value); if (!Number.isNaN(v)) { setQty(g, v); updateCount(); } });
        qcell = h('span', { class: 'qty' }, qb, ' ', h('small', { class: 'muted' }, qi.label));
      }
      const wearing = compObj(g, 'm_ClothingItemSerialized');
      body.append(h('tr', {},
        h('td', {}, h('div', { class: 'iname' }, catIcon(catOf(it.m_PrefabName)), h('span', {}, nm), wearing && wearing.m_WearingProxy ? h('span', { class: 'tag' }, 'worn') : null), h('small', { class: 'muted iprefab' }, it.m_PrefabName)),
        h('td', {}, condBox, ' %'),
        h('td', {}, qcell),
        h('td', { class: 'weight' }, num(g.m_WeightKG) > 0 ? fmtKg(num(g.m_WeightKG) / 1e9) : '–'),
        h('td', { class: 'rowbtns' },
          iconBtn('copy', 'Duplicate: ' + nm, '', () => {
            const copy = parseJSON(ser(it));
            const cg = gearOf(copy);
            cg.m_InstanceIDProxy = uniqueId(items);
            const cc = compObj(cg, 'm_ClothingItemSerialized');
            if (cc && cc.m_WearingProxy) cc.m_WearingProxy = false;
            items.splice(idx + 1, 0, copy);
            drawList(); updateCount();
          }),
          iconBtn('trash', 'Delete: ' + nm, 'rm', () => { items.splice(idx, 1); drawList(); updateCount(); }))));
    }
    const empty = !items.length ? 'The inventory is empty. Add an item above.' : (shown ? null : 'No matches.');
    list.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Condition'), h('th', {}, 'Amount'), h('th', {}, 'Weight'), h('th', {}, h('span', { class: 'sr-only' }, 'Actions')))), body), ...(empty ? [h('p', { class: 'muted pad' }, empty)] : []));
  }

  const addDlg = h('dialog', { 'aria-labelledby': 'addTitle' });
  const addStatus = h('p', { class: 'dlg-status', role: 'status' });
  const addSay = (t, err) => { addStatus.textContent = t || ''; addStatus.classList.toggle('err', !!err); };
  const qtyIn = h('input', { type: 'number', min: 0, step: 'any', placeholder: 'default', class: 'narrow' });
  const condIn = h('input', { type: 'number', min: 1, max: 100, step: 1, value: 100, class: 'narrow' });
  const picker = itemPicker({ state: state.pick, label: 'Items to add', onPick: () => doAdd() });
  const doAdd = () => {
    const id = picker.value;
    if (!id) { addSay('Choose an item from the list first.', true); return; }
    const q = qtyIn.value === '' ? null : parseFloat(qtyIn.value);
    const c = Math.max(1, Math.min(100, parseFloat(condIn.value) || 100)) / 100;
    items.push(makeItem(id, q, c));
    state.itemFilter = ''; search.value = '';
    drawList(); updateCount();
    list.scrollTop = list.scrollHeight;
    addSay('Added: ' + itemName(id) + '. The inventory now has ' + items.length + ' items.');
  };
  addDlg.addEventListener('click', (e) => { if (e.target === addDlg) addDlg.close(); });
  addDlg.append(h('div', { class: 'dlg' },
    h('div', { class: 'dlg-head' }, h('h2', { id: 'addTitle' }, 'Add item'), h('button', { type: 'button', class: 'ghost', onclick: () => addDlg.close() }, 'Done')),
    picker.el,
    h('div', { class: 'toolbar' }, h('label', { class: 'inline' }, 'Amount ', qtyIn), h('label', { class: 'inline' }, 'Condition ', condIn, ' %')),
    addStatus,
    h('div', { class: 'dlg-foot' }, h('button', { class: 'primary', onclick: doAdd }, 'Add to inventory')),
    h('p', { class: 'muted small' }, 'Use the arrow keys to move in the list. Double-click or Enter also adds. Amount means pieces, liters or calories depending on the item, and empty uses the item\'s own default. Items marked legacy have no template in this game version and use an older one.')));

  drawList(); updateCount();
  wrap.append(bar, list, addDlg);
  return wrap;
}

function viewSkills() {
  const sm = gs('m_SkillsManagerSerialized');
  const wrap = h('div', {});
  const card = h('div', { class: 'card' }, h('h3', {}, 'Skills'));
  if (sm) {
    const keys = Object.keys(sm).filter((k) => /^m_Skill_.+Serialized$/.test(k));
    const bulk = h('input', { type: 'number', min: 0, step: 1, value: 5000, class: 'narrow', 'aria-label': 'Points for every skill' });
    card.append(h('div', { class: 'toolbar' }, h('button', { onclick: () => {
      for (const k of keys) {
        const o = sub(sm, k);
        const th = SKILL_LEVELS[k.replace(/^m_Skill_/, '').replace(/Serialized$/, '')];
        if (o && 'm_Points' in o && th) o.m_Points = Math.max(num(o.m_Points), th[4]);
      }
      viewRender();
      toast('All skills raised to level 5. Remember to save.');
    } }, 'All to level 5'), bulk, h('button', { class: 'ghost', onclick: () => {
      const v = parseInt(bulk.value, 10);
      if (Number.isNaN(v) || v < 0) return;
      for (const k of keys) { const o = sub(sm, k); if (o && 'm_Points' in o) o.m_Points = v; }
      viewRender();
      toast('All skill points set to ' + v + '.');
    } }, 'Set all')));
    const list = h('div', { class: 'skills' });
    for (const k of keys) {
      const o = sub(sm, k);
      if (!o || !('m_Points' in o)) continue;
      const id = k.replace(/^m_Skill_/, '').replace(/Serialized$/, '');
      const inp = h('input', { type: 'number', min: 0, step: 1, value: num(o.m_Points), 'aria-label': (SKILL_NAMES[id] || id) + ' points' });
      inp.dataset.skill = id;
      const lvl = h('small', {}, skillLevel(id, num(o.m_Points)));
      const ticks = h('span', { class: 'ticks', 'aria-hidden': 'true' });
      for (let i = 0; i < 5; i++) ticks.append(h('i', {}));
      const paint = (pts) => [...ticks.children].forEach((t, n) => t.classList.toggle('on', n < skillLv(id, pts)));
      paint(num(o.m_Points));
      inp.addEventListener('input', () => { const v = parseInt(inp.value, 10); if (!Number.isNaN(v) && v >= 0) { lvl.textContent = skillLevel(id, v); paint(v); } });
      inp.addEventListener('change', () => { const v = parseInt(inp.value, 10); if (!Number.isNaN(v) && v >= 0) o.m_Points = v; });
      list.append(h('div', { class: 'skill', title: id }, h('label', {}, SKILL_NAMES[id] || id, lvl), SKILL_LEVELS[id] ? ticks : h('span', {}), inp));
    }
    card.append(list, h('p', { class: 'muted' }, 'The level is determined by points in the game. The point thresholds come from The Long Dark wiki and may change in game updates.'));
  } else card.append(h('p', { class: 'muted' }, 'No skills found.'));
  wrap.append(card);
  const ps = gs('m_PlayerSkillsSerialized');
  if (ps && Object.keys(ps).length) {
    const c2 = h('div', { class: 'card' }, h('h3', {}, 'Other skills'));
    const names = { m_RepairSkill: 'Repair', m_CleanSkill: 'Cleaning', m_SharpenSkill: 'Sharpening' };
    const list = h('div', { class: 'skills' });
    for (const k of Object.keys(ps)) {
      const inp = h('input', { type: 'number', min: 0, step: 1, value: num(ps[k]), 'aria-label': (names[k] || k) + ' points' });
      inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!Number.isNaN(v)) ps[k] = v; });
      list.append(h('div', { class: 'skill' }, h('label', {}, names[k] || k), h('span', {}), inp));
    }
    c2.append(list);
    wrap.append(c2);
  }
  return wrap;
}

function regionName(r) {
  if (DATA.regions[r]) return DATA.regions[r].name;
  return r.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function regionList() {
  const s = new Set(Object.keys(DATA.regions));
  for (const k of Object.keys(state.outer.m_Dict)) if (REGION_RE.test(k)) s.add(k);
  return Array.from(s);
}

function hereInfo() {
  const boot = loadSec('boot') || {};
  const pm = gs('m_PlayerManagerSerialized') || {};
  const gm = gs('m_GameManagerSerialized') || {};
  const st = gm && sub(gm, 'm_SceneTransitionDataSerialized');
  const info = loadSec('info') || {};
  const scene = boot.m_SceneName;
  const regs = regionList();
  if (regs.includes(scene)) {
    const p = (pm.m_SaveGamePosition || [0, 0, 0]).map((v) => num(v));
    return { region: scene, pos: p, scene, interior: false };
  }
  const reg = (st && st.m_LastOutdoorScene) || info.m_Region || null;
  const p = st && st.m_PosBeforeInteriorLoad ? st.m_PosBeforeInteriorLoad.map((v) => num(v)) : (pm.m_SaveGamePosition || [0, 0, 0]).map((v) => num(v));
  return { region: reg, pos: p, scene, interior: true };
}

function heightSamples(region) {
  if (state.heights[region]) return state.heights[region];
  const pts = [];
  if (typeof state.outer.m_Dict[region] === 'string') {
    const text = dec(lzfDecompress(b64decode(state.outer.m_Dict[region])));
    const seen = new Set();
    (function walk(o, depth) {
      if (depth > 6) return;
      if (Array.isArray(o)) { for (const v of o) walk(v, depth + 1); return; }
      if (o && typeof o === 'object' && !(o instanceof Raw)) {
        for (const [k, v] of Object.entries(o)) {
          if (k === 'm_Position' && Array.isArray(v) && v.length === 3) {
            const a = v.map((x) => num(x));
            const key = a.join(',');
            if (!seen.has(key)) { seen.add(key); pts.push(a); }
          } else walk(v, depth + 1);
        }
        return;
      }
      if (typeof o === 'string' && o.length > 2 && (o[0] === '{' || o[0] === '[')) {
        try { walk(parseJSON(o), depth + 1); } catch (e) { }
      }
    })(parseJSON(text), 0);
  }
  state.heights[region] = pts;
  return pts;
}

function estimateHeight(region, x, z) {
  const pts = heightSamples(region);
  if (!pts.length) return null;
  const ds = pts.map((p) => ({ d: Math.hypot(p[0] - x, p[2] - z), y: p[1] })).sort((a, b) => a.d - b.d);
  const near = ds.slice(0, 3);
  let wsum = 0, ysum = 0;
  for (const n of near) { const w = 1 / (n.d + 1); wsum += w; ysum += w * n.y; }
  return { y: ysum / wsum, nearest: near[0].d, count: pts.length };
}

function applyTeleport(region, x, y, z) {
  const pm = gs('m_PlayerManagerSerialized');
  const old = (pm.m_SaveGamePosition || [0, 0, 0]).map((v) => num(v));
  const npos = [x, y, z];
  const delta = npos.map((v, i) => v - old[i]);
  const boot = loadSec('boot');
  boot.m_SceneName = region;
  pm.m_SaveGamePosition = npos;
  if (Array.isArray(pm.m_PlayerInVehicleCameraPos)) pm.m_PlayerInVehicleCameraPos = pm.m_PlayerInVehicleCameraPos.map((v, i) => num(v) + delta[i]);
  const ie = gs('m_InvisibleEntityInfoSerialized');
  if (ie && Array.isArray(ie.m_EntityToPlayerPosition)) ie.m_EntityToPlayerPosition = ie.m_EntityToPlayerPosition.map((v, i) => num(v) + delta[i]);
  const gm = gs('m_GameManagerSerialized');
  const st = gm && sub(gm, 'm_SceneTransitionDataSerialized');
  if (st) {
    st.m_TeleportPlayerSaveGamePosition = true;
    st.m_SceneSaveFilenameCurrent = region;
    st.m_SceneSaveFilenameNextLoad = region;
    st.m_PosBeforeInteriorLoad = npos.slice();
    if ('m_LastOutdoorScene' in st) st.m_LastOutdoorScene = region;
  }
  const info = loadSec('info');
  if (info && 'm_Region' in info) info.m_Region = region;
  state.tele = null;
}

function bookmarks() {
  return window.tldStore ? tldStore.peek('bookmarks') : [];
}

function viewTeleport() {
  const here = hereInfo();
  const regs = regionList().sort((a, b) => regionName(a).localeCompare(regionName(b)));
  if (!state.tele) state.tele = { region: here.region && regs.includes(here.region) ? here.region : (regs.find((r) => DATA.regions[r]) || regs[0]), x: here.pos[0], y: here.pos[1], z: here.pos[2], yMode: 'auto', yOff: 1.5, manualY: here.pos[1] };
  const T = state.tele;
  const wrap = h('div', { class: 'grid2 tele' });
  const left = h('div', { class: 'card' });
  const right = h('div', {});
  const sel = h('select', { id: 'teleRegion' }, regs.map((r) => h('option', { value: r }, regionName(r) + (DATA.regions[r] ? '' : ' (no map)'))));
  sel.value = T.region;
  const xIn = h('input', { type: 'number', step: 'any', value: +T.x.toFixed(2) });
  const yIn = h('input', { type: 'number', step: 'any', value: +T.manualY.toFixed(2) });
  const zIn = h('input', { type: 'number', step: 'any', value: +T.z.toFixed(2) });
  const yMode = h('select', { 'aria-label': 'Height' }, h('option', { value: 'auto' }, 'Estimate from terrain'), h('option', { value: 'keep' }, 'Keep current'), h('option', { value: 'manual' }, 'Manual'));
  yMode.value = T.yMode;
  const offIn = h('input', { type: 'number', step: 0.5, value: T.yOff, class: 'narrow', 'aria-label': 'Height margin (m)' });
  const yNote = h('p', { class: 'muted small' });
  const hereNote = h('p', { class: 'muted' }, here.interior
    ? 'You are now indoors (' + here.scene + '). Outdoor area: ' + (here.region ? regionName(here.region) : 'unknown') + '.'
    : 'You are now in: ' + regionName(here.region) + ', x ' + here.pos[0].toFixed(0) + ', z ' + here.pos[2].toFixed(0) + '.');

  function computeY() {
    if (T.yMode === 'keep') return { y: here.pos[1], note: 'The player\'s current height ' + here.pos[1].toFixed(1) + ' m is kept.' };
    if (T.yMode === 'manual') return { y: T.manualY, note: 'Manually set height.' };
    let est = null;
    try { est = estimateHeight(T.region, T.x, T.z); } catch (e) { est = null; }
    if (!est) return { y: here.pos[1], note: 'There is no saved terrain data for this region (it has not been visited). Using the current height ' + here.pos[1].toFixed(1) + ' m. If you fall, raise the height manually.' };
    const y = est.y + T.yOff;
    return { y, note: 'Height estimated from ' + est.count + ' known points, nearest ' + est.nearest.toFixed(0) + ' m away. ' + (est.nearest > 120 ? 'The nearest point is far away, the estimate may be wrong. ' : '') + 'Estimate ' + y.toFixed(1) + ' m (includes ' + T.yOff + ' m margin).' };
  }
  function refresh() {
    xIn.value = +T.x.toFixed(2);
    zIn.value = +T.z.toFixed(2);
    const r = computeY();
    T.yCalc = r.y;
    yNote.textContent = r.note;
    if (T.yMode !== 'manual') yIn.value = +r.y.toFixed(2);
  }
  sel.addEventListener('change', () => { T.region = sel.value; drawMap(); refresh(); });
  xIn.addEventListener('change', () => { T.x = parseFloat(xIn.value) || 0; refresh(); });
  zIn.addEventListener('change', () => { T.z = parseFloat(zIn.value) || 0; refresh(); });
  yIn.addEventListener('change', () => { T.manualY = parseFloat(yIn.value) || 0; T.yMode = 'manual'; yMode.value = 'manual'; refresh(); });
  yMode.addEventListener('change', () => { T.yMode = yMode.value; refresh(); });
  offIn.addEventListener('change', () => { T.yOff = parseFloat(offIn.value) || 0; refresh(); });

  const mapHost = h('div', { class: 'telemap' });

  function drawMap() {
    const mapped = !!DATA.regions[T.region] && !!(window.tldMode && tldMode.pickTeleport);
    mapHost.replaceChildren(
      h('p', { class: 'muted' }, mapped
        ? 'Choose the destination on the map of ' + regionName(T.region) + ' in the Map view. The map images load from Steam after you allow it.'
        : 'There is no map for this region. Enter coordinates manually or use bookmarks.'),
      mapped ? h('div', { class: 'actions' }, h('button', { type: 'button', id: 'teleMapBtn', onclick: () => tldMode.pickTeleport(T.region) }, 'Choose on the map')) : null);
  }

  const goBtn = h('button', { class: 'primary big', onclick: () => {
    const r = computeY();
    const y = T.yMode === 'manual' ? T.manualY : r.y;
    applyTeleport(T.region, T.x, y, T.z);
    toast('Teleport set: ' + regionName(T.region) + ' (' + T.x.toFixed(0) + ', ' + y.toFixed(0) + ', ' + T.z.toFixed(0) + '). Save and load the game.');
    viewRender();
  } }, 'Teleport here');

  left.append(h('h3', {}, 'Teleport'), hereNote, h('div', { class: 'row r2' }, h('label', { for: 'teleRegion' }, 'Region'), sel), mapHost);

  const coords = h('div', { class: 'card' }, h('h3', {}, 'Coordinates'),
    h('div', { class: 'coords' }, h('label', {}, 'X', xIn), h('label', {}, 'Y (height)', yIn), h('label', {}, 'Z', zIn)),
    h('div', { class: 'row r2' }, h('label', {}, 'Height'), yMode),
    h('div', { class: 'row r2' }, h('label', {}, 'Height margin (m)'), offIn),
    yNote, h('div', { class: 'actions' }, goBtn),
    h('p', { class: 'muted small' }, 'The height is an estimate. If you fall through the terrain in the game, restore a backup and set a higher height manually.'));

  const bm = h('div', { class: 'card' }, h('h3', {}, 'Bookmarks'));
  const bmBox = h('div', { class: 'poilist' });
  function drawBm() {
    bmBox.replaceChildren();
    const list = bookmarks();
    if (!list.length) bmBox.append(h('p', { class: 'muted' }, 'No bookmarks.'));
    list.forEach((b) => bmBox.append(h('div', { class: 'bmrow' },
      h('button', { class: 'ghost left', onclick: () => { if (regs.includes(b.region)) { T.region = b.region; sel.value = b.region; } T.x = b.x; T.z = b.z; T.manualY = b.y; T.yMode = 'manual'; yMode.value = 'manual'; drawMap(); refresh(); } }, b.name + ' (' + regionName(b.region) + ')'),
      h('button', { class: 'ghost danger', 'aria-label': 'Delete bookmark ' + b.name, onclick: async () => { try { await tldStore.call('bookmark_del', { id: b.id }); } catch (e) { toast('Could not delete the bookmark.', 'err'); } drawBm(); } }, 'x'))));
  }
  drawBm();
  const nameIn = h('input', { type: 'text', placeholder: 'Name for the current destination', 'aria-label': 'Bookmark name' });
  bm.append(bmBox, h('div', { class: 'toolbar' }, nameIn, h('button', { onclick: async () => {
    const n = nameIn.value.trim() || 'Place';
    try {
      await tldStore.call('bookmark_save', { name: n, region: T.region, x: T.x, y: T.yMode === 'manual' ? T.manualY : (T.yCalc !== undefined ? T.yCalc : here.pos[1]), z: T.z });
      nameIn.value = '';
    } catch (e) { toast(e.code === 'full' ? 'You already have the maximum number of bookmarks.' : 'Could not save the bookmark.', 'err'); }
    drawBm();
  } }, 'Save')));

  right.append(coords, bm);
  wrap.append(left, right);
  drawMap();
  setTimeout(refresh, 0);
  return wrap;
}

function viewInjuries() {
  const card = h('div', { class: 'card' }, h('h3', {}, 'Afflictions and illnesses'));
  let any = false;
  const counts = [];
  for (const [key, label] of AFFLICTIONS) {
    const o = gs(key);
    if (!o) continue;
    const n = afflictionCount(o, key);
    counts.push([key, label, n]);
    if (n) any = true;
  }
  function clearOne(key) {
    const o = gs(key);
    if (!o) return;
    for (const f of Object.keys(o)) if (LIST_FIELDS.has(f) && Array.isArray(o[f])) o[f] = [];
    if (key === 'm_FrostbiteSerialized' && Array.isArray(o.m_LocationsCurrentFrostbiteDamage)) o.m_LocationsCurrentFrostbiteDamage = o.m_LocationsCurrentFrostbiteDamage.map(() => 0);
    if (o.m_IsActive === true) o.m_IsActive = false;
  }
  for (const [key, label, n] of counts) {
    card.append(h('div', { class: 'row r3' }, h('label', {}, label), h('span', { class: n ? 'tag warn' : 'tag ok' }, n ? n + ' active' : 'none'), n ? h('button', { class: 'ghost', onclick: () => { clearOne(key); viewRender(); toast(label + ' cured. Remember to save.'); } }, 'Cure') : h('span', {})));
  }
  card.append(h('div', { class: 'actions' }, h('button', { disabled: !any, onclick: () => { for (const [k] of counts) clearOne(k); viewRender(); toast('All listed afflictions cured. Remember to save.'); } }, 'Cure all')),
    h('p', { class: 'muted' }, 'This resets sprains, bleeding, broken ribs, infections, frostbite and severe lacerations. Food poisoning, dysentery and other illnesses are in the next card.'));
  return card;
}

const TABS = [['player', 'Player', viewPlayer], ['inv', 'Inventory', viewInventory], ['skills', 'Skills', viewSkills], ['tele', 'Teleport', viewTeleport], ['injury', 'Afflictions', viewInjuries]];

function viewRender() {
  const v = $('#view');
  if (!state.outer) { v.replaceChildren(); return; }
  const t = TABS.find((x) => x[0] === state.tab) || TABS[0];
  let el;
  try { el = t[2](); } catch (e) { el = h('div', { class: 'card' }, h('h3', {}, 'Error'), h('p', {}, 'This tab could not be shown: ' + e.message)); console.error(e); }
  v.replaceChildren(el);
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
}

function render() {
  const loaded = !!state.outer;
  $('#welcome').hidden = loaded;
  $('#app').hidden = !loaded;
  $('#saveBtn').hidden = !loaded;
  $('#dlBtn').hidden = !loaded;
  if (!loaded) return;
  if (window.tldMode) tldMode.set('edit');
  const o = state.outer;
  const tod = gs('m_TimeOfDay_Serialized') || {};
  const exp = gs('m_ExperienceModeManagerSerialized') || {};
  $('#slotInfo').replaceChildren(
    h('strong', {}, String(o.m_DisplayName || o.m_InternalName || state.fileName)),
    h('span', { class: 'muted' }, ' ' + [o.m_GameMode, exp.m_CurrentModeType, fmtHours(num(tod.m_HoursPlayedNotPausedProxy)), o.m_Timestamp].filter(Boolean).join(' · ')));
  const tabs = $('#tabs');
  tabs.replaceChildren(...TABS.map(([id, label]) => h('button', { class: 'tab', 'data-tab': id, onclick: () => { state.tab = id; viewRender(); const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); } }, label)));
  viewRender();
}

document.addEventListener('DOMContentLoaded', () => {
  const dz = document.body;
  dz.addEventListener('dragover', (e) => { e.preventDefault(); });
  dz.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
  });
  render();
});

