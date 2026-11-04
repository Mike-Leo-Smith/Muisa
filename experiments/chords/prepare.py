"""Inspect then prepare ONLY local GuitarSet comp audio; never infer performed track."""
import argparse,hashlib,importlib.util,json,math,subprocess,wave
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('muisa_real_reader',HERE.parent/'real'/'dataset.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)

def tracks(path,duration):
 doc=json.loads(Path(path).read_text());result=[]
 for i,a in enumerate(doc.get('annotations',[])):
  if a.get('namespace')!='chord':continue
  segments=[]
  for row in a.get('data',[]):
   t,d=row.get('time'),row.get('duration')
   if any(type(v) not in (int,float) or not math.isfinite(v) for v in (t,d)) or t<0 or d<=0 or t+d>duration+.001 or not isinstance(row.get('value'),str):raise ValueError('Invalid chord interval; review, do not translate annotation.time')
   segments.append(dict(start=t,end=t+d,label=row['value'],confidence=row.get('confidence')))
  segments.sort(key=lambda s:s['start'])
  if any(b['start']<a['end']-1e-9 for a,b in zip(segments,segments[1:])):raise ValueError('Overlapping chord intervals')
  result.append(dict(trackIndex=i,metadata=a.get('annotation_metadata',{}),annotationTime=a.get('time'),annotationDuration=a.get('duration'),segments=segments))
 return result

def main():
 p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--index',required=True);p.add_argument('--split',choices=['R1','R2'],required=True);p.add_argument('--selection');p.add_argument('--work',required=True);a=p.parse_args()
 root=Path(a.dataset).resolve();work=Path(a.work);config=json.loads((HERE/'config.json').read_text())
 records,index=reader.load_index(root,Path(a.index),json.loads((HERE.parent/'real'/'config.json').read_text()))
 records=[r for r in records if r['mode']=='comp']
 expected=json.loads((HERE.parent/'window'/'results-w1.json').read_text())['splits'][a.split]['inventory'];expected={r['id'] for r in expected if r['mode']=='comp'}
 if {r['id'] for r in records}!=expected:raise ValueError('Require frozen six comp recordings for selected observed split')
 inventory=[dict(id=r['id'],wavSha256=r['wavSha256'],jamsSha256=r['jamsSha256'],player=r['player'],durationSeconds=r['durationSeconds'],tracks=tracks(root/r['jams'],r['durationSeconds'])) for r in records]
 work.mkdir(parents=True,exist_ok=False)
 provenance=dict(protocol=config['protocol'],split=config['splits'][a.split],inputManifestSha256=reader.sha(Path(a.index)),configSha256=reader.sha(HERE/'config.json'),codeRevision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip())
 (work/'inventory.json').write_text(json.dumps(dict(**provenance,recordings=inventory),indent=2)+'\n')
 if not a.selection:
  print('Inventory only. Select performed chord tracks after metadata review; no inference.');return
 selection_path=Path(a.selection);selection=json.loads(selection_path.read_text())
 if selection['inputManifestSha256']!=provenance['inputManifestSha256'] or set(selection['recordings'])!=expected:raise ValueError('Selection must bind exact input manifest/recordings')
 import numpy as np
 from scipy.signal import resample_poly
 output=[]
 for r,inv in zip(records,inventory):
  s=selection['recordings'][r['id']]
  if s['jamsSha256']!=r['jamsSha256'] or s['role']!='performed' or not isinstance(s.get('reviewBasis'),str) or not s['reviewBasis'].strip():raise ValueError('Explicit performed-track review/hash required')
  track=next((t for t in inv['tracks'] if t['trackIndex']==s['trackIndex']),None)
  if track is None or not track['segments']:raise ValueError('Missing selected chord annotation')
  with wave.open(str(root/r['wav'])) as w:
   rate=w.getframerate();x=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32)/32768
  source_clipped=int(np.sum(np.abs(x)>=.9999))
  divisor=math.gcd(rate,config['analysisSampleRateHz']);x=resample_poly(x,config['analysisSampleRateHz']//divisor,rate//divisor).astype('<f4')
  if not np.isfinite(x).all():raise ValueError('Nonfinite PCM')
  name=r['id']+'.f32';x.tofile(work/name)
  output.append(dict(id=r['id'],player=r['player'],style=r['style'],sourceWavSha256=r['wavSha256'],sourceJamsSha256=r['jamsSha256'],pcmFile=name,pcmSha256=reader.sha(work/name),samples=len(x),segments=track['segments'],selectedTrack=track['trackIndex'],trackMetadata=track['metadata'],annotationTime=track['annotationTime'],reviewBasis=s['reviewBasis'],sourceClippedSamples=source_clipped,analysisClippedSamples=int(np.sum(np.abs(x)>=.9999))))
 (work/'prepared.json').write_text(json.dumps(dict(**provenance,selectionSha256=reader.sha(selection_path),config=config,recordings=output),indent=2)+'\n')
 print('Prepared six observed comp recordings without normalization; no inference.')
if __name__=='__main__':main()
