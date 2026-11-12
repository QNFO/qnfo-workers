// Demo of FORECAST-ENGINE-1 on a real snapshot. Stage 1 (default) prints the plan and the prompts as JSON;
// stage 2 (--answers <file>) reads the two models' raw replies and prints the gated forecasts.
// node q08-prediction-markets/forecast-demo/run.mjs [--answers answers.json]
import { readFileSync } from "node:fs";
import { plan, buildPrompt, MODELS, parseShift, combine, pct } from "../forecast-engine.mjs";
const snap = JSON.parse(readFileSync(new URL("./snapshot-2026-11-12.json", import.meta.url), "utf8"));
const now = Date.parse(snap.now), today = snap.now.slice(0, 10);
const pl = plan(snap.markets, snap.signals, {}, now);
const i = process.argv.indexOf("--answers");
if (i < 0) {
  console.log(JSON.stringify({ candidates: pl.candidates, consequential: pl.consequential, skipped: pl.skipped, models: MODELS,
    chosen: pl.chosen.map((q) => ({ slug: q.slug, title: q.title, quoted: q.quoted, prior: +q.prior.toFixed(4), incoherent: q.incoherent, trigger: q.trigger, evidence: q.evidence.map((e) => e.id + " " + e.title), prompt: buildPrompt(q, q.evidence, today) })) }, null, 2));
} else {
  const answers = JSON.parse(readFileSync(process.argv[i + 1], "utf8"));
  const out = pl.chosen.map((q) => {
    const a = answers[q.slug] || [];
    const verdicts = a.map((x) => ({ model: x.model, ...parseShift(x.text, q.evidence.map((e) => e.id)) }));
    const c = combine(q.prior, verdicts);
    const tokens = a.reduce((s, x) => s + (x.in_tok || 0) + (x.out_tok || 0), 0);
    return { title: q.title, quoted: pct(q.quoted), prior: pct(q.prior), engine: pct(c.p), moved_pts: Math.round(100 * (c.p - q.prior)), why: c.why, verdicts, tokens };
  });
  console.log(JSON.stringify(out, null, 2));
}
