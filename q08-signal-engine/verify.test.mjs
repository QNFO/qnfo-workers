// Q08-VERIFY-1 offline suite (q08-signal-engine 0.10.0): the accuracy layer. A piece is published only when every name, year and
// figure in it is in the source material and two reviewers from other model families find no unsupported claim; a reviewer outage
// fails closed; a published piece that fails the same test is retracted in public (410 notice, gone from index, feed, sitemap,
// APIs, queued social rows; forecasts built on it too). The flagged 2026-10-10 piece (invented "trial stamps", patent-medicine and
// rating-agency history) is the regression case. Run: node q08-signal-engine/verify.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const w = mod.default, V = mod.__verify;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

// ---- the directives no longer ask for facts from memory ----------------------------------------------------------------------
check("the essay directive forbids facts from memory and has no historical-precedent requirement", /Your own memory is NOT a source/.test(V.Q08_DIRECTIVE) && !/drawn from real, verifiable history/.test(V.Q08_DIRECTIVE) && !/HISTORY RHYMES/.test(V.Q08_DIRECTIVE) && !/guild\W?s forged marks/.test(V.Q08_DIRECTIVE) && /fact-checked/.test(V.Q08_DIRECTIVE));
check("the forecast directive forbids borrowed cases", /Your memory is not a source/.test(V.FORECAST_DIRECTIVE) && !/Name a real, well-known case/.test(V.FORECAST_DIRECTIVE));
check("the register exemplar is a style specification with no sample subject", /STYLE SPECIFICATION/.test(V.REGISTER_EXEMPLAR) && !/lender|freight|shipping|guild|197\d|rating/i.test(V.REGISTER_EXEMPLAR));
check("no generative instruction names a stock example noun", !/guild|patent[- ]medicine|goldsmith|lender|hospital|logistics|shipping line|rating agenc|medieval/i.test(V.Q08_DIRECTIVE + V.FORECAST_DIRECTIVE + V.REGISTER_EXEMPLAR));

// ---- deterministic grounding ---------------------------------------------------------------------------------------------------
const source = "An AI model from Anthropic submitted a tip to police about an unsolved murder in Philadelphia. The tip was false, according to detectives, who said they spent 12 hours checking it. Commenters on Hacker News argued that nobody reviews machine-written tips before they reach an investigator.";
const bad = [
  "# A false tip and a trust that cannot be checked", "",
  "An AI model from Anthropic submitted a tip about an unsolved murder in Philadelphia, and detectives spent 12 hours checking it.", "",
  "Medieval goldsmiths in London stamped each piece with a trial stamp, and in 1363 the guild began assaying silver before it left the shop. The stamp was a promise that someone else had looked.", "",
  "In 1906 Dr. Kilmer's Swamp Root sold on the strength of testimonials until the Pure Food and Drug Act forced labels. The Ford Pinto showed the same pattern in 1971, and Dodd-Frank came after the rating agencies failed.", "",
  "worth your time: yes - it names the mechanism."
].join("\n");
const probs = V.groundingProblems(bad, source);
check("invented history is caught: unsupported years", probs.some((p) => /1363/.test(p)) && probs.some((p) => /1906/.test(p)) && probs.some((p) => /1971/.test(p)), probs);
check("invented history is caught: unsupported names", probs.some((p) => /Kilmer/.test(p)) && probs.some((p) => /Pinto/.test(p)) && probs.some((p) => /Dodd/.test(p)) && probs.some((p) => /Pure Food/.test(p)), probs);
check("what the source says is not flagged", !probs.some((p) => /Anthropic|Philadelphia|12\b|Hacker/.test(p)), probs);
const good = "# A false tip nobody reviewed\n\nAn AI model from Anthropic submitted a tip to police about an unsolved murder in Philadelphia. Detectives said they spent 12 hours checking a tip that was false. Suppose a hospital accepted machine-written referrals the same way: the first person to read one would be the one acting on it.\n\nworth your time: yes - mechanism.";
check("a source-grounded piece with a labelled hypothetical has no problems", V.groundingProblems(good, source).length === 0, V.groundingProblems(good, source));
check("an invented figure is caught", V.groundingProblems("The tip cost detectives 40 hours and $3,000.", source).length >= 2);
check("small counts are allowed, large unsupported ones are not", V.groundingProblems("There are two ways this fails, and 9 steps between them.", source).length === 0 && V.groundingProblems("There are 300 steps between them.", source).length === 1);
check("future years and probabilities are allowed in a forecast, not in an essay", V.groundingProblems("The standard lands by 2027 at 60 percent within 90 days.", source, { forecast: true, today: "2026-10-10" }).length === 0 && V.groundingProblems("The standard lands by 2027 at 60 percent.", source, { today: "2026-10-10" }).length >= 1);
check("a sentence-initial common word is not a name", V.groundingProblems("Detectives said so. Nobody reviews them. Commenters argued it.", source).length === 0);

