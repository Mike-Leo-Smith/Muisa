"""Causal framed spectrum -> small frequency CNN -> causal TCN -> three logits heads."""
import math
import torch
from torch import nn
from torch.nn import functional as F
class TinyGuitar(nn.Module):
 def __init__(self,c):
  super().__init__();self.c=c;self.window=c['windowSamples'];self.hop=c['hopSamples'];self.context=2*sum(c['dilations'])
  t=torch.arange(self.window,dtype=torch.float32);k=torch.arange(self.window//2+1,dtype=torch.float32)[:,None];phase=2*math.pi*k*t/self.window;window=torch.hann_window(self.window,periodic=False)
  dft=torch.cat([torch.cos(phase),-torch.sin(phase)],0)*window/self.window;self.register_buffer('dft',dft[:,None,:]);self.bins=self.window//2+1
  self.encoder=nn.Sequential(nn.Conv1d(1,4,5,stride=4,padding=2),nn.ReLU(),nn.Conv1d(4,8,5,stride=4,padding=2),nn.ReLU(),nn.Flatten(),nn.Linear(8*33,c['channels']),nn.ReLU())
  self.tcn=nn.ModuleList([nn.Conv1d(c['channels'],c['channels'],3,dilation=d) for d in c['dilations']])
  self.head=nn.Conv1d(c['channels'],2+c['midiMax']-c['midiMin']+1,1)
 def states(self,batch):return torch.zeros(batch,1,self.window-self.hop),torch.zeros(batch,self.c['channels'],self.context)
 def forward(self,pcm,pcm_state,feature_state):
  history=torch.cat([pcm_state,pcm],-1);spectrum=F.conv1d(history,self.dft,stride=self.hop);magnitude=torch.sqrt(spectrum[:,:self.bins,:]**2+spectrum[:,self.bins:,:]**2+1e-12)
  logmag=torch.log1p(100*magnitude);b,_,steps=logmag.shape
  features=self.encoder(logmag.transpose(1,2).reshape(-1,1,self.bins)).reshape(b,steps,self.c['channels']).transpose(1,2)
  context=torch.cat([feature_state,features],-1);x=context
  for conv,d in zip(self.tcn,self.c['dilations']):x=F.relu(conv(F.pad(x,(2*d,0)))+x)
  logits=self.head(x[:,:,self.context:]).transpose(1,2)
  return logits,history[:,:,-(self.window-self.hop):],context[:,:,-self.context:]

def masked_loss(logits,labels,c):
 activity,onset,pitch=logits[:,:,0],logits[:,:,1],logits[:,:,2:]
 def select(values,target,mask):
  if mask.shape!=target.shape or values.shape[:2]!=mask.shape:raise ValueError('Loss label/mask shape mismatch')
  if not torch.isfinite(mask).all() or not ((mask==0)|(mask==1)).all():raise ValueError('Masks must be finite binary values')
  valid=mask.bool();return values[valid],target[valid]
 def binary(values,target,mask,positive_weight=None):
  values,target=select(values,target,mask)
  if not values.numel():return values.sum()*0
  if not torch.isfinite(target).all() or not ((target>=0)&(target<=1)).all():raise ValueError('Invalid supervised binary target')
  return F.binary_cross_entropy_with_logits(values,target,reduction='mean',pos_weight=positive_weight)
 values,target=select(pitch,labels['pitch'],labels['pitchMask'])
 if not target.numel():pitch_loss=values.sum()*0
 else:
  if not torch.isfinite(target).all() or not ((target>=0)&(target<pitch.shape[-1])&(target==target.round())).all():raise ValueError('Invalid supervised pitch class')
  pitch_loss=F.cross_entropy(values,target.long(),reduction='mean')
 losses={'activity':binary(activity,labels['activity'],labels['activityMask']),
 'onset':binary(onset,labels['onset'],labels['onsetMask'],torch.tensor(c['onsetPositiveWeight'],device=logits.device)),
 'pitch':pitch_loss}
 return sum(c['lossWeights'][k]*v for k,v in losses.items()),losses
