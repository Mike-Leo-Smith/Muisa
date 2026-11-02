import argparse,hashlib,json,math,subprocess
from pathlib import Path
import numpy as np,soundfile as sf
from scipy.signal import resample_poly
from dataset import CONFIG,load_index,reference_grid,sha
p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--index',required=True);p.add_argument('--work',required=True);p.add_argument('--synthetic-smoke',action='store_true');a=p.parse_args()
config=json.loads(CONFIG.read_text());recordings,index=load_index(a.dataset,a.index,config)
if not a.synthetic_smoke and (len(recordings)!=config['expectedRecordings'] or len({r['player'] for r in recordings})!=config['expectedPlayers']):raise ValueError('R1 requires exactly12 recordings/6players; inspect explicit index')
if not a.synthetic_smoke:
 if abs(sum(r['durationSeconds'] for r in recordings)-config['expectedTotalSeconds'])>.02 or sum(len(r['notes']) for r in recordings)!=config['expectedNoteCount'] or len({r['style'] for r in recordings})!=config['expectedStyleCount']:raise ValueError('Subset duration/note/style inventory differs from declared R1; inspect before inference')
root=Path(a.dataset).resolve();work=Path(a.work).resolve();work.mkdir(parents=True,exist_ok=True)
if (work/'prepared.json').exists():raise ValueError('Prepared work exists; reuse it or choose a new work directory')
items=[]
for r in recordings:
 x,rate=sf.read(root/r['wav'],dtype='float32');assert x.ndim==1 and np.all(np.isfinite(x))
 divisor=math.gcd(rate,config['sampleRateHz']);x=resample_poly(x,config['sampleRateHz']//divisor,rate//divisor).astype('<f4') if rate!=config['sampleRateHz'] else x.astype('<f4')
 # No peak normalization/clipping. FLOAT WAV and f32 carry exactly the same PCM.
 file=r['id']+'.f32';wav=r['id']+'.wav';x.tofile(work/file);sf.write(work/wav,x,config['sampleRateHz'],subtype='FLOAT')
 decoded,sr=sf.read(work/wav,dtype='float32');assert sr==config['sampleRateHz'] and np.array_equal(decoded,x)
 notes=r['notes'];grid=reference_grid(notes,len(x)/config['sampleRateHz']*1000,config)
 items.append(dict(r,pcmFile=file,pcmSha256=sha(work/file),modelWav=wav,modelWavSha256=sha(work/wav),analysisFrames=len(x),peak=float(np.max(np.abs(x))),sourceClippedSamples=int(np.sum(np.abs(sf.read(root/r['wav'],dtype='float32')[0])>=.9999)),**grid))
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();manifest=dict(protocol=config['protocol'],syntheticSmoke=a.synthetic_smoke,config=config,configSha256=sha(CONFIG),codeRevision=revision,provenance=index['provenance'],license=index['license'],recordings=items)
(work/'prepared.json').write_text(json.dumps(manifest,indent=2)+'\n')
summary=dict(recordings=len(items),seconds=sum(r['durationSeconds'] for r in items),notes=sum(len(r['notes']) for r in items),players=sorted({r['player'] for r in items}),styles=sorted({r['style'] for r in items}),maxClipSeconds=max(r['durationSeconds'] for r in items),pcmCacheBytes=sum(r['analysisFrames']*8 for r in items),schemaWarnings={r['id']:r['jamsSchema']['warnings'] for r in items},frameCategories={kind:sum(r['reason'].count(kind) for r in items) for kind in ['mono','unvoiced','polyphonic','boundary-guard']},limits='Full-clip pYIN/BasicPitch offline. Model process RSS can exceed1GB; no precise runtime promise; serial runs and per-recording cache.')
(work/'inspection.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
