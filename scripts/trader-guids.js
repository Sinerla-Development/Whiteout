const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'ui', 'trader-data.js');
const CATALOG_NAME = /^(catalog|DLC\d+)\.json$/;
const GUID = /^[0-9a-f]{32}$/;
const KINDS = [
  ['items', /\/GearItemData_([A-Za-z0-9_]+)\.asset$/, (m) => (m.startsWith('GEAR_') ? m : 'GEAR_' + m)],
  ['categories', /\/ExchangeItemCategories\/([A-Za-z0-9_]+?)(?:Category)?\.asset$/, (m) => m],
  ['liquids', /\/LIQUID_([A-Za-z0-9_]+)\.asset$/, (m) => m],
];

function findCatalogs(dir, depth, out) {
  if (depth > 8) return out;
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findCatalogs(p, depth + 1, out);
    else if (CATALOG_NAME.test(e.name)) out.push(p);
  }
  return out;
}

function readCatalog(file) {
  let c;
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
  if (!c || typeof c.m_KeyDataString !== 'string' || typeof c.m_BucketDataString !== 'string' || typeof c.m_EntryDataString !== 'string' || !Array.isArray(c.m_InternalIds)) return null;
  const keys = Buffer.from(c.m_KeyDataString, 'base64'), buckets = Buffer.from(c.m_BucketDataString, 'base64'), entries = Buffer.from(c.m_EntryDataString, 'base64');
  const keyAt = (off) => {
    const type = keys[off];
    if (type !== 0 && type !== 1) return null;
    const len = keys.readInt32LE(off + 1);
    return keys.toString(type === 0 ? 'latin1' : 'utf16le', off + 5, off + 5 + len);
  };
  const out = [];
  const count = buckets.readInt32LE(0);
  let o = 4;
  for (let i = 0; i < count; i++) {
    const keyOffset = buckets.readInt32LE(o), n = buckets.readInt32LE(o + 4);
    const first = n > 0 ? buckets.readInt32LE(o + 8) : -1;
    o += 8 + n * 4;
    const key = keyAt(keyOffset);
    if (first < 0 || typeof key !== 'string' || !GUID.test(key)) continue;
    const id = c.m_InternalIds[entries.readInt32LE(4 + first * 28)];
    if (typeof id === 'string') out.push([key, id]);
  }
  return out;
}

function build(gameDir) {
  const data = { items: {}, categories: {}, liquids: {} };
  const files = findCatalogs(gameDir, 0, []).sort();
  let used = 0;
  for (const f of files) {
    const pairs = readCatalog(f);
    if (!pairs) continue;
    used++;
    for (const [guid, id] of pairs) {
      for (const [kind, re, name] of KINDS) {
        const m = re.exec(id);
        if (m) { data[kind][guid] = name(m[1]); break; }
      }
    }
  }
  const sorted = {};
  for (const kind of Object.keys(data)) {
    sorted[kind] = {};
    for (const g of Object.keys(data[kind]).sort()) sorted[kind][g] = data[kind][g];
  }
  return { data: sorted, used };
}

function main() {
  const gameDir = process.argv[2];
  if (!gameDir || !fs.existsSync(gameDir)) {
    console.error('Usage: node scripts/trader-guids.js <The Long Dark install folder>');
    process.exit(1);
  }
  const { data, used } = build(gameDir);
  const counts = Object.keys(data).map((k) => Object.keys(data[k]).length + ' ' + k).join(', ');
  if (!used || !Object.keys(data.items).length) {
    console.error('No asset catalogs with item ids were found in ' + gameDir);
    process.exit(1);
  }
  fs.writeFileSync(OUT, 'const TRADER_DATA = ' + JSON.stringify(data) + ';\nif (typeof module !== \'undefined\') module.exports = TRADER_DATA;\n');
  console.log('Read ' + used + ' catalogs: ' + counts + '. Wrote ' + path.relative(process.cwd(), OUT));
}

if (require.main === module) main();
else module.exports = { build, readCatalog };
