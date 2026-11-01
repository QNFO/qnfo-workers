import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
const body = source.replace(/^export default /m, "var __default = ");
const warnings = [];
const { VERSION, handlers } = new Function("console", body + "\n;return { VERSION, handlers: __default };")({
  log() {},
  warn(message) { warnings.push(JSON.parse(message)); },
});

const response = (audit) => handlers.fetch(
  new Request("https://qnfo-model-eval.q08.workers.dev/health"),
  { AUDIT: audit },
);

{
  const res = await response({
    prepare(sql) {
      assert.equal(sql, "SELECT COUNT(*) n FROM cf_model_catalog");
      return { async first() { return { n: 12 }; } };
    },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.catalog, 12);
  assert.equal(body.dependencies.audit, "available");
}

{
  const res = await response({
    prepare() {
      return { async first() { throw new Error("D1 temporarily unavailable"); } };
    },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.catalog, null);
  assert.equal(body.dependencies.audit, "unavailable");
  assert.deepEqual(warnings.at(-1), {
    worker: "qnfo-model-eval",
    where: "health:audit",
    error: "D1 temporarily unavailable",
  });
}

assert.match(VERSION, /^1\.8\.4(?:-|$)/);
assert.equal(mirror, source);
console.log("qnfo-model-eval health liveness tests passed");
