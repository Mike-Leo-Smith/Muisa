"""Controlled Emily RR subset; measured attack proxies remain separate from MIDI."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
from calibration import attack
import mido,numpy as np,pyroomacoustics as pra
from scipy.io import wavfile
from scipy.signal import fftconvolve
parser=argparse.ArgumentParser();parser.add_argument('bank');parser.add_argument('renderer');args=parser.parse_args()
bank=Path(args.bank).resolve();renderer=Path(args.renderer).resolve();out=Path('reports/sampled');out.mkdir(parents=True,exist_ok=True)
rate=22050
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert subprocess.check_output(['git','-C',str(bank),'rev-parse','HEAD'],text=True).strip()=='b4920dc662fd9cad6dcaccdeecffdd91c8725d8c'
assert 'CC0 1.0 Universal' in (bank/'LICENSE').read_text()
original=(bank/'emily_clean.sfz').read_text();selected={};sfzs={}
for rr in [1,2]:
 groups=[];paths=[]
 for group in original.split('<group>')[1:]:
  parts=group.split('<region>');header=parts[0];regions=[]
  for body in parts[1:]:
   match=re.search(r'sample=(\S+)',body)
   if match and match[1].startswith('notes\\') and match[1].endswith(f'_rr{rr}.wav'):
    body=re.sub(r'(?m)^\s*[lh]irand=.*$','',body);body=re.sub(r'(?m)^\s*lorand=.*$','',body)
    body=body.replace('\\','/');regions.append('<region>\n'+body);paths.append(match[1].replace('\\','/'))
  if regions:groups.append('<group>\n'+header+''.join(regions))
 sfz=out/f'controlled-rr{rr}.sfz';sfz.write_text('<control> default_path='+str(bank)+'/'+'\n'+''.join(groups));sfzs[rr]=sfz
 selected[rr]=[dict(file=p,sha256=sha(bank/p),bytes=(bank/p).stat().st_size) for p in paths]
def render(notes,path,rr):
 mid=mido.MidiFile(ticks_per_beat=480);track=mido.MidiTrack();mid.tracks.append(track);track.append(mido.MetaMessage('set_tempo',tempo=500000));ev=[]
 for n in notes:
  ev.extend([(round(n['onsetMs']*.96),1,n),(round((n['onsetMs']+n['durationMs'])*.96),0,n)])
 last=0
 for tick,on,n in sorted(ev,key=lambda e:(e[0],e[1])):
  track.append(mido.Message('note_on' if on else 'note_off',note=n['midi'],velocity=n['velocity'] if on else 0,time=tick-last));last=tick
 track.append(mido.MetaMessage('end_of_track',time=960));mid.save(path.with_suffix('.mid'))
 subprocess.run([str(renderer),'--sfz',str(sfzs[rr]),'--midi',str(path.with_suffix('.mid')),'--wav',str(path),'--samplerate',str(rate),'--blocksize','256'],check=True,timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 sr,x=wavfile.read(path);assert sr==rate and x.dtype==np.int16;assert np.max(np.abs(x.astype(float)))<32767
 assert len(x)/rate>=max((n['onsetMs']+n['durationMs'])/1000 for n in notes)
 assert np.max(np.abs(x[-256:].astype(np.int32)))<=2, 'Natural release did not decay; do not pad or silently truncate'
 return x.mean(axis=1)/32768

calibration={}
for rr in [1,2]:
 for velocity in [35,90]:
  for midi in [52,64,67]:
   name=f'cal-{rr}-{velocity}-{midi}';n=dict(midi=midi,velocity=velocity,onsetMs=300,durationMs=450)
   x=render([n],out/(name+'.wav'),rr);calibration[name]=dict(midi=midi,velocity=velocity,rr=rr,midiOnsetMs=300,rendered=attack(x,300),wavSha256=sha(out/(name+'.wav')))
room=pra.ShoeBox([4,5,2.7],fs=rate,materials=pra.Material(.35),max_order=6,use_rand_ism=False,ray_tracing=False);room.add_source([1.2,1.3,1.2]);room.add_microphone([1.7,1.3,1.2]);room.compute_rir();rir=np.asarray(room.rir[0][0]);fir=int(pra.constants.get('frac_delay_length')//2);prop=.5/room.c*1000
cases=[]
for rr in [1,2]:
 for velocity in [35,90]:
  notes=[dict(midi=p,velocity=velocity,onsetMs=300+i*700,durationMs=450) for i,p in enumerate([52,64,67])]
  name=f'rr{rr}-v{velocity}';dry=render(notes,out/(name+'-render.wav'),rr);again=render(notes,out/(name+'-repeat.wav'),rr);assert np.array_equal(dry,again)
  for roomed in [False,True]:
   target=fftconvolve(dry,rir,mode='full') if roomed else dry.copy();delay=prop+fir/rate*1000 if roomed else 0;labels=[]
   for n in notes:
    cal=calibration[f'cal-{rr}-{velocity}-{n["midi"]}']['rendered'];offset=cal['onsetMs']-300
    labels.append(dict(n,midiOnsetMs=n['onsetMs'],onsetMs=n['onsetMs']+delay,acousticOnsetMs=n['onsetMs']+offset+delay,acousticBoundsMs=[n['onsetMs']+cal['lowerMs']-300+delay,n['onsetMs']+cal['upperMs']-300+delay],offsetLabel='MIDI gate end; acoustic release unlabelled'))
   mask=np.zeros(len(target),dtype=bool)
   for n in labels:mask[round(n['acousticOnsetMs']*rate/1000):round((n['onsetMs']+n['durationMs'])*rate/1000)]=True
   for snr in [None,10]:
    noise=np.random.default_rng(123).normal(size=len(target));gain=0 if snr is None else np.sqrt(np.mean(target[mask]**2)/(np.mean(noise[mask]**2)*10**(snr/10)))
    x=target+gain*noise;assert np.all(np.isfinite(x)) and np.max(np.abs(x))<1
    actual=None if snr is None else float(10*np.log10(np.mean(target[mask]**2)/np.mean((gain*noise[mask])**2)))
    if snr is not None:assert abs(actual-snr)<1e-9
    id=name+('-room' if roomed else '-dry')+('-clean' if snr is None else '-noise10');path=out/(id+'.wav');wavfile.write(path,rate,np.round(x*32767).astype(np.int16))
    cases.append(dict(id=id,file=path.name,sha256=sha(path),notes=labels,frames=len(x),sampleRateHz=rate,rr=rr,velocity=velocity,roomed=roomed,physicalDelayMs=prop if roomed else 0,algorithmicDelaySamples=fir if roomed else 0,requestedSnrDb=snr,achievedSnrDb=actual,noiseGain=float(gain),seed=123,peak=float(np.max(np.abs(x))),groupId=name,split='development'))
manifest=dict(experiment='M2 controlled Emily sample branches; attack proxies, not hand-labelled ground truth',bankCommit='b4920dc662fd9cad6dcaccdeecffdd91c8725d8c',bankLicense='CC0-1.0',rendererVersion='sfizz 1.2.3 archived offline tool',rendererSha256=sha(renderer),originalSfzSha256=sha(bank/'emily_clean.sfz'),sampleRateHz=rate,selectedSamples=selected,calibration=calibration,cases=cases)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');Path('experiments/sampled/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Generated 16 paired fixtures with 12 isolated attack calibrations')
