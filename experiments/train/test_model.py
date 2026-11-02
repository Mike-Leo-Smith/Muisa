import json,unittest
from pathlib import Path
import torch
from model import TinyGuitar,masked_loss
from data import toy_batch,onset_frame_index
C=json.loads(Path(__file__).with_name('config.json').read_text());torch.set_num_threads(C['threads'])
class ModelTests(unittest.TestCase):
 def setUp(self):torch.manual_seed(C['seed']);self.model=TinyGuitar(C).eval()
 def test_onset_at_hop_boundary_is_not_in_previous_frame(self):
  for sample,index in [(0,0),(255,0),(256,1),(257,1),(512,2),(2400,9)]:self.assertEqual(onset_frame_index(sample,256),index)
  with self.assertRaises(ValueError):onset_frame_index(-1,256)
 def test_partial_empty_or_invalid_chunk_is_rejected(self):
  state=self.model.states(1)
  for length in [0,1,255,257,513]:
   with self.assertRaisesRegex(ValueError,'hop-multiple'):self.model(torch.zeros(1,1,length),*state)
  with self.assertRaises(ValueError):self.model(torch.full((1,1,256),float('nan')),*state)
  with self.assertRaises(ValueError):self.model(torch.zeros(1,1,256),state[0][:,:,:1],state[1])
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
 def test_mask_before_loss_ignores_invalid_placeholders_and_logits(self):
  x=torch.zeros(1,2,51,requires_grad=True)
  with torch.no_grad():x[:,1,:]=float('nan')
  labels={k:torch.tensor([[1.,0.]]) for k in ['activityMask','onsetMask','pitchMask']}
  labels.update(activity=torch.tensor([[1.,float('nan')]]),onset=torch.tensor([[0.,float('nan')]]),pitch=torch.tensor([[4.,99999.]]))
  loss,_=masked_loss(x,labels,C);self.assertTrue(torch.isfinite(loss));loss.backward();self.assertTrue(torch.isfinite(x.grad).all());self.assertEqual(x.grad[:,1,:].abs().sum().item(),0)
  labels['activity'][0,0]=float('nan')
  with self.assertRaisesRegex(ValueError,'binary target'):masked_loss(x,labels,C)
 def test_empty_masks_ignore_nan_targets_and_preserve_zero_gradient(self):
  x=torch.full((1,2,51),float('nan'),requires_grad=True);labels={k:torch.zeros(1,2) for k in ['activityMask','onsetMask','pitchMask']};labels.update({k:torch.full((1,2),float('nan')) for k in ['activity','onset','pitch']})
  loss,_=masked_loss(x,labels,C);self.assertEqual(loss.item(),0);loss.backward();self.assertTrue(torch.equal(x.grad,torch.zeros_like(x)))
 def test_unknown_pitch_mask_prevents_supervision(self):
  x=torch.randn(1,2,51,requires_grad=True);labels={k:torch.zeros(1,2) for k in ['activity','onset','activityMask','onsetMask','pitchMask']};labels['pitch']=torch.zeros(1,2,dtype=torch.long);labels['activityMask'][:]=1
  loss,_=masked_loss(x,labels,C);loss.backward();self.assertEqual(x.grad[:,:,2:].abs().sum().item(),0)
if __name__=='__main__':unittest.main()
