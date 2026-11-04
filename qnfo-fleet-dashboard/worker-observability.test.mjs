import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
// D1-OVERLOAD-1d (PR 6935) split the helper in two: workerObservability keeps a 5 minute per-isolate memo (`_wobsMemo`) and workerObservabilityRead holds the scans. The
// query test below runs the read half; the memo test runs the wrapper over a counting stand-in, so neither half is extracted without the names it needs.
const start = source.indexOf("async function workerObservabilityRead(env, nowMs) {");
const end = source.indexOf('\n__name(workerObservabilityRead, "workerObservabilityRead");', start);
assert.ok(start >= 0 && end > start, "workerObservabilityRead helper is present");
const memoStart = source.indexOf("var _wobsMemo = null;");
const memoEnd = source.indexOf('\n__name(workerObservability, "workerObservability");', memoStart);
assert.ok(memoStart >= 0 && memoEnd > memoStart && memoEnd < start, "the memo wrapper precedes the read helper");

const activeIssues = new Function("d1all", "ERR_ACTIVE_MS", `${source.slice(start, end)}\nreturn workerObservabilityRead;`)(
  async (env, sql, params) => env.db.prepare(sql).all(...params),
  3 * 36e5
);

test("the observability answer is memoized for five minutes per isolate", async () => {
  let reads = 0;
  const wrapped = new Function("workerObservabilityRead", `${source.slice(memoStart, memoEnd)}\nreturn workerObservability;`)(async () => ({ count: ++reads }));
  const t0 = Date.parse("2026-11-04T10:00:00Z");
  assert.equal((await wrapped({}, t0)).count, 1);
  assert.equal((await wrapped({}, t0 + 299_000)).count, 1, "inside five minutes the scans do not run again");
  assert.equal((await wrapped({}, t0 + 301_000)).count, 2, "after five minutes they run once more");
  assert.equal(reads, 2);
});

test("reports only fresh unresolved issues not followed by a successful deployment", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE fleet_issue_loop (fingerprint TEXT, category TEXT, last_seen TEXT, closed_at TEXT);
      CREATE TABLE fleet_issue_dispatch (fingerprint TEXT, payload TEXT);
      CREATE TABLE fleet_deploys (worker TEXT, ok INTEGER, note TEXT, ts TEXT);`);
    const now = Date.parse("2026-10-30T09:30:00Z");
    const issue = db.prepare("INSERT INTO fleet_issue_loop VALUES (?, 'worker-observability', ?, ?)");
    const dispatch = db.prepare("INSERT INTO fleet_issue_dispatch VALUES (?, ?)");
    const deploy = db.prepare("INSERT INTO fleet_deploys VALUES (?, 1, '', ?)");
    const observe = (id, service, minutesAgo, closedAt = null) => {
      const observed = now - minutesAgo * 60_000;
      issue.run(id, String(observed), closedAt);
      if (service) dispatch.run(id, JSON.stringify({ service, lastObserved: observed }));
    };

    observe("live-ai", "qnfo-ai", 30);
    observe("live-search", "qnfo-ai-search", 120);
    observe("stale-search", "qnfo-ai-search", 240);
    observe("deployed-control", "qnfo-fleet-control", 30);
    deploy.run("qnfo-fleet-control", new Date(now - 10 * 60_000).toISOString());
    observe("closed-ai", "qnfo-ai", 10, new Date(now - 5 * 60_000).toISOString());
    observe("legacy-fallback", null, 20);
    db.prepare("UPDATE fleet_issue_loop SET last_seen = ? WHERE fingerprint = 'legacy-fallback'").run(
      new Date(now - 20 * 60_000).toISOString()
    );

    const result = await activeIssues({ AUDIT: { db } }, now);
    assert.equal(result.count, 3);
    assert.deepEqual(new Set(result.workers), new Set(["qnfo-ai", "qnfo-ai-search"]));
  } finally {
    db.close();
  }
});
