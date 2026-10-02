// CARD-RELEASE-1 offline suite (qnfo-social 0.7.32): a draft waiting on an owner queue card is queued when the card is
// marked done, rejected when it is dismissed, and left alone while the card is open or when its notes are anything else.
// Run: node qnfo-social/card-release.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const dir = mkdtempSync(join(tmpdir(), "cr-"));
writeFileSync(join(dir, "w.mjs"), src + "\nexport { releaseCardApproved };\n");
const { releaseCardApproved } = await import(join(dir, "w.mjs"));
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, status TEXT, flags TEXT, notes TEXT, updated_at TEXT);
CREATE TABLE human_actions (slug TEXT UNIQUE, status TEXT);
INSERT INTO social_threads (slug, status, notes) VALUES ('a','draft','await-card:card-a'),('b','draft','await-card:card-b'),('c','draft','await-card:card-c'),('d','draft','checker unavailable'),('e','queued','await-card:card-a');
INSERT INTO human_actions VALUES ('card-a','resolved'),('card-b','dismissed'),('card-c','open');`);
const D1 = { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return st; } };
const r = await releaseCardApproved({ DB: D1 });
const row = (s) => db.prepare("SELECT status, flags, notes FROM social_threads WHERE slug = ?").get(s);
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
ok(r.queued === 1 && r.rejected === 1, "one queued, one rejected");
ok(row("a").status === "queued" && row("a").flags === "selected" && /^selected: released by owner card card-a$/.test(row("a").notes), "a card marked done queues its draft as a selected post");
ok(row("b").status === "rejected", "a dismissed card rejects its draft");
ok(row("c").status === "draft", "an open card leaves its draft waiting");
ok(row("d").status === "draft", "a draft without an await-card note is not touched");
ok(row("e").status === "queued" && row("e").notes === "await-card:card-a", "a row that is not a draft is not touched");
const again = await releaseCardApproved({ DB: D1 });
ok(again.queued === 0 && again.rejected === 0, "running again changes nothing");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
