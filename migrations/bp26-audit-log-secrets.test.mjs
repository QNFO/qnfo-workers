// BP26-AUDIT-LOG-2 offline suite: replays migrations/2026-10-26-bp26-audit-log-secrets.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); the 8-day backfill takes secret-change events only, uses the Cloudflare version time
// (created_on) as the action time and records worker and version; a malformed meta is recorded with the event time and never aborts the event insert; the trigger records one row per new secret-change
// event and nothing for any other kind; a replay changes nothing; the Rollback line drops the trigger and leaves the append-only rows.
// Output MUST contain "0 failed" on success.   node migrations/bp26-audit-log-secrets.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-audit-log-secrets.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(!/@[a-z0-9-]+\.[a-z]/i.test(body), "the migration names no e-mail address");

const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const day = (d) => new Date(Date.now() - d * 86400000).toISOString().replace(/\.\d+Z$/, ".123456Z");

const w = new DatabaseSync(":memory:");
w.exec(`
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT, session TEXT, tool TEXT, action_kind TEXT NOT NULL, target TEXT, inputs_hash TEXT, outputs_hash TEXT, version_id TEXT, cost REAL, outcome TEXT, source_table TEXT NOT NULL, source_id TEXT NOT NULL, via TEXT NOT NULL DEFAULT 'trigger');
CREATE UNIQUE INDEX idx_agent_actions_source ON agent_actions (source_table, source_id);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
const ev = w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, 'qnfo-ops', 'ok')");
const meta = (worker, version, created) => JSON.stringify({ worker, version, created_on: created, source: "api" });
ev.run("secret-change-qnfo-fleet-dashboard-404", day(1), "secret-change", "qnfo-fleet-dashboard secrets changed (version 404)", meta("qnfo-fleet-dashboard", 404, day(1.01)));   // backfilled; version time is a little earlier than the event
ev.run("secret-change-old-1", day(12), "secret-change", "old", meta("old-worker", 1, day(12)));                                                  // outside the 8 days
ev.run("ops-1", day(1), "ops_ai_tool", "a tool call", meta("x", 1, day(1)));                                                                       // another kind
ev.run("secret-change-bad-meta", day(2), "secret-change", "bad meta", "not json at all");                                                          // malformed meta: recorded with the event time
w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta) VALUES (NULL, ?, 'secret-change', 'null id', ?)").run(day(3), meta("null-id-worker", 7, day(3)));   // a NULL event id (TEXT PRIMARY KEY allows it)

w.exec(sql);
const rows = () => w.prepare("SELECT * FROM agent_actions ORDER BY id").all();
const by = (src) => rows().find((r) => r.source_id === src);
ok(rows().length === 3, "the backfill takes three secret-change events: valid, malformed meta, NULL id (not the old one, not the other kind)", rows().map((r) => r.source_id));
const a = by("secret-change-qnfo-fleet-dashboard-404");
ok(a && a.action_kind === "secret-write" && a.target === "qnfo-fleet-dashboard" && a.version_id === "404" && a.via === "backfill" && a.source_table === "cloud_ops_events" && a.outcome === "ok" && a.tool === "cf-version", "a valid event becomes a secret-write row with worker, version and via backfill", a);
ok(a && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(a.ts) && a.ts === new Date(Date.parse(day(1.01))).toISOString().replace(/\.\d+Z$/, "Z"), "the action time is the Cloudflare version time (created_on), normalised", a && a.ts);
const b = by("secret-change-bad-meta");
ok(b && b.target === null && b.version_id === null && b.action_kind === "secret-write", "a malformed meta is recorded with no worker, not skipped and not an error", b);
ok(rows().filter((r) => /^rowid:/.test(r.source_id)).length === 1, "an event with a NULL id is recorded under rowid:<n>");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-AUDIT-LOG-2:%'").get().n === 1, "the decision is logged once");

// trigger
const before = rows().length;
ev.run("secret-change-qnfo-ops-600", day(0), "secret-change", "qnfo-ops secrets changed (version 600)", meta("qnfo-ops", 600, day(0.001)));
ev.run("ops-2", day(0), "ops_ai_tool", "another tool call", meta("x", 2, day(0)));
ev.run("secret-watch-tick", day(0), "secret-watch-tick", "heartbeat", "{}");
let threw = false;
try { ev.run("secret-change-bad-2", day(0), "secret-change", "bad", "{broken"); } catch (e) { threw = true; }
ok(!threw, "a malformed meta never aborts the event insert");
const c = by("secret-change-qnfo-ops-600");
ok(rows().length === before + 2 && c && c.via === "trigger" && c.target === "qnfo-ops" && c.version_id === "600", "the trigger records the two new secret-change events and not the other kinds", rows().length - before);

// replay and rollback
const snap = () => JSON.stringify([rows(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
const s1 = snap();
w.exec(sql);
ok(snap() === s1, "a replay changes nothing");
w.exec(rollback);
ok(w.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'agent_actions_from_secret%'").get().n === 0, "the Rollback line drops the trigger");
ev.run("secret-change-after-rollback", day(0), "secret-change", "x", meta("w", 1, day(0)));
ok(rows().length === JSON.parse(s1)[0].length, "and a later secret-change event is no longer recorded; earlier rows stay");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
