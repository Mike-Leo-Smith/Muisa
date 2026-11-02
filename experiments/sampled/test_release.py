"""Optional actual-renderer regression; requires the pinned M2 bank/renderer.
Run after M2 generation, using the room environment. No audio is published.
"""
import argparse, hashlib, json, subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile

p=argparse.ArgumentParser();p.add_argument('renderer');p.add_argument('--fixture-dir',default='reports/sampled');p.add_argument('--output',default='reports/release-fix');a=p.parse_args()
root=Path(a.fixture_dir);out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
results=[]
for name,gate in [('cal-1-90-64',.75),('rr1-v90-render',2.15)]:
 arrays=[]; row={'fixture':name,'lastMidiNoteOffSeconds':gate}
 for mode in ['cut','natural']:
  path=out/(name+'-'+mode+'.wav')
  command=[a.renderer,'--sfz',str(root/'controlled-rr1.sfz'),'--midi',str(root/(name+'.mid')),'--wav',str(path),'--samplerate','22050','--blocksize','256']
  if mode=='cut':command.append('--use-eot')
  subprocess.run(command,check=True,timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  rate,x=wavfile.read(path);assert rate==22050 and x.dtype==np.int16
  arrays.append(x);row[mode]={'seconds':len(x)/rate,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'lastBlockPeakPcm16':int(np.max(np.abs(x[-256:].astype(np.int32))))}
 cut,full=arrays
 assert len(full)>len(cut)+256, 'No recovered release'
 assert np.array_equal(cut,full[:len(cut)]), 'Earlier audio changed'
 tail=full[len(cut):].astype(float)/32768
 row['recoveredTailRms']=float(np.sqrt(np.mean(tail**2)))
 assert row['recoveredTailRms']>1e-5, 'Zero padding is not recovered release'
 assert row['natural']['lastBlockPeakPcm16']<=2, 'Release did not decay to quantization floor'
 assert np.max(np.abs(full.astype(np.int32)))<32767
 results.append(row)
report={'status':'actual sfizz 1.2.3 render regression, CC0 Emily, not real guitar validation','cases':results,'limits':'Two pinned fixtures only; no reassessment of M2/M3 recognition or release labels.'}
(out/'results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
