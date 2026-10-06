// RADAR-CAP-GRADING-1 (qnfo-cloud-ops 1.21.1, agent_issues 1641) offline suite.
// Proves: a source blocked by an external per-IP quota (capped:...) is reported but not graded; any other failure still
// degrades the run; no healthy graded source is an error; the owner card resolves only on an ok StackExchange answer.
// Run: node --no-warnings qnfo-cloud-ops/radar-cap-grading.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("function radarStatus("), b = src.indexOf('__name(radarStatus, "radarStatus");');
if (a < 0 || b < a) throw new Error("radarStatus not found");
const ctx = vm.createContext({});
const radarStatus = vm.runInContext(src.slice(a, b) + "\nradarStatus;", ctx);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };
ok(radarStatus({ hn: "ok:0", lobsters: "ok:1", bluesky: "ok:0", stackexchange: "capped:throttle_violation too many requests", citations: "ok:1" }) === "ok", "a capped source is reported, not graded");
ok(radarStatus({ hn: "ok:0", stackexchange: "http:400 key_required: key required" }) === "degraded", "any other failure still degrades the run");
ok(radarStatus({ hn: "error:timeout", stackexchange: "capped:throttle" }) === "error", "no healthy graded source is an error");
ok(radarStatus({ stackexchange: "capped:throttle" }) === "error", "only capped sources is an error, not ok");
ok(radarStatus({ hn: "ok:2", stackexchange: "ok:0" }) === "ok", "all ok is ok");
ok(radarStatus({}) === "error", "no sources is an error");
const body = src.slice(src.indexOf("async function jobRadar("), src.indexOf('__name(jobRadar, "jobRadar");'));
ok(/slug = 'stackexchange-key' AND status = 'open'/.test(body) && /indexOf\("ok:"\) === 0\)/.test(body), "the stackexchange-key card resolves only on an ok answer");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
