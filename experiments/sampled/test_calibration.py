import unittest
import numpy as np
from calibration import attack
class CalibrationTests(unittest.TestCase):
 def test_known_delayed_step_and_threshold_bounds(self):
  x=np.zeros(6000);x[2426:3000]=.2
  c=attack(x,100)
  expected=2426/22050*1000
  self.assertGreaterEqual(c['lowerMs'],expected)
  self.assertLessEqual(c['upperMs'],expected+c['smoothingMs'])
  self.assertLessEqual(c['lowerMs'],c['onsetMs']);self.assertLessEqual(c['onsetMs'],c['upperMs'])
 def test_silence_is_not_an_onset(self):
  with self.assertRaises(AssertionError):attack(np.zeros(6000),100)
 def test_gain_scaling_does_not_move_relative_attack(self):
  x=np.zeros(6000);x[2400:2800]=np.linspace(0,.2,400)
  self.assertEqual(attack(x,100)['thresholdOnsetsMs'],attack(x*.1,100)['thresholdOnsetsMs'])
if __name__=='__main__':unittest.main()
