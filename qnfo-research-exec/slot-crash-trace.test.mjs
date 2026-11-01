// SLOT-CRASH-TRACE-1 (qnfo-research-exec 0.40.11, agent_issues 1000556, 1000561, 1000562, 1000564, 1000565, 1000566).
// Five days of "slot N: Cannot read properties of undefined (reading 'n')" (1904 events from 2026-10-27) carried no
// location because the runSlot/run catches logged e.message only. 0.40.10 COMPLETE-STRUCTURAL-1 fixed the crash
// itself; this suite proves what keeps the next one from hiding: the catches append the top stack frames to the
// error event, and insertSection survives an unknown section key.
// Run: node qnfo-research-exec/slot-crash-trace.test.mjs -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { insertSection, runSlot } from "./worker.js";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

// 1. Both slot-level catches append stack frames to the error event, so the next crash names its function and line.
const runSlotSrc = src.slice(src.indexOf("async function runSlot("), src.indexOf("async function claimErrataFair("));
ok(/e && e\.stack/.test(runSlotSrc) && /" @ "/.test(runSlotSrc), "runSlot's catch appends stack frames to the error event");
const runSrc = src.slice(src.indexOf("async function run(env)"), src.indexOf("async function leaseAcquire("));
ok(/e && e\.stack/.test(runSrc) && /" @ "/.test(runSrc), "run()'s catch appends stack frames to the error event");

// 2. insertSection with a key outside PAPER_SECTION_ORDER no longer indexes [-1].n.
ok(/if \(at < 0\) at = PAPER_SECTION_ORDER\.length - 1/.test(src), "insertSection clamps an unknown key");
const md = "# T\n\n## 1. Introduction\n\nText.\n\n## 8. Conclusion\n\nDone.\n\n## References\n\n[1] x\n";
let thrown = null, out = "";
try { out = insertSection(md, "NoSuchSection", "Added body text."); } catch (e) { thrown = e; }
ok(thrown === null && out.indexOf("Added body text.") >= 0, "an unknown section key inserts instead of throwing", thrown && thrown.message);

// 3. The numbered sections of a known key are untouched by the clamp (the inserted section lands before Methods).
const out2 = insertSection("# T\n\n## 1. Introduction\n\nText.\n\n## 3. Methods\n\nM.\n", "Background", "New background body.");
ok(out2.indexOf("New background body.") > 0 && out2.indexOf("New background body.") < out2.indexOf("Methods"), "a known key still inserts at its ordered position", out2.slice(0, 200));

// 4. A slot whose stage dispatch throws surfaces the stack in the logged event and returns status error, not a crash.
// (An unmapped stage name makes `fn` undefined, so the call throws synchronously inside runSlot's try — no network,
// no model, deterministic.)
const events = [];
const failingEnv = {
  QNFO_AUDIT: {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => {
              if (/INSERT INTO cloud_ops_events/.test(sql)) events.push(String(args[3]));
              return { meta: { changes: 1 } };
            },
          };
        },
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1 } }),
      };
    },
  },
};
const row = { id: "r1", status: "researching", stage: "bogus-stage", source: "idea", source_id: "idea:x", idea: "test" };
const slotRes = await runSlot(failingEnv, 0, 2, [row]);
ok(slotRes && slotRes.status === "error", "a throwing stage ends the slot as an error, not a crash", slotRes);
ok(events.some((t) => t.indexOf("slot 0:") === 0 && t.indexOf(" @ ") > 0), "the slot error event carries the stack frames", events);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
