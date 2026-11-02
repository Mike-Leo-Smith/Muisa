"""Local-only audit CLI; never prepares training batches or changes split history."""
import argparse
import importlib.util
import json
from pathlib import Path
from contract import audit, collate

def guitarset(root, manifest_path):
    # Reuse the audited GuitarSet native manifest/JAMS reader, not import by a
    # conflicting generic `dataset` module name.
    source=Path(__file__).resolve().parents[2]/'real'/'dataset.py'
    spec=importlib.util.spec_from_file_location('muisa_real_dataset',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    config=json.loads(source.with_name('config.json').read_text())
    records,index=module.load_index(Path(root),Path(manifest_path),config)
    rows=[]
    for r in records:
        if any(n['onsetMs']+n['durationMs']>r['durationSeconds']*1000 for n in r['notes']):raise ValueError('Annotation extends beyond PCM: explicit review required')
        rows.append(dict(id=r['id'],player=r['player'],session='unknown-conservative-player-group:'+r['player'],split='development',previouslyInspected=True,evaluationOnly=False,wavSha256=r['wavSha256'],annotationSha256=r['jamsSha256'],sourceRateHz=r['sourceRateHz'],sourceFrames=r['sourceFrames'],notes=len(r['notes']),timeMapping='clip-local observation seconds; annotation.time not added',annotationCoverageCertified=False,trainingReady=False,warnings=r['jamsSchema']['warnings']))
    return dict(schema='muisa-t1-guitarset-audit-v1',inputManifestSha256=module.sha(manifest_path),rows=rows,trainingStarted=False,sourceReviewRequired=['Actual session identity unavailable; conservatively group by player across R1/R2','R1/R2 observed, development only; not untouched validation/test','Review complete annotation coverage, errata and acoustic attack/release before label generation','No resampling, training labels, optimizer or new downloads performed'])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('kind',choices=['guitarset','bound']);p.add_argument('manifest');p.add_argument('--root',required=True)
    a=p.parse_args()
    if a.kind=='guitarset':result=guitarset(a.root,a.manifest)
    else:
        rows=audit(json.loads(Path(a.manifest).read_text()),a.root)
        numeric=collate(rows)
        result=dict(items=len(rows),supervision={k:sum(map(sum,numeric[k])) for k in ('activityMask','pitchMask','onsetMask')},trainingStarted=False)
    print(json.dumps(result,indent=2,allow_nan=False))
