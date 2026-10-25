import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const start = source.indexOf("async function mailFacts(");
const end = source.indexOf("function mailWho(", start);
assert.ok(start >= 0 && end > start, "mailFacts source anchors exist");

function setup() {
  const queries = [], errors = [];
  const context = vm.createContext({
    console: { error(message) { errors.push(JSON.parse(message)); } },
    async d1all(db, sql, params) {
      return (await db.prepare(sql).bind(...params).all()).results;
    },
    mailFact(row, extra, sla) { return { row, extra, sla }; }
  });
  vm.runInContext(source.slice(start, end), context);
  const env = {
    AUDIT: {
      prepare(sql) {
        let params;
        return {
          bind(...values) { params = values; return this; },
          all() {
            return new Promise((resolve, reject) => {
              queries.push({ sql, params, resolve(rows) { resolve({ results: rows }); }, reject });
            });
          }
        };
      }
    }
  };
  return { run: (rows) => context.mailFacts(env, rows), queries, errors };
}

test("both independent reads start before either completes; output waits for both", async () => {
  const { run, queries } = setup();
  const rows = [{ id: 3 }, { id: 1 }];
  let settled = false;
  const pending = run(rows).then((value) => { settled = true; return value; });
  assert.equal(queries.length, 2, "one hydration and one SLA read start without a serial wait");
  assert.match(queries[0].sql, /substr\(COALESCE\(body_text, ''\), 1, 1200\)/);
  assert.match(queries[1].sql, /ORDER BY q\.id/);
  queries[1].resolve([
    { email_id: 1, meta: '{"category":"unknown_human"}' },
    { email_id: 1, meta: '{"category":"funder"}' }
  ]);
  await Promise.resolve();
  assert.equal(settled, false);
  queries[0].resolve([{ id: 1, headers_json: "headers", body_head: "bounded body" }]);
  const result = await pending;
  assert.deepEqual(result.map((x) => x.row), rows);
  assert.equal(result[0].extra, undefined);
  assert.equal(result[1].extra.body_head, "bounded body");
  assert.equal(result[1].sla, "funder", "the latest queue decision still wins");
});

test("an empty pending-message list performs no D1 work", async () => {
  const { run, queries } = setup();
  assert.equal((await run([])).length, 0);
  assert.equal(queries.length, 0);
});

test("preloaded headers skip hydration but still read the SLA category", async () => {
  const { run, queries } = setup();
  const pending = run([{ id: 2, headers_json: "{}" }]);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /email_reply_queue/);
  queries[0].resolve([{ email_id: 2, meta: '{"category":"commercial"}' }]);
  assert.equal((await pending)[0].sla, "commercial");
});

test("each lookup retains its 100-ID bound and rejects invalid IDs", async () => {
  const { run, queries } = setup();
  const rows = [{ id: -1 }, { id: "invalid" }, { id: 0 }, { id: 1.5 }];
  rows.push(...Array.from({ length: 120 }, (_, i) => ({ id: i + 1 })));
  const pending = run(rows);
  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.equal(query.params.length, 100);
    assert.equal(query.params[0], 1);
    assert.equal(query.params[99], 100);
    assert.match(query.sql, /\?100\)/);
    query.resolve([]);
  }
  assert.equal((await pending).length, rows.length, "lookups do not discard input rows");
});

for (const failing of [0, 1]) {
  test(`lookup ${failing} failing does not discard the other enrichment`, async () => {
    const { run, queries, errors } = setup();
    const pending = run([{ id: 1 }]);
    assert.equal(queries.length, 2);
    queries[failing].reject(new Error("D1 unavailable: private mailbox fixture must not be logged"));
    queries[1 - failing].resolve(failing === 0
      ? [{ email_id: 1, meta: '{"category":"funder"}' }]
      : [{ id: 1, body_head: "retained" }]);
    const [result] = await pending;
    if (failing === 0) assert.equal(result.sla, "funder");
    else assert.equal(result.extra.body_head, "retained");
    assert.deepEqual(errors, [{
      worker: "qnfo-fleet-dashboard",
      where: failing === 0 ? "mailFacts:headers" : "mailFacts:sla",
      error: "D1 lookup failed"
    }]);
  });
}

test("malformed metadata does not suppress later valid SLA decisions", async () => {
  const { run, queries } = setup();
  const pending = run([{ id: 1, headers_json: "{}" }]);
  queries[0].resolve([
    { email_id: 1, meta: "malformed" },
    { email_id: 1, meta: '{"category":"unknown_human"}' }
  ]);
  assert.equal((await pending)[0].sla, "unknown_human");
});
