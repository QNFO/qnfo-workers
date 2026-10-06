// LIFECYCLE-PING-1042-1 (qnfo-lifecycle 1.7.3, agent_issues 1994): runPing and runSync fetch *.q08.workers.dev URLs. Without
// the compatibility flag global_fetch_strictly_public that subrequest is Cloudflare error 1042 (same zone), served as HTTP 404:
// 150 "[lifecycle] PING FAIL ... HTTP 404" rows in worker_logs 2026-10-02..05. This suite fails if the flag is dropped while
// the worker still fetches a workers.dev URL.
// Run: node --no-warnings qnfo-lifecycle/strict-public-fetch.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const fetchesWorkersDev = /\.q08\.workers\.dev/.test(src) && /await fetch\(/.test(src);
const flags = (toml.match(/^\s*compatibility_flags\s*=\s*\[([^\]]*)\]/m) || [, ""])[1];
ok(fetchesWorkersDev, "worker.js still fetches a *.q08.workers.dev URL (otherwise this suite is moot)");
ok(/"global_fetch_strictly_public"/.test(flags), "wrangler.toml compatibility_flags carries global_fetch_strictly_public");
ok(/"https:\/\/qnfo-gateway\.q08\.workers\.dev\/health"/.test(src) && !/qnfo-archive\.q08\.workers\.dev/.test(src), "runPing targets the workers.dev URL that returned 1042 (qnfo-gateway; qnfo-archive left it when it was retired, ARCHIVE-RETIRE-1)");
ok(/r\.base_url \|\| \("https:\/\/" \+ r\.service \+ "\.q08\.workers\.dev"\)/.test(src), "runSync falls back to the workers.dev hostname");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
