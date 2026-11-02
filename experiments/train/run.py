"""Bounded single-batch CPU smoke training; exports own weights only."""
import argparse,hashlib,json,random,time,resource,subprocess
from pathlib import Path
import numpy as np
import torch
import onnx,onnxruntime as ort
from model import TinyGuitar,masked_loss
from data import toy_batch
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True);config_path=Path(__file__).with_name('config.json');c=json.loads(config_path.read_text())
assert c['device']=='cpu' and c['maxSteps']<=120 and c['maxTrainingSeconds']<=120 and c['threads']<=2
random.seed(c['seed']);np.random.seed(c['seed']);torch.manual_seed(c['seed']);torch.set_num_threads(c['threads']);torch.set_num_interop_threads(1);torch.use_deterministic_algorithms(True)
model=TinyGuitar(c);pcm,labels,source=toy_batch(c);optimizer=torch.optim.Adam(model.parameters(),lr=c['learningRate']);history=[];started=time.perf_counter()
with torch.no_grad():initial_y,*_=model(pcm,*model.states(len(pcm)));initial,parts=masked_loss(initial_y,labels,c);initial_parts={k:float(v) for k,v in parts.items()}
for step in range(c['maxSteps']):
 if time.perf_counter()-started>=c['maxTrainingSeconds']:break
 optimizer.zero_grad();y,*_=model(pcm,*model.states(len(pcm)));loss,parts=masked_loss(y,labels,c)
 if not torch.isfinite(loss):raise RuntimeError('Nonfinite training loss')
 loss.backward();norm=torch.nn.utils.clip_grad_norm_(model.parameters(),c['gradientClipNorm']);assert torch.isfinite(norm);optimizer.step()
 if step%20==0 or step==c['maxSteps']-1:history.append({'step':step+1,'lossBeforeUpdate':float(loss.detach()),'heads':{k:float(v.detach()) for k,v in parts.items()}})
train_seconds=time.perf_counter()-started;model.eval()
with torch.no_grad():final_y,*_=model(pcm,*model.states(len(pcm)));final,parts=masked_loss(final_y,labels,c);final_parts={k:float(v) for k,v in parts.items()}
torch.save(model.state_dict(),out/'smoke-weights.pt')
example=torch.zeros(1,1,c['hopSamples']);state=model.states(1)
torch.onnx.export(model,(example,*state),str(out/'model.onnx'),input_names=['pcm','pcm_state','feature_state'],output_names=['logits','next_pcm_state','next_feature_state'],dynamic_axes={'pcm':{0:'batch',2:'samples'},'pcm_state':{0:'batch'},'feature_state':{0:'batch'},'logits':{0:'batch',1:'frames'},'next_pcm_state':{0:'batch'},'next_feature_state':{0:'batch'}},opset_version=c['onnxOpset'],dynamo=False)
onnx.checker.check_model(str(out/'model.onnx'));options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;session=ort.InferenceSession(str(out/'model.onnx'),sess_options=options,providers=['CPUExecutionProvider']);pt_state=model.states(1);ort_state=[x.numpy().copy() for x in pt_state];rng=np.random.default_rng(c['seed']);errors=[]
for hops in [1,3,7,1,4]:
 x=rng.normal(0,.03,(1,1,c['hopSamples']*hops)).astype(np.float32)
 with torch.no_grad():pt=model(torch.from_numpy(x),*pt_state)
 ox=session.run(None,dict(pcm=x,pcm_state=ort_state[0],feature_state=ort_state[1]));error=[]
 for pv,ov in zip(pt,ox):np.testing.assert_allclose(ov,pv.numpy(),atol=c['exportAbsoluteTolerance'],rtol=c['exportRelativeTolerance']);error.append(float(np.max(np.abs(ov-pv.numpy()))))
 errors.append({'hops':hops,'maxAbsoluteErrorsLogitsPcmFeature':error});pt_state=pt[1:];ort_state=ox[1:]
report={'status':'synthetic-single-batch-training-smoke-only-not-recognition-improvement','codeRevision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'config':c,'configSha256':hashlib.sha256(config_path.read_bytes()).hexdigest(),'data':source,'parameters':sum(p.numel() for p in model.parameters()),'nonTrainableDftValues':model.dft.numel(),'trainingSteps':step+1 if len(history) and history[-1]['step']==step+1 else optimizer.state[next(iter(model.parameters()))]['step'].item(),'trainingWallSeconds':train_seconds,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'initialLoss':float(initial),'initialHeads':initial_parts,'finalLoss':float(final),'finalHeads':final_parts,'history':history,'onnxBytes':(out/'model.onnx').stat().st_size,'onnxSha256':hashlib.sha256((out/'model.onnx').read_bytes()).hexdigest(),'onnxStateChecks':errors,'versions':{'torch':torch.__version__,'onnx':onnx.__version__,'onnxruntime':ort.__version__},'limitations':['Training-batch loss only, no accuracy or holdout claim','No actual sampled or real-recorded guitar training yet','No fine F0 head; no poly pitch supervision','ONNX CPU checked; WASM and browser streaming untested','Fixed DFT export stores a large nontrainable matrix despite small learned parameter count','N1 inputs not used for training']}
(out/'results.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print(json.dumps({k:report[k] for k in ['parameters','trainingSteps','trainingWallSeconds','initialLoss','finalLoss','onnxBytes']},indent=2))
