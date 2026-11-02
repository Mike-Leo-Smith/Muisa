"""Fetch pinned official code and tiny/small weights into an external cache."""
import bz2,hashlib,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True)
source_sha='c9b71ce61491454125a0693f584f7244f29d9884';weights_sha='bb29b8d99a89924476d112d27ed470e4ac5617c0'
for name,sha,sparse in [('crepe-source',source_sha,False),('crepe-weights',weights_sha,True)]:
 path=root/name;path.mkdir(exist_ok=True)
 def git(*args):return subprocess.check_output(['git','-C',str(path),*args],text=True).strip()
 if not (path/'.git').exists():
  git('init');git('remote','add','origin','https://github.com/marl/crepe.git')
  if sparse:git('sparse-checkout','set','--no-cone','/model-tiny.h5.bz2','/model-small.h5.bz2')
  git('fetch','--filter=blob:none','--depth','1','origin',sha);git('checkout','--detach','FETCH_HEAD')
 if git('rev-parse','HEAD')!=sha:raise RuntimeError('Cache commit mismatch; use a fresh directory')
for name,expected in [('tiny','409254d6a537cc432061112b7ec5f6fd283658f108fc2abc24db9c25858b42df'),('small','67cff9f4bf1f3b63496fdcb631b830f994f2904705401cd208d2b86a0d16654a')]:
 data=bz2.decompress((root/'crepe-weights'/f'model-{name}.h5.bz2').read_bytes());assert hashlib.sha256(data).hexdigest()==expected
 (root/'crepe-source'/'crepe'/f'model-{name}.h5').write_bytes(data)
print('Prepared pinned source and verified tiny/small weights:',root/'crepe-source')
