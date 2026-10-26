// CONTROL-ALT-PROBES-4D offline suite for migrations/2026-10-26-control-alternate-probes4d.sql (agent_issues 1000214). An independent review of the 18 probes of CONTROL-ALT-PROBES-4 against the loops
// they describe found clauses that turn red while the control is healthy or while its alternate is in use: a disabled playbook row (the documented lever), the doctor switched off in a spelling the
// engine reads (OFF, disabled, 0), a research flag in capitals, the sync tick check while the target is legacy, an MD-4 gate under 120 minutes, the 1440 minutes idiom in PN-R2; and two clauses that could
// not fail (the TL-R03-exclude surge guard, the playbook-gap measure mode). The file rewrites 11 probes. This suite reuses the fixture and the 18 x clause cases of control-alternate-probes4.test.mjs
// (read from its source, so the two cannot drift) and proves, on node:sqlite:
//   1. DIFFERENTIAL: over every case of the earlier suite for the 11 controls, the new probe reads what the old probe read, except for a listed set of changes whose direction is asserted, and a
//      failing reason is either unchanged or one of the reworded texts below;
//   2. each listed change, and each new world (doctor off in five spellings, a flag in capitals, the legacy target, a 90-minute and a 121-minute and a 1200-minute MD-4 gate, a reformatted PN-R2
//      trigger, a lost surge guard, a gap rule switched to on) reads as the review says it should;
//   3. the 7 controls the file does not touch keep their stored probe byte for byte; the backup table, window notes, decision row, replay, byte-for-byte Rollback and house rules.
// Run: node --no-warnings migrations/control-alternate-probes4d.test.mjs   -> prints "N passed, 0 failed"
// Mutation checks: CAP4D_MIGRATION points the suite at a mutated copy of the migration.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const sqlF = readFileSync(process.env.CAP4D_MIGRATION ? resolve(process.env.CAP4D_MIGRATION) : here("2026-10-26-control-alternate-probes4d.sql"), "utf8");
const sqlB = readFileSync(here("2026-10-26-control-alternate-probes4.sql"), "utf8");
const first = readFileSync(here("2026-10-19-control-alternate-probes.sql"), "utf8");
const fleetSrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
const bTest = readFileSync(here("control-alternate-probes4.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sqlF)[1];
const code = sqlF.replace(/^--.*$/gm, "");
const A = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:BEGIN"), B = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:END ----");
let block = fleetSrc.slice(A, B); block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});

// ---- the fixture and the cases of the earlier suite, taken from its source ----
const nameLine = /^const NAMES = .*$/m.exec(bTest)[0];
const fixtureChunk = bTest.slice(bTest.indexOf("// the live views of the first migration"), bTest.indexOf("// ---- 1. the table rows and the view count ----"));
const casesChunk = bTest.slice(bTest.indexOf("const bad = (c, why, brk, re)"), bTest.indexOf("ok(JSON.stringify(Object.keys(CASES)"));
ok(fixtureChunk.length > 3000 && casesChunk.length > 8000, "the fixture and the case table of control-alternate-probes4.test.mjs were found in its source", [fixtureChunk.length, casesChunk.length]);
const NOW = Date.now();
const iso = (m) => new Date(NOW - m * 6e4).toISOString().replace(/\.\d+Z$/, "Z");
const isoMs = (m) => new Date(NOW - m * 6e4).toISOString();
const msAgo = (m) => NOW - m * 6e4;
const AT = String.fromCharCode(64);
const lib = new Function("DatabaseSync", "chaosJudge", "AT", "NOW", "iso", "isoMs", "msAgo", "first", "sql",
  nameLine + "\n" + fixtureChunk + "\n" + casesChunk + "\nreturn { NAMES, fresh, one, run, CASES, cfgSet, cfgDel, issue, diag, newPb, ev };")(DatabaseSync, chaosJudge, AT, NOW, iso, isoMs, msAgo, first, sqlB);
