"""Prepare genuine sampled-guitar phrase and separate source RIRs, no interference download."""
import argparse, hashlib, json, subprocess
from pathlib import Path
import mido, numpy as np, pyroomacoustics as pra
from scipy.io import wavfile
p=argparse.ArgumentParser();p.add_argument('sfz');p.add_argument('renderer');p.add_argument('output');a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
rate=22050;notes=[];track=mido.MidiTrack();mid=mido.MidiFile(ticks_per_beat=480);mid.tracks.append(track);track.append(mido.MetaMessage('set_tempo',tempo=500000));events=[]
for i,pitch in enumerate([52,55,59,64,67,64,59,55,52,59,64,52]):
 n={'midi':pitch,'onsetSeconds':.4+i*.65,'durationSeconds':.48 if i<11 else .9,'velocity':[78,85,90,82][i%4]};notes.append(n)
 for on,t in [(1,n['onsetSeconds']),(0,n['onsetSeconds']+n['durationSeconds'])]:events.append((round(t*960),on,n))
last=0
for tick,on,n in sorted(events,key=lambda e:(e[0],e[1])):
 track.append(mido.Message('note_on' if on else 'note_off',note=n['midi'],velocity=n['velocity'] if on else 0,time=tick-last));last=tick
track.append(mido.MetaMessage('end_of_track',time=960));mid.save(out/'phrase.mid')
subprocess.run([a.renderer,'--sfz',a.sfz,'--midi',str(out/'phrase.mid'),'--wav',str(out/'render-stereo.wav'),'--samplerate',str(rate),'--blocksize','256'],check=True,timeout=30,stdout=subprocess.DEVNULL)
sr,raw=wavfile.read(out/'render-stereo.wav');assert sr==rate and raw.dtype==np.int16
assert np.max(np.abs(raw[-256:].astype(float)))<=2 and np.max(np.abs(raw.astype(float)))<32767
dry=raw.astype(float).mean(axis=1)/32768
positions={'target':[1.2,1.3,1.2],'speech1':[3.1,2.2,1.5],'speech2':[.7,3.5,1.5],'keyboard':[2,1.2,.8],'footstep':[2.6,2.8,.1]};mic=[1.7,1.3,1.2]
room=pra.ShoeBox([4,5,2.7],fs=rate,materials=pra.Material(.35),max_order=6,use_rand_ism=False,ray_tracing=False)
for pos in positions.values():room.add_source(pos)
room.add_microphone(mic);room.compute_rir()
arrays={'dry':dry};arrays.update({key:np.asarray(room.rir[0][i]) for i,key in enumerate(positions)})
np.savez(out/'sources.npz',**arrays)
meta={'sampleRateHz':rate,'instrument':'CC0 Karoryfer Emily, controlled rr1 sampled electric guitar','bankCommit':'b4920dc662fd9cad6dcaccdeecffdd91c8725d8c','renderer':'sfizz 1.2.3 natural power-tail termination, no --use-eot','notes':notes,'positionsMetres':positions,'microphoneMetres':mic,'roomMetres':[4,5,2.7],'absorption':.35,'ismOrder':6,'fractionalDelaySamples':int(pra.constants.get('frac_delay_length')//2),'speedOfSound':room.c,'drySeconds':len(dry)/rate,'sourcesSha256':hashlib.sha256((out/'sources.npz').read_bytes()).hexdigest(),'limitation':'Synthetic scene and selected sampled instrument; not a real conversation or physical-guitar validation.'}
(out/'scene.json').write_text(json.dumps(meta,indent=2)+'\n');print('Prepared phrase',len(dry)/rate,'seconds')
