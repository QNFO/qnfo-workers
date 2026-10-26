// ASK-PLAIN-1 offline suite (qnfo-ai-search 2.10.0, 2026-10-26). An Ask answer uses plain language and is built from passages that
// explain, not from the sentence it was asked about. Regression for the live failure: Explain "a subset of anyons in a parent
// phase condenses" on the paper that holds that sentence was answered by repeating the sentence, with the passage that defines its
// terms missing from the excerpt, a reference marker of the paper ([2]) read as source [2], and nothing checking the opening.
// Proves: the prompt asks for plain language and forbids circular explanations (and still names no topic); explainTarget reads
// the wording from an explain / define / what-is question and leaves other questions alone; the pinned paper's excerpt for an
// explain question leaves out the wording's own sentence, the abstract, the references and formula fragments and adds the
// sentences that define or exemplify its terms; reference markers are removed from excerpts; plainReport flags an echoing or
// dense opening and passes a plain one; an echoing first draft is rewritten once and the plain rewrite is what is sent, the
// better draft is kept when the rewrite is no better, and a non-explain question is never rewritten; ask_events.plain records
// the verdict and ask_plain_share_7d is measured from it.
// Run: node qnfo-ai-search/ask-plain.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 500) : "")); } };

// ---- prompt ----
const sysBlock = src.slice(src.indexOf("var SYSTEM = ["), src.indexOf("function buildMessages"));
ok(/Write in plain language for an intelligent reader who is not a specialist/.test(sysBlock) && /short sentences \(under 25 words\)/.test(sysBlock), "the system prompt asks for plain language and short sentences");
ok(/Never answer a request to explain a phrase, passage or term by repeating it or rewording it lightly: that is circular/.test(sysBlock) && /at most five of its words in a row/.test(sysBlock), "the system prompt forbids a circular explanation");
ok(/gloss it with the meaning or description an excerpt gives it/.test(sysBlock) && /do not define it/.test(sysBlock), "a technical term is glossed from the excerpts on first use, or named as undefined");
ok(/Plain is not looser: every sentence still says what an excerpt says/.test(sysBlock) && /Never add an analogy, a comparison, a general definition or any background that no excerpt contains/.test(sysBlock) && !/everyday words/.test(sysBlock), "plain is not looser: no analogy, general definition or background, and no invitation to use everyday words (ASK-PLAIN-2)");
ok(!/Plain, neutral scholarly prose/.test(sysBlock), "the scholarly-prose rule is gone");
ok(!/p-adic|adelic|ultrametric|topological|anyon|JPCUB|QWAV|QNFO/i.test(sysBlock), "the prompt still names no topic");
ok(src.split("- Write in plain language for an intelligent reader").length === 2 && /plain: "- Write in plain language " \+ "for an intelligent reader"/.test(src), "the plain-language fix anchor is assembled and the prompt line occurs once");
ok(/Ground every factual claim " \+ "in the numbered EXCERPTS/.test(src) && src.split("- Ground every factual claim in the numbered EXCERPTS.").length === 2, "the citation anchor is unchanged");

// ---- ASK-PLAIN-2: an analogy no excerpt makes is removed ----
const ga = src.indexOf("// ---- ASK-GROUND-BEGIN"), gb = src.indexOf("// ---- ASK-GROUND-END ----");
const gsb = { Set, String, Number, Array };
vm.createContext(gsb);
vm.runInContext(src.slice(ga, gb) + "\n;__g = { groundBody, groundText };", gsb);
const gtxt = gsb.__g.groundText([{ n: 1, title: "P", excerpt: "A part is called folded when no test can tell it apart. A folded part is like a copy of the base part." }], "q", [], null);
const gout = gsb.__g.groundBody("A part is called folded when no test can tell it apart [1]. Parts are like tiny things [1]. Think of it as a crowd gathering [1]. A folded part is like a copy of the base part [1]. Condensing means imagine a crowd [1].", gtxt, 1);
ok(/called folded/.test(gout.text) && /like a copy of the base part/.test(gout.text), "a supported sentence and an analogy the excerpt itself makes are kept", gout.text);
ok(!/tiny things|Think of it|crowd/.test(gout.text) && gout.removed === 3, "an analogy, an invitation to think of it and an invitation to imagine, none in an excerpt, are removed", gout);
const bmsg = src.slice(src.indexOf("function buildMessages"), src.indexOf("function splitFollowups"));
ok(/no analogy, no general definition of a term, no background/.test(bmsg) && /gloss each one from the excerpt that defines it/.test(bmsg), "the explain instruction forbids analogy, general definitions and background");

