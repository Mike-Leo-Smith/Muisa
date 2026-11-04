"""Bound local corpus audit/freeze. No download, inference, training or split randomization."""
import argparse,hashlib,json,math,struct,wave,zipfile,sys
from array import array
from pathlib import Path
HERE=Path(__file__).resolve().parent
CONFIG=HERE/'config.json'
def sha(data):return hashlib.sha256(data).hexdigest()
def fail(condition,message):
 if not condition:raise ValueError(message)
def local(root,value):
 p=Path(value);base=Path(root).resolve();f=(base/p).resolve()
 fail(not p.is_absolute() and '..' not in p.parts and f.is_relative_to(base) and f.is_file(),'Unsafe/missing local file')
 return f

def audit(doc,root):
 config=json.loads(CONFIG.read_text());fail(doc.get('schema')=='muisa-chord-corpus-v1','Unsupported manifest')
 fail(isinstance(doc.get('recordings'),list) and doc['recordings'],'Empty recordings')
 rows=[];seen=set();groups={};coverage={};performers=set()
 for r in doc['recordings']:
  fail(isinstance(r['id'],str) and r['id'] and r['id'] not in seen,'Duplicate recording');seen.add(r['id'])
  split=r['split'];fail(split in ('development','heldout'),'Invalid split')
  fail(type(r.get('previouslyEvaluated')) is bool,'Explicit evaluation history required')
  fail(not(split=='heldout' and r['previouslyEvaluated']),'Observed recording cannot be held out')
  for k in ('performerId','sessionId','performanceId','datasetId'):
   fail(isinstance(r.get(k),str) and r[k].strip(),'Missing grouping '+k)
  fail(type(r.get('performerIdentityVerified')) is bool,'Performer verification flag required')
  fail(split!='heldout' or r['performerIdentityVerified'],'Unverified performer cannot establish independent holdout')
  fail(not r['performerIdentityVerified'] or (isinstance(r.get('performerEvidence'),str) and r['performerEvidence'].strip()),'Verified identity requires source evidence')
  fail(all(isinstance(r['license'].get(k),str) and r['license'][k] for k in ('id','sourceUrl','attribution')),'Missing license evidence')
  f=local(root,r['audio']['path']);data=f.read_bytes();fail(sha(data)==r['audio']['sha256'],'Audio hash mismatch')
  with wave.open(str(f)) as w:
   fail(w.getcomptype()=='NONE' and w.getsampwidth()==2,'Initial adapter supports PCM16 WAV only, explicit conversion required for other encodings')
   rate,n,channels=w.getframerate(),w.getnframes(),w.getnchannels()
   fail(rate>0 and n>0 and n/rate<=120,'Invalid/oversized recording')
   channel=r['audio']['channel'];fail(type(channel) is int and 0<=channel<channels,'Explicit valid channel required')
  fail(r['audio']['sampleRateHz']==rate and r['audio']['samples']==n and r['audio']['channels']==channels,'WAV metadata mismatch')
  for key in [('performer',r['performerId']),('session',r['sessionId']),('performance',r['performanceId']),('audioHash',r['audio']['sha256'])]:
   fail(key not in groups or groups[key]==split,'Cross-split performer/session/performance/audio leakage');groups[key]=split
  if r['performerIdentityVerified']:performers.add(r['performerId'])
  labelpath=local(root,r['annotation']['path']);lb=labelpath.read_bytes();fail(sha(lb)==r['annotation']['sha256'],'Annotation hash mismatch');labels=json.loads(lb)
  fail(labels['binding']==dict(audioSha256=r['audio']['sha256'],sampleRateHz=rate,samples=n,channel=channel),'Annotation audio binding mismatch')
  fail(labels.get('timeBasis')=='clip-local-seconds','Unknown time mapping; correct source offsets explicitly before import')
  fail(isinstance(labels.get('reviewerId'),str) and labels['reviewerId'],'Review identity required')
  segments=labels['segments'];fail(isinstance(segments,list),'Invalid segments');end=0
  totals=coverage.setdefault(split,{k:0. for k in config['targets']+['N','OOV','X']})
  for s in segments:
   a,b=s['start'],s['end'];fail(all(type(v) in (int,float) and math.isfinite(v) for v in (a,b)) and 0<=a<b<=n/rate+1e-9 and a>=end,'Overlapping/out-of-range segments');end=b
   fail(s['label'] in config['targets']+['N','OOV','X'],'Use explicit canonical label or N/OOV/X')
   fail(type(s.get('audited')) is bool and isinstance(s.get('basis'),str) and s['basis'],'Explicit label review/basis required')
   fail(type(s.get('uncertaintySeconds')) in (float,int) and math.isfinite(s['uncertaintySeconds']) and s['uncertaintySeconds']>=0,'Invalid alignment uncertainty')
   fail(s['uncertaintySeconds']<=config['boundaryGuardSeconds'] or s['label']=='X','Alignment uncertainty exceeds frozen guard')
   fail(s['label']=='X' or s['audited'],'Unaudited chord/name/energy-gate labels must stay X')
   if s['label']=='OOV':fail(isinstance(s.get('rawLabel'),str) and s['rawLabel'],'OOV original quality required')
   if s['audited']:
    totals[s['label']]+=max(0,b-a-2*config['boundaryGuardSeconds']-config['windowSamples']/config['analysisSampleRateHz'])
  rows.append(dict(id=r['id'],split=split,performerId=r['performerId'],sessionId=r['sessionId'],performanceId=r['performanceId'],audioPath=r['audio']['path'],audioSha256=r['audio']['sha256'],annotationSha256=r['annotation']['sha256'],sampleRateHz=rate,samples=n,channel=channel,segments=segments,seconds=n/rate))
 missing=[]
 for split in ('development','heldout'):
  c=coverage.get(split,{})
  for label in config['targets']+['N','OOV']:
   minimum=config['minimumReviewedSecondsPerTarget'] if label in config['targets'] else config['minimumReviewedNoChordSeconds'] if label=='N' else config['minimumReviewedOovSeconds']
   if c.get(label,0)<minimum:missing.append(split+':'+label)
 if len(performers)<config['minimumDistinctPerformers']:missing.append('verified-distinct-performers')
 return dict(schema='muisa-chord-corpus-audit-v1',configSha256=sha(CONFIG.read_bytes()),recordings=rows,conservativeStableSeconds=coverage,missingCoverage=missing,readyToFreeze=not missing,inferenceRun=False)

