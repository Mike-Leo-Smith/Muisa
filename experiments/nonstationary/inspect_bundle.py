"""Read-only schema inspection before inference; no models or label translation."""
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve();frozen=json.loads(Path(__file__).with_name('frozen-input.json').read_text())
result={}
for name,expected in [('manifest.json',frozen['inputManifestSha256']),('input-lock.json',frozen['inputLockSha256']),('performed-and-delayed.json',None)]:
 candidates=[p for p in root.rglob(name) if p.is_file() and p.resolve().is_relative_to(root) and (expected is None or hashlib.sha256(p.read_bytes()).hexdigest()==expected)]
 if len(candidates)!=1:raise ValueError('Expected one matching '+name)
 p=candidates[0];doc=json.loads(p.read_text());result[name]={'relativePath':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'keys':list(doc) if isinstance(doc,dict) else None}
 if name=='performed-and-delayed.json':result[name]['content']=doc
 if name=='input-lock.json':result[name]['content']=doc
print(json.dumps(result,indent=2))
