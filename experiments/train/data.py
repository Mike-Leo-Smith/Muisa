"""Explicit mathematical pipeline test only: no claim of speech/real-guitar performance."""
import math
import torch

def toy_batch(c):
 gen=torch.Generator().manual_seed(c['seed']);rate=c['sampleRateHz'];length=round(c['clipSeconds']*rate);steps=length//c['hopSamples'];pcm=torch.zeros(c['batchSize'],1,length)
 labels={k:torch.zeros(c['batchSize'],steps) for k in ['activity','onset','activityMask','onsetMask','pitchMask']};labels['pitch']=torch.zeros(c['batchSize'],steps,dtype=torch.long)
 ends=torch.arange(1,steps+1)*c['hopSamples'];valid=ends>=c['windowSamples'];notes=[]
 for b in range(c['batchSize']):
  pcm[b,0]=torch.randn(length,generator=gen)*.0005;sequence=[]
  if b<c['batchSize']-1:
   for i,midi in enumerate([[40,45,50],[55,59,64],[64,65,67]][b]):
    start=round((.15+i*.6)*rate);stop=start+round(.38*rate);t=torch.arange(stop-start)/rate;f=440*2**((midi-69)/12);wave=sum(torch.sin(2*math.pi*f*h*t)/h for h in [1,2,3]);envelope=torch.ones(len(t));ramp=80;envelope[:ramp]=torch.linspace(0,1,ramp);envelope[-ramp:]=torch.linspace(1,0,ramp);pcm[b,0,start:stop]+=.1*wave*envelope
    activity=(ends>start)&(ends<=stop);stable=activity&(ends-start>=c['windowSamples']);labels['activity'][b,activity]=1;labels['pitch'][b,stable]=midi-c['midiMin'];labels['pitchMask'][b,stable]=1
    onset_index=math.ceil(start/c['hopSamples'])-1;labels['onset'][b,onset_index]=1;sequence.append({'midi':midi,'startSample':start,'endSample':stop})
  labels['activityMask'][b]=valid;labels['onsetMask'][b]=valid;notes.append(sequence)
 return pcm,labels,{'source':'self-generated harmonic PCM, not high-fidelity instrument or speech','split':'training-smoke-only','notes':notes,'clipSamples':length}
