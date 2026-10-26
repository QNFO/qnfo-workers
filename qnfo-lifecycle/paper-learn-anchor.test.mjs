// PAPER-LEARN-ANCHOR-1 offline suite (qnfo-lifecycle 1.15.2). No network, synthetic data.
// Proves: an erratum PAPER-LEARN-1 routes to internal_errata carries the `At: "<passage>"` anchor that errata-hub's internal confirm
// (ERRATA-INTERNAL-CONFIRM-1) centres its excerpt on, so a finding about a passage deep in a long paper is judged against that passage and
// not against the first 24,000 characters. The consumer is the REAL confirmExcerpt, read out of errata-hub/worker.js (pinned line for line
// to qnfo-research-exec by errata-fold.test.mjs), so a change to the anchor contract fails here. A claim with no locatable quotation, one
// that is already anchored and an empty body are left as they were; the anchor is a verbatim prefix of the stored body with no double
// quote or line break in it; regular-expression characters in a passage anchor nothing wrongly and never throw.
// Run: node qnfo-lifecycle/paper-learn-anchor.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const W = (await import("./worker.js")).default;
const P = W.__paperLearn;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

// The real consumer.
const hub = readFileSync(new URL("../errata-hub/worker.js", import.meta.url), "utf8");
const maxLine = hub.match(/^var CONFIRM_EXCERPT_MAX = [^;]+;/m);
const fnSrc = hub.match(/^function confirmExcerpt\(body, claim\) \{[\s\S]*?\n\}/m);
ok(maxLine && fnSrc, "confirmExcerpt and CONFIRM_EXCERPT_MAX are found in errata-hub/worker.js");
const confirmExcerpt = new Function(maxLine[0] + "\n" + fnSrc[0] + "\nreturn confirmExcerpt;")();
const WINDOW = Number(maxLine[0].match(/= ([^;]+);/)[1].replace(/e(\d)/, "e$1")) || eval(maxLine[0].match(/= ([^;]+);/)[1]);
ok(WINDOW >= 12e3 && WINDOW <= 48e3, "the confirm window is read from the consumer", WINDOW);

ok(typeof P.anchorClaim === "function" && typeof P.quotedPassages === "function", "the anchor helpers are exposed on __paperLearn");

// A long paper: filler, the target passage about 40,000 characters in (beyond the 24,000-character window), more filler.
const filler = (n, tag) => (tag + " Operating points of the loop follow from the stated assumptions and nothing more.\n\n").repeat(Math.ceil(n / 40)).slice(0, n);
const PASSAGE = "The Grover speedup reduces brute-force search from 2^256 to 2^128 operations";
const longBody = "# Title\n\n" + filler(40000, "A") + "## 5.3 Security\n\n" + PASSAGE + ", which exceeds the NIST Category 1 threshold of 2^143.\n\n" + filler(20000, "B");
const at = longBody.indexOf(PASSAGE);
ok(at > WINDOW && longBody.length > 60000, "fixture: the passage lies beyond the window, in a paper longer than the reader's cap", [at, longBody.length]);

// 1. The failure being fixed: without the anchor the excerpt is the head of the paper and does not contain the passage.
const plain = "'" + PASSAGE + ", which exceeds the NIST Category 1 threshold of 2^143.' (Section 5.3)";
ok(!confirmExcerpt(longBody, plain).includes("Grover speedup"), "unanchored: the confirm excerpt is the head of the paper and lacks the passage");

