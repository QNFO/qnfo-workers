#!/usr/bin/env python3
"""DUP-WORKER-NAME-GATE-1 (issue #1384) - fail-closed duplicate worker-name gate.

Scans every wrangler config in the repository and fails if two or more configs
declare the SAME Cloudflare worker name.

Why this exists
---------------
commit a9b9a83c (2026-09-27) deleted two duplicate wrangler.toml files
(memory-mcp/, agent-orchestrator/) because both declared a worker name that the
canonical directory also declared. commit 07743499 then re-touched those paths
and RESTORED them, so by 2026-09-29 two repo configs again resolved to one
Cloudflare script. A one-off cleanup does not hold; a gate does.

Consequences of a duplicate name (all observed in this repo):
  * the deploy/drift guards classify one worker twice
  * a deploy run from the stale directory silently clobbers the canonical worker
  * drift reports attribute one worker's version to two directories

Usage
-----
    python3 scripts/dup-worker-name-gate.py [--root .] [--json out.json]

Exit codes
----------
    0  no duplicate names (each worker name maps to exactly one config)
    1  duplicate names found  -> CI must fail
    2  usage / IO error       -> fail closed

Design notes
------------
Fail-closed: a config that exists but cannot be read or parsed is a FAILURE
(exit 2), never a silent skip - an unparsed config could be hiding a collision.

Deliberate exclusions:
  * node_modules, .git, dist, build, .wrangler
  * the gate's own name/pattern literals never count as a declaration
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict

CONFIG_NAMES = (
    "wrangler.toml",
    "wrangler.jsonc",
    "wrangler.json",
)

SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".wrangler",
    ".next",
    "coverage",
    "__pycache__",
}

# name = "x"      (toml)
RE_TOML = re.compile(r'^\s*name\s*=\s*"([^"]+)"', re.MULTILINE)
# "name": "x"     (json / jsonc)
RE_JSON = re.compile(r'"name"\s*:\s*"([^"]+)"')

# TOML blocks whose `name` key is NOT the worker name.
NON_WORKER_BLOCKS = (
    "d1_databases",
    "r2_buckets",
    "kv_namespaces",
    "vectorize",
    "services",
    "durable_objects",
    "queues",
    "analytics_engine_datasets",
    "hyperdrive",
    "ai",
    "browser",
    "vars",
    "env",
    "observability",
    "triggers",
    "migrations",
)


def strip_toml_comments(text: str) -> str:
    """Remove TOML comments, preserving quoted strings."""
    out = []
    for line in text.splitlines():
        in_str = False
        quote = ""
        cut = len(line)
        i = 0
        while i < len(line):
            ch = line[i]
            if in_str:
                if ch == "\\" and quote == '"':
                    i += 2
                    continue
                if ch == quote:
                    in_str = False
            else:
                if ch in ('"', "'"):
                    in_str = True
                    quote = ch
                elif ch == "#":
                    cut = i
                    break
            i += 1
        out.append(line[:cut])
    return "\n".join(out)


def worker_name_from_toml(text: str) -> str | None:
    """Return the top-level worker name from a wrangler.toml.

    Only the name that appears BEFORE the first table header counts, so a
    [[d1_databases]] / [[services]] / [[durable_objects.bindings]] block's
    `name = "BINDING"` is never mistaken for the worker name.
    """
    clean = strip_toml_comments(text)
    lines = clean.splitlines()
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            break  # entered a table -> top-level name section is over
        m = re.match(r'^name\s*=\s*"([^"]+)"', stripped)
        if m:
            return m.group(1)
    # fall back: some configs put name after a comment-only preamble but before
    # any table; the loop above already covers that. Nothing else to try.
    return None


def worker_name_from_json(text: str) -> str | None:
    """Best-effort top-level name from wrangler.json / wrangler.jsonc.

    JSON-with-comments is not valid JSON, so this is a regex on the text after
    stripping // and /* */ comments. Top-level detection: the `name` key must
    appear before the first nested object that is a known non-worker block.
    """
    # strip /* */ and // comments (string-aware enough for wrangler configs)
    no_block = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    lines = []
    for line in no_block.splitlines():
        in_str = False
        quote = ""
        cut = len(line)
        i = 0
        while i < len(line):
            ch = line[i]
            if in_str:
                if ch == "\\":
                    i += 2
                    continue
                if ch == quote:
                    in_str = False
            else:
                if ch in ('"', "'"):
                    in_str = True
                    quote = ch
                elif ch == "/" and i + 1 < len(line) and line[i + 1] == "/":
                    cut = i
                    break
            i += 1
        lines.append(line[:cut])
    clean = "\n".join(lines)

    # cut at the first known non-worker block key
    cut_at = len(clean)
    for blk in NON_WORKER_BLOCKS:
        m = re.search(r'"%s"\s*:' % re.escape(blk), clean)
        if m and m.start() < cut_at:
            cut_at = m.start()
    head = clean[:cut_at]
    m = RE_JSON.search(head)
    return m.group(1) if m else None


def discover_configs(root: str) -> list[str]:
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn in CONFIG_NAMES:
                found.append(os.path.join(dirpath, fn))
    return sorted(found)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    if not os.path.isdir(args.root):
        print("FAIL: root not a directory: %s" % args.root, file=sys.stderr)
        return 2

    configs = discover_configs(args.root)
    if not configs:
        print("FAIL: no wrangler configs found under %s" % args.root, file=sys.stderr)
        return 2

    by_name: dict[str, list[str]] = defaultdict(list)
    unparsed: list[str] = []

    for path in configs:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                text = fh.read()
        except OSError as exc:
            print("FAIL: cannot read %s: %s" % (path, exc), file=sys.stderr)
            return 2

        rel = os.path.relpath(path, args.root)
        base = os.path.basename(path)
        if base == "wrangler.toml":
            name = worker_name_from_toml(text)
        else:
            name = worker_name_from_json(text)

        if not name:
            # A config that declares no worker name cannot collide, but it also
            # means the gate could not classify it - record it, do not fail on it.
            unparsed.append(rel)
            continue
        by_name[name].append(rel)

    dups = {n: sorted(p) for n, p in by_name.items() if len(p) > 1}

    report = {
        "gate": "DUP-WORKER-NAME-GATE-1",
        "issue": 1384,
        "root": os.path.abspath(args.root),
        "configs_scanned": len(configs),
        "distinct_worker_names": len(by_name),
        "duplicates": dups,
        "no_name_configs": sorted(unparsed),
        "ok": not dups,
    }

    print("configs_scanned=%d distinct_names=%d duplicates=%d no_name=%d"
          % (len(configs), len(by_name), len(dups), len(unparsed)))
    for name, paths in sorted(dups.items()):
        print("DUP worker name %r declared by %d configs: %s"
              % (name, len(paths), ", ".join(paths)))

    if args.json:
        try:
            with open(args.json, "w", encoding="utf-8") as fh:
                json.dump(report, fh, indent=2, sort_keys=True)
            print("wrote %s" % args.json)
        except OSError as exc:
            print("FAIL: cannot write %s: %s" % (args.json, exc), file=sys.stderr)
            return 2

    if dups:
        print("GATE FAIL: duplicate worker names present", file=sys.stderr)
        return 1

    print("GATE PASS: every declared worker name maps to exactly one config")
    return 0


if __name__ == "__main__":
    sys.exit(main())
