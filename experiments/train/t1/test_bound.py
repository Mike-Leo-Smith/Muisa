import copy
import json
import struct
import tempfile
import unittest
from pathlib import Path
from contract import audit, collate, digest
from dataset import GROUPS
from audit import guitarset

class BoundTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        raw=struct.pack('<2048f',*([.1]*2048));self.put('source.pcm',raw);sha=digest(raw)
        self.s=dict(asset=dict(path='source.pcm',sha256=sha),format='float32-le',sampleRateHz=16000,samples=2048,previouslyInspected=True,evaluationOnly=False,kind='real-guitar',license=dict(id='CC0',source='self-generated',attribution='test'),groups={k:['test:'+k] if k in ('player','session','recording') else None for k in GROUPS})
        mapping=dict(sourceId='source',sourceRateHz=16000,outputRateHz=16000,cropStartSample=0,cropEndSample=2048,additionalDelaySamples=0)
        self.i=dict(id='clip',kind='real-guitar',split='development',previouslyInspected=True,evaluationOnly=False,parents=[dict(sourceId='source',sha256=sha,role='target')],pcm=dict(path='source.pcm',sha256=sha,sampleRateHz=16000,channels=1,samples=2048),timeMapping=mapping,transform=dict(resample=dict(method='scipy.signal.resample_poly',version='1.15.3',window=['kaiser',5.0],padtype='constant',normalization='none'),mix=[dict(sourceId='source',gain=1,offsetSamples=0)],augmentation=[]))
        self.a=dict(binding=dict(pcmSha256=sha,samples=2048,kind='real-guitar',timeMapping=copy.deepcopy(mapping),parentHashes={'source':sha}),complete=True,notes=[],reliableIntervals=[[0,2048]],frames=8)
        self.m=dict(schema='muisa-t1-data-v2',sources={'source':self.s},items=[self.i]);self.bind()
    def put(self,name,data):self.root.joinpath(name).write_bytes(data)
    def bind(self):
        raw=json.dumps(self.a).encode();self.put('annotation.json',raw);self.i['annotation']=dict(path='annotation.json',sha256=digest(raw))
    def run_audit(self,purpose='audit'):return audit(self.m,self.root,purpose)
    def test_end_to_end_silence_numeric(self):
        result=self.run_audit();numeric=collate(result)
        self.assertEqual(numeric['pitch'],[[-100]*8]);self.assertEqual(sum(numeric['activityMask'][0]),5)
        self.assertEqual(sum(numeric['activity'][0]),0)
        self.a['notes']=[dict(startSample=0,endSample=2048,midi=64,reliable=True)];self.bind()
        self.assertEqual(collate(self.run_audit())['pitch'][0][-1],28)
    def test_bound_annotations(self):
        for field,value in [('kind','speech'),('samples',2047),('pcmSha256','0'*64)]:
            old=self.a['binding'][field];self.a['binding'][field]=value;self.bind()
            with self.assertRaises(ValueError):self.run_audit()
            self.a['binding'][field]=old
        self.bind();self.put('annotation.json',b'{}')
        with self.assertRaisesRegex(ValueError,'hash'):self.run_audit()
    def test_unknown_cannot_be_negative(self):
        self.s['kind']=self.i['kind']=self.a['binding']['kind']='unknown-music';self.s['groups']['noiseSource']=['unknown'];self.bind()
        with self.assertRaisesRegex(ValueError,'Unknown music'):self.run_audit()
        self.a['complete']=False;self.a['reliableIntervals']=[];self.bind()
        self.assertEqual(sum(collate(self.run_audit())['activityMask'][0]),0)
    def test_history_and_protection(self):
        self.i['previouslyInspected']=False
        with self.assertRaisesRegex(ValueError,'erase inspected'):self.run_audit()
        self.i['previouslyInspected']=True;self.i['split']='test'
        with self.assertRaisesRegex(ValueError,'Observed'):self.run_audit()
        self.i['split']='observed-validation';self.s['evaluationOnly']=self.i['evaluationOnly']=True
        self.run_audit()
        for purpose in ('training','selection'):
            with self.assertRaisesRegex(ValueError,'Frozen'):self.run_audit(purpose)
        for value in (None,0,'false'):
            self.i['evaluationOnly']=value
            with self.assertRaisesRegex(ValueError,'boolean'):self.run_audit()
    def test_bounds_and_recipe(self):
        self.a['frames']=9;self.bind()
        with self.assertRaisesRegex(ValueError,'Frame count'):self.run_audit()
        self.a['frames']=8;self.a['reliableIntervals']=[[0,2049]];self.bind()
        with self.assertRaisesRegex(ValueError,'bounds'):self.run_audit()
        self.a['reliableIntervals']=[[0,2048]];self.a['notes']=[dict(startSample=0,endSample=3000,midi=64,reliable=True)];self.bind()
        with self.assertRaisesRegex(ValueError,'bounds'):self.run_audit()
        self.a['notes']=[];self.bind();self.i['timeMapping']['cropStartSample']=-1
        with self.assertRaisesRegex(ValueError,'crop'):self.run_audit()
        self.i['timeMapping']['cropStartSample']=0;del self.i['transform']['resample']['version']
        with self.assertRaisesRegex(ValueError,'resample'):self.run_audit()
    def test_parent_hash_and_ancestry_leakage(self):
        self.i['parents'][0]['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'Parent binding'):self.run_audit()
        self.i['parents'][0]['sha256']=self.s['asset']['sha256']
        other=copy.deepcopy(self.i);other['id']='other';other['split']='train';self.m['items'].append(other)
        with self.assertRaisesRegex(ValueError,'leakage'):self.run_audit()
    def test_mix_and_replay_fail_closed(self):
        self.i['transform']['mix']=[]
        with self.assertRaisesRegex(ValueError,'mix'):self.run_audit()
        self.i['transform']['mix']=[dict(sourceId='source',gain=2,offsetSamples=0)]
        with self.assertRaisesRegex(ValueError,'replay'):self.run_audit()
    def test_guitarset_adapter_fixture(self):
        import wave
        wav=self.root/'00_Test_solo_mic.wav';jams=self.root/'00_Test_solo.jams'
        with wave.open(str(wav),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*2048)
        jams.write_text(json.dumps(dict(annotations=[dict(namespace='note_midi',time=543.742,duration=.128,data=[dict(time=.01,duration=.05,value=64.2,confidence=None)],annotation_metadata=dict(data_source='0'))])))
        rec=dict(id='00_Test_solo',player='00',style='Rock',mode='solo',wav=wav.name,jams=jams.name,wavSha256=digest(wav.read_bytes()),jamsSha256=digest(jams.read_bytes()))
        manifest=self.root/'index.json';manifest.write_text(json.dumps(dict(schema='muisa-r1-local-v1',license='CC-BY-4.0',provenance={'dataset':'synthetic schema fixture'},recordings=[rec])))
        report=guitarset(self.root,manifest);row=report['rows'][0]
        self.assertTrue(row['previouslyInspected']);self.assertFalse(row['trainingReady']);self.assertEqual(row['split'],'development');self.assertEqual(row['notes'],1)
        self.assertTrue(row['warnings']);self.assertEqual(row['annotationSha256'],rec['jamsSha256'])

if __name__=='__main__':unittest.main()
