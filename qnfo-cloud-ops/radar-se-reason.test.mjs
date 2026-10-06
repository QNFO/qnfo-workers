// RADAR-SE-REASON-1 (#1641): the mention radar names why StackExchange failed (the API answers HTTP 400 for every error
// class), reports a per-address throttle as capped:<why>, and appends a public stackapps key only when one is configured.
// Run: node --no-warnings qnfo-cloud-ops/radar-se-reason.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- RADAR-SE-REASON-1:BEGIN"), src.indexOf("// ---- RADAR-SE-REASON-1:END"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { seFailureNote, SE_SEARCH_URL };", sandbox);
const { seFailureNote, SE_SEARCH_URL } = sandbox.__export;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

let n = seFailureNote(400, JSON.stringify({ error_id: 502, error_message: "too many requests from this IP, more requests will be blocked for the next 86399 seconds", error_name: "throttle_violation" }));
check(/^capped:throttle_violation too many requests from this IP/.test(n), "a throttle is reported as capped with the API's own words: " + n);
n = seFailureNote(400, JSON.stringify({ error_id: 400, error_message: "site is required", error_name: "bad_parameter" }));
check(n === "http:400 bad_parameter: site is required", "a bad parameter keeps http:400 and names the class: " + n);
n = seFailureNote(400, JSON.stringify({ error_id: 405, error_message: "key required", error_name: "key_required" }));
check(n === "http:400 key_required: key required", "key_required is named, not capped: " + n);
n = seFailureNote(403, "<html><head><title>Forbidden - Stack Exchange</title></head><body>blocked</body></html>");
check(/^http:403: Forbidden - Stack Exchange blocked$/.test(n), "an HTML body is stripped to its text: " + n);
n = seFailureNote(500, "");
check(n === "http:500", "an empty body leaves the bare status");
n = seFailureNote(400, "{not json");
check(n === "http:400: {not json", "a non-JSON body is kept as text");
check(seFailureNote(400, JSON.stringify({ error_name: "x", error_message: "y".repeat(400) })).length <= 140, "the note is capped at 140 chars");
check(/^https:\/\/api\.stackexchange\.com\/2\.3\/search\/advanced\?/.test(SE_SEARCH_URL) && /site=stackoverflow/.test(SE_SEARCH_URL) && !/key=/.test(SE_SEARCH_URL), "the base URL carries no key");
// wiring: the radar fetches SE_SEARCH_URL plus the optional key, and records the failure note from the body
check(/const seKey = env && env\.STACKEXCHANGE_KEY \? "&key=" \+ encodeURIComponent\(String\(env\.STACKEXCHANGE_KEY\)\) : "";/.test(src), "the key is appended only when STACKEXCHANGE_KEY is set");
check(/const r = await fetch\(SE_SEARCH_URL \+ seKey, ua\);\s*if \(!r\.ok\) sources\.stackexchange = seFailureNote\(r\.status, await r\.text\(\)\.catch\(\(\) => ""\)\);/.test(src), "a failed response is read and classified");
check(!/sources\.stackexchange = "http:" \+ r\.status;/.test(src), "the bare http:<status> note is gone");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
