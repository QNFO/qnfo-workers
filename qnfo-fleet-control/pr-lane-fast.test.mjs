// PR-LANE-FAST-1 (0.29.0) offline suite: bhConfig reads ops_config stale_pr_merge_idle_min (default 20, floor 10, junk ignored), and
// both lane gates (the pre-warm filter and the merge loop) measure quiet in cfg.idleMin minutes, not the old 2-hour constant.
// Run: node qnfo-fleet-control/pr-lane-fast.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const a = src.indexOf("async function bhConfig(env) {"), b = src.indexOf('__name(bhConfig, "bhConfig");');
const bhConfig = new Function("var BH_MERGE_IDLE_MIN_DEFAULT = 20, BH_MERGE_IDLE_MIN_FLOOR = 10;\n" + src.slice(a, b) + "\nreturn bhConfig;")();
const env = (rows) => ({ AUDIT: { prepare: () => ({ all: async () => ({ results: rows }) }) } });
ok((await bhConfig(env([]))).idleMin === 20, "default is 20 minutes");
ok((await bhConfig(env([{ key: "stale_pr_merge_idle_min", value: "45" }]))).idleMin === 45, "ops_config sets it");
ok((await bhConfig(env([{ key: "stale_pr_merge_idle_min", value: "2" }]))).idleMin === 10, "below the floor reads the floor");
ok((await bhConfig(env([{ key: "stale_pr_merge_idle_min", value: "soon" }]))).idleMin === 20, "junk keeps the default");
ok(/'stale_pr_merge_idle_min'/.test(src.slice(a, b)), "the key is in the ops_config read");
ok(/\(nowMs - u\) >= cfg\.idleMin \* 6e4/.test(src) && /\(nowMs - updMs\) >= cfg\.idleMin \* 6e4/.test(src), "both lane gates use cfg.idleMin minutes");
ok(!/BH_MERGE_IDLE_H \* 36e5/.test(src), "no gate measures the old 2-hour constant");
ok(/var mergeSlot = true;/.test(src), "code-loop merges run every fast tick");
const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 0 || Number(vm[2]) >= 29), "VERSION is at least 0.29.0");
console.log(`pr-lane-fast: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
