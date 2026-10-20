// WORKFLOW-FAILURE-AUDIT-1 offline suite (agent_issues 100295). On 2026-10-20 one artifacts_log_http_500 for 1 of 180 repos made scripts/artifacts_sync_assert.py exit 1 and failed
// artifacts-canonical-sync #285 (the next runs passed). The two read-only head lookups of scripts/artifacts_canonical_sync.py now retry a network error, a 429 or a 5xx a bounded number of times.
// Proves: a transient 500 then 200 returns the head; a 404 is not retried and keeps its meaning; a persistent 500 gives up after 3 attempts with the same artifacts_log_http_500 error;
// the GitHub head read retries too; a non-retryable status (403) is returned at once; the retry helper is used by no write (d1 and the repair path call _call).
// WORKFLOW-SCRIPT-FIXES-1 adds: github_meta() (the third read) retries too; main() recomputes the error count after the repair loop (READ-ERROR-RECOVERED-1), so a read error that the
// same run repaired and re-probed in sync is reported as read_errors_recovered and does not fail the run, while an unrepaired, unverified or github_* error still does; the assert prints it.
// Run: node scripts/artifacts-sync-retry.test.mjs   (exit 0 = all passed)
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
fake, calls = seq((503, {}), (200, {"default_branch": "main", "archived": False}))
m._call = fake
mt = m.github_meta(ctx, "o", "r")
out["meta_retry"] = [mt, len(calls)]
fake, calls = seq((404, {}))
m._call = fake
out["meta_404"] = [m.github_meta(ctx, "o", "r"), len(calls)]
fake, calls = seq((503, {}))
m._call = fake
out["meta_persistent"] = [m.github_meta(ctx, "o", "r"), len(calls)]

import io, contextlib
def base_row(i, error=None, in_sync=True, waived=None):
    return {"id": i, "namespace": "ns", "name": i, "branch": "main", "owner": "o", "repo": i, "archived": 0, "waived": waived,
            "artifacts_sha": "a", "github_sha": "a" if in_sync else "b", "artifacts_committed_at": None, "github_committed_at": None,
            "in_sync": in_sync, "error": error}
def run_main(first, second, repaired_ok):
    # first: id -> row from the first probe; second: id -> row from the re-probe after a repair
    seen, d1calls = {}, []
    def fake_probe(c, row):
        i = row["id"]
        seen[i] = seen.get(i, 0) + 1
        return dict(first[i]) if seen[i] == 1 else dict(second.get(i, first[i]))
    m.Ctx = lambda: types.SimpleNamespace(art="https://x", cf_token="t", account="a", gh_token="t")
    m.load_ledger = lambda c, ns: [{"id": i} for i in first]
    m.probe = fake_probe
    m.repair = lambda c, r: {"repaired": repaired_ok, "step": "git_mirror", "status": 0 if repaired_ok else 1, "detail": "x"}
    m.write_state = lambda c, rows: len(rows)
    m.d1 = lambda c, sql, params=None: (d1calls.append((sql, params)) or [], None)
    sys.argv = ["x", "--repair", "--workers", "1"]
    buf, code = io.StringIO(), None
    with contextlib.redirect_stdout(buf):
        try:
            m.main()
        except SystemExit as e:
            code = e.code
    summary = json.loads(buf.getvalue())["summary"]
    runs = [p for s, p in d1calls if "INSERT INTO artifact_sync_runs" in s]
    return {"code": code, "errors": summary["errors"], "recovered": summary.get("read_errors_recovered"), "repaired": summary["repaired"],
            "in_sync": summary["in_sync"], "drifted": summary["drifted"], "sample": summary.get("recovered_sample"),
            "run_failed": runs[0][4] if runs else None, "run_detail": json.loads(runs[0][5]) if runs else None}
http500 = "artifacts_log_http_500"
one = {"a": base_row("a"), "b": base_row("b", http500, False)}
out["main_recovered"] = run_main(one, {"b": base_row("b")}, True)
out["main_unrepaired"] = run_main(one, {}, False)
out["main_reverify_fails"] = run_main(one, {"b": base_row("b", http500, False)}, True)
out["main_github_error"] = run_main({"a": base_row("a"), "g": base_row("g", "github_meta_http_503", False)}, {}, True)
out["main_waived"] = run_main({"a": base_row("a"), "w": base_row("w", http500, False, "76MB blob")}, {}, True)
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
ok(o.meta_retry && o.meta_retry[1] === 2 && o.meta_retry[0] && o.meta_retry[0][0] && o.meta_retry[0][0].default_branch === "main", "github_meta retries a 503 and returns the repo meta", o.meta_retry);
ok(o.meta_404 && o.meta_404[0][1] === "github_repo_missing" && o.meta_404[1] === 1, "github_meta does not retry a 404", o.meta_404);
ok(o.meta_persistent && o.meta_persistent[0][1] === "github_meta_http_503" && o.meta_persistent[1] === 3, "a persistent 503 on github_meta gives up after 3 attempts with the same error", o.meta_persistent);
const mr = o.main_recovered || {};
ok(mr.errors === 0 && mr.recovered === 1 && mr.repaired === 1 && mr.in_sync === 2 && mr.drifted === 0 && mr.code === 0,
  "a read error repaired and re-probed in sync in the same run is recovered, not an error (the run converged)", mr);
