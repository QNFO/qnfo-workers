// ATTENTION-UNMEASURED-1: the migration files one issue that hands the dashboard edit to the code loop.
// It checks the CI headers, that the SQL string literals are balanced, and that the code-anchor line is a verbatim,
// single-occurrence line of qnfo-fleet-dashboard/worker.js (or that the fix already landed).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, "2026-10-27-attention-unmeasured-issue.sql"), "utf8");
const worker = fs.readFileSync(path.join(here, "..", "qnfo-fleet-dashboard", "worker.js"), "utf8");

test("carries the CI migration headers", () => {
  assert.match(sql, /^-- APPLY-BY: ci$/m);
  assert.match(sql, /^-- DB: qnfo-audit$/m);
  assert.match(sql, /^-- Rollback: .+$/m);
  assert.doesNotMatch(sql, /^\s*(DELETE|DROP)\b/im, "an issue insert needs no BACKUP header");
});

test("single quotes in the statement are balanced", () => {
  const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
  const n = (body.match(/'/g) || []).length;
  assert.equal(n % 2, 0);
});

test("inserts one open reach issue with a code-task and a code-anchor", () => {
  assert.equal((sql.match(/INSERT INTO agent_issues/g) || []).length, 1);
  assert.match(sql, /ATTENTION-UNMEASURED-1: the attention scorecard counts unmeasured posts/);
  assert.match(sql, /code-task: repo=qnfo-workers path=qnfo-fleet-dashboard\/worker\.js/);
  assert.match(sql, /'session', 'reach', 'high', 'open'/);
});

test("the code-anchor line occurs exactly once in the dashboard worker, unless the fix landed", () => {
  const m = /code-anchor: (.+?)',\n/.exec(sql);
  assert.ok(m, "code-anchor line present");
  const anchor = m[1];
  const count = worker.split(anchor).length - 1;
  const fixed = worker.includes("function atMeasuredOnly(");
  assert.ok(count === 1 || fixed, "anchor occurs " + count + " times and the fix has " + (fixed ? "" : "not ") + "landed");
});

test("the closing code-probe names text the fix must introduce", () => {
  const m = /code-probe: (\{.+?\})' \|\| char\(10\)/.exec(sql);
  assert.ok(m, "code-probe line present");
  const probe = JSON.parse(m[1]);
  assert.deepEqual(probe.paths, ["qnfo-fleet-dashboard/worker.js"]);
  assert.equal(probe.contains, "function atMeasuredOnly(");
});
