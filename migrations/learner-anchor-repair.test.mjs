// LEARNER-ARMS-3 migration suite: replays migrations/2026-10-26-learner-anchor-repair.sql on node:sqlite over the production shape of social_learner_posts,
// dissemination_tracker and decision_log. Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, a BACKUP table); a Bluesky roll-up row
// (no-data or pending) whose record key decodes to a time more than an hour after its stored posted_at is re-filed under the key's time (the same millisecond as the
// worker's blueskyTidMs), with its slot, n_posts 2, status pending and the old time named in reward_detail; a post the drain sent (key and time agree), a credited
// row, a not-arm row, a row whose key is not a TID, a thread row, a channel-drain row, a key from the future and a key before 2023 are not touched; the old values are
// in the backup table; a replay changes nothing, even after the credit step has credited a re-filed row; the Rollback line restores the re-filed rows.
// Output MUST contain "0 failed" on success.   node migrations/learner-anchor-repair.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mod = await import("../qnfo-social/worker.js");

const sql = readFileSync(new URL("./2026-10-26-learner-anchor-repair.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1 && header.some((l) => /^-- BACKUP: bak_20261026_learner_anchor\s*$/.test(l)), "exactly one single-line Rollback header and the BACKUP table is named");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const A = "234567abcdefghijklmnopqrstuvwxyz";
function tidOf(ms, clock) {
  let v = BigInt(Math.round(ms)) * 1000n * 1024n + BigInt(clock || 0);
  let s = "";
  for (let i = 0; i < 13; i++) { s = A[Number(v % 32n)] + s; v = v / 32n; }
  return s;
}
const uriOf = (key) => "at://did:plc:vad2yeqflg5uznmp557zge5c/app.bsky.feed.post/" + key;
const DAY = 864e5, HOUR = 36e5;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const w = new DatabaseSync(":memory:");
w.exec(`CREATE TABLE social_learner_posts (post_key TEXT PRIMARY KEY, slug TEXT, bsky_uri TEXT, link_slug TEXT, topic TEXT, format TEXT, slot TEXT, n_posts INTEGER, posted_at TEXT, chosen_by TEXT, decision TEXT, status TEXT, engagement REAL, visits REAL, reward REAL, reward_detail TEXT, credited_at TEXT, created_at TEXT, channel TEXT, buffer_id TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, mode TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
const put = (key, o) => {
  w.prepare("INSERT INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, reward_detail, credited_at, created_at, channel) VALUES (?, ?, ?, ?, ?, 'single', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(key, key.slice(7), o.uri, key.slice(7), o.topic === undefined ? "physics" : o.topic, o.slot || "eu-morning", o.n || 1, o.at, o.by || "scheduler", o.status, o.rd === undefined ? '{"window":["x","y"],"reason":"no snapshot"}' : o.rd, o.credited || null, iso(NOW), o.channel || "bluesky");
  if (key.startsWith("dissem:")) w.prepare("INSERT INTO dissemination_tracker (id, paper_slug, mode) VALUES (?, ?, ?)").run(key.slice(7), key.slice(7), o.mode === undefined ? "rollup:bluesky" : o.mode);
};
const R1 = Date.UTC(2026, 9, 21, 15, 18, 22, 417), R2 = NOW - 1 * DAY - 5 * HOUR, SENT = NOW - 3 * DAY;
put("dissem:roll-nodata", { uri: uriOf(tidOf(R1, 11)), at: iso(NOW - 12 * DAY), status: "no-data" });                                  // announced 12 days ago, posted on Bluesky 2026-10-21 15:18
put("dissem:roll-pending", { uri: uriOf(tidOf(R2, 12)), at: iso(NOW - 3 * DAY), status: "pending", rd: null, slot: "us-morning" });     // pending, announced 3 days ago
put("dissem:single-nodata", { uri: uriOf(tidOf(SENT + 4000, 13)), at: iso(SENT), status: "no-data", mode: "auto" });                    // a post the drain sent: key and time agree
put("dissem:roll-credited", { uri: uriOf(tidOf(NOW - 3 * DAY, 14)), at: iso(NOW - 12 * DAY), status: "credited", credited: iso(NOW - DAY), rd: '{"reward":0.5}' });
put("dissem:roll-notarm", { uri: uriOf(tidOf(NOW - 3 * DAY, 15)), at: iso(NOW - 12 * DAY), status: "not-arm", topic: null, rd: '{"not_arm":"pillar 4"}' });
put("dissem:roll-nontid", { uri: "at://did:plc:me/app.bsky.feed.post/oddkey", at: iso(NOW - 12 * DAY), status: "no-data" });
put("thread:77", { uri: uriOf(tidOf(NOW - 3 * DAY, 16)), at: iso(NOW - 12 * DAY), status: "no-data" });
put("channel:ch-x-1", { uri: uriOf(tidOf(NOW - 3 * DAY, 17)), at: iso(NOW - 12 * DAY), status: "no-data", by: "channel-drain", channel: "x" });
put("dissem:roll-future", { uri: uriOf(tidOf(NOW + 3 * DAY, 18)), at: iso(NOW - 12 * DAY), status: "no-data" });
put("dissem:roll-ancient", { uri: uriOf(tidOf(Date.UTC(2019, 0, 1), 19)), at: iso(Date.UTC(2018, 0, 1)), status: "no-data" });
const snap = () => JSON.stringify([w.prepare("SELECT * FROM social_learner_posts ORDER BY post_key").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
const before = w.prepare("SELECT * FROM social_learner_posts ORDER BY post_key").all();
const get = (k) => w.prepare("SELECT * FROM social_learner_posts WHERE post_key = ?").get(k);
const old = Object.fromEntries(before.map((r) => [r.post_key, r]));

w.exec(sql);
const n1 = get("dissem:roll-nodata"), n2 = get("dissem:roll-pending");
ok(n1.posted_at === iso(R1) && n1.posted_at === iso(mod.blueskyTidMs(uriOf(tidOf(R1, 11)))), "the no-data roll-up row is re-filed under the key's time, the same millisecond as the worker decodes", n1.posted_at);
ok(n1.slot === "us-morning" && n1.n_posts === 2 && n1.status === "pending" && n1.credited_at === null, "its slot follows the real hour (15:18 is us-morning), n_posts is 2 and it is pending again", n1);
ok(JSON.parse(n1.reward_detail).re_anchored_from === old["dissem:roll-nodata"].posted_at && /LEARNER-ARMS-3/.test(JSON.parse(n1.reward_detail).basis), "the old time is named in reward_detail", n1.reward_detail);
ok(n2.posted_at === iso(R2) && n2.status === "pending" && n2.n_posts === 2, "a pending roll-up row is re-filed too", n2);
for (const k of ["dissem:single-nodata", "dissem:roll-credited", "dissem:roll-notarm", "dissem:roll-nontid", "thread:77", "channel:ch-x-1", "dissem:roll-future", "dissem:roll-ancient"]) {
  ok(JSON.stringify(get(k)) === JSON.stringify(old[k]), k + " is not touched");
}
ok(w.prepare("SELECT COUNT(*) n FROM bak_20261026_learner_anchor").get().n === 2, "the backup table holds exactly the two re-filed rows");
const bk = w.prepare("SELECT * FROM bak_20261026_learner_anchor WHERE post_key = 'dissem:roll-nodata'").get();
ok(bk.old_posted_at === old["dissem:roll-nodata"].posted_at && bk.old_status === "no-data" && bk.old_n_posts === 1 && bk.old_reward_detail === old["dissem:roll-nodata"].reward_detail, "the backup keeps the old values", bk);
const dl = w.prepare("SELECT * FROM decision_log").all();
ok(dl.length === 1 && dl[0].actor === "rem-a7-f1:learner-anchor-repair", "one decision_log row");

// a replay changes nothing, even after the credit step credited a re-filed row
const s1 = snap();
w.exec(sql);
ok(snap() === s1, "a replay changes nothing");
w.prepare("UPDATE social_learner_posts SET status = 'credited', reward = 0.4, credited_at = ? WHERE post_key = 'dissem:roll-nodata'").run(iso(NOW));
const s2 = snap();
w.exec(sql);
ok(snap() === s2 && get("dissem:roll-nodata").status === "credited", "a replay after the credit step does not undo the credit");
w.prepare("UPDATE social_learner_posts SET status = 'pending', reward = NULL, credited_at = NULL, reward_detail = ? WHERE post_key = 'dissem:roll-nodata'").run(n1.reward_detail);

// the Rollback line restores the re-filed rows
const rollback = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
w.exec(rollback);
for (const k of ["dissem:roll-nodata", "dissem:roll-pending"]) ok(JSON.stringify(get(k)) === JSON.stringify(old[k]), "Rollback restores " + k, get(k));

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