// ---- the pure functions ----
const a = src.indexOf("// ---- ASK-PLAIN-BEGIN"), b = src.indexOf("// ---- ASK-PLAIN-END ----");
ok(a > 0 && b > a && !/[^\x00-\x7f]/.test(src), "the block exists and the source is ASCII");
const sb = { Set, String, Number, Array, Math };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n;__x = { explainTarget, definitionPassages, plainReport, stripRefMarks, plainFlags, plainRewriteRequest, isTargetSentence, plainStems, DEFINES_LABEL };", sb);
const X = sb.__x;
const T = "a subset of widgets in a parent assembly merges";
ok(X.explainTarget('Explain "' + T + '"').target === T, "explain with straight quotes");
ok(X.explainTarget("Explain this passage and how it fits the paper: “" + T + "”").target === T, "the paper page's selected-passage question gives the quoted span");
ok(X.explainTarget("What is load balancing?").target === "load balancing" && X.explainTarget("Define quantum dimension").target === "quantum dimension", "what is X / define X give X");
ok(X.explainTarget("What does hysteresis mean?").target === "hysteresis" && X.explainTarget("Explain load balancing in simple terms").target === "load balancing", "what does X mean / in simple terms are read");
ok(X.explainTarget("What does the paper measure?") === null && X.explainTarget("How many cases are computed?") === null && X.explainTarget("What is the main result of this paper?") === null, "questions about the paper are not explain questions");
ok(X.explainTarget("What does “Some Paper Title” show, and what would falsify it?") === null, "the paper page's title question is not an explain question");
ok(X.stripRefMarks("of the parent [2]. Also [3, 4] and [5–7] and x[1] hold, see below [12]") === "of the parent. Also and and x[1] hold, see below", "reference markers are removed, an index attached to a symbol is not");

// ---- definition passages ----
const abs = "Widgets merge into one when a rule fires, and the rest stay apart under the new assembly.";
const body = [
  "# A Paper on Widgets",
  abs,
  "",
  "## Abstract",
  "This text is skipped as the abstract section.",
  "",
  "## 1. Introduction",
  "Widget merging is a familiar idea: " + T + ", and the result is a child assembly whose parts are fewer than the parent's parts [2].",
  "A widget is called merged when it can no longer be told apart from the base part by any test.",
  "The remaining widgets, those that pass every test, are called survivors and form the child assembly.",
  "Costs were measured on a bench with many different settings, as reported later in the text.",
  abs,
  "",
  "## 4.1 Case I: two widgets",
  "Consider two widgets, one red and one blue, and merge the red one: the blue widget then fails the test and is rejected.",
  "x = 1 + 2 = 3, y = 4, z = 5, q = 6, r = 7, s = 8, t = 9.",
  "",
  "## References",
  "A widget is called a thing in an older merging paper that nobody here read in full.",
].join("\n");
const defs = X.definitionPassages(body, T, abs);
ok(/can no longer be told apart/.test(defs) && /are called survivors/.test(defs), "sentences that define the terms are listed", defs);
ok(/Consider two widgets/.test(defs), "a worked case under a Case heading is listed", defs);
ok(!/familiar idea/.test(defs) && !/subset of widgets/.test(defs), "the wording's own sentence is left out", defs);
ok(!/Widgets merge into one when a rule fires/.test(defs) && !/skipped as the abstract/.test(defs), "the abstract and the abstract section are left out", defs);
ok(!/x = 1/.test(defs) && !/older merging paper/.test(defs) && !/Costs were measured/.test(defs), "formula fragments, the reference list and sentences that do not touch the terms are left out", defs);
ok(defs.split("\n").length <= 4 && defs.length <= 1800 && defs.split("\n").every((l) => l.startsWith("- ")), "at most four '- ' lines, 1800 characters");
ok(X.definitionPassages(body, "zzz qqq yyy", abs) === "", "no matching terms: nothing is listed");
ok(X.isTargetSentence("A subset of widgets in a parent assembly merges.", new Set(X.plainStems(T))) && !X.isTargetSentence("A widget is called merged when it can no longer be told apart.", new Set(X.plainStems(T))) && !X.isTargetSentence("a subset of widgets merges", new Set(X.plainStems("widgets merge"))), "a sentence is the wording only when it holds nearly all of a wording of four or more terms");

