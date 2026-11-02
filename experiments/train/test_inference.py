import json,tempfile,hashlib,unittest
from pathlib import Path
import numpy as np,torch
from model import TinyGuitar
from inference import OrtStream
C=json.loads(Path(__file__).with_name('config.json').read_text())
class HostTests(unittest.TestCase):
 def test_exported_random_model_host_rejects_partial_and_preserves_reset_state(self):
  # Interface regression only; this temporary random model is NOT a new trained checkpoint.
  torch.manual_seed(C['seed']);torch.set_num_threads(2);m=TinyGuitar(C).eval()
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'random-interface.onnx';x=torch.zeros(1,1,256)
   torch.onnx.export(m,(x,*m.states(1)),str(p),input_names=['pcm','pcm_state','feature_state'],output_names=['logits','next_pcm_state','next_feature_state'],opset_version=17,dynamo=False)
   stream=OrtStream(p,C,hashlib.sha256(p.read_bytes()).hexdigest())
   for length in [0,255,257]:
    with self.assertRaises(ValueError):stream.push(np.zeros((1,1,length),np.float32))
   self.assertEqual(stream.samples_seen,0);first=stream.push(x.numpy());self.assertEqual(first['frameEndSamples'].tolist(),[256]);self.assertEqual(first['validWarmup'].tolist(),[False])
   for _ in range(3):last=stream.push(x.numpy())
   self.assertEqual(last['frameEndSamples'].tolist(),[1024]);self.assertTrue(last['validWarmup'][0]);stream.reset();again=stream.push(x.numpy());np.testing.assert_array_equal(first['logits'],again['logits'])
if __name__=='__main__':unittest.main()
