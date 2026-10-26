// INFRA-PROBES-1 offline suite: replays migrations/2026-10-26-infra-probes.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped, decision_log only inserted into); every contract it re-points ends active with the intended transport and a
// probe the real parsers accept (the consumer's parse_code_probe for code-read, the worker's own rtHttpSpec and rtHttpObserve for external-https); each code-read probe PASSES against the files of this tree (the marker is
// present, the swallow of the qnfo-ai binding wrapper is absent); the three d1 probes measure what they say on a crafted world (rows that predate the fix, short turns, honest-line replies and fresh audit rows are not
// counted; the defect rows are); the stuck-run probes read the pretty-printed GitHub answer with json:total_count (the compact contains form of the old probe could never match); two failure modes and their detector
// contracts and one decision_log row are written; a replay adds nothing; the Rollback line puts the contracts back.
// Output MUST contain "0 failed" on success.   node migrations/infra-probes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-infra-probes.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(![...body.matchAll(/LIKE\s+'((?:[^']|'')*)'/gi)].some((m) => Buffer.byteLength(m[1]) > 50), "no LIKE pattern above 50 bytes (D1 limit)");

const CLASSES = ["issue-1000018", "issue-1000036", "issue-1000043", "issue-1000178", "issue-1000162", "issue-1000157", "issue-1000275", "fm-ops-capped-reply-logged-ok"];
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL DEFAULT '', verify_transport TEXT NOT NULL DEFAULT 'd1-query', max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT 'x', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  for (const c of CLASSES) {
    const isIssue = c.startsWith("issue-");
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict, module, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, 5)")
      .run(c, isIssue ? Number(c.slice(6)) : null, "SELECT 'closed' AS expected, NULL AS observed", c === "issue-1000275" ? "runner-https" : "d1-query", c === "fm-ops-capped-reply-logged-ok" ? "active" : "superseded", "superseded:closure-observing-probe-at-birth", c.startsWith("fm-") ? "failure-mode" : "probe-template-v3-generic");
  }
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, module) VALUES ('issue-9999999', 9999999, 'x', 'd1-query', 'superseded', 'other')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const w = world();
w.exec(sql);
const rc = (cls) => q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", cls);

const expectTransport = { "issue-1000018": "code-read", "issue-1000036": "code-read", "issue-1000043": "code-read", "issue-1000178": "code-read", "issue-1000162": "d1-query", "issue-1000157": "d1-query", "issue-1000275": "external-https", "fm-ops-capped-reply-logged-ok": "d1-query" };
for (const c of CLASSES) {
  const r = rc(c);
  ok(r.status === "active" && r.verify_transport === expectTransport[c] && r.last_verdict === null && r.attempts === 0, c + " is active on " + expectTransport[c] + " with a clean slate", r && { s: r.status, t: r.verify_transport, v: r.last_verdict, a: r.attempts });
}
ok(rc("issue-9999999").status === "superseded", "a contract that is not named is not touched");
ok(["issue-1000018", "issue-1000036", "issue-1000043", "issue-1000178", "issue-1000162", "issue-1000157", "issue-1000275"].every((c) => rc(c).module === "infra-probes-1"), "the re-pointed issue contracts carry the module infra-probes-1 (the Rollback line finds them by it)");
ok(rc("fm-ops-capped-reply-logged-ok").module === "failure-mode", "the failure-mode contract keeps its module");
ok(rc("issue-1000275").verify_transport === "external-https" && rc("issue-1000275-in-progress") && rc("issue-1000275-in-progress").issue_id === 1000275, "issue 1000275 has a second contract for the in-progress run");

