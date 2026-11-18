(() => {
  'use strict';

  const SEC = 'm_LogSerialized';
  const STAT_SEC = 'm_PlayerGameStatsSerialized';
  const AFFLICTION_NAMES = { FoodPoisioning: 'Food poisoning', SprainPain: 'Sprain pain', InsomniaRisk: 'Insomnia risk', InfectionRisk: 'Infection risk', SevereLacerations: 'Severe lacerations' };

  const n = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x) : []);
  const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const prettyId = (id) => words(String(id).replace(/^(SCENENAME|GAMEPLAY|STORY)_/, ''));
  const prettyRegion = (s) => words(String(s).replace(/Region$/, ''));
  const prettyAffliction = (id) => AFFLICTION_NAMES[id] || words(id);
  const REGION_LOC = { MysteryLake: 'LakeRegion', CoastalHighway: 'CoastalRegion', Marsh: 'MarshRegion', Railway: 'TracksRegion', Mining: 'MiningRegion', MountainPass: 'MountainPassRegion', PleasantValley: 'RuralRegion' };
  const regionOfLoc = (id) => {
    const m = /^SCENENAME_(.+)$/.exec(id);
    return m ? REGION_LOC[m[1]] || m[1] : null;
  };
  const dayRegions = (d) => Array.from(new Set(strs(d.m_RegionSceneNames).concat(strs(d.m_RegionLocIDs).map(regionOfLoc).filter(Boolean))));

  function entry(d, day, partial) {
    const zero = (v) => (partial ? n(v) : n(v) === null ? 0 : n(v));
    return {
      day,
      explored: zero(d.m_WorldExplored),
      rested: zero(d.m_HoursRested),
      burned: zero(d.m_CaloriesBurned),
      low: n(d.m_ConditionLow),
      high: n(d.m_ConditionHigh),
      afflictions: strs(d.m_Afflictions),
      regions: dayRegions(d),
      locations: strs(d.m_LocationLocIDs),
      notes: typeof d.m_Notes === 'string' ? d.m_Notes.trim() : '',
      today: !!partial,
    };
  }

  function tally(list, pick, unique) {
    const m = new Map();
    for (const d of list) {
      const ids = pick(d);
      for (const k of unique ? new Set(ids) : ids) m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m, ([id, value]) => ({ id, value })).sort((a, b) => b.value - a.value || String(a.id).localeCompare(String(b.id)));
  }

  function build(log, stats) {
    const l = log && typeof log === 'object' ? log : {};
    const raw = Array.isArray(l.m_LogDayInfoList) ? l.m_LogDayInfoList : [];
    const days = raw.filter((d) => d && typeof d === 'object').map((d, i) => entry(d, n(d.m_DayNumber) === null ? i + 1 : n(d.m_DayNumber), false));
    const last = days.length ? days[days.length - 1].day : 0;
    const todayNo = n(l.m_DayToLogEndOfDayInfo);
    const t = l.m_TodayLogDayInfo;
    if (t && typeof t === 'object' && todayNo !== null && todayNo > last) days.push(entry(t, todayNo, true));
    const done = days.filter((d) => !d.today);
    const st = stats && typeof stats === 'object' ? stats : {};
    const sum = (k) => done.reduce((a, d) => a + (d[k] || 0), 0);
    const explored = done.length ? done[done.length - 1].explored : null;
    return {
      days,
      afflictionDays: tally(days, (d) => d.afflictions, true),
      regionDays: tally(days, (d) => d.regions, true),
      places: tally(days, (d) => d.locations, false),
      notes: days.filter((d) => d.notes).map((d) => ({ day: d.day, text: d.notes })),
      general: typeof l.m_GeneralNotes === 'string' ? l.m_GeneralNotes.trim() : '',
      totals: { logged: done.length, burned: sum('burned'), rested: sum('rested'), explored },
      stats: {
        caloriesBurned: n(st.m_CaloriesBurned),
        caloriesEaten: n(st.m_CaloriesEaten),
        distanceDay: n(st.m_DistanceTravelledDay),
        distanceNight: n(st.m_DistanceTravelledNight),
        conditionGained: n(st.m_ConditionGained),
        conditionLost: n(st.m_ConditionLost),
      },
    };
  }

  const WOUND_IDS = ['SevereLacerations', 'BloodLoss', 'InfectionRisk'];
  const asObj = (v) => {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
    return v && typeof v === 'object' ? v : null;
  };

  function wildlife(D, laceration, cougar, bear) {
    const lac = asObj(laceration), cg = asObj(cougar), br = asObj(bear);
    const wounds = D.afflictionDays.filter((a) => WOUND_IDS.includes(a.id));
    const lacDays = D.days.filter((d) => d.afflictions.includes('SevereLacerations')).map((d) => d.day);
    const names = cg && Array.isArray(cg.m_RegionThreatLevelNames) ? cg.m_RegionThreatLevelNames : [];
    const levels = cg && Array.isArray(cg.m_RegionThreatLevels) ? cg.m_RegionThreatLevels : [];
    const cooldown = cg && Array.isArray(cg.m_ThreatCooldownDays) ? cg.m_ThreatCooldownDays : [];
    return {
      wounds,
      woundDays: D.days.filter((d) => d.afflictions.some((a) => WOUND_IDS.includes(a))).length,
      current: lac && typeof lac.m_CauseLocID === 'string' && lac.m_CauseLocID ? { cause: prettyId(lac.m_CauseLocID), day: lacDays.length ? lacDays[lacDays.length - 1] : null } : null,
      regions: names.map((id, i) => ({ id, level: n(levels[i]) || 0 })),
      cooldown: cooldown.reduce((m, x) => Math.max(m, n(x) || 0), 0),
      bearEncounters: br && Array.isArray(br.m_BearEncounterInfoList) ? br.m_BearEncounterInfoList.length : null,
    };
  }

  function skillsOf(mgr, player) {
    const out = [];
    const m = asObj(mgr) || {};
    for (const [k, v] of Object.entries(m)) {
      const hit = /^m_Skill_(\w+?)Serialized$/.exec(k);
      const o = asObj(v);
      const pts = o ? n(o.m_Points) : null;
      if (hit && pts) out.push({ label: words(hit[1]), value: pts });
    }
    const pl = asObj(player) || {};
    for (const [k, label] of [['m_RepairSkill', 'Repair'], ['m_CleanSkill', 'Clean'], ['m_SharpenSkill', 'Sharpen']]) {
      const v = n(pl[k]);
      if (v) out.push({ label, value: v });
    }
    return out.sort((a, b) => b.value - a.value);
  }

  function photosOf(list) {
    const arr = Array.isArray(list) ? list : [];
    const perDay = {};
    const reg = {};
    const items = [];
    let total = 0;
    for (const p of arr) {
      if (!p || typeof p !== 'object') continue;
      total++;
      const idm = /^(\w+):(\d+)$/.exec(typeof p.m_PhotoID === 'string' ? p.m_PhotoID : '');
      if (idm) items.push({ file: idm[1], key: idm[2], day: n(p.m_Day), region: typeof p.m_RegionLocalizationKey === 'string' && p.m_RegionLocalizationKey ? prettyId(p.m_RegionLocalizationKey) : '', place: typeof p.m_LocationLocalizationKey === 'string' && p.m_LocationLocalizationKey ? prettyId(p.m_LocationLocalizationKey) : '' });
      const d = n(p.m_Day);
      if (d !== null) perDay[d] = (perDay[d] || 0) + 1;
      const r = typeof p.m_RegionLocalizationKey === 'string' && p.m_RegionLocalizationKey ? prettyId(p.m_RegionLocalizationKey) : 'Unknown';
      reg[r] = (reg[r] || 0) + 1;
    }
    const regions = Object.entries(reg).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { total, perDay, regions, items };
  }

  function sleepOf(rest) {
    const o = asObj(rest);
    const a = o && Array.isArray(o.m_LastTwentyFourHoursOfSleep) ? o.m_LastTwentyFourHoursOfSleep.map((x) => (n(x) ? 1 : 0)) : [];
    return { hours: a, total: a.reduce((t, x) => t + x, 0) };
  }

  function niceTicks(max, count) {
    if (!(max > 0)) return [0, 1];
    const raw = max / (count || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
    const top = Math.ceil(max / step - 1e-9);
    const out = [];
    for (let i = 0; i <= top; i++) out.push(+(i * step).toFixed(6));
    return out;
  }

  const api = { build, wildlife, skillsOf, photosOf, sleepOf, niceTicks, prettyId, prettyRegion, prettyAffliction };
  if (typeof document === 'undefined' || typeof TABS === 'undefined') { if (typeof module !== 'undefined') module.exports = api; return; }
  window.tldJournal = api;

  const NS = 'http://www.w3.org/2000/svg';
  const W = 720;
  const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
  const fmtTick = (v) => (v >= 10000 ? +(v / 1000).toFixed(1) + 'K' : String(+v.toFixed(2)));
  const regionLabel = (r) => (r === 'MountainPassRegion' ? 'Sundered Pass' : typeof regionName === 'function' ? regionName(r) : prettyRegion(r));
  const clip = (s, max) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function topBar(x, y, w, hgt, r) {
    const rr = Math.min(r, w / 2, hgt);
    return 'M' + x + ' ' + (y + hgt) + 'V' + (y + rr) + 'Q' + x + ' ' + y + ' ' + (x + rr) + ' ' + y + 'H' + (x + w - rr) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + rr) + 'V' + (y + hgt) + 'Z';
  }

  function endBar(x, y, len, th, r) {
    const rr = Math.min(r, th / 2, len);
    return 'M' + x + ' ' + y + 'H' + (x + len - rr) + 'Q' + (x + len) + ' ' + y + ' ' + (x + len) + ' ' + (y + rr) + 'V' + (y + th - rr) + 'Q' + (x + len) + ' ' + (y + th) + ' ' + (x + len - rr) + ' ' + (y + th) + 'H' + x + 'Z';
  }

  function makeTip(wrap) {
    const tip = h('div', { class: 'jtip', hidden: true });
    wrap.append(tip);
    return {
      put(data, clientX, anchorY) {
        tip.replaceChildren(
          h('div', { class: 'jtip-t' }, data.title),
          ...data.rows.map((r) => h('div', { class: 'jtip-r' }, r.key ? h('span', { class: 'jkey ' + r.key }) : null, h('strong', {}, r.value), h('span', { class: 'muted' }, r.label))));
        tip.hidden = false;
        const wr = wrap.getBoundingClientRect();
        const x = clientX - wr.left;
        const w = tip.offsetWidth;
        let left = x + 14;
        if (left + w > wr.width) left = x - w - 14;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = (anchorY === undefined ? 8 : anchorY) + 'px';
      },
      hide() { tip.hidden = true; },
    };
  }

  function axes(svg, g, ticks, top) {
    for (const t of ticks) {
      const y = g.mt + g.ih - (t / top) * g.ih;
      svg.append(s('line', { x1: g.ml, x2: W - g.mr, y1: y, y2: y, class: t === 0 ? 'jbase' : 'jgrid' }));
      svg.append(s('text', { x: g.ml - 8, y: y + 4, class: 'jtxt', 'text-anchor': 'end' }, fmtTick(t)));
    }
    const every = Math.max(1, Math.ceil(g.N / 10));
    for (let i = 0; i < g.N; i++) {
      if (i % every !== 0) continue;
      svg.append(s('text', { x: g.ml + g.band * (i + 0.5), y: g.mt + g.ih + 16, class: 'jtxt', 'text-anchor': 'middle' }, g.days[i].day));
    }
  }

  function geometry(days, H) {
    const g = { ml: 44, mr: 12, mt: 14, mb: 24, N: days.length, days };
    g.iw = W - g.ml - g.mr;
    g.ih = H - g.mt - g.mb;
    g.band = g.iw / g.N;
    g.H = H;
    return g;
  }

  function hover(wrap, svg, g, info) {
    const tip = makeTip(wrap);
    const cross = s('line', { class: 'jx', y1: g.mt, y2: g.mt + g.ih });
    cross.style.display = 'none';
    svg.append(cross);
    let cur = -1;
    const clear = () => {
      cross.style.display = 'none';
      svg.querySelectorAll('.hot').forEach((e) => e.classList.remove('hot'));
      tip.hide();
    };
    const show = (i, clientX) => {
      i = Math.max(0, Math.min(g.N - 1, i));
      cur = i;
      const cx = g.ml + g.band * (i + 0.5);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.style.display = '';
      svg.querySelectorAll('.hot').forEach((e) => e.classList.remove('hot'));
      const hot = svg.querySelector('[data-i="' + i + '"]');
      if (hot) hot.classList.add('hot');
      const sr = svg.getBoundingClientRect();
      tip.put(info(i), clientX === undefined ? sr.left + (cx / W) * sr.width : clientX);
    };
    const pad = s('rect', { x: g.ml, y: g.mt, width: g.iw, height: g.ih, fill: 'transparent' });
    pad.addEventListener('pointermove', (e) => {
      const sr = svg.getBoundingClientRect();
      show(Math.floor(((e.clientX - sr.left) / sr.width * W - g.ml) / g.band), e.clientX);
    });
    pad.addEventListener('pointerleave', clear);
    svg.append(pad);
    svg.addEventListener('focus', () => show(cur < 0 ? g.N - 1 : cur));
    svg.addEventListener('blur', clear);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show((cur < 0 ? g.N : cur) - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(g.N - 1); }
    });
  }

  function dayTitle(d) {
    return 'Day ' + d.day + (d.today ? ' (today, not finished)' : '');
  }

  function columnChart(days, key, o) {
    const g = geometry(days, 190);
    const vals = days.map((d) => d[key]);
    const max = Math.max(0, ...vals.filter((v) => v !== null));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const y = (v) => g.mt + g.ih - (v / top) * g.ih;
    const wrap = h('div', { class: 'jchart' });
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + g.H, class: 'jsvg', role: 'img', tabindex: 0, 'aria-label': o.label + ', one column per day, arrow keys move between days' });
    axes(svg, g, ticks, top);
    const bw = Math.max(1, Math.min(24, g.band - 2));
    let best = -1;
    days.forEach((d, i) => {
      const v = d[key];
      if (v === null || v <= 0) return;
      if (best < 0 || v > days[best][key]) best = i;
      svg.append(s('path', { d: topBar(g.ml + g.band * i + (g.band - bw) / 2, y(v), bw, g.mt + g.ih - y(v), 4), class: 'jf1', 'data-i': i }));
    });
    if (best >= 0) svg.append(s('text', { x: g.ml + g.band * (best + 0.5), y: y(days[best][key]) - 5, class: 'jtxt strong', 'text-anchor': 'middle' }, fmtInt(days[best][key]) + o.unit));
    hover(wrap, svg, g, (i) => ({ title: dayTitle(days[i]), rows: [{ key: 'k1', value: days[i][key] === null ? 'not logged yet' : fmtInt(days[i][key]) + o.unit, label: o.label }] }));
    wrap.prepend(svg);
    return wrap;
  }

  function lineChart(days, series, o) {
    const g = geometry(days, 210);
    const all = series.flatMap((sr) => days.map((d) => d[sr.key]).filter((v) => v !== null));
    const max = Math.max(0, ...all);
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const y = (v) => g.mt + g.ih - (v / top) * g.ih;
    const x = (i) => g.ml + g.band * (i + 0.5);
    const wrap = h('div', { class: 'jchart' });
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + g.H, class: 'jsvg', role: 'img', tabindex: 0, 'aria-label': o.label + ', one point per day, arrow keys move between days' });
    axes(svg, g, ticks, top);
    if (series.length === 2) {
      const a = [], b = [];
      days.forEach((d, i) => { if (d[series[0].key] !== null && d[series[1].key] !== null) { a.push(x(i) + ' ' + y(d[series[0].key])); b.unshift(x(i) + ' ' + y(d[series[1].key])); } });
      if (a.length > 1) svg.append(s('path', { d: 'M' + a.join('L') + 'L' + b.join('L') + 'Z', class: 'jwash' }));
    }
    series.forEach((sr, k) => {
      let path = '', lastI = -1;
      days.forEach((d, i) => {
        const v = d[sr.key];
        if (v === null) return;
        path += (path && lastI === i - 1 ? 'L' : 'M') + x(i) + ' ' + y(v);
        lastI = i;
      });
      svg.append(s('path', { d: path, class: 'jl' + (k + 1) }));
      if (lastI >= 0) {
        svg.append(s('circle', { cx: x(lastI), cy: y(days[lastI][sr.key]), r: 4, class: 'jdot jf' + (k + 1) }));
        if (series.length === 1) svg.append(s('text', { x: x(lastI) - 8, y: y(days[lastI][sr.key]) - 9, class: 'jtxt strong', 'text-anchor': 'end' }, fmtInt(days[lastI][sr.key]) + o.unit));
      }
    });
    hover(wrap, svg, g, (i) => ({
      title: dayTitle(days[i]),
      rows: series.map((sr, k) => ({ key: 'k' + (k + 1), value: days[i][sr.key] === null ? 'none' : fmtInt(days[i][sr.key]) + o.unit, label: sr.label })),
    }));
    wrap.prepend(svg);
    return wrap;
  }

  function barRows(items, o) {
    const rowH = 26, th = 14, ml = 150, mr = 90, mt = 4;
    const H = mt + rowH * items.length + 4;
    const max = Math.max(...items.map((i) => i.value), 0) || 1;
    const iw = W - ml - mr;
    const wrap = h('div', { class: 'jchart' });
    const tip = makeTip(wrap);
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'jsvg', role: 'img', 'aria-label': o.label });
    items.forEach((it, i) => {
      const y = mt + rowH * i;
      const len = Math.max(0, (it.value / max) * iw);
      const gr = s('g', { class: 'jrow', tabindex: 0, 'aria-label': it.label + ', ' + o.fmt(it.value) });
      gr.append(s('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' }));
      gr.append(s('text', { x: ml - 8, y: y + (rowH + th) / 2 - 2, class: 'jtxt', 'text-anchor': 'end' }, clip(it.label, 24)));
      if (len > 0) gr.append(s('path', { d: endBar(ml, y + (rowH - th) / 2, len, th, 4), class: 'jf1' }));
      gr.append(s('text', { x: ml + len + 6, y: y + (rowH + th) / 2 - 2, class: 'jtxt strong' }, o.fmt(it.value)));
      const data = { title: it.label, rows: [{ key: 'k1', value: o.fmt(it.value), label: o.what }] };
      gr.addEventListener('pointermove', (e) => { gr.classList.add('hot'); tip.put(data, e.clientX, y); });
      gr.addEventListener('pointerleave', () => { gr.classList.remove('hot'); tip.hide(); });
      gr.addEventListener('focus', () => { gr.classList.add('hot'); const r = gr.getBoundingClientRect(); tip.put(data, r.left + r.width / 2, y); });
      gr.addEventListener('blur', () => { gr.classList.remove('hot'); tip.hide(); });
      svg.append(gr);
    });
    wrap.prepend(svg);
    return wrap;
  }

  function heatmap(rows, days, o) {
    o = o || {};
    const rowH = 20, ml = 150, mt = 4, gap = 2;
    const H = mt + rowH * rows.length + 22;
    const N = days.length;
    const cw = (W - ml - 12) / N;
    const wrap = h('div', { class: 'jchart' });
    const tip = makeTip(wrap);
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'jsvg', role: 'img', 'aria-label': 'Afflictions by day. The table view lists every day.' });
    rows.forEach((r, ri) => {
      const y = mt + rowH * ri;
      svg.append(s('text', { x: ml - 8, y: y + 14, class: 'jtxt', 'text-anchor': 'end' }, clip(prettyAffliction(r.id), 24)));
      days.forEach((d, di) => {
        const on = d.afflictions.includes(r.id);
        const cell = s('rect', { x: ml + cw * di + gap / 2, y: y + gap / 2, width: Math.max(1, cw - gap), height: rowH - gap, rx: 2, class: on ? 'jf1' : 'jempty' });
        if (on) {
          const data = { title: o.title ? o.title(d) : dayTitle(d), rows: [{ key: 'k1', value: prettyAffliction(r.id), label: o.verb || 'active that day' }] };
          cell.addEventListener('pointermove', (e) => { cell.classList.add('hot'); tip.put(data, e.clientX, y); });
          cell.addEventListener('pointerleave', () => { cell.classList.remove('hot'); tip.hide(); });
        }
        svg.append(cell);
      });
    });
    const every = Math.max(1, Math.ceil(N / 10));
    days.forEach((d, i) => { if (i % every === 0) svg.append(s('text', { x: ml + cw * (i + 0.5), y: H - 6, class: 'jtxt', 'text-anchor': 'middle' }, d.day)); });
    wrap.prepend(svg);
    return wrap;
  }

  function legend(items) {
    return h('div', { class: 'jlegend' }, items.map((it) => h('span', {}, h('span', { class: 'jkey ' + it.key }), it.label)));
  }

  function tableOf(cols, rows) {
    return h('div', { class: 'jtable' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c === null || c === undefined ? '' : String(c))))))));
  }

  function card(title, sub, chart, extra, cols, rows) {
    const tbl = tableOf(cols, rows);
    tbl.hidden = true;
    const btn = h('button', { type: 'button', class: 'ghost small', 'aria-expanded': 'false' }, 'Show as table');
    btn.addEventListener('click', () => {
      tbl.hidden = !tbl.hidden;
      btn.textContent = tbl.hidden ? 'Show as table' : 'Hide table';
      btn.setAttribute('aria-expanded', String(!tbl.hidden));
    });
    return h('div', { class: 'card journal-card' },
      h('div', { class: 'jhead' }, h('h3', {}, title), btn),
      sub ? h('p', { class: 'muted small' }, sub) : null,
      extra || null,
      chart,
      tbl);
  }

  function lightbox(src, caption) {
    const dlg = h('dialog', { class: 'jlight' },
      h('img', { src, alt: caption }),
      h('p', { class: 'muted small' }, caption));
    dlg.addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  function photoGallery(items) {
    const box = h('div', { class: 'jphotos' });
    const status = h('p', { class: 'muted small' }, 'Loading photos…');
    const files = [...new Set(items.map((i) => i.file))];
    (async () => {
      const data = {};
      for (const f of files) {
        const bytes = await window.tldReadSibling(f);
        if (!bytes) continue;
        try { data[f] = JSON.parse(dec(lzfDecompress(bytes))); } catch (e) { }
      }
      const slot = state.fileName;
      let shown = 0;
      for (const it of items) {
        const e = data[it.file] && data[it.file][it.key];
        if (!e || typeof e.m_JpegData !== 'string') continue;
        if (slot && e.m_AssociatedSave && e.m_AssociatedSave !== slot) continue;
        const src = 'data:image/jpeg;base64,' + e.m_JpegData;
        const cap = [it.day !== null ? 'Day ' + it.day : '', it.place, it.region].filter(Boolean).join(' · ');
        const btn = h('button', { class: 'jphoto', type: 'button', 'aria-label': 'Open photo, ' + cap }, h('img', { src, alt: cap, loading: 'lazy' }), h('span', { class: 'jphoto-c' }, cap));
        btn.addEventListener('click', () => lightbox(src, cap));
        box.append(btn);
        shown++;
      }
      status.textContent = shown ? '' : 'The photo file has no photos for this slot.';
      if (shown) status.remove();
    })().catch(() => { status.textContent = 'Could not read the photo file.'; });
    return h('div', {}, status, box);
  }

  function tile(label, value, sub) {
    return h('div', { class: 'jtile' }, h('div', { class: 'jtile-l' }, label), h('div', { class: 'jtile-v' }, value), sub ? h('div', { class: 'jtile-s muted' }, sub) : null);
  }

  function viewJournal() {
    const log = gs(SEC);
    if (!log || typeof log !== 'object') return h('div', { class: 'card' }, h('p', { class: 'muted' }, 'This slot has no journal data.'));
    const D = build(log, gs(STAT_SEC));
    if (!D.days.length) return h('div', { class: 'card' }, h('p', { class: 'muted' }, 'The journal has no days in it yet.'));
    const days = D.days;
    const rows = (fn) => days.map(fn);
    const kids = [h('h2', { class: 'jhead' }, 'Game stats')];

    kids.push(h('div', { class: 'jtiles' },
      tile('Days logged', fmtInt(D.totals.logged)),
      tile('Calories burned', fmtInt(D.totals.burned), 'over the logged days'),
      tile('Hours rested', fmtInt(D.totals.rested), D.totals.logged ? (D.totals.rested / D.totals.logged).toFixed(1) + ' per day' : ''),
      tile('World explored', D.totals.explored === null ? 'none' : fmtInt(D.totals.explored) + '%', 'at the last logged day')));

    kids.push(card('Condition', 'The lowest and highest condition on each day.',
      lineChart(days, [{ key: 'high', label: 'Highest' }, { key: 'low', label: 'Lowest' }], { label: 'Condition', unit: '%' }),
      legend([{ key: 'k1', label: 'Highest of the day' }, { key: 'k2', label: 'Lowest of the day' }]),
      ['Day', 'Highest', 'Lowest'], rows((d) => [d.day, d.high, d.low])));

    kids.push(card('World explored', 'How much of the world you had explored at the end of each day.',
      lineChart(days, [{ key: 'explored', label: 'Explored' }], { label: 'World explored', unit: '%' }), null,
      ['Day', 'Explored %'], rows((d) => [d.day, d.explored])));

    kids.push(card('Calories burned', null, columnChart(days, 'burned', { label: 'Calories burned', unit: '' }), null,
      ['Day', 'Calories burned'], rows((d) => [d.day, d.burned])));

    kids.push(card('Hours rested', null, columnChart(days, 'rested', { label: 'Hours rested', unit: ' h' }), null,
      ['Day', 'Hours rested'], rows((d) => [d.day, d.rested])));

    if (D.afflictionDays.length) {
      const items = D.afflictionDays.map((a) => ({ label: prettyAffliction(a.id), value: a.value }));
      kids.push(card('Days with each affliction', 'How many days each one was active.',
        barRows(items, { label: 'Days with each affliction', what: 'days', fmt: (v) => fmtInt(v) + (v === 1 ? ' day' : ' days') }), null,
        ['Affliction', 'Days'], items.map((i) => [i.label, i.value])));
      kids.push(card('Afflictions by day', 'A filled square means the affliction was active that day.',
        heatmap(D.afflictionDays, days), null,
        ['Day', 'Afflictions'], rows((d) => [d.day, d.afflictions.map(prettyAffliction).join(', ')])));
    }

    const W2 = wildlife(D, gs('m_SevereLacerationSerialized'), gs('m_CougarManagerSerialized'), gs('m_BearHuntReduxSerialized'));
    const hasPred = W2.wounds.length || W2.current || W2.regions.length || W2.bearEncounters !== null;
    if (hasPred) {
      if (W2.wounds.length) {
        kids.push(card('Wounds by day', 'Guessed from your wounds, the save doesn\'t keep a list of attacks. A filled square means the wound was there that day.',
          heatmap(W2.wounds, days), null,
          ['Day', 'Wounds'], rows((d) => [d.day, d.afflictions.filter((a) => WOUND_IDS.includes(a)).map(prettyAffliction).join(', ')])));
      }
      if (W2.regions.length) {
        const items = W2.regions.map((r) => ({ label: regionLabel(r.id), value: r.level }));
        kids.push(card('Cougar threat by region', 'The threat level the game tracks for each region.',
          barRows(items, { label: 'Cougar threat by region', what: 'level', fmt: (v) => 'level ' + fmtInt(v) }), null,
          ['Region', 'Threat level'], items.map((i) => [i.label, i.value])));
      }
    }

    if (D.regionDays.length) {
      const items = D.regionDays.map((r) => ({ label: regionLabel(r.id), value: r.value }));
      kids.push(card('Days spent in each region', 'A day counts for every region you visited on it.',
        barRows(items, { label: 'Days spent in each region', what: 'days', fmt: (v) => fmtInt(v) + (v === 1 ? ' day' : ' days') }), null,
        ['Region', 'Days'], items.map((i) => [i.label, i.value])));
    }

    if (D.places.length) {
      const all = D.places.map((p) => ({ label: prettyId(p.id), value: p.value }));
      const top = all.slice(0, 12);
      kids.push(card('Most visited places', top.length < all.length ? 'The ' + top.length + ' places visited most often, the table lists all ' + all.length + '.' : null,
        barRows(top, { label: 'Most visited places', what: 'visits', fmt: (v) => fmtInt(v) + (v === 1 ? ' visit' : ' visits') }), null,
        ['Place', 'Visits'], all.map((i) => [i.label, i.value])));
    }

    const skills = skillsOf(gs('m_SkillsManagerSerialized'), gs('m_PlayerSkillsSerialized'));
    if (skills.length) {
      kids.push(card('Skills', 'Skill points for every skill that has any.',
        barRows(skills, { label: 'Skills', what: 'points', fmt: (v) => fmtInt(v) + (v === 1 ? ' point' : ' points') }), null,
        ['Skill', 'Points'], skills.map((i) => [i.label, i.value])));
    }

    const ph = photosOf(gs('m_PhotoManagerSerialized'));
    if (ph.total) {
      const perDay = days.map((d) => ({ day: d.day, today: d.today, photos: ph.perDay[d.day] || 0 }));
      kids.push(card('Photos by day', ph.total + (ph.total === 1 ? ' photo' : ' photos') + ' taken.',
        columnChart(perDay, 'photos', { label: 'Photos', unit: '' }), null,
        ['Day', 'Photos'], perDay.filter((d) => d.photos).map((d) => [d.day, d.photos])));
      if (typeof window.tldReadSibling === 'function' && ph.items.length) kids.push(h('div', { class: 'card journal-card' }, h('h3', {}, 'Photos'), photoGallery(ph.items)));
      kids.push(card('Photos by region', null,
        barRows(ph.regions, { label: 'Photos by region', what: 'photos', fmt: (v) => fmtInt(v) + (v === 1 ? ' photo' : ' photos') }), null,
        ['Region', 'Photos'], ph.regions.map((i) => [i.label, i.value])));
    }

    const sl = sleepOf(gs('m_RestSerialized'));
    if (sl.hours.length) {
      const cells = sl.hours.map((x, i) => ({ day: i + 1, afflictions: x ? ['Sleep'] : [] }));
      kids.push(card('Sleep in the last 24 hours', sl.total + (sl.total === 1 ? ' hour' : ' hours') + ' asleep. Hours are shown oldest first, which is an assumption.',
        heatmap([{ id: 'Sleep' }], cells, { title: (d) => 'Hour ' + d.day + ' of 24', verb: 'asleep' }), null,
        ['Hour', 'Asleep'], cells.map((c) => [c.day, c.afflictions.length ? 'yes' : 'no'])));
    }

    const st = D.stats;
    const pair = (title, a, b, fmt, what) => (a.value === null && b.value === null ? null : card(title, null,
      barRows([{ label: a.label, value: a.value || 0 }, { label: b.label, value: b.value || 0 }], { label: title, what, fmt }), null,
      ['Measure', 'Value'], [[a.label, a.value], [b.label, b.value]]));
    kids.push(pair('Calories, whole slot', { label: 'Burned', value: st.caloriesBurned }, { label: 'Eaten', value: st.caloriesEaten }, (v) => fmtInt(v) + ' kcal', 'calories'));
    kids.push(pair('Distance travelled, whole slot', { label: 'By day', value: st.distanceDay }, { label: 'By night', value: st.distanceNight }, (v) => (v / 1000).toFixed(1) + ' km', 'distance'));
    kids.push(pair('Condition, whole slot', { label: 'Gained', value: st.conditionGained }, { label: 'Lost', value: st.conditionLost }, (v) => fmtInt(v) + ' points', 'condition'));

    if (D.notes.length || D.general) {
      kids.push(h('div', { class: 'card journal-card' },
        h('h3', {}, 'Notes'),
        D.general ? h('p', {}, D.general) : null,
        ...D.notes.map((nt) => h('p', { class: 'small' }, h('strong', {}, 'Day ' + nt.day + ' '), nt.text))));
    }
    return h('div', { class: 'journal' }, kids.filter(Boolean));
  }

  TABS.push(['journal', 'Journal', viewJournal]);
})();
