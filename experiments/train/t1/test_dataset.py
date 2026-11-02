import copy
import hashlib
import tempfile
import struct
import unittest
from pathlib import Path
from dataset import validate_manifest, frame_labels, GROUPS


def item(identity='a', split='train'):
    return dict(id=identity, sourceId=identity, lineageRoot=identity, split=split, previouslyInspected=False, evaluationOnly=False, kind='real-guitar', negativeTarget=False, license=dict(id='CC0-1.0', source='self-generated-test', attribution='Muisa test fixture'), groups={k: [identity+'-'+k] if k in ('player','session','recording') else None for k in GROUPS}, pcm=dict(path=identity+'.pcm', sha256=hashlib.sha256(identity.encode()).hexdigest(), sampleRateHz=16000, channels=1, samples=16000))

class DataTests(unittest.TestCase):
    def check_items(self, *items):
        return validate_manifest(dict(schema='muisa-t1-data-v1', items=list(items)))

    def test_disjoint_and_all_group_dimensions(self):
        a,b=item(),item('b','test')
        self.assertEqual(self.check_items(a,b)['items'],2)
        for key in GROUPS:
            x,y=copy.deepcopy(a),copy.deepcopy(b)
            x['groups'][key]=['shared'];y['groups'][key]=['shared']
            with self.subTest(group=key), self.assertRaisesRegex(ValueError,'leakage'):
                self.check_items(x,y)

    def test_descendants_duplicate_audio_and_reviewed_data(self):
        for key in ('sourceId','lineageRoot'):
            a,b=item(),item('b','test');b[key]=a[key]
            with self.assertRaisesRegex(ValueError,'leakage'):self.check_items(a,b)
        a,b=item(),item('b','test');b['pcm']['sha256']=a['pcm']['sha256']
        with self.assertRaisesRegex(ValueError,'leakage'):self.check_items(a,b)
        b=item('R1','test');b['previouslyInspected']=True
        with self.assertRaisesRegex(ValueError,'Inspected'):self.check_items(b)
        b=item('N1');b['evaluationOnly']=True
        with self.assertRaisesRegex(ValueError,'Evaluation-only'):self.check_items(b)

    def test_real_assets_hash_and_path(self):
        a=item();data=struct.pack('<4f',0,.1,-.1,0);a['pcm']['samples']=4;a['pcm']['sha256']=hashlib.sha256(data).hexdigest();manifest=dict(schema='muisa-t1-data-v1',items=[a])
        with tempfile.TemporaryDirectory() as root:
            Path(root,'a.pcm').write_bytes(data)
            self.assertFalse(validate_manifest(manifest,root)['trainingStarted'])
            Path(root,'a.pcm').write_bytes(b'b')
            with self.assertRaisesRegex(ValueError,'hash'):validate_manifest(manifest,root)
            bad=struct.pack('<4f',0,float('nan'),0,0);Path(root,'a.pcm').write_bytes(bad);a['pcm']['sha256']=hashlib.sha256(bad).hexdigest()
            with self.assertRaisesRegex(ValueError,'finite'):validate_manifest(manifest,root)
            a['pcm']['path']='../escape'
            with self.assertRaisesRegex(ValueError,'relative'):validate_manifest(manifest,root)

    def test_negative_source_contract(self):
        for kind in ('real-guitar','rendered-guitar','unknown-music'):
            a=item();a['kind']=kind;a['negativeTarget']=True
            # Valid groups isolate the negative-target rejection.
            a['groups']={k:['a-'+k] for k in GROUPS}
            with self.assertRaisesRegex(ValueError,'not a negative'):self.check_items(a)
        for kind in ('speech','nonmusical'):
            a=item();a['kind']=kind;a['negativeTarget']=True;a['groups']['noiseSource']=['source']
            self.check_items(a)

    def test_causal_boundary_warmup_and_prefix(self):
        note=dict(startSample=1024,endSample=3072,midi=64.2,reliable=True)
        args=dict(frames=12,reliable_intervals=[(0,3072)])
        labels=frame_labels([note],**args)
        self.assertTrue(all(x['activityMask']==0 for x in labels[:3]))
        self.assertEqual(labels[3]['onset'],0)
        self.assertEqual(labels[4]['onset'],1)
        self.assertEqual(labels[7]['pitch'],28)
        self.assertEqual(labels[7]['pitchMask'],1)
        future=dict(startSample=3072,endSample=4096,midi=70,reliable=True)
        self.assertEqual(labels,frame_labels([note,future],**args))

    def test_poly_unknown_and_out_of_range(self):
        a=dict(startSample=0,endSample=4096,midi=64,reliable=True)
        b=dict(startSample=0,endSample=4096,midi=67,reliable=True)
        args=dict(frames=8,reliable_intervals=[(0,4096)])
        poly=frame_labels([a,b],**args)[-1]
        self.assertEqual((poly['activity'],poly['activityMask'],poly['pitchMask']),(1,1,0))
        b['midi']=64  # Same-pitch strings remain poly, not collapsed.
        self.assertEqual(frame_labels([a,b],**args)[-1]['pitchMask'],0)
        a['reliable']=False
        self.assertEqual(frame_labels([a],**args)[-1]['activityMask'],0)
        a['reliable']=True;a['midi']=90
        out=frame_labels([a],**args)[-1]
        self.assertEqual((out['activity'],out['activityMask'],out['pitchMask']),(1,1,0))

    def test_absent_annotation_and_negative(self):
        self.assertEqual(frame_labels([],frames=8,reliable_intervals=[])[-1]['activityMask'],0)
        for kind in ('speech','nonmusical'):
            x=frame_labels([],frames=8,reliable_intervals=[(0,4096)],negative_kind=kind)[-1]
            self.assertEqual((x['activity'],x['activityMask'],x['pitchMask']),(0,1,0))
        with self.assertRaises(ValueError):frame_labels([],frames=8,reliable_intervals=[(0,4096)],negative_kind='unknown-music')
        with self.assertRaises(ValueError):frame_labels([dict(startSample=0,endSample=3000,midi=64,reliable=True)],frames=8,reliable_intervals=[(0,4096)],negative_kind='speech')

if __name__=='__main__':unittest.main()
