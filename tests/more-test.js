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

ok([...M.snap(R(live)).keys()].filter((k) => !k.startsWith('m_TraderSerialized|')).length === 3, 'snapshot counts every leaf');
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

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
