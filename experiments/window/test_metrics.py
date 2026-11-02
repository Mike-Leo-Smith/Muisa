import unittest
from metrics import metrics,macro
class MetricsTests(unittest.TestCase):
 def test_error_coverage_and_false_alarm_denominators(self):
  m=metrics([40,40,40,None,None],[40,28,None,60,None]);self.assertEqual(m['voicedFrames'],3);self.assertEqual(m['rpa50'],1/3);self.assertEqual(m['coverage'],2/3);self.assertEqual(m['octaveErrors'],1);self.assertEqual(m['voicingFalseAlarm'],.5)
 def test_macro_keeps_empty_recordings_visible(self):
  a=metrics([40],[40]);b=metrics([None],[None]);m=macro([a,b]);self.assertEqual(m['recordingCount'],2);self.assertEqual(m['rpa50']['definedRecordings'],1);self.assertEqual(m['rpa50']['mean'],1);self.assertIsNone(b['octaveErrorRate'])
if __name__=='__main__':unittest.main()
