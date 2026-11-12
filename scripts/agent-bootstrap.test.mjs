// AGENT-BOOTSTRAP-1: one public bootstrap URL, linked from llms.txt, carrying the rule, pointed to by this repo's agent files.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
let fail = 0;
const must = (ok, msg) => { if (!ok) { console.log("FAIL " + msg); fail++; } };
const b = rd("agent-bootstrap.md");
must(/bootstrap-version: \d+\.\d+\.\d+/.test(b), "agent-bootstrap.md lost its version line");
must(b.includes("SELF-CLOSED-LOOPS-1"), "agent-bootstrap.md lost SELF-CLOSED-LOOPS-1");
must(rd("llms.txt").includes("agent-bootstrap.md"), "llms.txt does not link agent-bootstrap.md");
must(!/```|\|\s*(sh|bash)\b|curl\s|password|token|secret/i.test(b.replace("secret locks","").replace("a secret lock","")), "agent-bootstrap.md contains a code block, shell pipe or credential word");
const r = spawnSync("python3", ["scripts/sync_agent_bootstrap.py", "--check", "AGENTS.md", "CLAUDE.md"], { encoding: "utf8" });
process.stdout.write(r.stdout + r.stderr);
must(r.status === 0, "agent files lack the generated bootstrap pointer");
console.log("agent-bootstrap: " + (fail ? "FAILED" : "ok"));
process.exit(fail ? 1 : 0);
