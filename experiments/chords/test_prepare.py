import json,tempfile,unittest
from pathlib import Path
from prepare import tracks
class ChordSchemaTests(unittest.TestCase):
 def write(self,annotations):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);p=Path(tmp.name)/'fixture.jams';p.write_text(json.dumps({'annotations':annotations}));return p
 def test_actual_track_index_and_local_observation_time(self):
  p=self.write([{'namespace':'note_midi'},{'namespace':'chord','time':543.7,'duration':2,'annotation_metadata':{'data_source':'performed'},'data':[{'time':.2,'duration':.8,'value':'C:maj/3','confidence':None}]}])
  t=tracks(p,2)[0];self.assertEqual(t['trackIndex'],1);self.assertEqual(t['segments'][0]['start'],.2);self.assertEqual(t['annotationTime'],543.7)
 def test_invalid_or_overlapping_intervals_rejected(self):
  for rows in [[{'time':-.1,'duration':.2,'value':'C:maj'}],[{'time':1.,'duration':2.,'value':'C:maj'}],[{'time':0.,'duration':1.,'value':'C:maj'},{'time':.5,'duration':1.,'value':'A:min'}]]:
   with self.subTest(rows=rows),self.assertRaises(ValueError):tracks(self.write([{'namespace':'chord','data':rows}]),2)
if __name__=='__main__':unittest.main()
