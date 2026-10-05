// REENTRY-DRAIN-1 (#1654 SIGNALS-TRIAGE-GAP-1) offline suite. Runs idea-hub's own runReentry and runConsume in a vm against
// two in-memory SQLite D1s (qnfo-audit, living-paper) with a counting Workers AI stub and a counting fetch stub. Proves:
// while signal_worker_boundary pauses idea-hub/artifact_reentry nothing new is emitted or consumed; the weight-0 backlog
// past REENTRY_NOQ_TTL_H drains oldest first at most REENTRY_EXPIRE_BATCH a run (a paper gone from living-paper keeps its
// old reason, a paper that now has an open question is re-scored and stays consumable); weight>0 signals older than
// REENTRY_TTL_DAYS expire, younger ones stay 'new'; nothing is deleted, the reason is in decision; no model and no fetch
// is called; once the boundary is permitted again emission resumes and the consume leg takes the oldest weight>0 rows.
// Run: node idea-hub/reentry-drain.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8").replace(/export default\s*\{/, "var __default = {");
let fetchCalls = 0;
const sb = { console: { log: () => {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto, fetch: async () => { fetchCalls++; throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { runReentry, runConsume, VERSION, REENTRY_NOQ_TTL_H, REENTRY_TTL_DAYS, REENTRY_EXPIRE_BATCH, REENTRY_BATCH, CONSUME_SIGNALS };", sb);
const api = sb.__x;
const shim = (db) => ({ prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(q).all(...a) }; }, async first() { return db.prepare(q).get(...a) ?? null; }, async run() { const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; } });
const audit = new DatabaseSync(":memory:"), lp = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE signals (id TEXT PRIMARY KEY, ts TEXT, source TEXT, source_ref TEXT, content TEXT, open_questions TEXT, evidential_weight REAL, domain TEXT, status TEXT DEFAULT 'new', decision TEXT, score REAL, created_at TEXT);
CREATE TABLE signal_worker_boundary (worker TEXT NOT NULL, source TEXT NOT NULL, permitted INTEGER DEFAULT 1, domain TEXT, note TEXT, PRIMARY KEY (worker, source));
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);`);
lp.exec("CREATE TABLE papers (doi TEXT, title TEXT, body_md TEXT, created_at TEXT)");
let aiCalls = 0;
const env = { QNFO_AUDIT: shim(audit), LIVING_PAPER: shim(lp), AI: { async run() { aiCalls++; return { response: "{}" }; } } };
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const n = (sql, ...a) => Number(audit.prepare(sql).get(...a).n);
const H = 3600e3, now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const PLAIN = "We report a measurement of the bound. The result is stable across runs.\n".repeat(40);
const OPENQ = "## Open Questions\n- Does the bound survive at finite temperature and strong coupling in the cryogenic stage?\n";
const sig = (doi, createdMs, w, oq) => audit.prepare("INSERT INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?, ?, 'artifact_reentry', ?, 't', ?, ?, 'research', 'new', ?)").run("artifact_reentry:" + doi.replace(/[^a-z0-9]+/gi, "-"), iso(createdMs), doi, JSON.stringify(oq || []), w, iso(createdMs));
const paper = (doi, body, createdMs) => lp.prepare("INSERT INTO papers (doi, title, body_md, created_at) VALUES (?, ?, ?, ?)").run(doi, "Paper " + doi, body, iso(createdMs));

// Seed: 100 weight-0 signals 2..41 days old (the stuck backlog), one paper gone, one paper now with an open question;
// 3 weight>0 signals 8..10 days old (stale under the pause), 2 weight>0 signals 30 h and 1 h old, 5 weight-0 signals 2 h
// old (younger than REENTRY_NOQ_TTL_H); 4 papers not yet signalled; the boundary paused as on 2026-10-04.
const OLD0 = 100;
for (let i = 0; i < OLD0; i++) {
  const doi = "10.5281/zenodo.old" + String(i).padStart(3, "0"), at = now - (41 * 24 - i * 9) * H;
  sig(doi, at, 0);
  if (i === 7) continue; // paper no longer in living-paper
  paper(doi, i === 3 ? PLAIN + OPENQ : PLAIN, at);
}
const RESCORE_DOI = "10.5281/zenodo.old003", GONE_DOI = "10.5281/zenodo.old007";
audit.prepare("UPDATE signals SET created_at = ?, ts = ? WHERE source_ref = ?").run(iso(now - 48 * H), iso(now - 48 * H), RESCORE_DOI); // 2 days old: past the 20 h rule, inside 7 days
for (let i = 0; i < 3; i++) sig("10.5281/zenodo.stale" + i, now - (10 - i) * 24 * H, 0.9, ["Is the stale question still open after a week?"]);
sig("10.5281/zenodo.w30h", now - 30 * H, 0.9, ["Does the 30-hour-old question get consumed when the pause lifts?"]);
sig("10.5281/zenodo.w1h", now - 1 * H, 0.9, ["Does the newest question wait its turn?"]);
for (let i = 0; i < 5; i++) { const d = "10.5281/zenodo.young" + i; sig(d, now - 2 * H, 0); paper(d, PLAIN, now - 2 * H); }
for (let i = 0; i < 4; i++) paper("10.5281/zenodo.fresh" + i, PLAIN + OPENQ, now - 10 * 60e3);
audit.prepare("INSERT INTO signal_worker_boundary (worker, source, permitted, note) VALUES ('idea-hub', 'artifact_reentry', 0, 'OWNER-NARROW-SIGNAL-1 test')").run();
const TOTAL0 = n("SELECT COUNT(*) n FROM signals");
const stuck = () => n("SELECT COUNT(*) n FROM signals WHERE status='new' AND created_at < ?", iso(Date.now() - 24 * H));
const oldW0New = () => n("SELECT COUNT(*) n FROM signals WHERE status='new' AND COALESCE(evidential_weight,0)=0 AND created_at < ?", iso(Date.now() - api.REENTRY_NOQ_TTL_H * H));
ok(api.REENTRY_EXPIRE_BATCH === 50 && api.REENTRY_NOQ_TTL_H < 24 && api.REENTRY_TTL_DAYS === 7, "the age rule is 20 h for weight 0 (inside the contract's 24 h) and 7 days for weight>0, 50 a run", [api.REENTRY_NOQ_TTL_H, api.REENTRY_TTL_DAYS, api.REENTRY_EXPIRE_BATCH]);
ok(stuck() === OLD0 + 3 + 1 && oldW0New() === OLD0, "seeded: 104 status='new' rows older than 24 h, 100 of them weight 0", stuck());

// Run 1 under the owner pause.
let r1 = await api.runReentry(env), c1 = await api.runConsume(env);
ok(r1.permitted === false && r1.emitted === 0 && r1.scanned === 0 && /not permitted/.test(r1.emit_paused || ""), "paused boundary: no paper scan, nothing emitted", r1);
ok(c1.paused === true && c1.consumed === 0 && n("SELECT COUNT(*) n FROM idea_proposals") === 0, "paused boundary: the consume leg writes nothing", c1);
ok(r1.expired_stale === 3 && n("SELECT COUNT(*) n FROM signals WHERE source_ref LIKE '%stale%' AND status='expired' AND decision LIKE '%REENTRY-DRAIN-1 not consumed within 7 days%'") === 3, "the 3 weight>0 signals older than 7 days expire with the reason in decision", r1);
ok(r1.expired_noq + r1.expired + r1.rescored === api.REENTRY_EXPIRE_BATCH, "rule 1 takes exactly REENTRY_EXPIRE_BATCH weight-0 signals in a run", r1);
ok(r1.expired === 1 && audit.prepare("SELECT status, decision FROM signals WHERE source_ref = ?").get(GONE_DOI).decision.includes("not in living-paper"), "a signal whose paper left living-paper keeps the existing reason", r1);
ok(r1.rescored === 0 && r1.expired_noq === 49, "run 1: 49 of the 50 oldest have no open question and expire", r1);
const maxExpired = audit.prepare("SELECT MAX(created_at) m FROM signals WHERE status='expired' AND decision LIKE '%no open question%'").get().m;
const minLeft = audit.prepare("SELECT MIN(created_at) m FROM signals WHERE status='new' AND COALESCE(evidential_weight,0)=0 AND created_at < ?").get(iso(Date.now() - api.REENTRY_NOQ_TTL_H * H)).m;
ok(maxExpired < minLeft, "oldest first: every weight-0 signal expired in run 1 is older than every one left", { maxExpired, minLeft });
ok(oldW0New() === OLD0 - api.REENTRY_EXPIRE_BATCH, "run 1 shrinks the old weight-0 backlog from 100 to 50", oldW0New());
ok(n("SELECT COUNT(*) n FROM signals WHERE source_ref LIKE '%young%' AND status='new'") === 5, "weight-0 signals younger than 20 h stay new (they are only re-checked)");

// Run 2 drains the rest; the contract's backlog is then only the weight>0 rows the pause holds.
const r2 = await api.runReentry(env); await api.runConsume(env);
ok(r2.expired_noq === 49 && r2.rescored === 1 && oldW0New() === 0, "run 2 drains the remaining 50 (49 expired, 1 re-scored): no weight-0 signal older than 20 h is left new", r2);
const rs = audit.prepare("SELECT status, evidential_weight w, open_questions oq FROM signals WHERE source_ref = ?").get(RESCORE_DOI);
ok(rs.status === "new" && rs.w === 0.9 && JSON.parse(rs.oq).length === 1, "a paper that now has an open question is re-scored, not expired, and stays new (consumable later)", rs);
ok(stuck() === 2 && n("SELECT COUNT(*) n FROM signals WHERE status='new' AND created_at < ? AND evidential_weight > 0", iso(Date.now() - 24 * H)) === 2, "after 2 runs the only status='new' rows older than 24 h are the 2 weight>0 ones younger than 7 days (held by the pause)", stuck());
ok(n("SELECT COUNT(*) n FROM signals") === TOTAL0, "nothing is deleted: every row is kept, only status changed", n("SELECT COUNT(*) n FROM signals"));
ok(n("SELECT COUNT(*) n FROM signals WHERE status='expired' AND (decision IS NULL OR decision NOT LIKE 'idea-hub " + api.VERSION + ":%')") === 0, "every expired row names the version and its reason");
ok(aiCalls === 0 && fetchCalls === 0, "no model call and no fetch for any expired or re-scored row", { aiCalls, fetchCalls });
const r3 = await api.runReentry(env);
ok(r3.expired_noq === 0 && r3.expired_stale === 0 && r3.expired === 0, "a third run finds nothing more to expire (bounded drain)", r3);

// The owner lifts the pause: emission resumes (bounded) and consume takes the oldest weight>0 rows first.
audit.prepare("UPDATE signal_worker_boundary SET permitted = 1").run();
const r4 = await api.runReentry(env), c4 = await api.runConsume(env);
ok(r4.permitted === true && r4.emitted === 4 && n("SELECT COUNT(*) n FROM signals WHERE source_ref LIKE '%fresh%' AND evidential_weight > 0") === 4, "permitted again: the 4 unsignalled papers are emitted", r4);
const consumed = audit.prepare("SELECT source_ref FROM signals WHERE status='consumed' ORDER BY created_at").all().map((x) => x.source_ref);
ok(c4.consumed === api.CONSUME_SIGNALS && consumed.join(",") === [RESCORE_DOI, "10.5281/zenodo.w30h"].join(","), "consume takes the oldest weight>0 rows first: the re-scored one and the 30 h one", { c4, consumed });
ok(n("SELECT COUNT(*) n FROM idea_proposals WHERE name='auto-reentry'") === c4.proposals && c4.proposals > 0, "their open questions become idea proposals", c4);
ok(aiCalls === 0 && fetchCalls === 0, "the re-entry and consume legs never call a model or fetch", { aiCalls, fetchCalls });

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
