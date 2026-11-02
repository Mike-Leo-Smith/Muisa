import json
from pathlib import Path
import numpy as np,mir_eval
root=Path('reports/calibrated');manifest=json.loads((root/'manifest.json').read_text());raw=json.loads((root/'basic-pitch.json').read_text());rows=[]
for c in manifest['cases']:
 prediction=next(r for r in raw['rows'] if r['id']==c['id']);assert prediction['inputSha256']==c['sha256']
 for side in ['source','microphone']:
  notes=c['sourceNotes'] if side=='source' else c['notes'];est=prediction['predictions'];metrics={}
  def arrays(notes):
   order=sorted(notes,key=lambda n:n['onsetMs']);return np.array([[n['onsetMs']/1000,(n['onsetMs']+n['durationMs'])/1000] for n in order]).reshape(-1,2),np.array([440*2**((n['midi']-69)/12) for n in order])
  for label,ratio in [('onsetPitch',None),('onsetPitchOffset',.2)]:
   p,r,f,o=mir_eval.transcription.precision_recall_f1_overlap(*arrays(notes),*arrays(est),onset_tolerance=.05,pitch_tolerance=50,offset_ratio=ratio,offset_min_tolerance=.05)
   metrics[label]=dict(precision=float(p),recall=float(r),f1=float(f),averageOverlap=float(o))
  rows.append(dict(id=c['id'],inputSha256=c['sha256'],levelMode=c['levelMode'],side=side,method='BasicPitch-ONNX',referenceCount=len(notes),predictedCount=len(est),metrics=metrics,wholeClipComputeMs=prediction['wholeClipComputeMs'],wholeClipCpuMs=prediction['wholeClipCpuMs'],processPeakRssKiB=prediction['processPeakRssKiB']))
(root/'note-results.json').write_text(json.dumps(dict(experiment='M3 source/microphone acoustic-proxy transcription',rows=rows),indent=2)+'\n');print('Compared',len(rows),'note rows')
