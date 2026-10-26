// BP26-REACH-1 offline suite: replays migrations/2026-10-26-bp26-reach.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); the DNS table exists with the columns scripts/bp26_reach.py writes;
// the five metrics' source_of_truth name the real producer, keep the [BP26] tag the framework requires, and no other metric changes; the Postmaster card is IDENTITY-BOUND and filed once;
// the decision is logged once; a replay changes nothing; the Rollback line restores the old texts, drops the table and removes the card; decision_log is only inserted into.
// Output MUST contain "0 failed" on success.   node migrations/bp26-reach.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-reach.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(!/\b(CREATE|ALTER|DROP)\s+\w*\s*(RECORD|DNS)\b/i.test(body) && !/dns_records|zones\/.*dns/i.test(body), "no DNS write is described or issued");

const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const OLD = {
  dmarc_aligned_pass_rate: "rua report parser (to build) [BP26]",
  rfc8058_headers_present: "mail send log (to compute) [BP26]",
  unsubscribe_honoured_48h: "subscriber tables (to compute) [BP26]",
  social_bot_label_enabled: "qnfo-social account probe (to build) [BP26]",
  social_unsolicited_mentions: "social_threads posts (to scan) [BP26]",
};
const world = () => {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT, last_value TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT);`);
  for (const [m, s] of Object.entries(OLD)) w.prepare("INSERT INTO metric_registry (metric, source_of_truth) VALUES (?, ?)").run(m, s);
  w.prepare("INSERT INTO metric_registry (metric, source_of_truth, last_value) VALUES ('orphaned_leases', 'qnfo-audit.work_claims [BP26]', '0')").run();
  return w;
};
const sot = (w) => Object.fromEntries(w.prepare("SELECT metric, source_of_truth s FROM metric_registry").all().map((r) => [r.metric, r.s]));

const w = world();
w.exec(sql);
const after = sot(w);
ok(Object.keys(OLD).every((m) => after[m] !== OLD[m] && after[m].endsWith("[BP26]") && /scripts\/bp26_reach\.py/.test(after[m])), "the five metrics name scripts/bp26_reach.py and keep the [BP26] tag", after);
ok(after.orphaned_leases === "qnfo-audit.work_claims [BP26]", "no other metric changes");
const cols = w.prepare("PRAGMA table_info(bp26_dns_email_auth)").all().map((c) => c.name).join();
ok(cols === "domain,spf,spf_ok,dkim_cf_selector,dmarc_policy,dmarc_sp,dmarc_rua,dmarc_pct,checked_at", "the DNS table has the columns the collector writes", cols);
const card = w.prepare("SELECT * FROM human_actions WHERE slug = 'bp26-postmaster-registration'").all();
ok(card.length === 1 && /^IDENTITY-BOUND:/.test(card[0].why) && card[0].status === "open" && /not now/.test(card[0].action), "the Postmaster Tools card is IDENTITY-BOUND, open, with a default", card.map((c) => c.slug));
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-REACH-1:%'").get().n === 1, "the decision is logged once");

w.exec(sql);
ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && w.prepare("SELECT COUNT(*) n FROM human_actions").get().n === 1, "a replay files nothing twice");
ok(JSON.stringify(sot(w)) === JSON.stringify(after), "a replay changes no source_of_truth");

w.exec(rollback);
const back = sot(w);
ok(Object.keys(OLD).every((m) => back[m] === OLD[m]), "the Rollback line restores the five old texts", back);
ok(w.prepare("SELECT name FROM sqlite_master WHERE name = 'bp26_dns_email_auth'").all().length === 0 && w.prepare("SELECT COUNT(*) n FROM human_actions").get().n === 0, "and drops the table and removes the card");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
