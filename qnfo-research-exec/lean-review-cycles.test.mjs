import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const atLeast = (version, minimum) => {
  const actual = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || ""));
  const required = minimum.split(".").map(Number);
  if (!actual) return false;
  for (let i = 0; i < required.length; i++) {
    if (Number(actual[i + 1]) !== required[i]) return Number(actual[i + 1]) > required[i];
  }
  return true;
};
const fn = (name) => {
  const start = src.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  return src.slice(start, src.indexOf("\n}\n", start) + 2);
};
const declarations = [
  "var MAX_REVIEW_CYCLES = 6;",
  "var MAX_REVIEW_CYCLES_MIN = 1;",
  "var MAX_REVIEW_CYCLES_MAX = 12;",
  "var MAX_REVIEW_CYCLES_LEAN = 3;",
].join("\n");
const reviewCycleCap = new Function(
  declarations + "\n" + fn("leanEnsemble") + "\n" + fn("maxReviewCycles") + "\n" + fn("reviewCycleCap") + "\nreturn reviewCycleCap;"
)();
let pass = 0;
let fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (value === undefined ? "" : " :: " + JSON.stringify(value)));
  }
};
const env = ({ breached = false, configured = 6, disabled = false, budgetError = false } = {}) => ({
  QNFO_AUDIT: {
    prepare(sql) {
      return {
        async first() {
          if (sql.includes("research_max_review_cycles")) return configured == null ? null : { value: String(configured) };
          if (sql.includes("research_lean_ensemble")) return disabled ? { value: "off" } : null;
          if (sql.includes("fleet_budget")) {
            if (budgetError) throw new Error("budget read unavailable");
            return { n: breached ? 1 : 0 };
          }
          throw new Error("unexpected query");
        },
      };
    },
  },
});

ok(await reviewCycleCap(env()) === 6, "the configured review-cycle limit remains unchanged when budgets are clear");
ok(await reviewCycleCap(env({ breached: true })) === 3, "a breached AI spend cap limits review/revise retries to three cycles");
ok(await reviewCycleCap(env({ breached: true, configured: 12 })) === 3, "a breached cap also clamps a higher configured limit");
ok(await reviewCycleCap(env({ breached: true, configured: 2 })) === 2, "a lower configured limit remains respected");
ok(await reviewCycleCap(env({ breached: true, disabled: true })) === 6, "the existing lean-ensemble opt-out restores the configured limit");
ok(await reviewCycleCap(env({ budgetError: true })) === 3, "an unreadable budget follows the existing lean-mode safe default");
ok(src.includes("const _cycleCap = await reviewCycleCap(env);") &&
  /if \(hard\.length && cycle < _cycleCap && !_rising\)/.test(src) &&
  /if \(_blocking\.length\) \{/.test(src),
"the smaller retry budget is wired into review while unresolved HARD findings remain blocking");
const version = /^var VERSION = "([^"]+)"/m.exec(src)?.[1];
ok(atLeast(version, "0.42.2"), "the worker retains the lean-review-cycles version or newer", version);

console.log(`lean-review-cycles: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
