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
    const tl = lg(TRADER_SEC), to = og(TRADER_SEC);
    if (tl && typeof tl === 'object' && 'm_CurrentTrust' in tl) {
      const cur = Number(tl.m_CurrentTrust), top = Number(tl.m_HighestTrust);
      const was = to && typeof to === 'object' ? Number(to.m_CurrentTrust) : NaN;
      const wasTop = to && typeof to === 'object' ? Number(to.m_HighestTrust) : NaN;
      if ((cur !== was || top !== wasTop) && !(top >= cur)) push(out, 'Trader, Highest trust', Number.isFinite(wasTop) ? wasTop : 'none', Number.isFinite(top) ? top : 'none', { level: 'error', msg: 'The highest trust cannot be lower than the current trust.' });
    }
  }

  const api = { TITLES, MORE_SECTIONS, RULES, ruleFor, rangeIssue, walk, snap, diff, human, traderNames, traderCost, traderView, setTrust, validate: validateMore };
  if (typeof document === 'undefined' || typeof TABS === 'undefined') { if (typeof module !== 'undefined') module.exports = api; return; }
  window.tldMore = api;
  api.eager = (v) => { eager = !!v; };

  const openFolds = new Set(['body']);
  const kid = (o, key) => { const v = o[key]; if (v instanceof Nested) return v.val; return typeof v === 'string' && jsonLike(v) ? sub(o, key) : v; };

  let eager = false;

  function fold(id, title, hint, kids) {
    const body = h('div', { class: 'fold-body' });
    const d = h('details', { class: 'card fold', 'data-fold': 'more-' + id }, h('summary', {}, h('span', { class: 'fold-title' }, title), h('small', { class: 'muted' }, hint)), body);
    let built = false;
    const fill = () => {
      if (built) return;
      built = true;
      body.replaceChildren(...[].concat(typeof kids === 'function' ? kids() : kids).flat().filter(Boolean));
    };
    d.open = openFolds.has(id);
    if (d.open || eager) fill();
    d.addEventListener('toggle', () => { if (d.open) { openFolds.add(id); fill(); } else openFolds.delete(id); });
    return d;
  }

  function numRow(label, obj, key, rule, hint) {
    const box = h('input', { type: 'number', step: rule.integer ? 1 : (rule.step || 0.1), min: rule.min, max: rule.max, value: +num(obj[key]).toFixed(3), 'aria-label': label });
    box.addEventListener('change', () => {
      let v = parseFloat(box.value);
      if (Number.isNaN(v)) return;
      if (rule.integer) v = Math.round(v);
      obj[key] = v;
    });
    return h('div', { class: 'row' }, h('label', {}, label, hint ? h('small', {}, hint) : null), box);
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
    return h('p', { class: 'muted' }, TITLES[sec] + ': this save has no data for it.');
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
    const rows = autoFields('m_WellFedSerialized', o, { labels: { m_Active: 'Well fed active', m_ElapsedHoursNotStarving: 'Hours without starving' } });
    return h('div', {},
      h('div', { class: 'row r3' }, h('label', {}, h('strong', {}, TITLES.m_WellFedSerialized)), h('span', { class: on ? 'tag ok' : 'tag' }, on ? 'active' : 'off'),
        h('button', { onclick: () => set(!on) }, on ? 'Turn off' : 'Turn on')),
      h('p', { class: 'muted small' }, 'The game gives Well fed after 72 hours without starving. Turning it on sets the counter just above 72 hours and clears starvation.'),
      ...rows);
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
    const parts = [];
    const idle = [];
    for (const s of ILLNESS_SECS) {
      const o = gs(s);
      if (!o || typeof o !== 'object' || !Object.keys(o).length) { idle.push(TITLES[s]); continue; }
      parts.push(sectionCard(s, { labels: ILLNESS_LABELS }));
    }
    const any = ILLNESS_SECS.some((s) => { const o = gs(s); return o && typeof o === 'object' && activeIn(o); });
    return h('div', { class: 'card' },
      h('h3', {}, 'Illnesses and conditions'),
      ...parts,
      idle.length ? h('p', { class: 'muted' }, 'Nothing stored right now for: ' + idle.join(', ') + '.') : null,
      h('div', { class: 'actions' }, h('button', { disabled: !any, onclick: () => { for (const s of ILLNESS_SECS) { const o = gs(s); if (o && typeof o === 'object') cureObj(o); } viewRender(); toast('All illnesses cleared. Remember to save.'); } }, 'Clear all illnesses')));
  }

  function statsFold() {
    const kids = [];
    const gsx = gs('m_PlayerGameStatsSerialized');
    kids.push(gsx ? h('div', {}, h('p', { class: 'small' }, h('strong', {}, 'Game stats')), ...autoFields('m_PlayerGameStatsSerialized', gsx)) : missing('m_PlayerGameStatsSerialized'));
    return fold('stats', 'Game stats', 'calories, distance and counters', kids);
  }

  function missionsFold() {
    const kids = [];
    const sm = gs('m_StoryMissionDataSerialized');
    if (sm && Array.isArray(sm.m_MissionInfo)) {
      kids.push(h('p', { class: 'small' }, h('strong', {}, 'Story missions')));
      for (const m of sm.m_MissionInfo) kids.push(check(human(m.missionID || 'mission') + ' is active', () => !!m.isActive, (x) => { m.isActive = x; }));
      const objs = Array.isArray(sm.m_ObjectiveInfo) ? sm.m_ObjectiveInfo : [];
      for (const o of objs) if (!o.isChildObjective) kids.push(check(human(o.objectiveID || 'objective') + ' completed', () => !!o.completed, (x) => { o.completed = x; }));
      kids.push(h('div', { class: 'actions' }, h('button', { disabled: !objs.length, onclick: () => { for (const o of objs) o.completed = true; viewRender(); toast('All objectives marked completed. Remember to save.'); } }, 'Complete all objectives')));
    } else kids.push(missing('m_StoryMissionDataSerialized'));
    const tm = gs('m_TransmitterSerialized');
    if (tm) {
      kids.push(h('p', { class: 'small' }, h('strong', {}, 'Transmitters')));
      Object.keys(tm).forEach((guid, i) => {
        const t = kid(tm, guid);
        if (!t || typeof t !== 'object') return;
        const name = 'Transmitter ' + (i + 1);
        for (const [k, l] of [['m_IsDiscovered', 'discovered'], ['m_IsFixed', 'fixed'], ['m_IsOpen', 'open']]) if (k in t) kids.push(check(name + ' ' + l, () => !!t[k], (x) => { t[k] = x; }));
        const parts = Array.isArray(t.m_RepairableItems) ? t.m_RepairableItems : [];
        if (parts.length) kids.push(h('div', { class: 'row r3' }, h('label', {}, name + ' parts'), h('span', { class: parts.every((p) => p.m_IsRepaired) ? 'tag ok' : 'tag warn' }, parts.filter((p) => p.m_IsRepaired).length + ' / ' + parts.length + ' repaired'), h('button', { class: 'ghost', onclick: () => { for (const p of parts) p.m_IsRepaired = true; viewRender(); } }, 'Repair')));
      });
    } else kids.push(missing('m_TransmitterSerialized'));
    return fold('missions', 'Missions and transmitters', 'story missions, transmitters', kids);
  }

  function traderCard() {
    const tr = gs(TRADER_SEC);
    if (!tr || typeof tr !== 'object') return null;
    const v = traderView(tr, traderNames(typeof TRADER_DATA !== 'undefined' ? TRADER_DATA : null, itemName));
    const kids = [h('p', { class: 'small' }, h('strong', {}, 'Trader'))];
    if ('m_SystemEnabled' in tr || !v.contacted) kids.push(check('Trader enabled in this slot', () => !!tr.m_SystemEnabled, (x) => { tr.m_SystemEnabled = x; }));
    if (!v.contacted) {
      kids.push(h('p', { class: 'muted' }, 'The Trader has not been contacted in this slot yet, so there is nothing else to show.'));
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
    kids.push(h('p', { class: 'small muted' }, 'The range of trust the game accepts is not confirmed. Raising it also raises the highest trust.'));
    kids.push(h('p', { class: 'small muted' }, 'Contacts this aurora: ' + v.contacts + '. Conversations had: ' + v.talksHad + ', unlocked: ' + v.talksOpen + '. Special requests: ' + v.requests + '.'));
    const tradeRow = (t, extra) => h('div', { class: 'trade' },
      h('div', { class: 'trade-head' }, h('strong', {}, (t.amount > 1 ? t.amount + ' × ' : '') + t.gained), extra || h('span', { class: 'muted small' }, t.max > 1 ? 'up to ' + t.max + ' per trade' : 'one per trade')),
      h('p', { class: 'small' }, 'Price: ' + (t.price.length ? t.price.join(', ') : 'none listed')),
      t.cheap.length ? h('p', { class: 'small muted' }, 'Lower price: ' + t.cheap.join(', ')) : null);
    if (v.active) {
      kids.push(h('p', { class: 'small' }, h('strong', {}, 'Agreed trade'), ' · exchange box in ' + (v.active.scene ? regionName(v.active.scene) : 'an unknown place')));
      for (const t of v.active.trades) kids.push(tradeRow(t, h('span', { class: t.handedOver ? 'tag ok' : 'tag warn' }, t.handedOver ? t.handedOver + ' handed over' : 'nothing handed over')));
      kids.push(h('p', { class: 'muted small' }, 'Whiteout cannot complete a trade yet. Take the items to the exchange box in the game.'));
    } else kids.push(h('p', { class: 'small muted' }, 'No trade is agreed right now.'));
    kids.push(h('p', { class: 'small' }, h('strong', {}, 'Offers this aurora'), ' · ' + v.offers.length));
    if (v.offers.length) for (const t of v.offers) kids.push(tradeRow(t));
    else kids.push(h('p', { class: 'small muted' }, 'None listed.'));
    return h('div', { class: 'trader' }, kids);
  }

  function traderFold() {
    return fold('trader', 'Trader', 'trust, the agreed trade and this aurora\'s offers', [traderCard() || missing(TRADER_SEC)]);
  }

  function viewMore() {
    return h('div', {}, h('p', { class: 'muted' }, 'Everything here is saved with the slot and listed before saving. Values outside what the game accepts block the save.'), bodyFold(), missionsFold(), traderFold(), statsFold());
  }

  TABS.push(['more', 'More', viewMore]);
  const injury = TABS.find((x) => x[0] === 'injury');
  if (injury) { const base = injury[2]; injury[2] = () => h('div', {}, base(), illnessCard()); }
})();
