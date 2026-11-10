// TOUCHPOINTS-1 offline suite (owner, 2026-11-10): the scoring model reads evidence (relevance, activity, attentiveness, reach), follows and likes stay inside the daily caps,
// stale and quantum-only follows are pruned but mutuals and known people are kept, replies wait for one tap until trust is earned, outcomes credit the follow, and the
// three metrics are written. Run: node qnfo-social/touchpoints.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const db = new DatabaseSync(":memory:");
const mig = readFileSync(new URL("../migrations/2026-11-10-touchpoints.sql", import.meta.url), "utf8");
for (const stmt of mig.split(/;\s*\n/)) if (/^\s*CREATE (TABLE|INDEX)/m.test(stmt.replace(/^--.*$/gm, ""))) db.exec(stmt.replace(/^--.*$/gm, "") + ";");
db.exec("CREATE TABLE owner_asks (id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT, kind TEXT, ref TEXT, question TEXT, cue TEXT, options_json TEXT, priority INTEGER, created_at TEXT, answered_at TEXT, answer TEXT, answer_label TEXT, answered_via TEXT, UNIQUE(kind, ref))");
db.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT)");
db.exec("INSERT INTO metric_registry (metric) VALUES ('touchpoints_7d'),('touch_reciprocation_30d'),('touch_stale_follows')");
db.exec("CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day))");
db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT)");
const D1 = { prepare(sql) { let a = []; const s = { bind(...x) { a = x; return s; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: r.changes } }; }, async all() { return { results: db.prepare(sql).all(...a) }; } }; return s; } };
let aiCalls = 0;
const env = { DB: D1, AI: { async run() { aiCalls++; return { response: "Where do you draw the line between an agent's own check and an outside audit of the same output?" }; } } };

// --- pure scoring ---
const r1 = mod.touchRelevance("I study AI governance and evaluations of autonomous agents");
ok(r1.relevance === 1 && r1.topics.includes("oversight") && r1.topics.includes("agents"), "two lenses count fully: " + JSON.stringify(r1));
const rq = mod.touchRelevance("Quantum error correction and superconducting qubits");
ok(rq.quantum_only && rq.relevance === 0, "quantum-only is flagged");
ok(!mod.touchRelevance("quantum computing for AI safety evaluations").quantum_only, "quantum plus an autonomy lens is not quantum-only");
ok(mod.touchRelevance("AI governance", { oversight: 1.5 }).relevance === 0.75, "owner topic answer weighs its lens 1.5x");
const now = Date.UTC(2026, 10, 10, 12);
ok(mod.touchActivity(now - 2 * 864e5, 10, now) === 1, "posted 2 days ago, 10 posts: fully active");
ok(mod.touchActivity(now - 90 * 864e5, 0, now) === 0, "90 days quiet: inactive");
ok(mod.touchAttentiveness(0.5, 1000, 400) === 1 && mod.touchAttentiveness(0, 100000, 10) < 0.01, "attentiveness rewards replying to people");
ok(mod.touchReach(50) === 0 && mod.touchReach(10000) === 1 && mod.touchReach(1e6) <= 0.41, "reach has a sweet spot");
const good = { relevance: 1, quantum_only: false, last_post_at: new Date(now - 864e5).toISOString(), activity: 1, attentiveness: 1, reach: 1 };
ok(mod.touchScore(good, now) === 100, "ideal target scores 100");
ok(mod.touchScore(Object.assign({}, good, { last_post_at: new Date(now - 70 * 864e5).toISOString() }), now) === 0, "inactive over 60 days scores 0");
ok(mod.touchScore(Object.assign({}, good, { relevance: 0.25 }), now) === 0, "off-topic scores 0");
ok(JSON.stringify(mod.touchCrossLinks("me: x.com/janedoe and https://www.linkedin.com/in/jane-doe-1")) === '{"x":"janedoe","linkedin":"jane-doe-1"}', "cross links parsed");
ok(mod.touchCleanReply("SKIP") === null && mod.touchCleanReply("see https://x.y") === null && mod.touchCleanReply(" A fair point. ") === "A fair point.", "reply cleaner");
ok(!/engineer|developer|coder/i.test(mod.touchReplyPrompt({ name: "A" }, "post")), "reply prompt keeps the brand");

