// Tests for scripts/r2_doc_audit.mjs and scripts/self_audit_pr.mjs (NO-STANDALONE-DOCS-1, SELF-AUDIT-1).
import assert from "node:assert/strict";
import { classify, issueFor, roadmapRow, isDoc } from "./r2_doc_audit.mjs";
import { checkPr } from "./self_audit_pr.mjs";

const docs = [
  { bucket: "qnfo-projects", key: "UNIFIED-ARCHITECTURE.md", size: 8276 },
  { bucket: "qnfo-projects", key: "KAIZEN-RED-TEAM-2026-07-15.md", size: 11687 },
  { bucket: "qnfo-projects", key: "_manifests/qnfo.json", size: 259 },
  { bucket: "qnfo-ddocs", key: "a/b/photo.png", size: 5 },
];
const src = "// reads UNIFIED-ARCHITECTURE.md at boot";
const rows = classify(docs, src, { "KAIZEN-RED-TEAM-2026-07-15.md": "Rule KAIZEN-LOOP-9 applies" });
assert.equal(rows.length, 2, "manifests and non-docs are skipped");
assert.equal(rows.find((r) => r.key === "UNIFIED-ARCHITECTURE.md").orphan, false, "cited by file name");
const k = rows.find((r) => r.key.startsWith("KAIZEN"));
assert.equal(k.orphan, true, "uncited doc is an orphan");
assert.equal(classify(docs, src + " KAIZEN-LOOP-9", { "KAIZEN-RED-TEAM-2026-07-15.md": "KAIZEN-LOOP-9" }).find((r) => r.key.startsWith("KAIZEN")).orphan, false, "cited by rule id");
const iss = issueFor(k);
assert.match(iss.body, /code-task:/); assert.match(iss.body, /code-probe:/);
assert.equal(roadmapRow(k).status, "open"); assert.ok(roadmapRow(k).doer);
assert.equal(isDoc("x/_manifests/y.md"), false);

const good = "## Self-audit\nReal output: GET /health returned version 0.3.1\nNot thinking about: the front end empty state when no orphans exist; fixed in this PR\n";
assert.equal(checkPr({ body: good, files: ["scripts/a.mjs", "docs/a.md"] }).ok, true);
assert.equal(checkPr({ body: "no section", files: ["scripts/a.mjs"] }).ok, false, "missing section fails");
assert.equal(checkPr({ body: good, files: ["docs/a.md"] }).ok, false, "docs-only PR fails");
assert.equal(checkPr({ body: "## Self-audit\nReal output: ok\nNot thinking about: nothing\n", files: ["a.mjs"] }).ok, false, "vague gap fails");
const gen=classify([{bucket:"b",key:"zbw-p5-capstone/paper.md",size:1}],"mentions paper.md somewhere");
assert.equal(gen[0].orphan,true,"generic name alone does not count as implemented");
assert.equal(classify([{bucket:"b",key:"zbw-p5-capstone/paper.md",size:1}],"loads zbw-p5-capstone/paper.md")[0].orphan,false,"full key counts");
assert.equal(checkPr({ body: "## Self-audit\nReal output: ok\nNot thinking about: the empty state of the front end page\n", files: ["a.mjs"] }).ok, false, "gap with no fix or issue fails");
assert.equal(checkPr({ body: "## Self-audit\nReal output: ok\nNot thinking about: empty state of the page, fixed with a default row\n", files: ["a.mjs"] }).ok, true, "natural wording fixed passes");
console.log("r2_doc_audit + self_audit_pr tests passed");

import { parseRetired, groupKey, groupOrphans, groupIssueFor, classify as classifyG } from "./r2_doc_audit.mjs";
import test2 from "node:test";
import assert2 from "node:assert/strict";
test2("groups orphans per bucket and top folder, retire list and index evidence clear orphans", () => {
  const docs = [
    { bucket: "b", key: "a/one.md", size: 1 }, { bucket: "b", key: "a/two.md", size: 2 },
    { bucket: "b", key: "c/three.md", size: 3 }, { bucket: "b", key: "root.md", size: 4 },
  ];
  const rows = classifyG(docs, "", {}, { retired: parseRetired("b/c/\tduplicate of repo copy\nbad line no reason"), indexed: new Set(["root.md"]) });
  const orphans = rows.filter((r) => r.orphan);
  assert2.deepEqual(orphans.map((o) => o.key), ["a/one.md", "a/two.md"]);
  assert2.equal(groupKey(rows[3]), "b/(root)");
  const g = groupOrphans(orphans);
  assert2.equal(g.length, 1);
  const i = groupIssueFor(g[0]);
  assert2.match(i.title, /under b\/a$/);
  assert2.match(i.body, /code-task:/); assert2.match(i.body, /code-probe:/);
  assert2.equal(parseRetired("x/\t").length, 0);
});
// DOC-IS-CODE-1: the retirement registry cites each archived R2 key in a scanned source file, so classify() counts it as dispositioned.
import { readFileSync as _rf } from "node:fs";
const _reg = JSON.parse(_rf(new URL("./r2-doc-dispositions.json", import.meta.url), "utf8")).docs;
assert.ok(_reg.length > 0);
for (const d of _reg) assert.ok(d.reason && d.disposition === "archived", "registry row has a reason: " + d.key);
const _blob = _rf(new URL("./r2-doc-dispositions.json", import.meta.url), "utf8");
assert.equal(classify(_reg.map((d) => ({ bucket: d.bucket, key: d.key })), _blob).filter((r) => r.orphan).length, 0, "registry retires every listed doc");

test2("retired prefix matches only at a path boundary", () => {
  const r = classifyG([{ bucket: "b", key: "docs/retro.md", size: 1 }, { bucket: "b", key: "docs/ret/x.md", size: 1 }], "", {}, { retired: parseRetired("b/docs/ret\treason") });
  assert2.deepEqual(r.map((x) => x.orphan), [true, false]);
});
