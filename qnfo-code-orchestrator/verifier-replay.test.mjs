import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qnfo-verifier-replay-"));

try {
  const workerPath = path.join(tempDir, "worker.mjs");
  const source = fs.readFileSync(path.join(here, "worker.js"), "utf8");
  fs.writeFileSync(workerPath, `${source}\nexport { replayFailedCompileTask as testReplayFailedCompileTask };\n`);
  const { testReplayFailedCompileTask } = await import(pathToFileURL(workerPath).href);

  function makeEnv() {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE code_tasks (
      id TEXT PRIMARY KEY, path TEXT, status TEXT, step TEXT, branch TEXT, pr_url TEXT,
      last_error TEXT, ctx TEXT, attempts INTEGER, lease_until TEXT, updated_at TEXT
    );
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
    return {
      AUDIT_DB: {
        prepare(sql) {
          let args = [];
          const stmt = {
            bind(...values) { args = values.map((value) => value === undefined ? null : value); return stmt; },
            async run() {
              const result = db.prepare(sql).run(...args);
              return { meta: { changes: Number(result.changes) } };
            },
            async first() { return db.prepare(sql).get(...args) || null; },
            async all() { return { results: db.prepare(sql).all(...args) }; },
          };
          return stmt;
        },
      },
      db,
    };
  }

  function addTask(env, task) {
    env.db.prepare(`INSERT INTO code_tasks
      (id,path,status,step,branch,pr_url,last_error,ctx,attempts,lease_until,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      task.id, task.path || "scripts/fleet-autoaudit.py", task.status || "failed", task.step || "verify",
      task.branch || null, task.pr_url || null, task.last_error || "verify failed: container compile failed",
      JSON.stringify(task.ctx || {}), task.attempts ?? 4, task.lease_until || null, task.updated_at || "2026-10-25T04:56:00.000Z",
    );
  }

  {
    const env = makeEnv();
    addTask(env, {
      id: "ct_replayable",
      ctx: { anchor: "def main():", extras: ["helper.py"], claim: { token: "released-token", released_at: "2026-10-25T05:00:00.000Z" } },
    });

    const replay = await testReplayFailedCompileTask(env);
    const row = env.db.prepare("SELECT * FROM code_tasks WHERE id='ct_replayable'").get();
    const ctx = JSON.parse(row.ctx);
    assert.deepEqual(replay, { id: "ct_replayable", path: "scripts/fleet-autoaudit.py" });
    assert.equal(row.status, "queued", "eligible verifier failures are queued again");
    assert.equal(row.step, "read", "replay starts with a fresh source read");
    assert.equal(row.attempts, 0, "the replay begins a new attempt sequence");
    assert.equal(row.last_error, null);
    assert.equal(row.lease_until, null);
    assert.equal(ctx.verifier_replay_attempted, true);
    assert.equal(ctx.verifier_replay_reason, "verify failed: container compile failed");
    assert.equal(ctx.anchor, "def main():", "the task's original anchor is retained");
    assert.deepEqual(ctx.extras, ["helper.py"], "multi-file task context is retained");
    assert.equal("claim" in ctx, false, "a previous released claim is not reused");
    assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind='code-task.verifier-replay'").get().n, 1);
    assert.equal(await testReplayFailedCompileTask(env), null, "a task is replayed only once");
    assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind='code-task.verifier-replay'").get().n, 1);
  }

  {
    const env = makeEnv();
    addTask(env, { id: "ct_already_active" });
    addTask(env, { id: "ct_sibling", status: "queued", step: "read", last_error: "" });
    assert.equal(await testReplayFailedCompileTask(env), null, "an active task on the same path blocks replay");
    assert.equal(env.db.prepare("SELECT status FROM code_tasks WHERE id='ct_already_active'").get().status, "failed");
  }

  {
    const env = makeEnv();
    addTask(env, { id: "ct_pr", pr_url: "https://github.com/QNFO/qnfo-workers/pull/1" });
    addTask(env, { id: "ct_wrong_step", step: "propose" });
    addTask(env, { id: "ct_other_error", last_error: "verify failed: syntax error" });
    addTask(env, { id: "ct_replayed_before", ctx: { verifier_replay_attempted: true } });
    assert.equal(await testReplayFailedCompileTask(env), null, "PR-bearing, non-verify, unrelated, and already-replayed tasks are excluded");
  }

  {
    const env = makeEnv();
    addTask(env, { id: "ct_race_a" });
    addTask(env, { id: "ct_race_b" });
    const results = await Promise.all([
      testReplayFailedCompileTask(env),
      testReplayFailedCompileTask(env),
    ]);
    assert.equal(results.filter(Boolean).length, 1, "concurrent recovery attempts queue only one task per path");
    assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM code_tasks WHERE status='queued'").get().n, 1);
  }

  console.log("PASS one-time verifier-failure replay, path safety, and concurrent deduplication");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
