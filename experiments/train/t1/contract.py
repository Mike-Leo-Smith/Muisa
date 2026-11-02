"""Bound T1 v2 audit contract. No optimizer, network or implicit label generation."""
import hashlib
import json
import math
import struct
from pathlib import Path
from dataset import frame_labels, GROUPS

def integer(x, minimum=0):
    return type(x) is int and x >= minimum

def digest(data):
    return hashlib.sha256(data).hexdigest()

def asset(root, spec):
    path=Path(spec['path']);base=Path(root).resolve();target=(base/path).resolve()
    if path.is_absolute() or '..' in path.parts or not target.is_relative_to(base):raise ValueError('Unsafe asset path')
    data=target.read_bytes()
    if digest(data)!=spec['sha256']:raise ValueError('Asset hash mismatch')
    return data

def flags(obj):
    for k in ('previouslyInspected','evaluationOnly'):
        if type(obj.get(k)) is not bool:raise ValueError('Explicit boolean '+k+' required')

def audit(manifest, root, purpose='audit'):
    if manifest.get('schema')!='muisa-t1-data-v2':raise ValueError('Require bound v2 contract')
    if purpose not in ('audit','training','selection','frozen-evaluation'):raise ValueError('Invalid purpose')
    sources=manifest['sources'];items=manifest['items'];assignments={};seen=set();output=[]
    if not sources or not items:raise ValueError('Empty inventory')
    for source_id,s in sources.items():
        if not source_id:raise ValueError('Empty parent id')
        flags(s);asset(root,s['asset'])
        if s['kind'] not in ('real-guitar','rendered-guitar','speech','nonmusical','unknown-music'):raise ValueError('Unknown source kind')
        if not all(isinstance(s['license'].get(k),str) and s['license'][k] for k in ('id','source','attribution')):raise ValueError('Missing license')
        if not integer(s.get('sampleRateHz'),1) or not integer(s.get('samples'),1):raise ValueError('Invalid parent dimensions')
        if set(s['groups'])!=set(GROUPS):raise ValueError('Incomplete parent groups')
        for values in s['groups'].values():
            if values is not None and (not isinstance(values,list) or not values or any(not isinstance(v,str) or not v for v in values)):raise ValueError('Invalid parent group')
        required=('player','session','recording') if s['kind']=='real-guitar' else ('midiPiece','instrumentBank') if s['kind']=='rendered-guitar' else ('noiseSource',)
        if any(not s['groups'][k] for k in required):raise ValueError('Missing parent source groups')
    for item in items:
        flags(item)
        if not item['id'] or item['id'] in seen:raise ValueError('Duplicate item')
        seen.add(item['id'])
        split=item['split']
        if split not in ('train','development','observed-validation','validation','test'):raise ValueError('Invalid split')
        parents=item['parents']
        if not parents or len({p['sourceId'] for p in parents})!=len(parents):raise ValueError('Missing/duplicate parents')
        target=[];protected=False;inspected=False;keys=[]
        for p in parents:
            s=sources[p['sourceId']]
            if p['sha256']!=s['asset']['sha256']:raise ValueError('Parent binding mismatch')
            if p['role'] not in ('target','interference'):raise ValueError('Unknown mix role')
            if p['role']=='target':target.append(s)
            protected|=s['evaluationOnly'];inspected|=s['previouslyInspected']
            keys.extend([('parent',p['sourceId']),('parentHash',p['sha256'])])
            for k,values in s['groups'].items():keys.extend((k,v) for v in values or [])
        if len(target)!=1 or item['kind']!=target[0]['kind']:raise ValueError('Target/source kind mismatch')
        if protected and not item['evaluationOnly']:raise ValueError('Cannot erase evaluationOnly ancestry')
        if inspected and not item['previouslyInspected']:raise ValueError('Cannot erase inspected ancestry')
        if item['previouslyInspected'] and split in ('validation','test'):raise ValueError('Observed input cannot be unseen validation/test')
        if item['evaluationOnly'] and (split not in ('test','observed-validation') or purpose in ('training','selection')):raise ValueError('Frozen input cannot train or select models/thresholds')
        if purpose=='training' and split!='train':raise ValueError('Training requires train split')
        for key in keys:
            if key in assignments and assignments[key]!=split:raise ValueError('Cross-split parent/group leakage')
            assignments[key]=split
        pcm=item['pcm'];mapping=item['timeMapping']
        if pcm['sampleRateHz']!=16000 or pcm['channels']!=1 or not integer(pcm['samples'],1):raise ValueError('Invalid prepared PCM')
        raw=asset(root,pcm)
        prepared_key=('preparedPcmHash',pcm['sha256'])
        if prepared_key in assignments and assignments[prepared_key]!=split:
            raise ValueError('Cross-split prepared PCM leakage')
        assignments[prepared_key]=split
        if len(raw)!=pcm['samples']*4 or any(not math.isfinite(v[0]) for v in struct.iter_unpack('<f',raw)):raise ValueError('Invalid PCM length/value')
        if mapping!=dict(sourceId=next(p['sourceId'] for p in parents if p['role']=='target'),sourceRateHz=target[0]['sampleRateHz'],outputRateHz=16000,cropStartSample=mapping.get('cropStartSample'),cropEndSample=mapping.get('cropEndSample'),additionalDelaySamples=0):raise ValueError('Unsupported/incomplete time mapping')
        a,b=mapping['cropStartSample'],mapping['cropEndSample']
        if not integer(a) or not integer(b,1) or not a<b<=target[0]['samples']:raise ValueError('Invalid crop range')
        expected=((b-a)*16000+target[0]['sampleRateHz']-1)//target[0]['sampleRateHz']
        if pcm['samples']!=expected:raise ValueError('Crop/resample PCM length mismatch')
        transform=item['transform']
        if set(transform)!= {'resample','mix','augmentation'}:raise ValueError('Incomplete transform')
        rs=transform['resample']
        if rs!=dict(method='scipy.signal.resample_poly',version=rs.get('version'),window=['kaiser',5.0],padtype='constant',normalization='none') or not isinstance(rs['version'],str) or not rs['version']:raise ValueError('Incomplete resample recipe')
        if transform['augmentation']!=[]:raise ValueError('Augmentation unsupported until an audited recipe is implemented')
        mixes=transform['mix']
        if {m['sourceId'] for m in mixes}!={p['sourceId'] for p in parents} or len(mixes)!=len(parents):raise ValueError('Incomplete mix parents')
        for m in mixes:
            if set(m)!={'sourceId','gain','offsetSamples'} or type(m['gain']) not in (float,int) or not math.isfinite(m['gain']) or not integer(m['offsetSamples']):raise ValueError('Incomplete mix recipe')
        # Version 2 is deliberately bounded: other mixing/resampling is recorded but
        # cannot become supervised data until source-to-output replay is implemented.
        if len(parents)!=1 or mixes[0]['gain']!=1 or mixes[0]['offsetSamples']!=0:raise ValueError('Mix replay not yet supported for supervised T1')
        if target[0].get('format')!='float32-le' or target[0]['sampleRateHz']!=16000:
            raise ValueError('Only exact native16k PCM replay supported; GuitarSet uses separate audit adapter')
        original=asset(root,target[0]['asset'])
        if len(original)!=4*target[0]['samples'] or raw!=original[a*4:b*4]:raise ValueError('Parent crop PCM replay mismatch')
        annotation=json.loads(asset(root,item['annotation']))
        if annotation['binding']!=dict(pcmSha256=pcm['sha256'],samples=pcm['samples'],kind=item['kind'],timeMapping=mapping,parentHashes={p['sourceId']:p['sha256'] for p in parents}):raise ValueError('Annotation/PCM/source mapping mismatch')
        if type(annotation.get('complete')) is not bool:raise ValueError('Explicit annotation coverage required')
        if item['kind']=='unknown-music' and (annotation['complete'] or annotation['reliableIntervals']):raise ValueError('Unknown music cannot become reliable negatives')
        if not annotation['complete'] and annotation['reliableIntervals']:raise ValueError('Incomplete annotation cannot certify intervals')
        n=pcm['samples'];hop=256
        if annotation['frames']!=n//hop:raise ValueError('Frame count mismatch')
        for start,end in annotation['reliableIntervals']:
            if not integer(start) or not integer(end,1) or not start<end<=n:raise ValueError('Interval out of PCM bounds')
        for note in annotation['notes']:
            if not integer(note['startSample']) or not integer(note['endSample'],1) or not note['startSample']<note['endSample']<=n:raise ValueError('Note out of PCM bounds')
            if type(note['midi']) not in (int,float) or not math.isfinite(note['midi']) or not 0<=note['midi']<=127:raise ValueError('Invalid MIDI')
        if item['kind'] in ('speech','nonmusical') and annotation['notes']:raise ValueError('Negative source has target notes')
        labels=frame_labels(annotation['notes'],frames=n//hop,reliable_intervals=annotation['reliableIntervals'],negative_kind=item['kind'] if item['kind'] in ('speech','nonmusical') else None)
        output.append(dict(id=item['id'],split=split,previouslyInspected=item['previouslyInspected'],evaluationOnly=item['evaluationOnly'],labels=labels,tailSamples=n%hop))
    return output

def collate(audited):
    """Numeric label batch only. None -> -100 sentinel, independent 0/1 masks."""
    if not audited:raise ValueError('Empty batch')
    length=max(len(i['labels']) for i in audited);result={k:[] for k in ('activity','onset','pitch','activityMask','onsetMask','pitchMask')}
    for item in audited:
        for key in result:
            row=[]
            for f in item['labels']:
                if key=='pitch':
                    value=f['pitch'] if f['pitchMask'] else -100
                    if type(value) is not int or (f['pitchMask'] and not 0<=value<49):raise ValueError('Invalid supervised pitch')
                else:
                    value=f[key]
                    if type(value) is not int or value not in (0,1):raise ValueError('Invalid binary label/mask')
                row.append(value)
            result[key].append(row+([-100] if key=='pitch' else [0])*(length-len(row)))
    return result