// the code-read probes: parsed by the consumer's own parser and PASSING against this tree
const codeSpecs = ["issue-1000018", "issue-1000036", "issue-1000043", "issue-1000178"].map((c) => [c, JSON.parse(rc(c).verify_probe)]);
for (const [c, sp] of codeSpecs) {
  ok(Array.isArray(sp.paths) && sp.paths.length === 1 && typeof sp.contains === "string" && !("absent" in sp), c + ": one path, one contains");
  ok(existsSync(join(root, sp.paths[0])) && readFileSync(join(root, sp.paths[0]), "utf8").includes(sp.contains), c + ": the marker is in " + sp.paths[0] + " of this tree (the probe passes)", sp);
}
const fmSpec = JSON.parse(rc("fm-ai-binding-swallow-capacity-error").verify_probe);
ok(rc("fm-ai-binding-swallow-capacity-error").verify_transport === "code-read" && fmSpec.paths[0] === "qnfo-ai/worker.js" && !readFileSync(join(root, "qnfo-ai/worker.js"), "utf8").includes(fmSpec.absent) && fmSpec.absent.length > 20, "the swallow detector reads qnfo-ai/worker.js and the empty-success return is absent from this tree", fmSpec);
{
  const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
  if (!PY) console.log("note: no python 3 on this host, the consumer parser check is skipped");
  else {
    const specs = codeSpecs.map(([, sp]) => JSON.stringify(sp)).concat([JSON.stringify(fmSpec)]);
    const prog = "import sys, json, os\nos.environ.setdefault('CLOUDFLARE_ACCOUNT_ID','a'); os.environ.setdefault('CLOUDFLARE_API_TOKEN','t'); os.environ.setdefault('CF_API_TOKEN','t')\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\nout = []\nfor s in json.loads(sys.stdin.read()):\n    p, why = r.parse_code_probe(s)\n    out.append([p is not None, why])\nprint(json.dumps(out))";
    const run = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: JSON.stringify(specs), encoding: "utf8" });
    let parsed = null;
    try { parsed = JSON.parse(String(run.stdout).trim().split("\n").pop()); } catch (e) { parsed = null; }
    ok(run.status === 0 && Array.isArray(parsed) && parsed.length === 5 && parsed.every((x) => x[0] === true), "the consumer's own parse_code_probe accepts all five code-read specs", { status: run.status, parsed, err: String(run.stderr).slice(0, 200) });
  }
}

// external-https: the worker's own parser, and the pretty-printed GitHub answer
{
  const src = readFileSync(join(root, "qnfo-fleet-control/worker.js"), "utf8");
  const a = Math.min(src.indexOf("var RT_FLEET_HOSTS"), src.indexOf("var RT_HTTP_HOSTS")), b = src.indexOf("async function rtHttpProbe(");
  ok(a > 0 && b > a, "rtHttpSpec and rtHttpObserve are found in the worker");
  const cx = vm.createContext({ URL, String, JSON, Object, Array, console });
  const X = vm.runInContext(src.slice(a, b) + "\n;({ rtHttpSpec, rtHttpObserve });", cx);
  for (const cls of ["issue-1000275", "issue-1000275-in-progress"]) {
    const sp = X.rtHttpSpec(rc(cls).verify_probe);
    ok(sp.ok === true && sp.check === "json:total_count" && sp.expected === "0" && sp.method === "GET" && /^https:\/\/api\.github\.com\/repos\/QNFO\/qnfo-workers\/actions\/runs\?status=(queued|in_progress)&created=%3C2026-10-2[03]&per_page=1$/.test(sp.url), cls + ": the worker accepts the spec", sp);
    ok(X.rtHttpObserve(sp, 200, () => null, JSON.stringify({ total_count: 5, workflow_runs: [] }, null, 2)) === "5" && X.rtHttpObserve(sp, 200, () => null, JSON.stringify({ total_count: 0, workflow_runs: [] }, null, 2)) === "0", cls + ": a pretty-printed answer reads 5 while runs are stuck and 0 when they are gone");
  }
  ok(!/"contains": "\\"total_count\\":0"/.test(sql), "the compact contains form that could never match a pretty-printed answer is not used");
}

