import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import worker from "./worker.js";

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE papers(slug TEXT PRIMARY KEY,title TEXT,abstract TEXT,doi TEXT,version TEXT,created_at TEXT,status TEXT,first_published_at TEXT,last_revised_at TEXT);
  CREATE TABLE paper_version_history(id INTEGER PRIMARY KEY,slug TEXT,version TEXT,title TEXT,abstract TEXT,body_md TEXT,archived_at TEXT,superseded_by TEXT);
  CREATE TABLE paper_category(slug TEXT,category TEXT,secondary TEXT);
  CREATE VIRTUAL TABLE papers_fts USING fts5(title,abstract);
  INSERT INTO papers VALUES('synthetic-history','Synthetic version fixture','Synthetic abstract',NULL,'1.2.0','2026-10-20','published','2026-10-21','2026-10-25');
  INSERT INTO papers VALUES('synthetic-draft','Synthetic unpublished fixture','Synthetic abstract',NULL,'0.1.0','2026-10-25','draft',NULL,NULL);
  INSERT INTO paper_version_history VALUES(1,'synthetic-history','1.0.0','Synthetic earlier title','Earlier abstract','Synthetic earlier body','2026-10-23','1.1.0');
  INSERT INTO paper_version_history VALUES(2,'synthetic-history','1.1.0','Synthetic version fixture','Revised abstract','Synthetic revised body','2026-10-24','1.2.0');
  INSERT INTO paper_version_history VALUES(3,'synthetic-draft','0.0.1','Synthetic unpublished predecessor','Draft abstract','Synthetic draft body','2026-10-24','0.1.0');
`);
const queries = [];
const binding = {
  prepare(sql) {
    queries.push(sql);
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; }
    };
    return statement;
  }
};
const env = { LIVING_PAPER: binding };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("US10 history fixture must not access a network"); };
const request = (slug) => worker.fetch(new Request("https://papers.example.test/api/paper-context/" + slug), env, { waitUntil() {} });
const snapshotRequest = (slug, id, bindings = env) => worker.fetch(
  new Request("https://papers.example.test/papers/" + slug + "/versions/" + id), bindings, { waitUntil() {} }
);
try {
  const beforeChanges = db.prepare("SELECT total_changes() n").get().n;
  const response = await request("synthetic-history");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.versions.map((row) => row.version), ["1.2.0", "1.1.0", "1.0.0"],
    "reader context must include retained same-slug revisions, including an earlier title");
  assert.equal(result.versions.filter((row) => row.current).length, 1);
  assert.equal(result.versions[0].current, true);
  assert.equal(result.versions[0].date, "2026-10-25",
    "the current revision date must not be the original row creation date");
  assert.equal(result.versions[0].date_kind, "revised");
  assert.ok(result.versions.slice(1).every((row) => row.archived === true && !row.current));
  assert.ok(result.versions.slice(1).every((row) => row.date_kind === "archived"),
    "snapshot capture time is not claimed as a publication date");
  assert.deepEqual(result.versions.slice(1).map((row) => row.snapshot_id), [2, 1]);
  assert.equal(result.versions[2].title, "Synthetic earlier title");
  assert.ok(result.versions.every((row) => !("body_md" in row) && !("abstract" in row)),
    "version navigation metadata must not copy snapshot content");
  for (const slug of ["synthetic-draft", "synthetic-missing"]) {
    const before = queries.length;
    assert.equal((await request(slug)).status, 404);
    assert.ok(queries.slice(before).every((sql) => !/paper_version_history/.test(sql)),
      "an unpublished or missing current paper cannot expose its archived metadata");
    assert.equal((await snapshotRequest(slug, 3)).status, 404);
  }
  const snapshot = await snapshotRequest("synthetic-history", 1);
  assert.equal(snapshot.status, 200);
  assert.match(snapshot.headers.get("content-type"), /^text\/plain/);
  assert.equal(snapshot.headers.get("cache-control"), "no-store");
  assert.equal(snapshot.headers.get("x-content-type-options"), "nosniff");
  const snapshotText = await snapshot.text();
  assert.match(snapshotText, /Version: 1\.0\.0/);
  assert.match(snapshotText, /Capture time is not a publication date/);
  assert.match(snapshotText, /Title: Synthetic earlier title/);
  assert.match(snapshotText, /Abstract: Earlier abstract/);
  assert.ok(snapshotText.endsWith("Synthetic earlier body"), "recorded historical body is retained verbatim");
  for (const id of ["0", "-1", "999", "3", "1%20OR%201=1"]) {
    assert.equal((await snapshotRequest("synthetic-history", id)).status, 404,
      "missing, other-slug and invalid snapshot ids cannot disclose history");
  }
  const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const ui = vm.runInNewContext(source.match(/^var LP_PAPER_JS = (".*");.*$/m)[1]);
  const from = ui.indexOf("    var v = d.versions || [];");
  const to = ui.indexOf("    var r = d.related || [];", from);
  assert.ok(from >= 0 && to > from);
  const panel = { innerHTML: "" };
  vm.runInNewContext(ui.slice(from, to), {
    d: result, D: {}, $: (id) => { assert.equal(id, "t-ver"); return panel; },
    esc: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    tx: (value) => String(value)
  });
  assert.match(panel.innerHTML, /href="\/papers\/synthetic-history\/versions\/1"/);
  assert.match(panel.innerHTML, /archived snapshot/);
  assert.match(panel.innerHTML, /Captured 2026-10-23/);
  assert.match(panel.innerHTML, /Revised 2026-10-25/);
  assert.equal(db.prepare("SELECT total_changes() n").get().n, beforeChanges,
    "history navigation and snapshot reads never mutate stored publications");
  db.prepare("UPDATE papers SET status='quarantined' WHERE slug='synthetic-history'").run();
  assert.equal((await snapshotRequest("synthetic-history", 1)).status, 404,
    "a previously read public snapshot becomes inaccessible when current eligibility changes");
  assert.equal((await request("synthetic-history")).status, 404);
  const errors = [];
  const originalError = console.error;
  console.error = (message) => errors.push(JSON.parse(message));
  try {
    const broken = { LIVING_PAPER: { prepare() { throw new Error("synthetic history store unavailable"); } } };
    assert.equal((await snapshotRequest("synthetic-history", 1, broken)).status, 503);
    assert.equal(errors[0].where, "handlePaperSnapshot");
  } finally {
    console.error = originalError;
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM paper_version_history").get().n, 3);
  console.log("US10 actual-handler current/archived version navigation acceptance passed");
} finally {
  globalThis.fetch = originalFetch;
  db.close();
}
