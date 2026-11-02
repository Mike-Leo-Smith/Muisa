import argparse,json,math,subprocess
from pathlib import Path
import numpy as np,mir_eval
from dataset import CONFIG,sha
p=argparse.ArgumentParser();p.add_argument('--work',required=True);a=p.parse_args();root=Path(a.work);m=json.loads((root/'prepared.json').read_text());c=m['config']
assert m['configSha256']==sha(CONFIG) and m['codeRevision']==subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'Report checkout/config differs from cached run'
def mean(values):
 v=[x for x in values if x is not None and math.isfinite(x)];return sum(v)/len(v) if v else None

def pitch_metrics(reference,prediction):
 voiced=sum(v is not None for v in reference);unvoiced=len(reference)-voiced;accepted=correct10=correct25=correct50=covered=false=octave=0
 for r,p in zip(reference,prediction):
  if p is None:continue
  accepted+=1
  if r is None:false+=1;continue
  covered+=1;error=abs(p-r)*100
  correct10+=error<=10;correct25+=error<=25;correct50+=error<=50
  octave+=error>=1150 and abs(error-round(error/1200)*1200)<=50
 return dict(voicedFrames=voiced,unvoicedFrames=unvoiced,acceptedFrames=accepted,rpa10=correct10/voiced if voiced else None,rpa25=correct25/voiced if voiced else None,rpa50=correct50/voiced if voiced else None,coverage=covered/voiced if voiced else None,acceptedPrecision50=correct50/accepted if accepted else None,voicingFalseAlarm=false/unvoiced if unvoiced else None,octaveErrors=octave)

def arrays(notes):
 notes=sorted(notes,key=lambda n:n['onsetMs']);return np.array([[n['onsetMs']/1000,(n['onsetMs']+n['durationMs'])/1000] for n in notes],float).reshape(-1,2),np.array([440*2**((n['midi']-69)/12) for n in notes],float),notes

def binding(raw,r):
 b=raw['binding']
 if b['inputSha256']!=r['pcmSha256'] or b['configSha256']!=m['configSha256'] or b['codeRevision']!=m['codeRevision']:raise ValueError('Mismatched inference cache')
rows=[];inventory=[]
for r in m['recordings']:
 meta=dict(id=r['id'],player=r['player'],style=r['style'],mode=r['mode'])
 inventory.append(dict(meta,sourceWavSha256=r['wavSha256'],sourceJamsSha256=r['jamsSha256'],analysisPcmSha256=r['pcmSha256'],durationSeconds=r['durationSeconds'],noteCount=len(r['notes']),jamsSchema=r['jamsSchema'],frameCounts={k:r['reason'].count(k) for k in ['mono','unvoiced','polyphonic','boundary-guard']},outOfDetectorRangeMonoFrames=sum(v is not None and not c['fminHz']<=440*2**((v-69)/12)<=c['fmaxHz'] for v,ok in zip(r['reference'],r['eligible']) if ok)))
 for family in ['js','yin','crepe']:
  raw=json.loads((root/family/(r['id']+'.json')).read_text());binding(raw,r)
  for variant in raw['variants']:
   mapped=[]
   for t in r['gridMs']:
    index=int(math.floor((t-raw['firstCenterMs'])/raw['hopMs']+.5))
    if not 0<=index<len(variant['prediction']):raise ValueError('Common grid not covered by model output')
    mapped.append(variant['prediction'][index])
   reference=[v for v,ok in zip(r['reference'],r['eligible']) if ok];pred=[v for v,ok in zip(mapped,r['eligible']) if ok]
   bands={}
   for name,(lo,hi) in c['pitchBins'].items():
    indices=[i for i,v in enumerate(reference) if v is not None and lo<=v<hi];bands[name]=pitch_metrics([reference[i] for i in indices],[pred[i] for i in indices])
   rows.append(dict(meta,task='pitch',method=variant['method'],metrics=pitch_metrics(reference,pred),bands=bands,compute=dict(wallMs=raw['wallMs'],cpuMs=raw.get('cpuMs'),realTimeFactor=raw['wallMs']/(r['durationSeconds']*1000),windowMs=raw['windowMs'],hopMs=raw['hopMs'],processPeakRssKiB=raw.get('processPeakRssKiB'),processRssBytes=raw.get('processRssBytes'),frameCompute=raw.get('compute'),timingScope='YIN and pYIN combined clip time' if family=='yin' else 'one full clip; not end-to-end live latency'),causality=raw['causality']))
 raw=json.loads((root/'basic'/(r['id']+'.json')).read_text());binding(raw,r);ri,rp,refs=arrays(r['notes']);ei,ep,est=arrays(raw['predictions']);metrics={}
 for name,offset in [('onsetPitch',None),('onsetPitchOffset',c['noteOffsetRatio'])]:
  precision,recall,f1,overlap=mir_eval.transcription.precision_recall_f1_overlap(ri,rp,ei,ep,onset_tolerance=c['noteOnsetToleranceMs']/1000,pitch_tolerance=c['notePitchToleranceCents'],offset_ratio=offset,offset_min_tolerance=c['noteOffsetMinToleranceMs']/1000)
  metrics[name]=dict(precision=float(precision),recall=float(recall),f1=float(f1),averageOverlap=float(overlap))
 matches=mir_eval.transcription.match_notes(ri,rp,ei,ep,onset_tolerance=.05,pitch_tolerance=50,offset_ratio=None);matched={i for i,j in matches}
 bands={name:dict(referenceNotes=sum(lo<=n['midi']<hi for n in refs),matchedNotes=sum(i in matched and lo<=n['midi']<hi for i,n in enumerate(refs))) for name,(lo,hi) in c['pitchBins'].items()}
 rows.append(dict(meta,task='poly-note-transcription',method='basic-pitch',referenceCount=len(refs),predictedCount=len(est),metrics=metrics,referenceBandCounts=bands,signedOnsetBiasMs=mean([est[j]['onsetMs']-refs[i]['onsetMs'] for i,j in matches]),compute=dict(wallMs=raw['wallMs'],cpuMs=raw['cpuMs'],realTimeFactor=raw['wallMs']/(r['durationSeconds']*1000),windowMs=raw['windowMs'],processPeakRssKiB=raw['processPeakRssKiB']),warnings=raw['warnings']))

