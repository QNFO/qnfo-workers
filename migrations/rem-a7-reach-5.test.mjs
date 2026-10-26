// REM-A7-REACH-5 offline suite: replays migrations/2026-10-26-rem-a7-reach-5.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs plus cloud_ops_events.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, nothing deleted or dropped); a card the owner marked done is reopened, with the fleet's note in front of its steps and
// the IDENTITY-BOUND line untouched, only while the day's Search Console read after his click was denied; an ok read, a card resolved by default adoption, a card that is already open and a read older
// than his click change nothing; the note is added once; one decision_log row; a replay changes nothing; the Rollback line restores the owner's resolution and the steps.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-reach-5.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-reach-5.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const STEPS = "Step 1, the one the fleet's first live read named (2026-10-26 19:31Z): enable the Google Search Console API for project 254457120993. Step 2: add the service account as a user.";
const OWNER = "done via dashboard by owner (fleet.qnfo.org, emailed code)";
function world(o) {
  o = o || {};
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT)");
  w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES ('gsc-ingest-2026-10-23', ?, 'gsc-ingest', 'denied', '{}', 'qnfo-fleet-dashboard', ?)").run(o.eventTs || "2026-10-26T20:16:15.279Z", o.eventStatus || "denied");
  w.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, sev, status, source, resolved_at, resolution) VALUES ('gsc-service-account-user', 't', 'IDENTITY-BOUND: your own Google account', 'nothing blocked', ?, 'normal', ?, 'session:rem-a7-f1', ?, ?)")
    .run(STEPS, o.cardStatus || "resolved", (o.cardStatus || "resolved") === "open" ? null : "2026-10-26 19:31:04", o.resolution === undefined ? OWNER : o.resolution);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);

{
  const w = world();
  w.exec(sql);
  const c = q1(w, "SELECT * FROM human_actions WHERE slug = 'gsc-service-account-user'");
  ok(c.status === "open" && c.resolved_at === null && c.resolution === null, "the card is open again, its resolution cleared", c);
  ok(c.action.startsWith("REOPENED 2026-10-26 20:20Z by the fleet because its closing condition is not met, not by a decision") && c.action.endsWith(STEPS) && /254457120993/.test(c.action) && /19:31:09Z and 20:16:15Z/.test(c.action), "the fleet's note, with both refusal times, is in front of the unchanged steps", c.action.slice(0, 200));
  ok(/IDENTITY-BOUND:/.test(c.why) && c.default_in_effect === "nothing blocked", "the IDENTITY-BOUND line and the default are untouched");
  ok(!/\b(token|password|secret value|private key)\b/i.test(c.action) && !/@[a-z0-9-]+\.iam\.gserviceaccount\.com/i.test(c.action) && !/claude\.ai|anthropic\.com/i.test(c.action), "no token, key or service account address in the card");
  ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f1:gsc-card-reopen'").get().n === 1, "one decision_log row");
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM human_actions").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
  const a = snap();
  w.exec(sql);
  ok(snap() === a, "a replay changes nothing (the note is added once)");
  w.prepare("UPDATE human_actions SET status = 'resolved', resolved_at = '2026-10-26 21:00:00', resolution = 'done via dashboard by owner (fleet.qnfo.org, emailed code)' WHERE slug = 'gsc-service-account-user'").run();
  w.exec(sql);
  ok(q1(w, "SELECT status s FROM human_actions WHERE slug = 'gsc-service-account-user'").s === "resolved", "a second owner click is respected: the note is already there, so the card is not reopened again");
  w.prepare("UPDATE human_actions SET status = 'open', resolved_at = NULL, resolution = NULL WHERE slug = 'gsc-service-account-user'").run();
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  const r = q1(w, "SELECT * FROM human_actions WHERE slug = 'gsc-service-account-user'");
  ok(r.status === "resolved" && r.resolution === OWNER && r.action === STEPS, "Rollback restores the owner's resolution and the steps", r);
}
for (const [label, o] of [["an ok read", { eventStatus: "ok" }], ["a read older than the owner's click", { eventTs: "2026-10-26T19:00:00.000Z" }], ["a card resolved by default adoption", { resolution: "DEFAULT-ADOPTED-1: closed at birth on its stated default" }], ["a card that is already open", { cardStatus: "open" }]]) {
  const w = world(o);
  const before = JSON.stringify(w.prepare("SELECT * FROM human_actions").all());
  w.exec(sql);
  ok(JSON.stringify(w.prepare("SELECT * FROM human_actions").all()) === before, label + ": the card is not touched");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