// --- fake platform ---
const iso = (d) => new Date(now - d * 864e5).toISOString();
const people = {
  alice: { id: "did:alice", handle: "alice", name: "Alice", bio: "AI governance and oversight of autonomous agents. x.com/alice_ai", followers: 5000, following: 1500,
    posts: [{ id: "p1", cid: "c1", uri: "at://alice/1", text: "Agent evaluations miss failure modes that only show in long runs", at: iso(1), is_reply: false, url: "https://bsky.app/a/1" }, { id: "p2", uri: "at://alice/2", text: "agreed", at: iso(2), is_reply: true }] },
  bob: { id: "did:bob", handle: "bob", name: "Bob", bio: "quantum computing, qubits", followers: 300, following: 10, posts: [{ id: "b1", uri: "at://bob/1", text: "new qubit record", at: iso(3), is_reply: false }] },
  carol: { id: "did:carol", handle: "carol", name: "Carol", bio: "AI safety research, alignment and evals", followers: 800, following: 600, posts: [{ id: "c1", uri: "at://carol/1", text: "alignment evals", at: iso(200), is_reply: false }] },
  dave: { id: "did:dave", handle: "dave", name: "Dave", bio: "quantum annealing", followers: 300, following: 300, posts: [{ id: "d1", uri: "at://dave/1", text: "annealing", at: iso(5) }] },
  erin: { id: "did:erin", handle: "erin", name: "Erin", bio: "multi-agent systems and AI accountability", followers: 3000, following: 900, posts: [{ id: "e1", cid: "ce", uri: "at://erin/1", text: "AI accountability needs audit trails for agents", at: iso(1) }, { id: "e2", uri: "at://erin/2", text: "yes", at: iso(1), is_reply: true }] }
};
const follows = { bob: { ref: "at://me/follow/bob", by: 0 }, carol: { ref: "at://me/follow/carol", by: 0 }, dave: { ref: "at://me/follow/dave", by: 1 } };
const calls = [];
const ad = {
  platform: "bluesky",
  async following() { return Object.keys(follows).map((h) => Object.assign({}, people[h], { follow_ref: follows[h].ref, followed_by: follows[h].by })); },
  async recent(id) { const p = Object.values(people).find((x) => x.id === id); return p.posts; },
  async search(q) { return [people.alice, people.erin]; },
  async follow(t) { calls.push("follow " + t.handle); return "at://me/follow/" + t.handle; },
  async unfollow(t) { calls.push("unfollow " + t.handle); },
  async like(p) { calls.push("like " + p.uri); },
  async reply(p, text) { calls.push("reply " + p.uri); return "at://me/reply/1"; },
  async notifications() { return [{ from: "alice", reason: "follow", at: iso(-0.01) }]; }
};
let out = await mod.touchTick(env, { nowMs: now, adapters: [ad], session: {} });
const B = out.platforms.bluesky;
ok(B.refresh.following === 3 && B.refresh.discovered >= 2 && B.refresh.scored === 5, "refresh reads follows, discovers and scores: " + JSON.stringify(B.refresh));
const alice = db.prepare("SELECT * FROM touch_targets WHERE handle='alice'").get();
ok(alice.score >= 55 && alice.state === "followed" && /"reply_share":0.5/.test(alice.evidence_json), "alice scored with evidence and followed: " + alice.score);
ok(calls.includes("unfollow bob") && calls.includes("unfollow carol") && !calls.includes("unfollow dave"), "quantum-only and stale pruned, mutual kept: " + calls.join("|"));
ok(calls.filter((c) => c.startsWith("follow")).length === 2, "follow capped at 2 per hour");
ok(B.like.liked === 2, "likes of fresh relevant posts: " + JSON.stringify(B.like));
const drafts = db.prepare("SELECT * FROM touch_actions WHERE kind='reply'").all();
ok(drafts.length === 2 && drafts.every((d) => d.status === "proposed" && d.mode === "approve" && d.grounding), "reply drafts wait for a tap and carry their grounding");
ok(!calls.some((c) => c.startsWith("reply")), "no reply posted without approval");
ok(out.tap.x === 1 && db.prepare("SELECT url FROM touch_actions WHERE platform='x'").get().url === "https://x.com/alice_ai", "X tap item from the cross link");
ok(db.prepare("SELECT COUNT(*) n FROM owner_asks WHERE kind='touch-known'").get().n === 2, "two prompted-recall asks for top people");
ok(out.metrics.touchpoints_7d === 4 && out.metrics.touch_stale_follows === 0, "metrics written: " + JSON.stringify(out.metrics));
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric='touchpoints_7d'").get().last_value === "4", "registry last_value set");

