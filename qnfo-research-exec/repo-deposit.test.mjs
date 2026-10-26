// REPO-DEPOSIT-1 offline suite for repo-deposit.mjs. No network: `deps.fetch` is a fake of the GitHub Git Data API (refs, commits, trees,
// blobs, contents, compare) with fault injection: a concurrent writer, a lost response, 5xx, a corrupt blob.
// Run: node qnfo-research-exec/repo-deposit.test.mjs   -> prints "N passed, 0 failed", exits 1 on any failure.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as RD from "./repo-deposit.mjs";
import { FakeGitHub, blobId } from "./repo-deposit-fake.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const mkDeps = (gh) => ({ fetch: (u, i) => gh.fetch(u, i), sleep: async () => {}, random: () => 0.5 });
const ENV = { GITHUB_TOKEN: "test-token" };
const CONS = RD.TARGET_CONSOLIDATED, LEG = RD.TARGET_LEGACY;

const GROUNDING = "# Grounding\n\nSee [a paper](https://arxiv.org/abs/1004.1483) and doi:10.1000/xyz123.\n";
const SCRIPT = 'print("CLAIM Q1: computed=1 expected=1 match=yes")\n';
const VERIFY_MD = "# Verification report\n\n## Script\n```python\n" + SCRIPT.trimEnd() + "\n```\n\n## Execution output\n```\nCLAIM Q1: computed=1 expected=1 match=yes\n\n[exit 0]\n```\n";
const artifacts = () => [
  { file: "grounding.md", content: GROUNDING }, { file: "writer-a-draft.md", content: "# Draft A\n×≈μ\n" }, { file: "writer-b-draft.md", content: "# Draft B\n" },
  { file: "reconciled-paper.md", content: "# Alpha\n\nBody.\n" }, { file: "review-report.md", content: "# Review\n" },
  { file: "verification.py", content: SCRIPT }, { file: "verification.md", content: VERIFY_MD },
];
const runInput = (over = {}) => Object.assign({
  runId: "5099abb8-1111-2222-3333-444455556666", slug: "alpha-paper", title: "Alpha Paper", pipeline: "0.8.0-artifact-deposit", workerVersion: "0.35.0-test",
  models: { writers: ["@cf/a", "@cf/b"] }, finishedAt: "2026-10-26T06:00:00.000Z", now: "2026-10-26", artifacts: artifacts(),
  paper: { body: "# Alpha Paper\n\n**Version:** 1.0.0\n\nBody.\n", version: "1.0.0", dir: "papers/alpha-paper" },
}, over);

let passed = 0, failed = 0;
const pending = [];
function test(name, fn) { pending.push([name, fn]); }

// ---------------------------------------------------------------------------------------------------- tests
test("gitBlobSha1 is git's object id (what Software Heritage calls swh:1:cnt)", async () => {
  for (const s of ["", "hello\n", "× ≈ μ\n"]) assert.equal(await RD.gitBlobSha1(RD.utf8(s)), blobId(s));
});

test("depositRun writes the run, the paper and its provenance in ONE commit", async () => {
  const gh = new FakeGitHub({ "runs/cycle-396/other-paper/MANIFEST.json": "{}", "README.md": "x" });
  const before = gh.commits.size;
  const r = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.equal(r.status, "ok", JSON.stringify(r));
  assert.equal(r.cycle, "cycle-397");
  assert.equal(r.runPath, "runs/cycle-397/alpha-paper");
  assert.equal(gh.commits.size - before, 1, "one commit");
  assert.equal(gh.commitCount, 1);
  const f = gh.files();
  for (const n of ["grounding.md", "writer-a-draft.md", "writer-b-draft.md", "reconciled-paper.md", "review-report.md", "verification.py", "verification.md", "MANIFEST.json", "ro-crate-metadata.json"]) assert.ok(f["runs/cycle-397/alpha-paper/" + n] !== undefined, n);
  assert.ok(f["papers/alpha-paper/paper.md"] && f["papers/alpha-paper/README.md"] && f["papers/alpha-paper/provenance.json"]);
  assert.match(gh.commits.get(gh.head).message, /Run-Id: 5099abb8-1111-2222-3333-444455556666/);
  assert.equal(r.manifestSha256, sha256(f["runs/cycle-397/alpha-paper/MANIFEST.json"]));
});

