"""Whole-CLI synthetic regression; does not claim realistic audio validation."""
import hashlib,json,subprocess,sys,tempfile,unittest
from pathlib import Path
import numpy as np
from scipy.io import wavfile
SCRIPT=Path(__file__).with_name('mix.py').resolve()
class WholeMix(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.rate=1000
  source={'dry':np.full(9000,.1)};source.update({k:np.array([1.]) for k in ['target','speech1','speech2','keyboard','footstep']});np.savez(self.root/'sources.npz',**source)
  self.meta={'sampleRateHz':1000,'sourcesSha256':hashlib.sha256((self.root/'sources.npz').read_bytes()).hexdigest(),'positionsMetres':{'target':[0,0,0]},'microphoneMetres':[0,0,0],'speedOfSound':343,'fractionalDelaySamples':0}
  self.assets=[]
  for i,kind in enumerate(['speech','speech','keyboard','footstep']):
   f=self.root/f'{i}.wav';wavfile.write(f,1000,np.full(3000,.02,dtype=np.float32));self.assets.append(dict(id=str(i),kind=kind,path=f.name,sha256=hashlib.sha256(f.read_bytes()).hexdigest(),sourceUrl='synthetic-unit-only',license='self-generated',attribution='test, not real human sound'))
  (self.root/'assets.json').write_text(json.dumps(self.assets))
 def tearDown(self):self.temp.cleanup()
 def run_mix(self,name,notes):
  (self.root/'scene.json').write_text(json.dumps(dict(self.meta,notes=notes)))
  return subprocess.run([sys.executable,str(SCRIPT),str(self.root),str(self.root/'assets.json'),str(self.root/name)],capture_output=True,text=True)
 def test_full_tiny_zero_overlap_same_transient_gain_and_strict_json(self):
  times=sorted(np.random.default_rng(123).uniform(.6,7.7,6));start=round(times[1]*1000)/1000;end=start+1;reports=[]
  for mode,remaining in [('full',1000),('tiny',1),('zero',0)]:
   notes=[{'onsetSeconds':0,'durationSeconds':9}] if mode=='full' else [{'onsetSeconds':0,'durationSeconds':start+remaining/1000},{'onsetSeconds':end,'durationSeconds':9-end}]
   result=self.run_mix(mode,notes);self.assertEqual(result.returncode,0,result.stderr)
   report=json.loads((self.root/mode/'manifest.json').read_text(),parse_constant=lambda value:self.fail('Nonfinite JSON '+value));reports.append(report)
   self.assertEqual(len(report['files']),3);self.assertEqual(len({f['seconds'] for f in report['files']}),1)
   self.assertTrue(all(f['peak']<=.90001 for f in report['files']))
   for event in report['events']:
    self.assertAlmostEqual(event['achievedCalibrationSirDb'],event['requestedCalibrationSirDb'],places=8)
    self.assertEqual(event['calibrationRegion'],'active-overlap' if event['kind']=='speech' else 'event-local')
  foot=[next(e for e in r['events'] if e['kind']=='footstep') for r in reports]
  self.assertEqual([e['activeOverlapSamples'] for e in foot],[1000,1,0])
  for e in foot:self.assertAlmostEqual(e['sourceGain'],foot[0]['sourceGain'],places=10);self.assertLess(e['sourceGain'],6)
  self.assertIsNone(foot[2]['achievedActiveOverlapSirDb']);self.assertEqual(foot[2]['activeOverlapDiagnostic'],'empty-region')
 def test_zero_energy_asset_rejected_before_deliverables(self):
  f=self.root/'3.wav';wavfile.write(f,1000,np.zeros(3000,dtype=np.float32));self.assets[3]['sha256']=hashlib.sha256(f.read_bytes()).hexdigest();(self.root/'assets.json').write_text(json.dumps(self.assets))
  result=self.run_mix('zero-energy',[{'onsetSeconds':0,'durationSeconds':9}]);self.assertNotEqual(result.returncode,0);self.assertIn('zero-energy',result.stderr);self.assertFalse(list((self.root/'zero-energy').glob('*.wav')))
 def test_nonfinite_asset_rejected_before_output(self):
  f=self.root/'0.wav';wavfile.write(f,1000,np.full(3000,np.nan,dtype=np.float32));self.assets[0]['sha256']=hashlib.sha256(f.read_bytes()).hexdigest();(self.root/'assets.json').write_text(json.dumps(self.assets))
  result=self.run_mix('nonfinite',[{'onsetSeconds':0,'durationSeconds':9}]);self.assertNotEqual(result.returncode,0);self.assertFalse(list((self.root/'nonfinite').glob('*.wav')))
 def test_empty_speech_overlap_rejected(self):
  result=self.run_mix('empty-speech',[{'onsetSeconds':8.5,'durationSeconds':.2}]);self.assertNotEqual(result.returncode,0);self.assertIn('empty-region',result.stderr)
if __name__=='__main__':unittest.main()
