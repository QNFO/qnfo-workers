/**
 * reach.test.mjs -- offline regression lock for REACH-IDEATION-1 and -2 (pure evaluator, discovery, selection, efficacy).
 * Output MUST contain "0 failed"; charter-guard.yml greps for exactly that string.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- REACH-IDEATION-1:BEGIN", END = "// ---- REACH-IDEATION-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) { console.error("FAIL reach block markers missing"); console.log("1 failed"); process.exit(1); }
const sb = { VERSION: "test", console, Date, Math, JSON, Number, String, Object, Array, RegExp, __export: null };
vm.createContext(sb);
vm.runInContext(src.slice(a, b + END.length) + "\n__export = { reachIdeasEvaluate, ideaPriority, ideaDescription, ideaDiscoverSurfaces, ideaSelect, ideaEfficacy, ideaEfficacyMult, IDEA_PREFIX, IDEA_SURFACES, IDEA_CHECKS, IDEA_CONTENT, IDEA_WIP_MAX, IDEA_GAP_MAX, IDEA_MAX_NEW };", sb);
const R = sb.__export;
let passed = 0, failed = 0;
function eq(x, y, l) { if (x === y) { passed++; return; } failed++; console.error(`FAIL ${l}: got ${JSON.stringify(x)}, want ${JSON.stringify(y)}`); }
const full = '<meta name="description" content="A page that describes exactly what it offers to the reader in plenty of words."><link rel="canonical" href="x"><meta property="og:image" content="x"><script type="application/ld+json">{}</script>Rowan Brad Quni-Gudzinas <a href="https://qnfo.org/work-with-me">c</a> <a href="https://ipatent.qnfo.org/example">i</a> <input type="email">';
const keys = (p, c) => R.reachIdeasEvaluate(p, c).map((f) => f.key);
eq(keys([{ surface: "qnfo-home", url: "u", status: 200, ms: 300, html: full }], []).length, 0, "a page passing every check yields no idea");
let ks = keys([{ surface: "qnfo-home", url: "u", status: 200, ms: 300, html: "<html>bare</html>" }], []);
eq(ks.length, R.IDEA_CHECKS.length - 1, "a bare page fails every check except speed");
eq(ks.includes("REACH-IDEA-1: share-image on qnfo-home"), true, "share image idea keyed by check and surface");
eq(keys([{ surface: "ipatent-home", url: "u", status: 200, ms: 300, html: full.replace("ipatent.qnfo.org", "") }], []).length, 0, "flagship surfaces are not asked to link to themselves");
eq(keys([{ surface: "qnfo-home", url: "u", status: 200, ms: 4000, html: full }], [])[0], "REACH-IDEA-1: speed on qnfo-home", "slow page is an idea");
eq(keys([{ surface: "qnfo-home", url: "u", status: 503, ms: 300, html: "" }], []).length, 0, "an unreachable page is not a reach idea");
eq(keys([], [{ key: "guide-drawings", url: "u", status: 404 }])[0], "REACH-IDEA-1: content guide-drawings", "missing catalog page is an idea");
eq(keys([], [{ key: "guide-drawings", url: "u", status: 200 }]).length, 0, "existing catalog page is not");
eq(keys([], [{ key: "guide-drawings", url: "u", status: 0 }]).length, 0, "unmeasured catalog page is not");
const mix = R.reachIdeasEvaluate([{ surface: "qnfo-home", url: "u", status: 200, ms: 300, html: "<html></html>" }, { surface: "ipatent-guide", url: "u", status: 200, ms: 300, html: full.replace("og:image", "x") }], []);
// REACH-IDEATION-2: value first. The first live run (2026-10-02T09:00:45Z) put a score-2 ideas.qnfo.org item ahead of the
// score-9 qnfo.org share image because buildable ideas sorted first; findings now sort by score.
eq(mix[0].score === 9 && mix[0].surface === "qnfo-home" && mix[0].buildable === false, true, "the highest-value idea (score 9, qnfo-home) sorts first even when not auto-buildable");
eq(mix.every((f, i) => i === 0 || mix[i - 1].score >= f.score), true, "findings are in score order");
eq(mix.filter((f) => f.worker === "qnfo-gateway").every((f) => f.buildable === false), true, "gateway ideas are marked not auto-buildable");
eq(/NOT AUTO-BUILDABLE/.test(R.ideaDescription(mix.find((f) => !f.buildable))), true, "description says so");
eq(/qnfo-ipatent\/worker\.js/.test(R.ideaDescription(mix.find((f) => f.buildable))), true, "description names the worker file for the planner");
// Selection: buildable ideas fill free WIP slots, one slot for the best gap, never more than IDEA_MAX_NEW.
const sel = (fs, open, ob, og) => R.ideaSelect(fs, open || {}, ob || 0, og || 0).map((f) => f.key);
const F = (k, s, b) => ({ key: k, score: s, buildable: b });
const pool = [F("g9", 9, false), F("g6", 6, false), F("b4", 4, true), F("b3", 3, true), F("b2", 2, true), F("b1", 1, true)];
eq(JSON.stringify(sel(pool)), JSON.stringify(["g9", "b4", "b3"]), "value first: the top gap plus the best buildable ideas, capped at 3");
eq(JSON.stringify(sel(pool, {}, 0, 1)), JSON.stringify(["b4", "b3", "b2"]), "an open gap issue leaves its slot to buildable ideas");
eq(JSON.stringify(sel(pool, {}, R.IDEA_WIP_MAX, 0)), JSON.stringify(["g9"]), "a full buildable WIP files only the gap");
eq(sel(pool, {}, R.IDEA_WIP_MAX, R.IDEA_GAP_MAX).length, 0, "full WIP files nothing");
eq(JSON.stringify(sel(pool, { b4: 1 }, 3, 1)), JSON.stringify(["b3"]), "already-open titles are skipped and WIP is respected");
// Discovery: owned hosts only, one page per host + first segment, known surfaces skipped, weight follows traffic.
const disc = R.ideaDiscoverSurfaces([
  { entity_id: "fleet.qnfo.org/", pv: 141 }, { entity_id: "qnfo.org/", pv: 59 }, { entity_id: "q08.org/", pv: 18 }, { entity_id: "qnfo.org/about", pv: 17 },
  { entity_id: "reading.q08.org/", pv: 10 }, { entity_id: "ipatent.qnfo.org/pricing/a", pv: 9 }, { entity_id: "papers.qnfo.org/papers/some-slug", pv: 7 },
  { entity_id: "ipatent.qnfo.org/pricing/b", pv: 4 }, { entity_id: "ipatent.qnfo.org/guide/x", pv: 3 }, { entity_id: "papers.qnfo.org/topics/qec", pv: 1 },
  { entity_id: "qnfo.org/<script>", pv: 99 }, { entity_id: "ideas.qnfo.org/", pv: 6 }
], 3);
eq(disc.some((d) => /q08\.org/.test(d.key)), false, "q08 is a separate publication (STRATEGY 2.1) and is never a reach-ideation host");
eq(disc.some((d) => /fleet\.qnfo\.org/.test(d.key)), false, "the operations dashboard is not a reach surface");
eq(disc.some((d) => d.key === "rum:papers.qnfo.org/papers" || d.key === "rum:ipatent.qnfo.org/guide"), false, "templates the fixed surfaces cover are skipped");
eq(JSON.stringify(disc.map((d) => d.key)), JSON.stringify(["rum:qnfo.org/about", "rum:ipatent.qnfo.org/pricing", "rum:papers.qnfo.org/topics"]), "discovery keeps owned, uncovered, one-per-template pages in traffic order");
eq(disc[0].worker, "qnfo-gateway", "a discovered page names its serving worker");
eq(disc[1].url, "https://ipatent.qnfo.org/pricing/a", "the busiest page stands for its template");
eq(disc[0].weight > disc[2].weight, true, "weight follows traffic");
eq(disc[1].flagship, true, "flagship hosts are not asked to link to themselves");
const dprobe = R.reachIdeasEvaluate([{ surface: "rum:ipatent.qnfo.org/pricing", url: "https://ipatent.qnfo.org/pricing/a", status: 200, ms: 100, html: "<html></html>" }], [], disc);
eq(dprobe.length > 0 && dprobe.every((f) => f.buildable && /found by traffic/.test(f.evidence)), true, "a discovered page yields buildable ideas with traffic evidence");
eq(R.reachIdeasEvaluate([{ surface: "rum:q08.org", url: "u", status: 200, ms: 100, html: "<html></html>" }], []).length, 0, "an undeclared surface yields nothing (two-arg call stays compatible)");
// Efficacy: 7-day deltas per check kind; a kind with n >= 3 and no gain is halved, one with a gain is raised.
const eff = R.ideaEfficacy([
  { check_key: "share-image", value_at_close: 90, value_7d: 95 }, { check_key: "share-image", value_at_close: 95, value_7d: 99 }, { check_key: "share-image", value_at_close: 99, value_7d: 104 },
  { check_key: "canonical", value_at_close: 452, value_7d: 452 }, { check_key: "canonical", value_at_close: 452, value_7d: 450 }, { check_key: "canonical", value_at_close: 450, value_7d: 450 },
  { check_key: "speed", value_at_close: 1, value_7d: null }, { check_key: "speed", value_at_close: null, value_7d: 3 }
]);
eq(eff["share-image"].n, 3, "efficacy counts measured outcomes");
eq(eff.speed, undefined, "an outcome without both values is not counted");
eq(R.ideaEfficacyMult(eff["share-image"]), 1.25, "a check that moved its metric is up-weighted");
eq(R.ideaEfficacyMult(eff.canonical), 0.5, "a check that did not move its metric is down-weighted (replaced, not repeated)");
eq(R.ideaEfficacyMult({ n: 2, mean: -5 }), 1, "fewer than 3 outcomes is no evidence");
const bare = [{ surface: "qnfo-home", url: "u", status: 200, ms: 300, html: "<html></html>" }];
const s0 = R.reachIdeasEvaluate(bare, []).find((f) => f.check === "canonical").score;
const s1 = R.reachIdeasEvaluate(bare, [], [], eff).find((f) => f.check === "canonical").score;
eq(s1, s0 / 2, "learned efficacy changes the score");
eq(R.ideaPriority({ surface: "guide-drawings", check: "content", buildable: true, score: 4 }), "high", "buildable content idea for the flagship is high");
eq(R.ideaPriority({ surface: "ipatent-guide", check: "subscribe-box", buildable: true, score: 4 }), "high", "buildable flagship surface idea is high");
eq(R.ideaPriority({ surface: "ideas", check: "canonical", buildable: true, score: 2 }), "medium", "other low-score idea stays medium");
eq(R.ideaPriority({ surface: "qnfo-home", check: "share-image", buildable: false, score: 9 }), "high", "high score stays high");
const ci = R.reachIdeasEvaluate([], [{ key: "guide-drawings", url: "u", status: 404 }])[0];
const dsc = R.ideaDescription(ci);
eq(/^code-task: repo=qnfo-workers path=qnfo-ipatent\/worker\.js$/m.test(dsc), true, "content idea carries an intake code-task line on its own line");
eq(/^code-anchor: if \(\(path === "\/guide"/m.test(dsc), true, "and a verbatim code-anchor line");
eq(/code-task:/.test(R.ideaDescription(R.reachIdeasEvaluate([{ surface: "qnfo-home", url: "u", status: 200, ms: 1, html: "<html></html>" }], [])[0])), false, "surface ideas without a known edit point carry no code-task line");
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
