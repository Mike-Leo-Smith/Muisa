"""Legacy v1 metadata checks and internal frame primitive. NOT a training authorization.
Use contract.audit (v2) / audit.py for bound source-to-label validation.
"""
import hashlib
import json
import math
import struct
from pathlib import Path

GROUPS = ('player', 'session', 'recording', 'midiPiece', 'instrumentBank', 'noiseSource', 'rirSource')
SPLITS = ('train', 'development', 'validation', 'test')

def validate_manifest(manifest, root=None):
    if manifest.get('schema') != 'muisa-t1-data-v1':
        raise ValueError('Unsupported schema')
    items = manifest.get('items')
    if not isinstance(items, list) or not items:
        raise ValueError('Require nonempty items')
    ids, assignments = set(), {}
    for item in items:
        identity = item['id']
        if not isinstance(identity, str) or not identity or identity in ids:
            raise ValueError('Duplicate/empty item id')
        ids.add(identity)
        split = item['split']
        if split not in SPLITS:
            raise ValueError('Invalid split')
        if not item.get('sourceId') or not item.get('lineageRoot'):
            raise ValueError('Original source and augmentation lineage required')
        if item.get('previouslyInspected') is not False and split in ('validation', 'test'):
            raise ValueError('Inspected or unknown inspection history cannot be held out')
        if item.get('evaluationOnly') and split == 'train':
            raise ValueError('Evaluation-only input cannot train')
        if item['kind'] not in ('real-guitar', 'rendered-guitar', 'speech', 'nonmusical', 'unknown-music'):
            raise ValueError('Unsupported source kind')
        license_info = item['license']
        if not all(isinstance(license_info.get(k), str) and license_info[k] for k in ('id', 'source', 'attribution')):
            raise ValueError('License/source/attribution required')
        groups = item['groups']
        if set(groups) != set(GROUPS):
            raise ValueError('Explicit group dimensions required, null only when not applicable')
        required = ('player', 'session', 'recording') if item['kind'] == 'real-guitar' else ('midiPiece', 'instrumentBank') if item['kind'] == 'rendered-guitar' else ('noiseSource',)
        if any(not groups[k] for k in required):
            raise ValueError('Missing source-specific groups')
        # Conservative initial policy: every known source dimension must remain in one split.
        # Shared resources can connect components; reject rather than silently weaken isolation.
        keys = [('sourceId', item['sourceId']), ('lineageRoot', item['lineageRoot'])]
        for k, values in groups.items():
            if values is None:
                continue
            if not isinstance(values, list) or not values or any(not isinstance(v, str) or not v for v in values):
                raise ValueError('Groups must be nonempty string lists or null')
            keys.extend((k, v) for v in values)
        pcm = item['pcm']
        digest = pcm['sha256']
        if not isinstance(digest, str) or len(digest) != 64 or any(x not in '0123456789abcdef' for x in digest):
            raise ValueError('Invalid PCM asset SHA256')
        keys.append(('asset', digest))
        if pcm['sampleRateHz'] != 16000 or pcm['channels'] != 1 or not isinstance(pcm['samples'], int) or isinstance(pcm['samples'], bool) or pcm['samples'] <= 0:
            raise ValueError('Require prepared 16k mono nonempty PCM')
        for key in keys:
            if key in assignments and assignments[key] != split:
                raise ValueError('Cross-split source/group leakage: ' + key[0])
            assignments[key] = split
        path = Path(pcm['path'])
        if path.is_absolute() or '..' in path.parts:
            raise ValueError('Require relative asset path')
        if root is not None:
            base = Path(root).resolve(); target = (base/path).resolve()
            if not target.is_relative_to(base) or not target.is_file():
                raise ValueError('Missing or escaping local asset')
            data = target.read_bytes()
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('Asset hash mismatch')
            if len(data) != 4*pcm['samples'] or any(not math.isfinite(v[0]) for v in struct.iter_unpack('<f', data)):
                raise ValueError('Require finite float32 little-endian raw PCM with matching length')
        if item.get('negativeTarget') and item['kind'] not in ('speech', 'nonmusical'):
            raise ValueError('Unannotated music/guitar is not a negative')
    return {'items': len(items), 'splits': {s: sum(i['split'] == s for i in items) for s in SPLITS}, 'trainingStarted': False}

def frame_labels(notes, *, frames, reliable_intervals, negative_kind=None, hop=256, window=1024, midi_min=36, midi_max=84):
    """Sample-index labels, right-aligned causal frames. No score correctness input.

    reliable_intervals certify COMPLETE target annotation, not merely note presence.
    Negative evidence requires explicit speech/nonmusical provenance upstream.
    Pitch needs exactly one reliable note across the full trailing window.
    """
    if any(not isinstance(v, int) or isinstance(v, bool) or v <= 0 for v in (frames, hop, window)) or window < hop:
        raise ValueError('Invalid frame dimensions')
    if negative_kind not in (None, 'speech', 'nonmusical') or (negative_kind and notes):
        raise ValueError('Invalid negative target evidence')
    for a, b in reliable_intervals:
        if not isinstance(a, int) or not isinstance(b, int) or a < 0 or b <= a:
            raise ValueError('Invalid reliable interval')
    for n in notes:
        if not isinstance(n['startSample'], int) or not isinstance(n['endSample'], int) or n['startSample'] < 0 or n['endSample'] <= n['startSample'] or not math.isfinite(n['midi']):
            raise ValueError('Invalid note')
        if not isinstance(n.get('reliable'), bool):
            raise ValueError('Explicit label reliability required')
    out = []
    for i in range(frames):
        end = (i+1)*hop; left = end-window
        trusted = left >= 0 and any(a <= left and end <= b for a,b in reliable_intervals)
        active = [n for n in notes if n['startSample'] < end <= n['endSample']]
        overlapping = [n for n in notes if n['startSample'] < end and n['endSample'] > left]
        certain = trusted and all(n['reliable'] for n in overlapping)
        pitch_ok = certain and len(overlapping) == 1 and overlapping[0]['startSample'] <= left and overlapping[0]['endSample'] >= end and midi_min <= overlapping[0]['midi'] <= midi_max
        # End-exclusive hop: an onset at end is not visible until the next frame.
        onset = any(end-hop <= n['startSample'] < end for n in notes)
        out.append(dict(endSample=end, activity=int(bool(active)), activityMask=int(certain), onset=int(onset), onsetMask=int(certain), pitch=int(math.floor(overlapping[0]['midi']+.5))-midi_min if pitch_ok else None, pitchMask=int(pitch_ok)))
    return out

if __name__ == '__main__':
    raise SystemExit('Unbound v1 CLI retired. Use audit.py bound MANIFEST --root ROOT or audit.py guitarset MANIFEST --root ROOT.')