// ---- fact-check verdicts -------------------------------------------------------------------------------------------------------
check("verdict parser: pass, fail, junk", V.parseFactVerdict('{"unsupported":[],"verdict":"pass"}').verdict === "pass" && V.parseFactVerdict('{"unsupported":["x -- not in source"],"verdict":"fail"}').unsupported.length === 1 && V.parseFactVerdict("no json") === null && V.parseFactVerdict('{"verdict":"maybe"}') === null);
check("a pass that lists unsupported claims is a fail; a fail with none still fails with a reason", V.parseFactVerdict('{"unsupported":["a"],"verdict":"pass"}').verdict === "fail" && V.parseFactVerdict('{"unsupported":[],"verdict":"fail"}').unsupported.length === 1);

let calls = [];
let script = () => '{"unsupported":[],"verdict":"pass"}';
const AI = { run: async (model, input) => { const c = input.messages[0].content; calls.push({ model, c }); if (/strict fact-checker/.test(c)) { const r = script(model, c); if (r instanceof Error) throw r; return { response: r }; } return { response: "" }; } };
const env0 = { AI, DB: null, AUDIT: null };
{
  calls = [];
  const r = await V.verifyPiece(env0, bad, source, "@cf/openai/gpt-oss-120b", "s1", {});
  check("a grounding failure never reaches the model reviewers", !r.ok && r.stage === "grounding" && calls.length === 0, r);
}
{
  calls = []; script = () => '{"unsupported":[],"verdict":"pass"}';
  const r = await V.verifyPiece(env0, good, source, "@cf/openai/gpt-oss-120b", "s2", {});
  const fams = new Set(calls.map((c) => mod.__quality.familyOf(c.model)));
  check("two reviewers from two families, neither the writer's, both pass", r.ok && calls.length === 2 && fams.size === 2 && !fams.has(mod.__quality.familyOf("@cf/openai/gpt-oss-120b")), { ok: r.ok, n: calls.length, fams: [...fams] });
  check("the reviewers see the source material and the draft but not the verdict line", calls.every((c) => /SOURCE MATERIAL/.test(c.c) && /A false tip nobody reviewed/.test(c.c) && !/worth your time/.test(c.c)));
}
{
  let n = 0;
  script = () => (n++ === 0 ? '{"unsupported":["Dodd-Frank came after -- not in source"],"verdict":"fail"}' : '{"unsupported":[],"verdict":"pass"}');
  const r = await V.factCheck(env0, good, source, "@cf/openai/gpt-oss-120b", "s3");
  check("one failing reviewer fails the piece and its claim is reported", !r.ok && r.unsupported.length === 1 && r.judges.length === 2, r);
}
{
  script = () => new Error("model down"); calls = [];
  const r = await V.verifyPiece(env0, good, source, "@cf/openai/gpt-oss-120b", "s4", {});
  check("a reviewer outage fails closed and is marked unavailable", !r.ok && r.unavailable === true && /unavailable/.test(r.problems[0]), r);
  script = (m) => /nvidia|gpt-oss/.test(m) ? new Error("down") : '{"unsupported":[],"verdict":"pass"}';
  const r3 = await V.verifyPiece(env0, good, source, "@cf/zzz/writer", "s5", {});
  check("one reviewer down is replaced by the next family, not waved through", r3.unavailable === true || r3.ok === true && r3.judges.length === 2, r3);
}

