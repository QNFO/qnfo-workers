// CLAIM-ORDER-OWNER-1 offline suite (human_actions 107, agent_issues 99956, qnfo-research-exec 0.33.4). QUEUE-ANTISTARVATION-1 ranks rows older than 72 h before fresher ones, and
// PROPOSAL-FAIRNESS-1 adds one rank above it: a new-paper proposal (source proposal) that has never been attempted and has waited more than 72 h is claimed first. Measured 2026-10-25:
// 104 of 106 claims in 48 h were remediation revisions, 0 were proposals, and 81 proposals had attempt=0 after 8-12 days. The three claim queries carry that rank; after a proposal's
// first attempt it falls back to revision, resumed stage, owner-directed, aged FIFO, then score. This runs the real ORDER BY text of each query from worker.js on SQLite.
// Run: node qnfo-research-exec/claim-order-owner.test.mjs   (exit 0 = all passed)
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const orders = [...src.matchAll(/FROM research_queue WHERE status='queued' ORDER BY (CASE WHEN source = 'proposal'[^"]*?) LIMIT 1/g)].map((m) => m[1]);
ok(orders.length === 3, "the claim ORDER BY appears in the atomic claim, its fallback and the legacy path", orders.length);
ok(orders.every((o) => o === orders[0]) && /source = 'proposal' AND attempt = 0/.test(orders[0]) && /source IN \('idea','chat','operator-prime'\)/.test(orders[0]), "all three are identical and carry the proposal-fairness and owner-source ranks");
ok(/status='researching' AND stage=\?1 ORDER BY CASE WHEN source='proposal' THEN 0 ELSE 1 END, claimed_at ASC LIMIT 1/.test(src), "the stage loop processes a researching proposal before a remediation row at the same stage");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, source TEXT, source_id TEXT, stage TEXT, created_at TEXT, score REAL, attempt INTEGER DEFAULT 0)");
const iso = (h) => new Date(Date.now() - h * 36e5).toISOString().slice(0, 19) + "Z";
const ins = db.prepare("INSERT INTO research_queue (id,status,source,source_id,stage,created_at,score) VALUES (?, 'queued', ?, ?, ?, ?, ?)");
ins.run("aged-old", "owner-corpus", "c1", null, iso(200), 0.2);
ins.run("aged-newer", "owner-corpus", "c2", null, iso(100), 0.9);
ins.run("fresh-generated", "radar", "r1", null, iso(2), 0.99);
ins.run("owner-idea", "idea", "i1", null, iso(1), 0.1);
ins.run("owner-chat-aged", "chat", "h1", null, iso(120), 0.1);
ins.run("resumed", "owner-corpus", "c3", "review", iso(5), 0.1);
ins.run("revision", "remediation", "revision:p1", null, iso(3), 0.1);
ins.run("proposal-aged", "proposal", "p1", null, iso(100), 0.4);
ins.run("proposal-fresh", "proposal", "p2", null, iso(1), 0.5);
const order = () => {
  const out = [];
  for (let i = 0; i < 9; i++) { const r = db.prepare("SELECT id FROM research_queue WHERE status='queued' ORDER BY " + orders[0] + " LIMIT 1").get(); if (!r) break; out.push(r.id); db.prepare("UPDATE research_queue SET status='done' WHERE id = ?").run(r.id); }
  return out;
};
const got = order();
ok(got[0] === "proposal-aged" && got[1] === "revision" && got[2] === "resumed", "a never-attempted aged proposal is first; a remediation revision and a resumed stage keep their rank", got);
ok(got.slice(3, 5).sort().join() === "owner-chat-aged,owner-idea" && got[3] === "owner-chat-aged", "owner-directed rows come next, the older one first by the aged rule inside the rank", got);
ok(got.slice(5).join() === "aged-old,aged-newer,fresh-generated,proposal-fresh", "then aged rows oldest first, the rest by score, and a fresh proposal waits normally", got);
console.log("claim-order-owner: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
