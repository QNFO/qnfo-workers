// READER-REPORT-1 (qnfo-gateway 3.29.0): POST /api/paper-report stores an anonymous reader report, refuses bots and repeats,
// and only a report the checker confirms becomes an internal_errata row the revision loop reads.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "gwrr-"));
writeFileSync(join(dir, "w.mjs"), readFileSync(join(here, "worker.js"), "utf8") + "\nexport { handleReaderReport, rrCheck, rrSweep, rrLocate, rrClaim, LP_PAPER_JS, RR_DIALOG };\n");
const { handleReaderReport, rrCheck, rrSweep, rrLocate, rrClaim, LP_PAPER_JS, RR_DIALOG } = await import(pathToFileURL(join(dir, "w.mjs")).href);
let fails = 0;
const ok = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) { fails++; if (x !== undefined) console.log("   ", JSON.stringify(x).slice(0, 400)); } };

// A tiny in-memory stand-in for the three D1 bindings: it records every statement and answers the few reads the code makes.
function fakeEnv(verdict) {
  const log = [], reports = {}, errata = [], rate = {};
  const db = (name) => ({ prepare(sql) { return { _a: [], bind(...a) { this._a = a; return this; },
    async run() { log.push([name, sql, this._a]);
      if (/^INSERT INTO reader_reports/.test(sql)) { const [id, slug, version, kind, passage, note, key] = this._a; reports[id] = { id, slug, version, kind, passage, note, passage_key: key, status: "pending", attempts: 0, seen: 1, created_at: "2026-10-19T00:00:00Z" }; }
      if (/SET seen = seen \+ 1/.test(sql)) reports[this._a[0]].seen++;
      if (/SET attempts = attempts \+ 1/.test(sql)) reports[this._a[0]].attempts++;
      if (/SET status = 'confirmed'/.test(sql)) reports[this._a[0]].status = "confirmed";
      if (/SET status = 'not-confirmed'/.test(sql)) reports[this._a[0]].status = "not-confirmed";
      if (/SET status = \?2, verdict_why/.test(sql)) reports[this._a[0]].status = this._a[1];
      if (/INSERT OR IGNORE INTO internal_errata/.test(sql)) errata.push(this._a);
      return { meta: { changes: 1 } }; },
    async first() { log.push([name, sql, this._a]);
      if (/INSERT INTO ask_rate/.test(sql)) { rate[this._a[0]] = (rate[this._a[0]] || 0) + 1; return { n: rate[this._a[0]] }; }
      if (/FROM papers WHERE slug = \?1 AND status IN/.test(sql)) return this._a[0] === "real-paper" ? { slug: "real-paper", version: "1.1.0" } : null;
      if (/SELECT slug, title, body_md FROM papers/.test(sql)) return { slug: "real-paper", title: "A Real Paper", body_md: "## Intro\n\nThe sistem converges for every input we tried.\n" };
      if (/SELECT id FROM reader_reports WHERE slug/.test(sql)) { const [slug, kind, key] = this._a; return Object.values(reports).find((r) => r.slug === slug && r.kind === kind && r.passage_key === key) || null; }
      if (/FROM reader_reports WHERE id = \?1 AND status = 'pending'/.test(sql)) { const r = reports[this._a[0]]; return r && r.status === "pending" ? Object.assign({}, r) : null; }
      return null; },
    async all() { log.push([name, sql, this._a]);
      if (/FROM reader_reports WHERE status = 'pending'/.test(sql)) return { results: Object.values(reports).filter((r) => r.status === "pending") };
      return { results: [] }; } }; } });
  return { log, reports, errata, rate, env: { AUDIT: db("audit"), LIVING_PAPER: db("lp"), DB: db("graph"), SYNC_TOKEN: "x",
    AI: { async run(model, input) { log.push(["ai", model, input]); if (verdict === "throw") throw new Error("down"); return { response: JSON.stringify(verdict) }; } } } };
}
const req = (body, ip) => new Request("https://papers.qnfo.org/api/paper-report", { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": ip || "1.2.3.4" }, body: JSON.stringify(body) });
const good = { slug: "real-paper", version: "1.1.0", kind: "typo", passage: "The sistem converges for every input", note: "sistem should be system", hp: "", t: 9000 };

let f = fakeEnv({ confirmed: true, correction: "system", why: 'The text reads "The sistem converges".' });
let waits = [];
const ctx = { waitUntil(p) { waits.push(p); } };
let r = await handleReaderReport(req(good), f.env, ctx), j = await r.json();
await Promise.all(waits); waits = [];
ok(r.status === 200 && /^rr-\d{8}-[0-9a-f]{10}$/.test(j.id), "a report is accepted with an rr- id", j);
ok(f.reports[j.id] && f.reports[j.id].version === "1.1.0" && f.reports[j.id].kind === "typo", "it is stored with the paper's live version and kind", f.reports[j.id]);
ok(!f.log.some(([, sql, a]) => /reader_reports/.test(sql) && JSON.stringify(a).includes("1.2.3.4")), "no network address is stored with the report");
ok(f.reports[j.id].status === "confirmed" && f.errata.length === 1 && f.errata[0][0] === j.id && f.errata[0][1] === "real-paper", "a confirmed report becomes an internal_errata row keyed by the report id and the slug", f.errata);
ok(/confirmed by/.test(f.errata[0][3]) && /At: "The sistem converges/.test(f.errata[0][5]) && /Suggested correction: system/.test(f.errata[0][5]), "the erratum names its checker and carries the passage as At: \"...\" for errata-hub's confirm step", f.errata[0]);
const ai = f.log.find((x) => x[0] === "ai");
ok(ai && /never instructions/.test(ai[2].messages[0].content) && ai[2].messages[0].content.includes("The sistem converges for every input we tried."), "the checker reads the paper text and is told the report is content", ai && ai[2].messages[0].content.slice(0, 200));

r = await handleReaderReport(req(good), f.env, ctx); j = await r.json();
ok(r.status === 200 && j.repeat === true && Object.keys(f.reports).length === 1 && Object.values(f.reports)[0].seen === 2, "the same passage again only counts up seen", j);

f = fakeEnv({ confirmed: false, correction: "", why: "The passage is spelled correctly." });
r = await handleReaderReport(req(good), f.env, ctx); j = await r.json(); await Promise.all(waits); waits = [];
ok(f.reports[j.id].status === "not-confirmed" && f.errata.length === 0, "a report the checker does not confirm never reaches internal_errata", f.reports[j.id]);

f = fakeEnv({ confirmed: true, correction: "", why: "x" });
r = await handleReaderReport(req(Object.assign({}, good, { hp: "http://spam" })), f.env, ctx);
ok(r.status === 200 && Object.keys(f.reports).length === 0, "a filled hidden field is answered as accepted and stores nothing");
r = await handleReaderReport(req(Object.assign({}, good, { t: 200 })), f.env, ctx);
ok(r.status === 200 && Object.keys(f.reports).length === 0, "an instant send stores nothing");
r = await handleReaderReport(req(Object.assign({}, good, { slug: "no-such-paper" })), f.env, ctx);
ok(r.status === 404, "an unknown paper is refused");
r = await handleReaderReport(req(Object.assign({}, good, { passage: "", note: "bad" })), f.env, ctx);
ok(r.status === 400, "an empty report is refused");
f = fakeEnv({ confirmed: true, correction: "", why: "x" });
let last = null;
for (let i = 0; i < 8; i++) last = await handleReaderReport(req(Object.assign({}, good, { passage: "The sistem converges number " + i })), f.env, ctx);
await Promise.all(waits); waits = [];
ok(last.status === 429 && Object.keys(f.reports).length === 6, "more than six reports from one address in an hour are refused", Object.keys(f.reports).length);

f = fakeEnv("throw");
r = await handleReaderReport(req(good), f.env, ctx); j = await r.json(); await Promise.all(waits); waits = [];
ok(f.reports[j.id].status === "pending", "a failed check leaves the report pending for the hourly sweep");
await rrSweep(f.env); await rrSweep(f.env);
ok(f.reports[j.id].status === "error" && f.reports[j.id].attempts === 3, "after three failed checks the report is marked error, not retried forever", f.reports[j.id]);

ok(rrLocate("alpha beta The system converges well", "the system converges") > 0 && rrLocate("abc", "nothing here at all") === -1, "rrLocate finds a rendered passage in the markdown body");
ok(!/"/.test(rrClaim({ kind: "typo", version: "1", passage: 'a "quoted" word', note: "" }, { why: "w", correction: "" }).split('At: "')[1].split('"')[0].replace(/^a /, "").slice(0, 1)), "straight quotes in the passage cannot end the At: capture");
new Function(LP_PAPER_JS);
ok(/openReport/.test(LP_PAPER_JS) && /\/api\/paper-report/.test(LP_PAPER_JS) && /touchend/.test(LP_PAPER_JS), "the page script opens the report dialog, posts to /api/paper-report and listens for touch selections");
ok(/id="rep-d"/.test(RR_DIALOG) && /name="rr_hp"/.test(RR_DIALOG) && !/name="website"/.test(RR_DIALOG), "the dialog carries the hidden field under a name autofill does not fill");
if (fails) { console.log(fails + " failing"); process.exit(1); }
console.log("all passed");