// the d1 probes on a crafted world
const probe = (cls, db) => db.prepare(rc(cls).verify_probe).get();
{ // 1000162: the outcome
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE ops_ai_log (id TEXT, ts TEXT, streamed INTEGER, ok INTEGER, latency_ms INTEGER, response TEXT)");
  const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const add = (days, streamed, okv, lat, resp) => d.prepare("INSERT INTO ops_ai_log VALUES (?, ?, ?, ?, ?, ?)").run("r" + Math.random(), ago(days), streamed, okv, lat, resp);
  const LINE = "The agent ran 43 tool call(s) (41 ok: shell_exec) but the model produced no final answer within this turn (272s). Please re-send.";
  add(1, 1, 0, 272606, LINE); add(3, 1, 0, 318000, LINE); add(6.5, 1, 0, 410000, LINE);
  add(9, 1, 0, 300000, LINE);          // older than 7 days
  add(1, 1, 0, 120000, LINE);          // shorter than 230 s
  add(1, 0, 0, 300000, LINE);          // not streamed
  add(1, 1, 1, 300000, LINE);          // ok
  add(1, 1, 0, 300000, "some other failure");
  let r = probe("issue-1000162", d);
  ok(r.expected === "0" && r.observed === "3", "1000162: three long incomplete streamed turns in 7 days read 3 (older, shorter, unstreamed, ok and other failures are not counted)", r);
  d.exec("DELETE FROM ops_ai_log WHERE ok = 0 AND latency_ms >= 230000 AND streamed = 1 AND instr(response, 'no final answer') > 0");
  r = probe("issue-1000162", d);
  ok(r.observed === "0", "1000162: reads 0 once no such turn is left", r);
}
{ // 1000157: registry workers without a fresh audit row
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE service_registry (service TEXT, kind TEXT, state TEXT); CREATE TABLE worker_live_audit (worker TEXT PRIMARY KEY, http INTEGER, live_version TEXT, registry_before TEXT, match INTEGER, note TEXT, probed_at TEXT)");
  for (const [s, k, st] of [["a", "worker", "live"], ["b", "worker", "live"], ["c", "worker", "retired"], ["d", "worker", "live"], ["e", "member", "live"], ["f", "worker", "planned"]]) d.prepare("INSERT INTO service_registry VALUES (?, ?, ?)").run(s, k, st);
  const row = (wk, hours) => d.prepare("INSERT INTO worker_live_audit (worker, http, note, probed_at) VALUES (?, 200, 'SYNC', datetime('now', ?))").run(wk, "-" + hours + " hours");
  row("a", 1); row("d", 30);   // d is stale
  let r = probe("issue-1000157", d);
  ok(r.expected === "0" && r.observed === "3", "1000157: b (no row), c (retired, no row) and d (stale row) are counted; e (a member), f (not live) and a (fresh) are not", r);
  d.prepare("INSERT OR IGNORE INTO worker_live_audit (worker, http, note, probed_at) VALUES ('b', 200, 'SYNC', datetime('now'))").run();
  d.prepare("INSERT INTO worker_live_audit (worker, http, note, probed_at) VALUES ('c', 410, 'TOMBSTONE_410 selfstate-probe', datetime('now'))").run();
  d.prepare("UPDATE worker_live_audit SET probed_at = datetime('now') WHERE worker = 'd'").run();
  r = probe("issue-1000157", d);
  ok(r.observed === "0", "1000157: reads 0 once every live or retired worker has a fresh row (the tombstone row counts)", r);
}
{ // the capped-reply detector
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE ops_ai_log (id TEXT, ts TEXT, ok INTEGER, completion_tokens INTEGER, response TEXT)");
  const ts = new Date().toISOString();
  const add = (okv, tok, resp) => d.prepare("INSERT INTO ops_ai_log VALUES (?, ?, ?, ?, ?)").run("r" + Math.random(), ts, okv, tok, resp);
  add(1, 8192, "Good data. Now let me analyze the thing " + "x".repeat(100));   // the defect: the chain of thought as the answer
  add(1, 8000, "Now I will think about it");                                   // the defect
  add(1, 8192, "The reply was cut at the output cap while the model was still reasoning, so there is no answer to show. Ask again with a narrower request.");  // the fix
  add(1, 5000, "a normal answer"); add(0, 8192, "failed turn"); add(1, 8192, null);
  const r = probe("fm-ops-capped-reply-logged-ok", d);
  ok(r.expected === "0" && r.observed === "2", "fm-ops-capped-reply-logged-ok: two chain-of-thought replies at the cap are the defect; the honest line, a normal answer, a failed turn and a null response are not", r);
}

