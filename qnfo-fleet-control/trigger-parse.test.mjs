// TRIGGER-PARSE-1: the value a metric trigger is judged on is a number only when the whole string is one.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- TRIGGER-PARSE-1:BEGIN"), src.indexOf("// ---- TRIGGER-PARSE-1:END"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { triggerNum };", sandbox);
const { triggerNum } = sandbox.__export;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const cases = [
  ["0.64", 0.64], ["44", 44], [" 6010 ", 6010], ["-3", -3], ["+348.89%", 348.89], ["72 %", 72], [".5", 0.5], ["5.", 5], [0, 0], [224.55, 224.55],
  ["12 of 20", null], ["3 (of 7 works)", null], ["n/a", null], ["n/a: OpenAlex readings cover 3 of the 7 selected works", null],
  ["2026-10-02", null], ["1 day", null], ["", null], ["  ", null], [null, null], [undefined, null], ["1e3", null], ["NaN", null], ["Infinity", null], ["1,220", null]
];
for (const [input, want] of cases) check(triggerNum(input) === want, JSON.stringify(input) + " -> " + want);
check(!/replace\(\/\[\^0-9\.\+-eE\]\/g/.test(src), "the range-bug reader is gone from worker.js");
check(/var num = function \(r, f\) \{ return r \? triggerNum\(r\[f\]\) : null; \};/.test(src), "metricTriggerValue reads through triggerNum");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
