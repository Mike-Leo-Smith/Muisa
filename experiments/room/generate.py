"""M1: pinned MIDI semantics -> FluidSynth dry PCM -> bounded shoebox ISM."""
import hashlib,json,sys,ctypes
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve
import mido,fluidsynth,pyroomacoustics as pra
RATE=22050; SEED=123; ROOT=Path('reports/room'); ROOT.mkdir(parents=True,exist_ok=True)
BANK=Path(sys.argv[1] if len(sys.argv)>1 else '/usr/share/sounds/sf2/TimGM6mb.sf2')
def digest(b): return hashlib.sha256(b).hexdigest()
def render(notes,path):
 midi=mido.MidiFile(ticks_per_beat=480);track=mido.MidiTrack();midi.tracks.append(track)
 track.append(mido.MetaMessage('set_tempo',tempo=500000,time=0));track.append(mido.Message('program_change',program=25,time=0))
 events=[]
 for n in notes:
  events.extend([(round(n['onsetMs']*.96),1,n),(round((n['onsetMs']+n['durationMs'])*.96),0,n)])
 last=0
 for tick,on,n in sorted(events,key=lambda e:(e[0],e[1],e[2]['midi'])):
  track.append(mido.Message('note_on' if on else 'note_off',note=n['midi'],velocity=n['velocity'] if on else 0,time=tick-last));last=tick
 midi.save(path)
 parsed=[];elapsed=0
 for msg in mido.MidiFile(path):
  elapsed+=msg.time
  if msg.type in ('note_on','note_off'):parsed.append((round(elapsed*1000),msg.type,msg.note))
 expected=[(round(tick/.96),'note_on' if on else 'note_off',n['midi']) for tick,on,n in sorted(events,key=lambda e:(e[0],e[1],e[2]['midi']))]
 assert parsed==expected,'MIDI tempo/event ordering mismatch'
 synth=fluidsynth.Synth(samplerate=RATE,gain=.6,**{'synth.reverb.active':0,'synth.chorus.active':0})
 sid=synth.sfload(str(BANK));assert sid>=0;synth.program_select(0,sid,0,25)
 chunks=[];position=0;t=0
 for msg in mido.MidiFile(path):
  t+=msg.time;sample=round(t*RATE)
  if sample>position:chunks.append(synth.get_samples(sample-position));position=sample
  if msg.type=='note_on':synth.noteon(0,msg.note,msg.velocity)
  elif msg.type=='note_off':synth.noteoff(0,msg.note)
 chunks.append(synth.get_samples(RATE));synth.delete()
 # Stereo mix is explicit and identical for all variants.
 return np.concatenate(chunks).reshape(-1,2).mean(axis=1)/32768