const { NAMES, fresh, one, run, CASES, cfgSet, cfgDel, newPb } = lib;
const CHANGED = ["research-repo-archive-gate", "research-repo-sync-switches", "breach-doctor-caps", "breach-doctor-taint-guard", "breach-doctor-gap-measure", "breach-doctor-gap-caps", "breach-doctor-rearm-capacity", "breach-doctor-auto-demotion", "breach-doctor-tool-exclusion-rule", "metric-playbook-recovery-hold", "pn-r2-filer-quiet-gate"];
const UNTOUCHED = NAMES.filter((n) => !CHANGED.includes(n));
ok(CHANGED.length === 11 && UNTOUCHED.length === 7, "11 probes change and 7 do not");
const GUARD = "UPDATE breach_playbooks SET trigger_sql = 'SELECT 1 FROM tool_error_exclusions WHERE NOT (st.calls_6h >= 10 AND st.classed_6h * 100 >= 30 * st.calls_6h)' WHERE rule_id = 'TL-R03-exclude';"; // the live trigger holds the surge guard
const freshOld = () => { const d = fresh(true); d.exec(GUARD); return d; };                 // the merged state: file 4 applied
const freshNew = () => { const d = fresh(true); d.exec(GUARD); d.exec(sqlF); return d; };
const probe = (db, c) => one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", c).probe_sql;
const obs = (db, c) => run(db, c);

// reworded failing reasons (written here, independently of the migration)
const NEW_REASON = {
  "research-repo-archive-gate": ["ops_config research_repo_archive holds a value other than on or off (the worker ignores case and spaces), so the off lever is unreadable"],
  "research-repo-sync-switches": ["research_repo_sync or research_repo_restore holds a value other than on or off (the worker ignores case and spaces), so that step of the tick cannot be switched", "no repo-sync event in 7 days while the target is not legacy, so the 10-minute sync tick that the switches guard has not run"],
  "breach-doctor-caps": ["a doctor cap is outside the range bdConfig accepts (cases 1 to 60, actions 0 to 20, budget 5000 to 40000 ms), so the engine clamps it"],
  "breach-doctor-taint-guard": ["the doctor_taint_violations_24h metric is missing or was not refreshed in 3 hours while the doctor is not switched off, so a refused free-text fact would go unreported"],
  "breach-doctor-gap-measure": ["the playbook-gap rule is missing or no longer in measure, so the hold this control records was lifted without the register being updated"],
  "breach-doctor-gap-caps": ["the playbook-gap row is missing or has no bounded max_per_tick (0 to 12) and max_per_day (0 to 100), so the rate of gap issues is not bounded"],
  "breach-doctor-rearm-capacity": ["the TL-R01-rearm rule is missing, so the enabled switch that stops it has no row to switch"],
  "breach-doctor-tool-exclusion-rule": ["the TL-R03-exclude rule is missing, has no revert, no longer reads tool_error_exclusions or lost its surge guard (30 percent of at least 10 calls in 6 hours)"],
  "metric-playbook-recovery-hold": ["the MD-4 rule is missing or its recovery gate is not between 1 and 120 minutes (the SLA-120M-1 ceiling)", "ops_config breach_doctor holds a value the engine does not read as on, measure or off, so the lever that removes the gate without a deploy is unreadable"],
  "pn-r2-filer-quiet-gate": ["the PN-R2 rule is missing, so the enabled switch that stops it has no row to switch", "the PN-R2 trigger carries a 24-hour quiet window again, which SLA-120M-1 forbids"]
};
// the cases of the earlier suite whose outcome changes on purpose: [control, why] -> "FAIL>OK" or "OK>FAIL"
const FLIPS = {
  "research-repo-archive-gate|the value is Off (only the exact off stops the code)": "FAIL>OK",
  "research-repo-sync-switches|restore holds ON": "FAIL>OK",
  "research-repo-sync-switches|target holds Legacy": "FAIL>OK",
  "breach-doctor-gap-measure|the playbook-gap row is disabled": "FAIL>OK",
  "breach-doctor-gap-measure|the sanctioned exit: the gap rule switched on": "OK>FAIL",
  "breach-doctor-gap-caps|max_per_tick 0": "FAIL>OK",
  "breach-doctor-gap-caps|max_per_day 0": "FAIL>OK",
  "breach-doctor-rearm-capacity|the rule is disabled": "FAIL>OK",
  "breach-doctor-tool-exclusion-rule|the rule is disabled": "FAIL>OK",
  "metric-playbook-recovery-hold|the MD-4 gate is 12 minutes": "FAIL>OK",
  "metric-playbook-recovery-hold|the MD-4 rule is disabled": "FAIL>OK",
  "pn-r2-filer-quiet-gate|the rule is disabled": "FAIL>OK"
};

