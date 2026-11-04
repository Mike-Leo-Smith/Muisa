"""Inventory an already acquired official archive. No extraction or inference."""
import argparse,hashlib,json,zipfile
from pathlib import Path
APPROVED={'P1_chords.zip':'be9ef8bbdceb1912d565254e607a6d94','P2_chords.zip':'eb6f74dd19162237189281688ad7ad2e'}
def inventory(path):
 p=Path(path)
 if p.name not in APPROVED:raise ValueError('Expected exact official Guitar-TECHS P1/P2 chord archive')
 md5=hashlib.md5();sha=hashlib.sha256()
 with p.open('rb') as f:
  for data in iter(lambda:f.read(1048576),b''):md5.update(data);sha.update(data)
 if md5.hexdigest()!=APPROVED[p.name]:raise ValueError('Official archive MD5 mismatch')
 with zipfile.ZipFile(p) as z:
  rows=[dict(path=i.filename,bytes=i.file_size,compressedBytes=i.compress_size,crc32=f'{i.CRC:08x}') for i in z.infolist() if not i.is_dir()]
 return dict(source='https://zenodo.org/records/14963133',archive=p.name,sha256=sha.hexdigest(),md5=md5.hexdigest(),files=rows,labelsInferred=False,inferenceRun=False,archiveContentsCrcChecked=False)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('new_output');a=p.parse_args();out=Path(a.new_output)
 if out.exists():raise ValueError('Output exists')
 out.write_text(json.dumps(inventory(a.archive),indent=2)+'\n')
