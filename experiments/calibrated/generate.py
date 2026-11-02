import hashlib,json
from pathlib import Path
import numpy as np,pyroomacoustics as pra
from scipy.io import wavfile
from scipy.signal import fftconvolve
from labels import acoustic_bounds,grid_reference
RATE=22050;out=Path('reports/calibrated');out.mkdir(exist_ok=True);old=Path('reports/sampled');m=json.loads((old/'manifest.json').read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(path):
 rate,x=wavfile.read(path);assert rate==RATE and x.dtype==np.int16
 return (x.mean(axis=1) if x.ndim==2 else x.astype(float))/32768
room=pra.ShoeBox([4,5,2.7],fs=RATE,materials=pra.Material(.35),max_order=6,use_rand_ism=False,ray_tracing=False);room.add_source([1.2,1.3,1.2]);room.add_microphone([1.7,1.3,1.2]);room.compute_rir();rir=np.asarray(room.rir[0][0]);fir=int(pra.constants.get('frac_delay_length')//2)
calibrations={};cases=[]
for rr in [1,2]:
 for velocity in [35,90]:
  name=f'rr{rr}-v{velocity}';dry=read(old/(name+'-render.wav'))
  for roomed in [False,True]:
   target=fftconvolve(dry,rir,mode='full') if roomed else dry.copy();source=[];mic=[]
   for i,midi in enumerate([52,64,67]):
    stem=read(old/f'cal-{rr}-{velocity}-{midi}.wav');stem_mic=fftconvolve(stem,rir,mode='full') if roomed else stem
    labels=[]
    for kind,x in [('source',stem),('microphone',stem_mic)]:
     b=acoustic_bounds(x,300);calibrations[f'{rr}-{velocity}-{midi}-{roomed}-{kind}']=dict(b,midiOnsetMs=300,midiOffsetMs=750)
     shift=i*700
     b={k:([v[0]+shift,v[1]+shift] if k.endswith('BoundsMs') else v+shift if k in ['onsetMs','offsetMs'] else v) for k,v in b.items()}
     # Per-note calibration retains full threshold times in the separate table.
     labels.append(dict(midi=midi,onsetMs=b['onsetMs'],offsetMs=b['offsetMs'],durationMs=b['offsetMs']-b['onsetMs'],onsetBoundsMs=b['onsetBoundsMs'],offsetBoundsMs=b['offsetBoundsMs'],midiOnsetMs=300+shift,midiOffsetMs=750+shift))
    source.append(labels[0]);mic.append(labels[1])
   mask=np.zeros(len(target),bool)
   for n in mic:mask[round(n['onsetBoundsMs'][1]/1000*RATE):round(n['offsetBoundsMs'][0]/1000*RATE)]=True
   energy=float(np.mean(target[mask]**2));assert energy>0
   for level in ['physical','equal-rms']:
    scale=1 if level=='physical' else .03/np.sqrt(energy);clean=target*scale
    for snr in [None,10]:
     noise=np.random.default_rng(123).normal(size=len(clean));gain=0 if snr is None else np.sqrt(np.mean(clean[mask]**2)/(np.mean(noise[mask]**2)*10**(snr/10)));x=clean+gain*noise
     assert np.all(np.isfinite(x)) and np.max(np.abs(x))<1
     achieved=None if snr is None else float(10*np.log10(np.mean(clean[mask]**2)/np.mean((gain*noise[mask])**2)))
     if snr is not None:assert abs(achieved-snr)<1e-9
     id=f'{name}-'+('room' if roomed else 'dry')+f'-{level}-'+('clean' if snr is None else 'noise10');path=out/(id+'.wav');wavfile.write(path,RATE,np.round(x*32767).astype(np.int16))
     grid=np.arange(100,len(x)/RATE*1000-150,10).tolist();refs={}
     for kind,notes in [('source',source),('microphone',mic)]:
      rr0=[grid_reference(notes,t) for t in grid];refs[kind]=dict(reference=[v[0] for v in rr0],eligible=[v[1] for v in rr0],eligibleCount=sum(v[1] for v in rr0),excludedCount=sum(not v[1] for v in rr0))
     cases.append(dict(id=id,file=path.name,sha256=sha(path),originalRenderSha256=sha(old/(name+'-render.wav')),levelMode=level,levelGain=float(scale),activeTargetRmsBefore=float(np.sqrt(energy)),activeTargetRmsAfter=float(np.sqrt(np.mean(clean[mask]**2))),requestedSnrDb=snr,achievedSnrDb=achieved,noiseGain=float(gain),seed=123,notes=mic,sourceNotes=source,frames=len(x),sampleRateHz=RATE,gridMs=grid,referenceGrids=refs,roomed=roomed,physicalDelayMs=.5/room.c*1000 if roomed else 0,algorithmicDelaySamples=fir if roomed else 0,groupId=name,split='development'))
result=dict(experiment='M3 paired physical/equal-RMS and source/microphone acoustic proxies',sampleRateHz=RATE,bankCommit=m['bankCommit'],rendererSha256=m['rendererSha256'],calibrations=calibrations,cases=cases)
(out/'manifest.json').write_text(json.dumps(result,indent=2)+'\n');Path('experiments/calibrated/manifest.json').write_text(json.dumps({k:v for k,v in result.items() if k!='cases'}|{'cases':[{k:v for k,v in c.items() if k not in ['gridMs','referenceGrids']} for c in cases]},indent=2)+'\n')
print('Generated32 physical/equal-RMS fixtures; source/microphone grid masks fixed')
