(() => {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  const STEAM = 'https://images.steamusercontent.com/ugc/';
  const IMG = {
    "mystery-lake":["15476628118068146896/964E7DB3A8CF5601A727E12FAC153C8DEB0884AC/","12181171108607855328/BB9FA07418F10BAE5DA9748A27FD9CB8E1C9AE02/"],
    "coastal-highway":["9516403236853107764/7C78444F11075F0CA7801155D89B604BEA222670/","9475295296023591018/8FA0642300D3597E7E2EB050545003226E35316F/"],
    "pleasant-valley":["16414322499884413794/9D7CE5B6F6446D85DC4F0AA87F5A9F2A8B5F6118/","15105071912622724818/4292D2F43FB1CEE290B565670DDD3FD6E44B35A2/"],
    "desolation-point":["18237935633100530290/B5C4D81301DDE097403A8E3D143D310D3AB903EF/","10255661230747189473/F7044BD6A2270874C98E66E2B6884F1126980670/"],
    "timberwolf-mountain":["18019470743317950368/FE3E7A2C5308EDFB4C43A5B8BB8230426A9D19A1/","16015738267194102941/276C79D3CAE76AA15CBC3C55021299B5A7A13956/"],
    "forlorn-muskeg":["15190933220557313885/B5B3BC2BABBF9E90336E0AF50BC7379E197410A9/","13120278709304539605/D8F929B355A896EBCA2F5EA01775F6B56A395D5E/"],
    "broken-railroad":["37819645136703055/8674195A3C3098E9878C83512BF03B9CF9488AA9/","37819645136703248/C355359C5487B23BF2BBD00EFE4CEA054573F085/"],
    "mountain-town":["17330490373698343471/CDCE98E29CE9BD56C91A8C7A290564ECD6757783/","16875759404303424817/0F18A56018496256E69826BF10AFA67B4B80F838/"],
    "hushed-river-valley":["11738172134438972729/9DB6EBD8279EB82FA9041ACF286CFF8F51C280D0/","11458033074726588907/497E67C51FD94E97E14086322E2DFDBC5E8BA64F/"],
    "bleak-inlet":["16557922079259863220/8B3A8FCEF85CE29E40EAE8B248CC0B5984B0C17D/","12029015630374169102/22B530B0AD9AD2BF7949BD79D0C1A12194309DBB/"],
    "ash-canyon":["12423718121825641694/1436C3EE25819AC99F2765E65FF87EB91FEE82C7/","11775972934425462577/06F5B6240C384475FA96DE6B3D656E9B51CB5D38/"],
    "blackrock":["13725529750150141786/377C02F990FA45DF8EBAC15FFFA435457554996A/","13819165643333898105/D35F9682041D607CC43CEF91ECBF28A57F5F2098/"],
    "port-remnant":["14808442892153759824/427D534021CF55E4F2FEB6061C568BA8E5ED42B4/","14216955206204295630/33EBD074037F3AC9FCA01CA2DB3C1DC532DB6F2F/"],
    "transfer-pass":["37819645136731165/2F143B1F4452AE9F9688686307AEAFE77D64CD0C/","37819645136731499/1A9515074C6E2DFE5960A3886C0534BB20265B41/"],
    "forsaken-airfield":["16913663260970933264/FB109BD04EA8ED996F248F237F7DDD07BB98CF4B/","10851226945735149924/44743CB450B469D5596D322623AAC3DF36CAAC04/"],
    "zone-of-contamination":["10376660445325975268/BCF107D90B0B9E2D6D301731D0DFC0975F8E7EDB/","10958718653805267230/55045BF44ACECE678A21417948002A17C0AC973A/"],
    "sundered-pass":["13234845787225905708/3CCD158148CAF4F6E5651269D63AA378F2C7B361/","16979676319684412643/EE2D7A9F25D9742C4F9256678705F0A0B8286A48/"],
    "ravine":["37819645136730001/C7DC749F7E776CAA177FC3B5A0E679D01CF8B63C/","37819645136730182/3961F5EF2C43A79B7F730CD52F7EE1B8554EB1C6/"],
    "winding-river-&-carter-hydro-dam":["37819645136732320/2F95CDD280AF1BD5D52072DD0B242519C099F433/","37819645136732699/CD74A44711B35D34DC967262E7E90ECAA227B999/"],
    "crumbling-highway":["37819645136723139/6CF8012DCBEE7E4C21BAA1373D076B13C8D2E545/"],
    "game-world-map":["2529416016869898493/0B8CEF42FE9254ECAD1361CD8AB2C4781763D7A9/"],
    "langston-mine":["2298590116010964948/CD7B37AC9443188805A8F319C7F6808109379138/"],
    "transition-cave":["2529416016912058547/B3B1BC18D40080358198B357C1F717A612BDC794/"],
    "keepers-pass":["15159145128947408591/484B84DD777B5E0742837BB86857EAA524315342/","16055965560201475697/BF5677731E7CEA8A282819D01C96AB5486A6E478/"],
    "far-range-branch-line":["12967305776514005370/390463FA1E9F539BCB876BF25E3065276D75DED2/","10893453294679762817/2CC6706F93D63DD60EF48511CB98A2B27EF149A9/"]
  };
  const EXITS = {
    "mystery-lake":[[1933,4230,150,150,["forlorn-muskeg"]],[667,4160,150,150,["mountain-town"]],[3823,1202,150,150,["winding-river-&-carter-hydro-dam"]],[3980,1427,150,150,["ravine"]]],
    "forlorn-muskeg":[[2974,1646,150,150,["mystery-lake"]],[176,2037,150,150,["broken-railroad"]],[701,923,150,150,["mountain-town"]],[2399,3329,150,150,["bleak-inlet"]]],
    "ravine":[[104,916,150,150,["mystery-lake"]],[1210,1120,150,150,["bleak-inlet"]],[2088,894,150,150,["coastal-highway"]]],
    "winding-river-&-carter-hydro-dam":[[1806,2987,150,150,["mystery-lake"]],[2699,1655,150,150,["mystery-lake"]],[3194,593,150,150,["pleasant-valley"]]],
    "pleasant-valley":[[1159,3798,150,150,["winding-river-&-carter-hydro-dam"]],[4307,3783,150,150,["coastal-highway"]],[3928,51,150,150,["timberwolf-mountain"]],[229,2105,150,150,["keepers-pass","blackrock"]]],
    "coastal-highway":[[321,271,150,150,["ravine"]],[2042,58,150,150,["pleasant-valley"]],[3175,2846,150,150,["crumbling-highway"]]],
    "crumbling-highway":[[125,895,150,150,["coastal-highway"]],[1617,722,150,150,["desolation-point"]]],
    "desolation-point":[[133,976,150,150,["crumbling-highway"]]],
    "bleak-inlet":[[2336,658,150,150,["ravine"]],[1601,793,150,150,["forlorn-muskeg"]]],
    "keepers-pass":[[995,1626,150,150,["pleasant-valley"]],[1562,364,150,150,["blackrock"]]],
    "blackrock":[[2935,2173,150,150,["timberwolf-mountain"]],[1326,3251,150,150,["keepers-pass","pleasant-valley"]]],
    "timberwolf-mountain":[[272,2539,150,150,["pleasant-valley"]],[2736,1891,150,150,["ash-canyon"]],[2561,645,150,150,["ash-canyon"]],[260,843,150,150,["blackrock"]]],
    "ash-canyon":[[2801,2971,150,150,["timberwolf-mountain"]],[1210,2942,150,150,["timberwolf-mountain"]]],
    "mountain-town":[[313,3319,150,150,["forlorn-muskeg"]],[2410,2272,150,150,["mystery-lake"]],[1636,202,150,150,["hushed-river-valley"]]],
    "hushed-river-valley":[[695,2557,150,150,["mountain-town"]]],
    "broken-railroad":[[2208,1341,150,150,["forlorn-muskeg"]],[130,1531,150,150,["far-range-branch-line"]]],
    "far-range-branch-line":[[2850,331,150,150,["broken-railroad"]],[156,728,150,150,["transfer-pass"]]],
    "transfer-pass":[[1500,1878,150,150,["far-range-branch-line"]],[815,1016,150,150,["forsaken-airfield"]],[1580,142,150,150,["zone-of-contamination"]],[568,139,150,150,["sundered-pass"]]],
    "zone-of-contamination":[[2871,2631,150,150,["transfer-pass"]],[1247,2797,150,150,["forsaken-airfield","sundered-pass"]]],
    "sundered-pass":[[1387,4244,150,150,["transfer-pass"]],[506,2898,150,150,["forsaken-airfield","zone-of-contamination"]]],
    "forsaken-airfield":[[3084,4186,150,150,["transfer-pass"]],[4463,2045,150,150,["sundered-pass","zone-of-contamination"]]]
  };

  const OV = 'overview';
  const OV_SIZE = [1540, 900];
  const OV_NODES = {
    "hushed-river-valley":[631,229],"mountain-town":[690,398],"mystery-lake":[855,483],"winding-river-&-carter-hydro-dam":[1029,533],
    "ravine":[1018,590],"forlorn-muskeg":[754,612],"broken-railroad":[586,586],"far-range-branch-line":[373,713],"transfer-pass":[300,612],
    "forsaken-airfield":[130,640],"zone-of-contamination":[379,556],"sundered-pass":[289,459],"bleak-inlet":[983,706],"coastal-highway":[1213,619],
    "crumbling-highway":[1273,806],"desolation-point":[1344,698],"pleasant-valley":[1146,375],"keepers-pass":[936,307],"blackrock":[1083,164],
    "timberwolf-mountain":[1241,255],"ash-canyon":[1406,203]
  };

  const OV_MAP = 'game-world-map';
  const OV_IMG_NODES = {
    "hushed-river-valley":[1584,397],"mountain-town":[1732,823],"mystery-lake":[2152,1034],"winding-river-&-carter-hydro-dam":[2586,1162],"ravine":[2561,1265],"forlorn-muskeg":[1893,1363],"broken-railroad":[1469,1298],"far-range-branch-line":[934,1619],"transfer-pass":[786,1323],"forsaken-airfield":[357,1408],"zone-of-contamination":[949,1220],"sundered-pass":[723,977],"bleak-inlet":[2470,1599],"coastal-highway":[3050,1383],"crumbling-highway":[3201,1853],"desolation-point":[3384,1579],"pleasant-valley":[2882,766],"keepers-pass":[2352,595],"blackrock":[2722,236],"timberwolf-mountain":[3121,462],"ash-canyon":[3535,331]
  };

  const PLACES = {"ash-canyon":[["Angler's Den",1646,1360],["Bitter Marsh",2575,2318],["Broad Falls",1334,1058],["Climber's Cave",1450,2118],["Fire Overlook",2633,1918],["Foreman's Retreat",1901,1069],["Gold Mine",492,428],["High Meadow",1942,1663],["Homesteader's Respite",2900,2141],["Long Falls",1130,561],["Miner's Folly",2154,843],["Mining Camp",693,601],["Narrow Falls Cave",2500,776],["Pillar's Footrest",1195,2707],["Runaway Bridge",1205,1570],["Shattered Cove",2044,2660],["Stone Shelf Cave",509,1393],["Wolf's Jaw Overlook",1124,1132]],"blackrock":[["Abandoned Mine",2755,225],["Bear's Bend",476,1924],["Blackrock Prison",247,208],["Blackrock Prison Buildings",2066,240],["Blocked Bridge",1515,3051],["Bricklayer's Retreat",3402,1995],["Cliff Cave",2780,1340],["Creek Bed Cave",254,2240],["Cutty's Cave",2722,2598],["Fool's Corner",2865,772],["Forager's Remnant",621,1148],["Foreman's Clearcut",2739,2116],["Grand Meadow",976,1210],["Jailer's Residence",1749,2773],["Last Prospect",2630,491],["Lineworker's Hideout",920,2766],["Mule Bridge (Broken)",2869,548],["No Road Cave",3138,778],["Old Substation",942,2494],["Power Plant",1408,1007],["Wedge Cave",3598,928],["Whistling Perch",3149,1171]],"bleak-inlet":[["Bunker Alpha",1948,1343],["Cannery Pier",1748,3176],["Cannery Worker Residences",2196,2799],["Coast Mountain Road",2452,1935],["Coastal Highway Terminus",617,2570],["Echo One Radio Tower",1880,2116],["Fallen Lighthouse",2252,3656],["Frozen Delta",1287,1875],["Hunter's Blind",1281,1051],["Last Resort Cannery",1304,2864],["Long Bridge",1865,2788],["Lower Raven Falls",3267,1390],["Pensive Lookout",2504,1717],["Radio Control Hut",1846,2279],["Raven Crossing",2786,2325],["Ravine's End Waterfall",1986,1087],["Secret Mountain Path",2126,2127],["Summit at Ravine's End",2299,836],["Washed Out Trailers",1035,2424],["Workshop",1505,3233]],"broken-railroad":[["Broken Bridge",403,1673],["Hunter's Blind",704,649],["Hunting Lodge",348,506],["Locomotive Engine",1184,1672],["Maintenance Shed",892,1320],["Maintenance Yard",556,1277],["Rickety Footbridge",1324,904]],"coastal-highway":[["Abandoned Lookout",2754,134],["Abandoned Mine",2230,570],["Bear Creek Campground",518,836],["Coastal House",1918,822],["Coastal Houses",3235,2201],["Commuter's Lament",3313,2874],["Fishing Cabins",1016,1037],["Fishing Camp",1218,1153],["Jackrabbit Island",1654,1651],["Log Sort",2185,886],["Misanthrope's Homestead",2900,1808],["Quonset Garage",3284,1476],["Rabbit Grove",294,668],["Silent Clearing",3727,1012],["The Tooth",1706,832],["Train Unloading",928,188],["Waterfront Cottages",3232,2440]],"crumbling-highway":[["Abandoned Harris Home",970,774],["Road Collapse",1550,1024],["The Arch",1169,1312]],"desolation-point":[["Abandoned Mine No.5",959,678],["Blocked Highway",235,1142],["Broken Bridge",1714,219],["Hibernia Processing",1522,812],["Katie's Secluded Corner",359,1324],["Little Island",1832,1545],["Lonely Lighthouse",1350,1587],["Matt's Truck",1379,1206],["Stone Church",1125,895],["The Riken",2126,1132],["Whale Processing",2048,692]],"far-range-branch-line":[["Foundered Track",1810,537],["Freighthopper's Rockfall",806,362],["Oddment Falls",1963,802],["Platelayer's Shortcut",1665,328],["Remnant Cave",1144,243],["Steely Chasm",1382,460],["Surfeit Trestle",2058,640]],"forlorn-muskeg":[["Abandoned Camp",612,1604],["Bunkhouses",1534,3334],["Hat Creek",1262,1486],["High Blind",2059,2850],["Low Blind",887,1832],["Marsh Ridge",728,1169],["Muskeg Overlook",2774,2626],["Old Spence Family Homestead",969,3285],["Poacher's Camp",2195,1926]],"forsaken-airfield":[["Archie's Crawlspace",3275,1201],["Brittle Cave",4294,336],["Bunker Omega",4302,3276],["Cargomaster's Trailer",2489,2862],["Control Tower",2389,2960],["Drift Island",3022,950],["Fallow Dugout",3928,1979],["Final Approach",1532,1955],["Frost Cave",2262,4204],["Grip's Cave",511,3242],["Hangar Basement",2768,3392],["Island Cottage",2723,687],["Junker's Paddock",720,4078],["Justy's Hovel",3840,3717],["Main Hangar",2768,3266],["Mindful Cabin",1220,703],["Shoulder Lake",3251,1632],["Spotter's Blind",3119,2934],["Stony Passage",487,3470],["Sudden Washout",194,1355],["Surveyor's Memory",1908,2612],["Whealy's Turn",1949,4124]],"hushed-river-valley":[["Banner Falls",2050,140],["Bunker Gamma",200,1887],["Cloudtop Falls",310,2472],["Hushed River",751,1308],["Lake Cave",2392,230],["Little Bear and Cub Falls",1780,1058],["Lonely Cave",729,2241],["Long Shot Falls",1510,1200],["Mammoth Falls",1459,272],["Many Falls Vista",1615,1722],["Monolith Lake",2255,554],["Moose Overlook",2104,1603],["Mysterious Signal Fire",1527,926],["Offset Falls",258,1418],["Peak Cave",2228,974],["Pensive Vista",2065,1093],["Quarrelling Falls",1808,262],["Reclusive Falls",847,1409],["Stair Steps Lake",661,1954],["Twin Sisters Falls",1560,1282],["Valley Cave",1810,1152],["Valley Viewpoint",1379,1453],["Watchful Falls",2388,392]],"keepers-pass":[["Builder's Bridge",1252,396],["Cave North & South Connector",847,942],["Forester's Hermitage",706,392],["Keeper's Pass North",343,354],["Keeper's Pass South",1422,1510],["Mirthless Fork",1158,1088]],"mountain-town":[["Convenience Store",1383,1695],["Crashed Plane",2784,1522],["Crashed Prison Transport Bus",1900,1995],["Falls Bridge",2564,800],["Graveyard",993,643],["Hermit's Cabin",324,2668],["Milton Basin",782,2855],["Milton Credit Union",1436,902],["Milton House",1540,1046],["Milton Park",1344,1953],["Old Schoolhouse",1194,1287],["Orca Gas Station",1667,1784],["Paradise Meadows Farm",380,1463],["Picnic Area",1116,2022],["Radio Tower",1832,1396],["Rocky Refuge",1064,2574],["Spruce Falls",2540,790],["St. Christopher's Church",605,445],["The Arch",1750,1520],["Town of Milton",1392,1357],["Wood Lot",1188,832]],"mystery-lake":[["Alan's Cave",3372,2396],["Camp Office",2721,3007],["Carter Hydro Dam",3982,1359],["Clearcut",1196,1652],["Dave's Quiet Clearing",2386,4088],["Deadfall Area",1496,3591],["Derailment",2593,2206],["Destroyed Lookout",1509,1814],["Forestry Lookout",2060,1853],["Frozen Creek",1482,2398],["Ice Fishing Huts",3252,3600],["Lake Cabins",3784,4036],["Lake Overlook",3098,3040],["Lake Trail",2559,3334],["Logging Camp",2180,1502],["Max's Last Stand",1238,4202],["Rail Tunnel",1942,4147],["Train Bridge",3452,1584],["Train Loading Area",3195,1649],["Trapper's Cabin",321,4160],["Trapper's Homestead",692,4106],["Unnamed Pond",926,2542],["Upper Dam",3914,998]],"pleasant-valley":[["Bunker Beta",340,1476],["Burned Ridge",2546,564],["Cascading Falls",1688,4060],["Community Hall",3745,3619],["Contemplation Bridge",2942,2910],["Derelict Cabins",4162,1985],["Draft Dodger's Cabin",2572,1322],["End of the Road",4546,2628],["Farmhouse Basement",1754,1909],["Forest Cave",2350,3432],["Heartbreak Bridge",1788,2465],["Hilltop Cave",890,3465],["Hunter's Blind",3362,323],["Lonely Homestead",3592,2067],["Long Curve",417,2214],["Lower Falls",1957,3146],["Misty Falls Picnic Area",4002,343],["Pensive Pond",1875,3641],["Picnic Spot",2429,3725],["Pleasant Valley Church",3563,3083],["Pleasant Valley Farmstead",1740,2194],["Pleasant Valley Outbuildings",2748,2290],["Point of Disagreement",3632,925],["Prepper's Abandoned Cache",3583,196],["Radio Control Hut",988,2606],["Ridge Cave",2566,574],["Rural Store",3490,3576],["Signal Hill",1159,2788],["Skeeter's Ridge",2817,841],["Thompson's Crossing",3458,3504],["Three Strikes Farmstead",1176,646],["Upper Falls",3646,3940]],"ravine":[["Raven Falls Trestle",1894,731],["Ravine Basin",978,1170]],"sundered-pass":[["Ambler's Lake",2686,1206],["Baneful Bridge",1660,3557],["Boltchopper's Haven",2062,1090],["Bunkhouse",1364,1329],["Cascading Gap",1592,2955],["Final Refuge",2565,633],["Giant's Thumbprint",1221,2077],["Idle Hideout",1532,1548],["Juniper Runoff",831,1772],["Last Lonely House",1228,3136],["Lotte's Rest",1673,3329],["Miserable Haunt",1122,3796],["Ogre's Teardrop",683,1421],["Perilous Crossing",763,1672],["Placid Notch",1694,2202],["Prayerful Window",2384,2102],["Reluctant Shortcut",1863,457],["Roamer's Cave",4002,1420],["Route One Waterfall",1440,2914],["Second Pillar",1192,1570],["Seedling Spring",1244,3709],["Unyielding Inundation",3003,654],["Weather Station",1140,1198]],"timberwolf-mountain":[["Andre's Peak",832,1622],["Chasm Cave",2014,1748],["Crystal Lake",1356,2308],["Deer Clearing",2614,526],["Echo Peak East",2278,1771],["Echo Peak West",2533,2062],["Echo Ravine",2347,1650],["Eric's Falls",540,331],["Landing Gear",620,2594],["Mountaineer's Hut",1198,2407],["Secluded Shelf",1992,979],["Tail Section",1450,1296],["Waterfall Cave",684,301]],"transfer-pass":[["Broad Aerie",1177,1159],["Conductor's Dropoff",1780,774],["Distempered Flatcars",1614,1573],["Feedwater Cave",1121,1283],["Immutable Hesitation",1562,262],["Loitering Marsh",1408,895],["Vacant Depot",1582,732]],"zone-of-contamination":[["Boss's Settlement",2882,1329],["Bountiful Overlook",1374,1270],["Concentrator",1208,1163],["Craggy Passage",677,2984],["Desperate Elevation",516,2441],["Dubious Overlook",2113,2779],["Flagman's Gap",2286,1637],["Forgotten Exploration",2068,420],["Harrowed Residence",2580,442],["Headframe Building & Conveyor Room",1660,757],["Idle Camp",2374,796],["Indolent Hoppers",1405,813],["Miner's Footpath",393,1859],["Old Corral",502,286],["Overladen Pond",1683,1346],["Pump House",1631,1254],["Scaffolder's Hideout",2929,1544],["Smoker's Cave",178,2088],["Turbulent Pasture",1544,380],["Unquenched Extraction",480,464],["Welkin's Window",2257,2926]]};
  const CAL = {"forsaken-airfield":["AirfieldRegion",1.5123,0,2355.7,2355.1],"transfer-pass":["HubRegion",1.5112,0,1294.6,1291.2],"far-range-branch-line":["LongRailTransitionZone",0,-1.5096,2048.8,534.5],"blackrock":["BlackrockRegion",1.512,0,1935.2,1779.5],"winding-river-&-carter-hydro-dam":["DamRiverTransitionZoneB",2.352,0,1438.2,2238.9],"zone-of-contamination":["MiningRegion",1.5138,0,1596.5,1293.3],"coastal-highway":["CoastalRegion",1.525671,-0.000115,-35.629,-10.658],"mystery-lake":["LakeRegion",2.001014,0.000483,-202.065,9.363],"desolation-point":["WhalingStationRegion",2.04506,-0.023775,-640.936,-844.067],"pleasant-valley":["RuralRegion",-0.000101,2.205824,5084.89,-34.711],"timberwolf-mountain":["CrashMountainRegion",1.489694,-0.000164,-31.694,5.542],"forlorn-muskeg":["MarshRegion",1.60971,6e-06,164.819,-147.713],"ravine":["RavineTransitionZone",1.527864,7.1e-05,-36.783,-13.872],"crumbling-highway":["HighwayTransitionZone",2.035716,-0.024537,1272.901,-870.7],"broken-railroad":["TracksRegion",0.000258,1.490359,2529.726,24.201],"hushed-river-valley":["RiverValleyRegion",1.62411,-0.000534,-94.991,-15.309],"mountain-town":["MountainTownRegion",1.623098,7.8e-05,-299.613,5.223],"bleak-inlet":["CanneryRegion",1.519626,5.1e-05,-63.343,86.234],"ash-canyon":["AshCanyonRegion",1.56254,-0.000162,-116.815,-90.748]};

  const NAME = {
    'overview': 'Island overview', 'game-world-map': 'Game world map', 'langston-mine': 'Langston Mine', 'transition-cave': 'Transition Cave',
    'ash-canyon': 'Ash Canyon', 'blackrock': 'Blackrock', 'bleak-inlet': 'Bleak Inlet', 'broken-railroad': 'Broken Railroad', 'coastal-highway': 'Coastal Highway',
    'crumbling-highway': 'Crumbling Highway', 'desolation-point': 'Desolation Point', 'forlorn-muskeg': 'Forlorn Muskeg', 'hushed-river-valley': 'Hushed River Valley',
    'keepers-pass': "Keeper's Pass", 'mountain-town': 'Mountain Town', 'mystery-lake': 'Mystery Lake', 'pleasant-valley': 'Pleasant Valley', 'ravine': 'The Ravine',
    'timberwolf-mountain': 'Timberwolf Mountain', 'winding-river-&-carter-hydro-dam': 'Winding River',
    'far-range-branch-line': 'Far Range Branch Line', 'forsaken-airfield': 'Forsaken Airfield', 'sundered-pass': 'Sundered Pass',
    'transfer-pass': 'Transfer Pass', 'zone-of-contamination': 'Zone of Contamination',
    'port-remnant': 'Port Remnant',
  };
  const nameOf = (id) => NAME[id] || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const GROUPS = [
    { title: 'Island', items: ['overview'] },
    { title: 'Wintermute', items: ['ash-canyon', 'blackrock', 'bleak-inlet', 'broken-railroad', 'coastal-highway', 'crumbling-highway', 'desolation-point', 'forlorn-muskeg', 'hushed-river-valley', 'keepers-pass', 'mountain-town', 'mystery-lake', 'pleasant-valley', 'ravine', 'timberwolf-mountain', 'winding-river-&-carter-hydro-dam'] },
    { title: 'Tales from the Far Territory', items: ['far-range-branch-line', 'forsaken-airfield', 'langston-mine', 'sundered-pass', 'transfer-pass', 'transition-cave', 'zone-of-contamination'] },
    { title: 'Iron Road', items: ['port-remnant'] },
  ];
  const KRUEGER = new Set(['game-world-map', 'langston-mine', 'transition-cave']);
  const DEFAULT_ID = 'mystery-lake';
  const LAST_KEY = 'whiteout-map-last';
  const COLORS = [['ember', 'Orange'], ['frost', 'Blue'], ['green', 'Green'], ['rose', 'Red'], ['violet', 'Violet']];

  const body = document.body, view = $('#mapView'), nav = $('#mapNav'), scrim = $('#mapScrim'), frame = $('#mapFrame'), layer = $('#mapLayer'), stage = view.querySelector('.mapstage');
  const navBtn = $('#mapNavBtn'), searchIn = $('#mapSearch'), list = $('#mapList'), exitsBox = $('#mapExits'), stateBox = $('#mapState'), cardBox = $('#mapCard'), noteBox = $('#mapNote');
  const pinBtn = $('#mapPinBtn'), teleBtn = $('#mapTeleBtn');
  const modeBtns = Array.from(document.querySelectorAll('.mode'));
  const seg = view.querySelector('.seg');
  const narrow = matchMedia('(max-width: 52rem)');
  const saved = (() => { try { return localStorage.getItem('whiteout-map-diff'); } catch (e) { return null; } })();
  const S = { id: null, diff: saved === 'i' ? 'i' : 'p', focus: null };
  let fresh = true;
  let mode = 'edit', built = false, navOpen = false, pz = null, zoomCtl = null, token = 0;
  let pins = [], tool = null, target = null, findEl = null, findTimer = 0;
  const warmed = new Set();

  async function api(action, body) {
    try { return await tldStore.call(action, body); }
    catch (e) { throw Object.assign(new Error(e.code || 'store'), { code: e.code || 'store', max: e.max }); }
  }
  const errText = (e) => e.code === 'full' ? 'You already have the maximum number of pins (' + (e.max || 300) + '). Delete some first.' : 'Could not save (' + (e.code || 'unknown') + ').';

  function sources(id) {
    const u = IMG[id];
    return u ? u.map((p) => ({ url: STEAM + p })) : null;
  }
  const known = (id) => id === OV || !!sources(id);
  const entryFor = (id, diff) => { const s = sources(id); return s ? s[diff === 'i' && s[1] ? 1 : 0] : null; };
  const hasVariants = (id) => { const s = sources(id); return !!s && s.length > 1; };
  const slug = (id) => '#map/' + id;
  let settingsReady = false;
  if (window.tld && tld.ready) tld.ready.then(() => { settingsReady = true; }, () => { settingsReady = true; });
  const allowed = () => !!(window.tld && tld.settings().mapSteam === true);
  function warm(id) {
    if (!allowed()) return;
    const e = entryFor(id, S.diff), u = e && e.url;
    if (!u || warmed.has(u)) return;
    warmed.add(u);
    new Image().src = u;
  }
  const norm = (s) => String(s).toLowerCase().replace(/[’'.]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const PLACE_LIST = [];
  for (const [map, rows] of Object.entries(PLACES)) for (const [label, x, y] of rows) PLACE_LIST.push({ label, map, x, y, n: norm(label) });

  const slotOpen = () => typeof state !== 'undefined' && !!state.outer;
  const SCENES = { AirfieldRegion: 'forsaken-airfield', BlackrockRegion: 'blackrock', BlackrockTransitionZone: 'keepers-pass', LongRailTransitionZone: 'far-range-branch-line', DamRiverTransitionZone: 'winding-river-&-carter-hydro-dam', DamRiverTransitionZoneB: 'winding-river-&-carter-hydro-dam', DamTransitionZone: 'winding-river-&-carter-hydro-dam', HubRegion: 'transfer-pass', MountainPassRegion: 'sundered-pass', MiningRegion: 'zone-of-contamination' };
  const regionIdOf = (key) => Object.keys(CAL).find((k) => CAL[k][0] === key) || SCENES[key] || null;
  function playerMap() {
    if (!slotOpen()) return null;
    let here = null;
    try { here = hereInfo(); } catch (e) { return null; }
    return here && here.region ? regionIdOf(here.region) : null;
  }
  function lastViewed() {
    try { const v = localStorage.getItem(LAST_KEY); return v && known(v) ? v : null; } catch (e) { return null; }
  }
  const startId = () => playerMap() || lastViewed() || DEFAULT_ID;
  const opening = () => (fresh || !S.id ? startId() : S.id);
  function calOf(id) {
    const c = CAL[id];
    const r = c && typeof DATA !== 'undefined' ? DATA.regions[c[0]] : null;
    return r ? { key: c[0], a: c[1], b: c[2], tx: c[3], ty: c[4], r } : null;
  }
  const toMap = (c, x, z) => { const ex = x * c.r.p + c.r.ox, ey = c.r.oy - z * c.r.p; return [c.a * ex - c.b * ey + c.tx, c.b * ex + c.a * ey + c.ty]; };
  function fromMap(c, sx, sy) {
    const dx = sx - c.tx, dy = sy - c.ty, d = c.a * c.a + c.b * c.b;
    const ex = (c.a * dx + c.b * dy) / d, ey = (-c.b * dx + c.a * dy) / d;
    return [(ex - c.r.ox) / c.r.p, (c.r.oy - ey) / c.r.p];
  }

  function say(kind) {
    if (!kind) { stateBox.hidden = true; stateBox.replaceChildren(); return; }
    stateBox.hidden = false;
    if (kind === 'loading') stateBox.replaceChildren(h('div', {}, h('div', { class: 'spin', 'aria-hidden': 'true' }), h('p', {}, 'Loading: ' + nameOf(S.id))));
    else if (kind === 'ask') stateBox.replaceChildren(h('div', { class: 'mapask' },
      h('p', {}, h('strong', {}, 'Load the maps from Steam?')),
      h('p', { class: 'muted small' }, 'The map images are made by the community and stored on Steam. Loading them sends your IP address to Steam, the same as visiting any website. Nothing else is shared, and the rest of Whiteout works without the maps.'),
      h('div', { class: 'cta' }, h('button', { type: 'button', class: 'primary', onclick: allowSteam }, 'Load maps'),
        h('button', { type: 'button', onclick: () => $('#mapInfoDlg').showModal() }, 'About the maps')),
      h('p', { class: 'muted small' }, 'Whiteout remembers your choice. You can change it in Settings.')));
    else stateBox.replaceChildren(h('div', {},
      h('p', {}, h('strong', {}, 'The map could not be loaded.')),
      h('p', { class: 'muted small' }, 'Check your connection and try again. If the problem persists, Steam may have changed the image address.'),
      h('div', { class: 'cta' }, h('button', { type: 'button', class: 'primary', onclick: () => load() }, 'Try again'),
        h('button', { type: 'button', onclick: () => $('#mapInfoDlg').showModal() }, 'Sources'))));
  }

  function spots(id) {
    const frag = document.createDocumentFragment();
    (EXITS[id] || []).forEach(([x, y, w, hh, to]) => {
      const names = to.map(nameOf);
      frag.append(h('button', { type: 'button', class: 'spot spot-exit', 'data-to': to.join(' '), style: 'left:' + (x + w / 2) + 'px;top:' + (y + hh / 2) + 'px',
        'aria-label': 'Go to: ' + names.join(' or ') }, h('span', { class: 'spot-ring' }), h('span', { class: 'spot-label' }, names.join(' / '))));
    });
    layer.append(frag);
  }
  const mark = (to, on) => layer.querySelectorAll('.spot-exit').forEach((b) => { if (!to || b.dataset.to.split(' ').includes(to)) b.classList.toggle('on', on); });

  const menu = h('div', { class: 'menu', popover: 'auto', role: 'menu', 'aria-label': 'Choose destination' });
  stage.append(menu);
  function openMenu(anchor, ids) {
    menu.replaceChildren(...ids.map((t) => h('button', { type: 'button', role: 'menuitem', onclick: () => { menu.hidePopover(); go(t); } }, nameOf(t))));
    const r = anchor.querySelector('.spot-ring').getBoundingClientRect();
    menu.style.left = clamp(r.right + 8, 8, innerWidth - 260) + 'px';
    menu.style.top = clamp(r.top, 8, innerHeight - 40 * ids.length - 24) + 'px';
    menu.showPopover();
    menu.querySelector('button').focus();
  }
  menu.addEventListener('keydown', (e) => {
    const items = Array.from(menu.querySelectorAll('button'));
    const i = items.indexOf(document.activeElement);
    const n = e.key === 'ArrowDown' ? (i + 1) % items.length : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length : -1;
    if (n >= 0) { e.preventDefault(); items[n].focus(); }
  });

  layer.addEventListener('click', (e) => {
    const b = e.target.closest('.spot');
    if (!b) return;
    if (b.dataset.pin) { const p = pins.find((q) => q.id === b.dataset.pin); if (p) openPin(p); return; }
    if (!b.dataset.to) return;
    const to = b.dataset.to.split(' ');
    if (to.length === 1) go(to[0]); else openMenu(b, to);
  });
  const warmFrom = (e) => { const b = e.target.closest('.spot'); if (b && b.dataset.to) b.dataset.to.split(' ').forEach(warm); };
  layer.addEventListener('pointerover', warmFrom);
  layer.addEventListener('focusin', warmFrom);

  function renderPins() {
    layer.querySelectorAll('.spot-pin').forEach((e) => e.remove());
    for (const p of pins) {
      if (p.map !== S.id) continue;
      layer.append(h('button', { type: 'button', class: 'spot spot-pin c-' + p.color, 'data-pin': p.id, style: 'left:' + p.x + 'px;top:' + p.y + 'px', 'aria-label': 'Pin: ' + p.name },
        h('span', { class: 'spot-dot' }), h('span', { class: 'spot-label' }, p.name)));
    }
  }
  const pinDlg = $('#pinDlg'), pinForm = $('#pinForm'), pinName = $('#pinName'), pinNote = $('#pinNote'), pinStatus = $('#pinStatus'), pinSwatches = $('#pinSwatches');
  const pinDel = $('#pinDel'), pinTele = $('#pinTele'), pinSave = $('#pinSave');
  let draft = null, delArmed = false;
  pinSwatches.replaceChildren(...COLORS.map(([id, label]) => h('button', { type: 'button', class: 'swatch c-' + id, 'data-color': id, title: label, 'aria-label': label, 'aria-pressed': 'false' })));
  const setColor = (c) => { draft.color = c; pinSwatches.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === c))); };
  pinSwatches.addEventListener('click', (e) => { const b = e.target.closest('.swatch'); if (b) setColor(b.dataset.color); });
  const pinSay = (t, err) => { pinStatus.textContent = t || ''; pinStatus.classList.toggle('err', !!err); };
  function openPin(p) {
    const old = !!p.id;
    draft = { id: p.id || '', map: p.map, x: p.x, y: p.y, color: p.color || 'ember' };
    $('#pinTitle').textContent = old ? 'Edit pin' : 'New pin';
    pinName.value = p.name || '';
    pinNote.value = p.note || '';
    setColor(draft.color);
    pinSay('');
    delArmed = false; pinDel.textContent = 'Delete';
    pinDel.hidden = !old;
    const c = calOf(p.map);
    pinTele.hidden = !(slotOpen() && c);
    let where = nameOf(p.map);
    if (c) { const [gx, gz] = fromMap(c, p.x, p.y); where += ' · x ' + gx.toFixed(0) + ', z ' + gz.toFixed(0); }
    $('#pinWhere').textContent = where;
    pinDlg.showModal();
    pinName.focus();
    if (!old) pinName.select();
  }
  pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pinSave.disabled = true; pinSay('Saving…');
    try {
      const d = await api('pin_save', { ...draft, name: pinName.value, note: pinNote.value });
      pins = d.pins;
      renderPins(); renderNav();
      pinDlg.close();
      if (tool === 'pin') setTool(null);
    } catch (err) { pinSay(errText(err), true); }
    finally { pinSave.disabled = false; }
  });
  pinDel.addEventListener('click', async () => {
    if (!delArmed) { delArmed = true; pinDel.textContent = 'Confirm delete'; setTimeout(() => { delArmed = false; pinDel.textContent = 'Delete'; }, 4000); return; }
    pinDel.disabled = true;
    try { pins = (await api('pin_del', { id: draft.id })).pins; renderPins(); renderNav(); pinDlg.close(); }
    catch (err) { pinSay(errText(err), true); }
    finally { pinDel.disabled = false; }
  });
  pinTele.addEventListener('click', () => { const c = calOf(draft.map); if (!c) return; pinDlg.close(); setTool('tele', true); setTarget(draft.x, draft.y); });
  async function loadPins() { try { pins = (await api('pins')).pins || []; renderPins(); renderNav(); } catch (e) { } }

  const youAgo = () => {
    const t = typeof window.tldSaveTime === 'function' ? window.tldSaveTime() : null;
    if (!t) return 'Last known position';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'You were here just now';
    if (m < 60) return 'You were here ' + m + ' min ago';
    if (m < 1440) return 'You were here ' + Math.round(m / 60) + ' h ago';
    return 'You were here ' + Math.round(m / 1440) + ' d ago';
  };
  const youText = (here) => here.interior ? 'Last outdoor position' : youAgo();
  setInterval(() => { layer.querySelectorAll('.spot-you strong').forEach((e) => { if (e.dataset.live) e.textContent = youAgo(); }); }, 20000);
  function renderYou() {
    layer.querySelectorAll('.spot-you').forEach((e) => e.remove());
    const c = calOf(S.id);
    if (!slotOpen() || !c) return;
    let here = null;
    try { here = hereInfo(); } catch (e) { return; }
    if (!here || here.region !== c.key) return;
    const [sx, sy] = toMap(c, here.pos[0], here.pos[2]);
    layer.append(h('div', { class: 'spot-you', style: 'left:' + sx + 'px;top:' + sy + 'px' }, h('span', { class: 'spot-dot' }), h('span', { class: 'spot-label' }, youText(here))));
  }
  function renderTarget() {
    layer.querySelectorAll('.spot-target').forEach((e) => e.remove());
    if (!target || target.map !== S.id) return;
    layer.append(h('div', { class: 'spot-target', style: 'left:' + target.sx + 'px;top:' + target.sy + 'px' }, h('span', { class: 'spot-ring' })));
  }
  function heightFor(c, x, z) {
    let est = null;
    try { est = estimateHeight(c.key, x, z); } catch (e) { est = null; }
    if (est) return { y: est.y + 1.5, est: true, far: est.nearest > 120 };
    let y = 0;
    try { y = hereInfo().pos[1]; } catch (e) { }
    return { y, est: false, far: false };
  }
  function setTarget(sx, sy) {
    const c = calOf(S.id);
    if (!c) return;
    const [x, z] = fromMap(c, sx, sy);
    target = { map: S.id, sx, sy, x, z };
    renderTarget(); renderCard();
  }
  function teleport() {
    const c = calOf(target.map);
    if (!c) return;
    const hgt = heightFor(c, target.x, target.z);
    applyTeleport(c.key, target.x, hgt.y, target.z);
    const done = nameOf(target.map) + ', x ' + target.x.toFixed(0) + ', z ' + target.z.toFixed(0);
    target = null; tool = null;
    syncTools(); renderTarget(); renderYou();
    cardBox.hidden = false; exitsBox.hidden = true;
    cardBox.replaceChildren(h('p', { class: 'cardtext' }, h('strong', {}, 'Teleport set: '), done + '. Save your changes in the editor and load the game.'),
      h('div', { class: 'cardbtns' }, h('button', { type: 'button', class: 'primary', onclick: () => { cardBox.hidden = true; renderExits(); window.tldMode.set('edit'); } }, 'Go to save'),
        h('button', { type: 'button', onclick: () => { cardBox.hidden = true; renderExits(); } }, 'Close')));
  }
  function renderCard() {
    cardBox.replaceChildren();
    cardBox.hidden = !tool;
    if (!tool) { renderExits(); return; }
    exitsBox.hidden = true;
    if (tool === 'pin') {
      cardBox.append(h('p', { class: 'cardtext' }, 'Click the map to add a pin.'), h('div', { class: 'cardbtns' }, h('button', { type: 'button', onclick: () => setTool(null) }, 'Done')));
    } else if (!target) {
      cardBox.append(h('p', { class: 'cardtext' }, 'Click the map to choose the teleport destination.'), h('div', { class: 'cardbtns' }, h('button', { type: 'button', onclick: () => setTool(null) }, 'Cancel')));
    } else {
      const c = calOf(target.map), hgt = heightFor(c, target.x, target.z);
      const note = !hgt.est ? 'There is no terrain data for this spot, so the height stays the same. If you fall, adjust the height on the Teleport tab.'
        : hgt.far ? 'The nearest known point is far away, so the height may be wrong.' : '';
      cardBox.append(h('p', { class: 'cardtext' }, h('strong', {}, 'Teleport: '), nameOf(target.map) + ' · x ' + target.x.toFixed(0) + ', z ' + target.z.toFixed(0) + ' · height ' + hgt.y.toFixed(0) + ' m', note ? h('span', { class: 'cardnote' }, note) : null),
        h('div', { class: 'cardbtns' }, h('button', { type: 'button', class: 'primary', onclick: teleport }, 'Teleport here'), h('button', { type: 'button', onclick: () => setTool(null) }, 'Cancel')));
    }
  }
  function setTool(t, force) {
    tool = !force && tool === t ? null : t;
    if (tool !== 'tele') { target = null; renderTarget(); }
    syncTools(); renderCard();
  }
  function syncTools() {
    const ov = S.id === OV;
    const canTele = slotOpen() && !ov && !!calOf(S.id);
    pinBtn.hidden = ov;
    if (ov && tool === 'pin') tool = null;
    teleBtn.hidden = !canTele;
    if (tool === 'tele' && !canTele) { tool = null; target = null; renderTarget(); }
    pinBtn.setAttribute('aria-pressed', String(tool === 'pin'));
    teleBtn.setAttribute('aria-pressed', String(tool === 'tele'));
    frame.classList.toggle('tool', !!tool);
  }
  pinBtn.addEventListener('click', () => setTool('pin'));
  teleBtn.addEventListener('click', () => setTool('tele'));
  function onTap(x, y, e) {
    if (S.id === OV) return;
    if (e && e.target.closest && e.target.closest('.spot')) return;
    clearFind();
    if (tool === 'pin') openPin({ map: S.id, x, y });
    else if (tool === 'tele') setTarget(x, y);
  }
  view.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tool && !document.querySelector('dialog[open]')) { e.stopPropagation(); setTool(null); } });

  function renderExits() {
    exitsBox.replaceChildren();
    if (tool) { exitsBox.hidden = true; return; }
    const targets = Array.from(new Set((EXITS[S.id] || []).flatMap((e) => e[4])));
    exitsBox.hidden = !targets.length;
    if (!targets.length) return;
    const chips = h('div', { class: 'chips' }, targets.map((t) => {
      const c = h('button', { type: 'button', class: 'chip', onclick: () => go(t) }, nameOf(t));
      const on = () => { mark(t, true); warm(t); }, off = () => mark(t, false);
      c.addEventListener('pointerenter', on); c.addEventListener('focus', on); c.addEventListener('pointerleave', off); c.addEventListener('blur', off);
      return c;
    }));
    exitsBox.append(h('span', { class: 'lbl' }, 'Connections'), chips);
  }

  function allGroups() {
    const used = new Set(GROUPS.flatMap((g) => g.items));
    const ids = new Set(Object.keys(IMG));
    const extra = Array.from(ids).filter((id) => !used.has(id) && id !== OV_MAP).sort();
    return extra.length ? GROUPS.concat([{ title: 'Other', items: extra }]) : GROUPS;
  }
  function item(attrs, label, sub) {
    return h('button', { type: 'button', class: 'mapnav-item', ...attrs.a }, label, sub ? h('small', {}, sub) : null);
  }
  function renderNav() {
    const q = norm(searchIn.value.trim());
    list.replaceChildren();
    let shown = 0;
    for (const g of allGroups()) {
      const rows = [];
      for (const id of g.items) if (known(id) && (!q || norm(nameOf(id)).includes(q))) rows.push(id);
      if (!rows.length) continue;
      shown += rows.length;
      list.append(h('div', { class: 'mapnav-group' }, g.title));
      for (const id of rows) list.append(item({ a: { 'data-go': id, 'data-region': '', 'aria-current': id === S.id ? 'page' : null } }, nameOf(id)));
    }
    if (q.length >= 2) {
      const hits = PLACE_LIST.filter((p) => p.n.includes(q)).slice(0, 40);
      if (hits.length) {
        shown += hits.length;
        list.append(h('div', { class: 'mapnav-group' }, 'Places'));
        for (const p of hits) list.append(item({ a: { 'data-go': p.map, 'data-x': p.x, 'data-y': p.y, 'data-label': p.label } }, p.label, nameOf(p.map)));
      }
    }
    const mine = pins.filter((p) => !q || norm(p.name).includes(q) || norm(p.note || '').includes(q));
    if (mine.length) {
      shown += mine.length;
      list.append(h('div', { class: 'mapnav-group' }, 'Pins'));
      for (const p of mine) list.append(item({ a: { class: 'mapnav-item pinitem c-' + p.color, 'data-go': p.map, 'data-x': p.x, 'data-y': p.y, 'data-label': p.name } }, p.name, nameOf(p.map)));
    }
    if (!shown) list.append(h('p', { class: 'mapnav-empty' }, 'No matches.'));
  }
  function markNav() {
    let cur = null;
    list.querySelectorAll('[data-region]').forEach((b) => {
      const on = b.dataset.go === S.id;
      if (on) { b.setAttribute('aria-current', 'page'); cur = b; } else b.removeAttribute('aria-current');
    });
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    go(b.dataset.go, b.dataset.x !== undefined ? { x: +b.dataset.x, y: +b.dataset.y, label: b.dataset.label } : null);
    if (narrow.matches) setNav(false, true);
  });
  list.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-go]'); if (b) warm(b.dataset.go); });
  searchIn.addEventListener('input', renderNav);

  function setNav(open, restoreFocus) {
    if (narrow.matches) navOpen = open;
    else view.classList.toggle('nav-collapsed', !open);
    syncNav();
    if (open && narrow.matches) searchIn.focus(); else if (restoreFocus) navBtn.focus();
  }
  function syncNav() {
    const n = narrow.matches;
    const open = n ? navOpen : !view.classList.contains('nav-collapsed');
    view.classList.toggle('nav-open', n && navOpen);
    scrim.hidden = !(n && navOpen);
    nav.inert = !open;
    navBtn.setAttribute('aria-expanded', String(open));
  }
  navBtn.addEventListener('click', () => setNav(narrow.matches ? !navOpen : view.classList.contains('nav-collapsed')));
  $('#mapNavClose').addEventListener('click', () => setNav(false, true));
  scrim.addEventListener('click', () => setNav(false, true));
  view.addEventListener('keydown', (e) => { if (e.key === 'Escape' && narrow.matches && navOpen) { e.stopPropagation(); setNav(false, true); } });
  narrow.addEventListener('change', () => { navOpen = false; syncNav(); });

  function syncSeg() {
    seg.hidden = !hasVariants(S.id);
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.diff === S.diff)));
  }
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-diff]');
    if (!b || b.disabled || b.dataset.diff === S.diff) return;
    S.diff = b.dataset.diff;
    try { localStorage.setItem('whiteout-map-diff', S.diff); } catch (err) { }
    syncSeg();
    swapImage();
  });

  function clearFind() { clearTimeout(findTimer); if (findEl) { findEl.remove(); findEl = null; } }
  function applyFocus() {
    const f = S.focus;
    S.focus = null;
    if (!f || !pz) return;
    clearFind();
    findEl = h('div', { class: 'spot-find', style: 'left:' + f.x + 'px;top:' + f.y + 'px' }, h('span', { class: 'spot-ring' }), f.label ? h('span', { class: 'spot-label' }, f.label) : null);
    layer.append(findEl);
    pz.centerOn(f.x, f.y, Math.max(pz.fitScale * 3, 0.4), true);
    findTimer = setTimeout(clearFind, 8000);
  }

  function place(img) {
    const w = img.naturalWidth, hh = img.naturalHeight;
    img.width = w; img.height = hh;
    layer.style.width = w + 'px'; layer.style.height = hh + 'px';
    return [w, hh];
  }
  function renderOverview() {
    const my = ++token;
    say(null);
    const NS = 'http://www.w3.org/2000/svg';
    const far = new Set((GROUPS.find((g) => g.title.startsWith('Tales')) || { items: [] }).items);
    let key = null;
    if (slotOpen()) { try { const here = hereInfo(); key = here && here.region; } catch (e) { key = null; } }
    const here = key ? regionIdOf(key) : null;
    const draw = (img) => {
      if (my !== token) return;
      const [w, hh] = img ? [img.naturalWidth, img.naturalHeight] : OV_SIZE;
      const pos = img ? OV_IMG_NODES : OV_NODES;
      const parts = [];
      if (img) {
        img.width = w; img.height = hh;
        parts.push(img);
      } else {
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'ovlines');
        svg.setAttribute('width', w);
        svg.setAttribute('height', hh);
        svg.setAttribute('aria-hidden', 'true');
        const seen = new Set();
        for (const [id, [x1, y1]] of Object.entries(pos)) {
          for (const to of new Set((EXITS[id] || []).flatMap((e) => e[4]))) {
            const b = pos[to], k = [id, to].sort().join('|');
            if (!b || seen.has(k)) continue;
            seen.add(k);
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', b[0]); line.setAttribute('y2', b[1]);
            svg.append(line);
          }
        }
        parts.push(svg);
      }
      for (const [id, [x, y]] of Object.entries(pos)) {
        const count = pins.filter((p) => p.map === id).length;
        parts.push(h('button', { type: 'button', class: 'spot ovnode' + (far.has(id) ? ' far' : '') + (id === here ? ' here' : ''), style: 'left:' + x + 'px;top:' + y + 'px',
          'aria-label': 'Open map: ' + nameOf(id) + (id === here ? ' (last known position)' : ''), onclick: () => go(id) },
          h('span', { class: 'ovname' }, nameOf(id)),
          id === here ? h('span', { class: 'ovyou' }, 'You') : null,
          count ? h('small', {}, count + (count === 1 ? ' pin' : ' pins')) : null));
      }
      if (!img) {
        parts.push(h('div', { class: 'ovkey' },
          h('strong', {}, 'Island overview'),
          h('span', {}, h('i', { class: 'sw' }), 'Wintermute'),
          h('span', {}, h('i', { class: 'sw far' }), 'Far Territory'),
          h('small', {}, 'Schematic layout. Open a region to see its map, or allow Steam maps to see the full island map here.')));
      }
      layer.classList.toggle('ovbig', !!img);
      layer.replaceChildren(...parts);
      layer.style.width = w + 'px'; layer.style.height = hh + 'px';
      if (!pz) {
        pz = PanZoom(frame, layer, { w, h: hh }, { pad: 24, onTap });
        zoomCtl = PanZoom.controls(pz);
        stage.append(zoomCtl);
      } else pz.setSize(w, hh);
      layer.style.visibility = '';
      layer.classList.remove('reveal');
      say(null);
      if (window.tldAfterLoad) window.tldAfterLoad();
    };
    if (allowed()) {
      layer.style.visibility = 'hidden';
      say('loading');
      fetchImage(OV_MAP, S.diff).then(draw, () => draw(null));
    } else draw(null);
  }
  const decoded = (img) => Promise.race([(img.decode ? img.decode() : Promise.resolve()).catch(() => { }), new Promise((r) => setTimeout(r, 1500))]);
  function fetchImage(id, diff) {
    const e = entryFor(id, diff);
    const urls = e ? [e.url] : [];
    return new Promise((resolve, reject) => {
      const attempt = (i) => {
        if (i >= urls.length) { reject(new Error('no source')); return; }
        const img = new Image();
        img.alt = nameOf(id) + ', map';
        img.decoding = 'async';
        img.draggable = false;
        img.onload = () => decoded(img).then(() => resolve(img));
        img.onerror = () => attempt(i + 1);
        img.src = urls[i];
      };
      attempt(0);
    });
  }
  async function allowSteam() {
    try { await tld.saveSettings({ mapSteam: true }); } catch (e) { toast('Could not save the setting.', 'err'); return; }
    load();
  }
  function load() {
    if (S.id === OV) { renderOverview(); return; }
    const my = ++token, id = S.id;
    layer.style.visibility = 'hidden';
    if (!allowed()) {
      layer.replaceChildren();
      if (settingsReady) { say('ask'); return; }
      say('loading');
      tld.ready.then(() => { if (my === token) load(); });
      return;
    }
    say('loading');
    fetchImage(id, S.diff).then((img) => {
      if (my !== token) return;
      layer.replaceChildren(img);
      const [w, hh] = place(img);
      spots(id); renderPins(); renderYou(); renderTarget();
      if (!pz) {
        pz = PanZoom(frame, layer, { w, h: hh }, { pad: 24, onTap });
        zoomCtl = PanZoom.controls(pz);
        stage.append(zoomCtl);
      } else pz.setSize(w, hh);
      layer.style.visibility = '';
      say(null);
      layer.classList.remove('reveal');
      applyFocus();
      if (window.tldAfterLoad) window.tldAfterLoad();
    }, () => { if (my === token) { layer.style.visibility = 'hidden'; say('error'); } });
  }
  function swapImage() {
    const old = layer.querySelector('img'), id = S.id, my = ++token;
    if (!old || !known(id) || !allowed()) { load(); return; }
    say('loading');
    fetchImage(id, S.diff).then((next) => {
      if (my !== token) return;
      if (next.naturalWidth !== old.naturalWidth || next.naturalHeight !== old.naturalHeight) { token--; load(); return; }
      old.replaceWith(next);
      place(next);
      say(null);
    }, () => { if (my === token) say('error'); });
  }

  function show(id) {
    if (id === OV_MAP) id = OV;
    if (!known(id)) id = startId();
    S.id = id;
    fresh = false;
    layer.classList.toggle('ov', id === OV);
    if (id !== OV) layer.classList.remove('ovbig');
    if (id !== OV) { try { localStorage.setItem(LAST_KEY, id); } catch (e) { } }
    clearFind();
    noteBox.hidden = true;
    $('#mapTitle').textContent = nameOf(id);
    $('#mapCredit').hidden = !(KRUEGER.has(id) || (id === OV && allowed()));
    frame.setAttribute('aria-label', 'Map: ' + nameOf(id));
    document.title = nameOf(id) + ' · Map · Whiteout';
    try { menu.hidePopover(); } catch (e) { }
    syncSeg();
    markNav();
    if (tool === 'tele' && target && target.map !== id) { target = null; renderTarget(); }
    syncTools();
    renderCard();
    load();
  }
  function go(id, focus) {
    S.focus = focus || null;
    if (id === S.id && mode === 'map') {
      if (focus) applyFocus();
      return;
    }
    const a = document.activeElement;
    history.pushState(null, '', slug(id));
    route();
    if (a && (layer.contains(a) || exitsBox.contains(a))) frame.focus({ preventScroll: true });
  }

  function build() {
    if (built) return;
    built = true;
    view.hidden = false;
    renderNav();
    syncNav();
    loadPins();
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    body.classList.toggle('mode-map', m === 'map');
    modeBtns.forEach((b) => { if (b.dataset.mode === m) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (m === 'map') { build(); if (built && pz) { renderYou(); syncTools(); } } else document.title = 'Whiteout';
    window.scrollTo(0, 0);
  }
  function route() {
    const m = /^#map(?:\/(.*))?$/.exec(location.hash);
    if (!m) { setMode('edit'); return; }
    let id = '';
    try { id = decodeURIComponent(m[1] || ''); } catch (e) { id = ''; }
    setMode('map');
    if (!known(id)) { id = opening(); history.replaceState(null, '', slug(id)); }
    if (id !== S.id || !layer.firstChild) show(id);
    document.title = nameOf(S.id) + ' · Map · Whiteout';
  }
  modeBtns.forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    if (m === mode) return;
    history.pushState(null, '', m === 'map' ? slug(opening()) : location.pathname + location.search);
    route();
  }));
  addEventListener('popstate', route);
  $('#mapInfoBtn').addEventListener('click', () => $('#mapInfoDlg').showModal());
  let follow = false, lastRegion = null, noteTimer = 0;
  function followHere() {
    if (!follow || !slotOpen()) { noteBox.hidden = true; return; }
    let here = null;
    try { here = hereInfo(); } catch (e) { return; }
    if (!here || !here.region) return;
    const changed = here.region !== lastRegion;
    lastRegion = here.region;
    if (!changed) return;
    const id = regionIdOf(here.region);
    noteBox.hidden = !!id;
    clearTimeout(noteTimer);
    if (!id) noteTimer = setTimeout(() => { noteBox.hidden = true; }, 6000);
    if (id && id !== S.id) go(id);
  }
  window.tldMode = { follow(on, stay) { follow = !!on; lastRegion = null; if (!follow) noteBox.hidden = true; if (follow && !stay) { followHere(); if (mode !== 'map') window.tldMode.set('map'); } }, refresh() { if (mode === 'map' && built) { followHere(); renderYou(); syncTools(); } }, regions() { return Object.keys(CAL).map((id) => ({ id, name: nameOf(id) })); }, go(id) { if (!known(id)) return; if (mode !== 'map') window.tldMode.set('map'); go(id); }, set(m) { if (m === mode) return; history.pushState(null, '', m === 'map' ? slug(opening()) : location.pathname + location.search); route(); }, slotOpened() { fresh = true; }, reloadMap() { if (built && mode === 'map' && S.id) load(); } };
  const TRAIL_ON_KEY = 'whiteout-trail-visible', TRAIL_MAX = 300, TRAIL_STEP = 8;
  let trailOn = (() => { try { return localStorage.getItem(TRAIL_ON_KEY) !== '0'; } catch (e) { return true; } })();
  let wantCenter = false, lastGlide = null;
  const slotKey = () => String((state && state.fileName) || '').replace(/ \(.*$/, '');
  const trailOf = () => (slotKey() ? tldStore.trailOf(slotKey()) : []);
  const saveTrail = (list) => { if (slotKey()) tldStore.setTrail(slotKey(), list); };

  function youNow() {
    if (!slotOpen()) return null;
    let here = null;
    try { here = hereInfo(); } catch (e) { return null; }
    if (!here || !here.region || !Array.isArray(here.pos)) return null;
    return here;
  }

  function headingOf(c) {
    let q = null;
    try { q = (gs('m_PlayerManagerSerialized') || {}).m_SaveGameRotation; } catch (e) { return null; }
    if (!Array.isArray(q) || q.length < 4) return null;
    const [x, y, z, w] = q.map((v) => num(v));
    const hx = -2 * (x * z - w * y), hz = 1 - 2 * (y * y + z * z);
    if (Math.hypot(hx, hz) < 0.2) return null;
    const dex = hx * c.r.p, dey = -hz * c.r.p;
    const dsx = c.a * dex - c.b * dey, dsy = c.b * dex + c.a * dey;
    return Math.round((Math.atan2(dsx, -dsy) * 180) / Math.PI);
  }

  renderYou = function () {
    layer.querySelectorAll('.spot-you').forEach((e) => e.remove());
    const c = calOf(S.id);
    if (!slotOpen() || !c) return;
    const here = youNow();
    if (!here || here.region !== c.key) return;
    const [sx, sy] = toMap(c, here.pos[0], here.pos[2]);
    const dir = here.interior ? null : headingOf(c);
    const coords = 'x ' + Math.round(here.pos[0]) + ' · z ' + Math.round(here.pos[2]) + ' · height ' + Math.round(here.pos[1]) + ' m';
    layer.append(h('div', { class: 'spot-you', style: 'left:' + sx + 'px;top:' + sy + 'px' },
      h('span', { class: 'spot-dot' }),
      dir === null ? null : h('span', { class: 'spot-dir', style: '--a:' + dir + 'deg', title: 'Facing direction' }),
      h('span', { class: 'spot-label' }, h('strong', here.interior ? {} : { 'data-live': '1' }, youText(here)), h('small', {}, coords))));
  };

  function recordTrail() {
    const here = youNow();
    if (!here || here.interior) return;
    const list = trailOf();
    const last = list[list.length - 1];
    const x = Math.round(here.pos[0] * 10) / 10, z = Math.round(here.pos[2] * 10) / 10;
    if (last && last[0] === here.region && Math.hypot(last[1] - x, last[2] - z) < TRAIL_STEP) return;
    list.push([here.region, x, z]);
    while (list.length > TRAIL_MAX) list.shift();
    saveTrail(list);
  }
  function renderTrail() {
    layer.querySelectorAll('.trail').forEach((e) => e.remove());
    const c = calOf(S.id);
    syncTrailBtns();
    if (!trailOn || !c || !slotOpen() || !layer.firstChild) return;
    const pts = trailOf().filter((p) => p[0] === c.key).map((p) => toMap(c, p[1], p[2]));
    if (pts.length < 2) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'trail');
    svg.setAttribute('width', parseFloat(layer.style.width) || 0);
    svg.setAttribute('height', parseFloat(layer.style.height) || 0);
    svg.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
    svg.append(line);
    for (const p of pts.slice(0, -1)) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', p[0].toFixed(1)); dot.setAttribute('cy', p[1].toFixed(1)); dot.setAttribute('r', '3');
      svg.append(dot);
    }
    layer.insertBefore(svg, layer.firstChild.nextSibling);
  }
  const trailBtn = document.querySelector('#mapTrailBtn'), trailClear = document.querySelector('#mapTrailClear'), centerBtn = document.querySelector('#mapCenterBtn');
  function syncTrailBtns() {
    const c = calOf(S.id), on = slotOpen() && !!c;
    if (trailBtn) { trailBtn.hidden = !on; trailBtn.setAttribute('aria-pressed', String(trailOn)); }
    if (trailClear) trailClear.hidden = !(on && trailOn && trailOf().length > 1);
    if (centerBtn) { const here = on ? youNow() : null; centerBtn.hidden = !(here && here.region === c.key); }
  }
  if (trailBtn) trailBtn.addEventListener('click', () => {
    trailOn = !trailOn;
    try { localStorage.setItem(TRAIL_ON_KEY, trailOn ? '1' : '0'); } catch (e) { }
    renderTrail();
  });
  if (trailClear) trailClear.addEventListener('click', () => { saveTrail([]); renderTrail(); toast('Trail cleared.'); });
  const baseSyncTools = syncTools;
  syncTools = function () { baseSyncTools(); syncTrailBtns(); };

  function centerYou(animate) {
    const c = calOf(S.id), here = youNow();
    if (!pz || !c || !here || here.region !== c.key) return false;
    const [sx, sy] = toMap(c, here.pos[0], here.pos[2]);
    pz.centerOn(sx, sy, Math.max(pz.scale, pz.fitScale * 2.5), animate);
    lastGlide = here.pos.slice();
    return true;
  }
  if (centerBtn) centerBtn.addEventListener('click', () => centerYou(true));
  function glide() {
    const here = youNow();
    if (!here) return;
    const id = regionIdOf(here.region);
    const moved = !lastGlide || Math.hypot(lastGlide[0] - here.pos[0], lastGlide[2] - here.pos[2]) > 3;
    if (id !== S.id || layer.style.visibility === 'hidden') { wantCenter = true; return; }
    if (moved) centerYou(true);
  }
  addEventListener('whiteout-data', (e) => {
    const f = (e.detail && e.detail.files) || [];
    if (f.includes('pins') && built) loadPins();
    if (f.includes('trail') && mode === 'map' && built) renderTrail();
  });
  window.tldAfterLoad = () => { renderTrail(); syncTrailBtns(); if (wantCenter) { wantCenter = false; centerYou(false); } };

  const baseTld = window.tldMode;
  window.tldMode = Object.assign({}, baseTld, {
    follow(on, stay) {
      baseTld.follow(on, stay);
      if (on) { lastGlide = null; wantCenter = mode === 'map'; if (mode === 'map') glide(); }
    },
    refresh() {
      baseTld.refresh();
      recordTrail();
      if (mode === 'map' && built) { renderTrail(); syncTrailBtns(); if (follow) glide(); }
    },
    record: recordTrail,
    pickTeleport(key) {
      const id = Object.keys(CAL).find((k) => CAL[k][0] === key) || null;
      if (!id || !slotOpen()) return false;
      if (mode !== 'map') window.tldMode.set('map');
      go(id);
      setTool('tele', true);
      return true;
    },
    youInfo() {
      const here = youNow();
      if (!here) return null;
      const c = calOf(regionIdOf(here.region));
      return { region: here.region, pos: here.pos, dir: c && !here.interior ? headingOf(c) : null, trail: trailOf().length };
    },
  });

  let remoteOn = false, remoteBack = null, remoteMenu = null;
  const remoteBadge = h('div', { id: 'remoteBadge', class: 'remotebadge', role: 'status', hidden: true });
  document.body.append(remoteBadge);
  const remoteConns = () => (EXITS[S.id] || []).slice(0, 9);
  const remoteInvoke = (name, args) => { try { return window.tld.invoke(name, args).catch(() => { }); } catch (e) { return null; } };
  function remoteHere() {
    try { const here = hereInfo(); return here && here.region ? regionIdOf(here.region) : null; } catch (e) { return null; }
  }
  function remoteNumber() {
    layer.querySelectorAll('.spot-num').forEach((n) => n.remove());
    if (!remoteOn) return;
    layer.querySelectorAll('.spot-exit').forEach((b, i) => { if (i < 9) b.append(h('span', { class: 'spot-num', 'aria-hidden': 'true' }, String(i + 1))); });
  }
  function remoteChips() {
    if (!remoteOn) return;
    exitsBox.replaceChildren();
    const conns = remoteConns();
    const you = remoteHere();
    exitsBox.hidden = false;
    exitsBox.append(h('span', { class: 'lbl' }, 'Press a number'), h('div', { class: 'chips' },
      conns.map((e, i) => h('button', { type: 'button', class: 'chip numchip', onclick: () => remoteDigit(i + 1) }, h('b', {}, String(i + 1)), e[4].map(nameOf).join(' / '))),
      h('button', { type: 'button', class: 'chip numchip', disabled: !you, onclick: () => remoteDigit(0) }, h('b', {}, '0'), you ? 'You: ' + nameOf(you) : 'You')));
  }
  function remoteBar() {
    remoteBadge.hidden = !remoteOn;
    remoteBadge.textContent = remoteOn ? 'Map remote on · ' + ((window.tld.settings().mapRemoteKey) || 'Ctrl+Alt+W') + ' to close' : '';
  }
  function remoteMenuOpen(to) {
    const anchor = layer.querySelectorAll('.spot-exit')[remoteMenuIndex] || layer.querySelector('.spot-exit');
    remoteMenu = to;
    if (!anchor) return;
    openMenu(anchor, to);
    menu.querySelectorAll('button').forEach((b, i) => b.prepend(h('b', { class: 'menunum' }, String(i + 1))));
  }
  let remoteMenuIndex = 0;
  function remoteDigit(d) {
    if (!remoteOn) return;
    if (remoteMenu) {
      const to = remoteMenu;
      remoteMenu = null;
      try { menu.hidePopover(); } catch (e) { }
      if (d >= 1 && d <= to.length) go(to[d - 1]);
      return;
    }
    if (d === 0) { const id = remoteHere(); if (id) go(id); return; }
    const c = remoteConns()[d - 1];
    if (!c) return;
    if (c[4].length === 1) go(c[4][0]); else { remoteMenuIndex = d - 1; remoteMenuOpen(c[4]); }
  }
  function remoteStart() {
    if (remoteOn) return;
    remoteOn = true;
    remoteBack = { mode, id: S.id };
    remoteInvoke('remote_digits', { on: true });
    if (mode !== 'map') window.tldMode.set('map');
    const id = remoteHere();
    if (id) go(id);
    remoteBar(); remoteNumber(); remoteChips();
  }
  function remoteStop() {
    if (!remoteOn) return;
    remoteOn = false;
    remoteMenu = null;
    try { menu.hidePopover(); } catch (e) { }
    remoteInvoke('remote_digits', { on: false });
    const back = remoteBack;
    remoteBack = null;
    remoteBar(); remoteNumber();
    if (back && back.mode === 'edit') { window.tldMode.set('edit'); }
    else if (back && back.id && back.id !== S.id) go(back.id);
    renderExits();
  }
  const baseRenderExits = renderExits;
  renderExits = function () { if (remoteOn) { remoteChips(); return; } baseRenderExits(); };
  new MutationObserver(remoteNumber).observe(layer, { childList: true });
  const baseShowForRemote = show;
  show = function (id) { baseShowForRemote(id); if (remoteOn) { remoteMenu = null; remoteNumber(); remoteChips(); } };
  addEventListener('keydown', (e) => {
    if (remoteOn && e.key === 'Escape' && !document.querySelector('dialog[open]')) { e.preventDefault(); remoteStop(); }
  }, true);
  window.tldMode = Object.assign({}, window.tldMode, {
    remote(payload) {
      if (payload === 'toggle') { if (remoteOn) remoteStop(); else remoteStart(); return; }
      const m = /^digit:(\d)$/.exec(payload || '');
      if (m) remoteDigit(Number(m[1]));
    },
    remoteStop,
    remoteActive: () => remoteOn,
  });

  route();
})();
