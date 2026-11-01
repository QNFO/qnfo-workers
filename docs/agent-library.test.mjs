import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildCatalog, checkCatalog, ENTRYPOINTS, isSystemDocument } from "../scripts/build-agent-catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const catalog = JSON.parse(read("docs/agent-catalog.json"));

test("tracked documentation inventory and library hashes are current", () => {
  assert.deepEqual(checkCatalog(root), []);
  assert.equal(catalog.contract, "FLEET-SHARED-LIBRARY-1");
  assert.deepEqual(catalog.entrypoints, ENTRYPOINTS);
  assert.equal(new Set(catalog.documents.map(({ path }) => path)).size, catalog.documents.length);
  for (const { path, sha256, url } of catalog.documents) {
    assert.ok(existsSync(resolve(root, path)), path);
    assert.equal(url, `https://raw.githubusercontent.com/QNFO/qnfo-workers/main/${path}`);
    if (sha256) assert.equal(createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"), sha256, path);
  }
  assert.ok(catalog.documents.some(({ path, sha256 }) => path === "docs/agent-library/README.md" && sha256));
});

test("all repository agent adapters load the one shared library", () => {
  for (const path of [
    "AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md", ".github/agents/quniverse.agent.md",
  ]) {
    assert.ok(read(path).includes("docs/agent-library/README.md"), path);
  }
  const library = read("docs/agent-library/README.md");
  assert.ok(library.includes(`version **${catalog.library_version}**`));
  assert.match(read("llms.txt"), /docs\/agent-library\/README\.md/);
});

test("new library and directory local Markdown links resolve", () => {
  for (const path of ["docs/agent-library/README.md", "docs/README.md", "docs/INDEX.md"]) {
    const text = read(path);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      assert.ok(existsSync(resolve(root, dirname(path), decodeURIComponent(target))), `${path}: ${target}`);
    }
  }
});

test("inventory includes system and component docs but not research bodies or generated outputs", () => {
  for (const path of ["CLAUDE.md", "llms.txt", "TOKEN-BOOTSTRAP.md", "docs/handoff/closeout.md", ".github/agents/new.agent.md", "qnfo-ai/README.md", "qnfo-ops/docs/RUN-CODE-HARDENING.md", "personal-api/msgraph/README.md", "audits/fleet.md", "research-code/ultrametric-lean/README.md", "machine-readability/README.md"]) {
    assert.equal(isSystemDocument(path), true, path);
  }
  for (const path of ["papers/example/paper.md", "archive/README.md", "funding/proposal.md", ".claude/private.md", "docs/INDEX.md", "docs/agent-catalog.json", "node_modules/pkg/README.md", "qnfo-research-exec/testdata/paper.md", "worker/fixtures/README.md"]) {
    assert.equal(isSystemDocument(path), false, path);
  }
});

test("generation is deterministic, detects drift and refuses absent entry points", () => {
  const fixture = mkdtempSync(resolve(tmpdir(), "qnfo-agent-catalog-"));
  try {
    execFileSync("git", ["init", "--quiet", fixture]);
    assert.throws(() => buildCatalog(fixture), /Missing tracked entry point/);
    for (const path of ENTRYPOINTS) {
      const absolute = resolve(fixture, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, "# Test entry point\n");
      execFileSync("git", ["-C", fixture, "add", "--", path]);
    }
    const first = buildCatalog(fixture);
    assert.deepEqual(first, buildCatalog(fixture));
    for (const [path, text] of first) writeFileSync(resolve(fixture, path), text);
    assert.deepEqual(checkCatalog(fixture), []);
    writeFileSync(resolve(fixture, "docs/agent-library/README.md"), "# Changed library\n");
    assert.deepEqual(checkCatalog(fixture), ["docs/INDEX.md", "docs/agent-catalog.json"]);
    writeFileSync(resolve(fixture, "docs/INDEX.md"), "edited output\n");
    assert.ok(checkCatalog(fixture).includes("docs/INDEX.md"));
  } finally {
    // SUITE-PORT-RM-1: on Windows the fixture's .git objects are read-only, which rmSync cannot delete (EPERM, and
    // force does not chmod). Mark the tree writable first, then remove with bounded retries for indexer/AV timing.
    // The suite is green on Linux either way; both steps are no-ops there in effect.
    const writable = (dir) => { for (const name of readdirSync(dir)) { const p = resolve(dir, name); const st = statSync(p); try { chmodSync(p, st.isDirectory() ? 0o755 : 0o644); } catch { /* a racing reader */ } if (st.isDirectory()) writable(p); } };
    try { writable(fixture); } catch { /* best effort: rmSync retries below still apply */ }
    rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
