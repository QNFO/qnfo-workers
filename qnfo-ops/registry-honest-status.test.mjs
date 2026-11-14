// REGISTRY-HONEST-STATUS-1 offline suite (#11912, agent_issues 1003564). registryList catches a D1 error and returns {ok:false, error}; GET /registry wrapped it in json() and
// answered 200 with no rows, so the deploy-coherence journey read one refused read as an empty registry (#11897, 2026-11-14T15:01Z). Proves: the route answers 503 when
// registryList says ok:false and 200 with the rows otherwise, and registryList itself turns a throwing D1 into ok:false.
// Run: node --no-warnings qnfo-ops/registry-honest-status.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };

ok(src === mirror, "deployed-current.worker.js is identical to worker.js");

const route = grab('if (path === "/registry" && method === "GET") {', 'if (path === "/capability-audit"');
ok(route.includes("REGISTRY-HONEST-STATUS-1") && route.includes("503"), "the /registry route carries the 503 branch", route.slice(0, 300));
const list = grab("async function registryList(env) {", "__name(registryList");
ok(list.length > 0, "registryList is found");

const json = (data, status) => ({ status: status || 200, body: data });
const parseReg = (r) => r;
const build = new Function("json", "parseReg", list + "\nreturn async (path, method, env) => {\n" + route + "\nreturn null; };");
const handle = build(json, parseReg);

const rows = [{ service: "qnfo-ops", version: "2.73.4" }];
const good = { QNFO_AUDIT: { prepare: () => ({ all: async () => ({ results: rows }) }) } };
const refused = { QNFO_AUDIT: { prepare: () => ({ all: async () => { throw new Error("D1 DB is overloaded"); } }) } };

const r1 = await handle("/registry", "GET", good);
ok(r1 && r1.status === 200 && r1.body.ok === true && r1.body.count === 1, "a readable registry answers 200 with its rows", r1);
const r2 = await handle("/registry", "GET", refused);
ok(r2 && r2.status === 503 && r2.body.ok === false && /overloaded/.test(r2.body.error), "a refused D1 read answers 503 and names the error", r2);
const r3 = await handle("/registry", "GET", {});
ok(r3 && r3.status === 503 && r3.body.ok === false, "an unbound audit database answers 503", r3);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
