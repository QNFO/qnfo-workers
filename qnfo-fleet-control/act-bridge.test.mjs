// ACT-BRIDGE-1: a metric trigger whose remedy is a code change must reach the code loop. Replays the pure helper
// evaluateMetricTriggers uses for the issue description against qnfo-code-orchestrator's own ISSUE-INTAKE-1 pattern.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- ACT-BRIDGE-1:BEGIN"), src.indexOf("// ---- ACT-BRIDGE-1:END"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { triggerIssueDescription, triggerIssuePriority };", sandbox);
const { triggerIssueDescription, triggerIssuePriority } = sandbox.__export;
const orch = readFileSync(join(here, "..", "qnfo-code-orchestrator", "worker.js"), "utf8");
const INTAKE_MARK = new RegExp(orch.match(/const INTAKE_MARK = \/(.+)\/m;/)[1], "m");
const ANCHOR = /^[ \t]*code-anchor:[ \t]*(.{1,300}?)[ \t]*$/m;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const head = "METRIC-TRIGGER #7 x=1 gt 0 -> ", tail = " (owner qnfo-x, target agent_issues)";

const prose = "Pillar cost. Route bulk summarisation to the cheap model. " + "Long explanation. ".repeat(40);
const action = prose + "\ncode-task: repo=qnfo-workers path=qnfo-research-exec/worker.js\ncode-anchor: var SUMMARY_MODEL = \"@cf/zai-org/glm-5.3\";";
const d = triggerIssueDescription(head, action, tail);
const m = INTAKE_MARK.exec(d);
check(m && m[1] === "qnfo-workers" && m[2] === "qnfo-research-exec/worker.js", "code-task line survives as its own line and matches ISSUE-INTAKE-1");
check((ANCHOR.exec(d) || [])[1] === 'var SUMMARY_MODEL = "@cf/zai-org/glm-5.3";', "code-anchor survives verbatim");
check(d.split("\n")[0].startsWith(head) && d.split("\n")[0].endsWith(tail) && !/code-task:|code-anchor:/.test(d.split("\n")[0]), "first line is the summary, prose only");
check(d.split("\n")[0].length <= head.length + 300 + tail.length, "prose still capped at 300 chars");

const old = triggerIssueDescription(head, "Pillar reach. Check the subscribe CTA.", tail);
check(old === head + "Pillar reach. Check the subscribe CTA." + tail, "an action without markers files exactly the old one-line summary");
check(!INTAKE_MARK.test(old), "no marker, no code task (nothing inferred from prose)");
check(!INTAKE_MARK.test(triggerIssueDescription(head, "see code-task: repo=a path=b inline", tail)), "an inline mention is not a task");
const two = triggerIssueDescription(head, "x\ncode-task: repo=a path=b.js\ncode-task: repo=c path=d.js", tail);
check((two.match(/code-task:/g) || []).length === 1, "at most one code task per issue");
check(!ANCHOR.test(triggerIssueDescription(head, "x\ncode-anchor: lonely", tail)), "an anchor without a task is dropped");

// TRIGGER-DISPATCH-1: the priority written to agent_issues must be a priority_canon value, whatever the trigger stores.
const CANON = ["critical", "high", "medium", "low"];
check([1, 5, 6, 7, 8, 9, "7", "high", "HIGH", null, undefined, "", "x"].every((v) => CANON.includes(triggerIssuePriority(v))), "every stored priority maps to a canonical value");
check(triggerIssuePriority(9) === "critical" && triggerIssuePriority(8) === "high" && triggerIssuePriority(7) === "high", "9 is critical, 7 and 8 are high");
check(triggerIssuePriority(6) === "medium" && triggerIssuePriority(5) === "medium" && triggerIssuePriority(4) === "low", "5 and 6 are medium, below is low");
check(triggerIssuePriority("medium") === "medium" && triggerIssuePriority(" High ") === "high", "a canonical word passes through");
check(triggerIssuePriority(null) === "medium" && triggerIssuePriority("x") === "medium", "an unreadable priority files as medium");
check(/status <> 'dispatch-failed'/.test(src.slice(src.indexOf("async function evaluateMetricTriggers"), src.indexOf('__name(evaluateMetricTriggers'))), "a failed dispatch does not start the cooldown");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
