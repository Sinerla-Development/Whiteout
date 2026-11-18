import json, os, sys
import UnityPy

game = sys.argv[1] if len(sys.argv) > 1 else r'C:\Program Files (x86)\Steam\steamapps\common\TheLongDark'
roots = [os.path.join(game, 'tld_Data', 'StreamingAssets', 'aa'), os.path.join(game, 'tld_dlc')]
weights = {}
for root in roots:
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if not f.endswith('.bundle'):
                continue
            try:
                env = UnityPy.load(os.path.join(dp, f))
            except Exception:
                continue
            for path, obj in env.container.items():
                if 'GearItemData_' not in path:
                    continue
                try:
                    tree = obj.read_typetree()
                except Exception:
                    continue
                base = tree.get('m_BaseWeight') or {}
                units = base.get('m_Units', 0) if isinstance(base, dict) else 0
                name = os.path.basename(path).replace('GearItemData_', 'GEAR_').replace('.asset', '')
                weights[name] = round((units or 0) / 1e9, 4)
out = os.path.join(os.path.dirname(__file__), '..', 'ui', 'weight-data.js')
with open(out, 'w', encoding='utf-8') as fh:
    fh.write('const WEIGHT_DATA = ' + json.dumps(dict(sorted(weights.items())), separators=(',', ':')) + ';\n')
    fh.write("if (typeof module !== 'undefined') module.exports = WEIGHT_DATA;\n")
print(len(weights), 'items written to', os.path.normpath(out))
