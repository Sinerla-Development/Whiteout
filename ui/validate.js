(() => {
  'use strict';

  const NEEDS = [
    { sec: 'm_Condition_Serialized', key: 'm_CurrentHPProxy', label: 'Health', min: 0, max: 100, warn: (v) => (v === 0 ? 'At 0 health the player dies when the slot loads.' : null) },
    { sec: 'm_Hunger_Serialized', key: 'm_CurrentReserveCaloriesProxy', label: 'Calories', min: 0, max: 100000, warn: (v) => (v > 2500 ? 'More than 2,500 calories, the amount Whiteout uses for full.' : null) },
    { sec: 'm_Thirst_Serialized', key: 'm_CurrentThirstProxy', label: 'Thirst', min: 0, max: 100 },
    { sec: 'm_Fatigue_Serialized', key: 'm_CurrentFatigueProxy', label: 'Fatigue', min: 0, max: 100 },
    { sec: 'm_Freezing_Serialized', key: 'm_CurrentFreezingProxy', label: 'Cold', min: 0, max: 100 },
  ];
  const QTY = {
    stack: { label: 'amount', integer: true, warnAbove: 500, warn: 'A very large stack. The game does not normally make stacks this big.' },
    liters: { label: 'liters', warnAbove: 20, warn: 'More liquid than a single item normally holds.' },
    kcal: { label: 'calories', warnAbove: 20000, warn: 'More calories than a single food item normally has.' },
  };
  const AURORA_FLAGS = ['m_ForceDisable', 'm_ForceAuroraEarlyWindowAllowed', 'm_ForceAuroraLateWindowAllowed', 'm_HasForcedAuroraStarted'];
  const DAY_KEYS = ['m_UniStormDayNumberProxy', 'm_UniStormDayCounterProxy'];

  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && typeof v.t === 'string') return Number(v.t);
    if (typeof v === 'string' && v.trim() !== '') return Number(v);
    return NaN;
  }

  const fmt = (v) => {
    if (v === undefined) return 'none';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    const n = toNumber(v);
    if (Number.isFinite(n)) return String(Math.round(n * 100) / 100);
    return String(v && v.t !== undefined ? v.t : v);
  };

  function checkRange(value, rule) {
    const n = toNumber(value);
    if (!Number.isFinite(n)) return { level: 'error', msg: 'This is not a number.' };
    if (rule.integer && !Number.isInteger(n)) return { level: 'error', msg: 'This must be a whole number.' };
    if (rule.min !== undefined && n < rule.min) return { level: 'error', msg: rule.min === 0 ? 'This cannot be negative.' : 'This must be at least ' + rule.min + '.' };
    if (rule.max !== undefined && n > rule.max) return { level: 'error', msg: 'This must be ' + rule.max + ' or less.' };
    const w = rule.warn ? rule.warn(n) : null;
    return w ? { level: 'warning', msg: w } : null;
  }

  function checkCondition(pct) {
    const n = toNumber(pct);
    if (!Number.isFinite(n)) return { level: 'error', msg: 'The condition is not a number.' };
    if (n < 0) return { level: 'error', msg: 'The condition cannot be negative.' };
    if (n > 100) return { level: 'warning', msg: 'The condition is over 100 %. The game does not normally go above 100 %.' };
    return null;
  }

  function checkQty(value, kind) {
    const rule = QTY[kind];
    if (!rule) return null;
    const n = toNumber(value);
    if (!Number.isFinite(n)) return { level: 'error', msg: 'The ' + rule.label + ' is not a number.' };
    if (n < 0) return { level: 'error', msg: 'The ' + rule.label + ' cannot be negative.' };
    if (rule.integer && !Number.isInteger(n)) return { level: 'error', msg: 'The ' + rule.label + ' must be a whole number.' };
    if (n > rule.warnAbove) return { level: 'warning', msg: rule.warn };
    return null;
  }

  function checkTimeOfDay(value) {
    const n = toNumber(value);
    if (!Number.isFinite(n) || n < 0 || n >= 1) return { level: 'error', msg: 'The time of day is outside the day.' };
    return null;
  }

  function checkDay(value) {
    const n = toNumber(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return { level: 'error', msg: 'The day must be a whole number of 1 or more.' };
    if (n > 5000) return { level: 'warning', msg: 'A very high day number.' };
    return null;
  }

  function checkFlag(value) {
    return typeof value === 'boolean' ? null : { level: 'error', msg: 'This must be on or off.' };
  }

  function checkAuroraHours(value) {
    const n = toNumber(value);
    if (!Number.isFinite(n) || n < 0) return { level: 'error', msg: 'The aurora length must be 0 hours or more.' };
    if (n > 24) return { level: 'warning', msg: 'An aurora longer than a day.' };
    return null;
  }

  function checkWeather(oldV, newV, key) {
    if (key === 'm_WeatherStageProxy') return typeof oldV === typeof newV ? null : { level: 'error', msg: 'This is not a weather stage the game knows.' };
    return Number.isFinite(toNumber(newV)) ? null : { level: 'error', msg: 'The temperature is not a number.' };
  }

  function duplicateIssue(name, before, after) {
    return after > 1 && after > before ? { level: 'warning', msg: 'There are ' + after + ' copies of ' + name + '. The game normally has only one.' } : null;
  }

  const empty = () => ({ errors: [], warnings: [] });
  function push(out, field, from, to, r) {
    if (!r) return;
    (r.level === 'error' ? out.errors : out.warnings).push({ field, from: fmt(from), to: fmt(to), msg: r.msg });
  }

  const RULES = { NEEDS, QTY, toNumber, fmt, checkRange, checkCondition, checkQty, checkTimeOfDay, checkDay, checkFlag, checkAuroraHours, checkWeather, duplicateIssue };
  if (typeof module !== 'undefined') { module.exports = RULES; return; }

  const kindOf = (q) => (!q ? null : q.label === 'kcal' ? 'kcal' : q.step === 1 ? 'stack' : 'liters');
  const isUnique = (prefab) => catOf(prefab) === 'Collectible';

  function origReader() {
    const cache = {};
    const sec = (k) => {
      if (!(k in cache)) cache[k] = typeof state.origText[k] === 'string' ? parseJSON(state.origText[k]) : null;
      return cache[k];
    };
    return { sec, gs: (n) => sub(sec('global'), n) };
  }

  function itemInfo(it) {
    const g = gearOf(it);
    if (!g) return null;
    const q = qtyInfo(g);
    return { key: num(g.m_InstanceIDProxy) + ':' + it.m_PrefabName, prefab: it.m_PrefabName, cond: toNumber(g.m_NormalizedCondition) * 100, qty: q ? q.get() : null, kind: kindOf(q) };
  }

  function checkItemList(out, added, existing, oldMap) {
    const counts = new Map();
    for (const it of existing) counts.set(it.m_PrefabName, (counts.get(it.m_PrefabName) || 0) + 1);
    const before = new Map(counts);
    for (const it of added) {
      const info = itemInfo(it);
      if (!info) continue;
      const old = oldMap ? oldMap.get(info.key) : null;
      const name = itemName(info.prefab);
      if (!old || Math.abs(old.cond - info.cond) > 0.5) push(out, name + ', condition', old ? Math.round(old.cond) + ' %' : 'new item', Math.round(info.cond * 10) / 10 + ' %', checkCondition(info.cond));
      if (info.kind && (!old || old.qty !== info.qty)) push(out, name + ', ' + QTY[info.kind].label, old && old.qty !== null ? old.qty : 'new item', info.qty, checkQty(info.qty, info.kind));
      if (!oldMap || !old) counts.set(info.prefab, (counts.get(info.prefab) || 0) + 1);
    }
    for (const [prefab, n] of counts) {
      if (!isUnique(prefab)) continue;
      const issue = duplicateIssue(itemName(prefab), before.get(prefab) || 0, n);
      if (issue) push(out, itemName(prefab), (before.get(prefab) || 0) + (before.get(prefab) === 1 ? ' copy' : ' copies'), n + ' copies', issue);
    }
  }

  function checkItems(added, existing) {
    const out = empty();
    checkItemList(out, added, existing, null);
    return out;
  }

  function checkSave() {
    const out = empty();
    if (typeof state === 'undefined' || !state.outer) return out;
    const O = origReader();
    const og = (n) => { try { return O.gs(n) || {}; } catch (e) { return {}; } };
    const lg = (n) => gs(n) || {};
    const changed = (a, b) => ser(a) !== ser(b);

    for (const r of NEEDS) {
      const o = og(r.sec)[r.key], v = lg(r.sec)[r.key];
      if (v === undefined || !changed(o, v)) continue;
      push(out, r.label, o, v, checkRange(v, r));
    }

    const oT = og('m_TimeOfDay_Serialized'), lT = lg('m_TimeOfDay_Serialized');
    if ('m_TimeProxy' in lT && changed(oT.m_TimeProxy, lT.m_TimeProxy)) {
      const hm = (f) => { const n = toNumber(f); if (!Number.isFinite(n)) return fmt(f); const m = Math.round((((n % 1) + 1) % 1) * 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
      push(out, 'Time of day', hm(oT.m_TimeProxy), hm(lT.m_TimeProxy), checkTimeOfDay(lT.m_TimeProxy));
    }
    for (const k of DAY_KEYS) if (k in lT && changed(oT[k], lT[k])) { push(out, 'Day', oT[k], lT[k], checkDay(lT[k])); break; }

    const oW = og('m_Weather_Serialized'), lW = lg('m_Weather_Serialized');
    for (const k of ['m_WeatherStageProxy', 'm_TempHighProxy', 'm_TempLowProxy']) {
      if (k in lW && changed(oW[k], lW[k])) push(out, k === 'm_WeatherStageProxy' ? 'Weather' : k === 'm_TempHighProxy' ? 'Weather, high' : 'Weather, low', oW[k], lW[k], checkWeather(oW[k], lW[k], k));
    }

    const oA = og('m_AuroraManagerSerialized'), lA = lg('m_AuroraManagerSerialized');
    for (const k of AURORA_FLAGS) if (k in lA && changed(oA[k], lA[k])) push(out, 'Aurora', oA[k], lA[k], checkFlag(lA[k]));
    if ('m_ForceAuroraDurationOverride' in lA && changed(oA.m_ForceAuroraDurationOverride, lA.m_ForceAuroraDurationOverride)) {
      push(out, 'Aurora length (hours)', oA.m_ForceAuroraDurationOverride, lA.m_ForceAuroraDurationOverride, checkAuroraHours(lA.m_ForceAuroraDurationOverride));
    }

    if (window.tldMore) tldMore.validate(out, (n) => { try { return O.gs(n); } catch (e) { return null; } }, (n) => gs(n), push);

    const lInv = lg('m_Inventory_Serialized').m_SerializedItems;
    if (Array.isArray(lInv)) {
      const oInvRaw = og('m_Inventory_Serialized').m_SerializedItems;
      const oInv = Array.isArray(oInvRaw) ? oInvRaw : [];
      const oldMap = new Map();
      for (const it of oInv) { const i = itemInfo(it); if (i) oldMap.set(i.key, i); }
      checkItemList(out, lInv, oInv, oldMap);
    }
    return out;
  }

  window.tldValidate = Object.assign({ checkSave, checkItems }, RULES);
})();
