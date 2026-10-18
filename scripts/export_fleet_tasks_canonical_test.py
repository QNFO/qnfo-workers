#!/usr/bin/env python3
"""export_fleet_tasks_canonical_test.py - unit checks for EXPORT-FLEET-TASKS-CANONICAL-1 (2026-10-19).

The script talks to D1, so these tests exercise the pure parts: the drift comparison, the definition normaliser and
the file shape the exporter promises. The comparison is the part that decides whether CI goes red, so a false
negative there means a snapshot silently lies - which is the defect the exporter exists to remove.

Run: python3 scripts/export_fleet_tasks_canonical_test.py
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("exp", os.path.join(HERE, "export_fleet_tasks_canonical.py"))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

passed = 0


def ok(cond, label, extra=None):
    global passed
    if not cond:
        print("FAIL:", label, extra if extra is not None else "")
        sys.exit(1)
    passed += 1


def task(**kw):
    base = {"version": 1, "enabled": 1, "updated_at": "2026-10-19T00:00:00Z",
            "definition": '{"model":"x","prompt":"y"}'}
    base.update(kw)
    return base


# a file and an export that agree are not drift, and exported_at is not evidence of drift
same = {"tasks": {"a": task()}}
ok(M.diff(same, {"tasks": {"a": task()}}) == [], "identical task sets are not drift")

# key order inside a JSON definition is not a change; a changed word inside it is
reordered = {"tasks": {"a": task(definition='{"prompt":"y","model":"x"}')}}
ok(M.diff(reordered, {"tasks": {"a": task()}}) == [], "definition key order is ignored")
changed = {"tasks": {"a": task(definition='{"model":"z","prompt":"y"}')}}
d = M.diff(changed, {"tasks": {"a": task()}})
ok(len(d) == 1 and d[0]["change"] == "definition", "a changed model id inside the definition is drift", d)

# a task in one side only is reported with the side named, not silently accepted
d = M.diff({"tasks": {}}, {"tasks": {"b": task()}})
ok(d == [{"task": "b", "change": "only in D1"}], "a task only in D1 is reported", d)
d = M.diff({"tasks": {"c": task()}}, {"tasks": {}})
ok(d == [{"task": "c", "change": "only in the file"}], "a task only in the file is reported", d)

# scalar fields report both values so the reader does not have to go look
d = M.diff({"tasks": {"a": task(version=2)}}, {"tasks": {"a": task(version=3)}})
ok(d and d[0]["change"] == "version" and d[0]["file"] == 2 and d[0]["d1"] == 3, "a version change carries both values", d)

# a non-JSON definition is compared as text rather than crashing the gate
d = M.diff({"tasks": {"a": task(definition="not json")}}, {"tasks": {"a": task(definition="not json")}})
ok(d == [], "a non-JSON definition compares as text")
d = M.diff({"tasks": {"a": task(definition="not json")}}, {"tasks": {"a": task(definition="not json ")}})
ok(d == [] or d[0]["change"] == "definition", "a non-JSON definition does not raise", d)

# the exporter keys on fleet_tasks.id, not on the long `name` (measured 2026-10-19: name-keying reported 36/36 tasks
# as new). The SQL it issues is the contract these assertions protect.
src = open(os.path.join(HERE, "export_fleet_tasks_canonical.py"), encoding="utf-8").read()
ok("SELECT id, version, enabled, updated_at, definition FROM fleet_tasks ORDER BY id" in src,
   "the export query keys on id and is stable-ordered")
ok('"definition": r.get("definition")' in src, "the definition is copied verbatim, never re-serialised")

# the file the exporter writes is loadable JSON with a tasks map
with open(os.path.join(os.path.dirname(HERE), "docs", "fleet-tasks-canonical.json"), encoding="utf-8") as fh:
    doc = json.load(fh)
ok(isinstance(doc.get("tasks"), dict) and doc["tasks"], "docs/fleet-tasks-canonical.json carries a non-empty tasks map")
bad = [k for k, v in doc["tasks"].items() if set(v) != {"version", "enabled", "updated_at", "definition"}]
ok(not bad, "every task entry carries exactly the four documented fields", bad[:3])
ok(all(isinstance(v["definition"], str) for v in doc["tasks"].values()), "every definition is text")

print("export_fleet_tasks_canonical_test: %d assertions passed" % passed)