// ---- retraction and audit over in-memory SQLite -------------------------------------------------------------------------------
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, signal_id TEXT, slug TEXT UNIQUE, title TEXT, body_md TEXT, core_concept TEXT, signal_source TEXT, published_at TEXT, sources_json TEXT, reads INTEGER DEFAULT 0, feedback_score REAL, kind TEXT DEFAULT 'analysis');
CREATE TABLE engine_runs (id INTEGER PRIMARY KEY, status TEXT, error TEXT, ran_at TEXT DEFAULT (datetime('now')), piece_published INTEGER DEFAULT 0);
CREATE TABLE signal_log (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, title TEXT, url TEXT, points INTEGER, num_comments INTEGER, ratio REAL, volatility_score REAL, friction_point TEXT, signal_strength TEXT, status TEXT, processed_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE prompt_pool (id TEXT PRIMARY KEY, piece_id TEXT, structure_md TEXT, active INTEGER DEFAULT 1, performance_score REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER NOT NULL DEFAULT 0, crawler INTEGER NOT NULL DEFAULT 0);
CREATE TABLE q08_feedback (id INTEGER PRIMARY KEY, slug TEXT, signal TEXT, ip_key TEXT, note TEXT, created_at TEXT);
CREATE TABLE subscribers (email TEXT, status TEXT, token TEXT, created_at TEXT, confirmed_at TEXT);
CREATE TABLE q08_forecasts (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_id TEXT, slug TEXT UNIQUE, source_slug TEXT, claim TEXT, probability REAL, horizon TEXT, resolution TEXT, watch_query TEXT, watch_urls TEXT, alternatives_json TEXT, indicators_json TEXT, evidence_json TEXT, created_at TEXT, status TEXT, outcome TEXT, brier REAL, checks INTEGER DEFAULT 0, last_check_at TEXT, resolved_at TEXT, disposition TEXT);`);
const now = new Date().toISOString();
const ins = (slug, title, body, sig, kind) => db.prepare("INSERT INTO published_pieces (id, signal_id, slug, title, body_md, core_concept, signal_source, published_at, kind) VALUES (?,?,?,?,?,?,?,?,?)").run("p-" + slug, sig, slug, title, body, "c", "hn:1", now, kind || "analysis");
db.prepare("INSERT INTO signal_log (id, source, source_id, title, url, friction_point, status, processed_at) VALUES ('sigA','hn','hn:1','AI model submits false tip',NULL,?, 'published', ?)").run(source, now);
db.prepare("INSERT INTO signal_log (id, source, source_id, title, url, friction_point, status, processed_at) VALUES ('sigB','hn','hn:2','Another',NULL,?, 'published', ?)").run(source, now);
ins("bad-essay", "A false tip and a trust that cannot be checked", bad.replace(/^# .*\n/, ""), "sigA");
ins("good-essay", "A false tip nobody reviewed", good.replace(/^# .*\n/, ""), "sigB");
ins("bad-child", "Forecast built on the bad essay", "Detectives will review machine tips. Forecast text that states the claim at 60 percent.", "sigA", "forecast");
db.prepare("INSERT INTO q08_forecasts (piece_id, slug, source_slug, claim, probability, horizon, resolution, created_at, status) VALUES ('p-bad-child','bad-child','bad-essay','c',0.6,'2027-03-01','r',?, 'open')").run(now);
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
const suppressed = [];
const audit = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, first: async () => null, run: async () => { if (/UPDATE social_threads SET status = 'suppressed'/.test(sql)) suppressed.push(a[0]); return { meta: { changes: 1 } }; }, all: async () => ({ results: [] }) }; return st; } };
const env = { DB: shim, AUDIT: audit, AI };
const origFetch = globalThis.fetch; globalThis.fetch = async () => new Response("{}", { status: 200 });
script = () => '{"unsupported":[],"verdict":"pass"}';
{
  script = () => new Error("reviewers down");
  const r = await V.auditPublished(env, 5);
  check("with the reviewers down the audit defers: nothing is retracted or marked passed", r.ok && r.deferred >= 1 && db.prepare("SELECT COUNT(*) n FROM q08_retractions").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM q08_audits").get().n === 0 || (r.retracted === 1 && db.prepare("SELECT COUNT(*) n FROM q08_audits WHERE slug='bad-essay'").get().n === 1), r);
}
db.exec("DELETE FROM q08_retractions; DELETE FROM q08_audits; UPDATE q08_forecasts SET status='open', disposition=NULL;");
script = () => '{"unsupported":[],"verdict":"pass"}';
const r1 = await V.auditPublished(env, 10);
check("the audit retracts the piece with invented history (grounding stage) and passes the sourced one", r1.retracted >= 1 && db.prepare("SELECT verdict FROM q08_audits WHERE slug='bad-essay'").get().verdict === "fail" && db.prepare("SELECT verdict FROM q08_audits WHERE slug='good-essay'").get().verdict === "pass", r1);
check("a forecast built on a retracted essay is retracted and voided with it", db.prepare("SELECT COUNT(*) n FROM q08_retractions WHERE slug='bad-child'").get().n === 1 && db.prepare("SELECT status, disposition FROM q08_forecasts WHERE slug='bad-child'").get().status === "void", db.prepare("SELECT * FROM q08_retractions").all());
check("queued social rows for a retracted piece are suppressed", suppressed.length >= 1 && suppressed.some((p) => /bad-essay/.test(p)), suppressed);
const ctx = { waitUntil() {} };
const get = (path) => w.fetch(new Request("https://q08.org" + path, { headers: { "user-agent": "Mozilla/5.0 Safari" } }), env, ctx);
{
  const pg = await get("/p/bad-essay"), t = await pg.text();
  check("a retracted piece answers 410 with a public notice, not its text", pg.status === 410 && /Retracted: A false tip and a trust/.test(t) && /retractions/.test(t) && !/Kilmer/.test(t) && /noindex/.test(t), t.slice(0, 300));
  const ok = await get("/p/good-essay");
  check("a verified piece is still served", ok.status === 200 && /A false tip nobody reviewed/.test(await ok.text()));
  check("citation files are not served for a retracted piece", (await get("/p/bad-essay.bib")).status === 404);
  const idx = await (await get("/")).text(), feed = await (await get("/feed.xml")).text(), sm = await (await get("/sitemap.xml")).text(), api = await (await get("/api/pieces")).text();
  check("a retracted piece is gone from the index, feed, sitemap and API", !/bad-essay/.test(idx + feed + sm + api) && /good-essay/.test(idx + sm + api), { idx: /bad-essay/.test(idx), feed: /bad-essay/.test(feed), sm: /bad-essay/.test(sm), api: /bad-essay/.test(api) });
  const rp = await (await get("/retractions")).text(), ra = await (await get("/api/retractions")).json();
  check("the retractions page and API list it", /bad-essay/.test(rp) && ra.retractions.some((x) => x.slug === "bad-essay"), ra);
  const fapi = await (await get("/api/forecasts")).json();
  check("the forecast ledger omits the retracted forecast", !fapi.forecasts.some((f) => f.slug === "bad-child"), fapi.forecasts.length);
}
{
  const again = await V.auditPublished(env, 10);
  check("an audited piece is not audited again", again.checked === 0, again);
}
{
  // Q08-AI-OBJECT-REPLY-1: Workers AI hands back `response` as a parsed object when a model replies with bare JSON.
  const objEnv = { AI: { run: async () => ({ response: { unsupported: [], verdict: "pass" } }) } };
  const fc = await V.factCheck(objEnv, "# T\nSome essay text.", "Some source text.", "@cf/openai/gpt-oss-120b", "s");
  check("an object-shaped AI reply still yields a verdict", fc.unavailable === false && fc.ok === true && fc.judges.length === 2, fc);
}
globalThis.fetch = origFetch;
// ---- Q08-PRUNE-1: delete the sentences the reviewers quote ----------------------------------------------------------------------
{
  const essay = "# A rule that checks itself\n\nThe committee reviewed the draft. It found 3 gaps in the register. Many programs assume the register is complete.\n\nThe fix is to add a second reader. A second reader catches what the first misses.\n\nworth your time: yes - names the mechanism";
  const r = V.pruneUnsupported(essay, ["unsupported claim: Many programs assume the register is complete. -- not in source", "figure not in the source: 3"]);
  check("prune removes the quoted sentence and the sentence with the ungrounded figure", r.removed.length === 2 && !/Many programs/.test(r.text) && !/3 gaps/.test(r.text), r);
  check("prune keeps the title, the other sentences and the verdict line", /^# A rule that checks itself/.test(r.text) && /second reader catches/.test(r.text) && /worth your time: yes/.test(r.text), r.text);
  check("prune with nothing locatable changes nothing", V.pruneUnsupported(essay, ["unsupported claim: something that is not there at all in the draft -- x"]).removed.length === 0);
}
// ---- FACTCHECK-NOTHINK-1 / VERDICT-TOLERANT-1 ------------------------------------------------------------------------------------
{
  const fx = V.factCheckExtra;
  check("reasoning is switched off for kimi, nemotron, gpt-oss and deepseek, and left alone for others", fx("@cf/moonshotai/kimi-k2.6").chat_template_kwargs.thinking === false && fx("@cf/nvidia/nemotron-3-120b-a12b").chat_template_kwargs.enable_thinking === false && fx("@cf/openai/gpt-oss-120b").reasoning.effort === "low" && fx("@cf/deepseek-ai/deepseek-v4-pro-0813").chat_template_kwargs.thinking === false && Object.keys(fx("@cf/zai-org/glm-5.3")).length === 0);
  check("a verdict wrapped in prose is read", V.parseFactVerdict('Here is my answer: {"unsupported": ["x -- y"], "verdict": "fail"} Hope this helps {done}').verdict === "fail");
  check("a truncated JSON reply still yields its explicit verdict and quotes", (() => { const r = V.parseFactVerdict('{"unsupported": ["the claim -- not in source", "another -- no"], "verdict": "fail"'); return r && r.verdict === "fail" && r.unsupported.length === 2; })());
  check("a reply with no verdict field is still no verdict", V.parseFactVerdict("The draft looks fine to me.") === null);
}
// ---- SINGLE-LETTER-1 -------------------------------------------------------------------------------------------------------------
{
  const src = "The method scales with the input size and is described by its worst-case bound.";
  const g = (txt) => V.groundingProblems(txt, src, { today: "2026-10-12" });
  check("Big-O notation is not a name (O(1), O(N), O(n^2))", ["The O(1) lookup helps.", "Complexity is O(N) in the worst case.", "An O(n^2) loop is slow."].every((s) => g(s).length === 0), ["The O(1) lookup helps.", "Complexity is O(N) in the worst case.", "An O(n^2) loop is slow."].map(g));
  check("an invented multi-letter name still fails", g("The idea came from Zorblax Quimby in the lab.").some((x) => /Zorblax|Quimby/.test(x)));
}
// ---- Q08-PRUNE-FLOOR-1: a pruned draft under 2800 characters is kept, not handed to a model revision (runs 328-332) ---------------
{
  const para = (i) => "The operator in case " + ["one", "two", "three", "four", "five", "six"][i] + " watched the queue grow while the dashboard stayed green, because the dashboard measured the database and not the disk beneath it. Each hour the gap between what was measured and what was felt widened, and nobody owned the space between the two numbers.";
  const bad = "Every vendor now sells a sealed appliance that hides this queue from its buyers, and the whole industry has quietly agreed to it.";
  const essay = "# The queue nobody measured\n\n" + [0, 1, 2, 3, 4, 5].map((i) => para(i) + (i === 2 ? " " + bad : "")).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
  const ground = essay.replace(bad, "");
  let calls = 0;
  const env = { AI: { run: async () => { calls++; return calls <= 2 ? { response: JSON.stringify({ unsupported: [bad + " -- not in source"], verdict: "fail" }) } : { response: '{"unsupported": [], "verdict": "pass"}' }; } } };
  const g0 = V.prunedGateProblems(essay.replace(bad, ""), []);
  check("the pruned draft is under the 2800-character writing floor but clears the prune floor", essay.replace(" " + bad, "").length < 2800 && essay.replace(" " + bad, "").length >= V.PRUNE_FLOOR && g0.length === 0, { len: essay.replace(" " + bad, "").length, g0 });
  check("a draft under the prune floor is still refused", V.prunedGateProblems("# The queue nobody measured\n\nShort.", []).some((p) => /too short after pruning/.test(p)));
  const r = await V.verifyAndRevise(env, { piece: { text: essay, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground, seedText: "s", forecast: false });
  check("the short pruned draft is verified and published without a model revision", r.ok === true && !r.piece.text.includes("sealed appliance") && r.pruned === 1 && calls === 4, { ok: r.ok, problems: r.problems, calls });
  check("five prune rounds", V.PRUNE_ROUNDS === 5);
  let n2 = 0;
  const envNever = { AI: { run: async () => { n2++; return { response: JSON.stringify({ unsupported: ["nothing that occurs in the draft at all here -- x"], verdict: "fail" }) }; } } };
  const r2 = await V.verifyAndRevise(envNever, { piece: { text: essay, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground, seedText: "s", forecast: false });
  check("a failed repair names its trail in the run error", r2.ok === false && r2.problems.some((p) => /^repair trail: r1 prune located nothing/.test(p)), r2.problems);
  // Q08-FACT-REVISION-FORMAT-1 (0.14.7, run 349): a fact revision that lost its title keeps the draft's title instead of failing the gate
  let rv = 0, revised = false;
  const longEssay = "# The queue nobody measured\n\n" + [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4].map((i) => para(i)).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
  const body = longEssay.replace(/^# .*\n\n/, "").replace(/\n\nworth your time:.*$/, "");
  const envRev = { AI: { run: async (m, a2) => {
    const pr = (a2.messages || []).map((x) => x.content).join("\n") + (a2.prompt || "");
    if (/FACT REVISION/.test(pr)) { revised = true; return { response: body + "\n\nworth your time: yes - names the mechanism" }; }
    rv++; return revised ? { response: '{"unsupported": [], "verdict": "pass"}' } : { response: JSON.stringify({ unsupported: ["nothing that occurs in the draft at all here -- x"], verdict: "fail" }) };
  } } };
  const r3 = await V.verifyAndRevise(envRev, { piece: { text: longEssay, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground: longEssay, seedText: "s", forecast: false });
  check("a fact revision without a title keeps the draft's title and publishes", revised && r3.ok === true && /^# The queue nobody measured/.test(r3.piece.text), { ok: r3.ok, problems: r3.problems, revised });
  // Q08-REVISION-FLOOR-1 (0.15.1, run 356): a revision under 2800 characters but above the prune floor is accepted
  let revised2 = false;
  const midEssay = "# The queue nobody measured\n\n" + [0, 1, 2, 3, 4, 5].map((i) => para(i)).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
  const midBody = midEssay.replace(/^# .*\n\n/, "").replace(/\n\nworth your time:.*$/, "");
  const envMid = { AI: { run: async (m, a2) => {
    const pr = (a2.messages || []).map((x) => x.content).join("\n") + (a2.prompt || "");
    if (/FACT REVISION/.test(pr)) { revised2 = true; return { response: midBody + "\n\nworth your time: yes - names the mechanism" }; }
    return revised2 ? { response: '{"unsupported": [], "verdict": "pass"}' } : { response: JSON.stringify({ unsupported: ["nothing that occurs in the draft at all here -- x"], verdict: "fail" }) };
  } } };
  const r4 = await V.verifyAndRevise(envMid, { piece: { text: midEssay, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground: midEssay, seedText: "s", forecast: false });
  check("a fact revision between the prune floor and 2800 characters publishes", revised2 && r4.ok === true && midEssay.length < 2800 && midEssay.length >= V.PRUNE_FLOOR, { ok: r4.ok, problems: r4.problems, len: midEssay.length });
}
// ---- Q08-EDIT-FLOOR-1: the editor pass may cut to EDIT_FLOOR; a forecast keeps the writing floor -------------------------------
{
  const para = "The operator watched the queue grow while the dashboard stayed green, because the dashboard measured the database and not the disk beneath it. Nobody owned the space between the two numbers, so nobody looked there.";
  const cut = "# The queue nobody measured\n\n" + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => para).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
  check("an editor cut between EDIT_FLOOR and 2800 chars passes the essay gate", cut.length >= V.EDIT_FLOOR && cut.length < 2800 && V.editGateProblems(cut, [], false).length === 0, { len: cut.length, p: V.editGateProblems(cut, [], false) });
  check("the same length fails the gate for a forecast", V.editGateProblems(cut, [], true).some((p) => /too short/.test(p)));
  check("an editor draft under EDIT_FLOOR is refused", V.editGateProblems("# The queue nobody measured\n\n" + para, [], false).some((p) => /too short after editing/.test(p)));
}
// ---- Q08-FACT-INFERENCE-1: only FACT items fail; INFERENCE items are pruned when the draft can spare them (runs 333-335) ---------
{
  const sp = V.splitFactItems(["FACT: On Oct 7 2026 the repository merged pull request #387 -- date not in source", "INFERENCE: volunteer review capacity is limited -- not in source", "an unlabelled claim -- not in source", "**INFERENCE**: investors saw costs outpace income -- interpretation"]);
  check("labels split: FACT and unlabelled are facts, INFERENCE is not", sp.facts.length === 2 && sp.inferences.length === 2 && /pull request/.test(sp.facts[0]) && /unlabelled/.test(sp.facts[1]) && /volunteer/.test(sp.inferences[0]) && /investors/.test(sp.inferences[1]), sp);
  const onlyInf = V.parseFactVerdict('{"unsupported": ["INFERENCE: volunteer review capacity is limited -- not in source"], "verdict": "fail"}');
  check("a fail that lists only INFERENCE items is a pass with the inference kept for pruning", onlyInf.verdict === "pass" && onlyInf.unsupported.length === 0 && onlyInf.inferences.length === 1, onlyInf);
  const withFact = V.parseFactVerdict('{"unsupported": ["INFERENCE: x is limited -- reasoning", "FACT: the tool shipped in 2019 -- year not in source"], "verdict": "pass"}');
  check("any FACT item makes it a fail, whatever the reviewer's verdict field says", withFact.verdict === "fail" && withFact.unsupported.length === 1 && /2019/.test(withFact.unsupported[0]), withFact);
  const bare = V.parseFactVerdict('{"unsupported": [], "verdict": "fail"}');
  check("a fail naming nothing stays a fail (fail-closed)", bare.verdict === "fail" && /without naming a claim/.test(bare.unsupported[0]), bare);
  check("an unlabelled item from an older-format reply is still a fact", V.parseFactVerdict('{"unsupported": ["the claim -- not in source"], "verdict": "fail"}').verdict === "fail");

  const para = (i) => "The maintainer in case " + ["one", "two", "three", "four", "five", "six", "seven"][i] + " read every patch by hand, because the project accepted contributions from anyone and checked each one before merging it. The queue of patches grew each week while the number of maintainers stayed the same.";
  const inf = "So the volunteers who review the patches simply run out of hours before the queue runs out of patches.";
  const essay = "# The queue that outgrew its reviewers\n\n" + [0, 1, 2, 3, 4, 5, 6].map((i) => para(i) + (i === 3 ? " " + inf : "")).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
  const ground = essay.replace(" " + inf, "");
  let calls = 0;
  const env = { AI: { run: async () => { calls++; return { response: JSON.stringify({ unsupported: ["INFERENCE: " + inf + " -- not stated in source"], verdict: "fail" }) }; } } };
  const r = await V.verifyAndRevise(env, { piece: { text: essay, model: "@cf/nvidia/nemotron-3-120b-a12b" }, prompt: "P", banned: [], ground, seedText: "s", forecast: false });
  check("reviewers flagging only reasoning no longer fail the run; the inference is deleted and no second review is needed", r.ok === true && !r.piece.text.includes("run out of hours") && r.pruned === 1 && calls === 2, { ok: r.ok, problems: r.problems, calls });
  calls = 0;
  const envFact = { AI: { run: async () => { calls++; return { response: JSON.stringify({ unsupported: ["FACT: " + inf + " -- not stated in source"], verdict: "fail" }) }; } } };
  const rf = await V.verifyAndRevise(envFact, { piece: { text: essay, model: "@cf/nvidia/nemotron-3-120b-a12b" }, prompt: "P", banned: [], ground, seedText: "s", forecast: false });
  check("the same sentence labelled FACT still goes through the prune-and-re-verify repair", calls >= 4 && rf.problems.some((p) => /^repair trail: r1 prune -1/.test(p)), { ok: rf.ok, calls, problems: rf.problems.slice(-1) });
  const keep = V.pruneInferences({ text: "# T\n\nShort.\n\nworth your time: yes - x", model: "m" }, { inferences: ["Short. -- reasoning"] }, [], false);
  check("an inference is kept when deleting it would take the draft under the floor", keep.removed === 0 && /Short/.test(keep.piece.text));
}
// ---- Q08-FACT-INFERENCE-2: unlabelled items are classified by the reviewer's stated reason (run 338) ----------------------------
{
  const sp = V.splitFactItems([
    "runs an API, a database and live collaboration on a private server -- inference from source",
    "stores every design and upload under the user's control -- inference from source",
    "The project advertises itself as free -- in source, but the second half is an inference",
    "a single Docker-Compose command -- not in source",
    "released on 4 March 2026 -- date not in source; an inference",
    "the maintainers burned out -- assumption about mechanism",
    "costs fell 40 percent -- generalization with a figure not in source"
  ]);
  check("run 338 items whose reason says inference become INFERENCE", sp.inferences.length === 4 && sp.inferences.some((x) => /private server/.test(x)) && sp.inferences.some((x) => /burned out/.test(x)) && sp.inferences.some((x) => /advertises itself/.test(x)), sp);
  check("'not in source', a date or a figure keeps an unlabelled item a FACT", sp.facts.length === 3 && sp.facts.some((x) => /Docker-Compose/.test(x)) && sp.facts.some((x) => /4 March/.test(x)) && sp.facts.some((x) => /40 percent/.test(x)), sp);
  const v = V.parseFactVerdict(JSON.stringify({ unsupported: ["runs an API on a private server -- inference from source", "the maintainers burned out -- assumption about mechanism"], verdict: "fail" }));
  check("a reviewer that lists only inferences without labels no longer fails the draft", v.verdict === "pass" && v.inferences.length === 2, v);
  check("an item with no reason at all stays a FACT", V.splitFactItems(["a bare quotation with no reason"]).facts.length === 1);
}
// Q08-FACT-OBJECT-ITEM-1 (0.14.3, run 338): an object item is rebuilt as text, never "[object Object]"
{
  check("an object item keeps its label, claim and reason", V.factItemText({ label: "inference", claim: "runs on a private server", reason: "inference from source" }) === "INFERENCE: runs on a private server -- inference from source");
  check("an object item with no claim field is kept as JSON", V.factItemText({ foo: 1 }) === '{"foo":1}');
  const v = V.parseFactVerdict(JSON.stringify({ unsupported: [{ label: "INFERENCE", claim: "so maintainers run out of time", reason: "reasoning" }], verdict: "fail" }));
  check("a reviewer listing only an object INFERENCE passes the draft", v && v.verdict === "pass" && v.inferences.length === 1 && !/object Object/.test(JSON.stringify(v)), v);
  const f = V.parseFactVerdict(JSON.stringify({ unsupported: [{ claim: "shipped on 4 March", reason: "date not in source" }], verdict: "fail" }));
  check("an unlabelled object with a date reason still fails", f && f.verdict === "fail" && /4 March/.test(f.unsupported[0]), f);
}
// Q08-FACT-SHAPE-1 (0.14.3, runs 340-341)
{
  const R = V.claimIsReasoning;
  check("generic reasoning flagged 'not in source' is reasoning", R("the provider faces little measurable pressure to ensure that the coding harness works reliably in typical environments -- not in source"));
  check("an incentive generalisation is reasoning", R("The same incentive structure repeats wherever a supplier judges that maintaining software support for older products is uneconomical. -- not stated in source"));
  check("a claim with a name stays a FACT", !R("Benchmarks can be improved by refinements such as Active Memory and Active Focus -- not in source"));
  check("a claim with a number stays a FACT", !R("the release can cost 40 dollars -- not in source"));
  check("a reason that quotes the source stays a FACT", !R("the exploitation produced fires that would cascade -- source only mentions 'the outbreak of fires' as part of the investigation"));
  check("a reason naming a date stays a FACT", !R("the project could ship later -- date not in source"));
  check("a plain event claim without reasoning words stays a FACT", !R("the development kit is not part of the benchmark suite -- not in source"));
  check("a proper noun mid-claim stays a FACT", !R("customers at Leclerc locations cannot use it -- no mention in source"));
  const v = V.parseFactVerdict(JSON.stringify({ unsupported: ["the provider faces little measurable pressure to fix it -- not in source", "Benchmarks such as Active Memory can be advertised -- not in source"], verdict: "fail" }));
  check("only the named item fails the draft", v.verdict === "fail" && v.unsupported.length === 1 && v.inferences.length === 1, v);
}
// Q08-FACT-SHAPE-2 (0.14.6, runs 347-348)
{
  const sp = V.splitFactItems([
    "FACT: If a prosecutor needs to satisfy that requirement, inserting a dramatic allegation can increase the likelihood that the judge signs the warrant -- not in source",
    "FACT: the same pattern could appear wherever a vendor declares a product unpatchable -- not in source",
    "FACT: officials can improve the apparent strength of their application by adding unsubstantiated facts -- not in source",
    "FACT: the surveillance was directed at the individuals named in the affidavit, Lemon, Fort and Richardson -- not in source",
    "FACT: producer Richardson, a colleague of the host -- 'colleague' not in source"
  ]);
  check("FACT-labelled general reasoning is reasoning", sp.inferences.length === 2, sp);
  check("a FACT-labelled plain modal claim, a named claim and a quoted reason stay FACTs", sp.facts.length === 3, sp);
}
// Q08-PARAPHRASE-1 (0.14.8, run 350)
{
  const sp = V.splitFactItems([
    "the unit generates enough electricity to run laptops, lights and some appliances -- not in source as a direct quote",
    "His apartment faces southwest, an optimal direction for sun collection -- not in source as a direct quote",
    "the kit costs 400 dollars -- not a direct quote; figure not in source",
    "firms sell kits without markups -- not entirely in source"
  ]);
  check("a reason that only objects to the wording is a paraphrase", sp.inferences.length === 2, sp);
  check("a wording complaint that also names a figure, and a partial support, stay FACTs", sp.facts.length === 2, sp);
}
// Q08-PRUNE-FUZZY-1 (0.14.10, run 353)
{
  const txt = "# A title that names the mechanism\n\nThe lab measured expression in every tissue. The article already holds a publishable connection between the genotype, the expression data and the phenotype it reports. Nobody had asked for the third table.\n\nworth your time: yes - x";
  const pr = V.pruneUnsupported(txt, ["unsupported claim: the article already contains a publishable link between genotype, expression, and phenotype -- not in source"]);
  check("a paraphrased item removes the closest sentence", pr.removed.length === 1 && /publishable connection/.test(pr.removed[0]) && /measured expression/.test(pr.text) && /third table/.test(pr.text), pr);
  const pr2 = V.pruneUnsupported(txt, ["unsupported claim: the regulator fined the company twice for missing filings -- not in source"]);
  check("an item that matches nothing removes nothing", pr2.removed.length === 0, pr2);
  const pr3 = V.pruneUnsupported(txt, ["unsupported claim: Nobody had asked for the third table -- not in source"]);
  check("an exact match still removes exactly that sentence", pr3.removed.length === 1 && /third table/.test(pr3.removed[0]), pr3);
}
// Q08-FLOOR-PARAS-1 (0.14.11, run 354)
{
  const para = "The operator watched the queue grow while the dashboard stayed green, because it measured the database and not the disk below it.";
  const five = "# The queue nobody measured\n\n" + [1, 2, 3, 4].map(() => para + " " + para).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
  const g = V.prunedGateProblems(five, []);
  check("a pruned draft with 4 substantial paragraphs passes the prose rule", !g.some((p) => /insufficient prose/.test(p)), g);
  const three = "# The queue nobody measured\n\n" + [1, 2].map(() => para + " " + para).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
  check("2 substantial paragraphs are still refused", V.prunedGateProblems(three, []).some((p) => /insufficient prose/.test(p)));
}
console.log("verify.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
