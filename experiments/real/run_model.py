"""Serial, fixed-configuration model inference; local per-recording cache."""
import os
for key,value in {'TF_CPP_MIN_LOG_LEVEL':'2','TF_NUM_INTRAOP_THREADS':'2','TF_NUM_INTEROP_THREADS':'1','OMP_NUM_THREADS':'2'}.items():os.environ.setdefault(key,value)
import argparse,contextlib,io,json,resource,sys,time,warnings,subprocess
from pathlib import Path
import numpy as np
from dataset import CONFIG,sha
p=argparse.ArgumentParser();p.add_argument('--work',required=True);p.add_argument('--model',choices=['yin','crepe','basic'],required=True);p.add_argument('--crepe-source');a=p.parse_args()
work=Path(a.work);m=json.loads((work/'prepared.json').read_text());c=m['config'];assert m['configSha256']==sha(CONFIG),'Config changed; new preparation required'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==m['codeRevision'],'Checkout changed since preparation'
cache=work/a.model;cache.mkdir(exist_ok=True)
key=dict(configSha256=m['configSha256'],codeRevision=m['codeRevision'],model=a.model)
load=time.perf_counter()
if a.model=='yin':
 import librosa
 assert librosa.__version__=='0.11.0'
 model_id='librosa0.11.0-yin-pyin';common=dict(sr=c['sampleRateHz'],fmin=c['fminHz'],fmax=c['fmaxHz'],frame_length=c['pitchWindow'],hop_length=c['pitchHop'],center=False)
 warm=.2*np.sin(2*np.pi*220*np.arange(5000)/22050);librosa.yin(warm,**common);librosa.pyin(warm,**common)
elif a.model=='crepe':
 if not a.crepe_source:raise ValueError('--crepe-source required')
 source=Path(a.crepe_source).resolve();sys.path.insert(0,str(source));import crepe
 weights=source/'crepe/model-tiny.h5';model_id=sha(weights)
 assert model_id=='409254d6a537cc432061112b7ec5f6fd283658f108fc2abc24db9c25858b42df'
 crepe.core.build_and_load_model('tiny');crepe.predict(.2*np.sin(2*np.pi*220*np.arange(8000)/16000),16000,model_capacity='tiny',center=False,viterbi=False,verbose=0)
else:
 import onnxruntime as ort,basic_pitch
 from basic_pitch import ICASSP_2022_MODEL_PATH
 from basic_pitch.inference import Model,predict
 model_id=sha(ICASSP_2022_MODEL_PATH);assert model_id=='2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec'
 class Controlled(Model):
  def __init__(self):
   self.model_type=Model.MODEL_TYPES.ONNX;options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
   self.model=ort.InferenceSession(str(ICASSP_2022_MODEL_PATH),sess_options=options,providers=['CPUExecutionProvider'])
 model=Controlled()
load_ms=(time.perf_counter()-load)*1000
for r in m['recordings']:
 assert sha(work/r['pcmFile'])==r['pcmSha256'] and sha(work/r['modelWav'])==r['modelWavSha256']
 binding=dict(key,inputSha256=r['pcmSha256'],modelId=model_id);dest=cache/(r['id']+'.json')
 if dest.exists():
  if json.loads(dest.read_text()).get('binding')!=binding:raise ValueError('Stale cache: choose new work directory')
  print('Cached',a.model,r['id'],flush=True);continue
 x=np.fromfile(work/r['pcmFile'],dtype='<f4');start=time.perf_counter();cpu=time.process_time();caught_messages=[];result={}
 with warnings.catch_warnings(record=True) as caught:
  warnings.simplefilter('always')
  if a.model=='yin':
   f=librosa.yin(x,**common);pf,pv,_=librosa.pyin(x,**common);rms=np.array([np.sqrt(np.mean(x[i:i+c['pitchWindow']]**2)) for i in range(0,len(x)-c['pitchWindow']+1,c['pitchHop'])]);variants=[]
   for name,freq,mask in [('yin-native',f,np.ones(len(f),bool)),('yin-rms',f,rms>=c['yinRmsGate']),('pyin',pf,pv)]:
    midi=69+12*np.log2(freq/440);variants.append(dict(method=name,prediction=[float(v) if ok and np.isfinite(v) else None for v,ok in zip(midi,mask)]))
   result=dict(variants=variants,firstCenterMs=c['pitchWindow']/2/c['sampleRateHz']*1000,hopMs=c['pitchHop']/c['sampleRateHz']*1000,windowMs=c['pitchWindow']/c['sampleRateHz']*1000,causality='YIN independent windows; pYIN whole-clip noncausal HMM')
  elif a.model=='crepe':
   times,freq,confidence,_=crepe.predict(x,c['sampleRateHz'],model_capacity='tiny',center=False,viterbi=False,step_size=10,verbose=0);midi=69+12*np.log2(freq/440)
   result=dict(variants=[dict(method=f'crepe-tiny-{threshold}',prediction=[float(v) if q>=threshold and np.isfinite(v) else None for v,q in zip(midi,confidence)]) for threshold in c['crepeThresholds']],firstCenterMs=32,hopMs=10,windowMs=64,causality='Offline resampling/batched adapter; centerFalse is not end-to-end live validation')
  else:
   with contextlib.redirect_stdout(io.StringIO()):outputs,_,events=predict(work/r['modelWav'],model,onset_threshold=c['basicPitchOnsetThreshold'],frame_threshold=c['basicPitchFrameThreshold'],minimum_note_length=c['basicPitchMinimumNoteMs'])
   assert all(np.all(np.isfinite(v)) for v in outputs.values())
   result=dict(predictions=[dict(onsetMs=float(e[0]*1000),durationMs=float((e[1]-e[0])*1000),midi=int(e[2]),amplitude=float(e[3])) for e in events],windowMs=43844/22050*1000,causality='Whole-recording offline transcription; GuitarSet in training corpus')
  caught_messages=sorted(set(str(w.message) for w in caught))
 result.update(id=r['id'],binding=binding,wallMs=(time.perf_counter()-start)*1000,cpuMs=(time.process_time()-cpu)*1000,processPeakRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,loadAndWarmupMs=load_ms,startupScope='BasicPitch load only; first clip includes warmup' if a.model=='basic' else 'Import/load and synthetic warmup',warnings=caught_messages,python=sys.version.split()[0])
 temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n');temp.replace(dest);print('Completed',a.model,r['id'],round(result['wallMs']),'ms',flush=True)