// ---- 1. differential over every case of the earlier suite for the 11 controls ----
{
  const seen = {}; let compared = 0, same = 0, bad = [];
  for (const control of CHANGED) for (const k of CASES[control]) {
    const oldDb = freshOld(), newDb = freshNew();
    oldDb.exec(k.brk || k.chg); newDb.exec(k.brk || k.chg);
    const o = obs(oldDb, control), n = obs(newDb, control);
    compared++;
    const key = control + "|" + k.why, flip = FLIPS[key];
    if (flip) {
      seen[key] = (o.pass ? "OK" : "FAIL") + ">" + (n.pass ? "OK" : "FAIL");
      if (seen[key] !== flip) bad.push({ key, want: flip, got: seen[key], o: o.observed, n: n.observed });
      continue;
    }
    const sameOutcome = o.pass === n.pass;
    const sameReason = o.pass || o.observed === n.observed || (NEW_REASON[control] || []).includes(n.observed);
    if (!sameOutcome || !sameReason) bad.push({ key, o: o.observed, n: n.observed });
    else same++;
  }
  ok(bad.length === 0, "differential: every case of the earlier suite reads the same under the new probe except the listed flips, and a failing reason is unchanged or a listed rewording (" + compared + " cases, " + same + " identical outcomes)", bad.slice(0, 3));
  ok(Object.keys(FLIPS).every((k) => seen[k] === FLIPS[k]), "every listed flip occurs in the case table and has the stated direction", Object.keys(FLIPS).filter((k) => seen[k] !== FLIPS[k]));
  ok(compared >= 90, "the differential covers at least 90 cases", compared);
}
// every probe still reads ok on the good world, read-only
{
  const db = freshNew();
  for (const n of NAMES) { const v = obs(db, n); ok(v.pass === true && v.observed === "ok" && v.readOnly === true && v.rows === 1, n + ": reads ok on the good world after the file, read-only", v); }
}

