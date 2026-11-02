import numpy as np
RATE=22050
def acoustic_bounds(x,onset_ms,rate=RATE):
 width=round(rate*.001);p=np.convolve(x*x,np.ones(width)/width,mode='full')[:len(x)]
 start=round(onset_ms*rate/1000);peak=float(np.max(p[start:start+round(.15*rate)]));assert peak>1e-8
 starts=[];ends=[]
 for db in [-40,-30,-20]:
  hit=np.flatnonzero(p[start:]>=peak*10**(db/10));assert len(hit)
  starts.append((start+int(hit[0]))/rate*1000);ends.append((start+int(hit[-1])+1)/rate*1000)
 return dict(onsetMs=starts[1],offsetMs=ends[1],onsetBoundsMs=[min(starts),max(starts)],offsetBoundsMs=[min(ends),max(ends)],thresholdsDb=[-40,-30,-20],thresholdOnsetsMs=starts,thresholdOffsetsMs=ends,smoothingMs=width/rate*1000)
def grid_reference(notes,t):
 # Ambiguous boundary bands and simultaneous surviving stems are excluded.
 if any(n['onsetBoundsMs'][0]<=t<n['onsetBoundsMs'][1] or n['offsetBoundsMs'][0]<=t<n['offsetBoundsMs'][1] for n in notes):return None,False
 active=[n for n in notes if n['onsetBoundsMs'][1]<=t<n['offsetBoundsMs'][0]]
 return (active[0]['midi'],True) if len(active)==1 else (None,len(active)==0)
