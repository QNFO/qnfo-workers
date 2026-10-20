// WORKFLOW-FAILURE-AUDIT-1 offline suite (agent_issues 100295). On 2026-10-20 one artifacts_log_http_500 for 1 of 180 repos made scripts/artifacts_sync_assert.py exit 1 and failed
// artifacts-canonical-sync #285 (the next runs passed). The two read-only head lookups of scripts/artifacts_canonical_sync.py now retry a network error, a 429 or a 5xx a bounded number of times.
// Proves: a transient 500 then 200 returns the head; a 404 is not retried and keeps its meaning; a persistent 500 gives up after 3 attempts with the same artifacts_log_http_500 error;
// the GitHub head read retries too; a non-retryable status (403) is returned at once; the retry helper is used by no write (d1 and the repair path call _call).
// Run: node scripts/artifacts-sync-retry.test.mjs   (exit 0 = all passed)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const py = `
import sys, json, types
sys.path.insert(0, "scripts")
import artifacts_canonical_sync as m
m.time.sleep = lambda s: None
ctx = types.SimpleNamespace(art="https://x/accounts/a", cf_token="t", gh_token="t")
def seq(*answers):
    calls = []
    it = iter(answers)
    def fake(url, token, method="GET", body=None, timeout=45):
        calls.append(url)
        try: return next(it)
        except StopIteration: return answers[-1]
    return fake, calls
out = {}
fake, calls = seq((500, {}), (200, {"result": [{"hash": "abc", "committedAt": 1}]}))
m._call = fake
r, e = m.artifacts_head(ctx, "qnfo", "repo", "main")
out["transient_then_ok"] = [r and r["sha"], e, len(calls)]
fake, calls = seq((404, {}))
m._call = fake
r, e = m.artifacts_head(ctx, "qnfo", "repo", "main")
out["not_found"] = [e, len(calls)]
fake, calls = seq((500, {}))
m._call = fake
r, e = m.artifacts_head(ctx, "qnfo", "repo", "main")
out["persistent_500"] = [r, e, len(calls)]
fake, calls = seq((502, {}), (200, [{"sha": "g1", "commit": {"committer": {"date": "2026-10-20T00:00:00Z"}}}]))
m._call = fake
g = m.github_head(ctx, "o", "r", "main")
out["github_retry"] = [json.dumps(g)[:120], len(calls)]
fake, calls = seq((403, {"message": "x"}))
m._call = fake
st, j = m._call_retry("https://x", "t")
out["forbidden"] = [st, len(calls)]
print(json.dumps(out))
`;
const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
let o = {};
try { o = JSON.parse(r.stdout.trim().split("\n").pop()); } catch (e) { ok(false, "the python probe ran", { out: r.stdout, err: r.stderr }); }
ok(o.transient_then_ok && o.transient_then_ok[0] === "abc" && o.transient_then_ok[1] === null && o.transient_then_ok[2] === 2, "a 500 then a 200 returns the head after one retry", o.transient_then_ok);
ok(o.not_found && o.not_found[0] === "artifacts_repo_missing" && o.not_found[1] === 1, "a 404 is not retried and keeps its meaning", o.not_found);
ok(o.persistent_500 && o.persistent_500[0] === null && o.persistent_500[1] === "artifacts_log_http_500" && o.persistent_500[2] === 3, "a persistent 500 gives up after 3 attempts with the same error", o.persistent_500);
ok(o.github_retry && o.github_retry[1] === 2 && /g1/.test(o.github_retry[0]), "the GitHub head read retries a 502", o.github_retry);
ok(o.forbidden && o.forbidden[0] === 403 && o.forbidden[1] === 1, "a 403 is returned at once", o.forbidden);
const src = readFileSync(new URL("./artifacts_canonical_sync.py", import.meta.url), "utf8");
const users = [...src.matchAll(/_call_retry\(/g)].length;
ok(users === 3, "_call_retry is defined once and used by exactly the two reads", users);
ok(!/_call_retry\([^)]*"(POST|PUT|PATCH|DELETE)"/.test(src), "no write goes through the retry helper");
console.log("artifacts-sync-retry: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
