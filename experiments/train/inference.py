"""Validated CPU ONNX host interface; does not modify or retrain the graph."""
import hashlib
from pathlib import Path
import numpy as np
import onnxruntime as ort
class OrtStream:
 def __init__(self,path,config,expected_sha256,batch=1):
  if hashlib.sha256(Path(path).read_bytes()).hexdigest()!=expected_sha256:raise ValueError('Model SHA256 mismatch')
  self.c=config;self.batch=batch;options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;self.session=ort.InferenceSession(str(path),sess_options=options,providers=['CPUExecutionProvider']);self.reset()
 def reset(self):
  self.pcm_state=np.zeros((self.batch,1,self.c['windowSamples']-self.c['hopSamples']),np.float32);self.feature_state=np.zeros((self.batch,self.c['channels'],2*sum(self.c['dilations'])),np.float32);self.samples_seen=0
 def push(self,pcm):
  hop=self.c['hopSamples']
  if not isinstance(pcm,np.ndarray) or pcm.dtype!=np.float32 or pcm.ndim!=3 or pcm.shape[:2]!=(self.batch,1) or pcm.shape[-1]<=0 or pcm.shape[-1]%hop:raise ValueError('PCM must be float32[B,1,L] with positive hop-multiple L')
  if not np.isfinite(pcm).all():raise ValueError('Nonfinite PCM')
  logits,ps,fs=self.session.run(['logits','next_pcm_state','next_feature_state'],dict(pcm=pcm,pcm_state=self.pcm_state,feature_state=self.feature_state))
  if logits.shape!=(self.batch,pcm.shape[-1]//hop,2+self.c['midiMax']-self.c['midiMin']+1) or ps.shape!=self.pcm_state.shape or fs.shape!=self.feature_state.shape or not all(np.isfinite(x).all() for x in [logits,ps,fs]):raise ValueError('Invalid ONNX output/state')
  ends=self.samples_seen+np.arange(1,logits.shape[1]+1)*hop;self.samples_seen+=pcm.shape[-1];self.pcm_state=ps;self.feature_state=fs
  return dict(logits=logits,frameEndSamples=ends,validWarmup=ends>=self.c['windowSamples'])
