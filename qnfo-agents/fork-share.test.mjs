// CMDLINE-FORK-SHARE-1 (issue 8256), offline: the bundle shape of the export and fork routes (the Durable Object needs the Workers runtime).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ts = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");
assert.ok(/\|export\|fork(\|share)?\)\)\?\$/.test(ts), "session route accepts export and fork");
assert.ok(/async exportTranscript\(caller: string/.test(ts) && /session\.caller !== caller/.test(ts), "export is limited to the owning caller");
assert.ok(/async seedFork\(/.test(ts) && /'done', \$\{now\}, \$\{now\}/.test(ts), "fork seeds done turns");
assert.ok(/sessionMatch\[2\] === "fork" && request\.method === "POST"/.test(ts) && /exportTranscript\(caller, Number\(b\.turn\)/.test(ts), "fork copies only the caller's turns up to b.turn");
console.log("fork-share ok");
