// CREDENTIAL-EVIDENCE-1 (2026-11-10). Run: node qnfo-jobsearch/credentials.test.mjs
// Proves: a patent or inventor claim stays out of the CV bank unless it carries a patent number or is the owner's own Yes to a card that says the
// application is not yet filed; the live line "Inventor on U.S. patent(s) in quantum computing." (fact Q017, from review V3) is removed on the next run,
// the previous bank is kept in jobsearch_bank_history, and the editor refuses to add such a claim again.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const T = w.__test;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const LIVE = "Inventor on U.S. patent(s) in quantum computing.";
ok(!T.credentialBacked(LIVE, "review:V3"), "the live patent line without a number is not backed");
ok(!T.credentialBacked("Hands-on work on patents.", "recall:term:patents"), "a term card cannot make a patent claim");
ok(!T.credentialBacked("Named inventor on a quantum computing patent.", "manual"), "a typed claim without a number is not backed");
ok(T.credentialBacked("Inventor on U.S. patent 1,234,567 in quantum computing.", "review:V3"), "a claim with its patent number is backed");
ok(T.credentialBacked("Inventor, US 11234567 B2.", "manual"), "a patent publication number is backed");
const ip = T.RECALL_SEED.find((s) => s.id === "ip_strategy");
ok(ip && T.credentialBacked(ip.yes, "recall:seed:ip_strategy"), "the owner's Yes to the IP card (not yet filed) is backed");
ok(!T.credentialBacked(ip.yes.replace(/\(not yet filed\)/, ""), "manual"), "the same sentence typed by hand without 'not yet filed' is not backed");
ok(T.credentialBacked("Led the AARP Livability Index.", "verified_cv"), "facts that make no patent claim are untouched");

// the live shape: Q017 confirmed from review V3
const b = JSON.parse(JSON.stringify(T.getBank()));
b.facts.push({ id: "Q017", role: "R01", text: LIVE, tags: ["quantum"], source: "review:V3", status: "verified" });
b.answers = { x: { answer: "y", facts: ["Q017", "F01"] } };
const n = b.facts.length, gone = T.dropUnbackedCredentials(b);
ok(gone.length === 1 && gone[0] === "Q017" && b.facts.length === n - 1 && !JSON.stringify(b.facts).includes("patent(s)"), "the sweep removes exactly the unbacked claim", gone);
ok(b.answers.x.facts.length === 1 && b.answers.x.facts[0] === "F01", "answers stop pointing at the removed fact");
ok(T.dropUnbackedCredentials(b).length === 0, "a second sweep changes nothing");

// end to end on D1: the run removes it and keeps the previous bank; the editor refuses to add it back
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(here, "../migrations/2026-10-27-jobsearch.sql"), "utf8"));
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
const env = { JOBS_DB: { prepare: (s) => stmt(s), batch: async (a) => { for (const x of a) await x.run(); return []; } }, LOOP_TOKEN: "secret-test-token" };
const live = JSON.parse(JSON.stringify(T.getBank()));
live.facts.push({ id: "Q017", role: "R01", text: LIVE, tags: ["quantum"], source: "review:V3", status: "verified" });
await T.ensureCredentialEvidence(env);   // creates the tables through ensure()
db.prepare("INSERT OR REPLACE INTO jobsearch_bank (k, v, rev, updated_at) VALUES ('bank', ?, 5, 'x')").run(JSON.stringify(live));
await new Promise((r) => setTimeout(r, 15100));   // loadBank caches for 15 s
const removed = await T.ensureCredentialEvidence(env);
const row = db.prepare("SELECT v, rev FROM jobsearch_bank WHERE k='bank'").get();
const hist = db.prepare("SELECT v FROM jobsearch_bank_history ORDER BY id DESC LIMIT 1").get();
ok(removed.length === 1 && !row.v.includes(LIVE) && row.rev === 6, "the run removes the live line", { removed, rev: row.rev });
ok(hist && hist.v.includes(LIVE), "the previous bank is kept in history");
ok((await T.ensureCredentialEvidence(env)).length === 0 && db.prepare("SELECT rev FROM jobsearch_bank WHERE k='bank'").get().rev === 6, "a clean bank is not rewritten");
const H = { "x-loop-token": "secret-test-token", "content-type": "application/json" };
const r = await w.fetch(new Request("https://x/api/cv/fact", { method: "POST", headers: H, body: JSON.stringify({ text: LIVE, role: "R01" }) }), env, { waitUntil: () => {} });
ok(r.status === 400 && /patent number/.test(JSON.stringify(await r.json())), "the editor refuses the claim without a number", r.status);

console.log(`credentials: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
