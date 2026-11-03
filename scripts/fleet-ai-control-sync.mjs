#!/usr/bin/env node
// Single-file canonical deploys cannot resolve imports from _shared.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const shared = readFileSync(join(root, "_shared", "fleet-ai-control.js"), "utf8").replace(/\r\n/g, "\n").trimEnd();
const begin = "// BEGIN FLEET-AI-CONTROL-1";
const end = "// END FLEET-AI-CONTROL-1";
let failed = false;
for (const dir of readdirSync(root)) {
  const path = join(root, dir, "worker.js");
  if (!existsSync(path)) continue;
  const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf(begin), stop = source.indexOf(end);
  if (start < 0) continue;
  if (stop < start) throw new Error(`Incomplete AI control block in ${dir}`);
  const binding = /var FLEET_AI_AUDIT_BINDING = "[A-Z0-9_]+";/.exec(source.slice(start, stop))?.[0];
  const worker = /var FLEET_AI_WORKER = "[a-z0-9-]+";/.exec(source.slice(start, stop))?.[0];
  if (!binding || !worker) throw new Error(`Missing explicit audit binding/worker in ${dir}`);
  const block = `${begin}\n${binding}\n${worker}\n${shared}\n${end}`;
  const updated = source.slice(0, start) + block + source.slice(stop + end.length);
  if (process.argv.includes("--check")) {
    if (updated !== source) { console.error(`${dir}: stale AI control helper`); failed = true; }
    const mirror = join(root, dir, "deployed-current.worker.js");
    if (existsSync(mirror) && readFileSync(mirror, "utf8").replace(/\r\n/g, "\n") !== source) {
      console.error(`${dir}: source/mirror mismatch`); failed = true;
    }
  } else {
    writeFileSync(path, updated);
    const mirror = join(root, dir, "deployed-current.worker.js");
    if (existsSync(mirror)) writeFileSync(mirror, updated);
  }
}
if (failed) process.exitCode = 1;
