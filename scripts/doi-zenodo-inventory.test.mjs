// DOI-ZENODO-INVENTORY-1 offline suite for scripts/doi-zenodo-inventory.mjs (agent_issues 100587): path classes, line kinds, the scan arithmetic on a synthetic tree,
// mirror handling (a deployed-current copy is skipped only when its worker.js is tracked), retired and owner-source classes, the emitter-candidate list, the markdown report.
// Output MUST contain "0 failed" on success.   node scripts/doi-zenodo-inventory.test.mjs
import { classifyPath, classifyLine, scan, renderMarkdown, retiredDirs, workerDirs, REGISTRY_RE, DOI_RE } from "./doi-zenodo-inventory.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const Z = "zen" + "odo"; // the suite itself must not trip a registry scan of its own text
const R = "10.5281/" + Z + ".123";

// ---- the tokens
ok(REGISTRY_RE.test("a " + Z + " b") && REGISTRY_RE.test("doi.org/10.5281/x.1") && !REGISTRY_RE.test("doi.org/10.1111/phpr.12228"), "the registry token is the word or the 10.5281 prefix");
ok(("see 10.1111/phpr.12228 and " + R).match(DOI_RE).length === 2, "the DOI pattern finds both DOIs of a line");

// ---- path classes
const files = [
  "migrations/2026-10-12-x.sql", "migrations/x.test.mjs", "docs/handoff/a.md", "docs/closeouts/b.md", "docs/CLOSEOUT-2026-10-17.md", "docs/HANDOFF-2026-10-18.md", "audits/a.json", "ops-workspace/c.md",
  "papers/p1/references.bib", "funding/f.md", "docs/PORTFOLIO.md", "docs/QUNIVERSE-CHARTER.md", "docs/other.md",
  "qnfo-a/worker.js", "qnfo-a/deployed-current.worker.js", "qnfo-a/a.test.mjs", "qnfo-a/x.fixture.json",
  "qnfo-old/RETIRED", "qnfo-old/deployed-current.worker.js", "qnfo-old/README.md", "qnfo-fold/FOLDED", "qnfo-fold/worker.js",
  "scripts/s.py", "scripts/t.test.mjs", "README.md", "data/x.json",
];
const retired = retiredDirs(files), ww = workerDirs(files);
ok(retired.has("qnfo-old") && retired.has("qnfo-fold") && !retired.has("qnfo-a"), "RETIRED and FOLDED marker files make a retired directory");
ok(ww.has("qnfo-a") && ww.has("qnfo-fold") && !ww.has("qnfo-old"), "worker directories are the ones that track a worker.js");
const cls = (p) => classifyPath(p, retired, ww);
ok(cls("migrations/2026-10-12-x.sql") === "history-migration" && cls("migrations/x.test.mjs") === "history-migration", "migrations are history");
ok(["docs/handoff/a.md", "docs/closeouts/b.md", "docs/CLOSEOUT-2026-10-17.md", "docs/HANDOFF-2026-10-18.md", "audits/a.json", "ops-workspace/c.md"].every((p) => cls(p) === "history-doc"), "handoffs, closeouts, audits and the ops workspace are history documents");
ok(cls("papers/p1/references.bib") === "owner-source" && cls("funding/f.md") === "owner-source", "papers/ and funding/ are owner-authored sources");
ok(cls("docs/PORTFOLIO.md") === "generated-doc" && cls("docs/QUNIVERSE-CHARTER.md") === "generated-doc", "loop-generated documents are their own class");
ok(cls("qnfo-a/deployed-current.worker.js") === "mirror", "a deployed-current copy of a tracked worker.js is a mirror (skipped)");
ok(cls("qnfo-old/deployed-current.worker.js") === "retired", "a deployed-current copy with no worker.js (a retired worker's provenance) is scanned, as retired");
ok(cls("qnfo-a/worker.js") === "code" && cls("scripts/s.py") === "code" && cls("qnfo-fold/worker.js") === "retired", "workers and scripts are code, a FOLDED worker is retired");
ok(cls("qnfo-a/a.test.mjs") === "test" && cls("qnfo-a/x.fixture.json") === "test" && cls("scripts/t.test.mjs") === "test", "suites and fixtures are tests");
ok(cls("docs/other.md") === "doc" && cls("README.md") === "doc" && cls("data/x.json") === "other", "other markdown is doc, anything else other");

