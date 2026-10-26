// REPO-DEPOSIT-1 wiring suite: the real worker.js functions (pushArtifactsToGitHub, depositToGithub, ciGithubSync, repoSyncTick, collectArtifacts,
// recordRunLedger) against fake GitHub repositories (repo-deposit-fake.mjs), a fake D1 and a fake R2. Offline: global fetch is stubbed.
// Run: node qnfo-research-exec/repo-deposit-wiring.test.mjs   -> prints "N passed, 0 failed", exits 1 on any failure.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as W from "./worker.js";
import { FakeGitHub, FakeHub } from "./repo-deposit-fake.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const realFetch = globalThis.fetch;
let passed = 0, failed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// ---- fakes
class FakeD1 {
  constructor(config = {}) { this.config = config; this.runs = []; this.ledger = new Map(); this.pipelineSlugs = []; this.queueRows = {}; this.byslug = {}; this.failLedger = false; }
  prepare(sql) {
    const self = this;
    const mk = (a) => ({
      run: async () => {
        if (/INSERT INTO research_run_ledger/.test(sql)) {
          if (self.failLedger) throw new Error("D1_ERROR: no such table: research_run_ledger");
          const prev = self.ledger.get(a[0]) || {};
          self.ledger.set(a[0], { run_id: a[0], slug: a[1], repo: a[2], run_path: a[3], cycle: a[4], paper_path: a[5], paper_version: a[6], paper_sha256: a[7], manifest_sha256: a[8], commit_sha: a[9], status: a[10], error: a[11], attempts: (prev.attempts || 0) + 1 });
        } else if (/UPDATE ops_config SET value/.test(sql)) self.config[a[0]] = a[1];
        self.runs.push({ sql, args: a });
        return {};
      },
      first: async () => {
        if (/FROM ops_config WHERE key = /.test(sql)) {
          const key = a.length ? a[0] : /key = '(\w+)'/.exec(sql)[1];
          return key in self.config ? { value: self.config[key] } : null;
        }
        if (/FROM research_run_ledger WHERE slug/.test(sql)) { const hit = [...self.ledger.values()].filter((r) => r.slug === a[0] && (r.status === "ok" || r.status === "landed-unverified") && r.run_path).pop(); return hit || null; }
        if (/FROM research_queue WHERE id/.test(sql)) return self.queueRows[a[0]] || null;
        return null;
      },
      all: async () => {
        if (/SELECT DISTINCT paper_slug/.test(sql)) return { results: self.pipelineSlugs.map((s) => ({ s })) };
        if (/FROM research_run_ledger WHERE status IN/.test(sql)) return { results: [...self.ledger.values()].filter((r) => (r.status === "error" || r.status === "deferred") && r.attempts < 12).slice(0, 2) };
        if (/FROM research_queue WHERE paper_slug/.test(sql)) return { results: self.byslug[a[0]] || [] };
        return { results: [] };
      },
    });
    return Object.assign({ bind: (...a) => mk(a) }, mk([]));
  }
}
class FakeLiving {
  constructor(papers) { this.papers = papers; }
  prepare(sql) { const self = this; return { bind: (...a) => ({
    first: async () => { const p = self.papers.find((x) => x.slug === a[0]); return p || null; },
    all: async () => ({ results: self.papers.filter((p) => a.includes(p.slug) && p.status === "published") }),
  }) }; }
}
const r2 = (files) => ({ get: async (k) => (k in files ? { text: async () => files[k] } : null) });

const GROUNDING = "# Grounding\nSee arXiv:1004.1483.\n";
const R2FILES = (rid) => ({
  ["pipeline/" + rid + "/grounding.md"]: GROUNDING, ["pipeline/" + rid + "/draft-0.md"]: "# A\n", ["pipeline/" + rid + "/draft-1.md"]: "# B\n",
  ["pipeline/" + rid + "/reconciled.md"]: "# Paper\n\nBody.\n", ["pipeline/" + rid + "/review-report-0.md"]: "# first review\n", ["pipeline/" + rid + "/review-report-1.md"]: "# second review\n",
  ["pipeline/" + rid + "/verification.md"]: "# V\n\n## Execution output\n```\nok\n\n[exit 0]\n```\n", ["pipeline/" + rid + "/verification.py"]: "print('ok')\n",
});
function world({ consolidated = true, config = {}, papers = [] } = {}) {
  const cons = new FakeGitHub(consolidated ? { "provenance/IMPORT.json": "{}", "runs/cycle-396/old/MANIFEST.json": "{}", "papers/handwritten/paper.md": "# H\n" } : { "README.md": "x" }, "QNFO/qnfo-research");
  const legacy = new FakeGitHub({ "cycle-9/old/MANIFEST.json": "{}" }, "QNFO/qnfo-ensemble-research");
  const hub = new FakeHub({ "QNFO/qnfo-research": cons, "QNFO/qnfo-ensemble-research": legacy });
  globalThis.fetch = (u, i) => hub.fetch(u, i);
  const rid = "5099abb8-0000-1111-2222-333344445555", d1 = new FakeD1(config);
  const env = { GITHUB_TOKEN: "t", QNFO_AUDIT: d1, LIVING_PAPER: new FakeLiving(papers), MIRROR: r2(R2FILES(rid)) };
  return { cons, legacy, d1, env, rid, row: { id: rid } };
}

