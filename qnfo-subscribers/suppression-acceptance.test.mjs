import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "./worker.js";

const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error("US07 acceptance tests must not access a network");
};
const TOKEN = "synthetic-us07-digest-authority";
const ctx = { waitUntil() {} };
const request = (env, path, body = {}, token) => worker.fetch(new Request("https://subscribers.example.test" + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: "Bearer " + token }) },
  body: JSON.stringify(body)
}), env, ctx);

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE papers(slug TEXT,title TEXT,created_at TEXT,doi TEXT,status TEXT);
    INSERT INTO papers VALUES('synthetic-us07','Synthetic acceptance fixture',datetime('now'),NULL,'published');
    CREATE TABLE subscribers(email TEXT PRIMARY KEY,status TEXT,unsub_token TEXT,created_at TEXT,updated_at TEXT,last_digest_at TEXT);
    CREATE TABLE email_suppression(email TEXT PRIMARY KEY);
    CREATE TABLE subscriber_digest_runs(period_start TEXT,period_end TEXT,papers INTEGER,recipients INTEGER,sent INTEGER,failed INTEGER,status TEXT,notes TEXT);
    CREATE TABLE cloud_ops_events(id TEXT,ts TEXT,kind TEXT,text TEXT,meta TEXT,job TEXT,status TEXT);
  `);
  const prepared = [];
  const binding = {
    prepare(sql) {
      prepared.push(sql);
      let args = [];
      const q = {
        bind(...values) { args = values; return q; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() {
          const result = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(result.changes) } };
        }
      };
      return q;
    }
  };
  const deliveries = [];
  const env = {
    AUDIT: binding, LIVING: binding, SUBSCRIBERS_TOKEN: TOKEN,
    SEND_EMAIL: { async send(message) { deliveries.push(message); return { messageId: "synthetic-message-" + deliveries.length }; } }
  };
  const add = (email, status) => db.prepare("INSERT INTO subscribers VALUES(?,?,?,datetime('now'),NULL,NULL)")
    .run(email, status, "synthetic-link-" + email.split("@")[0]);
  return { db, env, deliveries, prepared, add };
}

try {
  {
    const { db, env, deliveries, prepared } = fixture();
    for (const token of [undefined, "", TOKEN.slice(0, -1), TOKEN + "-wrong"]) {
      const before = db.prepare("SELECT total_changes() n").get().n;
      const response = await request(env, "/run/digest", {}, token);
      assert.equal(response.status, 401);
      assert.equal(db.prepare("SELECT total_changes() n").get().n, before);
    }
    delete env.SUBSCRIBERS_TOKEN;
    assert.equal((await request(env, "/run/digest", {}, TOKEN)).status, 401);
    assert.equal(prepared.length, 0, "refused digest never queries recipients or papers");
    assert.equal(deliveries.length, 0);
    db.close();
  }
  {
    const { db, env, deliveries, add } = fixture();
    add("blocked@example.test", "subscribed");
    add("pending@example.test", "pending");
    add("optedout@example.test", "unsubscribed");
    db.exec("INSERT INTO email_suppression VALUES('BLOCKED@EXAMPLE.TEST')");
    const originalRows = db.prepare("SELECT * FROM subscribers ORDER BY email").all();
    const result = await (await request(env, "/run/digest", {}, TOKEN)).json();
    assert.equal(result.ok, true);
    assert.equal(result.skipped, "no-subscribers");
    assert.equal(result.recipients, 0);
    assert.equal(deliveries.length, 0, "suppressed, pending and opted-out fixtures never reach the mock sender");
    assert.deepEqual(db.prepare("SELECT * FROM subscribers ORDER BY email").all(), originalRows);
    const signup = await (await request(env, "/subscribe", { email: "Blocked@Example.Test", source: "us07-fixture" })).json();
    assert.equal(signup.confirmation_sent, false);
    assert.equal(signup.suppressed, true);
    assert.equal(deliveries.length, 0, "suppression also prevents confirmation sending");
    assert.equal(db.prepare("SELECT n FROM subscribe_funnel WHERE stage='submit_suppressed'").get().n, 1);
    db.close();
  }
  {
    const { db, env, deliveries, add } = fixture();
    add("allowed@example.test", "subscribed");
    add("blocked@example.test", "subscribed");
    db.exec("INSERT INTO email_suppression VALUES('BLOCKED@EXAMPLE.TEST')");
    const result = await (await request(env, "/run/digest", {}, TOKEN)).json();
    assert.equal(result.recipients, 1, "positive control proves filtering is not an empty-result fixture");
    assert.equal(result.sent, 1);
    assert.deepEqual(deliveries.map(m => m.to), ["allowed@example.test"]);
    assert(deliveries[0].headers["List-Unsubscribe"]);
    const unsubscribe = await request(env, "/unsubscribe?token=synthetic-link-allowed");
    assert.equal(unsubscribe.status, 200);
    assert.equal(db.prepare("SELECT status FROM subscribers WHERE email='allowed@example.test'").get().status, "unsubscribed");
    const next = await (await request(env, "/run/digest", {}, TOKEN)).json();
    assert.equal(next.recipients, 0);
    assert.equal(deliveries.length, 1, "one-click opt-out prevents any subsequent mock delivery");
    db.close();
  }
  {
    const { db, env, deliveries, add } = fixture();
    add("allowed@example.test", "subscribed");
    db.exec("DROP TABLE email_suppression");
    const result = await (await request(env, "/run/digest", {}, TOKEN)).json();
    assert.equal(result.ok, false);
    assert.match(result.error, /subscribers query failed/);
    assert.equal(deliveries.length, 0, "digest fails closed if its suppression query cannot execute");
    db.close();
  }
  assert.equal(networkCalls, 0);
  console.log("PASS US07 subscriber acceptance: protected digest, real SQL suppression, confirmation refusal, one-click opt-out and unavailable suppression store; synthetic mock sends only");
} finally {
  globalThis.fetch = originalFetch;
}
