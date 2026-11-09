// ATLAS-GATEWAY-ROUTE-1 (agent_issues 1002087): papers.qnfo.org/data/ai-science-failures/<file> streams the R2 atlas, four names only.
// Output MUST contain "0 failed" on success.   node qnfo-gateway/atlas-route.test.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const a = src.indexOf("var ATLAS_FILES");
const b = src.indexOf("async function handleLlmsTxt(env)");
ok(a > 0 && b > a, "the handler is in the worker");
const handle = new Function(src.slice(a, b) + "\nreturn handleAtlasData;")();

const calls = [];
const env = { QNFO_BUCKET: { get: async (key) => { calls.push(key); return key.endsWith("manifest.json") ? { body: "{\"name\":\"qnfo-ai-written-science-failures\"}", httpEtag: "\"abc\"" } : null; } } };
const req = (method, inm) => ({ method, headers: { get: (h) => (h === "If-None-Match" ? inm || null : null) } });

let r = await handle(req("GET"), env, "/data/ai-science-failures/manifest.json");
ok(r.status === 200 && r.headers.get("Content-Type").startsWith("application/json") && r.headers.get("ETag") === "\"abc\"" && r.headers.get("Access-Control-Allow-Origin") === "*", "manifest.json streams with Content-Type, ETag and CORS");
ok(calls[0] === "atlas/ai-science-failures/manifest.json", "the key is the atlas folder in the qnfo bucket");
r = await handle(req("GET"), env, "/data/ai-science-failures/secret.txt");
ok(r.status === 404 && calls.length === 1, "a file outside the four names is a 404 and never reaches R2");
r = await handle(req("GET"), env, "/data/ai-science-failures/..%2Fpapers.json");
ok(r.status === 404 && calls.length === 1, "a path escape is a 404");
r = await handle(req("GET"), env, "/data/ai-science-failures/errata.jsonl");
ok(r.status === 404, "a listed name missing from R2 is a 404");
r = await handle(req("GET", "\"abc\""), env, "/data/ai-science-failures/manifest.json");
ok(r.status === 304, "a matching If-None-Match is a 304");
r = await handle(req("HEAD"), env, "/data/ai-science-failures/manifest.json");
ok(r.status === 200 && (await r.text()) === "", "HEAD answers without a body");
ok((src.match(/return handleAtlasData\(request, env, p\);/g) || []).length === 3, "all three host routers route /data/ai-science-failures/");
ok(/open data atlas\]\(" \+ base \+ "\/data\/ai-science-failures\/manifest\.json\)/.test(src), "llms.txt lists the atlas in its Open data section");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
