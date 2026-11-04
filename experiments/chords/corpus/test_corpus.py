import copy,json,struct,tempfile,unittest,wave,subprocess
from pathlib import Path
from audit import audit,freeze,sha
class CorpusTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.doc={'schema':'muisa-chord-corpus-v1','recordings':[]}
  for player,split in [('p1','development'),('p2','heldout')]:
   for label in ['C','Am','G','Em','D','Dm','F','N','OOV']:
    i=len(self.doc['recordings']);name=f'a{i}.wav';p=self.root/name
    with wave.open(str(p),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(struct.pack('<h',i+1)*(48000*7))
    digest=sha(p.read_bytes());annotation={'binding':{'audioSha256':digest,'sampleRateHz':48000,'samples':48000*7,'channel':0},'timeBasis':'clip-local-seconds','reviewerId':'synthetic-fixture-not-human-audit','segments':[{'start':0,'end':7,'label':label,'rawLabel':'C:7' if label=='OOV' else label,'audited':True,'basis':'self-generated metadata-only test','uncertaintySeconds':.1}]}
    ap=self.root/f'a{i}.json';ap.write_text(json.dumps(annotation));self.doc['recordings'].append(dict(id=str(i),split=split,performerId=player,sessionId=player+'-session',performanceId='performance-'+str(i),datasetId='self-generated-test',previouslyEvaluated=False,performerIdentityVerified=True,performerEvidence='synthetic identities for contract tests only',license=dict(id='CC0',sourceUrl='self-generated',attribution='Muisa tests'),audio=dict(path=name,sha256=digest,channel=0,sampleRateHz=48000,samples=48000*7,channels=1),annotation=dict(path=ap.name,sha256=sha(ap.read_bytes()))))
 def write_manifest(self):
  p=self.root/'manifest.json';p.write_text(json.dumps(self.doc));return p
 def edit_labels(self,index,edit):
  r=self.doc['recordings'][index];p=self.root/r['annotation']['path'];d=json.loads(p.read_text());edit(d);p.write_text(json.dumps(d));r['annotation']['sha256']=sha(p.read_bytes())
 def test_coverage_requires_every_target_and_negatives(self):
  r=audit(self.doc,self.root);self.assertTrue(r['readyToFreeze']);self.doc['recordings'].pop();r=audit(self.doc,self.root);self.assertIn('heldout:OOV',r['missingCoverage'])
 def test_group_leakage_and_observed_holdout(self):
  self.doc['recordings'][9]['performerId']='p1'
  with self.assertRaisesRegex(ValueError,'leakage'):audit(self.doc,self.root)
  self.doc['recordings'][9]['performerId']='p2';self.doc['recordings'][9]['previouslyEvaluated']=True
  with self.assertRaisesRegex(ValueError,'Observed'):audit(self.doc,self.root)
 def test_label_binding_uncertainty_and_unknown(self):
  self.edit_labels(0,lambda d:d['binding'].update(samples=1))
  with self.assertRaisesRegex(ValueError,'binding'):audit(self.doc,self.root)
  self.edit_labels(0,lambda d:d['binding'].update(samples=336000))
  self.edit_labels(0,lambda d:d['segments'][0].update(uncertaintySeconds=.3))
  with self.assertRaisesRegex(ValueError,'uncertainty'):audit(self.doc,self.root)
  self.edit_labels(0,lambda d:d['segments'][0].update(label='X',audited=False))
  self.assertFalse(audit(self.doc,self.root)['readyToFreeze'])
 def test_frozen_end_to_end_evaluation_and_tamper(self):
  root=self.root/'frozen';result=freeze(self.write_manifest(),self.root,root);self.assertFalse(result['inferenceRun'])
  script=Path(__file__).with_name('evaluate.js');output=self.root/'evaluated'
  result=subprocess.run(['node',str(script),str(root),str(output),'development'],capture_output=True,text=True)
  self.assertEqual(result.returncode,0,result.stdout+result.stderr)
  r=json.loads((output/'evaluation.json').read_text());self.assertEqual(len(r['recordings']),9);self.assertEqual(r['pooled']['baseline']['stable']['acceptedSupported'],0)
  first=root/'clip-0000.f32';first.write_bytes(b'changed')
  broken=subprocess.run(['node',str(script),str(root),str(self.root/'bad'),'development'],capture_output=True)
  self.assertNotEqual(broken.returncode,0);self.assertIn(b'PCM mismatch',broken.stderr)
 def test_selected_channel_duplicate_cannot_cross_splits(self):
  r=self.doc['recordings'][9];p=self.root/r['audio']['path']
  with wave.open(str(p),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(48000);w.writeframes(struct.pack('<hh',1,100)*336000)
  r['audio']['channels']=2;r['audio']['sha256']=sha(p.read_bytes())
  self.edit_labels(9,lambda d:d['binding'].update(audioSha256=r['audio']['sha256']))
  self.assertTrue(audit(self.doc,self.root)['readyToFreeze'])
  with self.assertRaisesRegex(ValueError,'prepared PCM'):freeze(self.write_manifest(),self.root,self.root/'duplicate')
 def test_freeze_rejects_incomplete_before_writing(self):
  self.doc['recordings'].pop();target=self.root/'incomplete'
  with self.assertRaisesRegex(ValueError,'Coverage'):freeze(self.write_manifest(),self.root,target)
  self.assertFalse(target.exists())
if __name__=='__main__':unittest.main()
