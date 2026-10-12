/**
 * register-dedupe.test.mjs -- REGISTER-SCAN-DEDUPE-1 (pillar autonomy).
 * The register scan files an OVERDUE improvement with the tag "[register:<id>]" in the DETAIL argument of improvement(),
 * which writes fleet_improvements.detail. The dedupe before it read fleet_improvements.evidence, so it never matched and
 * the same register row was re-filed on every scan. This locks the dedupe to the column the writer uses.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), "utf8");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log("FAIL " + m); } };
const i = src.indexOf('.bind("%register:" + rr.id + "%")');
ok(i > 0, "the register scan dedupe is present");
const stmt = src.slice(src.lastIndexOf("prepare(", i), i);
ok(/FROM fleet_improvements WHERE \(detail LIKE \?1 OR evidence LIKE \?1\)/.test(stmt), "the dedupe reads detail (and evidence)");
ok(/status IN \('proposed','approved','in_progress'\)/.test(stmt), "the dedupe still counts only open improvements");
ok(/INSERT OR IGNORE INTO fleet_improvements \(source,target,kind,title,detail,priority,status\)/.test(src), "improvement() writes its 6th argument to detail");
ok(/\+ " \[register:" \+ rr\.id \+ "\]", "P1"\)/.test(src), "the register tag is passed as the detail argument");
const v = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(v[0] > 0 || v[1] > 18 || (v[1] === 18 && v[2] >= 2), "VERSION is at least 0.18.2");
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
