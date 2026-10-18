// BY-PERSON-ATTRIBUTION-ONLY-1 (2026-10-18): guard against the note-substring regression that has now happened TWICE.
// WATCHMAKER-BY-PERSON-PRECISION-1 (agent_issues 1726) fixed it on 2026-10-06; by 2026-10-18 by_person was counting runner
// closures again, because their notes happen to mention a session or "by PR". The real rows that were miscounted:
//   "waiting on checks; missing gate, mirror-guard, comparator, guard"                    -> runner decided
//   "verified, in scope, trusted and intact on de8fbc7; PR opened by qnfo-fleet-control" -> runner landed it
//   "withdrawn by the filing session: errata-hub ..."                                    -> genuinely a session
//   "rejected in review 2026-10-02 11:10Z (session_01GqJR...)"                           -> genuinely a session
// A substring test cannot tell the first two from the last two, so by_person must be ATTRIBUTION ONLY.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + x : "")); } };

const at = src.indexOf('key: "code-task-merge"');
check("the code-task-merge op is present", at > -1);
const block = at > -1 ? src.slice(at, at + 3000) : "";

check("by_person no longer uses the merge_note substring heuristic",
  at > -1 && !block.includes("instr(lower(COALESCE(merge_note"));
check("by_person requires a non-empty merged_by",
  block.includes("TRIM(COALESCE(merged_by, '')) <> ''"));
check("by_person excludes the runner",
  block.includes("merged_by <> 'qnfo-fleet-control'"));
check("by_person no longer counts closed tasks",
  !/status = 'merged' OR status = 'closed'/.test(block));
check("unattributed merges are surfaced as their own column",
  block.includes("by_person_unknown"));
check("by_person_unknown is NOT folded into the breach total",
  !/by_person \+ by_person_unknown/.test(block));

console.log("watchmaker-by-person.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