// second hour: approve one draft, it posts; caps hold; the same day the refresh does not repeat
db.prepare("UPDATE touch_actions SET status='approved', decided_at=? WHERE id=?").run(iso(0), drafts[0].id);
db.prepare("UPDATE owner_asks SET answer='talked', answered_at=? WHERE kind='touch-known' AND ref='bluesky:erin'").run(iso(0));
calls.length = 0;
out = await mod.touchTick(env, { nowMs: now + 3600e3, adapters: [ad], session: {} });
ok(out.platforms.bluesky.refresh.skipped === "refreshed today", "refresh once a day");
ok(calls.filter((c) => c.startsWith("reply")).length === 1 && db.prepare("SELECT status FROM touch_actions WHERE id=?").get(drafts[0].id).status === "done", "approved reply posted");
ok(db.prepare("SELECT known FROM touch_targets WHERE handle='erin'").get().known === 1, "a yes makes the person known");
ok(db.prepare("SELECT outcome FROM touch_actions WHERE kind='follow' AND target='alice'").get().outcome === "followed-back", "follow-back credited from notifications");
ok(db.prepare("SELECT COUNT(*) n FROM touch_actions WHERE kind='reply'").get().n === 2, "no new drafts beyond the daily cap");

// the owner chose a personal account: the QNFO accounts are not used
db.prepare("INSERT INTO owner_asks (plane, kind, ref, question, options_json, answered_at, answer) VALUES ('reach','touch-account','bluesky','q','[]',?, 'personal')").run(iso(0));
out = await mod.touchTick(env, { nowMs: now + 7200e3, adapters: [ad], session: {} });
ok(/personal/.test(out.skipped || ""), "personal-account answer stops the QNFO accounts");
// GitHub rows written by the dashboard get scored here with the same model
db.prepare("INSERT INTO touch_targets (platform, handle, bio, followers, last_post_at, posts_30d, reply_share, state) VALUES ('github-repo','acme/agent-evals','Evaluation harness for AI agents and failure modes',1200,?,30,0.75,'candidate')").run(iso(1));
db.prepare("INSERT INTO touch_targets (platform, handle, bio, followers, last_post_at, posts_30d, reply_share, state) VALUES ('github-repo','old/qsim','Quantum circuit simulator for qubits',400,?,0,0,'followed')").run(iso(400));
const sc = await mod.touchScoreStored(env, { nowMs: now });
const ae = db.prepare("SELECT * FROM touch_targets WHERE handle='acme/agent-evals'").get(), qs = db.prepare("SELECT * FROM touch_targets WHERE handle='old/qsim'").get();
ok(sc.scored === 2 && ae.score >= 55 && qs.quantum_only === 1 && mod.touchIsStale(qs, now), "github rows scored; quantum repo flagged stale: " + ae.score);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
