// Re-inlines repo-deposit.mjs into worker.js between the REPO-DEPOSIT-BEGIN/END markers (the module is the source; worker.js carries the
// copy because a worker is one file). repo-deposit.test.mjs fails when the two differ.
// Run: node qnfo-research-exec/inline-repo-deposit.mjs   (then copy worker.js over deployed-current.worker.js)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const mod = readFileSync(join(HERE, "repo-deposit.mjs"), "utf8");
const body = mod.replace(/\nexport \{([\s\S]*?)\};\s*$/, "\nreturn {$1};\n");
const block = "// REPO-DEPOSIT-BEGIN\nvar REPO_DEPOSIT = (function() {\n" + body + "})();\n// REPO-DEPOSIT-END\n";
const path = join(HERE, "worker.js"), src = readFileSync(path, "utf8");
const a = src.indexOf("// REPO-DEPOSIT-BEGIN"), end = "// REPO-DEPOSIT-END\n", b = src.indexOf(end);
if (a < 0 || b < a) throw new Error("markers not found in worker.js");
writeFileSync(path, src.slice(0, a) + block + src.slice(b + end.length));
console.log("inlined " + body.length + " bytes");
