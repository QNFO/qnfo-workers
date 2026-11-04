import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const r = spawnSync("python3", ["-I", join(HERE, "view_health.py")], { encoding: "utf8", timeout: 60000 });
if (r.status !== 0 || !/selftest ok/.test(r.stdout)) { console.error(r.stdout + r.stderr); process.exit(1); }
console.log("ok");
