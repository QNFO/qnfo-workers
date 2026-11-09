import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const code = `import os,sys,tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,'scripts')
import pre_push_check as p
original={'PATH':'old-path','FIXTURE':'kept'}
assert p.suite_environment('posix',original)==original
assert p.suite_environment('nt',original,git_path='/nonexistent/git/cmd/git.exe')==original
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory)/'Git With Spaces'
 (root/'cmd').mkdir(parents=True)
 (root/'bin').mkdir()
 (root/'usr'/'bin').mkdir(parents=True)
 (root/'cmd'/'git.exe').write_text('fixture')
 (root/'bin'/'bash.exe').write_text('fixture')
 env=p.suite_environment('nt',original,str(root/'cmd'/'git.exe'))
 assert env['PATH'].split(os.pathsep)[:2]==[str(root/'bin'),str(root/'usr'/'bin')]
 assert env['PATH'].endswith('old-path') and env['FIXTURE']=='kept'
 assert original['PATH']=='old-path'
 with patch.object(p,'suite_environment',return_value=env),patch.object(p.subprocess,'run') as run:
  run.return_value.returncode=0
  run.return_value.stdout='ok'
  run.return_value.stderr=''
  assert p.run(['node','fixture.test.mjs'],directory)==(0,'ok')
  assert run.call_args.kwargs['env']==env
 with patch.object(p.os,'name','nt'),patch.object(p,'suite_environment',return_value=env),patch.object(p.shutil,'which',return_value=str(root/'bin'/'bash.exe')),patch.object(p.subprocess,'run') as run:
  run.return_value.returncode=0
  run.return_value.stdout='ok'
  run.return_value.stderr=''
  assert p.run(['bash','--version'],directory)==(0,'ok')
  assert run.call_args.args[0]==[str(root/'bin'/'bash.exe'),'--version']
print('suite environment selection passed')
`;
const r = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', code], { encoding: 'utf8' });
assert.equal(r.status, 0, r.stderr || r.stdout);
console.log('pre-push-environment: platform, missing shell, spaced installation, preserved PATH and subprocess propagation passed');