test("the v2 manifest hashes every file with real UTF-8 byte counts and names the run", async () => {
  const gh = new FakeGitHub({});
  await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  const f = gh.files(), man = JSON.parse(f["runs/cycle-1/alpha-paper/MANIFEST.json"]);
  assert.equal(man.schema, "qnfo-run-manifest/2");
  assert.equal(man.run.id, "5099abb8-1111-2222-3333-444455556666");
  assert.equal(man.run.worker_version, "0.35.0-test");
  assert.deepEqual(man.models.writers, ["@cf/a", "@cf/b"]);
  assert.equal(man.paper.path, "papers/alpha-paper/paper.md");
  assert.equal(man.paper.sha256, sha256(f["papers/alpha-paper/paper.md"]));
  for (const [fn, meta] of Object.entries(man.files)) {
    const bytes = Buffer.from(f["runs/cycle-1/alpha-paper/" + fn], "utf8");
    assert.equal(meta.sha256, sha256(bytes), fn); assert.equal(meta.bytes, bytes.length, fn);
  }
  assert.ok(man.files["writer-a-draft.md"].bytes > "# Draft A\n×≈μ\n".length, "non-ASCII counts bytes, not characters");
  assert.equal(man.files["MANIFEST.json"], undefined, "a manifest does not list itself");
  assert.equal(man.files["ro-crate-metadata.json"], undefined);
});

test("the crate lists every file with its hash, the sources, the stages and the paper", async () => {
  const gh = new FakeGitHub({});
  await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  const f = gh.files(), crate = JSON.parse(f["runs/cycle-1/alpha-paper/ro-crate-metadata.json"]), g = Object.fromEntries(crate["@graph"].map((e) => [e["@id"], e]));
  assert.equal(g["./"].about["@id"], "https://papers.qnfo.org/papers/alpha-paper");
  assert.equal(g["./"]["qnfo:cycle"], "cycle-1");
  assert.equal(g["./"]["qnfo:depositCommit"], undefined, "a crate cannot name the commit that contains it");
  for (const p of g["./"].hasPart) assert.equal(g[p["@id"]].sha256, sha256(f["runs/cycle-1/alpha-paper/" + p["@id"]]), p["@id"]);
  assert.deepEqual(g["#grounding"].object.map((o) => o["@id"]), ["https://arxiv.org/abs/1004.1483", "https://doi.org/10.1000/xyz123"]);
  assert.equal(g["#verification-original"]["qnfo:exitCode"], 0);
  assert.equal(g["#verification-original"].actionStatus["@id"], "http://schema.org/CompletedActionStatus");
});

test("a recorded crash is a FailedActionStatus with its exit code", async () => {
  const md = VERIFY_MD.replace("[exit 0]", "[stderr]\nTraceback...\nNameError: boom\n\n[exit 1]");
  const crate = await RD.buildCrate({ runPath: "runs/cycle-2/x", cycle: "cycle-2", slug: "x", title: "X", pipeline: "p", deposit: null, listed: {}, files: [{ rel: "verification.py", content: SCRIPT }, { rel: "verification.md", content: md }] });
  const a = crate["@graph"].find((e) => e["@id"] === "#verification-original");
  assert.equal(a["qnfo:exitCode"], 1); assert.equal(a.actionStatus["@id"], "http://schema.org/FailedActionStatus");
});

