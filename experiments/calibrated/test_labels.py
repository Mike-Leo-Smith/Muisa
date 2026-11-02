import unittest,numpy as np
from labels import acoustic_bounds,grid_reference
class LabelTests(unittest.TestCase):
 def test_delayed_step_and_release(self):
  x=np.zeros(10000);x[2205:4410]=.2;b=acoustic_bounds(x,90)
  self.assertGreaterEqual(b['onsetMs'],100);self.assertLessEqual(b['onsetMs'],101)
  self.assertGreaterEqual(b['offsetMs'],200);self.assertLessEqual(b['offsetMs'],201)
  self.assertEqual(b['thresholdOffsetsMs'],acoustic_bounds(x*.1,90)['thresholdOffsetsMs'])
 def test_shift_changes_source_and_microphone_labels(self):
  x=np.zeros(10000);x[2205:4410]=.2;a=acoustic_bounds(x,90);b=acoustic_bounds(np.r_[np.zeros(221),x],90)
  self.assertAlmostEqual(b['offsetMs']-a['offsetMs'],221/22050*1000)
 def test_silence_rejected(self):
  with self.assertRaises(AssertionError):acoustic_bounds(np.zeros(10000),100)
 def test_uncertain_and_overlap_excluded(self):
  a=dict(midi=60,onsetBoundsMs=[100,105],offsetBoundsMs=[200,210]);b=dict(midi=62,onsetBoundsMs=[150,155],offsetBoundsMs=[250,260])
  self.assertEqual(grid_reference([a],102),(None,False));self.assertEqual(grid_reference([a,b],170),(None,False));self.assertEqual(grid_reference([a],170),(60,True));self.assertEqual(grid_reference([a],250),(None,True))
if __name__=='__main__':unittest.main()
