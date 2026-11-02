import json,unittest
from pathlib import Path
import torch
from model import TinyGuitar,masked_loss
from data import toy_batch
C=json.loads(Path(__file__).with_name('config.json').read_text());torch.set_num_threads(C['threads'])
class ModelTests(unittest.TestCase):
 def setUp(self):torch.manual_seed(C['seed']);self.model=TinyGuitar(C).eval()
 def test_shapes_gradients_masks(self):
  pcm,labels,_=toy_batch(C);y,*_=self.model(pcm,*self.model.states(len(pcm)));self.assertEqual(tuple(y.shape),(4,128,51));loss,parts=masked_loss(y,labels,C);loss.backward();self.assertTrue(all(torch.isfinite(p.grad).all() for p in self.model.parameters() if p.grad is not None));self.assertTrue(all(p.weight.grad is not None for p in self.model.tcn));self.assertTrue(torch.isfinite(loss));
  empty={k:torch.zeros_like(v) for k,v in labels.items()};zero,_=masked_loss(y,empty,C);self.assertEqual(zero.item(),0)
 def test_prefix_and_streaming_state(self):
  x=torch.randn(1,1,256*24)*.01;state=self.model.states(1)
  with torch.no_grad():
   full,ps,fs=self.model(x,*state);prefix,*_=self.model(x[:,:,:256*11],*state);torch.testing.assert_close(prefix,full[:,:11],rtol=1e-5,atol=1e-6)
   outputs=[];p,f=state
   for i in range(24):
    y,p,f=self.model(x[:,:,i*256:(i+1)*256],p,f);outputs.append(y)
   torch.testing.assert_close(torch.cat(outputs,1),full,rtol=1e-5,atol=1e-6);torch.testing.assert_close(p,ps);torch.testing.assert_close(f,fs,rtol=1e-5,atol=1e-6)
   reset,*_=self.model(x[:,:,:256],*self.model.states(1));torch.testing.assert_close(reset,full[:,:1])
 def test_unknown_pitch_mask_prevents_supervision(self):
  x=torch.randn(1,2,51,requires_grad=True);labels={k:torch.zeros(1,2) for k in ['activity','onset','activityMask','onsetMask','pitchMask']};labels['pitch']=torch.zeros(1,2,dtype=torch.long);labels['activityMask'][:]=1
  loss,_=masked_loss(x,labels,C);loss.backward();self.assertEqual(x.grad[:,:,2:].abs().sum().item(),0)
if __name__=='__main__':unittest.main()
