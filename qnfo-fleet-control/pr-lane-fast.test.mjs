// PR-LANE-FAST-1 (0.29.0) offline suite: bhConfig reads ops_config stale_pr_merge_idle_min (junk ignored, below the floor reads the floor), and
// both lane gates (the pre-warm filter and the merge loop) measure quiet in cfg.idleMin minutes, not the old 2-hour constant.
// PR-MERGE-SLA-10M-1 (0.49.0): the default is 3 minutes and the floor 1 (was 20 and 10), and the suite reads both constants out of worker.js. It used to
// hard-code 20 and 10 in its own Function prefix, so it stayed green whatever the shipped values were and pinned nothing. It also pins the drafts switch.
// Run: node qnfo-fleet-control/pr-lane-fast.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const a = src.indexOf("async function bhConfig(env) {"), b = src.indexOf('__name(bhConfig, "bhConfig");');
const dm = /^var BH_MERGE_IDLE_MIN_DEFAULT = (\d+);/m.exec(src), fm = /^var BH_MERGE_IDLE_MIN_FLOOR = (\d+);/m.exec(src);
ok(dm && fm, "the default and the floor are declared in worker.js");
const DEF = Number(dm[1]), FLOOR = Number(fm[1]);
ok(DEF === 3 && FLOOR === 1, "PR-MERGE-SLA-10M-1: a 3-minute quiet window with a floor of 1 (a green pull request must merge inside 10 minutes of opening)", [DEF, FLOOR]);
const bhConfig = new Function("var BH_MERGE_IDLE_MIN_DEFAULT = " + DEF + ", BH_MERGE_IDLE_MIN_FLOOR = " + FLOOR + ";\n" + src.slice(a, b) + "\nreturn bhConfig;")();
const env = (rows) => ({ AUDIT: { prepare: () => ({ all: async () => ({ results: rows }) }) } });
ok((await bhConfig(env([]))).idleMin === DEF, "default is the shipped default");
ok((await bhConfig(env([{ key: "stale_pr_merge_idle_min", value: "45" }]))).idleMin === 45, "ops_config sets it");
ok((await bhConfig(env([{ key: "stale_pr_merge_idle_min", value: "0" }]))).idleMin === FLOOR, "below the floor reads the floor");
ok((await bhConfig(env([{ key: "stale_pr_merge_idle_min", value: "soon" }]))).idleMin === DEF, "junk keeps the default");
ok((await bhConfig(env([{ key: "stale_pr_merge_idle_min", value: "20" }]))).idleMin === 20, "20 restores the PR-LANE-FAST-1 window without a deploy");
ok((await bhConfig(env([]))).drafts === true, "PR-MERGE-SLA-10M-1: drafts are merged by default");
ok((await bhConfig(env([{ key: "stale_pr_merge_drafts", value: "off" }]))).drafts === false, "ops_config stale_pr_merge_drafts = off restores 'a draft is never merged'");
ok((await bhConfig(env([{ key: "stale_pr_merge_drafts", value: "on" }]))).drafts === true && (await bhConfig(env([{ key: "stale_pr_merge_drafts", value: "junk" }]))).drafts === true, "on and junk keep drafts on");
ok(/'stale_pr_merge_drafts'/.test(src.slice(a, b)), "the drafts key is in the ops_config read");
ok(/'stale_pr_merge_idle_min'/.test(src.slice(a, b)), "the key is in the ops_config read");
ok(/\(nowMs - u\) >= cfg\.idleMin \* 6e4/.test(src) && /\(nowMs - updMs\) >= cfg\.idleMin \* 6e4/.test(src), "both lane gates use cfg.idleMin minutes");
ok(!/BH_MERGE_IDLE_H \* 36e5/.test(src), "no gate measures the old 2-hour constant");
ok(/var mergeSlot = true;/.test(src), "code-loop merges run every fast tick");
const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 0 || Number(vm[2]) >= 29), "VERSION is at least 0.29.0");
console.log(`pr-lane-fast: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
