import numpy as np
def attack(x,at,rate=22050):
 # Trailing 1ms RMS; three preregistered thresholds, no detector predictions used.
 width=round(rate*.001);power=np.convolve(x*x,np.ones(width)/width,mode='full')[:len(x)]
 a=round(at*rate/1000);b=min(len(x),a+round(.15*rate));peak=float(np.max(power[a:b]));assert peak>1e-8
 times=[]
 for db in [-40,-30,-20]:
  found=np.flatnonzero(power[a:b]>=peak*10**(db/10));assert len(found)>0;times.append((a+int(found[0]))*1000/rate)
 return dict(method='trailing1msRMS relative to first150ms peak',thresholdsDb=[-40,-30,-20],thresholdOnsetsMs=times,onsetMs=times[1],lowerMs=min(times),upperMs=max(times),resolutionMs=1000/rate,smoothingMs=width*1000/rate)
