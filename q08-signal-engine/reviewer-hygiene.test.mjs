// PUBLICATION-GATE-AUDIT-1 offline suite (q08-signal-engine 0.36.0, charter pillar reach). Evidence: engine_runs, 14 days to 2026-10-26: 20 ok of 537
// finished runs; 517 gate failures; 38 accuracy failures listed ledger numbers as figures ("figure not in the source: 40,") and tags as names ("name not in
// the source: S28 S29"); seven of 18 fact-check failures read on 2026-10-24..26 were not claims the draft makes. Proves:
//  (1) ledger tags a writer prints in round, curly, fullwidth and lenticular brackets, in lists, after a dagger and as [ledger S3] are removed before any check,
//      the check is clean on them, a real unsupported figure and a real unsupported name in the same sentence are still flagged, and text that only looks like
//      a tag ((S3), [S&P 500], [S3, 2019], [S1 and S2]) is left alone;
//  (2) each flagged item carries 24 characters of context, kept on the array and written to the pre-check stage row;
//  (3) reviewer output is read as what it is: an object printed as a string is unwrapped (kimi), an item with no claim is set aside and a fail that names nothing
//      else still fails closed, a claim whose own closing clause says it is supported is acquitted, and nothing that names a real unsupported fact is acquitted
//      (not supported, partly supported, date not in source, supported in part but the date is invented);
//  (4) the retraction rate over 30 days is null under 10 pieces and a ratio above, and is written to the registry by the generation cron.
// It pins no worker source text: an anchor goes stale when the next change edits the file. Run: node q08-signal-engine/reviewer-hygiene.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const F = mod.__factledger, V = mod.__verify, N = mod.__carry.normalizeDraft;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

// ---- 1. ledger tags in every form a writer printed, and text that only looks like one
const ground = "SOURCE: an article at example.org. Paul Battley wrote on his blog that he archived the repositories. The settlement was $42 million.";
const strip = F.stripLedgerTags;
const gone = ["[S33]", "[S33, S34]", "[S33 S34]", "[S33][S34]", "[S33-S35]", "[S33–S35]", "[S33-35]", "[S33/S34]", "[S33 & S34]", "(S33)", "(S33, S34)", "(S33 S34)", "(S39, S40, S41)", "{S33}",
  "【S33】", "【S33 S34】", "【S33†L1-L2】", "[S33†L1]", "[Source S33]", "[ledger S33]", "［S33］", "⟦S33⟧", "[s33]", "[**S33**]", "[S33.]"];