def flatten(row):
 if row['task']=='pitch':return {k:row['metrics'][k] for k in ['rpa10','rpa25','rpa50','coverage','acceptedPrecision50','voicingFalseAlarm']}
 return {k+'_'+metric:v[metric] for k,v in row['metrics'].items() for metric in ['precision','recall','f1']}
def macro(subset):
 keys=flatten(subset[0]);return {k:dict(mean=mean([flatten(r)[k] for r in subset]),recordingCount=sum(flatten(r)[k] is not None for r in subset)) for k in keys}
summaries=[]
for method in sorted({r['method'] for r in rows}):
 selected=[r for r in rows if r['method']==method];players=[]
 for group in ['player','style','mode']:
  for value in sorted({r[group] for r in selected}):
   part=[r for r in selected if r[group]==value];entry=dict(method=method,group=group,value=value,metrics=macro(part));summaries.append(entry)
   if group=='player':players.append(entry)
 summaries.append(dict(method=method,group='all-recordings',value='recording-macro',metrics=macro(selected)))
 summaries.append(dict(method=method,group='all-players',value='equal-player-macro',metrics={k:dict(mean=mean([p['metrics'][k]['mean'] for p in players]),playerCount=sum(p['metrics'][k]['mean'] is not None for p in players)) for k in players[0]['metrics']}))
report=dict(protocol=m['protocol'],status='synthetic-interface-test-only' if m['syntheticSmoke'] else 'GuitarSet-in-dataset-development-diagnostic',codeRevision=m['codeRevision'],config=m['config'],configSha256=m['configSha256'],provenance=dict(dataset='self-generated interface fixture' if m['syntheticSmoke'] else 'GuitarSet1.1.0',doi=None if m['syntheticSmoke'] else '10.5281/zenodo.3371780',trustedSubsetZipSha256=m['provenance'].get('trustedSubsetZipSha256') if isinstance(m['provenance'],dict) else None),license=m['license'],limits=['BasicPitch training includes GuitarSet: not unseen generalization','Note MIDI mean pitch targets, not instantaneous pitch contour; vibrato/bends may contribute errors','50ms annotation boundary guard is an evaluation convention, not measured uncertainty','All overlapping active notes, including same-pitch strings, excluded from monophonic pitch denominator','No manual annotation correction, normalization, or tuning on this subset','Correlated recording/frame observations: macro summaries, no frame-independent confidence intervals','Serial full-recording model calls; compute ratio is not live latency; first-clip warmup may affect BasicPitch'],inventory=inventory,rows=rows,macro=summaries)
(root/'report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print('Wrote',root/'report.json','status:',report['status'])
