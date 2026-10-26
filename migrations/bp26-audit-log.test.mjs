// BP26-AUDIT-LOG-1 / BP26-LEASES-KILLSWITCH-1 offline suite: replays migrations/2026-10-26-bp26-audit-log.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); the four tables, the unique source index and the eight append-only guards exist; the
// 8-day backfill takes ledger rows inside the window only (mail: status sent only, recipient DOMAIN only, never the address) and classifies fleet_deploys rows as deploy, settings, secret-write and rollback;
// the four writer triggers record new ledger rows once and ignore what is not a side effect; UPDATE and DELETE abort on agent_actions, agent_action_chain, agent_action_roots and kill_switch_tests;
// v_lease_abandonments_7d counts only expired claims; the three metrics get their producer text with the [BP26] tag; a replay changes nothing; the Rollback line removes everything it made.
// Output MUST contain "0 failed" on success.   node migrations/bp26-audit-log.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-audit-log.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(!/@[a-z0-9-]+\.[a-z]/i.test(body.replace(/'@'/g, "")), "the migration names no e-mail address");

const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const day = (d) => new Date(Date.now() - d * 86400000).toISOString().replace(/\.\d+Z$/, "Z");
const ledger = (d) => day(d).replace("T", " ").replace("Z", "");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`
CREATE TABLE fleet_deploys (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, actor TEXT, from_sha TEXT, to_sha TEXT, source_path TEXT, ok INTEGER, note TEXT, ts TEXT, session_id TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, status TEXT DEFAULT 'received', received_at TEXT DEFAULT (datetime('now')));
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, status TEXT DEFAULT 'published', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, status TEXT DEFAULT 'queued', posted_at TEXT, post_uri TEXT);
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL, expires_at TEXT NOT NULL, released_at TEXT, outcome TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT, last_value TEXT, state TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
INSERT INTO metric_registry VALUES ('audit_coverage', 'agent_actions (to build) [BP26]', NULL, 'UNMEASURED'), ('audit_chain_verify', 'agent_actions chain verifier (to build) [BP26]', NULL, 'UNMEASURED'), ('kill_switch_test_age_days', 'kill-switch test ledger (to build) [BP26]', NULL, 'UNMEASURED');`);
  const fd = w.prepare("INSERT INTO fleet_deploys (worker, actor, to_sha, source_path, ok, note, ts, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  fd.run("qnfo-ops", "qnfo-ops/ops-deploy", "5.40.3-x", null, 1, "server-side deploy (opsDeploy route)", day(1), "s1");                       // deploy
  fd.run("qnfo-ai", "qnfo-fleet-control/obs-reassert", null, null, 1, "SETTINGS-ONLY: observability reassert", ledger(2), null);              // settings, old space format
  fd.run("qnfo-ops", "deepchat/ops secret-rotate", "k1-rotated", null, 1, "CANONICAL-DEPLOY-AUTH-DRIFT-1 remediation: rotated OPS_ROUTER_AUTH_KEY (k1) secret", day(3), null); // secret-write
  fd.run("qnfo-ops", "qnfo-ops/ops-deploy", "5.40.2", null, 1, "deploy that mentions a secret rotate in passing", day(3), null);              // version string: a deploy, not a secret write
  fd.run("qnfo-ops", "qnfo-fleet-control/redeploy", "3.1.0", null, 1, "rollback to 3.1.0 (ROLLBACK-OK)", day(4), null);                       // rollback
  fd.run("qnfo-ops", "workers-builds/git-integration", null, null, 1, "TOMBSTONE-STUB: Workers Builds deploy of the retired stub", day(5), null); // deploy
  fd.run("qnfo-gateway", "qnfo-ops/ops-deploy", "1.0.0", null, 0, "server-side deploy (opsDeploy route)", day(6), null);                      // failed deploy
  fd.run("old-worker", "qnfo-ops/ops-deploy", "0.1.0", null, 1, "outside the window", day(30), null);                                          // not backfilled
  fd.run("junk-ts", "x", "1", null, 1, "unparsable time", "not-a-time", null);                                                                  // not backfilled (NULL time)
  const em = w.prepare("INSERT INTO emails (message_id, sender, recipient, subject, status, received_at) VALUES (?, ?, ?, ?, ?, ?)");
  em.run("m1", "qnfo@qnfo.org", "Someone@Example.COM", "hello", "sent", day(1));                                                                 // backfilled, domain only
  em.run("m2", "x@y.org", "qnfo@qnfo.org", "inbound", "received", day(1));                                                                       // inbound: no
  em.run("m3", "x@y.org", "qnfo@qnfo.org", "inbound replied", "replied", day(1));                                                                // inbound later marked replied: not backfilled
  em.run("m4", "qnfo@qnfo.org", "old@example.com", "old", "sent", day(40));                                                                      // outside the window
  const sp = w.prepare("INSERT INTO social_media_posts (id, platform, post_id, url, published_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  sp.run("p1", "buffer-mastodon", "1", "https://mstdn.example/@QNFO/117506044806056387", day(1), "published", day(1));
  sp.run("p2", "bluesky-rollup", null, null, day(2), "published", day(2));
  sp.run("p3", "buffer-x", "3", null, day(2), "failed", day(2));                                                                                 // not published
  sp.run("p4", "buffer-x", "4", null, day(20), "published", day(20));                                                                            // outside the window
  w.prepare("INSERT INTO social_media_posts (id, platform, post_id, url, published_at, status, created_at) VALUES (NULL, ?, ?, ?, ?, ?, ?)").run("buffer-linkedin", "7", null, day(1), "published", day(1)); // NULL ledger id, in the window
  const th = w.prepare("INSERT INTO social_threads (slug, status, posted_at) VALUES (?, ?, ?)");
  th.run("t-posted", "posted", day(3)); th.run("t-queued", "queued", null); th.run("t-old", "posted", day(40));
  const wc = w.prepare("INSERT INTO work_claims (path, intent, holder, claimed_at, expires_at, released_at, outcome) VALUES (?, 'x', ?, ?, ?, ?, ?)");
  wc.run("file:a", "sess-1", day(1), day(1), day(1), "expired");
  wc.run("file:b", "sess-1", day(1), day(1), day(1), "merged");
  wc.run("file:c", "sess-2", day(2), day(2), day(2), "merged");
  wc.run("file:d", "sess-old", day(20), day(20), day(20), "expired");                                                                            // outside the 7 days
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const kind = (w, src, id) => (q1(w, "SELECT action_kind k FROM agent_actions WHERE source_table = ? AND source_id = ?", src, String(id)) || {}).k;

const w = world();
w.exec(sql);
const names = (type) => qa(w, "SELECT name FROM sqlite_master WHERE type = ? AND (name LIKE 'agent_action%' OR name LIKE 'kill_switch%' OR name LIKE 'v_lease%') ORDER BY name", type).map((r) => r.name);
ok(names("table").join() === "agent_action_chain,agent_action_roots,agent_actions,kill_switch_tests", "the four tables exist", names("table"));
const idx = qa(w, "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_agent_actions%' ORDER BY name").map((r) => r.name);
ok(idx.join() === "idx_agent_actions_kind_ts,idx_agent_actions_source" && names("view").join() === "v_lease_abandonments_7d", "the two indexes and the lease view exist", [idx, names("view")]);
ok(names("trigger").filter((n) => /_no_(update|delete)$/.test(n)).length === 8 && names("trigger").filter((n) => /_from_/.test(n)).length === 4, "eight guards and four writers exist", names("trigger"));

// backfill
ok(kind(w, "fleet_deploys", 1) === "deploy" && kind(w, "fleet_deploys", 2) === "settings" && kind(w, "fleet_deploys", 3) === "secret-write", "backfill classes: deploy, settings (space-format time), secret-write", [1, 2, 3].map((i) => kind(w, "fleet_deploys", i)));
ok(kind(w, "fleet_deploys", 4) === "deploy", "a versioned deploy that merely mentions a secret rotate stays a deploy", kind(w, "fleet_deploys", 4));
ok(kind(w, "fleet_deploys", 5) === "rollback" && kind(w, "fleet_deploys", 6) === "deploy", "rollback marker and tombstone classes", [kind(w, "fleet_deploys", 5), kind(w, "fleet_deploys", 6)]);
ok(q1(w, "SELECT outcome o FROM agent_actions WHERE source_table = 'fleet_deploys' AND source_id = '7'").o === "failed" && q1(w, "SELECT outcome o FROM agent_actions WHERE source_table = 'fleet_deploys' AND source_id = '1'").o === "ok", "ok 1 is ok, ok 0 is failed");
ok(kind(w, "fleet_deploys", 8) === undefined && kind(w, "fleet_deploys", 9) === undefined, "a row outside the 8-day window and a row with an unparsable time are not backfilled");
const ts1 = q1(w, "SELECT ts, via, target, version_id, session FROM agent_actions WHERE source_table = 'fleet_deploys' AND source_id = '2'");
ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(ts1.ts) && ts1.via === "backfill" && ts1.target === "qnfo-ai", "times are normalised to ISO Z and marked backfill", ts1);
const mail = qa(w, "SELECT target, action_kind, actor FROM agent_actions WHERE source_table = 'emails'");
ok(mail.length === 1 && mail[0].target === "mail:example.com" && mail[0].action_kind === "send", "mail: only the sent row inside the window, the recipient DOMAIN lower-cased", mail);
ok(!JSON.stringify(qa(w, "SELECT * FROM agent_actions")).match(/someone@/i), "no recipient address is stored anywhere");
ok(kind(w, "social_media_posts", "p1") === "publish" && kind(w, "social_media_posts", "p2") === "publish" && kind(w, "social_media_posts", "p3") === undefined && kind(w, "social_media_posts", "p4") === undefined, "posts: published inside the window only");
ok(q1(w, "SELECT target t FROM agent_actions WHERE source_id = 'p1'").t.includes("117506044806056387") && q1(w, "SELECT target t FROM agent_actions WHERE source_id = 'p2'").t === "bluesky-rollup:p2", "a post's target is its public URL, else platform:id");
ok(kind(w, "social_threads", 1) === "publish" && kind(w, "social_threads", 2) === undefined && kind(w, "social_threads", 3) === undefined, "threads: posted inside the window only");
const before = q1(w, "SELECT COUNT(*) n FROM agent_actions").n;
ok(before === 7 + 1 + 3 + 1, "row count after backfill: 7 deploy-ledger rows, 1 mail, 3 posts (one with a NULL ledger id), 1 thread", before);
ok(qa(w, "SELECT source_id s FROM agent_actions WHERE source_table = 'social_media_posts' AND source_id LIKE 'rowid:%'").length === 1, "a post with a NULL ledger id is recorded under rowid:<n>, not skipped");

// writers
w.prepare("INSERT INTO fleet_deploys (worker, actor, to_sha, ok, note, ts) VALUES ('qnfo-ai', 'qnfo-ops/ops-deploy', '2.0.0', 1, 'server-side deploy', ?)").run(day(0));
w.prepare("INSERT INTO fleet_deploys (worker, actor, to_sha, ok, note, ts) VALUES ('qnfo-ai', 'x', NULL, 1, 'SECRET-ONLY: PUT OPS_KEY', ?)").run(day(0));
w.prepare("INSERT INTO emails (message_id, sender, recipient, status, received_at) VALUES ('n1', 'qnfo@qnfo.org', 'a@Foo.org', 'replied', ?)").run(day(0));
w.prepare("INSERT INTO emails (message_id, sender, recipient, status, received_at) VALUES ('n2', 'q@z.org', 'qnfo@qnfo.org', 'received', ?)").run(day(0));
w.prepare("INSERT INTO social_media_posts (id, platform, post_id, status, published_at) VALUES ('p5', 'buffer-linkedin', '5', 'published', ?)").run(day(0));
w.prepare("INSERT INTO social_media_posts (id, platform, post_id, status, published_at) VALUES ('p6', 'buffer-linkedin', '6', 'failed', ?)").run(day(0));
w.prepare("INSERT INTO social_media_posts (id, platform, post_id, status, published_at) VALUES (NULL, 'buffer-x', '8', 'published', ?)").run(day(0));
w.prepare("UPDATE social_threads SET status = 'posted', posted_at = ? WHERE slug = 't-queued'").run(day(0));
w.prepare("UPDATE social_threads SET status = 'posted' WHERE slug = 't-posted'").run();      // already posted: no second row
ok(kind(w, "fleet_deploys", 10) === "deploy" && kind(w, "fleet_deploys", 11) === "secret-write", "writer on fleet_deploys: a deploy and a SECRET-ONLY secret-write", [kind(w, "fleet_deploys", 10), kind(w, "fleet_deploys", 11)]);
ok(q1(w, "SELECT via v FROM agent_actions WHERE source_table = 'fleet_deploys' AND source_id = '10'").v === "trigger", "trigger rows say via trigger");
ok(qa(w, "SELECT * FROM agent_actions WHERE source_table = 'emails'").length === 2 && q1(w, "SELECT target t FROM agent_actions WHERE source_table = 'emails' AND source_id = '5'").t === "mail:foo.org", "writer on emails: an outbound row inserted as replied is recorded by domain, an inbound received row is not");
ok(kind(w, "social_media_posts", "p5") === "publish" && kind(w, "social_media_posts", "p6") === undefined, "writer on social_media_posts: published yes, failed no");
ok(kind(w, "social_threads", 2) === "publish" && qa(w, "SELECT * FROM agent_actions WHERE source_table = 'social_threads'").length === 2, "writer on social_threads: queued to posted records once, posted to posted nothing");
ok(q1(w, "SELECT COUNT(*) n FROM agent_actions").n === before + 2 + 1 + 1 + 1 + 1, "exactly the six new side effects were added (two deploy-ledger rows, one mail, two posts, one thread)");
w.prepare("INSERT OR IGNORE INTO agent_actions (ts, action_kind, source_table, source_id) VALUES ('2026-10-26T00:00:00Z', 'deploy', 'fleet_deploys', '10')").run();
ok(q1(w, "SELECT COUNT(*) n FROM agent_actions WHERE source_table = 'fleet_deploys' AND source_id = '10'").n === 1, "the unique source index refuses a second row for one ledger row");

// append-only
const aborts = (stmt) => { try { w.exec(stmt); return false; } catch (e) { return /append-only/.test(String(e && e.message)); } };
w.prepare("INSERT INTO agent_action_chain (action_id, prev_hash, row_hash, sealed_at) VALUES (1, '0', 'h', '2026-10-26T00:00:00Z')").run();
w.prepare("INSERT INTO agent_action_roots (day, head_seq, head_hash, rows_total, written_at) VALUES ('2026-10-26', 1, 'h', 1, '2026-10-26T00:00:00Z')").run();
w.prepare("INSERT INTO kill_switch_tests (flag, mode, outcome, evidence) VALUES ('ops_config.x', 'dry-run', 'aborted', 'test')").run();
ok(aborts("UPDATE agent_actions SET actor = 'x'") && aborts("DELETE FROM agent_actions"), "agent_actions: UPDATE and DELETE abort");
ok(aborts("UPDATE agent_action_chain SET row_hash = 'x'") && aborts("DELETE FROM agent_action_chain"), "agent_action_chain: UPDATE and DELETE abort");
ok(aborts("UPDATE agent_action_roots SET head_hash = 'x'") && aborts("DELETE FROM agent_action_roots"), "agent_action_roots: UPDATE and DELETE abort");
ok(aborts("UPDATE kill_switch_tests SET outcome = 'pass'") && aborts("DELETE FROM kill_switch_tests"), "kill_switch_tests: UPDATE and DELETE abort");
ok(q1(w, "SELECT COUNT(*) n FROM kill_switch_tests WHERE outcome = 'pass'").n === 0, "no kill-switch drill is recorded as passed by the migration");

// lease view
const lv = Object.fromEntries(qa(w, "SELECT * FROM v_lease_abandonments_7d").map((r) => [r.holder, r]));
ok(lv["sess-1"] && lv["sess-1"].claims === 2 && lv["sess-1"].abandoned === 1 && lv["sess-1"].abandoned_share === 0.5, "v_lease_abandonments_7d: one of sess-1's two claims was abandoned", lv["sess-1"]);
ok(lv["sess-2"].abandoned === 0 && !lv["sess-old"], "a released claim is not an abandonment and a claim older than 7 days is outside the view", lv);

// metrics and decision
const mt = Object.fromEntries(qa(w, "SELECT metric, source_of_truth s FROM metric_registry").map((r) => [r.metric, r.s]));
ok(["audit_coverage", "audit_chain_verify", "kill_switch_test_age_days"].every((m) => mt[m].endsWith("[BP26]") && !/to build/.test(mt[m])), "the three metrics name their producer and keep the [BP26] tag", mt);
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-AUDIT-LOG-1:%'").n === 1, "the decision is logged once");

// replay
const snap = () => JSON.stringify([q1(w, "SELECT COUNT(*) n FROM agent_actions"), q1(w, "SELECT COUNT(*) n FROM decision_log"), qa(w, "SELECT * FROM metric_registry")]);
const s1 = snap();
w.exec(sql);
ok(snap() === s1, "a replay changes nothing");

// rollback
w.exec(rollback);
ok(names("table").length === 0 && names("trigger").length === 0 && names("view").length === 0, "the Rollback line removes every table, trigger and view the file made", [names("table"), names("trigger"), names("view")]);
const mt2 = Object.fromEntries(qa(w, "SELECT metric, source_of_truth s FROM metric_registry").map((r) => [r.metric, r.s]));
ok(mt2.audit_coverage === "agent_actions (to build) [BP26]" && mt2.kill_switch_test_age_days === "kill-switch test ledger (to build) [BP26]", "and puts the three metric texts back", mt2);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