test("the paper record is created, then appended to: snapshots and events never rewrite", async () => {
  const gh = new FakeGitHub({});
  await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  let rec = JSON.parse(gh.files()["papers/alpha-paper/provenance.json"]);
  assert.equal(rec.schema, "qnfo-paper-provenance/1");
  assert.equal(rec.snapshots.length, 1); assert.equal(rec.snapshots[0].basis, "deposit"); assert.equal(rec.snapshots[0].version, "1.0.0");
  assert.deepEqual(rec.identifiers.research_queue_ids, ["5099abb8-1111-2222-3333-444455556666"]);
  assert.equal(rec.runs[0].path, "runs/cycle-1/alpha-paper"); assert.equal(rec.runs[0].match, "slug-exact");
  const r2 = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput({ runId: "aaaa0000-0000-0000-0000-000000000000", paper: { body: "# Alpha Paper\n\n**Version:** 1.1.0\n\nRevised.\n", version: "1.1.0", dir: "papers/alpha-paper" } }));
  assert.equal(r2.cycle, "cycle-2");
  rec = JSON.parse(gh.files()["papers/alpha-paper/provenance.json"]);
  assert.equal(rec.snapshots.length, 2); assert.equal(rec.snapshots[1].basis, "revision"); assert.equal(rec.snapshots[0].sha256, sha256("# Alpha Paper\n\n**Version:** 1.0.0\n\nBody.\n"));
  assert.equal(rec.runs.length, 2); assert.equal(rec.identifiers.research_queue_ids.length, 2);
  assert.equal(gh.files()["papers/alpha-paper/paper.md"], "# Alpha Paper\n\n**Version:** 1.1.0\n\nRevised.\n");
});

test("an existing README is never overwritten", async () => {
  const gh = new FakeGitHub({ "papers/alpha-paper/README.md": "# Alpha Paper\n\nLicense: CC BY 4.0\nDOI: 10.1000/legacy.9\n" });
  await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.match(gh.files()["papers/alpha-paper/README.md"], /CC BY 4\.0/);
  const rec = JSON.parse(gh.files()["papers/alpha-paper/provenance.json"]);
  assert.equal(rec.declared.license, "CC BY 4.0"); assert.deepEqual(rec.declared.dois, [{ doi: "10.1000/legacy.9", source: "README.md" }]);
});

test("legacy layout: cycle-N/<slug>, no paper files, same atomic guarantees", async () => {
  const gh = new FakeGitHub({ "cycle-9/x/MANIFEST.json": "{}" }, "QNFO/qnfo-ensemble-research");
  const r = await RD.depositRun(ENV, mkDeps(gh), LEG, runInput());
  assert.equal(r.status, "ok", JSON.stringify(r)); assert.equal(r.runPath, "cycle-10/alpha-paper");
  assert.ok(gh.files()["cycle-10/alpha-paper/MANIFEST.json"]);
  assert.ok(!Object.keys(gh.files()).some((p) => p.startsWith("papers/")));
});

test("a concurrent writer wins the race: we retry on the new head and take the next cycle number", async () => {
  const gh = new FakeGitHub({ "runs/cycle-5/old/MANIFEST.json": "{}" });
  gh.fault({ method: "PATCH", match: /git\/refs/, before: (g) => g.foreignCommit({ "runs/cycle-6/theirs/MANIFEST.json": "{}" }), times: 1 });
  const r = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.equal(r.status, "ok", JSON.stringify(r)); assert.equal(r.attempts, 2);
  assert.equal(r.cycle, "cycle-7", "cycle-6 belongs to the other writer");
  const f = gh.files();
  assert.ok(f["runs/cycle-6/theirs/MANIFEST.json"], "their commit survived");
  assert.ok(f["runs/cycle-7/alpha-paper/MANIFEST.json"]);
});

test("a lost response after the ref moved is recognised: success, no second commit", async () => {
  const gh = new FakeGitHub({});
  gh.fault({ method: "PATCH", match: /git\/refs/, lose: true, times: 1 });
  const r = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.equal(r.status, "ok", JSON.stringify(r)); assert.equal(gh.commitCount, 1, "exactly one commit landed");
  assert.deepEqual(Object.keys(gh.files()).filter((p) => p.endsWith("/MANIFEST.json")), ["runs/cycle-1/alpha-paper/MANIFEST.json"]);
});

test("a 5xx while writing blobs is retried", async () => {
  const gh = new FakeGitHub({});
  gh.fault({ method: "POST", match: /git\/blobs/, status: 502, times: 2 });
  const r = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.equal(r.status, "ok", JSON.stringify(r)); assert.ok(r.attempts >= 2);
});

