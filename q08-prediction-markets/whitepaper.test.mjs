import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAPER_MD, PAPER_HTML, buildPage, embedded, inline, renderMarkdown } from "./whitepaper-build.mjs";
import worker, { CHARTER } from "./worker.js";
const md = readFileSync(PAPER_MD, "utf8"), src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

test("the white paper served by the worker, its HTML copy and its Markdown source are the same document", () => {
  assert.equal(embedded(src), buildPage(md));
  assert.equal(readFileSync(PAPER_HTML, "utf8"), buildPage(md));
  assert.equal(readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8"), src);
});
test("GET /whitepaper serves it", async () => {
  const r = await worker.fetch(new Request("https://x/whitepaper"), {});
  assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /text\/html/);
  const html = await r.text(); assert.match(html, /Where Do LLM Forecasters Have an Edge Over Prediction Markets\?/); assert.match(html, /<h2 id="references">References<\/h2>/);
});
test("every numbered citation in the text has a reference, and every reference is cited", () => {
  const body = md.slice(0, md.indexOf("## References")), refs = md.slice(md.indexOf("## References"));
  const cited = new Set([...body.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))); const listed = new Set([...refs.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1])));
  for (const n of cited) assert.ok(listed.has(n), "citation [" + n + "] has no reference");
  for (const n of listed) if (n !== 11) assert.ok(cited.has(n), "reference " + n + " is never cited"); // 11 is the exchange documentation, cited by the live-trading item
  assert.ok(listed.size >= 10);
});
test("the pre-registered numbers in the paper are the charter's numbers", () => {
  const g = CHARTER.graduation;
  assert.ok(md.includes("at least " + g.min_days + " days of paper trading, " + g.min_resolved_estimates + " resolved forecasts and " + g.min_resolved_trades + " qualifying trades"), "sample sizes");
  assert.ok(md.includes("drawdown under " + g.max_drawdown_pct + " percent")); assert.ok(md.includes(CHARTER.risk.breaker_drawdown_pct + " percent drawdown"));
  assert.ok(md.includes("95 percent bootstrap interval")); assert.equal(g.confidence, 0.95); assert.equal(g.frozen_sample, true);
  const mm = src.match(/var VERSION = "(\d+\.\d+)\./)[1]; assert.ok(md.includes("version " + mm), "the paper names the worker's major.minor version"); assert.ok(md.includes("`q08-prediction-markets` " + mm + " |"));
});
test("every recommendation the paper marks implemented points at something the worker really has", async () => {
  for (const route of ["/api/charter", "/api/track-record", "/whitepaper"]) assert.ok(src.includes('"' + route + '"'), route);
  for (const sym of ["applyRecal", "fitRecal", "fitBlend", "kellyStake", "chainHash", "verifyChain", "byDomain", "tuneActions", "logLoss", "domainOf", "MAX_SPREAD_MKT", "params_version", "pt_estimate_log", "append-only", "probeVerdict", "probeSampled", "eventGap", "basketPayoff"]) assert.ok(src.includes(sym), sym);
  const rows = md.split("\n").filter((l) => /^\| R\d+ /.test(l)); assert.equal(rows.length, 14);
  assert.equal(rows.filter((l) => /Implemented/.test(l)).length, 13); assert.equal(rows.filter((l) => /Filed as issue|not built/.test(l)).length, 1);
});
test("the paper makes no claim it cannot back: no guaranteed profit, no proven edge", () => {
  assert.ok(!/guarantee[ds]? (a )?(profit|return)|risk-free|proven edge|we have an edge|beats the market/i.test(md));
  assert.ok(/no demonstrated general edge/i.test(md)); assert.ok(/What this paper does not claim/.test(md));
});
test("the Markdown renderer escapes markup and renders tables, lists and links", () => {
  assert.equal(inline("a <b>x</b> & **bold** *it* `c` [t](https://e.org/a?b=1&c=2)"), 'a &lt;b&gt;x&lt;/b&gt; &amp; <strong>bold</strong> <em>it</em> <code>c</code> <a href="https://e.org/a?b=1&amp;c=2">t</a>');
  assert.match(renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |"), /<th>a<\/th>[\s\S]*<td>2<\/td>/); assert.match(renderMarkdown("1. x\n2. y"), /<ol><li>x<\/li><li>y<\/li><\/ol>"?/);
  assert.ok(!renderMarkdown("[x](javascript:alert(1))").includes("href"));
});

// PM-REFS-1: a reference with a link is checkable; a figure that reaches the paper through a summary (Kalshi, the Metaculus synthesis) must say so in the text.
test("every reference carries a link, and the paper names the figures that come through secondary summaries", () => {
  const refs = md.split("## References")[1].split("\n").filter((l) => /^\d+\. /.test(l));
  assert.ok(refs.length >= 11);
  for (const r of refs) assert.match(r, /\]\(https?:\/\//, r.slice(0, 60));
  assert.match(md, /CEPR summary/); assert.match(md, /secondary/i);
  const kalshi = md.split("\n").filter((l) => /\[7\]\s*[^,]/.test(l) && !/^7\./.test(l) && !/^\| R\d/.test(l));
  assert.ok(kalshi.length > 0 && kalshi.every((l) => /secondary|summary/i.test(l)), "Kalshi figures must be marked as coming through a summary");
});