test("collectArtifacts: the reconciled paper and both reviews are in the run; the v1 manifest is not", async () => {
  const w = world(), arts = await W.collectArtifacts(w.env, w.rid);
  assert.deepEqual(arts.map((a) => a.file), ["grounding.md", "writer-a-draft.md", "writer-b-draft.md", "reconciled-paper.md", "review-report.md", "review-report-0.md", "verification.md", "verification.py"]);
  assert.equal(arts.find((a) => a.file === "review-report.md").content, "# second review\n");
  assert.ok(!arts.some((a) => a.file === "MANIFEST.json"));
});

test("collectArtifacts: with one review only, review-report.md is it and there is no review-report-0.md", async () => {
  const w = world(), files = R2FILES(w.rid);
  delete files["pipeline/" + w.rid + "/review-report-1.md"];
  w.env.MIRROR = r2(files);
  const arts = await W.collectArtifacts(w.env, w.rid);
  assert.equal(arts.find((a) => a.file === "review-report.md").content, "# first review\n");
  assert.ok(!arts.some((a) => a.file === "review-report-0.md"));
});

test("pushArtifactsToGitHub (consolidated): run + paper in one commit, ledger row ok with the commit", async () => {
  const w = world(), arts = await W.collectArtifacts(w.env, w.rid);
  const r = await W.pushArtifactsToGitHub(w.env, "alpha-paper", arts.map((a) => ({ path: a.file, content: a.content })), { row: w.row, title: "Alpha", body: "# Alpha\n\n**Version:** 2.0.0\n\nBody.\n", version: "2.0.0" });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.repo, "qnfo-research"); assert.equal(r.cycle, "cycle-397");
  assert.equal(w.cons.commitCount, 1); assert.equal(w.legacy.commitCount, 0);
  const f = w.cons.files();
  assert.ok(f["runs/cycle-397/alpha-paper/MANIFEST.json"] && f["runs/cycle-397/alpha-paper/ro-crate-metadata.json"] && f["papers/alpha-paper/provenance.json"]);
  const man = JSON.parse(f["runs/cycle-397/alpha-paper/MANIFEST.json"]);
  assert.equal(man.run.id, w.rid); assert.match(man.run.worker_version, /^0\.35\.0/); assert.ok(man.models.writers.length >= 1);
  const led = w.d1.ledger.get(w.rid);
  assert.equal(led.status, "ok"); assert.equal(led.commit_sha, w.cons.head); assert.equal(led.run_path, "runs/cycle-397/alpha-paper");
  assert.equal(led.paper_sha256, sha256("# Alpha\n\n**Version:** 2.0.0\n\nBody.\n")); assert.equal(led.manifest_sha256, sha256(f["runs/cycle-397/alpha-paper/MANIFEST.json"]));
});

test("pushArtifactsToGitHub (marker absent): the legacy repository, run only, same guarantees", async () => {
  const w = world({ consolidated: false }), arts = await W.collectArtifacts(w.env, w.rid);
  const r = await W.pushArtifactsToGitHub(w.env, "alpha-paper", arts.map((a) => ({ path: a.file, content: a.content })), { row: w.row, title: "Alpha", body: "# Alpha\n", version: "1.0.0" });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.repo, "qnfo-ensemble-research");
  assert.ok(w.legacy.files()["cycle-10/alpha-paper/MANIFEST.json"]);
  assert.equal(w.cons.commitCount, 0, "the research repository is untouched until it carries the marker");
  assert.equal(w.d1.ledger.get(w.rid).repo, "QNFO/qnfo-ensemble-research");
});

test("ops_config research_repo_target pins the repository", async () => {
  const w = world({ config: { research_repo_target: "legacy" } }), arts = await W.collectArtifacts(w.env, w.rid);
  const r = await W.pushArtifactsToGitHub(w.env, "alpha-paper", arts.map((a) => ({ path: a.file, content: a.content })), { row: w.row, title: "Alpha", body: null, version: null });
  assert.equal(r.repo, "qnfo-ensemble-research");
});

