(() => {
  'use strict';

  const TITLES = {
    m_HypothermiaSerialized: 'Hypothermia',
    m_WellFedSerialized: 'Well fed',
    m_ScurvySerialized: 'Scurvy',
    m_PlayerNutritionSerialized: 'Nutrition',
    m_FoodPoisoningSerialized: 'Food poisoning',
    m_DysenterySerialized: 'Dysentery',
    m_IntestinalParasitesSerialized: 'Intestinal parasites',
    m_HeadacheSerialized: 'Headache',
    m_InsomniaSerialized: 'Insomnia',
    m_BurnsSerialized: 'Burns',
    m_BurnsElectricSerialized: 'Electric burns',
    m_SuffocatingSerialized: 'Suffocation',
    m_FearSerialized: 'Fear',
    m_AnxietySerialized: 'Anxiety',
    m_ChemicalPoisoningSerialized: 'Chemical poisoning',
    m_PlayerGameStatsSerialized: 'Game stats',
    m_StoryMissionDataSerialized: 'Story missions',
    m_TransmitterSerialized: 'Transmitters',
    m_FeatsEnabledSerialized: 'Feats',
    m_TraderSerialized: 'Trader',
  };
  const MORE_SECTIONS = Object.keys(TITLES);
  const ID_RE = /^[A-Za-z0-9_.:\- ]{1,100}$/;

  const RULES = {
    m_ElapsedWarmTime: { min: 0, step: 0.1 },
    m_ElapsedHoursNotStarving: { min: 0, step: 1, warn: (v) => (v > 2000 ? 'A very long time without starving.' : null) },
    m_DayToAllowNextDose: { min: 0, integer: true },
    m_CleanWaterConsumedLiters: { min: 0 },
    m_Amounts: { min: 0, step: 1, warn: (v) => (v > 1000 ? 'More than the game normally stores.' : null) },
    m_LossPerDay: { min: 0, step: 0.5 },
    m_BodyTempHigh: {},
    m_BodyTempLow: {},
    m_CurrentTrust: { min: 0, integer: true },
    m_HighestTrust: { min: 0, integer: true },
  };

  function ruleFor(key) {
    if (RULES[key]) return RULES[key];
    if (/^m_Num/.test(key)) return { min: 0, integer: true };
    if (/Hours|Days|Liters|Elapsed|Duration|Distance|Calories|Condition(Gained|Lost)|Longest|Seconds/.test(key)) return { min: 0 };
    return {};
  }

  function rangeIssue(v, rule) {
    if (!Number.isFinite(v)) return { level: 'error', msg: 'This is not a number.' };
    if (rule.integer && !Number.isInteger(v)) return { level: 'error', msg: 'This must be a whole number.' };
    if (rule.min !== undefined && v < rule.min) return { level: 'error', msg: rule.min === 0 ? 'This cannot be negative.' : 'This must be at least ' + rule.min + '.' };
    if (rule.max !== undefined && v > rule.max) return { level: 'error', msg: 'This must be ' + rule.max + ' or less.' };
    const w = rule.warn ? rule.warn(v) : null;
    return w ? { level: 'warning', msg: w } : null;
  }

  const isNum = (v) => typeof v === 'number' || v instanceof Raw;
  const jsonLike = (s) => typeof s === 'string' && (s.trim()[0] === '{' || s.trim()[0] === '[');
  const idOf = (x, i) => (x && typeof x === 'object' && !Array.isArray(x) ? (x.objectiveID || x.missionID || x.m_Guid || x.m_ObjectName || i) : i);

  function walk(v, key, path, out, depth) {
    if (v instanceof Nested) v = v.val;
    if (jsonLike(v)) { try { v = parseJSON(v); } catch (e) { return; } }
    if (isNum(v)) { out.set(path, { t: 'n', v: Number(v), key }); return; }
    if (typeof v === 'boolean') { out.set(path, { t: 'b', v, key }); return; }
    if (typeof v === 'string') { if (v.length <= 100) out.set(path, { t: 's', v, key }); return; }
    if (v === null || v === undefined || depth > 5) return;
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x === 'string')) { out.set(path, { t: 'a', v: v.slice(), key }); return; }
      v.forEach((x, i) => walk(x, key, path + '[' + idOf(x, i) + ']', out, depth + 1));
      return;
    }
    for (const k of Object.keys(v)) walk(v[k], k, path ? path + '.' + k : k, out, depth + 1);
  }

  function human(p) {
    const s = String(p)
      .replace(/Proxy(?=$|[.\[])/g, '')
      .replace(/(^|\.)m_/g, '$1')
      .replace(/\[([^\]]*)\]/g, ' $1 ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\b(Proxy|Serialized)\b/g, '')
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
  }

  function snap(R) {
    const out = new Map();
    for (const sec of MORE_SECTIONS) {
      let o = null;
      try { o = R.gs(sec); } catch (e) { o = null; }
      if (!o || typeof o !== 'object') continue;
      const m = new Map();
      walk(o, '', '', m, 0);
      for (const [p, x] of m) out.set(sec + '|' + p, Object.assign({ sec }, x));
    }
    return out;
  }

  const FEATS_SEC = 'm_FeatsEnabledSerialized';
  const FEATS_KEY = 'm_FeatsEnabledThisSandbox';
  const FEATS = [
    { id: 'BookSmarts', name: 'Book Smarts', effect: 'Fully read research books give 10% more benefit' },
    { id: 'ColdFusion', name: 'Cold Fusion', effect: 'Permanent +2 °C to Feels Like temperature' },
    { id: 'EfficientMachine', name: 'Efficient Machine', effect: 'Use 10% fewer Calories' },
    { id: 'FireMaster', name: 'Fire Master', effect: 'Survivors begin with Level 3 Fire-Starting' },
    { id: 'FreeRunner', name: 'Free Runner', effect: 'Sprinting burns 25% fewer Calories' },
    { id: 'SnowWalker', name: 'Snow Walker', effect: 'Stamina recharges 20% faster' },
    { id: 'BlizzardWalker', name: 'Blizzard Walker', effect: 'Walking into wind slows you 25% less' },
    { id: 'ExpertTrapper', name: 'Expert Trapper', effect: 'Snares are 100% more effective' },
    { id: 'StraightToHeart', name: 'Straight to the Heart', effect: 'Coffee, GO! Energy Drinks and Emergency Stims last 25% longer' },
    { id: 'NightWalker', name: 'Night Walker', effect: 'Less Fatigued at night, more Fatigued during the day' },
    { id: 'MasterHunter', name: 'Master Hunter', effect: 'Tales from the Far Territory feat' },
    { id: 'SettledMind', name: 'Settled Mind', effect: 'Immune to Cabin Fever, research is 20% faster' },
    { id: 'CelestialNavigator', name: 'Celestial Navigator', effect: 'Walk faster on clear nights and during an aurora' },
  ];
  const FEAT_LIMITS = { Pilgrim: 5, Voyageur: 4, Stalker: 3, Interloper: 2, Custom: 5 };
  const MAX_FEATS = 5;

  function featLimit(mode) {
    return Object.prototype.hasOwnProperty.call(FEAT_LIMITS, mode) ? FEAT_LIMITS[mode] : null;
  }

  function featsView(ft, mode) {
    const list = ft && typeof ft === 'object' && Array.isArray(ft[FEATS_KEY]) ? ft[FEATS_KEY].filter((x) => typeof x === 'string') : [];
    const known = new Set(FEATS.map((f) => f.id));
    return {
      enabled: list.length,
      limit: featLimit(mode),
      mode: featLimit(mode) === null ? '' : mode,
      unknown: list.filter((x) => !known.has(x)),
      on: new Set(list),
    };
  }

  function setFeat(ft, id, on) {
    if (!Array.isArray(ft[FEATS_KEY])) ft[FEATS_KEY] = [];
    const arr = ft[FEATS_KEY];
    const at = arr.indexOf(id);
    if (on && at < 0) arr.push(id);
    if (!on && at >= 0) arr.splice(at, 1);
  }

  function featWarning(v) {
    const d = h('dialog', { 'aria-labelledby': 'featWarnTitle' },
      h('div', { class: 'dlg' },
        h('div', { class: 'dlg-head' }, h('h2', { id: 'featWarnTitle' }, 'Feat limit reached')),
        h('p', {}, v.mode + ' allows ' + v.limit + ' feats and this slot now has ' + v.enabled + '.'),
        h('p', { class: 'muted small' }, 'You can still add more. Nobody knows yet what the game does with extra feats.'),
        h('div', { class: 'dlg-foot' }, h('button', { type: 'button', class: 'primary', onclick: () => d.close() }, 'Got it'))));
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
  }

  function completeTrade(tr, hours) {
    const at = tr && typeof tr === 'object' && tr.m_ActiveTrade && typeof tr.m_ActiveTrade === 'object' ? tr.m_ActiveTrade : null;
    const states = at && Array.isArray(at.m_ExchangeStates) ? at.m_ExchangeStates : [];
    if (!states.length) return [];
    const gains = states.map((s) => {
      const e = s && s.m_Exchange && typeof s.m_Exchange === 'object' ? s.m_Exchange : {};
      return { guid: e.m_GainedItem, amount: Math.max(1, Math.round(Number(e.m_GainedItemAmount) || 1)), name: String(e.m_TradeExchangeName || '') };
    });
    delete tr.m_ActiveTrade;
    tr.m_TimeLastTradeComplete = Math.round(hours * 1000) / 1000;
    return gains;
  }

  const TRADER_SEC = 'm_TraderSerialized';
  const LIQUID_NAMES = { WaterPotable: 'water', WaterNonPotable: 'unsafe water', Kerosene: 'kerosene', CookingOil: 'cooking oil', WhaleOil: 'whale oil' };
  const lower = (s) => { const t = human(s); return t.charAt(0).toLowerCase() + t.slice(1); };
  const amountText = (v) => String(Math.round(Number(v) / 1e7) / 100);

  function traderNames(data, itemLabel) {
    const d = data || {};
    const pick = (table, guid) => (table && typeof guid === 'string' && table[guid]) || null;
    return {
      item: (guid) => { const id = pick(d.items, guid); return id ? (itemLabel ? itemLabel(id) : id.replace(/^GEAR_/, '')) : 'Unknown item'; },
      category: (guid) => { const id = pick(d.categories, guid); return id ? 'any ' + lower(id) : 'an unknown category'; },
      liquid: (guid) => { const id = pick(d.liquids, guid); return id ? (LIQUID_NAMES[id] || lower(id)) : 'an unknown liquid'; },
    };
  }

  function traderCost(c, names) {
    if (!c || typeof c !== 'object') return 'Unknown';
    const type = c.m_ExchangeItemType;
    if (type === 'Liquid') return amountText(c.m_LiquidVolume) + ' L of ' + names.liquid(c.m_LiquidType);
    if (type === 'CategoryWeight') return amountText(c.m_Weight) + ' kg of ' + names.category(c.m_ItemCategory);
    if (type === 'CategoryAmount') return Number(c.m_Amount) + ' × ' + names.category(c.m_ItemCategory);
    if (type === undefined) return Number(c.m_Amount) + ' × ' + names.item(c.m_GearItemData);
    return 'Unknown (' + type + ')';
  }

  function traderExchange(e, names) {
    const list = (a) => (Array.isArray(a) ? a.map((c) => traderCost(c, names)) : []);
    return {
      name: String(e.m_TradeExchangeName || ''),
      gained: names.item(e.m_GainedItem),
      amount: Number(e.m_GainedItemAmount) || 1,
      max: Number(e.m_MaxExchangeInSingleTrade) || 1,
      price: list(e.m_ExchangeItems),
      cheap: list(e.m_CheapExchangeItems),
    };
  }

  function traderView(tr, names) {
    const t = tr && typeof tr === 'object' ? tr : {};
    const arr = (k) => (Array.isArray(t[k]) ? t[k] : []);
    const at = t.m_ActiveTrade && typeof t.m_ActiveTrade === 'object' ? t.m_ActiveTrade : null;
    return {
      contacted: 'm_CurrentTrust' in t,
      trust: Number(t.m_CurrentTrust) || 0,
      highest: Number(t.m_HighestTrust) || 0,
      contacts: Number(t.m_ContactsThisAurora) || 0,
      lastTrade: 'm_TimeLastTradeComplete' in t && Number.isFinite(Number(t.m_TimeLastTradeComplete)) ? Number(t.m_TimeLastTradeComplete) : null,
      talksHad: arr('m_ConversationsHad').length,
      talksOpen: arr('m_UnlockedConversations').length,
      requests: arr('m_SpecialRequests').length,
      offers: arr('m_AvailableExchangesThisAurora').map((e) => traderExchange(e, names)),
      active: at ? {
        scene: String(at.m_ExchangeBoxScene || ''),
        trades: (Array.isArray(at.m_ExchangeStates) ? at.m_ExchangeStates : []).map((s) => Object.assign(traderExchange(s.m_Exchange || {}, names), { handedOver: Array.isArray(s.m_ExchangedItems) ? s.m_ExchangedItems.length : 0 })),
      } : null,
    };
  }

  function setTrust(tr, v) {
    tr.m_CurrentTrust = v;
    if (!(Number(tr.m_HighestTrust) >= v)) tr.m_HighestTrust = v;
  }

  const fv = (x) => (x.t === 'b' ? (x.v ? 'on' : 'off') : x.t === 'n' ? String(Math.round(x.v * 100) / 100) : String(x.v));
  const labelOf = (sec, id) => {
    const rest = id.slice(sec.length + 1);
    return (TITLES[sec] || 'Map') + (rest ? ', ' + human(rest) : '');
  };

  function diff(a, b) {
    const lines = [];
    const ids = new Set([...a.keys(), ...b.keys()]);
    for (const id of ids) {
      const x = a.get(id), y = b.get(id);
      const label = labelOf((y || x).sec, id);
      if (!x && y && y.t === 'b') { if (y.v) lines.push(label + ': off → on'); continue; }
      if (!x || !y) { lines.push(label + (x ? ': removed' : ': added')); continue; }
      if (x.t === 'a' && y.t === 'a') {
        const added = y.v.filter((i) => !x.v.includes(i)), removed = x.v.filter((i) => !y.v.includes(i));
        if (added.length) lines.push(label + ', added: ' + added.slice(0, 6).join(', ') + (added.length > 6 ? ' and ' + (added.length - 6) + ' more' : ''));
        if (removed.length) lines.push(label + ', removed: ' + removed.slice(0, 6).join(', ') + (removed.length > 6 ? ' and ' + (removed.length - 6) + ' more' : ''));
        continue;
      }
      if (JSON.stringify(x.v) !== JSON.stringify(y.v)) lines.push(label + ': ' + fv(x) + ' → ' + fv(y));
    }
    return lines;
  }

  function validateMore(out, og, lg, push) {
    for (const sec of MORE_SECTIONS) {
      const o = og(sec), l = lg(sec);
      if (!l || typeof l !== 'object') continue;
      const mo = new Map(), ml = new Map();
      walk(o, '', '', mo, 0);
      walk(l, '', '', ml, 0);
      for (const [p, x] of ml) {
        const y = mo.get(p);
        const field = labelOf(sec, sec + '|' + p);
        if (x.t === 'n') {
          if (!y || y.v !== x.v) push(out, field, y ? y.v : 'none', x.v, rangeIssue(x.v, ruleFor(x.key)));
        } else if (x.t === 'a') {
          for (const item of x.v) {
            if (y && y.v.includes(item)) continue;
            if (!ID_RE.test(item)) push(out, field, 'none', item, { level: 'error', msg: 'This id has characters the game does not use.' });
          }
          if (new Set(x.v).size !== x.v.length && (!y || new Set(y.v).size === y.v.length)) push(out, field, 'none', 'duplicate', { level: 'error', msg: 'The same entry is in the list twice.' });
        } else if (x.t === 's' && y && y.v !== x.v && !ID_RE.test(x.v)) {
          push(out, field, y.v, x.v, { level: 'error', msg: 'This text has characters the game does not use.' });
        }
      }
    }
    const fl = lg(FEATS_SEC), fo = og(FEATS_SEC);
    if (fl && typeof fl === 'object' && Array.isArray(fl[FEATS_KEY])) {
      const now = fl[FEATS_KEY].length;
      const was = fo && typeof fo === 'object' && Array.isArray(fo[FEATS_KEY]) ? fo[FEATS_KEY].length : 0;
      if (now !== was && now > MAX_FEATS) push(out, 'Feats, enabled in this sandbox', was, now, { level: 'warning', msg: 'No difficulty allows more than ' + MAX_FEATS + ' feats.' });
    }
    const tl = lg(TRADER_SEC), to = og(TRADER_SEC);
    if (tl && typeof tl === 'object' && 'm_CurrentTrust' in tl) {
      const cur = Number(tl.m_CurrentTrust), top = Number(tl.m_HighestTrust);
      const was = to && typeof to === 'object' ? Number(to.m_CurrentTrust) : NaN;
      const wasTop = to && typeof to === 'object' ? Number(to.m_HighestTrust) : NaN;
      if ((cur !== was || top !== wasTop) && !(top >= cur)) push(out, 'Trader, Highest trust', Number.isFinite(wasTop) ? wasTop : 'none', Number.isFinite(top) ? top : 'none', { level: 'error', msg: 'The highest trust cannot be lower than the current trust.' });
    }
  }

  const api = { TITLES, MORE_SECTIONS, RULES, ruleFor, rangeIssue, walk, snap, diff, human, traderNames, traderCost, traderView, setTrust, completeTrade, FEATS, FEAT_LIMITS, MAX_FEATS, featLimit, featsView, setFeat, validate: validateMore };
  if (typeof document === 'undefined' || typeof TABS === 'undefined') { if (typeof module !== 'undefined') module.exports = api; return; }
  window.tldMore = api;
  api.eager = (v) => { eager = !!v; };

  const openFolds = new Set(['body']);
  const kid = (o, key) => { const v = o[key]; if (v instanceof Nested) return v.val; return typeof v === 'string' && jsonLike(v) ? sub(o, key) : v; };

  let eager = false;

  function fold(id, title, hint, kids) {
    return h('div', { class: 'card', 'data-fold': 'more-' + id }, h('h3', {}, title), ...[].concat(typeof kids === 'function' ? kids() : kids).flat().filter(Boolean));
  }

  const UNITS = {
    m_CaloriesBurned: 'kcal', m_CaloriesEaten: 'kcal', m_CaloriesExpendedToday: 'kcal', m_BodyTempHigh: '°C', m_BodyTempLow: '°C',
    m_DistanceTravelledDay: 'm', m_DistanceTravelledNight: 'm', m_ConditionGained: '%', m_ConditionLost: '%',
    m_ElapsedWarmTime: 'h', m_DayToAllowNextDose: 'day', m_CleanWaterConsumedLiters: 'L',
  };

  function numRow(label, obj, key, rule, hint) {
    const box = h('input', { type: 'number', step: rule.integer ? 1 : (rule.step || 0.1), min: rule.min, max: rule.max, value: +num(obj[key]).toFixed(3), 'aria-label': label });
    box.addEventListener('change', () => {
      let v = parseFloat(box.value);
      if (Number.isNaN(v)) return;
      if (rule.integer) v = Math.round(v);
      obj[key] = v;
    });
    const unit = typeof key === 'string' ? UNITS[key] : null;
    return h('div', { class: 'row' }, h('label', {}, label, hint ? h('small', {}, hint) : null), box, unit ? h('span', { class: 'unit muted' }, unit) : null);
  }

  function listEditor(arr, o) {
    const wrap = h('div', { class: 'more-chips' });
    const redraw = () => {
      wrap.replaceChildren(...arr.map((x, i) => h('span', { class: 'tag' }, x, h('button', { class: 'ghost', 'aria-label': 'Remove ' + x, onclick: () => { arr.splice(i, 1); redraw(); } }, '×'))));
      if (!arr.length) wrap.append(h('span', { class: 'muted' }, 'Empty'));
    };
    redraw();
    const box = h('input', { type: 'text', placeholder: o.placeholder || 'Add an id', 'aria-label': (o.label || 'Entry') + ' to add', list: o.list || null });
    const add = () => {
      const v = box.value.trim();
      if (!v) return;
      if (!(o.pattern || ID_RE).test(v)) { toast(o.bad || 'That id has characters the game does not use.', 'err'); return; }
      if (arr.includes(v)) { toast('Already in the list.'); return; }
      arr.push(v);
      box.value = '';
      redraw();
    };
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const clear = h('button', { class: 'ghost', onclick: () => { arr.length = 0; redraw(); } }, 'Clear all');
    return h('div', {}, wrap, h('div', { class: 'more-add' }, box, h('button', { onclick: add }, 'Add'), clear));
  }

  function missing(sec) {
    return h('p', { class: 'muted' }, 'Nothing saved for ' + TITLES[sec] + ' yet.');
  }

  function activeIn(o) {
    if (o.m_IsActive === true || o.m_Active === true) return true;
    return Object.keys(o).some((k) => Array.isArray(o[k]) && o[k].length > 0);
  }

  function cureObj(o) {
    for (const k of Object.keys(o)) {
      if (Array.isArray(o[k])) o[k] = [];
      else if (k === 'm_IsActive' || k === 'm_Active') o[k] = false;
    }
  }

  function autoFields(sec, o, opts) {
    const o2 = opts || {};
    const rows = [];
    for (const key of Object.keys(o)) {
      if (o2.skip && o2.skip.has(key)) continue;
      const label = (o2.labels && o2.labels[key]) || human(key);
      const raw = o[key];
      if (typeof raw === 'boolean') { rows.push(check(label, () => !!o[key], (x) => { o[key] = x; })); continue; }
      if (isNum(raw)) { rows.push(numRow(label, o, key, ruleFor(key))); continue; }
      const v = kid(o, key);
      if (typeof v === 'string') { rows.push(h('div', { class: 'row' }, h('label', {}, label), h('span', { class: 'muted' }, v))); continue; }
      if (Array.isArray(v)) {
        const strs = v.every((x) => typeof x === 'string');
        if (strs && v.length <= 30 && v.every((x) => x.length <= 30)) { rows.push(h('div', {}, h('p', { class: 'small' }, label), listEditor(v, { label, placeholder: 'Add an id' }))); continue; }
        rows.push(h('div', { class: 'row r3' }, h('label', {}, label), h('span', { class: v.length ? 'tag warn' : 'tag ok' }, v.length ? v.length + ' entries' : 'none'), v.length ? h('button', { class: 'ghost', onclick: () => { v.length = 0; viewRender(); } }, 'Clear') : h('span', {})));
        continue;
      }
      if (v && typeof v === 'object') {
        const ks = Object.keys(v);
        if (ks.length && ks.every((k) => typeof v[k] === 'boolean')) {
          rows.push(h('p', { class: 'small' }, label), ...ks.map((k) => check(human(k), () => !!v[k], (x) => { v[k] = x; })));
        } else rows.push(h('div', { class: 'row' }, h('label', {}, label), h('span', { class: 'muted' }, ks.length + ' entries')));
      }
    }
    return rows;
  }

  function sectionCard(sec, opts) {
    const o = gs(sec);
    if (!o || typeof o !== 'object') return missing(sec);
    const rows = autoFields(sec, o, opts);
    const head = h('div', { class: 'row r3' }, h('label', {}, h('strong', {}, TITLES[sec])), h('span', { class: activeIn(o) ? 'tag warn' : 'tag ok' }, activeIn(o) ? 'active' : (rows.length ? 'idle' : 'no data')), activeIn(o) ? h('button', { class: 'ghost', onclick: () => { cureObj(o); viewRender(); toast(TITLES[sec] + ' cleared. Remember to save.'); } }, 'Clear') : h('span', {}));
    return h('div', {}, head, ...rows);
  }

  function wellFedCard() {
    const o = gs('m_WellFedSerialized');
    if (!o || typeof o !== 'object') return missing('m_WellFedSerialized');
    const on = o.m_Active === true;
    const set = (x) => {
      o.m_Active = x;
      o.m_ElapsedHoursNotStarving = x ? Math.max(72.01, Number(o.m_ElapsedHoursNotStarving) || 0) : 0;
      const hg = gs('m_Hunger_Serialized');
      if (x && hg && typeof hg === 'object') {
        if ('m_NumHoursStarving' in hg) hg.m_NumHoursStarving = 0;
        if ('m_StarvingInLog' in hg) hg.m_StarvingInLog = false;
      }
      viewRender();
    };
    return h('div', {},
      h('div', { class: 'row r3' }, h('label', {}, h('strong', {}, TITLES.m_WellFedSerialized)), h('span', { class: on ? 'tag ok' : 'tag' }, on ? 'active' : 'off'),
        h('button', { onclick: () => set(!on) }, on ? 'Turn off' : 'Turn on')),
      h('p', { class: 'muted small' }, 'You get Well fed after 72 hours without starving. Turning it on sets that counter to 72 hours and stops the starving.'));
  }

  function bodyFold() {
    const kids = [];
    kids.push(wellFedCard());
    const n = gs('m_PlayerNutritionSerialized');
    if (n && Array.isArray(n.m_NutrientNames)) {
      kids.push(h('p', { class: 'small' }, h('strong', {}, 'Nutrition')));
      n.m_NutrientNames.forEach((name, i) => {
        const nice = human(String(name).replace(/^Nutrient_/, ''));
        if (Array.isArray(n.m_Amounts) && i < n.m_Amounts.length) kids.push(numRow(nice + ' stored', n.m_Amounts, i, RULES.m_Amounts));
        if (Array.isArray(n.m_LossPerDay) && i < n.m_LossPerDay.length) kids.push(numRow(nice + ' lost per day', n.m_LossPerDay, i, RULES.m_LossPerDay));
      });
    } else kids.push(missing('m_PlayerNutritionSerialized'));
    return fold('body', 'Body', 'well fed and nutrition', kids);
  }

  const ILLNESS_SECS = ['m_HypothermiaSerialized', 'm_ScurvySerialized', 'm_FoodPoisoningSerialized', 'm_DysenterySerialized', 'm_IntestinalParasitesSerialized', 'm_HeadacheSerialized', 'm_InsomniaSerialized', 'm_BurnsSerialized', 'm_BurnsElectricSerialized', 'm_SuffocatingSerialized', 'm_FearSerialized', 'm_AnxietySerialized', 'm_ChemicalPoisoningSerialized'];
  const ILLNESS_LABELS = { m_CauseLocID: 'Cause', m_CleanWaterConsumedLiters: 'Clean water counted (liters)', m_DayToAllowNextDose: 'Next dose allowed on day', m_ElapsedWarmTime: 'Time spent warm (hours)', m_Enabled: 'Scurvy can happen', m_Repaired: 'Save data repaired' };

  function illnessCard() {
    const rows = [], raw = [];
    let any = false;
    for (const sec of ILLNESS_SECS) {
      const o = gs(sec);
      const has = !!o && typeof o === 'object' && Object.keys(o).length > 0;
      const on = has && activeIn(o);
      if (on) any = true;
      rows.push(h('div', { class: 'row r3' }, h('label', {}, TITLES[sec]), h('span', { class: on ? 'tag warn' : 'tag ok' }, on ? 'active' : 'none'),
        on ? h('button', { class: 'ghost', onclick: () => { cureObj(o); viewRender(); toast(TITLES[sec] + ' cured. Remember to save.'); } }, 'Cure') : h('span', {})));
      if (has) {
        const f = autoFields(sec, o, { labels: ILLNESS_LABELS });
        if (f.length) raw.push(h('p', { class: 'small' }, h('strong', {}, TITLES[sec])), ...f);
      }
    }
    return h('div', { class: 'card' },
      h('h3', {}, 'Illnesses'),
      ...rows,
      h('div', { class: 'actions' }, h('button', { disabled: !any, onclick: () => { for (const sec of ILLNESS_SECS) { const o = gs(sec); if (o && typeof o === 'object') cureObj(o); } viewRender(); toast('All illnesses cured. Remember to save.'); } }, 'Cure all')),
      raw.length ? h('details', { class: 'rawvals' }, h('summary', {}, 'Raw values'), ...raw) : null);
  }

  function statsFold() {
    const kids = [];
    const gsx = gs('m_PlayerGameStatsSerialized');
    kids.push(gsx ? h('div', {}, ...autoFields('m_PlayerGameStatsSerialized', gsx)) : missing('m_PlayerGameStatsSerialized'));
    return fold('stats', 'Game stats', 'calories, distance and counters', kids);
  }

  const TALE_NAMES = { sideTale1: 'Signal Void', sideTale2: 'Buried Echoes', sideTale3: 'Last Horizon' };
  const OBJ_NAMES = {
    Tale1_Transmitter1: 'Repair the transmitter at the Forsaken Airfield control tower', Tale1_Transmitter2: 'Repair the transmitter in Forlorn Muskeg',
    Tale1_Transmitter3: 'Repair the transmitter in Pleasant Valley', Tale1_Transmitter4: 'Repair the transmitter in Mountain Town',
    Tale1_BunkerBI: 'Investigate the signal in Bleak Inlet', Tale1_BunkerBISearch: 'Search Bunker Alpha',
    Tale1_BunkerPV: 'Investigate the signal in Pleasant Valley', Tale1_BunkerPVSearch: 'Search Bunker Beta',
    Tale1_BunkerHRV: 'Investigate the signal in Hushed River Valley', Tale1_BunkerHRVSearch: 'Search Bunker Gamma',
    Tale1_FinalBunker: 'Search Forsaken Airfield for more bunkers', Tale1_FinalBunker_End: 'Search Bunker Omega',
    Tale2_BonesSite: 'Look for signs of life with the shortwave', Tale2_ReadGeologistNote: 'Read the old journal entry',
    Tale2_LocateCrashSite: 'Track down the crashed helicopter', Tale2_SearchCrashSite: 'Search the crash site',
    Tale2_SearchConcentrator: 'Search the Concentrator and Headframe', Tale2_FoundRespirator: 'Find a respirator',
    Tale2_SearchMine: 'Search the deepest corners of Langston Mine', Tale2_LocateUpperMineEntrance: 'Find the tracks up to the ridge',
    Tale2_LocateUpperMineKey: 'Find a way into the Locked Zone', Tale2_UpperMineEnter: 'Get into the upper mine',
    Tale2_LocateMachineRoom: 'Explore the Locked Zone', Tale2_SearchMachineRoom: 'Investigate the machine chamber and control room',
    Tale2_CheckForemanReport: 'Check the foreman\'s reports for the Mine Gate Key', Tale2_ReturnToSurface: 'Return to the surface',
    Tale2_LayBonesToRest: 'Lay the Security Chief\'s bones to rest',
    Tale3_SearchWeatherStation: 'Search the weather station', Tale3_SearchWeatherStation_cache: 'Search its cache', Tale3_LocateForemanRefuge: 'Find the foreman\'s refuge',
    Tale3_LocateRudigerHideout: 'Find Rüdiger\'s hideout', Tale3_SearchRudigerHideout: 'Search the hideout',
    Tale3_LocateHighPeakPath: 'Find the path to the high peak', Tale3_ReachHighPeakSummit: 'Reach the summit',
    Tale3_ReturnToOmegaBunker: 'Go back to Bunker Omega', Tale3_SearchHiddenRoom: 'Search the hidden room',
  };
  const OBJ_ORDER = {
    sideTale1: ['Tale1_Transmitter1', 'Tale1_Transmitter2', 'Tale1_Transmitter3', 'Tale1_Transmitter4', 'Tale1_BunkerBI', 'Tale1_BunkerBISearch', 'Tale1_BunkerPV', 'Tale1_BunkerPVSearch', 'Tale1_BunkerHRV', 'Tale1_BunkerHRVSearch', 'Tale1_FinalBunker', 'Tale1_FinalBunker_End'],
    sideTale2: ['Tale2_BonesSite', 'Tale2_ReadGeologistNote', 'Tale2_LocateCrashSite', 'Tale2_SearchCrashSite', 'Tale2_SearchConcentrator', 'Tale2_FoundRespirator', 'Tale2_SearchMine', 'Tale2_LocateUpperMineEntrance', 'Tale2_LocateUpperMineKey', 'Tale2_UpperMineEnter', 'Tale2_LocateMachineRoom', 'Tale2_SearchMachineRoom', 'Tale2_CheckForemanReport', 'Tale2_ReturnToSurface', 'Tale2_LayBonesToRest'],
  };
  const OPTIONAL = new Set(['Tale2_FoundRespirator']);
  const objName = (id) => OBJ_NAMES[id] || human(String(id).replace(/^Tale\d+_/, ''));

  function counterValue(name) {
    if (!name) return null;
    const raw = String((G() || {}).m_SandboxManagerSerialized instanceof Nested ? G().m_SandboxManagerSerialized.orig : (G() || {}).m_SandboxManagerSerialized || '');
    const m = new RegExp(name.replace(/[^A-Za-z0-9_]/g, '') + '\\\\*"\\s*:\\s*\\{\\\\*"_value\\\\*"\\s*:\\s*(-?\\d+)').exec(raw);
    return m ? Number(m[1]) : null;
  }

  function objCounter(o) {
    const cur = counterValue(o.countCurrentBBName), max = counterValue(o.countRequiredBBName);
    return cur !== null && max !== null && max > 0 ? { cur, max } : null;
  }

  function objRow(o, child) {
    const c = objCounter(o);
    const byCounter = !!c && c.cur >= c.max;
    const isDone = () => !!o.completed || byCounter;
    const btn = h('button', { type: 'button', class: 'obj' + (child ? ' child' : ''), role: 'checkbox', disabled: byCounter && !o.completed ? true : null, title: byCounter && !o.completed ? 'Done, the game counts this one by the items you found' : null },
      h('span', { class: 'objtick', 'aria-hidden': 'true' }), h('span', {}, objName(o.objectiveID)),
      OPTIONAL.has(o.objectiveID) ? h('small', { class: 'objtag' }, 'optional') : null,
      c ? h('small', { class: 'objcount' }, c.cur + ' / ' + c.max) : null);
    const paint = () => { btn.classList.toggle('done', isDone()); btn.setAttribute('aria-checked', String(isDone())); };
    btn.addEventListener('click', () => { o.completed = !o.completed; paint(); btn.dispatchEvent(new CustomEvent('objchange', { bubbles: true })); });
    btn.isDone = isDone;
    paint();
    return btn;
  }

  function taleCard(m, objs) {
    const mine = objs.filter((o) => o.missionID === m.missionID);
    const order = OBJ_ORDER[m.missionID] || [];
    const sorted = order.map((id) => mine.find((o) => o.objectiveID === id)).filter(Boolean).concat(mine.filter((o) => !order.includes(o.objectiveID)));
    const rows = sorted.map((o) => objRow(o, !!o.isChildObjective));
    const bar = h('span', { class: 'talebar-fill' });
    const count = h('span', { class: 'talecount' });
    const state = h('span', { class: 'tag' });
    const refresh = () => {
      const done = rows.filter((r) => r.isDone()).length;
      bar.style.width = (rows.length ? Math.round((done / rows.length) * 100) : 0) + '%';
      count.textContent = done + ' / ' + rows.length;
      const finished = m.completedSuccessfully === true;
      state.className = 'tag ' + (finished ? 'ok' : m.isActive ? 'warn' : '');
      state.textContent = finished ? 'Completed' : m.isActive ? 'Active' : 'Not started';
    };
    const card = h('div', { class: 'card tale' },
      h('div', { class: 'talehead' }, h('div', {}, h('p', { class: 'talekicker' }, 'Tale'), h('h3', {}, TALE_NAMES[m.missionID] || human(m.missionID))), state),
      h('div', { class: 'talebar' }, bar), h('div', { class: 'taleprog' }, count, h('span', { class: 'muted' }, 'objectives done')),
      h('div', { class: 'objlist' }, rows),
      h('div', { class: 'actions' },
        h('button', { type: 'button', onclick: () => { for (const o of mine) o.completed = true; viewRender(); toast((TALE_NAMES[m.missionID] || 'Tale') + ' objectives done. Remember to save.'); } }, 'Complete all'),
        check('Active', () => !!m.isActive, (x) => { m.isActive = x; refresh(); })));
    card.addEventListener('objchange', refresh);
    refresh();
    return card;
  }

  function transmitterCard(tm) {
    const tiles = [];
    Object.keys(tm).forEach((guid) => {
      const t = kid(tm, guid);
      if (!t || typeof t !== 'object') return;
      const parts = Array.isArray(t.m_RepairableItems) ? t.m_RepairableItems : [];
      if (!parts.length && !('m_IsDiscovered' in t)) return;
      const n = tiles.length + 1;
      const fixed = parts.filter((p) => p.m_IsRepaired).length;
      tiles.push(h('div', { class: 'txtile' },
        h('div', { class: 'txhead' }, h('strong', {}, 'Transmitter ' + n), h('span', { class: 'tag ' + (t.m_IsFixed ? 'ok' : 'warn') }, t.m_IsFixed ? 'fixed' : 'broken')),
        ...[['m_IsDiscovered', 'Discovered'], ['m_IsFixed', 'Fixed'], ['m_IsOpen', 'Open']].map(([k, l]) => check(l, () => !!t[k], (x) => { t[k] = x; viewRender(); })),
        parts.length ? h('div', { class: 'txparts' }, h('span', { class: 'muted small' }, fixed + ' / ' + parts.length + ' parts repaired'),
          fixed < parts.length ? h('button', { type: 'button', class: 'ghost', onclick: () => { for (const p of parts) p.m_IsRepaired = true; viewRender(); } }, 'Repair') : null) : null));
    });
    return h('div', { class: 'card' }, h('h3', {}, 'Transmitters'), tiles.length ? h('div', { class: 'txgrid' }, tiles) : h('p', { class: 'muted' }, 'No transmitters found yet.'));
  }

  function missionsFold() {
    const sm = gs('m_StoryMissionDataSerialized');
    const out = [];
    if (sm && Array.isArray(sm.m_MissionInfo) && sm.m_MissionInfo.length) {
      const objs = Array.isArray(sm.m_ObjectiveInfo) ? sm.m_ObjectiveInfo : [];
      out.push(h('div', { class: 'talegrid' }, sm.m_MissionInfo.map((m) => taleCard(m, objs))));
    } else out.push(h('div', { class: 'card' }, h('h3', {}, 'Tales'), h('p', { class: 'muted' }, 'No tales started in this slot yet.')));
    const tm = gs('m_TransmitterSerialized');
    if (tm) out.push(transmitterCard(tm));
    return out;
  }

  function finishTrade() {
    const tr = gs(TRADER_SEC);
    const inv = gs('m_Inventory_Serialized');
    if (!tr || !inv || !Array.isArray(inv.m_SerializedItems)) { toast('No trade or inventory found in this file.', 'err'); return; }
    const at = tr.m_ActiveTrade;
    const states = at && Array.isArray(at.m_ExchangeStates) ? at.m_ExchangeStates : [];
    const table = typeof TRADER_DATA !== 'undefined' && TRADER_DATA ? TRADER_DATA.items || {} : {};
    const made = [];
    try {
      for (const s of states) {
        const e = s && s.m_Exchange ? s.m_Exchange : {};
        const prefab = table[e.m_GainedItem];
        if (!prefab || !(catalogById()[prefab] || DATA.samples[prefab])) throw new Error('Whiteout does not know the item this trade gives (' + (e.m_TradeExchangeName || 'unknown') + ').');
        const n = Math.max(1, Math.round(Number(e.m_GainedItemAmount) || 1));
        for (let i = 0; i < n; i++) made.push(makeItem(prefab, null, 1));
      }
    } catch (err) { toast('Could not complete the trade: ' + err.message, 'err'); return; }
    if (!made.length) { toast('There is no agreed trade to complete.'); return; }
    inv.m_SerializedItems.push(...made);
    completeTrade(tr, num(gs('m_TimeOfDay_Serialized').m_HoursPlayedNotPausedProxy));
    viewRender();
    toast('Trade completed: ' + made.length + ' item' + (made.length > 1 ? 's' : '') + ' added to the inventory. Remember to save.');
  }

  function traderCard() {
    const tr = gs(TRADER_SEC);
    if (!tr || typeof tr !== 'object') return null;
    const v = traderView(tr, traderNames(typeof TRADER_DATA !== 'undefined' ? TRADER_DATA : null, itemName));
    const kids = [];
    if ('m_SystemEnabled' in tr || !v.contacted) kids.push(check('Trader enabled in this slot', () => !!tr.m_SystemEnabled, (x) => { tr.m_SystemEnabled = x; }));
    if (!v.contacted) {
      kids.push(h('p', { class: 'muted' }, 'You haven\'t talked to the Trader in this slot yet.'));
      return h('div', { class: 'trader' }, kids);
    }
    const box = h('input', { type: 'number', step: 1, min: 0, value: v.trust, 'aria-label': 'Trader trust' });
    box.addEventListener('change', () => {
      const n = Math.round(parseFloat(box.value));
      if (Number.isNaN(n)) return;
      setTrust(tr, n);
      viewRender();
    });
    kids.push(h('div', { class: 'row' }, h('label', {}, 'Trust', h('small', {}, 'highest so far ' + v.highest)), box));
    if (v.lastTrade !== null) kids.push(h('p', { class: 'small muted' }, 'A trade has been completed in this slot. Last one at game hour ' + Math.round(v.lastTrade) + '.'));
    kids.push(h('p', { class: 'small muted' }, 'Contacts this aurora: ' + v.contacts + '. Conversations had: ' + v.talksHad + ', unlocked: ' + v.talksOpen + '. Special requests: ' + v.requests + '.'));
    const tradeRow = (t, extra) => h('div', { class: 'trade' },
      h('div', { class: 'trade-head' }, h('strong', {}, (t.amount > 1 ? t.amount + ' × ' : '') + t.gained), extra || h('span', { class: 'muted small' }, t.max > 1 ? 'up to ' + t.max + ' per trade' : 'one per trade')),
      h('p', { class: 'small' }, 'Price: ' + (t.price.length ? t.price.join(', ') : 'none listed')),
      t.cheap.length ? h('p', { class: 'small muted' }, 'Lower price: ' + t.cheap.join(', ')) : null);
    if (v.active) {
      kids.push(h('p', { class: 'small' }, h('strong', {}, 'Agreed trade'), ' · exchange box in ' + (v.active.scene ? regionName(v.active.scene) : 'an unknown place')));
      for (const t of v.active.trades) kids.push(tradeRow(t, h('span', { class: t.handedOver ? 'tag ok' : 'tag warn' }, t.handedOver ? t.handedOver + ' handed over' : 'nothing handed over')));
      kids.push(h('div', { class: 'actions' }, h('button', { onclick: finishTrade }, 'Complete trade')));
      kids.push(h('p', { class: 'muted small' }, 'You get the goods and keep what you would have paid. Not tried in the game yet.'));
    } else kids.push(h('p', { class: 'small muted' }, 'No trade is agreed right now.'));
    kids.push(h('p', { class: 'small' }, h('strong', {}, 'Offers this aurora'), ' · ' + v.offers.length));
    if (v.offers.length) for (const t of v.offers) kids.push(tradeRow(t));
    else kids.push(h('p', { class: 'small muted' }, 'None listed.'));
    return h('div', { class: 'trader' }, kids);
  }

  function traderFold() {
    return h('div', { class: 'card', 'data-fold': 'more-trader' }, h('div', { class: 'cardhead' }, h('h3', {}, 'Trader'), h('span', { class: 'beta', title: 'This part is still experimental' }, 'Beta')), traderCard() || missing(TRADER_SEC));
  }

  const NOTICE_KEY = 'whiteout.traderNotice';
  function experimentalNotice() {
    try { if (localStorage.getItem(NOTICE_KEY) === 'off') return; } catch (e) { }
    const skip = h('input', { type: 'checkbox' });
    const ok = h('button', { type: 'button', class: 'primary big' }, 'Got it');
    const back = h('button', { type: 'button', class: 'big' }, 'Go back');
    const dlg = h('dialog', { class: 'xnotice', 'aria-label': 'Experimental' }, h('div', { class: 'dlg' },
      h('p', { class: 'xnotice-kicker' }, 'Trader'),
      h('h2', { class: 'xnotice-title' }, 'Experimental'),
      h('p', {}, 'The Trader part is still shaky. Changing trust or completing a trade hasn\'t been fully tested in the game, so the slot can end up in a weird state.'),
      h('p', {}, 'Make a backup first. If something breaks you can always restore it.'),
      h('label', { class: 'chk inline xnotice-skip' }, skip, h('span', {}, 'Don\'t show this again')),
      h('div', { class: 'dlg-foot' }, ok, back)));
    ok.addEventListener('click', () => { try { if (skip.checked) localStorage.setItem(NOTICE_KEY, 'off'); } catch (e) { } dlg.close(); });
    back.addEventListener('click', () => { dlg.close(); state.moreTab = 'body'; viewRender(); });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    ok.focus();
  }

  function featsCard() {
    const ft = gs(FEATS_SEC);
    if (!ft || typeof ft !== 'object') return null;
    let mode = '';
    try { mode = String((loadSec('info') || {}).m_XPMode || ''); } catch (e) { mode = ''; }
    const kids = [];
    const status = h('span', { class: 'tag ok' });
    const refresh = () => {
      const v = featsView(ft, mode);
      const over = v.limit !== null && v.enabled > v.limit;
      status.className = over ? 'tag warn' : 'tag ok';
      status.textContent = v.enabled + (v.limit !== null ? ' of ' + v.limit + ' (' + v.mode + ')' : ' enabled');
    };
    kids.push(h('div', { class: 'row' }, h('label', {}, h('strong', {}, 'Feats enabled in this sandbox')), status));
    kids.push(h('p', { class: 'small muted' }, 'The game lets you pick 5 feats on Pilgrim, 4 on Voyageur, 3 on Stalker and 2 on Interloper. The ids come from the game files.'));
    for (const f of FEATS) {
      kids.push(check(f.name, () => featsView(ft, mode).on.has(f.id), (x) => {
        const before = featsView(ft, mode);
        setFeat(ft, f.id, x);
        refresh();
        const now = featsView(ft, mode);
        if (x && now.limit !== null && before.enabled <= now.limit && now.enabled > now.limit) featWarning(now);
      }, f.effect));
    }
    const odd = featsView(ft, mode).unknown;
    if (odd.length) kids.push(h('p', { class: 'small muted' }, 'Other feat ids in this save, left as they are: ' + odd.join(', ')));
    refresh();
    return h('div', {}, kids);
  }

  function featsFold() {
    return fold('feats', 'Feats', 'feats enabled in this sandbox', [featsCard() || missing(FEATS_SEC)]);
  }

  const MORE_TABS = [
    ['body', 'Body', () => [bodyFold()]],
    ['missions', 'Tales', () => missionsFold()],
    ['world', 'World', () => (window.tldWorld ? tldWorld.folds() : [])],
    ['feats', 'Feats', () => [featsFold()]],
    ['trader', 'Trader', () => [traderFold()]],
    ['stats', 'Stats', () => [statsFold()]],
  ];

  function viewMore() {
    if (!MORE_TABS.some((t) => t[0] === state.moreTab)) state.moreTab = 'body';
    const bar = h('div', { class: 'seg subtabs', role: 'group', 'aria-label': 'More sections' }, MORE_TABS.map(([id, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(id === state.moreTab), onclick: () => { const was = state.moreTab; state.moreTab = id; viewRender(); if (id === 'trader' && was !== 'trader') experimentalNotice(); } }, label)));
    const cur = MORE_TABS.find((t) => t[0] === state.moreTab);
    return h('div', {}, bar, ...cur[2]());
  }

  TABS.push(['more', 'More', viewMore]);
  const injury = TABS.find((x) => x[0] === 'injury');
  if (injury) { const base = injury[2]; injury[2] = () => h('div', { class: 'grid2 even' }, base(), illnessCard()); }
})();
