// ERRATA-CHAIN-DISPATCH-1: the action board wakes the folded consumer, not email intake or an unbound retired worker.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("function execTargetFor(");
const target = runInNewContext(source.slice(start, source.indexOf('\n__name(execTargetFor,', start)) + "\nexecTargetFor");
const spec = target("integration-chain", "Integration chain Errata watch -> respond -> publish", {});
assert.equal(spec.safe, true);
assert.equal(spec.svc, "SVC_ERRATA_HUB");
assert.equal(spec.path, "/run/errata-respond");
assert.equal(spec.auth, undefined, "no copied errata secret");
assert.equal(target("integration-chain", "Unknown chain", {}).safe, false);
assert.equal(target("probe", "Errata watch -> respond -> publish", {}).safe, false);
assert.equal(target("integration-chain", "Research intake -> execution", {}).svc, "SVC_QNFO_RESEARCH_EXEC");

const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const binding = toml.split("[[services]]").find((s) => /binding = "SVC_ERRATA_HUB"/.test(s));
assert.match(binding, /service = "qnfo-research-exec"/);
assert.match(binding, /props = \{ caller = "qnfo-fleet-dashboard", member = "errata-hub" \}/);
const research = toml.split("[[services]]").find((s) => /binding = "SVC_QNFO_RESEARCH_EXEC"/.test(s));
assert.doesNotMatch(research, /member =/, "ordinary research calls must not route to the errata member");
const rows = [
  ...["no-action", "needs-human", "executed"].map((state) => ({
    fingerprint: state, exec_state: state, category: "integration-chain",
    payload: JSON.stringify({ resource: "Integration chain Errata watch -> respond -> publish" })
  })),
  { fingerprint: "other", exec_state: "no-action", category: "integration-chain", payload: '{"resource":"Unknown chain"}' },
  { fingerprint: "invalid", exec_state: "no-action", category: "integration-chain", payload: "invalid json" }
];
const retried = [];
const loopStart = source.indexOf("async function loopExecute(");
const execute = runInNewContext(
  source.slice(loopStart, source.indexOf('\n__name(loopExecute,', loopStart)) + "\nloopExecute",
  {
    loopEnsure: async () => {},
    d1all: async () => rows,
    loopMetaSet: async () => {},
    execTargetFor: target,
    execOne: async (_env, row) => { retried.push(row.fingerprint); return { fingerprint: row.fingerprint, state: "executed" }; }
  }
);
await execute({});
assert.deepEqual(retried, ["no-action", "needs-human"], "previously parked errata receipts retry after deployment, regardless of migration ordering");
console.log("ERRATA-CHAIN-DISPATCH-1: target, binding, authentication and unrelated targets passed");
