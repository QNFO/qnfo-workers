// CAUSAL-SOURCE-1 + SOURCE-SENTENCE-CUT-1 + WORKERS-BP-LOGGING-personal-companion-1 offline suite (personal-companion 1.24.0, charter
// pillar: personal; agent_issues 2222, 2528).
// Proves: the causal score counts stated causes, purposes and effects in the visible share of an article; the primary is the first fitted
// candidate stating at least CAUSAL_MIN, else the fitted one stating most, else the old fallback; every source is cut at a sentence end;
// no empty catch handler is left (the fleet audit's own pattern) and a caught error is logged as one JSON line.
// Run: node personal-companion/causal-source.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

// CAUSAL-SOURCE-1: the score
const causal = "The tariff was raised because farm prices fell. As a result, imports dropped, which led to retaliation. Congress acted in order to protect farmers. Critics argued that it deepened the slump, and the policy was intended to raise revenue. ";
ok(V.causalScore(causal) === 7, "stated causes, purposes and effects are counted (because, as a result, led to, in order to, critics, argued, intended to)", V.causalScore(causal));
ok(V.causalScore("The palace was built in 1802. It has 30 rooms. The king lived there with his family.") === 0, "a descriptive text states none");
ok(V.causalScore("x".repeat(V.CAUSAL_CHARS) + " " + causal.repeat(3)) === 0, "only the visible share counts (CAUSAL_CHARS, what fitAnchors keeps)");
ok(V.CAUSAL_MIN === 6 && V.CAUSAL_CHARS === 6000, "threshold 6 within 6000 characters");
ok(V.causalScore("Because of the strike, wages rose. BECAUSE the board resigned, prices fell.") === 2, "matching ignores case");

// CAUSAL-SOURCE-1: where it sits in the topic choice
const wa = src.slice(src.indexOf("async function wikiAnchors(used, cooled, seed) {"), src.indexOf("async function paperAnchors("));
ok(/var cs = causalScore\(art\.text\); \/\/ CAUSAL-SOURCE-1/.test(wa), "every fitted candidate is scored");
ok(/if \(cs >= CAUSAL_MIN\) primary = art;\s*else if \(cs > fittedCausal\) \{ fitted = art; fittedCausal = cs; \}/.test(wa), "the first candidate stating enough becomes the primary; else the one stating most is kept");
ok(/if \(!primary && fitted\) primary = fitted;\s*if \(!primary && fallback\)/.test(wa), "the fitted fallback comes before the unfitted one, so a run never loses its sources");
ok(/for \(var t = 0; t < titles\.length && !primary && t < 10; t\+\+\)/.test(wa), "at most ten full reads per run (subrequest budget unchanged)");
ok(/diagNote\("causal screen: "/.test(wa), "the run log names the candidates and their scores");

// SOURCE-SENTENCE-CUT-1
const sents = "The club was founded in 1950. It reached the final in 1962. The stadium holds 20,000 people. The town council owns the ground and leases it to the club. Mabel and Lowell hoped to move to the United States after their doctoral work in Sheffield.";
const cut = V.cutAtSentence(sents, sents.indexOf("Sheffield") - 10);
ok(/to the club\.$/.test(cut) && cut.indexOf("Mabel") < 0, "a source is cut at the last sentence end inside its share", cut);
ok(V.cutAtSentence("Short text.", 100) === "Short text.", "a source inside its share is kept whole");
const noEnd = "a".repeat(50) + ". " + "b".repeat(500);
ok(V.cutAtSentence(noEnd, 400) === noEnd.slice(0, 400), "when the last sentence end would keep less than 60% of the share, the share is kept as it was");
ok(V.cutAtSentence('He said "it is over." Then he left the room for good and never came back to it again.', 30) === 'He said "it is over."', "a closing quote after the full stop stays with its sentence");
const fit = V.fitAnchors([{ kind: "concept", ref: "r", title: "T", text: sents.repeat(400) }, { kind: "concept", ref: "r2", title: "U", text: sents.repeat(400) }, { kind: "concept", ref: "r3", title: "W", text: sents.repeat(400) }]);
ok(fit.every((a) => /[.!?]$/.test(a.text) && a.text.length <= 6000), "every fitted source ends on a sentence and stays inside its share", fit.map((a) => a.text.length));

// WORKERS-BP-LOGGING-personal-companion-1
const swallowed = /\.catch\s*\(\s*(?:function\s*\([^)]*\)\s*\{\s*\}|\([^)]*\)\s*=>\s*\{\s*\}|[A-Za-z_$][\w$]*\s*=>\s*\{\s*\})\s*\)|\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
ok((src.match(swallowed) || []).length === 0, "no empty catch handler remains (fleet_best_practices_audit swallowed-catch pattern)", (src.match(swallowed) || []).slice(0, 3));
const logged = [];
const orig = console.error; console.error = (x) => logged.push(x);
V.logCaught("unitTest", new Error("boom"));
console.error = orig;
let rec = null; try { rec = JSON.parse(logged[0]); } catch (e) { rec = null; }
ok(rec && rec.worker === "personal-companion" && rec.where === "unitTest" && rec.error === "boom", "a caught error is one JSON line naming the worker, the function and the message", logged[0]);
ok((src.match(/logCaught\("/g) || []).length >= 35 && (src.slice(src.indexOf("async function aiRunAttr("), src.indexOf("// end aiRunAttr")).match(/where: "aiRunAttr"/g) || []).length === 3, "the handlers call logCaught; aiRunAttr, which its suite loads alone, logs inline", (src.match(/logCaught\("/g) || []).length);

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && ver[1] >= 24)), "VERSION is at least 1.24.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
