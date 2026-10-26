// REM-A7-REACH-4 offline suite: replays migrations/2026-10-26-rem-a7-reach-4.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs plus cloud_ops_events.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, nothing deleted or dropped); the denied ledger row of the day is kept under another key (same ts, text, status, meta)
// only while the owner's card reads done by the owner, so the dashboard's throttle (one row per day-read, id gsc-ingest-<day>) no longer blocks a second read; an ok row, another day's row, an
// unresolved card and a card resolved by anything but the owner change nothing; one decision_log row; a replay changes nothing; the Rollback line restores the key; and the throttle the
// dashboard uses really is the row id (worker.js reads cloud_ops_events WHERE id = gsc-ingest-<day>).
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-reach-4.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-reach-4.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const dashSrc = readFileSync(here("../qnfo-fleet-dashboard/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(/SELECT status FROM cloud_ops_events WHERE id = \?", \[evId\]/.test(dashSrc.slice(dashSrc.indexOf("async function gscIngest"))) && dashSrc.indexOf('const evId = "gsc-ingest-" + day;') > 0, "the dashboard's throttle for a Search Console day is the ledger row id gsc-ingest-<day>");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

function world(o) {
  o = o || {};
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT)");
  const ev = w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, 'gsc-ingest', ?, '{\"day\":\"x\"}', 'qnfo-fleet-dashboard', ?)");
  ev.run("gsc-ingest-2026-10-23", "2026-10-26T19:31:09.251Z", "GSC ingest 2026-10-23 denied: searchAnalytics 403 PERMISSION_DENIED", o.status || "denied");
  ev.run("gsc-ingest-2026-10-22", "2026-10-25T19:31:09.000Z", "GSC ingest 2026-10-22 denied: older day", "denied");
  w.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, sev, status, source, resolved_at, resolution) VALUES ('gsc-service-account-user', 't', 'IDENTITY-BOUND: x', 'd', 'a', 'normal', ?, 'session:rem-a7-f1', ?, ?)")
    .run(o.cardStatus || "resolved", o.cardStatus === "open" ? null : "2026-10-26 19:31:04", o.resolution === undefined ? "done via dashboard by owner (fleet.qnfo.org, emailed code)" : o.resolution);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);

{
  const w = world();
  w.exec(sql);
  const kept = q1(w, "SELECT * FROM cloud_ops_events WHERE id = 'gsc-ingest-2026-10-23@denied-1931Z'");
  ok(kept && kept.ts === "2026-10-26T19:31:09.251Z" && kept.status === "denied" && /403 PERMISSION_DENIED/.test(kept.text) && kept.meta === '{"day":"x"}' && kept.kind === "gsc-ingest", "the denied row is kept under another key with everything else unchanged", kept);
  ok(!q1(w, "SELECT 1 x FROM cloud_ops_events WHERE id = 'gsc-ingest-2026-10-23'"), "the day has no row now, so the dashboard's throttle lets the next tick read it again");
  ok(q1(w, "SELECT id FROM cloud_ops_events WHERE id = 'gsc-ingest-2026-10-22'") !== undefined, "another day's row is not touched");
  ok(w.prepare("SELECT COUNT(*) n FROM cloud_ops_events").get().n === 2, "no row is deleted");
  ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f1:gsc-second-read'").get().n === 1, "one decision_log row");
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM cloud_ops_events ORDER BY id").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
  const a = snap();
  w.exec(sql);
  ok(snap() === a, "a replay changes nothing");
  // the next tick writes a new row for the day (INSERT OR REPLACE by id): a second replay must still leave it alone
  w.prepare("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES ('gsc-ingest-2026-10-23', '2026-10-26T20:16:10.000Z', 'gsc-ingest', 'denied again', '{}', 'qnfo-fleet-dashboard', 'denied')").run();
  const b = snap();
  w.exec(sql);
  ok(snap() === b, "after the new row exists a replay leaves both rows alone (the guard sees the kept key)");
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(w.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE id LIKE 'gsc-ingest-2026-10-23%'").get().n === 2, "Rollback does not overwrite a new row for the day");
}
{
  const w = world();
  w.exec(sql);
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(!!q1(w, "SELECT 1 x FROM cloud_ops_events WHERE id = 'gsc-ingest-2026-10-23'") && !q1(w, "SELECT 1 x FROM cloud_ops_events WHERE id LIKE 'gsc-ingest-2026-10-23@denied-%'"), "Rollback restores the key when no new row exists");
}
for (const [label, o] of [["an ok row", { status: "ok" }], ["a card the owner has not resolved", { cardStatus: "open" }], ["a card resolved by default adoption", { resolution: "DEFAULT-ADOPTED-1: closed at birth on its stated default" }]]) {
  const w = world(o);
  w.exec(sql);
  ok(!!q1(w, "SELECT 1 x FROM cloud_ops_events WHERE id = 'gsc-ingest-2026-10-23'") && !q1(w, "SELECT 1 x FROM cloud_ops_events WHERE id LIKE 'gsc-ingest-2026-10-23@denied-%'"), label + ": the row is not renamed");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
