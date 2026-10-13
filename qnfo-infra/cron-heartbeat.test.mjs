// CRON-ONLY-HEARTBEAT-1 (qnfo-infra 1.5.0, agent_issues 2397) offline suite. Proves: scheduled() upserts one fleet_heartbeat
// row (worker, VERSION, ISO ts, ok=1) after a finished run, writes ok=0 when the work throws (and still rethrows),
// and a D1 failure on the heartbeat write never throws out of scheduled(). Run: node qnfo-infra/cron-heartbeat.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { VERSION as __v };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const mkEnv = (failWrite) => {
  const calls = [];
  return { calls, AUDIT: { prepare(sql) { const c = { sql, args: null, runs: 0 }; calls.push(c); const o = { bind(...a) { c.args = a; return o; }, async run() { c.runs++; if (failWrite) throw new Error("d1 down"); return {}; } }; return o; } } };
};
const hb = (env) => env.calls.filter((c) => /INSERT INTO fleet_heartbeat/.test(c.sql));
const quiet = async (f) => { const e = console.error; console.error = () => {}; try { return await f(); } finally { console.error = e; } };

{ // finished run: no matching cron, so the work is a no-op that completes
  const env = mkEnv(false);
  await mod.default.scheduled({ cron: "1 2 * * *" }, env, {});
  const rows = hb(env);
  ok(rows.length === 1 && rows[0].runs === 1, "one heartbeat upsert after a finished run", rows.length);
  const a = rows[0] && rows[0].args || [];
  ok(a[0] === "qnfo-infra" && a[1] === mod.__v && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(a[2]) && a[3] === 1, "bound (worker, VERSION, ISO ts, ok=1)", a);
  ok(/ON CONFLICT\(worker\) DO UPDATE/.test(rows[0].sql), "upsert is keyed on worker");
}
{ // work throws: ok=0, heartbeat still written, original error still surfaces
  const env = mkEnv(false);
  let thrown = null;
  try { await mod.default.scheduled({ get cron() { throw new Error("boom"); } }, env, {}); } catch (e) { thrown = e; }
  const rows = hb(env);
  ok(rows.length === 1 && rows[0].args[3] === 0, "ok=0 when the scheduled work throws", rows[0] && rows[0].args);
  ok(thrown && thrown.message === "boom", "the work's own error is not swallowed", thrown && thrown.message);
}
{ // heartbeat write fails: scheduled() still resolves
  const env = mkEnv(true);
  let thrown = null;
  await quiet(async () => { try { await mod.default.scheduled({ cron: "1 2 * * *" }, env, {}); } catch (e) { thrown = e; } });
  ok(thrown === null && hb(env).length === 1, "a D1 failure on the heartbeat write does not throw out of scheduled()", thrown && thrown.message);
}
{ // missing binding: same
  let thrown = null;
  await quiet(async () => { try { await mod.default.scheduled({ cron: "1 2 * * *" }, {}, {}); } catch (e) { thrown = e; } });
  ok(thrown === null, "a missing AUDIT binding does not throw out of scheduled()");
}
ok(/CRON-ONLY-HEARTBEAT-1/.test(src) && (src.match(/var VERSION = "/g) || []).length === 1, "marker present, one quoted VERSION constant");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
