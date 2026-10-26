// BP26-REPO-1 offline suite: replays migrations/2026-10-26-bp26-repo.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); migration_runs gains bookmark and bookmark_source; credential_registry holds
// credential NAMES only (no value-shaped text), exactly one with a readable expiry (the Cloudflare repository token) and the rest registered as no-expiry-mechanism; d1_restore_drills exists
// with the columns scripts/bp26_repo.py reads; the eight metrics get their real source_of_truth and keep the [BP26] tag while another metric is untouched; the decision is logged once;
// a replay (without the ALTERs, which SQLite cannot repeat and the runner treats as done) changes nothing; the Rollback line puts everything back.
// Output MUST contain "0 failed" on success.   node migrations/bp26-repo.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-repo.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER|COLUMN))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(!/\b[A-Za-z0-9]{32,}\b/.test(sql), "no value-shaped token anywhere in the file");

const METRICS = ["workers_with_source_maps", "observability_enabled_share", "kv_used_for_locking", "secrets_in_repo", "secret_expiry_warnings_open", "d1_db_size_pct", "d1_restore_drill_age_days", "pre_migration_bookmark_recorded"];
const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const world = () => {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE migration_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT NOT NULL, sha256 TEXT NOT NULL, commit_sha TEXT, db TEXT, status TEXT NOT NULL, statements INTEGER, error TEXT, applied_by TEXT, applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT, last_value TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
INSERT INTO migration_runs (file, sha256, db, status) VALUES ('a.sql', 'x', 'qnfo-audit', 'ok');`);
  for (const m of METRICS) w.prepare("INSERT INTO metric_registry (metric, source_of_truth) VALUES (?, 'old text (to build) [BP26]')").run(m);
  w.prepare("INSERT INTO metric_registry (metric, source_of_truth) VALUES ('orphaned_leases', 'qnfo-audit.work_claims [BP26]')").run();
  return w;
};
const cols = (w, t) => w.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const snap = (w) => JSON.stringify([w.prepare("SELECT * FROM credential_registry ORDER BY credential").all(), w.prepare("SELECT metric, source_of_truth FROM metric_registry ORDER BY metric").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);

const w = world();
w.exec(sql);
ok(cols(w, "migration_runs").includes("bookmark") && cols(w, "migration_runs").includes("bookmark_source"), "migration_runs gains bookmark and bookmark_source", cols(w, "migration_runs"));
ok(w.prepare("SELECT bookmark FROM migration_runs").get().bookmark === null, "existing rows keep a NULL bookmark (never invented)");
const need = { credential_registry: ["credential", "holder_worker", "expiry_mechanism", "expires_at", "renewal_issue_id"], d1_restore_drills: ["ts", "source_db", "scratch_db", "bookmark", "rows_checked", "outcome", "evidence"] };
for (const [t, cs] of Object.entries(need)) ok(cs.every((c) => cols(w, t).includes(c)), t + " has the columns scripts/bp26_repo.py reads", cols(w, t));
const creds = w.prepare("SELECT * FROM credential_registry ORDER BY credential").all();
ok(creds.length === 9, "nine external credentials are registered by name", creds.map((c) => c.credential));
ok(creds.filter((c) => c.expiry_mechanism === "cf-token-verify").map((c) => c.credential).join() === "CLOUDFLARE_API_TOKEN", "only the Cloudflare repository token has a readable expiry");
ok(creds.filter((c) => c.expiry_mechanism !== "cf-token-verify").every((c) => c.expiry_mechanism === "no-expiry-mechanism" && c.expires_at === null), "every other credential is registered as no-expiry-mechanism, with no date invented");
ok(creds.every((c) => /^[A-Z][A-Z0-9_]+$/.test(c.credential) && c.holder_worker && c.note), "names are variable names, each with a holder and a note");
ok(w.prepare("SELECT COUNT(*) n FROM d1_restore_drills").get().n === 0, "the drill ledger starts empty: the drill age is unknown until a drill passes");
const m = Object.fromEntries(w.prepare("SELECT metric, source_of_truth s FROM metric_registry").all().map((r) => [r.metric, r.s]));
ok(METRICS.every((k) => /scripts\/bp26_repo\.py/.test(m[k]) && /\[BP26\]$/.test(m[k])), "the eight metrics name scripts/bp26_repo.py and keep the [BP26] tag", METRICS.filter((k) => !/\[BP26\]$/.test(m[k])));
ok(m.orphaned_leases === "qnfo-audit.work_claims [BP26]", "another metric is untouched");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-REPO-1:%'").get().n === 1, "the decision is logged once");

const before = snap(w);
w.exec(body.replace(/^ALTER TABLE migration_runs ADD COLUMN \w+ TEXT;$/gm, ""));
ok(snap(w) === before, "a replay (without the ALTERs) changes nothing");

w.exec(rollback);
ok(!cols(w, "migration_runs").includes("bookmark") && !cols(w, "migration_runs").includes("bookmark_source"), "the Rollback line drops both columns", cols(w, "migration_runs"));
const gone = w.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('credential_registry', 'd1_restore_drills')").all();
ok(gone.length === 0, "the Rollback line drops both tables", gone);
const back = Object.fromEntries(w.prepare("SELECT metric, source_of_truth s FROM metric_registry").all().map((r) => [r.metric, r.s]));
ok(METRICS.every((k) => /\(to (build|compute|poll|extend|build or wire)\) \[BP26\]$/.test(back[k])) && back.orphaned_leases === "qnfo-audit.work_claims [BP26]", "the Rollback line returns the eight metrics to a to-build text and leaves the other alone", back);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