def freeze(manifest,root,out):
 p=Path(manifest);doc=json.loads(p.read_text());report=audit(doc,root)
 fail(report['readyToFreeze'],'Coverage/independent-performer requirements incomplete: '+','.join(report['missingCoverage']))
 versions=dict(numpy=None,scipy=None)
 prepared_hashes={}
 target=Path(out);target.mkdir(parents=True,exist_ok=False)
 for i,r in enumerate(report['recordings']):
  with wave.open(str(local(root,r['audioPath']))) as w:
   channels=w.getnchannels();samples=array('h');samples.frombytes(w.readframes(w.getnframes()))
   if sys.byteorder!='little':samples.byteswap()
  channel=samples[r['channel']::channels];rate=r['sampleRateHz']
  if rate==48000:
   y=array('f',(v/32768 for v in channel))
   if sys.byteorder!='little':y.byteswap()
   payload=y.tobytes();length=len(y)
  else:
   import numpy as np,scipy
   from scipy.signal import resample_poly
   versions=dict(numpy=np.__version__,scipy=scipy.__version__)
   x=np.asarray(channel,dtype=np.float32)/32768;g=math.gcd(rate,48000);y=resample_poly(x,48000//g,rate//g).astype('<f4')
   fail(np.isfinite(y).all(),'Nonfinite PCM');payload=y.tobytes();length=len(y)
  prepared_hash=sha(payload)
  fail(prepared_hash not in prepared_hashes or prepared_hashes[prepared_hash]==r['split'],'Cross-split prepared PCM leakage')
  prepared_hashes[prepared_hash]=r['split']
  name=f'clip-{i:04d}.f32';(target/name).write_bytes(payload)
  r.update(pcmFile=name,pcmSha256=sha((target/name).read_bytes()),analysisSamples=length);del r['audioPath']
 config=json.loads(CONFIG.read_text());report.update(enginesLockSha256=sha((HERE/'engines.lock.json').read_bytes()),inputManifestSha256=sha(p.read_bytes()),config=config,resamplingRuntime=versions,resample='resample_poly Kaiser5 constant, no normalization',freezeStatus='locked-before-inference')
 payload=(json.dumps(report,indent=2,allow_nan=False)+'\n').encode();(target/'frozen.json').write_bytes(payload);(target/'frozen.sha256').write_text(sha(payload)+'\n')
 return dict(manifestSha256=sha(payload),recordings=len(report['recordings']),inferenceRun=False)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('--root',required=True);p.add_argument('--freeze-out');a=p.parse_args()
 r=freeze(a.manifest,a.root,a.freeze_out) if a.freeze_out else audit(json.loads(Path(a.manifest).read_text()),a.root)
 print(json.dumps(r,indent=2,allow_nan=False))