test("a permanent failure reports error and lands nothing (never ok)", async () => {
  const gh = new FakeGitHub({ "a": "1" }), head = gh.head;
  gh.fault({ method: "POST", match: /git\/trees/, status: 500, times: 99 });
  const r = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.equal(r.ok, false); assert.equal(r.status, "error"); assert.match(r.error, /gave up after 5 attempts/);
  assert.equal(gh.head, head, "the branch did not move");
});

test("a non-retryable refusal (403 without Retry-After) fails at once", async () => {
  const gh = new FakeGitHub({});
  gh.fault({ method: "POST", match: /git\/blobs/, status: 403, times: 99 });
  const r = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.equal(r.status, "error"); assert.equal(r.attempts, 1);
});

test("GitHub storing a different object than we sent is detected before the commit", async () => {
  const gh = new FakeGitHub({}), head = gh.head;
  gh.fault({ method: "POST", match: /git\/blobs/, lie: true, times: 1 });
  const r = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.equal(r.status, "error"); assert.match(r.error, /blob integrity/); assert.equal(gh.head, head);
});

test("a landed commit whose manifest cannot be read back is landed-unverified, not ok", async () => {
  const gh = new FakeGitHub({});
  gh.fault({ method: "GET", match: /contents\/runs\/cycle-1\/alpha-paper\/MANIFEST\.json$/, status: 404, times: 9 });
  const r = await RD.depositRun(ENV, mkDeps(gh), CONS, runInput());
  assert.equal(r.status, "landed-unverified"); assert.equal(r.ok, false); assert.ok(r.commit);
});

test("depositPapers: new, unchanged (no commit), revised (snapshot appended), retracted (event)", async () => {
  const gh = new FakeGitHub({}), deps = mkDeps(gh);
  const p = { slug: "beta", dir: "papers/beta", title: "Beta", body: "# Beta\n\n**Version:** 1.0.0\n\nText.\n", version: "1.0.0" };
  let r = await RD.depositPapers(ENV, deps, CONS, [p], { now: "2026-10-26" });
  assert.deepEqual(r.slugs, ["beta"]); assert.equal(gh.commitCount, 1);
  r = await RD.depositPapers(ENV, deps, CONS, [p], { now: "2026-10-27" });
  assert.equal(r.empty, true); assert.equal(gh.commitCount, 1, "unchanged text makes no commit");
  r = await RD.depositPapers(ENV, deps, CONS, [Object.assign({}, p, { body: "# Beta\n\n**Version:** 1.1.0\n\nMore.\n", version: "1.1.0" })], { now: "2026-10-28" });
  assert.equal(gh.commitCount, 2);
  const retracted = "# Retracted: Beta\n\nNotice.\n";
  await RD.depositPapers(ENV, deps, CONS, [Object.assign({}, p, { body: retracted, basis: "retraction", event: { event: "retracted", detail: "5 statements" } })], { now: "2026-10-29" });
  const rec = JSON.parse(gh.files()["papers/beta/provenance.json"]);
  assert.deepEqual(rec.snapshots.map((s) => s.basis), ["deposit", "revision", "retraction"]);
  assert.deepEqual(rec.events.map((e) => e.event), ["retracted"]);
  assert.equal(gh.files()["papers/beta/paper.md"], retracted);
});

test("syncPapers walks the slug list with a cursor, loads only the batch, skips unpublished, and wraps", async () => {
  const gh = new FakeGitHub({}), deps = mkDeps(gh);
  const slugs = ["a", "b", "c", "d", "e"], loaded = [];
  const load = async (batch) => { loaded.push(batch.join("")); return batch.filter((s) => s !== "d").map((s) => ({ slug: s, dir: "papers/" + s, title: s, body: "# " + s + "\n", version: "1.0.0" })); };
  let r = await RD.syncPapers(ENV, deps, CONS, slugs, load, "", 2, "2026-10-26");
  assert.deepEqual(r.changed, ["a", "b"]); assert.equal(r.nextCursor, "b");
  r = await RD.syncPapers(ENV, deps, CONS, slugs, load, r.nextCursor, 2, "2026-10-26");
  assert.deepEqual(r.changed, ["c"], "d is not published"); assert.equal(r.nextCursor, "d");
  r = await RD.syncPapers(ENV, deps, CONS, slugs, load, r.nextCursor, 2, "2026-10-26");
  assert.deepEqual(r.changed, ["e"]); assert.equal(r.nextCursor, "", "wrapped");
  assert.deepEqual(loaded, ["ab", "cd", "e"], "never more than a batch in memory");
  r = await RD.syncPapers(ENV, deps, CONS, slugs, load, "", 5, "2026-10-26");
  assert.equal(r.empty, true); assert.deepEqual(r.changed, [], "everything already in sync: no commit");
  assert.equal(gh.commitCount, 3);
});