// ---- line kinds
const kind = (line, loc) => classifyLine(line, loc);
ok(kind("// NOZ-DOI-1: " + R + " is dead", "code") === "comment", "a comment line names it: comment");
ok(kind("WHERE doi NOT LIKE '10.5281/%'", "code") === "guard" && kind("return d && d.indexOf(\"10.5281/\") < 0 ? d : null;", "code") === "guard", "a filter on the prefix is a guard");
ok(kind("const x = [\"" + R + "\"];", "code") === "emitter-candidate", "a constant that carries a registry DOI in a worker is an emitter candidate");
ok(kind("const url = \"https://" + Z + ".org/records/1\";", "code") === "emitter-candidate", "a registry URL in a worker is an emitter candidate");
ok(kind("doi: \"" + R + "\"", "test") === "fixture", "a test line is a fixture");
ok(kind("INSERT INTO t VALUES ('" + R + "')", "history-migration") === "record" && kind("note " + Z, "history-doc") === "record", "history is a record");
ok(kind("cites " + R, "owner-source") === "owner-text", "an owner source is owner text");
ok(kind("see " + R, "generated-doc") === "generated", "a generated document is generated");
ok(kind("see " + R, "retired") === "retired" && kind("// see " + R, "retired") === "comment", "a retired directory's code line is retired, its comment a comment");
ok(kind("cite 10.1111/phpr.12228", "code") === "third-party-doi" && kind("no doi here", "code") === "none", "a third-party DOI line and a clean line");
ok(kind("mentions " + Z + " in prose", "doc") === "other", "prose in another document is other");

// ---- the scan
const tree = {
  "migrations/m.sql": "-- retire " + Z + "\nUPDATE t SET doi = NULL WHERE doi LIKE '10.5281/%';\n",
  "qnfo-a/worker.js": "// NOZ-DOI-1 note " + R + "\nconst ok = d.indexOf(\"10.5281/\") < 0;\nconst bad = \"" + R + "\";\nconst cite = \"10.1111/phpr.12228\";\n",
  "qnfo-a/deployed-current.worker.js": "const bad = \"" + R + "\";\n",
  "qnfo-a/a.test.mjs": "const f = \"" + R + "\"; const g = \"10.1038/s41586-020-2649-2\";\n",
  "qnfo-old/RETIRED": "retired\n", "qnfo-old/deployed-current.worker.js": "const old = \"" + R + "\";\n",
  "papers/p/refs.bib": "doi = {" + R + "}\ndoi = {10.1016/j.x.2020.1}\n",
  "docs/other.md": "clean\n", "bin/blob": null,
};
const rep = scan(Object.keys(tree), (p) => (p in tree ? tree[p] : null));
ok(rep.mirror_files === 1 && rep.skipped_files === 1, "one mirror skipped, one unreadable file skipped", rep);
ok(rep.registry.files === 5 && rep.registry.hits === 8, "registry files and hits are counted over the non-mirror files (a DOI under the closed prefix is one hit, not two)", rep.registry);
ok(rep.emitter_candidates.length === 1 && rep.emitter_candidates[0].path === "qnfo-a/worker.js" && rep.emitter_candidates[0].line === 3, "exactly one emitter candidate: the constant in the live worker", rep.emitter_candidates);
ok(rep.by_location.code.registry_hits === 3 && rep.by_location["history-migration"].registry_hits === 2 && rep.by_location.test.registry_hits === 1 && rep.by_location.retired.registry_hits === 1 && rep.by_location["owner-source"].registry_hits === 1, "hits per location class", rep.by_location);
ok(rep.doi.files === 3 && rep.doi.third_party_hits === 3, "third-party DOIs counted separately from the registry prefix", rep.doi);
ok(rep.by_kind.guard === 1 && rep.by_kind.comment === 1 && rep.by_kind["emitter-candidate"] === 1 && rep.by_kind.record === 2 && rep.by_kind.fixture === 1 && rep.by_kind.retired === 1 && rep.by_kind["owner-text"] === 1, "hits per line kind", rep.by_kind);
const md = renderMarkdown(rep, { commit: "abc1234" });
ok(/\| Emitter candidates \(non-comment, non-guard code lines\) \| 1 \|/.test(md) && /qnfo-a\/worker\.js:3/.test(md) && /abc1234/.test(md) && /\| code \| 1 \| 3 \| 1 \|/.test(md), "the markdown report carries the counts, the candidate and the commit", md.slice(0, 600));
const clean = scan(["qnfo-a/worker.js"], () => "const a = 1;\n");
ok(clean.emitter_candidates.length === 0 && /\nnone\n/.test(renderMarkdown(clean)), "a clean tree reports none");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
