global.document = { addEventListener() {} };
global.window = undefined;
const J = require('../ui/journal.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };

const log = {
  m_GeneralNotes: ' My notes ',
  m_DayToLogEndOfDayInfo: 4,
  m_LogDayInfoList: [
    { m_DayNumber: 1, m_WorldExplored: 1, m_HoursRested: 3, m_ConditionLow: 100, m_ConditionHigh: 100, m_CaloriesBurned: 895, m_Afflictions: ['SprainPain', 'SprainedAnkle'], m_LocationLocIDs: ['SCENENAME_TrappersHomestead', 'GAMEPLAY_TrappersHomestead', 'SCENENAME_CampOffice'], m_RegionSceneNames: ['LakeRegion'] },
    { m_DayNumber: 2, m_ConditionLow: 90, m_ConditionHigh: 99, m_Afflictions: ['SprainPain'], m_LocationLocIDs: ['SCENENAME_CampOffice', 'SCENENAME_CampOffice'], m_RegionSceneNames: ['LakeRegion', 'RuralRegion'], m_Notes: 'Wolf near the dam' },
    { m_DayNumber: 3, m_WorldExplored: 5, m_HoursRested: 8, m_CaloriesBurned: 2100, m_ConditionLow: 80, m_ConditionHigh: 100, m_Afflictions: ['FoodPoisioning'], m_RegionSceneNames: ['RuralRegion'] },
    null,
  ],
  m_TodayLogDayInfo: { m_ConditionLow: 70, m_ConditionHigh: 95, m_Afflictions: ['SprainPain'], m_RegionSceneNames: ['CoastalRegion'], m_LocationLocIDs: ['SCENENAME_CampOffice'] },
};
const stats = { m_CaloriesBurned: 5000, m_CaloriesEaten: 4800.5, m_DistanceTravelledDay: 12000, m_ConditionGained: 10, m_ConditionLost: 12 };
const D = J.build(log, stats);

ok(D.days.length === 4 && D.days[3].today === true && D.days[3].day === 4, 'the unfinished day is added as today');
ok(D.days[1].explored === 0 && D.days[1].rested === 0 && D.days[1].burned === 0, 'values the game leaves out count as zero on finished days');
ok(D.days[3].burned === null && D.days[3].rested === null && D.days[3].low === 70, 'today keeps missing values empty');
ok(D.totals.logged === 3 && D.totals.burned === 2995 && D.totals.rested === 11 && D.totals.explored === 5, 'totals use only the finished days');
ok(D.afflictionDays[0].id === 'SprainPain' && D.afflictionDays[0].value === 3, 'afflictions are counted once per day and sorted');
ok(D.regionDays.find((r) => r.id === 'LakeRegion').value === 2 && D.regionDays.find((r) => r.id === 'RuralRegion').value === 2, 'regions are counted once per day');
ok(J.build({ m_LogDayInfoList: [{ m_DayNumber: 1, m_RegionSceneNames: [], m_RegionLocIDs: ['SCENENAME_MountainTownRegion', 'SCENENAME_MountainTownRegion', ''] }, { m_DayNumber: 2, m_RegionSceneNames: ['LakeRegion'], m_RegionLocIDs: ['SCENENAME_MysteryLake', 'SCENENAME_MountainPass'] }] }).regionDays.map((r) => r.id + ':' + r.value).join() === 'LakeRegion:1,MountainPassRegion:1,MountainTownRegion:1', 'regions only in the location region ids are counted');
ok(D.places[0].id === 'SCENENAME_CampOffice' && D.places[0].value === 4, 'places count every visit');
ok(D.notes.length === 1 && D.notes[0].day === 2 && D.general === 'My notes', 'notes are collected and trimmed');
ok(D.stats.caloriesEaten === 4800.5 && D.stats.distanceNight === null && D.stats.conditionLost === 12, 'slot totals are read, missing ones are null');
ok(J.build(null, null).days.length === 0 && J.build({}, {}).totals.logged === 0, 'an empty or missing log gives no days');
ok(J.build({ m_LogDayInfoList: [{ m_ConditionLow: 5 }, { m_ConditionLow: 6 }] }).days.map((d) => d.day).join() === '1,2', 'days without a number are numbered in order');
ok(J.build({ m_LogDayInfoList: [{ m_DayNumber: 5 }], m_DayToLogEndOfDayInfo: 5, m_TodayLogDayInfo: {} }).days.length === 1, 'today is not added twice');

ok(J.niceTicks(0).join() === '0,1' && J.niceTicks(895).join() === '0,200,400,600,800,1000', 'axis ticks round to clean numbers: ' + J.niceTicks(895).join());
ok(J.niceTicks(105).join() === '0,25,50,75,100,125' && J.niceTicks(13).join() === '0,5,10,15', 'axis ticks cover the maximum: ' + J.niceTicks(105).join() + ' / ' + J.niceTicks(13).join());
ok(J.prettyId('SCENENAME_QuonsetGasStation') === 'Quonset Gas Station' && J.prettyId('GAMEPLAY_TrainEngine') === 'Train Engine', 'place names are readable');
ok(J.prettyRegion('LongRailTransitionZone') === 'Long Rail Transition Zone' && J.prettyRegion('CoastalRegion') === 'Coastal', 'region names are readable');
ok(J.prettyAffliction('FoodPoisioning') === 'Food poisoning' && J.prettyAffliction('SprainedAnkle') === 'Sprained Ankle', 'affliction names are readable');


const Wd = J.wildlife(D, { m_CauseLocID: 'GAMEPLAY_CougarAttack' }, JSON.stringify({ m_RegionThreatLevelNames: ['LakeRegion', 'RuralRegion'], m_RegionThreatLevels: [0, 2], m_ThreatCooldownDays: [1.5, 0] }), '{"m_BearEncounterInfoList":[]}');
ok(Wd.current && Wd.current.cause === 'Cougar Attack' && Wd.current.day === null, 'current wound cause is read');
ok(Wd.regions.length === 2 && Wd.regions[1].level === 2 && Wd.cooldown === 1.5, 'cougar threat levels are read');
ok(Wd.bearEncounters === 0 && Wd.wounds.length === 0 && Wd.woundDays === 0, 'bear encounters and wound days are read');
ok(J.wildlife(D, null, null, null).current === null && J.wildlife(D, null, null, null).bearEncounters === null, 'missing sections give empty results');

const sk = J.skillsOf({ m_Skill_FirestartingSerialized: '{"m_Points":200}', m_Skill_IceFishingSerialized: '{}', m_Skill_ClothingRepairSerialized: '{"m_Points":178}' }, { m_RepairSkill: 62, m_CleanSkill: 0 });
ok(sk.length === 3 && sk[0].label === 'Firestarting' && sk[1].label === 'Clothing Repair' && sk[2].label === 'Repair', 'skills are read, empty ones skipped, sorted');
const ph = J.photosOf([{ m_Day: 58, m_RegionLocalizationKey: 'SCENENAME_MountainPass' }, { m_Day: 58, m_RegionLocalizationKey: 'SCENENAME_MountainPass' }, { m_Day: 60 }]);
ok(ph.total === 3 && ph.perDay[58] === 2 && ph.regions[0].label === 'Mountain Pass' && ph.regions[0].value === 2, 'photos are counted by day and region');
ok(J.photosOf(null).total === 0 && J.skillsOf(null, null).length === 0 && J.sleepOf(null).hours.length === 0, 'missing sections give empty results');
const sp = J.sleepOf({ m_LastTwentyFourHoursOfSleep: [0, 1, 1, 0] });
ok(sp.total === 2 && sp.hours.length === 4, 'sleep hours are counted');
ok(J.photosOf([{ m_PhotoID: 'photo1:3', m_Day: 5, m_RegionLocalizationKey: 'SCENENAME_Marsh', m_LocationLocalizationKey: 'SCENENAME_TheOutdoors' }]).items[0].key === '3', 'photo ids are split into file and key');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