test("a deposit that fails is a ledger row with status error (not ok) and the result says so", async () => {
  const w = world(), arts = await W.collectArtifacts(w.env, w.rid);
  w.cons.fault({ method: "POST", match: /git\/trees/, status: 500, times: 99 });
  const r = await W.pushArtifactsToGitHub(w.env, "alpha-paper", arts.map((a) => ({ path: a.file, content: a.content })), { row: w.row, title: "Alpha", body: null, version: null });
  assert.equal(r.ok, false); assert.equal(r.status, "error");
  assert.equal(w.d1.ledger.get(w.rid).status, "error"); assert.match(w.d1.ledger.get(w.rid).error, /gave up|deadline/);
});

test("a ledger insert that throws is logged, never swallowed, and does not fail the deposit", async () => {
  const w = world(), arts = await W.collectArtifacts(w.env, w.rid);
  w.d1.failLedger = true;
  const errs = []; const realErr = console.error; console.error = (m) => errs.push(String(m));
  try {
    const r = await W.pushArtifactsToGitHub(w.env, "alpha-paper", arts.map((a) => ({ path: a.file, content: a.content })), { row: w.row, title: "Alpha", body: null, version: null });
    assert.equal(r.ok, true);
  } finally { console.error = realErr; }
  assert.ok(errs.some((e) => /run-ledger/.test(e) && /no such table/.test(e)), "console.error names the failure");
  assert.ok(w.d1.runs.some((x) => /INSERT INTO cloud_ops_events/.test(x.sql) && x.args.includes("repo-ledger")), "an error event is written");
});

test("depositToGithub: consolidation pending -> skipped; consolidated -> paper + provenance linked to the ledger's run", async () => {
  let w = world({ consolidated: false });
  let r = await W.depositToGithub(w.env, "alpha-paper", "Alpha", "# Alpha\n", "1.0.0");
  assert.equal(r.skipped, "consolidation pending"); assert.equal(w.cons.commitCount, 0);
  w = world();
  w.d1.ledger.set("r0", { run_id: "r0", slug: "alpha-paper", status: "ok", run_path: "runs/cycle-5/alpha-paper", manifest_sha256: "a".repeat(64), attempts: 1 });
  r = await W.depositToGithub(w.env, "alpha-paper", "Alpha", "# Alpha\n\n**Version:** 1.1.0\n", "1.1.0");
  assert.equal(r.ok, true, JSON.stringify(r));
  const rec = JSON.parse(w.cons.files()["papers/alpha-paper/provenance.json"]);
  assert.equal(rec.runs[0].path, "runs/cycle-5/alpha-paper"); assert.equal(rec.runs[0].manifest_sha256, "a".repeat(64));
  const again = await W.depositToGithub(w.env, "alpha-paper", "Alpha", "# Alpha\n\n**Version:** 1.1.0\n", "1.1.0");
  assert.equal(again.empty, true); assert.equal(w.cons.commitCount, 1, "same text: no second commit");
});

