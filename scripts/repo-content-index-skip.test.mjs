// REPO-INDEX-SKIP-1 (2026-11-09, pillar core): scripts/repo_content_index.py printed an unbound `idx` on its "no reader, skipping embedding" path and died with
// UnboundLocalError, so artifacts-canonical-sync went red on main (ci-watchdog issue 9619). This runs the skip path for real: credentials present, no reader flag.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(new URL("./repo_content_index.py", import.meta.url));
const env = { ...process.env, CLOUDFLARE_API_TOKEN: "x", CLOUDFLARE_ACCOUNT_ID: "y" };
delete env.QNFO_REPO_CONTENT_READER;
const r = spawnSync("python3", [script, "--max-repos", "1"], { env, encoding: "utf8" });
let out = null;
try { out = JSON.parse((r.stdout || "").trim().split("\n").pop()); } catch (e) { /* reported below */ }
const fail = [];
if (r.status !== 0) fail.push("exit " + r.status + ": " + (r.stderr || "").split("\n").filter(Boolean).pop());
if (!out || out.ok !== true) fail.push("stdout is not an ok JSON line: " + (r.stdout || "").slice(0, 120));
if (out && !/no reader/.test(out.note || "")) fail.push("the skip note is missing");
console.log("repo-content-index-skip: " + (fail.length ? "FAILED " + fail.join("; ") : "passed"));
process.exit(fail.length ? 1 : 0);