// ---- the opening of an answer ----
const ECHO = 'The phrase "' + T + '" refers to the process of widget merging, where a subset of widgets in a parent assembly merges, resulting in a child assembly whose parts are fewer than the parent [1]. This process is described as the modern, structure-theoretic incarnation of the usual idea of simplification, adapted to assemblies of parts and to their combined behavior under the rule [1].';
const PLAIN = "It means that some of the parts are folded into the base part, so they stop counting as separate parts [1]. The parts that are left, the ones that still pass every test, make a smaller assembly [1].\n\n### How it works\nA part is folded in when no test can tell it apart from the base part [1]. In the example, merging the red widget leaves the blue one rejected [1].";
const HEDGE = "The excerpts do not explain this in detail. It means that some parts are folded into the base part and stop counting as separate parts [1]. The rest form a smaller assembly [1].";
const e1 = X.plainReport(ECHO, T), p1 = X.plainReport(PLAIN, T), h1 = X.plainReport(HEDGE, T);
ok(e1.echo === true && e1.run >= 6 && e1.dense === true, "an answer that repeats the wording as its explanation is echo and dense", e1);
ok(p1.echo === false && p1.dense === false && p1.avg < 25, "a plain answer passes", p1);
ok(h1.echo === false && h1.dense === false, "an 'excerpts do not' sentence is not counted as the opening", h1);
ok(X.plainReport("Short one. " + "word ".repeat(14).trim() + " ends here.", "").dense === false, "short sentences are not dense");
ok(X.plainReport("The quantification of the characterization of interoperability considerations demonstrates multidimensional optimization alongside comprehensive parameterization.", "").dense === true, "a sentence of long specialist words is dense");
ok(X.plainReport("", T).echo === false && X.plainReport("", T).words === 0, "an empty answer is not flagged");
ok(X.plainFlags({ target: T }, e1, 1) === 1 + 2 + 4 + 8 && X.plainFlags(null, p1, 0) === 0 && X.plainFlags({ target: T }, p1, 1) === 1 + 8, "plain flags: 1 explain, 2 echo, 4 dense, 8 rewritten");
ok(/6 or more words/.test(X.plainRewriteRequest(e1)) && /at most five of its words/.test(X.plainRewriteRequest(e1)) && /long sentences/.test(X.plainRewriteRequest(p1.dense ? p1 : { dense: true })) && /no analogy, no general definition, no background/.test(X.plainRewriteRequest(e1)), "the rewrite request names the defects and the rules, including no analogy or background");

// ---- end to end ----
const sq = new DatabaseSync(":memory:");
function stmt(sql0) {
  const order = [];
  const sql = sql0.replace(/\?(\d+)/g, (m, n) => { order.push(Number(n) - 1); return "?"; });
  let args = [];
  const s = {
    bind(...x) { x = x.map((v) => (v === undefined ? null : v)); args = order.length ? order.map((i) => x[i]) : x; return s; },
    async first() { const p = sq.prepare(sql); if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)) return p.get(...args) ?? null; p.run(...args); return null; },
    async all() { const p = sq.prepare(sql); return { results: /^\s*(SELECT|WITH|PRAGMA)/i.test(sql) ? p.all(...args) : (p.run(...args), []) }; },
    async run() { const p = sq.prepare(sql); const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  };
  return s;
}
const D1 = { prepare: stmt, async batch(list) { for (const s of list) await s.run(); return []; } };
sq.exec("CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)");
sq.exec("CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER)");
sq.exec("CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT, updated_at TEXT)");
sq.exec("INSERT INTO fleet_budget (node_class, cap, current) VALUES ('ai_spend:total', 150, 10)");
sq.exec("CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, refused INTEGER DEFAULT 0, PRIMARY KEY (day, provider, caller, model))");
sq.exec("CREATE TABLE ask_rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, ts TEXT NOT NULL)");
// The table as it is in production before 2.10.0 (no plain column): the worker adds the column.
sq.exec("CREATE TABLE ask_events (id TEXT PRIMARY KEY, ts TEXT NOT NULL, qhash TEXT, query TEXT, turn INTEGER, cached INTEGER DEFAULT 0, limited TEXT, cfg TEXT, arm TEXT, model TEXT, retrieval_ms INTEGER, ttft_ms INTEGER, total_ms INTEGER, sources INTEGER, top_score REAL, graph_nodes INTEGER, threads INTEGER, answer_chars INTEGER, cites INTEGER, cites_invalid INTEGER, uncovered INTEGER, followups INTEGER, in_tok INTEGER, out_tok INTEGER, usd REAL, error TEXT, judge INTEGER DEFAULT 0, answer TEXT, context TEXT, judged_supported INTEGER, judged_total INTEGER)");