test("ciGithubSync (consolidated): a retraction is a commit with a retraction snapshot and event", async () => {
  const w = world();
  await W.depositToGithub(w.env, "beta", "Beta", "# Beta\n\n**Version:** 1.0.0\n\nText.\n", "1.0.0");
  const r = await W.ciGithubSync(w.env, "beta", "# Retracted: Beta\n\n## Retraction Notice\n", "retracted");
  assert.equal(r.ok, true, JSON.stringify(r));
  const rec = JSON.parse(w.cons.files()["papers/beta/provenance.json"]);
  assert.deepEqual(rec.snapshots.map((s) => s.basis), ["deposit", "retraction"]); assert.deepEqual(rec.events.map((e) => e.event), ["retracted"]);
  assert.match(w.cons.files()["papers/beta/paper.md"], /^# Retracted: Beta/);
});

test("repoSyncTick (consolidated): papers published in living-paper are compared with git and committed together; cursor advances; second tick is quiet", async () => {
  const papers = ["a", "b", "c"].map((s) => ({ slug: s, title: s.toUpperCase(), body_md: "# " + s.toUpperCase() + "\n\n**Version:** 1.0.0\n", version: "1.0.0", status: "published" }));
  papers.push({ slug: "handwritten", title: "H", body_md: "# H\n\nrevised\n", version: "2.0.0", status: "published" });
  const w = world({ papers, config: { research_repo_sync_batch: "3", research_repo_sync_cursor: "" } });
  w.d1.pipelineSlugs = ["a", "b", "c"];
  let r = await W.repoSyncTick(w.env);
  assert.equal(r.sync.ok, true, JSON.stringify(r)); assert.deepEqual(r.sync.changed, ["a", "b", "c"]); assert.equal(r.sync.nextCursor, "c");
  assert.equal(w.d1.config.research_repo_sync_cursor, "c"); assert.equal(w.cons.commitCount, 1);
  r = await W.repoSyncTick(w.env);
  assert.deepEqual(r.sync.changed, ["handwritten"], "the repository's own handwritten paper is brought up to date too");
  assert.equal(w.cons.files()["papers/handwritten/paper.md"], "# H\n\nrevised\n"); assert.equal(w.d1.config.research_repo_sync_cursor, "", "wrapped");
  const before = w.cons.commitCount;
  await W.repoSyncTick(w.env); await W.repoSyncTick(w.env);
  assert.equal(w.cons.commitCount, before, "everything in sync: no commits");
});

test("repoSyncTick: research_repo_sync = off and a legacy target do nothing to papers", async () => {
  const papers = [{ slug: "a", title: "A", body_md: "# A\n", version: "1.0.0", status: "published" }];
  let w = world({ papers, config: { research_repo_sync: "off" } }); w.d1.pipelineSlugs = ["a"];
  let r = await W.repoSyncTick(w.env);
  assert.equal(r.sync, undefined); assert.equal(w.cons.commitCount, 0);
  w = world({ consolidated: false, papers }); w.d1.pipelineSlugs = ["a"];
  r = await W.repoSyncTick(w.env);
  assert.equal(r.skipped, "consolidation pending"); assert.equal(w.cons.commitCount, 0);
});

test("repoSyncTick restores a gap from R2 only when the hash matches, and lists the rest as unrecoverable", async () => {
  const w = world(), good = "# A draft\n";
  const ledger = { schema: "qnfo-known-gaps/1", as_of: "2026-10-26", gaps: [{ id: "G1", kind: "manifest-file-missing", path: "runs/cycle-3/gamma", files: ["writer-a-draft.md", "writer-b-draft.md"], expected_sha256: { "writer-a-draft.md": sha256(good), "writer-b-draft.md": "b".repeat(64) }, cause: "c", recovery: "restore-from-r2-by-hash", status: "open" }] };
  const man = { pipeline: "0.8.0-artifact-deposit", files: { "writer-a-draft.md": { sha256: sha256(good) }, "writer-b-draft.md": { sha256: "b".repeat(64) } } };
  w.cons.foreignCommit({ "provenance/known-gaps.json": JSON.stringify(ledger), "runs/cycle-3/gamma/MANIFEST.json": JSON.stringify(man) });
  w.d1.byslug = { gamma: [{ id: "row-gamma" }] };
  w.env.MIRROR = r2({ "pipeline/row-gamma/draft-0.md": good, "pipeline/row-gamma/draft-1.md": "# not what the manifest recorded\n" });
  w.d1.config.research_repo_sync = "off";
  const r = await W.repoSyncTick(w.env);
  assert.equal(r.restore.restoredFiles, 1, JSON.stringify(r));
  const f = w.cons.files();
  assert.equal(f["runs/cycle-3/gamma/writer-a-draft.md"], good); assert.equal(f["runs/cycle-3/gamma/writer-b-draft.md"], undefined);
  const row = JSON.parse(f["provenance/known-gaps.json"]).gaps[0];
  assert.deepEqual(row.files, ["writer-b-draft.md"]); assert.equal(row.status, "unrecoverable");
});

test("repoSyncTick retries a deposit that errored: rebuilt from R2 and living-paper, ledger row becomes ok", async () => {
  const w = world({ papers: [{ slug: "alpha-paper", title: "Alpha", body_md: "# Alpha\n\n**Version:** 1.0.0\n", version: "1.0.0", status: "published" }], config: { research_repo_sync: "off", research_repo_restore: "off" } });
  w.d1.ledger.set(w.rid, { run_id: w.rid, slug: "alpha-paper", status: "error", attempts: 1 });
  w.d1.queueRows[w.rid] = { id: w.rid, paper_slug: "alpha-paper" };
  const r = await W.repoSyncTick(w.env);
  assert.deepEqual(r.retried, [{ slug: "alpha-paper", ok: true, status: "ok" }]);
  assert.equal(w.d1.ledger.get(w.rid).status, "ok"); assert.equal(w.d1.ledger.get(w.rid).attempts, 2);
  assert.ok(w.cons.files()["runs/cycle-397/alpha-paper/MANIFEST.json"]);
});

test("the old failure shapes are gone from worker.js", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  assert.ok(!src.split("\n").filter((l) => !l.startsWith("var VERSION")).some((l) => l.includes("datetime(now)")), "unquoted SQL");
  assert.ok(!/INSERT INTO publication_artifacts/.test(src), "the wrong-shaped ledger");
  assert.ok(!src.includes('"/contents/" + cycle + "/" + slug'), "the per-file contents PUT");
  assert.ok(src.includes("REPO-DEPOSIT-BEGIN") && src.includes("research_run_ledger"));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (e) { failed++; console.log("FAIL " + name + "\n  " + String(e && e.stack || e).split("\n").slice(0, 7).join("\n  ")); }
}
globalThis.fetch = realFetch;
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
