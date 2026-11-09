// RES-NUMBER-DRIFT-1: pfResDrift names duplicate RES codes, repositories claimed by two codes and the next free number.
import fs from "node:fs";
import assert from "node:assert/strict";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const start = src.indexOf("function pfResDrift(rows) {");
assert.ok(start > 0, "pfResDrift exists");
const end = src.indexOf("\nasync function pfUpsert", start);
const pfResDrift = new Function(src.slice(start, end) + "; return pfResDrift;")();
const d = pfResDrift([{ wbs_code: "RES.030", github_repo: "QNFO/x" }, { wbs_code: "RES.031", github_repo: "QNFO/x" }, { wbs_code: "RES.030" }]);
assert.equal(d.res_number_drift, 2);
assert.deepEqual(d.duplicate_codes, ["RES.030"]);
assert.equal(d.next_free, "RES.032");
assert.equal(pfResDrift([]).res_number_drift, 0);
assert.ok(src.includes("res_number_drift: resDrift"), "portfolioSync reports it");
console.log("res-drift ok");
