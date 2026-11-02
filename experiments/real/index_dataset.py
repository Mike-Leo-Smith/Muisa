"""Optional verified-ZIP import; exact trusted SHA precedes extraction/indexing."""
import argparse,json,re,zipfile
from pathlib import Path
from dataset import sha
p=argparse.ArgumentParser();p.add_argument('--zip',required=True);p.add_argument('--sha256',required=True);p.add_argument('--destination',required=True);a=p.parse_args()
archive=Path(a.zip);root=Path(a.destination).resolve()
if sha(archive)!=a.sha256:raise ValueError('ZIP SHA256 mismatch')
with zipfile.ZipFile(archive) as z:
 for item in z.infolist():
  path=(root/item.filename).resolve()
  if not path.is_relative_to(root) or (item.external_attr>>16)&0o170000==0o120000:raise ValueError('Unsafe ZIP member')
 if z.testzip() is not None:raise ValueError('ZIP CRC failure')
 root.mkdir(parents=True,exist_ok=True);z.extractall(root)
# The trusted full ZIP hash pins all bytes; preserve original manifests unchanged.
jams={}
for path in root.rglob('*.jams'):
 if path.stem in jams:raise ValueError('Ambiguous duplicate JAMS basename')
 jams[path.stem]=path
recordings=[]
for wav in sorted(root.rglob('*.wav')):
 id=wav.stem.removesuffix('_mic');match=re.fullmatch(r'(\d{2})_([A-Za-z]+)\d*-.+_(solo|comp)',id)
 if not match or id not in jams:raise ValueError('Cannot pair/group filename; write explicit index per README: '+wav.name)
 j=jams.pop(id);recordings.append(dict(id=id,player=match[1],style=match[2],mode=match[3],wav=str(wav.relative_to(root)),jams=str(j.relative_to(root)),wavSha256=sha(wav),jamsSha256=sha(j)))
if jams:raise ValueError('Unpaired JAMS')
index=dict(schema='muisa-r1-local-v1',license='CC-BY-4.0',provenance=dict(dataset='GuitarSet 1.1.0',doi='10.5281/zenodo.3371780',trustedSubsetZipSha256=a.sha256,verification='Expected trusted archive SHA256 + every member CRC; per-file SHA256 inventoried, original package manifests preserved'),recordings=recordings)
(root/'muisa-index.json').write_text(json.dumps(index,indent=2)+'\n');print('Indexed',len(recordings),'complete recordings at',root/'muisa-index.json')
