const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'THIRD-PARTY-NOTICES.txt');
const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)([-._].*)?$/i;
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();

const meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--locked', '--manifest-path', path.join(ROOT, 'src-tauri', 'Cargo.toml')], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
const byId = new Map(meta.packages.map((p) => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));

const shipped = new Set();
const walk = (id) => {
  for (const dep of nodes.get(id).deps) {
    if (!dep.dep_kinds.some((k) => k.kind === null)) continue;
    if (shipped.has(dep.pkg)) continue;
    shipped.add(dep.pkg);
    walk(dep.pkg);
  }
};
walk(meta.resolve.root);

const groups = new Map();
for (const id of shipped) {
  const p = byId.get(id);
  const dir = path.dirname(p.manifest_path);
  const files = fs.readdirSync(dir).filter((f) => LICENSE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile()).sort();
  if (p.license_file && !files.includes(p.license_file)) files.push(p.license_file);
  const mit = files.filter((f) => /mit/i.test(f));
  const chosen = /\bMIT\b/.test(p.license || '') && mit.length ? mit.concat(files.filter((f) => /notice/i.test(f))) : files;
  const license = /\bMIT\b/.test(p.license || '') && mit.length ? 'MIT (chosen from: ' + p.license + ')' : p.license || 'see license text';
  const text = chosen.map((f) => read(path.join(dir, f))).join('\n\n');
  const key = license + '\n' + text;
  if (!groups.has(key)) groups.set(key, { license, text, names: [] });
  groups.get(key).names.push(p.name + ' ' + p.version + (p.repository ? ' (' + p.repository + ')' : ''));
}

const rule = '\n' + '='.repeat(78) + '\n';
const parts = [
  'Third-party software in Whiteout',
  '',
  'Whiteout is MIT licensed (see LICENSE). It includes the open source components',
  'listed below. Each group shows the components, their license and the license',
  'text shipped with them. Regenerate this file with: npm run notices',
];
const font = path.join(ROOT, 'ui', 'fonts', 'OFL.txt');
if (fs.existsSync(font)) parts.push(rule, 'Archivo font (ui/fonts/archivo-latin.woff2)\n\nLicense: OFL-1.1\n\n' + read(font));
const sorted = Array.from(groups.values()).sort((a, b) => a.names.sort()[0].localeCompare(b.names[0]));
for (const g of sorted) {
  parts.push(rule, g.names.join('\n') + '\n\nLicense: ' + g.license + '\n\n' + (g.text || '(No license file in the package. The license above is the one the package declares.)'));
}
fs.writeFileSync(OUT, parts.join('\n') + '\n');
console.log('Wrote ' + path.relative(ROOT, OUT) + ': ' + shipped.size + ' crates in ' + groups.size + ' groups');