test("a failed sync commit does not advance the cursor", async () => {
  const gh = new FakeGitHub({}), deps = mkDeps(gh);
  gh.fault({ method: "POST", match: /git\/trees/, status: 500, times: 99 });
  const r = await RD.syncPapers(ENV, deps, CONS, ["a", "b"], async (b) => b.map((s) => ({ slug: s, dir: "papers/" + s, title: s, body: "# " + s + "\n", version: null })), "", 2, "2026-10-26");
  assert.equal(r.ok, false); assert.equal(r.nextCursor, "");
});

test("a GitHub outage stops at the deadline instead of holding the tick", async () => {
  const gh = new FakeGitHub({});
  let clock = 0;
  const deps = { fetch: (u, i) => gh.fetch(u, i), sleep: async (ms) => { clock += ms + 20000; }, random: () => 0.5, now: () => clock };
  gh.fault({ method: "GET", match: /git\/ref\/heads/, status: 503, times: 99 });
  const r = await RD.depositRun(ENV, deps, CONS, runInput());
  assert.equal(r.status, "error"); assert.match(r.error, /deadline of 45000 ms exceeded/); assert.ok(r.attempts < 5);
});

test("listDirNames returns the sub-directories at the head", async () => {
  const gh = new FakeGitHub({ "papers/a/paper.md": "x", "papers/b/paper.md": "y", "papers/loose.md": "z" });
  assert.deepEqual((await RD.listDirNames(ENV, mkDeps(gh), CONS, "papers")).sort(), ["a", "b"]);
  assert.deepEqual(await RD.listDirNames(ENV, mkDeps(gh), CONS, "nope"), []);
});

// ---- restore
async function restoreFixture() {
  const man = { pipeline: "0.8.0-artifact-deposit", files: {} };
  const files = { "grounding.md": GROUNDING, "writer-a-draft.md": "# A\n", "verification.py": SCRIPT, "verification.md": VERIFY_MD };
  for (const [fn, c] of Object.entries(files)) man.files[fn] = { sha256: sha256(c), bytes: c.length };
  const present = ["grounding.md", "verification.py", "verification.md"].map((fn) => ({ rel: fn, content: files[fn] }));
  const listed = Object.fromEntries(Object.entries(man.files));
  const manText = JSON.stringify(man, null, 2);
  const crate0 = await RD.buildCrate({ runPath: "runs/cycle-3/gamma", cycle: "cycle-3", slug: "gamma", title: "Gamma", pipeline: man.pipeline, deposit: { date: "2026-09-08T10:00:00+01:00", commit: "abc" }, listed, files: present.concat([{ rel: "MANIFEST.json", content: manText }]) });
  const reex = { "@id": "#verification-reexecution", "@type": "CreateAction", name: "Independent re-execution of verification.py", instrument: { "@id": "#cpython-3.13.17" }, object: [{ "@id": "verification.py" }], "qnfo:comparison": "reproduced-exact" };
  crate0["@graph"].push(reex, { "@id": "#cpython-3.13.17", "@type": "SoftwareApplication", name: "CPython", version: "3.13.17" });
  crate0["@graph"].find((e) => e["@id"] === "./").mentions.push({ "@id": "#verification-reexecution" });
  const ledger = { schema: "qnfo-known-gaps/1", as_of: "2026-10-26", gaps: [
    { id: "G1", kind: "manifest-file-missing", path: "runs/cycle-3/gamma", files: ["writer-a-draft.md"], expected_sha256: { "writer-a-draft.md": sha256(files["writer-a-draft.md"]) }, cause: "c", recovery: "restore-from-r2-by-hash", status: "open" },
    { id: "G2", kind: "manifest-file-missing", path: "runs/cycle-4/delta", files: ["grounding.md", "review-report.md"], expected_sha256: { "grounding.md": "a".repeat(64), "review-report.md": "b".repeat(64) }, cause: "c", recovery: "restore-from-r2-by-hash", status: "open" },
    { id: "G3", kind: "paper-text-not-in-repo", path: "papers/epsilon", files: ["papers/epsilon/paper.md"], runs: ["runs/cycle-5/epsilon"], cause: "c", recovery: "restore-from-living-paper", status: "open" },
    { id: "G4", kind: "run-without-manifest", path: "runs/cycle-6/zeta", files: ["grounding.md"], cause: "c", recovery: "none-recorded-only", status: "unrecoverable" },
  ] };
  const repo = { "runs/cycle-3/gamma/MANIFEST.json": manText, "runs/cycle-3/gamma/ro-crate-metadata.json": JSON.stringify(crate0, null, 2) + "\n", "provenance/known-gaps.json": JSON.stringify(ledger, null, 2) + "\n" };
  for (const p of present) repo["runs/cycle-3/gamma/" + p.rel] = p.content;
  return { repo, files };
}

