import argparse,json,math,subprocess,sys
from pathlib import Path
import numpy as np,soundfile as sf
from scipy.signal import resample_poly
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'real'))
from dataset import load_index,reference_grid,sha,CONFIG
p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--index',required=True);p.add_argument('--expected-index-sha256',required=True);p.add_argument('--split',choices=['R1','R2','synthetic'],required=True);p.add_argument('--work',required=True);a=p.parse_args()
config_path=Path(__file__).with_name('config.json');c=json.loads(config_path.read_text());base=json.loads(CONFIG.read_text());assert sha(CONFIG)==c['baseR1ConfigSha256'];assert sha(a.index)==a.expected_index_sha256,'Frozen manifest hash mismatch'
records,index=load_index(a.dataset,a.index,base)
if a.split!='synthetic':
 assert len(records)==c['expectedRecordings'] and len({r['player'] for r in records})==c['expectedPlayers']
if a.split=='R1':
 assert abs(sum(r['durationSeconds'] for r in records)-base['expectedTotalSeconds'])<.02 and sum(len(r['notes']) for r in records)==base['expectedNoteCount'] and len({r['style'] for r in records})==base['expectedStyleCount']
work=Path(a.work);work.mkdir(parents=True,exist_ok=True);assert not (work/'prepared.json').exists(),'Use new work directory';root=Path(a.dataset);items=[]
for r in records:
 x,rate=sf.read(root/r['wav'],dtype='float32');g=math.gcd(rate,c['sampleRateHz']);x=resample_poly(x,c['sampleRateHz']//g,rate//g).astype('<f4') if rate!=c['sampleRateHz'] else x.astype('<f4');assert x.ndim==1 and np.all(np.isfinite(x))
 f=r['id']+'.f32';x.tofile(work/f);grid=reference_grid(r['notes'],len(x)/c['sampleRateHz']*1000,base)
 distance=[min(min(abs(t-n['onsetMs']),abs(t-n['onsetMs']-n['durationMs'])) for n in r['notes']) for t in grid['gridMs']]
 items.append(dict(r,pcmFile=f,pcmSha256=sha(work/f),analysisFrames=len(x),boundaryDistanceMs=distance,**grid))
m=dict(protocol=c['protocol'],split=a.split,config=c,configSha256=sha(config_path),codeRevision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),inputManifestSha256=sha(a.index),recordings=items,pitchBins=base['pitchBins'])
(work/'prepared.json').write_text(json.dumps(m,indent=2)+'\n')
inspection=dict(split=a.split,recordings=len(items),players=sorted({r['player'] for r in items}),seconds=sum(r['durationSeconds'] for r in items),notes=sum(len(r['notes']) for r in items),inventory=[dict(id=r['id'],mode=r['mode'],frameCounts={k:r['reason'].count(k) for k in ['mono','unvoiced','polyphonic','boundary-guard']},warnings=r['jamsSchema']['warnings']) for r in items])
(work/'inspection.json').write_text(json.dumps(inspection,indent=2)+'\n');print(json.dumps(inspection,indent=2))