ok(mr.run_failed === 0 && mr.run_detail && mr.run_detail.read_errors_recovered === 1, "the artifact_sync_runs row records failed=0 and read_errors_recovered=1 in its detail", mr);
ok(Array.isArray(mr.sample) && mr.sample[0] && mr.sample[0].repo === "ns/b" && mr.sample[0].error === "artifacts_log_http_500", "the recovered repo and its error stay listed in the report", mr.sample);
const mu = o.main_unrepaired || {};
ok(mu.errors === 1 && mu.recovered === 0 && mu.drifted === 1 && mu.code === 2 && mu.run_failed === 1, "a read error whose repair failed is still an error", mu);
const mv = o.main_reverify_fails || {};
ok(mv.errors === 1 && mv.recovered === 0 && mv.run_failed === 1, "a repair that does not re-probe in sync does not clear the error", mv);
const mg = o.main_github_error || {};
ok(mg.errors === 1 && mg.recovered === 0, "a github_* read error is never repaired away and still fails", mg);
const mw = o.main_waived || {};
ok(mw.errors === 0 && mw.recovered === 0, "a waived repo stays outside the error count", mw);

// the assert: a recovered read error passes and says so; an unrecovered one fails
const dir = mkdtempSync(join(tmpdir(), "asa-"));
const assertRun = (summary) => {
  const f = join(dir, "sync.json");
  writeFileSync(f, JSON.stringify({ summary }));
  return spawnSync("python3", ["scripts/artifacts_sync_assert.py"], { encoding: "utf8", env: { ...process.env, SYNC_REPORT: f, GITHUB_STEP_SUMMARY: "" } });
};
let ar = assertRun({ repos: 3, in_sync: 3, in_sync_before_repair: 2, drifted: 0, repaired: 1, errors: 0, waived: 0, read_errors_recovered: 1, recovered_sample: [{ repo: "ns/b", error: "artifacts_log_http_500" }] });
ok(ar.status === 0 && /recovered=1/.test(ar.stdout) && /::notice title=artifacts-sync::read errors recovered/.test(ar.stdout), "the assert passes a run whose read error was recovered and prints a notice naming it", ar.stdout);
ar = assertRun({ repos: 3, in_sync: 2, in_sync_before_repair: 2, drifted: 0, repaired: 0, errors: 1, waived: 0, read_errors_recovered: 0, error_sample: [{ repo: "ns/b", error: "artifacts_log_http_500" }] });
ok(ar.status === 1 && /read failures \(1\)/.test(ar.stdout), "the assert still fails a run with an unrecovered read error", ar.stdout);
ar = assertRun({ repos: 3, in_sync: 3, drifted: 0, repaired: 0, errors: 0, waived: 0 });
ok(ar.status === 0 && !/::notice/.test(ar.stdout), "a clean run from an older report (no recovered field) passes without a notice", ar.stdout);

const src = readFileSync(new URL("./artifacts_canonical_sync.py", import.meta.url), "utf8");
const users = [...src.matchAll(/_call_retry\(/g)].length;
ok(users === 4, "_call_retry is defined once and used by exactly the three reads (two heads and the repo meta)", users);
ok(/_call_retry\(GH \+ "\/repos\/" \+ owner \+ "\/" \+ repo, ctx\.gh_token\)/.test(src), "github_meta reads through the retry helper");
ok(!/_call_retry\([^)]*"(POST|PUT|PATCH|DELETE)"/.test(src), "no write goes through the retry helper");
const d1fn = (src.match(/def d1\([\s\S]*?\n\n\n/) || [""])[0];
ok(/\b_call\(/.test(d1fn) && !/_call_retry\(/.test(d1fn), "the D1 path (which carries every write) still calls _call, not the retry helper", d1fn.slice(0, 120));
console.log("artifacts-sync-retry: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
