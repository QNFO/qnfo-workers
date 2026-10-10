#!/usr/bin/env python3
"""BINDING-INSTALL-MERGE-1 applier (issue #1448).

DEFECT (measured 2026-09-29)
---------------------------
qnfo-ops `cf_worker_deploy` gated the declared-binding installer on

    if (bindingsOut.length === 0) {
      const _ins = await installDeclaredBindings(env, worker);
      ...
    }

so a worker that already carried ANY non-secret binding could NEVER gain a newly
declared one. `installDeclaredBindings()` was reachable only on the bootstrap
path (a worker with zero bindings).

CANONICAL VICTIM: qnfo-research-exec.
  * qnfo-research-exec/wrangler.toml declares
        [[services]]
        binding = "QNFO_AI"
        service = "qnfo-ai"
  * cf_worker_bindings(qnfo-research-exec) returns its bindings and NONE is
    QNFO_AI (AI, GITHUB_TOKEN, GRAPH_DB, LIVING_PAPER, MIRROR, PDF_SVC,
    PILOT_TOKEN, QNFO_AUDIT, RESEARCH_HALT, ROUTER_TOKEN).
  * Consequence: every router call degraded to the Workers AI fallback --
    cloud_ops_events kind=gw-fallback n=609, span
    2026-09-16T10:41:55Z -> 2026-09-29T16:32:28Z, sample text
    "gateway HTTP 404; falling back to Workers AI".
  * The fallback returns short output, so stageRevise()'s `revised.length >= 1e4`
    gate (qnfo-research-exec/worker.js) failed, markError('revise: output too
    short') fired, recover_count reached 3 and the pipeline terminalised:
    agent_issues 1291, 1304, 1306, 1345, 1366 and siblings (RESEARCH-TERMINAL).

FIX
---
Always call the installer, then UNION its declared non-secret bindings into the
live set. Live wins on (type,name): an existing binding is never overwritten or
removed. The installer emits non-secret types only (d1, r2_bucket, kv_namespace,
ai, service, vectorize, durable_object_namespace, queue, workflow, send_email,
browser, ai_search, artifacts), so secret_text / secret_key bindings are
untouched by construction.

TARGETS
-------
Both artifacts, because deploy-qnfo-ops.yml asserts byte parity between them as a
BLOCKING step:

    qnfo-ops/worker.js
    qnfo-ops/deployed-current.worker.js

FAIL-CLOSED / IDEMPOTENT
------------------------
* A file already carrying MARKER is left alone (idempotent re-run is a no-op).
* A file where the anchor does not match EXACTLY ONCE aborts the whole run with
  exit 2 and writes nothing -- a partially patched pair can never be committed.
* A file that already has the marker but still has the anchor is treated as a
  contradiction and aborts (exit 2), because that means an earlier edit is
  malformed.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

MARKER = "BINDING-INSTALL-MERGE-1"
TARGETS = [
    "qnfo-ops/worker.js",
    "qnfo-ops/deployed-current.worker.js",
]

# The legacy gate, captured with its own indentation so the replacement inherits it.
ANCHOR_RE = re.compile(
    r"^([ \t]*)if \(bindingsOut\.length === 0\) \{\n"
    r"\1  const _ins = await installDeclaredBindings\(env, worker\);\n"
    r"\1  bindingInstallNote = _ins\.note \|\| null;\n"
    r"\1  if \(_ins\.bindings && _ins\.bindings\.length\) \{\n"
    r"\1    bindingsOut = _ins\.bindings;\n"
    r"\1    bindingsInstalled = _ins\.installed;\n"
    r"\1  \}\n"
    r"\1\}\n",
    re.MULTILINE,
)


def replacement(indent: str) -> str:
    i = indent
    return (
        f"{i}// {MARKER} (2026-09-29, issue #1448, FATAL): this installer used to run ONLY when\n"
        f"{i}// bindingsOut.length === 0, so a worker that already carried any non-secret binding\n"
        f"{i}// could NEVER gain a newly declared one. Canonical victim: qnfo-research-exec never\n"
        f"{i}// received its declared QNFO_AI service binding (609 gw-fallback 404s from 2026-09-16),\n"
        f"{i}// the revise stage's >=10000-char gate then failed on the short fallback output, and the\n"
        f"{i}// pipeline terminalised. Always install, then UNION the declared non-secret bindings\n"
        f"{i}// into the live set. Live wins on (type,name): nothing existing is overwritten or\n"
        f"{i}// removed, and the installer emits non-secret types only, so secrets are untouched.\n"
        f"{i}{{\n"
        f"{i}  const _ins = await installDeclaredBindings(env, worker);\n"
        f"{i}  bindingInstallNote = _ins.note || null;\n"
        f"{i}  const _decl = _ins && Array.isArray(_ins.bindings) ? _ins.bindings : [];\n"
        f"{i}  if (bindingsOut.length === 0 && _decl.length) {{\n"
        f"{i}    bindingsOut = _decl;\n"
        f"{i}    bindingsInstalled = _decl.length;\n"
        f"{i}  }} else if (_decl.length) {{\n"
        f'{i}    const _seen = new Set(bindingsOut.map(function(b) {{ return b.type + ":" + b.name; }}));\n'
        f"{i}    for (const _b of _decl) {{\n"
        f'{i}      const _k = _b.type + ":" + _b.name;\n'
        f"{i}      if (_seen.has(_k)) continue;\n"
        f"{i}      bindingsOut.push(_b);\n"
        f"{i}      _seen.add(_k);\n"
        f"{i}      bindingsInstalled++;\n"
        f"{i}    }}\n"
        f"{i}  }}\n"
        f"{i}}}\n"
    )


def behavioural_verify(text: str, name: str) -> list[str]:
    """Assert the patched artifact carries the fix and not the legacy gate."""
    errs: list[str] = []
    if text.count(MARKER) != 1:
        errs.append(f"{name}: expected exactly 1 {MARKER} marker, got {text.count(MARKER)}")
    if text.count("if (bindingsOut.length === 0) {") != 0:
        errs.append(f"{name}: legacy gate `if (bindingsOut.length === 0) {{` still present")
    if text.count("_seen.has(_k)") != 1:
        errs.append(f"{name}: union dedup guard `_seen.has(_k)` missing")
    if text.count("const _decl = _ins && Array.isArray(_ins.bindings) ? _ins.bindings : [];") != 1:
        errs.append(f"{name}: declared-binding extraction missing")
    if text.count("bindingsInstalled = _decl.length;") != 1:
        errs.append(f"{name}: bootstrap assignment missing")
    return errs


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    changed: list[str] = []
    already: list[str] = []
    errors: list[str] = []
    plan: list[tuple[Path, str, str]] = []

    for rel in TARGETS:
        path = root / rel
        if not path.exists():
            errors.append(f"{rel}: file not found")
            continue
        text = path.read_text(encoding="utf-8")
        has_marker = MARKER in text
        matches = ANCHOR_RE.findall(text)
        n = len(matches)

        if has_marker and n == 0:
            already.append(rel)
            continue
        if has_marker and n > 0:
            errors.append(
                f"{rel}: contradictory state -- marker present AND legacy anchor "
                f"present {n}x; refusing to guess"
            )
            continue
        if n != 1:
            errors.append(
                f"{rel}: legacy anchor matched {n}x (expected exactly 1); refusing to patch"
            )
            continue

        indent = matches[0]
        new_text = ANCHOR_RE.sub(lambda m: replacement(m.group(1)), text, count=1)
        errs = behavioural_verify(new_text, rel)
        if errs:
            errors.extend(errs)
            continue
        plan.append((path, text, new_text))

    if errors:
        print("FAIL-CLOSED: no files written")
        for e in errors:
            print(f"  ERROR {e}")
        return 2

    for path, _old, new_text in plan:
        path.write_text(new_text, encoding="utf-8")
        changed.append(str(path.relative_to(root)))

    print(f"marker={MARKER}")
    for rel in changed:
        print(f"  PATCHED  {rel}")
    for rel in already:
        print(f"  ALREADY  {rel}")
    if not changed:
        print("no-op: every target already carries the fix")
    return 0


if __name__ == "__main__":
    sys.exit(main())
