import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const begin = "// ---- CF-OBS-PROBE-ERROR-TELEMETRY-1:BEGIN";
const end = "// ---- CF-OBS-PROBE-ERROR-TELEMETRY-1:END ----";
const start = src.indexOf(begin);
const finish = src.indexOf(end);
assert.ok(start >= 0 && finish > start, "telemetry helper markers are present");

const sandbox = { __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(start, finish + end.length) + "\n__export = rtRecordProbeError;", sandbox);
const recordProbeError = sandbox.__export;

const probeBranchStart = src.indexOf("} else if (rtIsProbeErrorText(os)) {");
const probeBranchEnd = src.indexOf("\n        } else {", probeBranchStart);
assert.ok(probeBranchStart >= 0 && probeBranchEnd > probeBranchStart, "probe-error branch is present");
const probeBranch = src.slice(probeBranchStart, probeBranchEnd);
assert.match(probeBranch, /rtRecordProbeError\(db, c\.class, transport\)/);
assert.doesNotMatch(probeBranch, /console\.error/);
assert.doesNotMatch(probeBranch, /String\(os\)/);

const raw = new DatabaseSync(":memory:");
raw.exec("CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT)");
const db = {
  prepare(sql) {
    const statement = raw.prepare(sql);
    return { bind: (...values) => ({ run: () => statement.run(...values) }) };
  }
};

assert.equal(await recordProbeError(db, "issue-4580", "d1-query"), true);
assert.equal(await recordProbeError(db, "issue-4580", "d1-query"), true);
assert.equal(await recordProbeError(db, "another-probe", "runner-https"), true);
const rows = raw.prepare("SELECT kind, text FROM cloud_ops_events ORDER BY text").all();
assert.equal(rows.length, 2, "repeated probe errors are deduplicated");
assert.deepEqual(rows.map(({ kind }) => kind), ["remediation.probe-error", "remediation.probe-error"]);
assert.ok(rows.some(({ text }) => text === "class=issue-4580 transport=d1-query"));
assert.ok(rows.every(({ text }) => !text.includes("detail") && !text.includes("evt")));

raw.close();
console.log("probe-error-telemetry: passed");