test("restoreFromGaps: a byte-identical copy is restored, the crate regenerated (re-execution kept), the row removed, in one commit", async () => {
  const { repo, files } = await restoreFixture(), gh = new FakeGitHub(repo);
  const asked = [];
  const sources = { runFile: async (slug, fn) => { asked.push(slug + "/" + fn); return slug === "gamma" ? files[fn] : null; }, paper: async (slug) => (slug === "epsilon" ? { title: "Epsilon", body: "# Epsilon\n\n**Version:** 3.0.0\n", version: "3.0.0" } : null) };
  const r = await RD.restoreFromGaps(ENV, mkDeps(gh), CONS, sources, { now: "2026-10-27" });
  assert.equal(r.status, "ok", JSON.stringify(r)); assert.equal(r.restoredFiles, 1); assert.equal(r.restoredPapers, 1); assert.equal(gh.commitCount, 1);
  const f = gh.files();
  assert.equal(f["runs/cycle-3/gamma/writer-a-draft.md"], files["writer-a-draft.md"]);
  const crate = JSON.parse(f["runs/cycle-3/gamma/ro-crate-metadata.json"]), g = Object.fromEntries(crate["@graph"].map((e) => [e["@id"], e]));
  assert.ok(g["./"].hasPart.some((p) => p["@id"] === "writer-a-draft.md"), "restored file is a part");
  assert.equal(g["#missing/writer-a-draft.md"], undefined); assert.equal(g["./"]["qnfo:missingParts"], undefined);
  assert.equal(g["#verification-reexecution"]["qnfo:comparison"], "reproduced-exact", "the independent re-execution survives");
  assert.ok(g["./"].mentions.some((m) => m["@id"] === "#verification-reexecution"));
  assert.equal(g["./"].datePublished, "2026-09-08T10:00:00+01:00");
  const ledger = JSON.parse(f["provenance/known-gaps.json"]);
  assert.deepEqual(ledger.gaps.map((x) => x.id), ["G2", "G4"], "restored rows are removed, others stay");
  assert.equal(ledger.as_of, "2026-10-27");
  const g2 = ledger.gaps[0];
  assert.equal(g2.status, "unrecoverable"); assert.match(g2.unrecoverable["grounding.md"], /no copy in R2/);
  assert.equal(f["papers/epsilon/paper.md"], "# Epsilon\n\n**Version:** 3.0.0\n");
  const rec = JSON.parse(f["papers/epsilon/provenance.json"]);
  assert.equal(rec.snapshots[0].basis, "restore"); assert.deepEqual(rec.events.map((e) => e.event), ["restored"]); assert.equal(rec.runs[0].path, "runs/cycle-5/epsilon");
});

