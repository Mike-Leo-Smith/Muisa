import json,shutil
from pathlib import Path
m=json.loads(Path('reports/room/manifest.json').read_text());m.update(windowSize=4096,hopSize=512)
for kind in ['mono','all']:
 root=Path('reports/room')/kind;root.mkdir(exist_ok=True);cases=[]
 for c in m['cases']:
  if kind=='mono' and c['polyphonic']:continue
  shutil.copyfile(Path('reports/room')/c['file'],root/c['file'])
  c=dict(c);c['reference']=[];c['stable']=[]
  for start in range(0,c['frames']-4096+1,512):
   a=start/22050*1000;b=(start+4096)/22050*1000;center=(a+b)/2
   note=next((n for n in c['notes'] if n['onsetMs']<=center<n['onsetMs']+n['durationMs']),None)
   c['reference'].append(note['midi'] if note else None)
   c['stable'].append(a>=note['onsetMs'] and b<=note['onsetMs']+note['durationMs'] if note else not any(a<n['onsetMs']+n['durationMs'] and b>n['onsetMs'] for n in c['notes']))
  cases.append(c)
 (root/'manifest.json').write_text(json.dumps(dict(m,cases=cases),indent=2))
