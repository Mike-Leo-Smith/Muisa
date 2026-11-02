"""Self-generated legal interface fixture; never a GuitarSet score."""
import json,math,struct,sys,wave
from pathlib import Path
from dataset import sha
root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True);id='00_BN1-120-C_solo';rate=44100;notes=[(.2,.7,60),(.7,.6,64),(1.6,.5,67)];samples=[]
for i in range(rate*3):
 t=i/rate;v=sum(.08*math.sin(2*math.pi*440*2**((m-69)/12)*(t-a)) for a,d,m in notes if a<=t<a+d);samples.append(round(v*32767))
path=root/(id+'_mic.wav')
with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(struct.pack('<'+'h'*len(samples),*samples))
annotations=[dict(namespace='note_midi',time=0,duration=3,data=([dict(time=notes[i][0],duration=notes[i][1],value=float(notes[i][2]),confidence=None)] if i<len(notes) else [])) for i in range(6)]
j=root/(id+'.jams');j.write_text(json.dumps(dict(file_metadata=dict(duration=3,title='Synthetic interface test'),annotations=annotations)))
index=dict(schema='muisa-r1-local-v1',license='self-generated, CC0',provenance='self-generated interface fixture, not GuitarSet',recordings=[dict(id=id,player='00',style='BN',mode='solo',wav=path.name,jams=j.name,wavSha256=sha(path),jamsSha256=sha(j))]);(root/'muisa-index.json').write_text(json.dumps(index,indent=2));print(root)
