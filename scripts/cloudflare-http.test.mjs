#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testFile = fileURLToPath(new URL("./cloudflare_http_test.py", import.meta.url));
const python = process.platform === "win32" ? "python" : "python3";
const result = spawnSync(python, [testFile], { stdio: "inherit" });

if (result.error) {
  console.error("Unable to run Cloudflare HTTP tests:", result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
