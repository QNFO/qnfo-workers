// Q08-LEDE-PRUNE-2 + Q08-GROUND-PROVENANCE-1 offline suite (q08-signal-engine 0.27.0, charter pillar: reach).
// Proves: the fact-check ground states the item's title and the site it appeared on as sentences, and the fact-check prompt tells the
// reviewers the source line is source material (engine_runs 415 and 417 of 2026-10-14 flagged "the paper appears on arxiv.org"); a flagged
// lede sentence is cut when another lede sentence remains, a fully flagged lede is still reported, and every pruned draft is re-checked
// with ledeProblems.
// Run: node q08-signal-engine/lede-provenance.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\n//" + Math.random()).toString("base64"));
const G = mod.__ground, V = mod.__verify;

const g = G.labelledGround({ source: "arxiv", title: "Tanchun: Robust Flow-Based HTTP(S) DDoS Detection", url: "https://arxiv.org/abs/2610.01234" }, { friction_point: "We present Tanchun." }, "", "", []);
ok(/SOURCE: .*Title: Tanchun: Robust Flow-Based HTTP\(S\) DDoS Detection\. Link: https:\/\/arxiv\.org\/abs\/2610\.01234 \(site: arxiv\.org\)/.test(g), "the SOURCE header is unchanged", g);
ok(g.includes("The item is titled “Tanchun: Robust Flow-Based HTTP(S) DDoS Detection”. It appeared on arxiv.org, at https://arxiv.org/abs/2610.01234."), "the title and the site are stated as sentences", g);
const noUrl = G.labelledGround({ source: "hn", title: "A title", url: "" }, {}, "", "", []);
ok(noUrl.includes("The item is titled “A title”.") && !/It appeared on/.test(noUrl), "without a link only the title sentence is added", noUrl);
ok(/var FACTCHECK_PROMPT = \[\n  "You are a strict fact-checker[^\n]*\n  "The SOURCE line and the sentence after it \(the item's title, the site it appeared on and its link\) are source material too: a statement that the item is titled so or appeared on that site is supported\.",/.test(src), "the fact-check prompt counts the source line as source material");

const essay = "# Tanchun detects floods\n\nThe paper Tanchun: Robust Flow-Based HTTP(S) DDoS Detection appeared on arxiv.org this week. It was written by a team of five authors.\n\nIts detector reads flow records rather than packets.\n\nworth your time: yes - x";
const r = V.pruneUnsupported(essay, ["unsupported claim: It was written by a team of five authors -- not in source"]);
ok(r.ledeHit === false && r.removed.length === 1 && /appeared on arxiv\.org this week\.\n\nIts detector/.test(r.text), "a flagged lede sentence is cut and the subject sentence stays", r);
const r2 = V.pruneUnsupported("# T\n\nThe paper T appeared on arxiv.org this week.\n\nIts detector reads flow records.\n\nworth your time: yes - x", ["unsupported claim: The paper T appeared on arxiv.org this week -- not in source"]);
ok(r2.ledeHit === true && r2.removed.length === 0, "a lede of one flagged sentence is left whole and reported", r2);
ok(/prunedGateProblems\(pr\.text, a\.banned\)\.concat\(ledeProblems\(pr\.text, a\.src\)\)/.test(src), "every pruned draft is re-checked with ledeProblems");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] >= 27), "VERSION is at least 0.27.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