test("restoreFromGaps: a copy whose hash differs from the manifest is refused and recorded, never written", async () => {
  const { repo, files } = await restoreFixture(), gh = new FakeGitHub(repo);
  const sources = { runFile: async (slug, fn) => (slug === "gamma" ? "# a different version\n" : null), paper: async () => null };
  const r = await RD.restoreFromGaps(ENV, mkDeps(gh), CONS, sources, { now: "2026-10-27" });
  assert.equal(r.restoredFiles, 0);
  const f = gh.files();
  assert.equal(f["runs/cycle-3/gamma/writer-a-draft.md"], undefined);
  const row = JSON.parse(f["provenance/known-gaps.json"]).gaps.find((x) => x.id === "G1");
  assert.equal(row.status, "unrecoverable"); assert.match(row.unrecoverable["writer-a-draft.md"], /different version/);
});

test("restoreFromGaps: unrecoverable rows are not asked again and the rows behind them are reached", async () => {
  const { repo } = await restoreFixture(), gh = new FakeGitHub(repo);
  let asked = 0;
  const sources = { runFile: async () => { asked++; return null; }, paper: async () => null };
  await RD.restoreFromGaps(ENV, mkDeps(gh), CONS, sources, { now: "2026-10-27", maxChecks: 1 });
  assert.equal(asked, 1, "the check budget is honoured");
  const first = asked;
  await RD.restoreFromGaps(ENV, mkDeps(gh), CONS, sources, { now: "2026-10-27", maxChecks: 1 });
  await RD.restoreFromGaps(ENV, mkDeps(gh), CONS, sources, { now: "2026-10-27", maxChecks: 1 });
  const ledger = JSON.parse(gh.files()["provenance/known-gaps.json"]);
  assert.ok(ledger.gaps.filter((x) => x.kind === "manifest-file-missing").every((x) => x.status === "unrecoverable"), "all marked after a few ticks");
  const total = asked;
  await RD.restoreFromGaps(ENV, mkDeps(gh), CONS, sources, { now: "2026-10-27", maxChecks: 1 });
  assert.equal(asked, total, "nothing left to ask");
  assert.ok(first <= total);
});

test("restoreFromGaps with no ledger in the repository does nothing", async () => {
  const gh = new FakeGitHub({ "README.md": "x" });
  const r = await RD.restoreFromGaps(ENV, mkDeps(gh), CONS, { runFile: async () => null, paper: async () => null }, {});
  assert.equal(r.ok, true); assert.equal(r.empty, true); assert.equal(gh.commitCount, 0);
});

test("resolveTarget: marker present -> consolidated, absent -> legacy, error -> defer; pinned modes win", async () => {
  const withMarker = new FakeGitHub({ "provenance/IMPORT.json": "{}" }), without = new FakeGitHub({ "README.md": "x" });
  assert.equal(await RD.resolveTarget(ENV, mkDeps(withMarker), "auto"), CONS);
  assert.equal(await RD.resolveTarget(ENV, mkDeps(without), "auto"), LEG);
  const broken = new FakeGitHub({}); broken.fault({ method: "GET", match: /contents/, status: 503, times: 9 });
  assert.equal(await RD.resolveTarget(ENV, mkDeps(broken), "auto"), null, "a transient error defers instead of guessing");
  assert.equal(await RD.resolveTarget(ENV, mkDeps(without), "consolidated"), CONS);
  assert.equal(await RD.resolveTarget(ENV, mkDeps(withMarker), "legacy"), LEG);
});

