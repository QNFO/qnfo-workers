// POSTING-AGE-1: the posting date each source gives is normalised to ISO or dropped. Run: node qnfo-jobsearch/posting-age.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const w = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href)).default;
const d = w.__test.isoDate;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL " + m); } };
ok(d("2026-11-01T10:00:00Z") === "2026-11-01T10:00:00.000Z", "ISO text");
ok(d(1793000000000).startsWith("2026-"), "epoch ms");
ok(d(1793000000).startsWith("2026-"), "epoch seconds");
ok(d("1793000000").startsWith("2026-"), "epoch seconds as text");
ok(d("") === "" && d(null) === "" && d("not a date") === "", "empty and junk");
ok(d("1999-01-01") === "", "implausibly old");
ok(d("2099-01-01") === "", "future");
console.log(fail ? fail + " failed" : "posting-age: all passed");
process.exit(fail ? 1 : 0);