for (const f of gone) {
  const draft = "# Battley archives his gems\n\nPaul Battley wrote on his blog that he archived the repositories " + f + ". He left.\n\nworth your time: yes - names the mechanism";
  const out = N(draft);
  ok(!/S\s?33/.test(out) && /repositories\. He left\./.test(out), "normalizeDraft removes " + JSON.stringify(f) + " with its space", out);
  const probs = V.groundingProblems(out, ground, {});
  ok(probs.length === 0, "the grounding check is clean once " + JSON.stringify(f) + " is gone", probs);
}
// the defect, reproduced: before this change these forms left the digits behind as figures and the tag as a name
const stripOld = (t) => /\[S\d/.test(t) ? t.replace(/[ \t]*\[S\d{1,3}(?:\s*[,;–—-]\s*S?\d{1,3}|\s+S\d{1,3})*\]/g, "") : t;
for (const f of ["(S39, S40, S41)", "【S28 S29】", "[S33 & S34]"]) {
  const old = V.groundingProblems("Paul Battley wrote on his blog " + stripOld(f) + ".", ground, {});
  ok(old.some((x) => /^figure not in the source: \d/.test(x)) && old.some((x) => /^name not in the source: S\d/.test(x)), "the old strip left " + f + " as a figure and a name", old);
}
// a real unsupported figure and a real unsupported name next to a tag are still flagged
{
  const t = N("# T\n\nPaul Battley wrote that 300 repositories moved to Zenith Labs (S3, S4).\n\nworth your time: yes - x");
  const probs = V.groundingProblems(t, ground, {});
  ok(probs.some((x) => x === "figure not in the source: 300") && probs.some((x) => /^name not in the source: Zenith Labs/.test(x)) && !probs.some((x) => /S[34]/.test(x)), "real unsupported items are still flagged, the tag is not", probs);
}
// text that only looks like a tag stays
for (const keep of ["Amazon Simple Storage Service (S3) stores objects.", "He archived them (S3).", "The sample [S&P 500] rose.", "He cited [S3, 2019] in the paper.", "He cited [S3 2019] in the paper.", "The [S] key and the [S-curve] stay.", "See [S1 and S2] for the rest.", "{S3} is a label.", "A plain sentence."]) {
  ok(strip(keep) === keep, "stripLedgerTags leaves " + JSON.stringify(keep) + " untouched", strip(keep));
}
ok(strip("It runs on (S10).") === "It runs on." || strip("It runs on (S10).") === "It runs on.", "a parenthesised S10 or above is a ledger tag", strip("It runs on (S10)."));

// ---- 2. context on every flagged item
{
  const probs = V.groundingProblems("Paul Battley wrote on his blog that 300 repositories moved to Zenith Labs.", ground, {});
  ok(Array.isArray(probs.ctx) && probs.ctx.length === 2 && probs.ctx.some((c) => /^300 <<.*blog that 300 repo.*>>$/.test(c)) && probs.ctx.some((c) => /^Zenith Labs\.? <<.*moved to Zenith.*>>$/.test(c)), "each flagged figure and name carries its context", probs.ctx);
  ok(V.groundingProblems("Paul Battley wrote on his blog.", ground, {}).ctx.length === 0, "a clean text has an empty context list");
  const piece = { text: "# T\n\nPaul Battley wrote on his blog that 300 repositories moved to Zenith Labs.\n\nA second paragraph about the repositories.\n\nworth your time: yes - x", model: "m" };
  const r = F.groundPreCheck(piece, ground, { forecast: false, banned: [], src: { source: "hn", title: "T", url: "https://example.org/x" } });
  ok(r.ok === false && r.rows.length === 1 && /\| context: 300 <</.test(r.rows[0].fix) && r.rows[0].fix.length <= 520, "the pre-check stage row names where the flagged items sit", r.rows[0] && r.rows[0].fix);
}

// ---- 3. reviewer output
const P = V.parseFactVerdict;
const fc = (items, verdict) => P(JSON.stringify({ unsupported: items, verdict: verdict || "fail" }));
{
  // kimi printed an object as a string
  const a = fc(["{\"fact\":\"FACT: Max Woolf posted a detailed timeline on minimaxir.com on October 25, 2026 -- date not in source; the source says October 25, 2026 but that is the article's date\"}"]);
  ok(a.verdict === "fail" && a.unsupported.length === 1 && a.unsupported[0].startsWith("Max Woolf posted a detailed timeline") && !/\{"fact"/.test(a.unsupported[0]), "a JSON object printed as a string is unwrapped to its claim", a);
  const b = fc([{ FACT: "The messages emerged after Brazil's top electoral court ordered Meta to treat both candidates equally -- the source says the report came on the heels of the ruling" }]);
  ok(b.verdict === "fail" && b.unsupported.length === 1 && b.unsupported[0].startsWith("The messages emerged after Brazil's top electoral court"), "an object keyed FACT is unwrapped to its claim", b);
  const c = fc(["{\"fact\":\"FACT: Jonathan the tortoise is 190 years old -- the source says roughly"]);
  ok(c.verdict === "fail" && c.unsupported[0].startsWith("Jonathan the tortoise is 190 years old"), "a truncated object string still yields its claim", c);
  const d = fc(["{\"fact\":\"INFERENCE: the incentive is to ship early -- reasoning from the source\"}"]);
  ok(d.verdict === "pass" && d.inferences.length === 1, "an unwrapped INFERENCE item does not fail the draft", d);
}
{
  // a claim the reviewer itself calls supported
  const a = fc(["FACT: the per-book wholesale cost is about $2.5 -- the source says $2.5/book wholesale cost but not about; still, it is in the source material, so supported"]);
  ok(a.verdict === "pass" && a.unsupported.length === 0 && a.acquitted === 1, "a FACT whose closing clause says it is supported is acquitted", a);
  const b = fc(["the per-book wholesale cost is about $2.5 -- it is supported by the source"]);
  ok(b.verdict === "pass" && b.acquitted === 1, "an unlabelled item that ends 'supported by the source' is acquitted", b);
  for (const reason of ["date not in source", "the claim is not supported", "unsupported", "partly supported", "supported in part but the date is invented", "the source supports the date but not the claim", "not entirely in source", "not directly stated in source", "only partially in source", "the number is wrong; the source says 12, so not supported"]) {
    const r = fc(["FACT: The grant was announced on 4 March by the foundation -- " + reason]);
    ok(r.verdict === "fail" && r.unsupported.length === 1 && !r.acquitted, "'" + reason + "' is not acquitted", r);
  }
  const mixed = fc(["FACT: the cost is about $2.5 -- it is in the source material, so supported", "FACT: the fund was set up in 2019 -- year not in source"]);
  ok(mixed.verdict === "fail" && mixed.unsupported.length === 1 && /2019/.test(mixed.unsupported[0]) && mixed.acquitted === 1, "an acquitted item beside a real one leaves only the real one", mixed);
}
{
  // items with no claim text
  const only = fc(["reason"]);
  ok(only.verdict === "fail" && only.unsupported.length === 1 && /without naming a claim/.test(only.unsupported[0]), "a fail whose only item has no claim still fails closed", only);
  const dash = fc(["-- The date is in the source, but the claim that it 'matters' is an inference"]);
  ok(dash.verdict === "fail" && /without naming a claim/.test(dash.unsupported[0]), "an item that is only a reason names nothing, and the fail stands", dash);
  const withReal = fc(["reason", "FACT: The firm laid off 40 staff in May -- number not in source"]);
  ok(withReal.verdict === "fail" && withReal.unsupported.length === 1 && /40 staff/.test(withReal.unsupported[0]), "an empty item beside a real one is dropped, the real one fails the draft", withReal);
  ok(P('{"unsupported":["a"],"verdict":"pass"}').verdict === "fail", "a one-letter claim is still a claim (the existing contract)");
  ok(P('{"unsupported":[],"verdict":"pass"}').verdict === "pass" && P('{"unsupported":[],"verdict":"pass"}').acquitted === 0, "no items and a pass is a pass");
}

// ---- 4. the retraction rate
{
  const mk = (pieces, retracted) => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, reads INTEGER DEFAULT 0, sources_json TEXT, feedback_score REAL, signal_source TEXT, signal_id TEXT);
CREATE TABLE engine_runs (id INTEGER PRIMARY KEY, ran_at TEXT DEFAULT (datetime('now')), status TEXT, piece_published INTEGER DEFAULT 0, error TEXT, ms INTEGER, signals_scraped INTEGER, signals_scored INTEGER, top_signal TEXT, model TEXT);
CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER NOT NULL DEFAULT 0, crawler INTEGER NOT NULL DEFAULT 0);
CREATE TABLE q08_feedback (id INTEGER PRIMARY KEY, slug TEXT, signal TEXT, ip_key TEXT, created_at TEXT);
CREATE TABLE subscribers (email TEXT, status TEXT, token TEXT, created_at TEXT, confirmed_at TEXT);
CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT);`);
    const now = Date.now();
    for (let i = 0; i < pieces; i++) db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, published_at) VALUES (?, ?, 'T', 'b', ?)").run("p" + i, "s" + i, new Date(now - i * 3600e3).toISOString());
    db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, published_at) VALUES ('old', 'sold', 'T', 'b', ?)").run(new Date(now - 40 * 864e5).toISOString()); // outside the window, retracted, must not count
    db.prepare("INSERT INTO q08_retractions (slug, reason) VALUES ('sold', 'old')").run();
    for (let i = 0; i < retracted; i++) db.prepare("INSERT INTO q08_retractions (slug, reason) VALUES (?, 'unsupported')").run("s" + i);
    const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => db.prepare(sql).run(...a), first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
    const writes = [];
    const audit = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, first: async () => ({ n: 9000 }), run: async () => { if (/^UPDATE metric_registry/.test(sql)) { writes.push(a[0] + "=" + a[1]); return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; }, all: async () => ({ results: [] }) }; return st; } };
    return { env: { DB: shim, AUDIT: audit }, writes };
  };
  const w = mod.default;
  const get = async (env, path) => (await w.fetch(new Request("https://q08.org" + path, { headers: { "user-agent": "Mozilla/5.0 Safari" } }), env, { waitUntil() {} })).json();
  const a = mk(12, 5);
  const m = (await get(a.env, "/api/metrics")).windows["7d"];
  ok(m.retraction_rate_30d === 0.417, "5 of 12 pieces in 30 days retracted is 0.417 (the piece 40 days old is outside the window)", m.retraction_rate_30d);
  const b = mk(9, 9);
  ok((await get(b.env, "/api/metrics")).windows["7d"].retraction_rate_30d === null, "under 10 pieces the rate is unknown, not a value");
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("offline test"); };
  const waits = [];
  await w.scheduled({ cron: "0 */2 * * *" }, a.env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  globalThis.fetch = realFetch;
  ok(a.writes.includes("q08_retraction_rate_30d=0.417"), "the generation cron writes q08_retraction_rate_30d to the registry", a.writes);
  const waits2 = [];
  globalThis.fetch = async () => { throw new Error("offline test"); };
  await w.scheduled({ cron: "0 */2 * * *" }, b.env, { waitUntil: (p) => waits2.push(p) });
  await Promise.all(waits2);
  globalThis.fetch = realFetch;
  ok(!b.writes.some((x) => /^q08_retraction_rate_30d=/.test(x)), "an unknown rate is not written", b.writes);
}
console.log(`reviewer-hygiene: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
