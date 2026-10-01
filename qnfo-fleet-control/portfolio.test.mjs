/**
 * portfolio.test.mjs -- offline regression lock for PORTFOLIO-LOOP-1 (docs/PORTFOLIO.md).
 *
 * Slices the PORTFOLIO-LOOP-1 block out of worker.js (same technique as charter.test.mjs), evaluates its pure
 * half in a sandbox and replays portfolio.fixture.json (the QNFO organisation as read on 2026-10-01).
 * Output MUST contain "0 failed" on success; charter-guard.yml greps for exactly that string.
 *
 *   node qnfo-fleet-control/portfolio.test.mjs             # assertions
 *   node qnfo-fleet-control/portfolio.test.mjs --render    # the docs/PORTFOLIO.md live block
 *   node qnfo-fleet-control/portfolio.test.mjs --public    # the QNFO/.github/PORTFOLIO.md mirror
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- PORTFOLIO-LOOP-1:BEGIN";
const END = "// ---- PORTFOLIO-LOOP-1:END ----";
const a = src.indexOf(BEGIN);
const b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) {
  console.error("FAIL portfolio block markers missing from worker.js");
  console.log("1 failed");
  process.exit(1);
}
const sandbox = { timedFetch: null, b64encode: null, charterOne: null, charterRows: null, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, TextDecoder, atob, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b + END.length) + "\n__export = { pfTier, pfHygiene, pfEvaluate, pfRenderDocBlock, pfRenderPublic, pfRenderReadmeBlock, pfSplice, pfSpliceOrBootstrap, PF_BEGIN, PF_END, PF_README_ANCHOR, PF_TIER_ORDER, pfWbsHint, pfTopicsFor, pfDescriptionFromReadme, pfHygienePlan, PF_HYGIENE_MAX };", sandbox, { filename: "portfolio-block.js" });
const P = sandbox.__export;
const fx = JSON.parse(readFileSync(join(here, "portfolio.fixture.json"), "utf8"));
const NOW = "2026-10-01T12:00:00.000Z";

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (actual === expected) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
function ok(c, label) { eq(!!c, true, label); }

// --- tiers -----------------------------------------------------------------
eq(P.pfTier({ name: "qnfo-workers" }), "platform", "qnfo-workers is platform");
eq(P.pfTier({ name: ".github" }), "governance", ".github is governance");
eq(P.pfTier({ name: "deepchat" }), "client-config", "deepchat is client-config");
eq(P.pfTier({ name: "qwav-demo-bt-qec" }), "demo", "qwav-demo-* is demo");
eq(P.pfTier({ name: "qwav-demos" }), "demo", "qwav-demos is demo");
eq(P.pfTier({ name: "ultrametric-physics" }), "research", "a program repo is research");
eq(P.pfTier({ name: "qnfo-workers", archived: true }), "archived", "archived overrides everything");
eq(P.pfTier({ name: "mcp", fork: true }), "fork", "fork overrides research");
eq(P.pfTier({ name: "mcp", fork: true, archived: true }), "archived", "archived overrides fork");

// --- hygiene ---------------------------------------------------------------
const nowMs = Date.parse(NOW);
eq(P.pfHygiene({ name: "x", description: "d", license: "MIT", topics: ["a"], pushed_at: "2026-09-30T00:00:00Z" }, "research", nowMs).length, 0, "complete repo has no flags");
eq(P.pfHygiene({ name: "x", description: "", license: null, topics: [], pushed_at: "2026-05-01T00:00:00Z" }, "research", nowMs).join(","), "no-description,no-license,no-topics,dormant-153d", "every flag fires");
eq(P.pfHygiene({ name: "x", description: "", license: null, topics: [] }, "archived", nowMs).length, 0, "archived repos are not graded");
eq(P.pfHygiene({ name: ".github", description: "d", license: "NOASSERTION", topics: ["a"], pushed_at: NOW }, "governance", nowMs).length, 0, "a custom licence counts for governance");

// --- evaluate on the live fixture --------------------------------------------
const ev = P.pfEvaluate(fx.repos, fx.wbs, NOW);
eq(ev.total, fx.repos.length, "every repository classified");
eq(ev.total, 127, "fixture holds the 2026-10-01 organisation (116 search + 11 forks)");
ok(ev.tiers.archived >= 70, "most of the organisation is archived");
eq(ev.tiers.fork, 10, "ten live forks");
eq(ev.tiers.platform, 14, "fourteen platform repositories");
eq(ev.tiers.governance, 3, "three governance repositories");
eq(ev.tiers["client-config"], 3, "three private config repositories");
ok(ev.tiers.demo >= 7, "the qwav-demo family is demo");
ok(ev.private_count >= 7, "private repositories are counted");
const byName = Object.fromEntries(ev.rows.map((r) => [r.name, r]));
eq(byName["ultrametric-physics"].wbs.includes("QNFO.UMP"), true, "WBS program linked through github_repo");
eq(byName["qnfo-research"].wbs.length, 2, "a repo can carry several WBS codes");
eq(byName["deepchat"].visibility, "private", "private flag honoured");
eq(byName["qnfo-workers"].pillar, "core", "platform maps to pillar core");
eq(byName["qwav-demo-bt-qec"].pillar, "reach", "demo maps to pillar reach");
ok(ev.hygiene_score !== null && ev.hygiene_score >= 0 && ev.hygiene_score <= 1, "hygiene score is a ratio");
ok(ev.unlinked_research.includes("reentrant-distinctions"), "a research repo without a WBS code is listed as unlinked");
ok(!ev.unlinked_research.includes("laws-of-form"), "a linked research repo is not listed as unlinked");
ok(ev.rows.every((r) => P.PF_TIER_ORDER.includes(r.tier)), "every tier is a known tier");
ok(ev.rows.findIndex((r) => r.tier === "archived") > ev.rows.findIndex((r) => r.tier === "research"), "rows ordered platform..archived");
const ev0 = P.pfEvaluate([], [], NOW);
eq(ev0.total, 0, "empty organisation evaluates without throwing");
eq(ev0.hygiene_score, null, "empty organisation has no hygiene score");

// --- renders never name a private repository ---------------------------------
const doc = P.pfRenderDocBlock(ev);
const pub = P.pfRenderPublic(ev);
const rd = P.pfRenderReadmeBlock(ev);
const privNames = ev.rows.filter((r) => r.visibility === "private").map((r) => r.name);
for (const txt of [doc, pub, rd]) {
  ok(privNames.every((n) => !txt.includes("/" + n + ")") && !txt.includes("[" + n + "]")), "no private repository is named in a render");
}
ok(doc.startsWith(P.PF_BEGIN) && doc.endsWith(P.PF_END), "doc block wrapped in markers");
ok(rd.startsWith(P.PF_BEGIN) && rd.endsWith(P.PF_END), "readme block wrapped in markers");
ok(pub.startsWith("# QNFO portfolio (public mirror)"), "public mirror has its title");
ok(pub.includes("docs/QUNIVERSE-CHARTER.md") && pub.includes("papers.qnfo.org") && pub.includes("/portfolio`"), "public mirror links charter, papers and the live endpoint");
ok(doc.includes("[ultrametric-physics](https://github.com/QNFO/ultrametric-physics)"), "research table links the repo");
ok(doc.includes("### Portfolio actions"), "actions section rendered");
ok(doc.length < 60000 && pub.length < 60000, "renders bounded");

// --- splice and bootstrap -------------------------------------------------------
const readme = "# QNFO\n\nintro\n\n## Research Portfolio\n\ntable\n";
const boot = P.pfSpliceOrBootstrap(readme, rd);
ok(boot !== null && boot.indexOf(P.PF_BEGIN) < boot.indexOf("## Research Portfolio"), "bootstrap inserts the block above the anchor");
eq(P.pfSpliceOrBootstrap(boot, rd), boot, "second pass is idempotent");
const rd2 = rd.replace(ev.ts.slice(0, 10), "2026-10-02");
const again = P.pfSpliceOrBootstrap(boot, rd2);
ok(again.includes("2026-10-02") && again.split(P.PF_BEGIN).length === 2, "later pass replaces in place, no duplicate markers");
eq(P.pfSpliceOrBootstrap("no anchor here", rd), null, "no markers and no anchor refuses");
eq(P.pfSplice("plain", doc), null, "splice refuses a doc without markers");

if (process.argv.includes("--render")) console.log(doc);
if (process.argv.includes("--public")) console.log(pub);

// --- PORTFOLIO-HYGIENE-1 ---------------------------------------------------
eq(P.pfHygiene({ name: "QWAV", description: "d", license: "NOASSERTION", topics: ["a"], pushed_at: NOW }, "research", nowMs).length, 0, "a NOASSERTION licence file (the QNFO-ULA) counts as licensed on every tier");
eq(P.pfWbsHint("QNFO.UMP.004: QEC-Darwinism tradeoff").join(","), "QNFO.UMP.004", "a WBS code in the description is a hint");
eq(P.pfWbsHint("QNFO Research Artifacts").length, 0, "the bare imprint name is not a code");
eq(P.pfWbsHint("codes QNFO.ADL.001 and QNFO.ADL.001 and QWAV.DEM").join(","), "QNFO.ADL.001,QWAV.DEM", "codes are deduped");
eq(P.pfDescriptionFromReadme("# Title\n\n![badge](x)\n\nThis repository holds the **Adelic** [theory](u) of things.\n\nMore."), "This repository holds the Adelic theory of things.", "first real paragraph, markdown stripped");
eq(P.pfDescriptionFromReadme("# Only a title\n\n- a list\n- only"), null, "no paragraph means no description");
eq(P.pfDescriptionFromReadme("---\ntitle: x\n---\n\nFront matter is skipped before the paragraph."), "Front matter is skipped before the paragraph.", "front matter is skipped");
ok(P.pfDescriptionFromReadme("word ".repeat(80) + "end").length <= 244, "long paragraphs are cut at a word with an ellipsis");
const wbsAll = fx.wbs.concat([
  { wbs_code: "QWAV", level: "portfolio", slug: "qwav", name: "QWAV", status: "active", github_repo: null },
  { wbs_code: "QNFO.QEC.001", level: "project", slug: "qec-darwinism-ultrametric", name: "x", status: "active", github_repo: null },
  { wbs_code: "QNFO.TST", level: "program", slug: "Test Program", name: "t", status: "active", github_repo: null }
]);
eq(P.pfTopicsFor({ tier: "research", wbs: ["QNFO.TST.001"], description: "" }, wbsAll).join(","), "qnfo,research,open-research,test-program", "topics = tier baseline + served program slug");
eq(P.pfTopicsFor({ tier: "demo", wbs: [], description: "part of QWAV.DEM" }, wbsAll).join(","), "qnfo,qwav,interactive-demo", "a slug already in the baseline is not repeated");
const evH = P.pfEvaluate(fx.repos, wbsAll, NOW);
const plan = P.pfHygienePlan(evH, wbsAll);
ok(plan.length > 0 && plan.length <= P.PF_HYGIENE_MAX, "the plan is bounded (" + plan.length + " <= " + P.PF_HYGIENE_MAX + ")");
eq(plan[0].action, "wbs-link", "registry links come first");
ok(plan.some((a) => a.repo === "QWAV" && a.action === "wbs-link" && a.code === "QWAV"), "QWAV links by slug");
ok(plan.some((a) => a.repo === "qec-darwinism-ultrametric" && a.action === "wbs-link" && a.code === "QNFO.QEC.001"), "qec-darwinism-ultrametric links by slug");
ok(plan.every((a) => { const r = evH.rows.find((x) => x.name === a.repo); return r && r.visibility === "public" && !r.archived && !r.fork && r.tier !== "client-config"; }), "no action touches a private, archived, fork or client-config repository");
ok(plan.filter((a) => a.action === "license").every((a) => evH.rows.find((x) => x.name === a.repo).license === null), "licence actions only where no LICENSE file exists");
ok(plan.filter((a) => a.action === "topics").every((a) => a.topics.length >= 2 && a.topics.every((t) => /^[a-z0-9][a-z0-9-]{0,49}$/.test(t))), "topic actions carry valid GitHub topics");
const fullPlan = (() => { const ev2 = P.pfEvaluate(fx.repos, wbsAll, NOW); return ev2.rows.filter((r) => r.visibility === "public" && !r.archived && !r.fork && r.tier !== "client-config" && r.flags.some((f) => f.indexOf("dormant") !== 0)).length; })();
ok(fullPlan > P.PF_HYGIENE_MAX, "the fixture has more work than one sync takes (" + fullPlan + " flagged repositories)");
eq(P.pfHygienePlan({ rows: [] }, wbsAll).length, 0, "an empty register plans nothing");
const evA = Object.assign({}, evH, { actions: [{ repo: "x", action: "license", status: "committed", note: "abc" }] });
ok(P.pfRenderDocBlock(evA).includes("Hygiene actions the loop took") && P.pfRenderDocBlock(evA).includes("- x: license committed (abc)"), "actions taken are rendered");
ok(!P.pfRenderDocBlock(evH).includes("Hygiene actions the loop took"), "no actions, no section");

console.log(`portfolio.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