// failure modes, detectors and the decision
ok(qa(w, "SELECT fm_key FROM failure_modes ORDER BY fm_key").map((r) => r.fm_key).join() === "ai-binding-swallow-capacity-error,probe-author-later-pass-free-text", "two failure modes are registered");
for (const k of ["ai-binding-swallow-capacity-error", "probe-author-later-pass-free-text"]) {
  const c = rc("fm-" + k);
  ok(c && c.module === "failure-mode" && c.status === "active" && c.issue_id === null && c.expected_cadence_h === 1, "detector contract fm-" + k + " is active, hourly, module failure-mode", c);
}
{
  const fm = q1(w, "SELECT * FROM failure_modes WHERE fm_key = 'probe-author-later-pass-free-text'");
  ok(fm.issue_id === 1000421 && /ci-status\/remediation-consumer\.json/.test(fm.blast_radius), "the later-pass failure mode names issue 1000421 and the public sink");
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE remediation_contracts (class TEXT, module TEXT); CREATE TABLE remediation_verifications (class TEXT, verified_at TEXT, observed TEXT, expected TEXT)");
  d.prepare("INSERT INTO remediation_contracts VALUES ('issue-1', 'probe-author-1'), ('issue-2', 'other')").run();
  d.prepare("INSERT INTO remediation_verifications VALUES ('issue-1', datetime('now'), 'ok', 'ok'), ('issue-2', datetime('now'), 'a sentence with spaces', 'x')").run();
  let r = d.prepare(rc("fm-probe-author-later-pass-free-text").verify_probe).get();
  ok(r.expected === 0 && r.observed === 0, "the later-pass detector reads 0 for token values and for another module's free text", r);
  d.prepare("INSERT INTO remediation_verifications VALUES ('issue-1', datetime('now'), 'Rowan wrote: a sentence', 'ok')").run();
  r = d.prepare(rc("fm-probe-author-later-pass-free-text").verify_probe).get();
  ok(r.observed === 1, "and 1 once a probe-author-1 verification holds a sentence", r);
}
const dl = qa(w, "SELECT * FROM decision_log");
ok(dl.length === 1 && dl[0].actor === "rem-a6" && /^INFRA-PROBES-1: contracts of issues 1000018/.test(dl[0].action) && dl[0].rollback_path && dl[0].predicted_outcome, "one decision_log row with its rollback and prediction", dl.map((r) => r.action.slice(0, 40)));
ok(!/\b(secret|credential|password|api[ _-]?key|private key)\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")) || /\bsecret|credential\b/.test("") , "no credential is written");

// replay changes nothing
{
  const before = JSON.stringify(["remediation_contracts", "failure_modes", "decision_log"].map((t) => qa(w, "SELECT COUNT(*) n FROM " + t)[0].n));
  const statuses = JSON.stringify(qa(w, "SELECT class, status, verify_transport, verify_probe FROM remediation_contracts ORDER BY class"));
  w.exec(sql);
  const after = JSON.stringify(["remediation_contracts", "failure_modes", "decision_log"].map((t) => qa(w, "SELECT COUNT(*) n FROM " + t)[0].n));
  ok(before === after && statuses === JSON.stringify(qa(w, "SELECT class, status, verify_transport, verify_probe FROM remediation_contracts ORDER BY class")), "a replay adds no row and changes no contract state", { before, after });
}
// rollback
{
  const rb = (header.find((l) => /^-- Rollback:/.test(l)) || "").replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  ok(["issue-1000018", "issue-1000036", "issue-1000043", "issue-1000178", "issue-1000162", "issue-1000157", "issue-1000275", "issue-1000275-in-progress"].every((c) => rc(c).status === "superseded") && rc("issue-9999999").status === "superseded" && rc("fm-ops-capped-reply-logged-ok").status === "active", "the Rollback line supersedes the re-pointed contracts and leaves the failure-mode contracts alone", qa(w, "SELECT class, status FROM remediation_contracts ORDER BY class"));
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
