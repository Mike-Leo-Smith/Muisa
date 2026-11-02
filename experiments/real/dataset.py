"""Strict local dataset/JAMS adapter. Never downloads and never alters labels."""
import hashlib,json,math,re,wave
from pathlib import Path
CONFIG=Path(__file__).with_name('config.json')
def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for block in iter(lambda:f.read(1048576),b''):h.update(block)
 return h.hexdigest()
def safe_path(root,value):
 p=(root/value).resolve()
 if not p.is_relative_to(root.resolve()) or not p.is_file():raise ValueError('Missing or escaping dataset path: '+str(value))
 return p

def parse_jams(path,audio_duration):
 doc=json.loads(Path(path).read_text());annotations=doc.get('annotations')
 if not isinstance(annotations,list):raise ValueError('JAMS annotations must be an array')
 # Official GuitarSet reader prefers note_midi and falls back to pitch_midi.
 namespace='note_midi' if any(a.get('namespace')=='note_midi' for a in annotations) else 'pitch_midi'
 tracks=[a for a in annotations if a.get('namespace')==namespace]
 if not tracks:raise ValueError('No note_midi or pitch_midi annotation')
 notes=[];seen=set();warnings=[]
 for track_index,track in enumerate(tracks):
  if not isinstance(track.get('data'),list):raise ValueError('Note annotation data must be an array')
  if track.get('time',0) not in [0,0.0,None]:raise ValueError('Nonzero annotation origin requires explicit review')
  for row in track['data']:
   values=[row.get(k) for k in ['time','duration','value']]
   if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in values):raise ValueError('Invalid numeric JAMS note')
   t,d,m=values
   if t<0 or d<=0 or not 0<=m<=127 or t+d>audio_duration+.1:raise ValueError('JAMS note outside WAV time/pitch bounds')
   key=(track_index,t,d,m)
   if key in seen:raise ValueError('Exact duplicated annotation; review rather than silently deduplicate')
   seen.add(key);notes.append(dict(onsetMs=t*1000,durationMs=d*1000,midi=m,trackIndex=track_index,confidence=row.get('confidence')))
 notes.sort(key=lambda n:(n['onsetMs'],n['trackIndex'],n['midi']))
 if not notes:raise ValueError('Empty note annotation')
 if len(tracks)!=6:warnings.append(f'Expected six GuitarSet string tracks, found {len(tracks)}; inspect schema')
 duration=doc.get('file_metadata',{}).get('duration')
 if isinstance(duration,(int,float)) and abs(duration-audio_duration)>.1:warnings.append('JAMS file duration differs from WAV by >100ms')
 return notes,dict(namespace=namespace,trackCount=len(tracks),annotationCount=len(annotations),namespaces=sorted(set(a.get('namespace','') for a in annotations)),warnings=warnings)

def reference_grid(notes,duration_ms,config):
 grid=[];reference=[];eligible=[];reason=[]
 # Conservative common range supports JS/librosa 4096-window centers.
 for t in range(100,int(duration_ms-150),config['gridMs']):
  active=[n for n in notes if n['onsetMs']<=t<n['onsetMs']+n['durationMs']]
  boundary=any(min(abs(t-n['onsetMs']),abs(t-n['onsetMs']-n['durationMs']))<config['boundaryGuardMs'] for n in notes)
  label='boundary-guard' if boundary else 'polyphonic' if len(active)>1 else 'mono' if active else 'unvoiced'
  grid.append(t);reference.append(active[0]['midi'] if len(active)==1 else None);eligible.append(label in ['mono','unvoiced']);reason.append(label)
 return dict(gridMs=grid,reference=reference,eligible=eligible,reason=reason)

def load_index(dataset,index_path,config):
 root=Path(dataset).resolve();index=json.loads(Path(index_path).read_text())
 if index.get('schema')!='muisa-r1-local-v1' or not isinstance(index.get('recordings'),list):raise ValueError('Expected explicit muisa-r1-local-v1 index; see README')
 if not index.get('provenance') or not index.get('license'):raise ValueError('Dataset provenance and license required')
 seen=set();result=[]
 for item in index['recordings']:
  id=item['id']
  if not re.fullmatch(r'[A-Za-z0-9_#.+-]+',id) or id in seen:raise ValueError('Unsafe/duplicate recording id')
  seen.add(id)
  if id in config['excludedRecordings']:raise ValueError('Known GuitarSet erratum explicitly excluded: '+id)
  for field in ['player','style','mode']:
   if not isinstance(item.get(field),str) or not item[field]:raise ValueError('Missing grouping field: '+field)
  if not re.fullmatch(r'0[0-5]',item['player']) or not re.fullmatch(r'[A-Za-z]+',item['style']):raise ValueError('Invalid anonymized GuitarSet grouping fields')
  if item['mode'] not in ['solo','comp']:raise ValueError('mode must be solo/comp')
  wav=safe_path(root,item['wav']);jams=safe_path(root,item['jams'])
  for p,field in [(wav,'wavSha256'),(jams,'jamsSha256')]:
   if not re.fullmatch('[0-9a-f]{64}',item.get(field,'')) or sha(p)!=item[field]:raise ValueError('SHA256 mismatch: '+p.name)
  with wave.open(str(wav)) as w:
   if w.getnchannels()!=1 or w.getsampwidth()!=2 or w.getcomptype()!='NONE':raise ValueError('Expected mono PCM16 WAV; no implicit channel/downmix conversion')
   rate=w.getframerate();frames=w.getnframes();duration=frames/rate
  notes,schema=parse_jams(jams,duration)
  result.append(dict(item,sourceRateHz=rate,sourceFrames=frames,durationSeconds=duration,notes=notes,jamsSchema=schema))
 return result,index
