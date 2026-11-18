global.document = { addEventListener() {} };
global.window = undefined;
const E = require('../ui/editor.js');
Object.assign(global, { parseJSON: E.parseJSON, Nested: E.Nested, Raw: E.Raw, sub: E.sub, num: E.num });
const W = require('../ui/world.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };

const sg = { m_Version: 1, m_BunkerSetup: [
  { m_BunkerId: 'aaa', m_InteriorId: 'PrepperCacheAEmpty_InteriorSpecification' },
  { m_BunkerId: 'ddd', m_InteriorId: 'PrepperCacheD_InteriorSpecification' },
  { m_BunkerId: 'eee', m_InteriorId: 'PrepperCacheE_InteriorSpecification' },
] };
const trig = (o) => JSON.stringify(o);
const regionText = JSON.stringify({
  m_Version: 4,
  m_LoadSceneTriggersSerialized: JSON.stringify({ strings: [
    trig({ m_Position: [1, 2, 3], m_GUID: 'x1', m_Explored: true, m_GameGuid: 'house' }),
    trig({ m_Position: [4, 5, 6], m_GUID: 'x2', m_GameGuid: 'ddd' }),
    trig({ m_Position: [7, 8, 9], m_GUID: 'x3', m_Explored: true, m_GameGuid: 'aaa' }),
  ] }),
  m_RadialObjectSpawnersSerialized: JSON.stringify({ strings: [
    trig({ m_GameHourTimeToRespawn: 5000.5, m_Guid: 's1', m_HasSpawned: true, m_SpawnedPrefabNames: ['GEAR_Stick', 'GEAR_Stick'] }),
    trig({ m_GameHourTimeToRespawn: 100, m_Guid: 's2', m_HasSpawned: true, m_SpawnedPrefabNames: ['GEAR_Stone'] }),
    trig({ m_GameHourTimeToRespawn: 3000, m_Guid: 's3', m_HasSpawned: true, m_SpawnedPrefabNames: ['INTERACTIVE_BranchA_Prefab'] }),
  ] }),
});
const fresh = () => E.parseJSON(regionText);
const ids = new Set(W.bunkers(sg).map((b) => b.id));

const b = W.bunkers(sg);
ok(b.length === 3, 'every bunker is listed');
ok(b.find((x) => x.id === 'aaa').full === false && b.find((x) => x.id === 'ddd').full === true, 'Empty in the interior id means an empty cache');
ok(b.find((x) => x.id === 'ddd').type === 'Stocked cache' && b.find((x) => x.id === 'aaa').type === 'Abandoned cache', 'cache types are named');

const view = W.cacheView(sg, ['LakeRegion', 'Nowhere'], (k) => (k === 'LakeRegion' ? fresh() : null));
ok(view.find((c) => c.id === 'ddd').region === 'LakeRegion' && view.find((c) => c.id === 'ddd').explored === false, 'a hatch without m_Explored is not visited');
ok(view.find((c) => c.id === 'aaa').explored === true, 'a visited hatch is shown as visited');
ok(view.find((c) => c.id === 'eee').region === null, 'a cache in a region not in the save has no region');

let r = fresh();
ok(E.ser(r) === regionText, 'an untouched region serializes back identically');
W.cacheView(sg, ['LakeRegion'], () => r);
ok(E.ser(r) === regionText, 'reading the caches changes nothing');
ok(W.revealHatches(r, ids) === 1, 'force reveal marks only unvisited prepper hatches');
let back = JSON.parse(JSON.parse(E.ser(r)).m_LoadSceneTriggersSerialized).strings.map((s) => JSON.parse(s));
ok(back[1].m_Explored === true && back[0].m_GameGuid === 'house' && back[2].m_Explored === true, 'the hatch is written back as visited');
ok(W.revealHatches(r, ids) === 0, 'a second reveal does nothing');
ok(W.changes(fresh(), r, ids, 2000, 'Mystery Lake').some((l) => /prepper hatches visited 1 → 2/.test(l)), 'the reveal is listed as a change');

const md = { m_UnlockedRegionNames: ['LakeRegion'] };
ok(W.unlockRegions(md, ['LakeRegion', 'CoastalRegion', 'RuralRegion']) === 2 && md.m_UnlockedRegionNames.length === 3, 'regions are unlocked once each');
ok(W.unlockedChanges({ m_UnlockedRegionNames: ['LakeRegion'] }, md)[0] === 'Regions unlocked on the map, added: CoastalRegion, RuralRegion', 'unlocked regions are listed');

const v = W.spawnerView(fresh(), 2000);
ok(v.total === 3 && v.waiting === 2 && v.soonest === 3000 && v.latest === 5000.5, 'waiting spawners are counted');
ok(v.items.get('Sticks') === 2 && v.items.get('Branches') === 1, 'spawned items get plain names');
r = fresh();
ok(W.respawnNow(r, 2000) === 2, 'respawn now touches only waiting spawners');
ok(W.spawnerView(r, 2000).waiting === 0, 'nothing waits after respawn now');
back = JSON.parse(JSON.parse(E.ser(r)).m_RadialObjectSpawnersSerialized).strings.map((s) => JSON.parse(s));
ok(back[0].m_GameHourTimeToRespawn === 2000 && back[1].m_GameHourTimeToRespawn === 100 && back[0].m_SpawnedPrefabNames.length === 2, 'respawn time is written and the rest is kept');
ok(W.changes(fresh(), r, ids, 2000, 'Mystery Lake').some((l) => /waiting to respawn 2 → 0/.test(l)), 'respawn now is listed as a change');
ok(W.changes(fresh(), fresh(), ids, 2000, 'Mystery Lake').length === 0, 'no edits give no changes');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