source=[1.2,1.3,1.2];mic=[1.7,1.3,1.2];dimension=[4,5,2.7]
room=pra.ShoeBox(dimension,fs=RATE,materials=pra.Material(.35),max_order=6,use_rand_ism=False,ray_tracing=False)
room.add_source(source);room.add_microphone(mic);room.compute_rir();rir=np.array(room.rir[0][0])
fir=int(pra.constants.get('frac_delay_length')//2);delay=np.linalg.norm(np.array(source)-mic)/room.c
# Verify direct-path localization independently, never use largest reflection peak as onset.
direct=pra.ShoeBox(dimension,fs=RATE,max_order=0);direct.add_source(source);direct.add_microphone(mic);direct.compute_rir()
assert abs(np.argmax(np.abs(direct.rir[0][0]))-fir-delay*RATE)<=1
assert np.allclose(fftconvolve(np.arange(10.),[1.]),np.arange(10.))
phrases={
 'separated':[dict(midi=p,onsetMs=200+i*700,durationMs=450,velocity=90) for i,p in enumerate([52,64,67])],
 'repeat-soft':[dict(midi=64,onsetMs=200+i*350,durationMs=350,velocity=v) for i,v in enumerate([45,65,90])],
 'triads':[dict(midi=p,onsetMs=t,durationMs=600,velocity=80) for t,ps in [(200,[48,52,55]),(1200,[55,59,62])] for p in ps]}
cases=[]
for phrase,notes in phrases.items():
 dry=render(notes,ROOT/(phrase+'.mid'));again=render(notes,ROOT/(phrase+'-repeat.mid'))
 assert np.array_equal(dry,again),'Renderer is not deterministic on this installation'
 for roomed in [False,True]:
  target=fftconvolve(dry,rir,mode='full') if roomed else dry.copy()
  assert len(target)==len(dry)+(len(rir)-1 if roomed else 0)
  shifted=[dict(n,scoreOnsetMs=n['onsetMs'],performedOnsetMs=n['onsetMs'],onsetMs=n['onsetMs']+(delay*1000+fir/RATE*1000 if roomed else 0),renderAttackMs=None) for n in notes]
  mask=np.zeros(len(target),dtype=bool)
  for n in shifted:mask[round(n['onsetMs']*RATE/1000):round((n['onsetMs']+n['durationMs'])*RATE/1000)]=True
  assert np.sum(target[mask]**2)>0
  for snr in [None,10]:
   noise=np.random.default_rng(SEED).normal(size=len(target));gain=0 if snr is None else np.sqrt(np.mean(target[mask]**2)/(np.mean(noise[mask]**2)*10**(snr/10)))
   noisy=target+noise*gain;peak=float(np.max(np.abs(noisy)));assert np.all(np.isfinite(noisy)) and peak<1,peak
   actual=None if snr is None else float(10*np.log10(np.mean(target[mask]**2)/np.mean((noise[mask]*gain)**2)))
   if snr is not None:assert abs(actual-snr)<1e-9
   id=f'{phrase}-'+('room' if roomed else 'dry')+('-clean' if snr is None else '-noise10');file=id+'.wav'
   wavfile.write(ROOT/file,RATE,np.round(noisy*32767).astype(np.int16))
   cases.append(dict(id=id,file=file,notes=shifted,sha256=digest((ROOT/file).read_bytes()),drySha256=digest(dry.tobytes()),midiSha256=digest((ROOT/(phrase+'.mid')).read_bytes()),groupId=phrase,split='development',polyphonic=phrase=='triads',sampleRateHz=RATE,frames=len(noisy),peak=peak,requestedSnrDb=snr,achievedSnrDb=actual,noiseGain=float(gain),seed=SEED,physicalDelayMs=delay*1000 if roomed else 0,algorithmicDelaySamples=fir if roomed else 0,captureDelayMs=0,roomFamily='shoebox-ism-order6' if roomed else 'bypass'))
major=ctypes.c_int();minor=ctypes.c_int();micro=ctypes.c_int();fluidsynth.fluid_version(ctypes.byref(major),ctypes.byref(minor),ctypes.byref(micro))
manifest=dict(experiment='M1 GM guitar MIDI and early reflections, not real guitar',sampleRateHz=RATE,bank=dict(name=BANK.name,sha256=digest(BANK.read_bytes()),bytes=BANK.stat().st_size,license='GPL-2; installed Debian timgm6mb-soundfont, no audio redistribution'),renderer=dict(name='FluidSynth',version=f'{major.value}.{minor.value}.{micro.value}',program=25,gain=.6,reverb=False,chorus=False),room=dict(packageVersion=pra.__version__,dimensionsM=dimension,sourceM=source,micM=mic,absorption=.35,maxOrder=6,rirSamples=len(rir),rirSha256=digest(rir.tobytes()),fractionalDelaySamples=fir,soundSpeed=room.c),cases=cases)
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');Path('experiments/room/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Validated {len(cases)} fixtures: MIDI rendering repeatability, full tail, delta identity, direct delay, finite/no clip, achieved SNR')
