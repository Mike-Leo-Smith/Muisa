import os
"""Experimental ONNX-only adapter; package metadata still requests unavailable TF on py312."""
import contextlib,hashlib,io,json,resource,time,sys,warnings,wave
from pathlib import Path
import basic_pitch,numpy as np,onnxruntime as ort,mir_eval
from basic_pitch import ICASSP_2022_MODEL_PATH
from basic_pitch.inference import Model,predict
from basic_pitch.constants import AUDIO_N_SAMPLES,AUDIO_SAMPLE_RATE,FFT_HOP
MODEL_HASH='2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec'
assert hashlib.sha256(ICASSP_2022_MODEL_PATH.read_bytes()).hexdigest()==MODEL_HASH
class ControlledOnnx(Model):
 def __init__(self,path):
  self.model_type=Model.MODEL_TYPES.ONNX
  options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
  self.model=ort.InferenceSession(str(path),sess_options=options,providers=['CPUExecutionProvider'])
t=time.perf_counter();model=ControlledOnnx(ICASSP_2022_MODEL_PATH);load_ms=(time.perf_counter()-t)*1000
root=Path(os.environ.get('MUISA_INPUT','reports/basic-pitch'));manifest=json.loads((root/'manifest.json').read_text())
with contextlib.redirect_stdout(io.StringIO()):
 t=time.perf_counter();predict(root/manifest['cases'][0]['file'],model);warm_ms=(time.perf_counter()-t)*1000
rows=[]
for case in manifest['cases']:
 path=root/case['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==case['sha256'];wall=[];cpu=[];warning_messages=set()
 for repeat in range(3):
  t=time.perf_counter();c=time.process_time()
  with contextlib.redirect_stdout(io.StringIO()),warnings.catch_warnings(record=True) as caught:
   warnings.simplefilter('always');outputs,midi,events=predict(path,model)
  warning_messages.update(str(w.message) for w in caught)
  assert all(np.all(np.isfinite(v)) for v in outputs.values()),'Nonfinite model output'
  wall.append((time.perf_counter()-t)*1000);cpu.append((time.process_time()-c)*1000)
 ref=np.array([[n['onsetMs']/1000,(n['onsetMs']+n['durationMs'])/1000] for n in case['notes']],dtype=float).reshape(-1,2);refp=np.array([440*2**((n['midi']-69)/12) for n in case['notes']]);order=np.argsort(ref[:,0]);ref=ref[order];refp=refp[order]
 est=np.array([[e[0],e[1]] for e in events],dtype=float).reshape(-1,2);estp=np.array([440*2**((int(e[2])-69)/12) for e in events]);order=np.argsort(est[:,0]);est=est[order];estp=estp[order]
 assert np.all(np.isfinite(est)) and np.all(np.isfinite(estp)), 'Nonfinite predicted notes'
 metrics={}
 if len(ref):
  for label,offset in [('onsetPitch',None),('onsetPitchOffset',.2)]:
   precision,recall,f1,overlap=mir_eval.transcription.precision_recall_f1_overlap(ref,refp,est,estp,onset_tolerance=.05,pitch_tolerance=50,offset_ratio=offset,offset_min_tolerance=.05)
   metrics[label]=dict(precision=float(precision),recall=float(recall),f1=float(f1),averageOverlap=float(overlap))
 else:
  with wave.open(str(path)) as wf:duration=wf.getnframes()/wf.getframerate()
  metrics.update(noReference=True,falseNotesPerMinute=len(est)*60/duration)
 midi.write(str(root/(case['id']+'.mid')))
 rows.append(dict(id=case['id'],warnings=sorted(warning_messages),inputSha256=case['sha256'],referenceCount=len(ref),predictedCount=len(est),metrics=metrics,wholeClipComputeMs=wall,wholeClipCpuMs=cpu,processPeakRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,predictions=[dict(onsetMs=float(e[0]*1000),durationMs=float((e[1]-e[0])*1000),midi=int(e[2]),modelAmplitude=float(e[3])) for e in events]))
result=dict(experiment='B1 Basic Pitch ONNX offline note transcription, synthetic only',python=sys.version.split()[0],basicPitch='0.4.0',onnxruntime=ort.__version__,mirEval=mir_eval.__version__,modelSha256=MODEL_HASH,modelBytes=ICASSP_2022_MODEL_PATH.stat().st_size,inputManifest=manifest,loadMs=load_ms,warmupMs=warm_ms,audioWindowSamples=AUDIO_N_SAMPLES,sampleRateHz=AUDIO_SAMPLE_RATE,frameHop=FFT_HOP,thresholds=dict(onset=.5,frame=.3,minNoteMs=127.7),threadLimits=dict(intra=2,inter=1),rows=rows)
Path(os.environ.get('MUISA_OUTPUT','experiments/basic-pitch/results.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps([{k:r[k] for k in ['id','referenceCount','predictedCount','metrics']} for r in rows],indent=2))
