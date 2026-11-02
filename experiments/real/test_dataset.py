import json,tempfile,unittest,wave
from pathlib import Path
from dataset import CONFIG,parse_jams,reference_grid,safe_path,load_index,sha
class DatasetTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.config=json.loads(CONFIG.read_text());self.j=self.root/'x.jams'
 def tearDown(self):self.temp.cleanup()
 def write(self,notes):
  self.j.write_text(json.dumps(dict(annotations=[dict(namespace='note_midi',time=0,data=notes)])))
 def test_fractional_pitch_and_null_confidence_preserved(self):
  self.write([dict(time=.2,duration=.5,value=60.12,confidence=None)]);notes,schema=parse_jams(self.j,2);self.assertEqual(notes[0]['midi'],60.12);self.assertIsNone(notes[0]['confidence']);self.assertEqual(schema['namespace'],'note_midi')
 def test_no_deduplication_or_time_repair(self):
  n=dict(time=.2,duration=.5,value=60,confidence=None);self.write([n,n])
  with self.assertRaises(ValueError):parse_jams(self.j,2)
  self.write([dict(n,duration=-.5)])
  with self.assertRaises(ValueError):parse_jams(self.j,2)
 def test_overlap_and_boundaries_shared_mask(self):
  notes=[dict(onsetMs=200,durationMs=600,midi=60),dict(onsetMs=500,durationMs=700,midi=64)];g=reference_grid(notes,2000,self.config);at=lambda t:g['reason'][g['gridMs'].index(t)]
  self.assertEqual(at(200),'boundary-guard');self.assertEqual(at(600),'polyphonic');self.assertEqual(at(350),'mono');self.assertEqual(at(1500),'unvoiced')
 def test_paths_cannot_escape(self):
  with self.assertRaises(ValueError):safe_path(self.root,'../outside')
 def test_manifest_hash_mismatch_rejected_before_audio(self):
  self.write([dict(time=.2,duration=.5,value=60)]);wav=self.root/'x.wav'
  with wave.open(str(wav),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000);w.writeframes(bytes(16000))
  item=dict(id='00_BN1-120-C_solo',player='00',style='BN',mode='solo',wav='x.wav',jams='x.jams',wavSha256='0'*64,jamsSha256=sha(self.j));idx=self.root/'index.json';idx.write_text(json.dumps(dict(schema='muisa-r1-local-v1',license='CC0',provenance='synthetic',recordings=[item])))
  with self.assertRaisesRegex(ValueError,'SHA256 mismatch'):load_index(self.root,idx,self.config)
 def test_known_errata_rejected(self):
  idx=self.root/'index.json';idx.write_text(json.dumps(dict(schema='muisa-r1-local-v1',license='CC0',provenance='synthetic',recordings=[dict(id=self.config['excludedRecordings'][0])])))
  with self.assertRaisesRegex(ValueError,'erratum'):load_index(self.root,idx,self.config)
if __name__=='__main__':unittest.main()
