/**
 * reach.test.mjs -- offline regression lock for REACH-IDEATION-1 (pure evaluator only).
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
vm.runInContext(src.slice(a, b + END.length) + "\n__export = { reachIdeasEvaluate, ideaPriority, ideaDescription, IDEA_PREFIX, IDEA_SURFACES, IDEA_CHECKS, IDEA_CONTENT };", sb);
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
eq(mix[0].buildable, true, "buildable ideas sort first");
eq(mix.filter((f) => f.worker === "qnfo-gateway").every((f) => f.buildable === false), true, "gateway ideas are marked not auto-buildable");
eq(/NOT AUTO-BUILDABLE/.test(R.ideaDescription(mix.find((f) => !f.buildable))), true, "description says so");
eq(/qnfo-ipatent\/worker\.js/.test(R.ideaDescription(mix[0])), true, "description names the worker file for the planner");
eq(R.ideaPriority({ surface: "guide-drawings", check: "content", buildable: true, score: 4 }), "high", "buildable content idea for the flagship is high");
eq(R.ideaPriority({ surface: "ipatent-guide", check: "subscribe-box", buildable: true, score: 4 }), "high", "buildable flagship surface idea is high");
eq(R.ideaPriority({ surface: "ideas", check: "canonical", buildable: true, score: 2 }), "medium", "other low-score idea stays medium");
eq(R.ideaPriority({ surface: "qnfo-home", check: "share-image", buildable: false, score: 9 }), "high", "high score stays high");
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
