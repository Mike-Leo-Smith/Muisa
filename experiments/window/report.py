import json,math,subprocess,sys,hashlib
from pathlib import Path
from metrics import metrics,macro
root=Path(sys.argv[1]);m=json.loads((root/'prepared.json').read_text());c=m['config'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(Path(__file__).with_name('config.json'))==m['configSha256'] and subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==m['codeRevision']
rows=[];inventory=[]
for r in m['recordings']:
 raw=json.loads((root/'predictions'/(r['id']+'.json')).read_text());assert raw['binding']==dict(codeRevision=m['codeRevision'],configSha256=m['configSha256'],inputManifestSha256=m['inputManifestSha256'],pcmSha256=r['pcmSha256'],split=m['split'])
 inventory.append(dict(id=r['id'],player=r['player'],mode=r['mode'],analysisPcmSha256=r['pcmSha256'],frameCounts={k:r['reason'].count(k) for k in ['mono','unvoiced','polyphonic','boundary-guard']}))
 for v in raw['variants']:
  indices=[math.floor((t-raw['firstCenterMs'])/raw['hopMs']+.5) for t in r['gridMs']];assert all(0<=i<len(v['prediction']) for i in indices);mapped=[v['prediction'][i] for i in indices]
  def score(indices):return metrics([r['reference'][i] for i in indices],[mapped[i] for i in indices])
  eligible=[i for i,ok in enumerate(r['eligible']) if ok]
  bands={name:score([i for i in eligible if r['reference'][i] is not None and lo<=r['reference'][i]<hi]) for name,(lo,hi) in m['pitchBins'].items()}
  distances={name:score([i for i in eligible if lo<=r['boundaryDistanceMs'][i] and (hi is None or r['boundaryDistanceMs'][i]<hi)]) for name,(lo,hi) in c['boundaryDistanceBinsMs'].items()}
  rows.append(dict(id=r['id'],player=r['player'],mode=r['mode'],method=v['method'],metrics=score(eligible),pitchBands=bands,boundaryDistance=distances,compute=v['compute'],windowMs=v['windowMs'],availabilityAfterCenterMs=v['availabilityAfterCenterMs'],observedRssBytes=raw['observedRssBytes']))
summaries=[]
for method in [w['id'] for w in c['windows']]:
 selected=[r for r in rows if r['method']==method]
 for group,values in [('all',['all']),('mode',sorted({r['mode'] for r in selected})),('player',sorted({r['player'] for r in selected}))]:
  for value in values:
   subset=[r for r in selected if group=='all' or r[group]==value]
   summaries.append(dict(method=method,group=group,value=value,metrics=macro([r['metrics'] for r in subset]),pitchBands={b:macro([r['pitchBands'][b] for r in subset]) for b in m['pitchBins']},boundaryDistance={b:macro([r['boundaryDistance'][b] for r in subset]) for b in c['boundaryDistanceBinsMs']}))
report=dict(protocol=m['protocol'],split=m['split'],status='synthetic-interface-only' if m['split']=='synthetic' else 'GuitarSet-recording-development-or-holdout-not-new-players',codeRevision=m['codeRevision'],config=c,configSha256=m['configSha256'],inputManifestSha256=m['inputManifestSha256'],inventory=inventory,rows=rows,macro=summaries,limits=['Unchanged R1 grid and guard; all recordings retained with denominators','Centered offline observations, not causal browser latency','Single shared-host computation timing, not robust latency benchmark','R2 recording/score holdout is not player holdout; GuitarSet overlaps BasicPitch training although BasicPitch is not run','Window shortening at22050Hz is not equivalent to online48000Hz decimation and preprocessing'])
(root/'report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print('Report',m['split'],len(inventory),'recordings')
