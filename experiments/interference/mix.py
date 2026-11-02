"""Mix licensed real-waveform events with prepared source-specific RIRs.
Asset JSON is a list: id,kind(speech/keyboard/footstep),path(WAV),sha256,
sourceUrl,license,attribution. WAV conversions must be attributed as modifications.
"""
import argparse, hashlib, json, math
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve, resample_poly

def pcm(path,expected,rate):
 assert hashlib.sha256(path.read_bytes()).hexdigest()==expected, 'Asset hash mismatch'
 sr,x=wavfile.read(path)
 if x.dtype==np.int16:x=x.astype(float)/32768
 elif x.dtype==np.int32:x=x.astype(float)/2147483648
 elif x.dtype not in [np.float32,np.float64]:raise ValueError('Require PCM16/32 or float WAV')
 if x.ndim==2:x=x.mean(axis=1)
 assert np.all(np.isfinite(x)) and len(x)>0
 g=math.gcd(sr,rate);return resample_poly(x,rate//g,sr//g) if sr!=rate else x

def sir_measure(target,event,mask):
 if not np.any(mask):return None,'empty-region'
 tp=float(np.mean(target[mask]**2));ip=float(np.mean(event[mask]**2))
 if not np.isfinite(tp) or not np.isfinite(ip):return None,'nonfinite-energy'
 if tp<=0 or ip<=0:return None,'zero-energy'
 return float(10*np.log10(tp/ip)),None

def main():
 p=argparse.ArgumentParser();p.add_argument('scene');p.add_argument('assets');p.add_argument('output');a=p.parse_args();root=Path(a.scene);assetsPath=Path(a.assets);out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
 meta=json.loads((root/'scene.json').read_text());rate=meta['sampleRateHz'];assert hashlib.sha256((root/'sources.npz').read_bytes()).hexdigest()==meta['sourcesSha256']
 source=np.load(root/'sources.npz');assert all(np.all(np.isfinite(source[k])) for k in source.files), 'Nonfinite scene PCM/RIR';assets=json.loads(assetsPath.read_text());groups={k:[x for x in assets if x['kind']==k] for k in ['speech','keyboard','footstep']}
 assert len(groups['speech'])>=2 and groups['keyboard'] and groups['footstep'], 'Real speech, keyboard and footstep assets required; no placeholder substitution'
 for asset in assets:
  assert all(asset.get(k) for k in ['license','attribution','sourceUrl','sha256']), 'Missing provenance'
 rng=np.random.default_rng(123);target=fftconvolve(source['dry'],source['target'],mode='full');events=[]
 schedule=[(groups['speech'][0],1.0,3.0,'speech1',10),(groups['speech'][1],5.1,3.0,'speech2',10)]
 for i,t in enumerate(sorted(rng.uniform(.6,7.7,6))):
  kind='keyboard' if i%2==0 else 'footstep';asset=groups[kind][int(rng.integers(len(groups[kind])))];schedule.append((asset,float(t),1.0,kind,0))
 length=len(target)
 for asset,start,limit,key,sir in schedule:
  path=Path(asset['path']);path=path if path.is_absolute() else assetsPath.parent/path
  dry=pcm(path,asset['sha256'],rate)[:round(limit*rate)].copy();fade=min(round(.01*rate),len(dry)//2)
  if fade:dry[:fade]*=np.linspace(0,1,fade);dry[-fade:]*=np.linspace(1,0,fade)
  wet=fftconvolve(dry,source[key],mode='full');offset=round(start*rate);length=max(length,offset+len(wet));events.append((asset,start,key,sir,wet,offset,len(dry)/rate))
 target=np.pad(target,(0,length-len(target)));active=np.zeros(length,bool);delay=np.linalg.norm(np.array(meta['positionsMetres']['target'])-meta['microphoneMetres'])/meta['speedOfSound']+meta['fractionalDelaySamples']/rate
 for n in meta['notes']:active[round((n['onsetSeconds']+delay)*rate):round((n['onsetSeconds']+n['durationSeconds']+delay)*rate)]=True
 speech=np.zeros(length);transients=np.zeros(length);timeline=[]
 for asset,start,key,sir,wet,offset,duration in events:
  event=np.zeros(length);event[offset:offset+len(wet)]=wet;local=np.zeros(length,bool);local[offset:offset+len(wet)]=True;mask=active&local
  calibration=mask if asset['kind']=='speech' else local
  initial,problem=sir_measure(target,event,calibration)
  if problem:raise ValueError('Invalid calibration region for '+asset['id']+': '+problem)
  gain=float(10**((initial-sir)/20))
  if not np.isfinite(gain) or gain<=0:raise ValueError('Invalid calibration gain')
  event*=gain
  calibrated,calproblem=sir_measure(target,event,calibration)
  overlap,overlap_problem=sir_measure(target,event,mask)
  local_sir,local_problem=sir_measure(target,event,local)
  if calproblem:raise ValueError('Invalid calibrated energy: '+calproblem)
  if asset['kind']=='speech':speech+=event
  else:transients+=event
  timeline.append({'assetId':asset['id'],'kind':asset['kind'],'sourcePositionKey':key,'startSeconds':start,'excerptSeconds':duration,'renderedEndSeconds':(offset+len(wet))/rate,'sourceGain':gain,'calibrationRegion':'active-overlap' if asset['kind']=='speech' else 'event-local','requestedCalibrationSirDb':sir,'achievedCalibrationSirDb':calibrated,'achievedActiveOverlapSirDb':overlap,'activeOverlapDiagnostic':overlap_problem,'activeOverlapSamples':int(np.sum(mask)),'eventLocalSirDb':local_sir,'eventLocalDiagnostic':local_problem,'eventPeak':float(np.max(np.abs(event))),'modification':'excerpt from source start, mono/resample as needed, 10ms boundary fades, source-specific RIR and gain'})
 dry=np.pad(source['dry'],(0,length-len(source['dry'])));versions=[dry,target+speech,target+speech+transients];peak=max(float(np.max(np.abs(x))) for x in versions);scale=min(1,.9/peak);files=[]
 for name,x in zip(['01_Emily_dry.wav','02_Emily_room_readers.wav','03_Emily_room_readers_keyboard_steps.wav'],versions):
  x=x*scale;assert np.all(np.isfinite(x)) and np.max(np.abs(x))<1;wavfile.write(out/name,rate,np.round(x*32767).astype(np.int16));files.append({'filename':name,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),'seconds':len(x)/rate,'peak':float(np.max(np.abs(x)))})
 provenance=[{k:v for k,v in x.items() if k!='path'} for x in assets]
 combined,combined_problem=sir_measure(target,speech+transients,active)
 report={'scene':meta,'seed':123,'commonScale':scale,'independentNormalization':False,'events':timeline,'assets':provenance,'files':files,'combinedActiveSirDb':combined,'combinedActiveDiagnostic':combined_problem,'description':'Real reading/keyboard/footstep waveforms in a synthetic spatial scene, not a recorded conversation. Static source positions, no moving-source model. No noise reduction applied.'}
 (out/'manifest.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print(json.dumps(files,indent=2))
if __name__=='__main__':main()