test("slug sources and declared metadata match the Python tool's rules", () => {
  assert.deepEqual(RD.sourcesOf("arXiv:2401.00001, https://arxiv.org/pdf/hep-th/9901001 and https://doi.org/10.1103/PhysRevA.1.2.").map((s) => s["@id"]),
    ["https://arxiv.org/abs/2401.00001", "https://arxiv.org/abs/hep-th/9901001", "https://doi.org/10.1103/PhysRevA.1.2"]);
  const d = RD.declaredOf("License: CC BY 4.0\nDOI: 10.1000/legacy.123.\n", "# T\n\n**Version:** 2.0.0\n\nsee https://doi.org/10.1000/abc;\n");
  assert.equal(d.version, "2.0.0"); assert.equal(d.license, "CC BY 4.0");
  assert.deepEqual(d.dois.map((x) => x.doi + "|" + x.source), ["10.1000/legacy.123|README.md", "10.1000/abc|paper.md"]);
  assert.equal(RD.roleOf("review-report-0.md"), "review"); assert.equal(RD.roleOf("writer-c/notes.md"), "draft-support");
});

test("parity golden: manifest, crate and paper record are byte-identical to what tools/provenance.py produces", async () => {
  const F = join(HERE, "testdata", "parity"), R = join(F, "repo", "runs", "cycle-7", "parity-paper");
  const names = readdirSync(R).filter((n) => n !== "MANIFEST.json" && n !== "ro-crate-metadata.json");
  const files = names.map((n) => ({ rel: n, content: readFileSync(join(R, n), "utf8") }));
  const body = readFileSync(join(F, "repo", "papers", "parity-paper", "paper.md"), "utf8"), readme = readFileSync(join(F, "repo", "papers", "parity-paper", "README.md"), "utf8");
  const manifest = await RD.buildManifestV2({ files, pipeline: "0.8.0-artifact-deposit", runId: "00000000-parity-run-id", slug: "parity-paper", cycle: "cycle-7", workerVersion: "0.35.0-test", finishedAt: "2026-10-26T05:11:45+01:00", models: { writers: ["@cf/example/writer-a", "@cf/example/writer-b"] }, paper: { version: "2.0.0", body, path: "papers/parity-paper/paper.md" } });
  const manText = RD.dumpJson(manifest);
  assert.equal(manText, readFileSync(join(R, "MANIFEST.json"), "utf8"), "MANIFEST.json");
  const crate = await RD.buildCrate({ runPath: "runs/cycle-7/parity-paper", cycle: "cycle-7", slug: "parity-paper", title: "Parity Paper", pipeline: "0.8.0-artifact-deposit", deposit: { date: "2026-10-26T05:11:45+01:00", commit: null }, listed: manifest.files, files: files.concat([{ rel: "MANIFEST.json", content: manText }]) });
  assert.equal(RD.dumpJson(crate), readFileSync(join(F, "golden", "ro-crate-metadata.json"), "utf8"), "ro-crate-metadata.json");
  const rec = await RD.updatePaperRecord(null, { slug: "parity-paper", paperDir: "papers/parity-paper", body, readme, now: "2026-10-26", basis: "backfill", runs: [{ path: "runs/cycle-7/parity-paper", relation: "produced-by", match: "slug-exact", manifest_sha256: createHash("sha256").update(manText).digest("hex") }] });
  assert.equal(RD.dumpJson(rec), readFileSync(join(F, "golden", "provenance.json"), "utf8"), "provenance.json");
});

// ---- inlined copy in worker.js (enabled by the wiring change)
const WORKER = join(HERE, "worker.js");
const src = readFileSync(WORKER, "utf8");
if (src.includes("REPO-DEPOSIT-BEGIN")) {
  test("worker.js carries an identical copy of repo-deposit.mjs between the markers", () => {
    const mod = readFileSync(join(HERE, "repo-deposit.mjs"), "utf8");
    const body = mod.replace(/\nexport \{([\s\S]*?)\};\s*$/, "\nreturn {$1};\n");
    const a = src.indexOf("// REPO-DEPOSIT-BEGIN"), b = src.indexOf("// REPO-DEPOSIT-END");
    assert.ok(a > 0 && b > a, "markers present");
    const inlined = src.slice(a, b);
    assert.ok(inlined.includes(body), "the module body in worker.js differs from repo-deposit.mjs: re-inline it");
  });
}

for (const [name, fn] of pending) {
  try { await fn(); passed++; } catch (e) { failed++; console.log("FAIL " + name + "\n  " + String(e && e.stack || e).split("\n").slice(0, 6).join("\n  ")); }
}
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
