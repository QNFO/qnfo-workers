// BREACH-DOCTOR-TRUST-1 offline suite: replays migrations/2026-10-26-breach-doctor-trust.sql on node:sqlite over the live ops_config and decision_log column lists.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, no DELETE or DROP, so no BACKUP header); the single pair qnfo-fleet-control|BREACH-DOCTOR-1: is
// appended once to the live-shaped code_merge_trusted_sources value and nothing else is (every earlier entry in the same order, no bare source, no cloud_ops_events:* source, every
// other ops_config row byte-identical); a replay is a no-op (also after another migration appended its own entry behind the pair); the backup key holds the previous value; the Rollback
// line restores it and leaves the append-only decision_log row; an empty or missing row is left alone (an append would shrink the planner's list to one pair); and the pair is read as
// trusted by the grammar the planner and the engine share ("source|title-prefix", a trailing * on the source is a prefix match), for the doctor's title and for no other source.
// Run: node migrations/breach-doctor-trust.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const sql = readFileSync(new URL("./2026-10-26-breach-doctor-trust.sql", import.meta.url), "utf8");
const workerSrc = readFileSync(process.env.BD_WORKER_PATH || new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const PAIR = "qnfo-fleet-control|BREACH-DOCTOR-1:";
const KEY = "code_merge_trusted_sources", BAK = "code_merge_trusted_sources--bak-20261026T0800Z";
// the live value (qnfo-audit ops_config, SELECT 2026-10-26 10:00Z): 35 entries, the pair absent
const LIVE = "qnfo-fleet-dashboard:owner-request|OWNER-TASK-,qnfo-fleet-dashboard:owner-request|OWNER-NOTE-,claude-session*,claude-code-session*,qnfo-fleet-control|METRIC-TRIGGER-,session,qnfo-fleet-control|REACH-IDEA-,qnfo-fleet-control|TP-,TRANSFORMATION-PROGRAM-1|TP-,session*,chat-session*,owner-queue*,fi-executor,autonomy-first-gate,qnfo-code-orchestrator,qnfo-fleet-advisor,claude-chat*,chat:*,qnfo-evolve|EVOLVE-1,qnfo-fleet-control|METRIC-FIX-RELAPSED-1:,qnfo-fleet-control|METRIC-REGRESSION-1:,cf-obs-bridge,cron-watch,workers-bp-audit,qnfo-ops,ops-autonomy,q08-signal-engine,loop-breaker,qnfo-research-exec,qnfo-lifecycle,fleet-journeys,portfolio-autopilot,cf-model-eval,owner-chat,management-personas|ROADMAP-1:";
ok(LIVE.split(",").length === 35 && !LIVE.includes(PAIR), "the fixture is the live value: 35 entries, the pair absent");

// ---- header
const header = sql.split("\n").filter((l) => l.startsWith("--"));
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
const rollbackLines = header.filter((l) => /^-- Rollback:/.test(l));
ok(rollbackLines.length === 1 && rollbackLines[0].length > 30 && !rollbackLines[0].includes("\n"), "exactly one single-line Rollback header");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !header.some((l) => /^-- BACKUP:/.test(l)), "the body deletes and drops nothing, so no BACKUP header is needed");
ok(!/CREATE\s+TRIGGER/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no trigger, no claude.ai or anthropic.com link");
ok(sql.split(PAIR).length > 2 && (body.match(/qnfo-fleet-control\|BREACH-DOCTOR-1:/g) || []).length >= 3, "the pair is spelled out in the statements");

// ---- the world: live column lists
const DDL = `
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;`;
function world(value, extra = true) {
  const d = new DatabaseSync(":memory:");
  d.exec(DDL);
  if (value !== undefined) d.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES (?, ?, 'PLAN-TRUST-PARITY-1 (2026-10-20, agent_issues 100303): the planner reads this same row', '2026-10-24 14:03:36')").run(KEY, value);
  if (extra) {
    d.exec("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('code_merge_trusted_sources--bak-20261020T0630Z', 'a,b', 'older backup', '2026-10-20 06:27:36'), ('breach_doctor', 'on', 'n', '2026-10-26 08:00:00'), ('stale_pr_merge_workflows', 'on', NULL, '2026-10-26 09:00:00'), ('code_merge_trusted_sources_extra', 'x', NULL, '2026-10-26 09:00:00')");
  }
  return d;
}
const rows = (d) => d.prepare("SELECT key, value, note, updated_at FROM ops_config ORDER BY key").all();
const val = (d, k = KEY) => (d.prepare("SELECT value FROM ops_config WHERE key = ?").get(k) || {}).value;
const nDecisions = (d) => d.prepare("SELECT COUNT(*) n FROM decision_log").get().n;
const others = (d) => JSON.stringify(rows(d).filter((r) => r.key !== KEY && r.key !== BAK));

// ---- apply: the pair is appended once and nothing else changes
{
  const d = world(LIVE);
  const before = rows(d);
  d.exec(sql);
  const v = val(d), list = v.split(",");
  ok(v === LIVE + "," + PAIR, "the value is the live value plus exactly one appended pair", v.slice(-120));
  ok(list.filter((e) => e === PAIR).length === 1 && list.length === 36, "the pair occurs once and the list has 36 entries (35 + 1)");
  ok(JSON.stringify(list.slice(0, 35)) === JSON.stringify(LIVE.split(",")), "every earlier entry is unchanged and in the same order");
  ok(!list.slice(35).some((e) => !e.includes("|")) && list.slice(35).join() === PAIR, "the one new entry is a source|title-prefix pair: no bare source is added");
  ok(!v.includes("cloud_ops_events") && !list.some((e) => /^qnfo-fleet-control\*?$/.test(e) || e === "qnfo-fleet-control"), "no cloud_ops_events:* source and no bare qnfo-fleet-control source");
  ok(val(d, BAK) === LIVE, "the backup key holds the previous value exactly", val(d, BAK));
  const bak = d.prepare("SELECT note FROM ops_config WHERE key = ?").get(BAK);
  ok(bak && /BREACH-DOCTOR-TRUST-1/.test(bak.note) && /restore by copying value back/.test(bak.note), "the backup row says what it backs up and how to restore it", bak);
  ok(JSON.stringify(rows(d).filter((r) => r.key !== KEY && r.key !== BAK)) === JSON.stringify(before.filter((r) => r.key !== KEY)), "no other ops_config row changed (the older backup, the doctor switch and the neighbours are byte-identical)");
  ok(rows(d).length === before.length + 1, "exactly one ops_config row was added: the backup");
  const dl = d.prepare("SELECT * FROM decision_log").all();
  ok(dl.length === 1 && /^BREACH-DOCTOR-TRUST-1/.test(dl[0].action) && /Rollback/.test(dl[0].rollback_path) && dl[0].predicted_outcome === "doctor_taint_violations_24h = 0 within 24 h" && dl[0].capability_gain, "one decision_log row with its revert path, a capability gain and a prediction", dl);
  ok(dl[0].blast_radius.includes("1000266") && dl[0].blast_radius.includes("claude-session"), "its blast radius states that the tracking issue (source claude-session) is unaffected");

  // ---- replay: a no-op
  const snap = JSON.stringify(rows(d)), dsnap = JSON.stringify(d.prepare("SELECT * FROM decision_log").all());
  d.exec(sql); d.exec(sql);
  ok(JSON.stringify(rows(d)) === snap && val(d).split(",").filter((e) => e === PAIR).length === 1, "a replay (twice) changes no ops_config row: the pair is appended once");
  ok(JSON.stringify(d.prepare("SELECT * FROM decision_log").all()) === dsnap && nDecisions(d) === 1, "and writes no second decision_log row");

  // ---- a later migration appended its own entry behind the pair: the replay leaves both alone
  d.prepare("UPDATE ops_config SET value = value || ',next-source|NEXT-' WHERE key = ?").run(KEY);
  const snap2 = JSON.stringify(rows(d));
  d.exec(sql);
  ok(JSON.stringify(rows(d)) === snap2 && val(d).endsWith(PAIR + ",next-source|NEXT-"), "a replay after another migration appended an entry keeps the pair once and the other entry");
  d.prepare("UPDATE ops_config SET value = ? WHERE key = ?").run(LIVE + "," + PAIR, KEY);

  // ---- Rollback restores the previous value, keeps the append-only row and the backup
  const rb = rollbackLines[0].replace(/^-- Rollback:\s*/, "");
  d.exec(rb);
  ok(val(d) === LIVE, "the Rollback restores the previous value exactly", val(d).slice(-80));
  ok(others(d) === JSON.stringify(before.filter((r) => r.key !== KEY)), "and changes no other row");
  ok(nDecisions(d) === 1 && val(d, BAK) === LIVE, "it leaves the decision_log row (append-only) and the backup");
  d.exec(rb);
  ok(val(d) === LIVE, "a second Rollback is a no-op");
  // re-applied after a rollback, the pair comes back once
  d.exec(sql);
  ok(val(d) === LIVE + "," + PAIR && nDecisions(d) === 1 && val(d, BAK) === LIVE, "applied again after a rollback, the pair is appended once more (and no second decision row)");
}

// ---- a value another migration changed before this one ran: its entries survive, the backup is that value
{
  const other = LIVE + ",someone-else|ELSE-";
  const d = world(other);
  d.exec(sql);
  ok(val(d) === other + "," + PAIR && val(d, BAK) === other, "an entry appended by another migration first is kept; the backup holds the value this file found");
}
// ---- the pair is already there (a hand edit or an earlier run): the file adds nothing
{
  const there = LIVE + "," + PAIR;
  const d = world(there);
  d.exec(sql);
  ok(val(d) === there && val(d).split(",").filter((e) => e === PAIR).length === 1, "with the pair already listed the value is untouched");
}
// ---- an empty or missing row is left alone: an append would shrink the planner's list to one pair
for (const [name, v] of [["empty", ""], ["blank", "   "], ["null", null], ["missing", undefined]]) {
  const d = world(v);
  const before = JSON.stringify(rows(d));
  d.exec(sql);
  ok(JSON.stringify(rows(d)) === before && nDecisions(d) === 0, "a " + name + " code_merge_trusted_sources row is left alone: no backup, no append, no decision_log row", rows(d).filter((r) => r.key === KEY || r.key === BAK));
}

// ---- the trust grammar of the planner and the engine reads the pair for the doctor's title and for no other source
{
  const a = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:BEGIN ----"), b = workerSrc.indexOf("// ---- BREACH-DOCTOR-1:END ----");
  ok(a > 0 && b > a, "the worker carries the BREACH-DOCTOR-1 block");
  const cx = vm.createContext({ Date, Number, String, parseInt, Math, JSON, Object, Array, RegExp, isFinite, console: { error() {}, log() {} }, VERSION: "0.51.0-test", crypto: globalThis.crypto, TextEncoder, Uint8Array });
  const kw = workerSrc.match(/^var __RT_WRITE_KW = \[[^\]]*\];$/m)[0];
  vm.runInContext(kw + "\n" + workerSrc.slice(a, b) + "\nthis.api = { bdTitleTrusted };", cx);
  const trusted = async (value, title) => cx.api.bdTitleTrusted({ db: { prepare: () => ({ first: async () => (value == null ? null : { value }) }) } }, title);
  const d = world(LIVE); d.exec(sql);
  const after = val(d);
  ok(!(await trusted(LIVE, "BREACH-DOCTOR-1: self CM-R1 sql-error")), "before the file the doctor's title is not trusted (the 'Doer: none yet' wording)");
  ok(await trusted(after, "BREACH-DOCTOR-1: self CM-R1 sql-error") && await trusted(after, "BREACH-DOCTOR-1: playbook gap TOOL-FAILURE"), "after the file the doctor's own titles are trusted");
  ok(!(await trusted(after, "OWNER-NOTE-1 do this")) && !(await trusted(after, "METRIC-X: other title")) && !(await trusted(after, "TOOL-FAILURE: git_clone [error]")), "and only the doctor's prefix: other qnfo-fleet-control titles gain nothing from this pair");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