// 2. With the anchor it is centred on the passage.
const anchored = P.anchorClaim(longBody, plain, "2^128 is less than 2^143");
ok(/ At: "The Grover speedup reduces brute-force search from 2\^256 to 2\^128 operations"$/.test(anchored) || / At: "The Grover speedup/.test(anchored), "single-quoted passage: the claim ends with an At: anchor", anchored);
ok(anchored.startsWith(plain), "the original claim text is kept in front of the anchor");
const m = anchored.match(/At: "([^"]{12,})"$/);
ok(m && longBody.indexOf(m[1]) >= 0 && !/["\r\n]/.test(m[1]) && m[1].length >= 12 && m[1].length <= 120, "the anchor is a verbatim prefix of the body, 12 to 120 characters, with no quote or line break", m && m[1]);
ok(confirmExcerpt(longBody, anchored).includes("Grover speedup") && confirmExcerpt(longBody, anchored).length <= WINDOW, "anchored: the real confirmExcerpt returns a window that contains the passage");

// 3. Quote styles and typography: curly and straight quotes, curly apostrophes in the body, collapsed whitespace, an elision.
const typo = "# T\n\n" + filler(30000, "C") + "Define the model’s state as “the cut-off frequency is set by the drift’s rate” and proceed.\n" + filler(5000, "D");
const dq = P.anchorClaim(typo, 'The text says "the cut-off frequency is set by the drift\'s rate" in Section 3.', "");
ok(/ At: "the cut-off frequency is set by the drift’s rate/.test(dq), "straight quotes and apostrophes in the claim find curly ones in the body", dq);
const cq = P.anchorClaim(typo, "The text says “the cut-off  frequency\nis set by the drift's rate” in Section 3.", "");
ok(/ At: "the cut-off frequency is set by the drift’s rate/.test(cq), "curly quotes and irregular whitespace in the claim are matched", cq);
const el = P.anchorClaim(longBody, "It says 'zzzz not in the paper at all ... " + PASSAGE + "' in 5.3", "");
ok(/ At: "The Grover speedup/.test(el), "an elided quotation falls through to a piece that is in the paper", el);
ok(P.quotedPassages("It says 'alpha beta gamma delta ... epsilon zeta eta theta' and \"one two three four five six\"").length === 3, "quoted passages are split at ellipses", P.quotedPassages("It says 'alpha beta gamma delta ... epsilon zeta eta theta' and \"one two three four five six\""));

// 4. The why text is the fallback when the claim quotes nothing.
const viaWhy = P.anchorClaim(longBody, "A number does not match its inputs", "the paper writes '" + PASSAGE + "' but 2^128 < 2^143");
ok(/ At: "The Grover speedup/.test(viaWhy), "a quotation in the reason anchors a claim that has none");

// 5. Left as they were.
const untouched = (claim, why, body) => P.anchorClaim(body === undefined ? longBody : body, claim, why) === claim;
ok(untouched("The abstract overstates what Section 4 proves", ""), "a claim with no quotation is unchanged");
ok(untouched("The paper's result and the model's claim disagree, it's said", ""), "apostrophes in prose do not pair into a quotation");
ok(untouched("It says 'this sentence is not anywhere in the stored paper text'", ""), "a quotation that is not in the body anchors nothing");
ok(untouched("It says 'too short'", ""), "a quotation under 16 characters is not used");
ok(untouched("It says 'x' and " + "'" + PASSAGE + "'", "", ""), "an empty body anchors nothing");
ok(P.anchorClaim(longBody, anchored, "") === anchored, "an already anchored claim is not anchored twice");
ok(untouched("It says '(a+b)*[c]^2 | $x$ \\ ? {n}' somewhere", ""), "regular-expression characters in a quotation do not throw or match wildly");
const meta = "# T\n\nWe set (a+b)*[c]^2 | $x$ \\ ? {n} as the rule.\n" + filler(3000, "E");
ok(/ At: "We set|At: "\(a\+b\)/.test(P.anchorClaim(meta, "It says '(a+b)*[c]^2 | $x$ \\ ? {n} as the rule' here", "")) || untouched("It says '(a+b)*[c]^2 | $x$ \\ ? {n} as the rule' here", "", meta), "a quotation made of regex metacharacters is located literally or not at all");

// 6. The anchor stops at a double quote or line break in the body.
const stop = "# T\n\n" + filler(2000, "F") + 'He wrote "shortly after the first line\nand the next line follows here" end.\n';
const cut = P.anchorClaim(stop, "It says 'shortly after the first line and the next line follows here'", "");
const cm = cut.match(/At: "([^"]*)"$/);
ok(cm && cm[1] === "shortly after the first line" && stop.includes(cm[1]), "the anchor ends at a line break in the body", cut);

// 7. Through the real tick: a confirmed error on a long paper reaches internal_errata anchored; the paper_learnings row keeps the model's claim.
function d1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    async run() { const r = db.prepare(sql).run(...(args || [])); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    async all() { return { results: db.prepare(sql).all(...(args || [])) }; },
    async first() { return db.prepare(sql).get(...(args || [])) || null; },
  });
  return { prepare: (sql) => stmt(sql, []), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}
const living = new DatabaseSync(":memory:");
living.exec("CREATE TABLE papers (slug TEXT, title TEXT, version TEXT, status TEXT, body_md TEXT, updated_at TEXT)");
const audit = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE internal_errata (id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_ref TEXT NOT NULL, detected_at TEXT NOT NULL, detected_by TEXT, severity TEXT DEFAULT 'high', claim_text TEXT, falsification TEXT, evidence TEXT, remediation TEXT, status TEXT DEFAULT 'open', owner TEXT, updated_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
INSERT INTO metric_registry (metric) VALUES ('papers_unlearned_over_120m');`);
const ago = (min) => new Date(Date.now() - min * 60000).toISOString().replace("T", " ").slice(0, 19);
living.prepare("INSERT INTO papers VALUES (?, ?, ?, 'published', ?, ?)").run("long-paper", "Title long-paper", "2.0.0", longBody, ago(5));
const ERR = { claim: plain, why: "2^128 is less than the 2^143 threshold it is said to exceed" };
const AI = { async run(model, opts) {
  const prompt = opts.messages[0].content;
  if (prompt.startsWith("A reviewer claims")) return { choices: [{ message: { content: JSON.stringify({ verdicts: [{ i: 0, confirmed: true, why: "the sentence compares 2^128 with 2^143" }] }) } }] };
  return { response: JSON.stringify({ learnings: [], errors: [ERR] }) };
} };
const env = { LIVING_PAPER: d1(living), QNFO_AUDIT: d1(audit), AI };
await P.tick(env);
const E = audit.prepare("SELECT * FROM internal_errata").all();
ok(E.length === 1 && E[0].id === "pl-long-paper-2.0.0-0" && E[0].owner === "qnfo-research-exec" && E[0].status === "open", "the confirmed error reaches internal_errata", E);
ok(E[0] && E[0].claim_text.startsWith(plain) && / At: "The Grover speedup[^"]*"$/.test(E[0].claim_text), "its claim_text ends with the At: anchor", E[0] && E[0].claim_text);
ok(E[0] && confirmExcerpt(longBody, E[0].claim_text).includes("Grover speedup") && !confirmExcerpt(longBody, plain).includes("Grover speedup"), "the confirm excerpt for the stored claim holds the passage; for the unanchored claim it did not");
const L = audit.prepare("SELECT claim FROM paper_learnings WHERE kind = 'error'").all();
ok(L.length === 1 && L[0].claim === plain, "the paper_learnings row keeps the reader's own claim, unanchored", L);

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