// ---- 2. the new behaviour ----
const outcome = (mk, control) => { const d = freshNew(); mk(d); return obs(d, control); };
const oldOutcome = (mk, control) => { const d = freshOld(); mk(d); return obs(d, control); };
const exec = (s) => (d) => d.exec(s);
const OFFS = ["off", "OFF", " Off ", "disabled", "0", "false", "no"];
{ // the doctor switched off in any spelling the engine reads: the clauses that need the tick are skipped
  const stale = "DELETE FROM breach_diagnosis_events; UPDATE metric_registry SET last_refreshed = '" + iso(400) + "' WHERE metric = 'doctor_taint_violations_24h'; INSERT INTO breach_diagnoses (issue_id, rule_id, state, mode, lease_until) VALUES (1, 'TL-R01-rearm', 'applied', 'on', '" + iso(300) + "'); UPDATE breach_playbooks SET mode = 'measure', note = 'demoted " + iso(300) + " x' WHERE rule_id = 'CM-R1';";
  for (const spelling of OFFS) {
    const mk = exec(stale + "UPDATE ops_config SET value = '" + spelling + "' WHERE key = 'breach_doctor';");
    ok(outcome(mk, "breach-doctor-caps").observed === "ok", "caps: no tick event while the doctor is off as " + JSON.stringify(spelling) + " reads ok");
    ok(outcome(mk, "breach-doctor-taint-guard").observed === "ok", "taint guard: a metric 400 minutes old while the doctor is off as " + JSON.stringify(spelling) + " reads ok");
    ok(outcome(mk, "breach-doctor-rearm-capacity").observed === "ok", "rearm capacity: a case 300 minutes past its lease while the doctor is off as " + JSON.stringify(spelling) + " reads ok");
    ok(outcome(mk, "breach-doctor-auto-demotion").observed === "ok", "auto demotion: a rule demoted 300 minutes ago while the doctor is off as " + JSON.stringify(spelling) + " reads ok");
    ok(outcome(mk, "metric-playbook-recovery-hold").observed === "ok", "recovery hold: the doctor switch as " + JSON.stringify(spelling) + " is a readable lever");
  }
  const live = exec(stale);
  ok(/no tick event/.test(outcome(live, "breach-doctor-caps").observed) && /not refreshed in 3 hours/.test(outcome(live, "breach-doctor-taint-guard").observed) && /past its 30-minute lease/.test(outcome(live, "breach-doctor-rearm-capacity").observed) && /stayed demoted/.test(outcome(live, "breach-doctor-auto-demotion").observed), "the same stale world with the doctor on still fails all four clauses (the skip is the switch, not a loosening)");
  for (const spelling of ["on", "ON", " measure ", "measure"]) ok(outcome(exec(stale + "UPDATE ops_config SET value = '" + spelling + "' WHERE key = 'breach_doctor';"), "breach-doctor-caps").pass === false, "caps: the doctor on as " + JSON.stringify(spelling) + " is not off, so a missing tick still fails");
  ok(/does not read as on, measure or off/.test(outcome(exec(cfgSet("breach_doctor", "maybe")), "metric-playbook-recovery-hold").observed), "recovery hold: a value the engine does not read still fails");
  ok(outcome(exec("DELETE FROM breach_diagnosis_events;" + cfgDel("breach_doctor")), "breach-doctor-caps").pass === false, "caps: an absent doctor switch reads measure (not off), so a missing tick fails");
}
{ // research flags are read without case and space; the legacy target logs no sync event
  for (const v of ["ON", " On ", "OFF", " off"]) {
    ok(outcome(exec(cfgSet("research_repo_archive", v)), "research-repo-archive-gate").observed === "ok", "archive gate: the flag as " + JSON.stringify(v) + " reads ok (floorFlag trims and lowercases)");
    ok(outcome(exec(cfgSet("research_repo_sync", v) + cfgSet("research_repo_restore", v)), "research-repo-sync-switches").observed === "ok", "sync switches: sync and restore as " + JSON.stringify(v) + " read ok");
  }
  for (const v of ["Legacy", " CONSOLIDATED ", "Auto"]) ok(outcome(exec(cfgSet("research_repo_target", v)), "research-repo-sync-switches").observed === "ok", "sync switches: the target as " + JSON.stringify(v) + " reads ok");
  ok(/other than on or off/.test(outcome(exec(cfgSet("research_repo_archive", "yes")), "research-repo-archive-gate").observed) && /other than on or off/.test(outcome(exec(cfgSet("research_repo_sync", "maybe")), "research-repo-sync-switches").observed) && /other than auto, legacy or consolidated/.test(outcome(exec(cfgSet("research_repo_target", "elsewhere")), "research-repo-sync-switches").observed), "a flag that is not on or off, and a target that is not auto, legacy or consolidated, still fail");
  const noEvents = "DELETE FROM cloud_ops_events;";
  ok(/no repo-sync event in 7 days while the target is not legacy/.test(outcome(exec(noEvents), "research-repo-sync-switches").observed) && /no repo-sync event/.test(outcome(exec(noEvents + cfgSet("research_repo_target", "consolidated")), "research-repo-sync-switches").observed), "no sync event for 7 days still fails while the target is auto or consolidated");
  for (const v of ["legacy", "Legacy", " LEGACY "]) ok(outcome(exec(noEvents + cfgSet("research_repo_target", v)), "research-repo-sync-switches").observed === "ok", "no sync event for 7 days reads ok while the target is " + JSON.stringify(v) + " (the alternate in use logs nothing)");
}
{ // a disabled playbook row is the lever; a missing row is the failure
  const dis = (rule) => exec("UPDATE breach_playbooks SET enabled = 0 WHERE rule_id = '" + rule + "';");
  const del = (rule) => exec("DELETE FROM breach_playbooks WHERE rule_id = '" + rule + "';");
  for (const [c, rule] of [["breach-doctor-rearm-capacity", "TL-R01-rearm"], ["metric-playbook-recovery-hold", "MD-4"], ["pn-r2-filer-quiet-gate", "PN-R2"], ["breach-doctor-gap-measure", "playbook-gap"], ["breach-doctor-gap-caps", "playbook-gap"], ["breach-doctor-tool-exclusion-rule", "TL-R03-exclude"]]) {
    ok(outcome(dis(rule), c).observed === "ok", c + ": " + rule + " disabled on purpose reads ok (the old probe: " + (oldOutcome(dis(rule), c).pass ? "ok" : "red") + ")");
    ok(oldOutcome(dis(rule), c).pass === false, c + ": the old probe read the disabled lever as a failure (the defect)");
    ok(outcome(del(rule), c).pass === false, c + ": " + rule + " deleted still fails");
  }
  ok(outcome(exec("UPDATE breach_playbooks SET max_per_tick = 0, max_per_day = 0 WHERE rule_id = 'playbook-gap';"), "breach-doctor-gap-caps").observed === "ok", "gap caps: a paused rate (0 and 0) reads ok");
  ok(/not bounded/.test(outcome(exec("UPDATE breach_playbooks SET max_per_tick = 13 WHERE rule_id = 'playbook-gap';"), "breach-doctor-gap-caps").observed) && /not bounded/.test(outcome(exec("UPDATE breach_playbooks SET max_per_day = 101 WHERE rule_id = 'playbook-gap';"), "breach-doctor-gap-caps").observed) && /not bounded/.test(outcome(exec("UPDATE breach_playbooks SET max_per_tick = -1 WHERE rule_id = 'playbook-gap';"), "breach-doctor-gap-caps").observed), "gap caps: a rate over 12 a tick, over 100 a day or negative still fails");
}
{ // MD-4 gate, PN-R2 idiom, surge guard, gap measure
  const gate = (n) => exec("UPDATE breach_playbooks SET trigger_sql = replace(trigger_sql, '>= 120 AND', '>= " + n + " AND') WHERE rule_id = 'MD-4';");
  for (const n of [1, 30, 90, 119, 120]) ok(outcome(gate(n), "metric-playbook-recovery-hold").observed === "ok", "recovery hold: an MD-4 gate of " + n + " minutes reads ok (inside the SLA)");
  for (const n of [0, 121, 144, 1200, 1440]) ok(/not between 1 and 120 minutes/.test(outcome(gate(n), "metric-playbook-recovery-hold").observed), "recovery hold: an MD-4 gate of " + n + " minutes fails");
  ok(/not between 1 and 120 minutes/.test(outcome(exec("UPDATE breach_playbooks SET trigger_sql = 'SELECT 1' WHERE rule_id = 'MD-4';"), "metric-playbook-recovery-hold").observed), "recovery hold: an MD-4 trigger with no gate text fails");
  const pn = (extra) => exec("UPDATE breach_playbooks SET trigger_sql = trigger_sql || ' " + extra.replace(/'/g, "''") + "' WHERE rule_id = 'PN-R2';");
  ok(outcome(pn("AND (julianday('now') - julianday(x)) * 1440 >= 30"), "pn-r2-filer-quiet-gate").observed === "ok" && oldOutcome(pn("AND (julianday('now') - julianday(x)) * 1440 >= 30"), "pn-r2-filer-quiet-gate").pass === false, "pn-r2: the minutes idiom * 1440 in a v3 trigger reads ok (the old probe flagged it)");
  for (const w of ["AND ts > datetime('now', '-1440 minutes')", "AND ts > strftime('%s', 'now', '-24 hours')", "AND x > '1440 minutes'"]) ok(/24-hour quiet window/.test(outcome(pn(w), "pn-r2-filer-quiet-gate").observed), "pn-r2: the quiet window form " + w + " fails");
  const guardEdit = (from, to) => exec("UPDATE breach_playbooks SET trigger_sql = replace(trigger_sql, '" + from + "', '" + to + "') WHERE rule_id = 'TL-R03-exclude';");
  const noGuard = exec("UPDATE breach_playbooks SET trigger_sql = 'SELECT 1 FROM tool_error_exclusions' WHERE rule_id = 'TL-R03-exclude';");
  ok(/lost its surge guard/.test(outcome(noGuard, "breach-doctor-tool-exclusion-rule").observed) && oldOutcome(noGuard, "breach-doctor-tool-exclusion-rule").pass === true, "tool exclusion: a trigger that lost the surge guard now FAILS (the old probe read ok: it could not fail)");
  for (const [from, to] of [["st.calls_6h >= 10", "st.calls_6h >= 1"], ["st.classed_6h * 100 >= 30 * st.calls_6h", "st.classed_6h * 100 >= 90 * st.calls_6h"]]) {
    ok(/lost its surge guard/.test(outcome(guardEdit(from, to), "breach-doctor-tool-exclusion-rule").observed) && oldOutcome(guardEdit(from, to), "breach-doctor-tool-exclusion-rule").pass === true, "tool exclusion: the surge guard edited from " + from + " to " + to + " fails (the old probe read ok)");
  }
  ok(/no longer in measure/.test(outcome(exec("UPDATE breach_playbooks SET mode = 'on' WHERE rule_id = 'playbook-gap';"), "breach-doctor-gap-measure").observed), "gap measure: switching playbook-gap to on now fails until the register is updated");
  ok(oldOutcome(exec("UPDATE breach_playbooks SET mode = 'on' WHERE rule_id = 'playbook-gap';"), "breach-doctor-gap-measure").pass === true, "gap measure: the old probe stayed green when the hold was lifted (it could not fail)");
  ok(outcome(exec("UPDATE breach_playbooks SET enabled = 0 WHERE rule_id = 'playbook-gap';"), "breach-doctor-gap-measure").observed === "ok", "gap measure: a disabled gap rule in measure reads ok");
}

// ---- 3. untouched probes, backup, notes, decision, replay, rollback, hygiene ----
{
  const o = freshOld(), n = freshNew();
  ok(UNTOUCHED.every((c) => probe(o, c) === probe(n, c)), "the 7 untouched probes keep their stored text byte for byte", UNTOUCHED.filter((c) => probe(o, c) !== probe(n, c)));
  ok(CHANGED.every((c) => probe(o, c) !== probe(n, c)), "the 11 changed probes differ from the old text");
  const WRITE = /\b(insert|update|delete|drop|alter|create|replace|attach|pragma|vacuum|reindex)\b/i;
  ok(CHANGED.every((c) => /^SELECT 'ok' AS expected, CASE WHEN /.test(probe(n, c)) && / ELSE 'ok' END AS observed$/.test(probe(n, c)) && !WRITE.test(probe(n, c)) && !probe(n, c).includes(";") && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(probe(n, c))), "every changed probe is still a single read-only SELECT of the expected/observed shape with no write word, semicolon or address");
  const bak = n.prepare("SELECT control, old_probe_sql, old_window_note FROM bak_20261026_control_probes4d ORDER BY control").all();
  ok(bak.length === 11 && bak.every((b) => b.old_probe_sql === probe(o, b.control) && !b.old_window_note.includes("CONTROL-ALT-PROBES-4D")), "the backup table holds the 11 old probe texts and notes", bak.length);
  const notes = n.prepare("SELECT control, window_note FROM control_alternate_probes WHERE instr(window_note, 'CONTROL-ALT-PROBES-4D') > 0").all().map((r) => r.control).sort();
  ok(JSON.stringify(notes) === JSON.stringify([...CHANGED].sort()) && n.prepare("SELECT window_note FROM control_alternate_probes").all().every((r) => (r.window_note.match(/CONTROL-ALT-PROBES-4D/g) || []).length <= 1), "the window note is added once to exactly the 11 changed probes");
  const dl = n.prepare("SELECT * FROM decision_log WHERE instr(action, 'CONTROL-ALT-PROBES-4D:') = 1").all();
  const cols = ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"];
  ok(dl.length === 1 && dl[0].actor === "rem-a3-drills" && cols.every((c) => typeof dl[0][c] === "string" && dl[0][c].trim().length > 3) && !cols.some((c) => / within /i.test(dl[0][c])), "one decision row fills all eleven columns and holds no ' within '", dl.length);
  const snap = (d) => JSON.stringify(["control_alternate_probes", "decision_log", "bak_20261026_control_probes4d"].map((t) => d.prepare("SELECT * FROM " + t + " ORDER BY 1").all()));
  const s1 = snap(n); let threw = null;
  try { n.exec(sqlF); } catch (e) { threw = String(e && e.message || e); }
  ok(threw === null && snap(n) === s1, "applying the file a second time changes nothing", threw);
  const d2 = freshOld(); const orig = JSON.stringify(d2.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all());
  d2.exec(sqlF); d2.exec("DROP TABLE bak_20261026_control_probes4d"); d2.exec(rollback);
  ok(JSON.stringify(d2.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all()) === orig, "the Rollback line restores the 11 probes and notes byte for byte, with the backup table gone");
  const d3 = freshOld(); d3.prepare("UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, 'the PN-R2 rule is missing or disabled', 'rewritten') WHERE control = 'pn-r2-filer-quiet-gate'").run(); const rewritten = probe(d3, "pn-r2-filer-quiet-gate"); d3.exec(sqlF);
  ok(probe(d3, "pn-r2-filer-quiet-gate") === rewritten && probe(d3, "metric-playbook-recovery-hold") === probe(n, "metric-playbook-recovery-hold"), "a probe someone has since rewritten is left alone and the others still change");
}
{
  const test = readFileSync(here("control-alternate-probes4d.test.mjs"), "utf8");
  const lits = [...code.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1].replace(/''/g, "'")));
  ok(lits.every((n) => n <= 50), "no LIKE or GLOB pattern over 50 bytes (D1 limit)", lits);
  ok(/^-- APPLY-BY: ci$/m.test(sqlF) && /^-- DB: qnfo-audit$/m.test(sqlF) && /^-- BACKUP: bak_20261026_control_probes4d$/m.test(sqlF) && /\n-- Rollback: [^\n]+\n/.test(sqlF) && rollback.length > 5000, "the opt-in headers, the backup header and a one-line Rollback are present");
  ok(!/^\s*(DROP|DELETE)\b/im.test(code) && !/\bCREATE\s+TRIGGER\b/i.test(code) && /^CREATE TABLE IF NOT EXISTS bak_20261026_control_probes4d AS\s+SELECT/.test(code.trim()), "no DELETE or DROP in the body, no trigger, the backup is the first statement and is created AS SELECT");
  ok((code.match(/;\s*\n/g) || []).length === 14, "fourteen statements end a line with a semicolon (the runner counts fourteen)", (code.match(/;\s*\n/g) || []).length);
  ok(!/claude\.ai|anthropic\.com/i.test(sqlF + test) && !/(sk-|ghp_|xox[bp]-)[A-Za-z0-9]{10,}/.test(sqlF + test) && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sqlF + test), "no vendor link, no secret value, no e-mail address");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
