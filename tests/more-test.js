global.document = { addEventListener() {} };
global.window = undefined;
const E = require('../ui/editor.js');
Object.assign(global, { parseJSON: E.parseJSON, Nested: E.Nested, Raw: E.Raw, sub: E.sub, num: E.num });
const M = require('../ui/more.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };

const text = JSON.stringify({
  m_WellFedSerialized: JSON.stringify({ m_Active: false, m_ElapsedHoursNotStarving: 10 }),
  m_PlayerGameStatsSerialized: JSON.stringify({ m_DistanceTravelledByDay: 12.5 }),
  m_FeatsEnabledSerialized: JSON.stringify({ m_FeatsEnabledThisSandbox: ['FreeRunner'] }),
  m_TraderSerialized: require('./trader-fixture.json'),
});
const orig = E.parseJSON(text), live = E.parseJSON(text);
const gsOf = (g) => (n) => E.sub(g, n);
const R = (g) => ({ gs: gsOf(g) });
const run = (edit) => {
  const g = E.parseJSON(text);
  edit(gsOf(g));
  const out = { errors: [], warnings: [] };
  M.validate(out, gsOf(orig), gsOf(g), (o, f, a, b, r) => { if (r) (r.level === 'error' ? o.errors : o.warnings).push(r.msg); });
  return { out, diff: M.diff(M.snap(R(orig)), M.snap(R(g))), g };
};

ok([...M.snap(R(live)).keys()].filter((k) => !k.startsWith('m_TraderSerialized|') && !k.startsWith('m_FeatsEnabledSerialized|')).length === 3, 'snapshot counts every leaf');
ok(run(() => {}).diff.length === 0 && run(() => {}).out.errors.length === 0, 'no edits give no changes');
ok(E.ser(live) === E.ser(E.parseJSON(text)), 'unchanged sections serialize back identically');
ok(!M.MORE_SECTIONS.includes('m_Wind_Serialized') && !M.MORE_SECTIONS.includes('m_AchievementManagerSerialized') && !M.MORE_SECTIONS.includes('m_RecipeBookState'), 'features that are not released are not part of the tab');

let r = run((gs) => { gs('m_WellFedSerialized').m_ElapsedHoursNotStarving = 20; });
ok(r.diff.length === 1 && /10 → 20/.test(r.diff[0]), 'hours without starving is listed');
ok(r.out.errors.length === 0 && r.out.warnings.length === 0, 'a normal value is accepted');
ok(run((gs) => { gs('m_WellFedSerialized').m_ElapsedHoursNotStarving = -1; }).out.errors.length === 1, 'negative hours block the save');
ok(run((gs) => { gs('m_WellFedSerialized').m_ElapsedHoursNotStarving = 3000; }).out.warnings.length === 1, 'a very long time warns');
ok(run((gs) => { gs('m_PlayerGameStatsSerialized').m_DistanceTravelledByDay = -5; }).out.errors.length === 1, 'negative distance blocks the save');
r = run((gs) => { gs('m_WellFedSerialized').m_Active = true; });
ok(r.diff.length === 1 && /off → on/.test(r.diff[0]), 'toggles are listed as off to on');
ok(M.human('m_ElapsedHoursNotStarving') === 'Elapsed hours not starving' && M.human('m_NumDaysSurvived') === 'Num days survived', 'labels are readable');

const names = M.traderNames(require('../ui/trader-data.js'), (id) => id);
const tv = M.traderView(gsOf(E.parseJSON(text))('m_TraderSerialized'), names);
ok(tv.contacted && tv.trust === 3 && tv.highest === 3 && tv.contacts === 1, 'trader trust and contacts are read');
ok(tv.offers.length === 2 && tv.offers[0].gained === 'GEAR_SaltBag' && tv.offers[0].max === 3, 'trader offers resolve to item ids');
ok(tv.offers[0].price.join('; ') === '3 kg of any raw animal; 1 L of water' && tv.offers[0].cheap.join('; ') === '2 kg of any raw animal; 0.75 L of water', 'weight and liquid prices are readable');
ok(tv.offers[1].price.join('; ') === '4 × any dried hide; 4.5 L of water; 6 × GEAR_PtarmiganFeathers', 'category and item prices are readable');
ok(tv.active && tv.active.scene === 'CoastalRegion' && tv.active.trades.length === 1 && tv.active.trades[0].gained === 'GEAR_BlueprintCard_WolfSkinPants' && tv.active.trades[0].handedOver === 0, 'the agreed trade and its box are read');
ok(tv.active.trades[0].price.join('; ') === '3 L of kerosene; 1 × GEAR_CarBattery; 8 × GEAR_Cloth', 'the agreed price is readable');
ok(M.traderCost({ m_GearItemData: 'ffffffffffffffffffffffffffffffff', m_Amount: 2 }, names) === '2 × Unknown item', 'an unknown guid is shown as unknown');
const none = M.traderView({ m_SystemEnabled: true, m_AvailableExchangesThisAurora: [] }, names);
ok(!none.contacted && none.offers.length === 0 && none.active === null, 'a slot without trader contact is empty');
r = run((gs) => { M.setTrust(gs('m_TraderSerialized'), 4); });
ok(r.out.errors.length === 0 && r.diff.length === 2 && r.diff.some((l) => /Trader, Current trust: 3 → 4/.test(l)) && r.diff.some((l) => /Trader, Highest trust: 3 → 4/.test(l)), 'raising trust raises the highest trust and is listed');
r = run((gs) => { M.setTrust(gs('m_TraderSerialized'), 1); });
ok(r.out.errors.length === 0 && r.diff.length === 1 && gsOf(r.g)('m_TraderSerialized').m_HighestTrust === 3, 'lowering trust keeps the highest trust');
ok(run((gs) => { gs('m_TraderSerialized').m_CurrentTrust = 5; }).out.errors.length === 1, 'trust above the highest trust blocks the save');
ok(run((gs) => { M.setTrust(gs('m_TraderSerialized'), -1); }).out.errors.length === 1, 'negative trust blocks the save');
r = run((gs) => { M.setTrust(gs('m_TraderSerialized'), 4); M.setTrust(gs('m_TraderSerialized'), 3); gs('m_TraderSerialized').m_HighestTrust = 3; });
ok(r.diff.length === 0 && E.ser(r.g) === E.ser(E.parseJSON(text)), 'undoing the trust change restores the section');

r = run((gs) => { M.setFeat(gs('m_FeatsEnabledSerialized'), 'ColdFusion', true); });
ok(r.diff.length === 1 && /added: ColdFusion/.test(r.diff[0]) && r.out.errors.length === 0 && r.out.warnings.length === 0, 'enabling a feat is listed and accepted');
r = run((gs) => { M.setFeat(gs('m_FeatsEnabledSerialized'), 'FreeRunner', false); });
ok(r.diff.length === 1 && /removed: FreeRunner/.test(r.diff[0]), 'disabling a feat is listed');
r = run((gs) => { const f = gs('m_FeatsEnabledSerialized'); M.setFeat(f, 'FreeRunner', true); M.setFeat(f, 'FreeRunner', true); });
ok(r.diff.length === 0 && r.out.errors.length === 0, 'enabling a feat twice changes nothing');
r = run((gs) => { const f = gs('m_FeatsEnabledSerialized'); for (const x of M.FEATS) M.setFeat(f, x.id, true); });
ok(r.out.warnings.length === 1 && r.out.errors.length === 0, 'more feats than any difficulty allows warns');
r = run((gs) => { M.setFeat(gs('m_FeatsEnabledSerialized'), 'Bad id!', true); });
ok(r.out.errors.length === 1, 'a feat id with odd characters blocks the save');
ok(M.featLimit('Voyageur') === 4 && M.featLimit('Interloper') === 2 && M.featLimit('Nope') === null, 'feat limits follow the difficulty');
ok(M.featsView({ m_FeatsEnabledThisSandbox: ['FreeRunner', 'Mystery'] }, 'Stalker').unknown.join() === 'Mystery', 'unknown feat ids are reported');
ok(M.featsView(null, '').enabled === 0, 'a missing feats section counts as none');
ok(M.traderView({ m_CurrentTrust: 30, m_TimeLastTradeComplete: 1760.791 }, {}).lastTrade === 1760.791 && M.traderView({ m_CurrentTrust: 3 }, {}).lastTrade === null, 'the completed trade time is read when present');

const tr1 = { m_CurrentTrust: 3, m_ActiveTrade: { m_ExchangeBoxScene: 'CoastalRegion', m_ExchangeStates: [{ m_Exchange: { m_TradeExchangeName: 'CookingOil', m_GainedItem: 'abc', m_GainedItemAmount: 2 }, m_ExchangedItems: [] }] } };
const gains = M.completeTrade(tr1, 1760.79123);
ok(gains.length === 1 && gains[0].guid === 'abc' && gains[0].amount === 2 && gains[0].name === 'CookingOil', 'completing a trade returns what it gives');
ok(!('m_ActiveTrade' in tr1) && tr1.m_TimeLastTradeComplete === 1760.791, 'completing a trade clears the agreed trade and marks the time');
const tr2 = { m_CurrentTrust: 3 };
ok(M.completeTrade(tr2, 5).length === 0 && !('m_TimeLastTradeComplete' in tr2), 'without an agreed trade nothing changes');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
