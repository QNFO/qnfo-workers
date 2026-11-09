import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { workflowPushPaths } from './github-settings-actions.mjs';

const root = mkdtempSync(join(tmpdir(), 'native-gate-'));
mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
mkdirSync(join(root, 'scripts'));
const artifact = readFileSync(new URL('./push_artifact.sh', import.meta.url), 'utf8');
const head = readFileSync(new URL('./push_head.sh', import.meta.url), 'utf8');
const workflow = command => writeFileSync(join(root, '.github', 'workflows', 'fixture.yml'), `jobs:\n  test:\n    steps:\n      - run: ${command}\n`);
try {
  writeFileSync(join(root, 'scripts', 'push_artifact.sh'), artifact);
  writeFileSync(join(root, 'scripts', 'push_head.sh'), head);
  workflow('bash scripts/push_artifact.sh status ci-status/probe.json');
  assert.equal(workflowPushPaths(root).length, 0);
  writeFileSync(join(root, 'scripts', 'push_artifact.sh'), artifact + '\ngit push origin HEAD:main\n');
  assert.equal(workflowPushPaths(root).length, 1, 'artifact helper with a direct main push is blocked');
  writeFileSync(join(root, 'scripts', 'push_artifact.sh'), artifact);
  writeFileSync(join(root, 'scripts', 'push_head.sh'), head.replaceAll('HEAD:refs/heads/fleet-artifacts', 'HEAD:refs/heads/main'));
  assert.equal(workflowPushPaths(root).length, 1, 'changed artifact target is blocked');
  for (const flag of ['--selftest', '--pr-only']) {
    workflow(`python scripts/canary_revert.py ${flag}`);
    assert.equal(workflowPushPaths(root).length, 0);
  }
  workflow('python scripts/canary_revert.py --targets targets.txt');
  assert.equal(workflowPushPaths(root).length, 1, 'a canary without explicit PR routing is blocked');
  workflow('git push origin HEAD:main # --pr-only');
  assert.equal(workflowPushPaths(root).length, 1, 'an option-like comment never exempts a real push');
  workflow('python scripts/canary_revert.py --targets targets.txt # --pr-only');
  assert.equal(workflowPushPaths(root).length, 1, 'a comment cannot authorize PR-only mode');
  workflow('python scripts/canary_revert.py --targets "--pr-only"');
  assert.equal(workflowPushPaths(root).length, 1, 'an argument value cannot authorize PR-only mode');
  workflow('python scripts/canary_revert.py --pr-only; python scripts/canary_revert.py --targets targets.txt');
  assert.equal(workflowPushPaths(root).length, 1, 'one safe invocation cannot hide a second unsafe invocation');
} finally {
  rmSync(root, { recursive: true, force: true });
}

const python = `import sys
from unittest.mock import patch
sys.path.insert(0,'scripts')
import canary_revert as cr
calls=[]
def git(args, **kwargs):
 calls.append(args)
 if args[:2]==['log','-1']: return 'ordinary change'
 if args[:2]==['rev-list','--parents']: return 'abc parent'
 if args==['rev-parse','HEAD']: return 'revert-sha'
 return ''
with patch.object(cr,'git',side_effect=git), patch.object(cr,'revert_via_pr',return_value={'pr':'fixture-pr'}) as pr, patch.object(cr,'dispatch_redeploy') as deploy:
 result=cr.revert_push('abc',[],False,pr_only=True)
 assert result=={'pr':'fixture-pr'}
 assert pr.call_count==1
 assert not any(c and c[0]=='push' for c in calls), calls
 assert not deploy.called
 calls.clear()
 cr.revert_push('abc',[],False)
 assert ['push','origin','HEAD:main'] in calls
 assert deploy.called
print('PR-only routing passed')
`;
const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', python], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || result.stdout);
console.log('native-check-gate: 10 workflow cases and PR-only/legacy canary routing passed');
