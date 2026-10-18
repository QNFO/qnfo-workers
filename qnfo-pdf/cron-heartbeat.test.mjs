// CRON-ONLY-HEARTBEAT-1 (1.4.0, agent_issues 2397): scheduled() writes one fleet_heartbeat upsert after the backlog run. worker.js has no
// imports, so a temp .mjs copy is loaded as a module and its real scheduled() runs against fake bindings (no LIVING or BROWSER: the backlog
// run returns early; a LIVING whose prepare throws makes the work throw).
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), "utf8");
const tmp = join(mkdtempSync(join(tmpdir(), "qnfo-pdf-hb-")), "worker.mjs");
writeFileSync(tmp, src);
const worker = (await import(pathToFileURL(tmp).href)).default;
const VERSION = /var VERSION = "([^"]*)"/.exec(src)[1];

function audit(failWrite) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return { bind: (...params) => ({ run: async () => { if (failWrite) throw new Error("d1 down"); calls.push({ sql, params }); return { success: true }; } }) };
    },
  };
}
const quiet = async (fn) => {
  const log = console.log, err = console.error, seen = [];
  console.log = () => {}; console.error = (m) => seen.push(String(m));
  try { return await fn(); } finally { console.log = log; console.error = err; }
};

test("source: upsert is in scheduled() after the work, names the worker and the issue", () => {
  assert.match(src, /CRON-ONLY-HEARTBEAT-1 \(1\.4\.0, agent_issues 2397\)/);
  assert.match(src, /ON CONFLICT\(worker\) DO UPDATE SET version=excluded\.version, ts=excluded\.ts, ok=excluded\.ok"\)\.bind\("qnfo-pdf", VERSION/);
  assert.ok(versionAtLeast(VERSION, "1.4.0"), "VERSION is at least 1.4.0 (VERSION-PIN-TESTS-1): " + VERSION);
});

test("successful run writes one heartbeat (worker, VERSION, ISO ts, ok=1)", async () => {
  const AUDIT = audit(false);
  await quiet(() => worker.scheduled({ cron: "*/10 * * * *" }, { AUDIT }, {}));
  assert.equal(AUDIT.calls.length, 1);
  const [w, v, ts, ok] = AUDIT.calls[0].params;
  assert.equal(w, "qnfo-pdf");
  assert.equal(v, VERSION);
  assert.equal(new Date(ts).toISOString(), ts);
  assert.equal(ok, 1);
  assert.match(AUDIT.calls[0].sql, /INSERT INTO fleet_heartbeat/);
});

test("work that throws writes ok=0 and still throws", async () => {
  const AUDIT = audit(false);
  const LIVING = { prepare() { throw new Error("living down"); } };
  await assert.rejects(quiet(() => worker.scheduled({}, { AUDIT, LIVING, BROWSER: {} }, {})), /living down/);
  assert.equal(AUDIT.calls.length, 1);
  assert.equal(AUDIT.calls[0].params[3], 0);
});

test("a D1 failure on the heartbeat write does not throw out of scheduled()", async () => {
  const AUDIT = audit(true);
  await quiet(() => worker.scheduled({}, { AUDIT }, {}));
  assert.equal(AUDIT.calls.length, 0);
});
