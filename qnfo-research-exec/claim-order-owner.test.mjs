// CLAIM-ORDER-OWNER-1 offline suite (human_actions 107, agent_issues 99956, qnfo-research-exec 0.28.4). QUEUE-ANTISTARVATION-1 claims rows older than 72 h first, oldest first, so a fresh
// owner-directed research row (source idea, chat or operator-prime) waited behind about 100 aged corpus rows. The three claim queries now rank it after remediation revisions and resumed
// stages and before the aged rows. This runs the real ORDER BY text of each query from worker.js on SQLite.
// Proves: all three queries carry the owner-source rank; the order is revision, resumed stage, owner-directed, aged FIFO, then score; an owner-directed row older than 72 h still queues
// by that rank; a generated row of any age never outranks it.
// Run: node qnfo-research-exec/claim-order-owner.test.mjs   (exit 0 = all passed)
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const orders = [...src.matchAll(/FROM research_queue WHERE status='queued' ORDER BY (CASE WHEN source = 'remediation'[^"]*?) LIMIT 1/g)].map((m) => m[1]);
ok(orders.length === 3, "the claim ORDER BY appears in the atomic claim, its fallback and the legacy path", orders.length);
ok(orders.every((o) => o === orders[0]) && /source IN \('idea','chat','operator-prime'\)/.test(orders[0]), "all three are identical and carry the owner-source rank");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, source TEXT, source_id TEXT, stage TEXT, created_at TEXT, score REAL)");
const iso = (h) => new Date(Date.now() - h * 36e5).toISOString().slice(0, 19) + "Z";
const ins = db.prepare("INSERT INTO research_queue VALUES (?, 'queued', ?, ?, ?, ?, ?)");
ins.run("aged-old", "owner-corpus", "c1", null, iso(200), 0.2);
ins.run("aged-newer", "owner-corpus", "c2", null, iso(100), 0.9);
ins.run("fresh-generated", "radar", "r1", null, iso(2), 0.99);
ins.run("owner-idea", "idea", "i1", null, iso(1), 0.1);
ins.run("owner-chat-aged", "chat", "h1", null, iso(120), 0.1);
ins.run("resumed", "owner-corpus", "c3", "review", iso(5), 0.1);
ins.run("revision", "remediation", "revision:p1", null, iso(3), 0.1);
const order = () => {
  const out = [];
  for (let i = 0; i < 7; i++) { const r = db.prepare("SELECT id FROM research_queue WHERE status='queued' ORDER BY " + orders[0] + " LIMIT 1").get(); if (!r) break; out.push(r.id); db.prepare("UPDATE research_queue SET status='done' WHERE id = ?").run(r.id); }
  return out;
};
const got = order();
ok(got[0] === "revision" && got[1] === "resumed", "a remediation revision and a resumed stage keep their rank", got);
ok(got.slice(2, 4).sort().join() === "owner-chat-aged,owner-idea" && got[2] === "owner-chat-aged", "owner-directed rows come next, the older one first by the aged rule inside the rank", got);
ok(got.slice(4).join() === "aged-old,aged-newer,fresh-generated", "then aged rows oldest first, then the rest by score", got);
console.log("claim-order-owner: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
