import os
for key,value in {'TF_CPP_MIN_LOG_LEVEL':'2','TF_NUM_INTRAOP_THREADS':'2','TF_NUM_INTEROP_THREADS':'1','OMP_NUM_THREADS':'2'}.items():os.environ.setdefault(key,value)
import argparse,hashlib,json,resource,sys,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('capacity',choices=['tiny','small']);args=parser.parse_args()
source=Path(args.source).resolve();sys.path.insert(0,str(source))
import crepe,numpy as np,soundfile as sf,tensorflow as tf
root=Path('reports/yin');manifest=json.loads((root/'manifest.json').read_text())
t=time.perf_counter();model=crepe.core.build_and_load_model(args.capacity);load_ms=(time.perf_counter()-t)*1000
warm=.2*np.sin(2*np.pi*220*np.arange(8000)/16000);t=time.perf_counter();crepe.predict(warm,16000,model_capacity=args.capacity,center=False,viterbi=False,verbose=0);warm_ms=(time.perf_counter()-t)*1000
rows=[]
for case in manifest['cases']:
 path=root/case['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==case['sha256'];audio,rate=sf.read(path,dtype='float32');elapsed=[];cpu=[]
 for repeat in range(3):
  t=time.perf_counter();c=time.process_time();times,freq,confidence,_=crepe.predict(audio,rate,model_capacity=args.capacity,center=False,viterbi=False,step_size=10,verbose=0);elapsed.append((time.perf_counter()-t)*1000);cpu.append((time.process_time()-c)*1000)
 # center=False timestamps name window START; evaluate at its center, +32ms.
 reference=[];stable=[]
 for start in times*1000:
  center=start+32;note=next((n for n in case['notes'] if n['onsetMs']<=center<n['onsetMs']+n['durationMs']),None)
  reference.append(note['midi'] if note else None)
  stable.append(start>=note['onsetMs'] and start+64<=note['onsetMs']+note['durationMs'] if note else not any(start<n['onsetMs']+n['durationMs'] and start+64>n['onsetMs'] for n in case['notes']))
 midi=69+12*np.log2(freq/440)
 for threshold in [.5,.8]:
  prediction=[float(m) if q>=threshold and np.isfinite(m) else None for m,q in zip(midi,confidence)]
  rows.append(dict(id=case['id'],threshold=threshold,reference=reference,stable=[bool(v) for v in stable],prediction=prediction,confidenceMedian=float(np.median(confidence)),wholeClipComputeMs=elapsed,wholeClipCpuMs=cpu,processPeakRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss))
weights=source/'crepe'/f'model-{args.capacity}.h5'
result=dict(capacity=args.capacity,sourceCommit='c9b71ce61491454125a0693f584f7244f29d9884',weightsCommit='bb29b8d99a89924476d112d27ed470e4ac5617c0',weightsSha256=hashlib.sha256(weights.read_bytes()).hexdigest(),weightsBytes=weights.stat().st_size,parameters=int(model.count_params()),tensorflow=tf.__version__,python=sys.version.split()[0],loadMs=load_ms,warmupMs=warm_ms,windowMs=64,stepMs=10,center=False,viterbi=False,rows=rows)
out=Path('reports/crepe');out.mkdir(exist_ok=True);(out/f'{args.capacity}.json').write_text(json.dumps(result,indent=2)+'\n');print('Completed',args.capacity,'rows',len(rows),'loadMs',round(load_ms),'warmMs',round(warm_ms))
