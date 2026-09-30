#!/usr/bin/env python3
"""
ADR-009-AUDIT-TRAIL-UNWRITTEN-1 (issue 1632) -- idempotent, fail-closed.

WHY
---
audit_trail holds 19 rows while cloud_ops_events kind=ops_ai_tool holds 64590.
ADR-2026-009 mandates a structured audit_trail record for every tool invocation
producing mutable output. Verified live 2026-09-30: the deployed qnfo-ops bundle
(2.38.14-do-loop-budget-parity) contains ZERO occurrences of "audit_trail", so
the writer does not exist and realized coverage is 0.03%. The trail therefore
cannot reconstruct what changed.

FIX
---
logToolEvent() already records EVERY tool call in cloud_ops_events. Add a second,
narrow write at the same site: MUTATING tools only, SUCCESSFUL calls only, one
audit_trail row each. Read-only tools (ops_d1_query, web_fetch, r2_get,
workspace_read, fleet_status, ...) produce no mutable output and stay out of the
ADR's scope.

audit_trail declares session_id/project_id/phase/task_id NOT NULL, so the loop
writes explicit sentinels (session_id="ops-tool-loop", project_id="qnfo-ops",
phase="execution", task_id=<tool name>). These name the writer; they do not
invent a project session. action is constrained by CHECK to
started|completed|blocked|skipped|deployed|archived -- cf_worker_deploy maps to
"deployed", every other mutating tool to "completed". Calls that did not mutate
(ok=false, dryRun, confirm_required) are NOT recorded.

Idempotent: a second run detects the post-state and writes nothing.
Fail-closed: a missing or ambiguous anchor writes NOTHING and exits non-zero.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = ["qnfo-ops/worker.js"]
MARKER = "ADR-009-AUDIT-TRAIL-UNWRITTEN-1"
NEW_VERSION = "2.38.15-audit-trail-writer"

HELPER_ANCHOR = 'async function logToolEvent(env, name, args, res, ms) {'

HELPER_NEW = '''// ADR-009-AUDIT-TRAIL-UNWRITTEN-1 (issue 1632): ADR-2026-009 mandates a
// structured audit_trail record for every tool invocation producing mutable
// output. Verified live 2026-09-30: this bundle held ZERO "audit_trail"
// references while cloud_ops_events held 64590 ops_ai_tool rows, so realized
// coverage was 0.03% and the trail could not reconstruct what changed.
// Only MUTATING tools that actually SUCCEEDED are recorded -- read-only tools
// produce no mutable output and are out of the ADR's scope. audit_trail
// declares session_id/project_id/phase/task_id NOT NULL, so the loop writes
// explicit sentinels that name the writer rather than inventing a session.
var AUDIT_TRAIL_ACTIONS = {
  ops_d1_write: "completed",
  ops_issue_run: "completed",
  r2_put: "completed",
  r2_delete: "completed",
  kv_put: "completed",
  kv_delete: "completed",
  workspace_write: "completed",
  workspace_edit: "completed",
  workspace_patch: "completed",
  workspace_delete: "completed",
  github_file_write: "completed",
  github_create_branch: "completed",
  github_pr: "completed",
  github_cherry_pick: "completed",
  email_respond: "completed",
  email_mark: "completed",
  research_queue: "completed",
  cf_worker_deploy: "deployed"
};
async function logAuditTrail(env, name, args, res) {
  var act = AUDIT_TRAIL_ACTIONS[name];
  if (!act) return;
  if (!(res && res.ok)) return;
  if (res.dryRun || res.confirm_required) return;
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_trail (session_id, project_id, phase, task_id, action, evidence, worker_name, timestamp, wbs_code) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)").bind("ops-tool-loop", "qnfo-ops", "execution", String(name), act, snippet({ args: args, result: res }, 600), "qnfo-ops", iso(), "ADR-009-AUDIT-TRAIL-UNWRITTEN-1").run();
  } catch (e) {
  }
}
__name(logAuditTrail, "logAuditTrail");
'''

CALL_OLD = ', "qnfo-ops", res && res.ok ? "ok" : res && res.rejected ? "rejected" : "error").run();'
CALL_NEW = CALL_OLD + '\n    await logAuditTrail(env, name, args, res);'


def patch(path):
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        print("FAIL-CLOSED %s: absent" % path)
        return 1, False

    src = open(full, encoding="utf-8", errors="surrogateescape").read()
    orig = src

    if "AUDIT_TRAIL_ACTIONS" in src and "logAuditTrail" in src:
        print("already applied %s" % path)
        return 0, False

    if src.count(HELPER_ANCHOR) != 1:
        print("FAIL-CLOSED %s: logToolEvent anchor matched %d times (expected 1) - nothing written"
              % (path, src.count(HELPER_ANCHOR)))
        return 1, False
    if src.count(CALL_OLD) != 1:
        print("FAIL-CLOSED %s: cloud_ops_events call anchor matched %d times (expected 1) - nothing written"
              % (path, src.count(CALL_OLD)))
        return 1, False
    if "audit_trail" in src:
        print("FAIL-CLOSED %s: 'audit_trail' already present %d times - refusing to guess the existing writer"
              % (path, src.count("audit_trail")))
        return 1, False

    src = src.replace(HELPER_ANCHOR, HELPER_NEW + HELPER_ANCHOR, 1)
    src = src.replace(CALL_OLD, CALL_NEW, 1)

    vm = re.search(r'var VERSION = "([^"]*)"', src)
    if not vm:
        print("FAIL-CLOSED %s: VERSION constant not found" % path)
        return 1, False
    old_ver = vm.group(1)
    if old_ver != NEW_VERSION:
        src = src.replace('var VERSION = "%s"' % old_ver, 'var VERSION = "%s"' % NEW_VERSION, 1)
        print("OK %s: VERSION %s -> %s" % (path, old_ver, NEW_VERSION))

    if src == orig:
        print("no change %s" % path)
        return 0, False

    open(full, "w", encoding="utf-8", errors="surrogateescape").write(src)
    print("WROTE %s (%d -> %d bytes)" % (path, len(orig), len(src)))
    return 0, True


def main():
    print("== %s ==" % MARKER)
    rc = 0
    changed = 0
    for t in TARGETS:
        r, c = patch(t)
        rc = max(rc, r)
        changed += 1 if c else 0
    if rc != 0:
        print("FAIL: %s aborted (fail-closed)" % MARKER)
        return rc
    print("OK: %s complete, %d target(s) changed" % (MARKER, changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
