"""Offline research adapter; never imported by the browser or fast CI."""
import hashlib,json,time,resource,sys,platform
from pathlib import Path
import librosa
import numpy as np
import soundfile as sf
root=Path('reports/yin');manifest=json.loads((root/'manifest.json').read_text());rate=manifest['sampleRateHz'];window=manifest['windowSize'];hop=manifest['hopSize']
common=dict(fmin=70,fmax=1000,sr=rate,frame_length=window,hop_length=hop,center=False)
# Warm JIT separately; count cold startup rather than silently hiding it.
t=time.perf_counter();warm=np.sin(2*np.pi*220*np.arange(window+hop)/rate)*.2
librosa.yin(warm,**common);librosa.pyin(warm,**common);warmup_ms=(time.perf_counter()-t)*1000
results=[]
for case in manifest['cases']:
 path=root/case['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==case['sha256']
 x,sr=sf.read(path,dtype='float64');assert sr==rate
 rms=np.array([np.sqrt(np.mean(x[s:s+window]**2)) for s in range(0,len(x)-window+1,hop)])
 for method in ['yin','pyin']:
  elapsed=[];prediction=None
  for repeat in range(3):
   t=time.perf_counter()
   if method=='yin':f0=librosa.yin(x,**common);voiced=np.ones(len(f0),dtype=bool)
   else:f0,voiced,probability=librosa.pyin(x,**common)
   elapsed.append((time.perf_counter()-t)*1000)
  midi=69+12*np.log2(f0/440)
  variants=[('native',voiced),('rms-gate',voiced&(rms>=.008))] if method=='yin' else [('native-hmm',voiced)]
  for variant,mask in variants:
   prediction=[float(m) if flag and np.isfinite(m) else None for m,flag in zip(midi,mask)]
   assert len(prediction)==len(case['reference'])
   results.append(dict(id=case['id'],method=method,variant=variant,prediction=prediction,wholeClipComputeMs=elapsed,processPeakRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,causality='whole-clip HMM / noncausal' if method=='pyin' else 'independent windows, offline vectorized adapter'))
(root/'python.json').write_text(json.dumps(dict(librosa=librosa.__version__,python=sys.version.split()[0],platform=platform.platform(),jitWarmupMs=warmup_ms,windowMs=window/rate*1000,results=results),indent=2)+'\n')
print('Wrote Python model predictions:',len(results),'JIT warmup ms:',round(warmup_ms))