const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json" } });
const PAPER = { slug: "widget-paper", title: "A Paper on Widgets", doi: null, abstract: abs, body_md: "---\ntitle: x\n---\n" + body.split("\n").slice(1).join("\n").replace("## References\n", "## References\n") };
const gatewayFetch = async (u) => {
  const url = new URL(typeof u === "string" ? u : u.url);
  if (url.host === "papers.qnfo.org" && url.pathname === "/papers") return J({ papers: [PAPER], total: 1 });
  if (url.host === "papers.qnfo.org" && url.pathname === "/papers/widget-paper") return J(PAPER);
  if (url.host === "graph-api.qnfo.org" && url.pathname === "/nodes") return J({ nodes: [] });
  return J({ error: "nf" }, 404);
};
const AI_SEARCH = { get() { return { items: { async upload() { return {}; } }, async search() { return { chunks: [] }; } }; } };
let outs = [], calls = [];
const AI = { async run(model, input) {
  calls.push(input.messages);
  const text = outs[Math.min(calls.length - 1, outs.length - 1)];
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const p of text.match(/[\s\S]{1,24}/g)) c.enqueue(enc.encode("data: " + JSON.stringify({ response: p }) + "\n\n")); c.enqueue(enc.encode("data: " + JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 50 } }) + "\n\n")); c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); } });
} };
globalThis.caches = { default: { async match() { return undefined; }, async put() {} } };
const env = { AI, AI_SEARCH, QNFO_AUDIT: D1, GATEWAY: { fetch: gatewayFetch }, IDEAS: { fetch: async () => J({ sessions: [] }) }, SPEND_CAP_TOTAL_USD: "60" };
const dir = mkdtempSync(join(tmpdir(), "askplain-"));
writeFileSync(join(dir, "w.mjs"), src);
const { default: worker } = await import(pathToFileURL(join(dir, "w.mjs")).href);
const waits = [], ctx = { waitUntil: (p) => waits.push(p) };
let ip = 10;
const ask = async (q, paper) => {
  const r = await worker.fetch(new Request("https://ask.qwav.tech/api/ask", { method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": "9.9.9." + (ip++) }, body: JSON.stringify({ query: q, paper }) }), env, ctx);
  const t = await r.text(); await Promise.allSettled(waits.splice(0)); return t;
};
const sse = (t, ev) => t.split("\n\n").filter((x) => x.startsWith("event: " + ev)).map((x) => JSON.parse(x.split("data: ")[1]));
const answerOf = (t) => (sse(t, "token")[0] || { t: "" }).t.split("FOLLOWUPS")[0];
const Q = 'Explain "' + T + '"';

// 1. echo first, plain second: the plain rewrite is sent, and the writer saw the right excerpt
outs = [ECHO + "\n\nFOLLOWUPS:\n- What is a survivor in this paper?\n- How is a part folded into the base part?\n- What does the example show?", PLAIN + "\n\nFOLLOWUPS:\n- What is a survivor in this paper?\n- How is a part folded into the base part?\n- What does the example show?"];
calls = [];
let t = await ask(Q, "widget-paper");
const sent = answerOf(t);
ok(calls.length === 2, "an echoing first draft is rewritten once (two model calls)", calls.length);
ok(sse(t, "token").length === 1 && /folded into the base part/.test(sent) && !/refers to the process/.test(sent), "only the plain rewrite is sent, as one checked token event", sent);
const first = calls[0], user1 = first[first.length - 1].content;
ok(user1.indexOf("Passages that define, restate or give an example") > 0 && /can no longer be told apart/.test(user1) && /are called survivors/.test(user1), "the writer's excerpt lists the sentences that define the terms", user1.slice(0, 900));
ok(!/Widget merging is a familiar idea: a subset of widgets in a parent assembly merges, and the result is a child assembly[^\n]*\n\n- /.test(user1.split("Passages that define")[1] || ""), "the defining list does not repeat the wording's sentence");
ok(!/parent's parts \[2\]/.test(user1) && /parent's parts\./.test(user1), "the paper's own reference marker [2] is removed from the excerpt");
ok(/The visitor wants this wording explained/.test(user1) && /### In plain words/.test(user1) && /at most five|no run of more than five words/.test(user1), "the question says which text is the wording and the answer order", user1.slice(-900));
const second = calls[1];
ok(second.length === first.length + 2 && second[second.length - 2].role === "assistant" && /That draft copied 6 or more words/.test(second[second.length - 1].content), "the rewrite call carries the draft and names the defects", second.slice(-2).map((m) => m.content.slice(0, 120)));
const d1 = sse(t, "done")[0];
ok(d1 && d1.followups.length >= 1, "follow-ups come from the kept draft", d1);
let row = sq.prepare("SELECT plain, in_tok, out_tok, answer_chars FROM ask_events ORDER BY rowid DESC LIMIT 1").get();
ok(row && row.plain === 1 + 8 && row.in_tok === 200 && row.out_tok === 100, "ask_events.plain = explain + rewritten (no echo or dense left); both calls' tokens are counted", row);
ok(sq.prepare("SELECT COUNT(*) n FROM pragma_table_info('ask_events') WHERE name = 'plain'").get().n === 1, "the plain column was added to the production table");

// 2. the rewrite is no better: the first draft stays, flagged
outs = [ECHO, ECHO];
calls = [];
t = await ask('Explain "a subset of widgets in a parent assembly merges" please', "widget-paper");
ok(calls.length === 2 && /refers to the process/.test(answerOf(t)), "a rewrite that is no better is not used", answerOf(t).slice(0, 200));
row = sq.prepare("SELECT plain FROM ask_events ORDER BY rowid DESC LIMIT 1").get();
ok(row.plain === 1 + 2 + 4 + 8, "the verdict records echo, dense and the rewrite", row);

// 3. a plain first draft is not rewritten
outs = [PLAIN];
calls = [];
t = await ask("Explain “" + T + " now”", "widget-paper");
ok(calls.length === 1 && /folded into the base part/.test(answerOf(t)), "a plain first draft is sent with no rewrite", calls.length);
row = sq.prepare("SELECT plain FROM ask_events ORDER BY rowid DESC LIMIT 1").get();
ok(row.plain === 1, "plain = 1 (explain question, nothing flagged)", row);

// 4. a question that is not an explain question is never rewritten, but its density is recorded
outs = [ECHO];
calls = [];
t = await ask("How many assemblies does the paper study?", "widget-paper");
ok(calls.length === 1, "a non-explain question is never rewritten", calls.length);
row = sq.prepare("SELECT plain FROM ask_events ORDER BY rowid DESC LIMIT 1").get();
ok(row.plain === 4, "its dense opening is recorded (4), without the explain flag", row);
ok(!/Passages that define/.test(calls[0][calls[0].length - 1].content) && !/wants this wording explained/.test(calls[0][calls[0].length - 1].content), "no explain instruction for an ordinary question");

// 5. the measure: ask_plain_share_7d from ask_events.plain
sq.exec("CREATE TABLE IF NOT EXISTS metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, state TEXT, refresh_class TEXT, last_value TEXT, last_refreshed TEXT)");
sq.exec("CREATE TABLE IF NOT EXISTS ask_evals (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, kind TEXT NOT NULL, cfg TEXT, n INTEGER, score REAL, detail TEXT)");
sq.exec("UPDATE ask_events SET limited = NULL, error = NULL, cached = 0, answer_chars = 200");
const nowIso = new Date().toISOString();
for (let i = 0; i < 12; i++) sq.prepare("INSERT INTO ask_events (id, ts, cached, answer_chars, plain) VALUES (?, ?, 0, 200, ?)").run("m" + i, nowIso, i < 3 ? 2 : i < 4 ? 4 : 1);
sq.prepare("INSERT INTO ask_events (id, ts, cached, answer_chars, plain) VALUES ('old', ?, 0, 200, NULL)").run(nowIso);
const sched = await worker.scheduled({ scheduledTime: Date.now() }, env, ctx).catch((e) => e);
await Promise.allSettled(waits.splice(0));
const mv = sq.prepare("SELECT last_value, formula FROM metric_registry WHERE metric = 'ask_plain_share_7d'").get();
const total = sq.prepare("SELECT COUNT(*) n, SUM(CASE WHEN (plain & 6) > 0 THEN 1 ELSE 0 END) bad FROM ask_events WHERE plain IS NOT NULL AND answer_chars > 80 AND limited IS NULL AND error IS NULL AND cached = 0").get();
ok(mv && Number(mv.last_value) === Math.round((1 - total.bad / total.n) * 1e4) / 1e4 && /ASK-PLAIN-1/.test(mv.formula), "ask_plain_share_7d is measured from the plain flags and rows without a verdict do not count", { mv, total, sched: String(sched && sched.message || "") });
ok(/ask_plain_share_7d/.test(src) && /plain: "- Write in plain language "/.test(src) && /m\.fix === "plain"/.test(src), "the metric has its fix anchor and its example query");

// 6. a cached answer from an older prompt is not replayed
ok(/var ANSWER_REV = "r4-"/.test(src) && /__answer\/" \+ ANSWER_REV \+ cfg\.id/.test(src), "the answer cache is keyed by the revision of what an answer says");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
