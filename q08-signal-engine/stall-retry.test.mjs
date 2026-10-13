// Q08-STALL-RETRY-1 offline suite (q08-signal-engine 0.14.0, agent_issues 2286). While no piece has been published for STALL_RETRY_H hours
// the :30 cron makes a second generation attempt after its audit; never while the :00 attempt may still be running, never when ops_config
// q08_stall_retry is off, never when a piece was published recently. Run: node q08-signal-engine/stall-retry.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const S = mod.__stall;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };

const realNow = Date.now;
const at = (iso) => { Date.now = () => Date.parse(iso); };
const env = (lastPub, lastRun, flag) => ({
  DB: { prepare: (sql) => ({ first: async () => (/published_pieces/.test(sql) ? { t: lastPub } : { t: lastRun }), bind() { return this; } }) },
  AUDIT: { prepare: () => ({ first: async () => (flag ? { value: flag } : null) }) }
});

at("2026-10-12T15:30:05Z");
check("stalled 2 days, :30 tick, :00 attempt recorded at 15:06: due", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 15:06:52")) === true);
check("a piece published 30 minutes ago: not due", await S.stallRetryDue(env("2026-10-12T15:00:05Z", "2026-10-12 15:06:52")) === false);
check("ops_config q08_stall_retry = off: not due", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 15:06:52", "off")) === false);
check("at :30 the :00 attempt is presumed done even before its row lands", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 14:05:52")) === true);
at("2026-10-12T15:10:00Z");
check("ten minutes into the hour with no row yet: the :00 attempt may be running, not due", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 14:05:52")) === false);
check("ten minutes in with this hour's row written: due", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 15:06:52")) === true);
check("a read failure is never a reason to generate", await S.stallRetryDue({ DB: { prepare: () => { throw new Error("D1 down"); } } }) === false);
check("the stall window is two hours", S.STALL_RETRY_H === 2);

// the :30 handler runs the audit first, then generation when due
at("2026-10-12T15:30:05Z");
const order = [];
const waits = [];
const sqlLog = [];
const fakeDB = { prepare: (sql) => { sqlLog.push(sql); const st = { bind: () => st, first: async () => (/MAX\(published_at\)/.test(sql) ? { t: "2026-10-10T06:04:59Z" } : /MAX\(ran_at\)/.test(sql) ? { t: "2026-10-12 15:06:52" } : null), all: async () => ({ results: [] }), run: async () => ({ meta: {} }) }; return st; } };
const fullEnv = { DB: fakeDB, AUDIT: { prepare: () => ({ bind() { return this; }, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }) }, AI: { run: async () => { order.push("ai"); throw new Error("offline"); } } };
await mod.default.scheduled({ cron: "30 * * * *" }, fullEnv, { waitUntil: (p) => waits.push(p) });
await Promise.allSettled(waits);
check("the :30 tick reaches generation when stalled (it reads the published and run times)", sqlLog.some((q) => /MAX\(published_at\)/.test(q)), sqlLog.slice(0, 8));

// Q08-EDITOR-VERDICT-CARRY-1 (0.14.1, run 337): a dropped verdict line is carried over from the writer's draft
{
  const C = mod.__carry;
  const orig = "# T\n\nBody one.\n\nworth your time: yes - names the mechanism";
  const dropped = "# T\n\nBody one, edited.";
  const out = C.carryVerdictLine(dropped, orig);
  check("a dropped verdict line comes back from the writer's draft", /Body one, edited\.\n\nworth your time: yes - names the mechanism$/.test(out), out);
  const own = "# T\n\nEdited.\n\nworth your time: flat - thinner now";
  check("an editor's own verdict line is kept unchanged", C.carryVerdictLine(own, orig) === own);
  const broken = "# T\n\nEdited.\n\nworth your time: maybe";
  check("a malformed verdict line is replaced by the writer's", /worth your time: yes - names the mechanism$/.test(C.carryVerdictLine(broken, orig)) && !/maybe/.test(C.carryVerdictLine(broken, orig)));
  check("no writer verdict line: the text is left as it is", C.carryVerdictLine(dropped, "# T\n\nno line") === dropped);
}

// Q08-EDITOR-TITLE-CARRY-1 (0.14.4, run 343)
{ const C = mod.__carry;
{
  const orig = "# The defrost command nobody authenticated\n\nBody.\n\nworth your time: yes - names the mechanism";
  const long = "# " + "A very long editor title that keeps going ".repeat(4) + "\n\nEdited body.\n\nworth your time: yes - x";
  const fixed = C.carryTitle(long, orig);
  check("an editor title over 100 characters is replaced by the writer's", fixed.startsWith("# The defrost command nobody authenticated\n") && /Edited body\./.test(fixed));
  check("a passing editor title is kept", C.carryTitle("# Short editor title\n\nEdited.", orig) === "# Short editor title\n\nEdited.");
  check("a missing editor title gets the writer's", C.carryTitle("Edited body only.", orig).startsWith("# The defrost command nobody authenticated\n\nEdited body only."));
  check("a writer title that also fails is not carried", C.carryTitle(long, "# " + "x".repeat(120) + "\n\nb") === long);
  check("carryFormat carries both title and verdict", /^# The defrost/.test(C.carryFormat("# " + "y".repeat(120) + "\n\nEdited.", orig)) && /worth your time: yes - names the mechanism$/.test(C.carryFormat("# " + "y".repeat(120) + "\n\nEdited.", orig)));
}
}

// Q08-HANDLE-STRIP-1 (0.14.4, run 346)
{ const C = mod.__carry;
  check("a standalone handle loses its @", C.stripHandles("as @openai said, and (@anthropic)") === "as openai said, and (anthropic)");
  check("an e-mail address is untouched", C.stripHandles("write to a@b.org") === "write to a@b.org");
  check("the @cf/ model prefix is untouched", C.stripHandles("ran on @cf/meta/llama") === "ran on @cf/meta/llama");
  check("normalizeDraft strips handles before the gate", !/@openai/.test(C.normalizeDraft("# T\n\nper @openai.")));
}
// Q08-TITLE-CARRY-2 (0.14.9, run 352)
{ const C = mod.__carry;
  const orig = "# The defrost command nobody authenticated\n\nBody.\n\nworth your time: yes - names the mechanism";
  const lab = C.carryTitle("# Marketing autonomous AI as a wieldable implement\n\nEdited.", orig);
  check("an editor label title (run 352) is replaced by the writer's", lab.startsWith("# The defrost command nobody authenticated\n"), lab.slice(0, 80));
  const tc = C.carryTitle("# The Hidden Cost Of Every Sealed Appliance\n\nEdited.", orig);
  check("an editor Title Case title is replaced by the writer's", tc.startsWith("# The defrost command"), tc.slice(0, 80));
}
// PUBLISH-STALL-DIGEST-1 (0.17.2): the open stall issue is refreshed with a stage digest and escalates after 24 h
{
  check("stage of a fact-check failure", S.stallStage({ status: "gate_failed", error: "accuracy: unsupported claim: x" }) === "fact-check");
  check("stage of a panel failure", S.stallStage({ status: "gate_failed", error: "ensemble: the edited draft was still not worth reading (panel mean 3 of 5)" }) === "reader panel");
  check("stage of a writer gate failure", S.stallStage({ status: "gate_failed", error: "handles: @openai; stock framing tell" }) === "writer gate");
  check("digest counts stages, most first", S.stallDigest([{ status: "gate_failed", error: "accuracy: a" }, { status: "gate_failed", error: "accuracy: b" }, { status: "gate_failed", error: "ensemble: the edited draft was still not worth reading" }]) === "fact-check 2, reader panel 1");
  at("2026-10-12T15:30:05Z");
  const runs = [{ id: 3, status: "gate_failed", piece_published: 0, error: "accuracy: unsupported claim: x" }, { id: 2, status: "gate_failed", piece_published: 0, error: "accuracy: y" }, { id: 1, status: "gate_failed", piece_published: 0, error: "ensemble: the edited draft was still not worth reading (panel mean 2.5 of 5)" }];
  const DB = { prepare: (sql) => { const st = { bind: () => st, all: async () => ({ results: runs }), first: async () => (/MAX\(published_at\)/.test(sql) ? { m: "2026-10-10T06:04:59Z" } : null) }; return st; } };
  const writes = [];
  const AUDIT = { prepare: (sql) => { const st = { args: [], bind: (...a) => { st.args = a; return st; }, first: async () => (/SELECT id FROM agent_issues/.test(sql) ? { id: 2222 } : null), all: async () => ({ results: [] }), run: async () => { writes.push({ sql, args: st.args }); return {}; } }; return st; } };
  await S.stallDetector({ DB, AUDIT });
  const up = writes.find((w) => /^UPDATE agent_issues SET title=\?1, description=\?2, priority=\?3/.test(w.sql));
  check("an open stall issue is rewritten, not left stale", !!up && /57h since the last piece/.test(up.args[0]) && /fact-check 2, reader panel 1/.test(up.args[1]) && up.args[2] === "critical" && up.args[4] === 2222, up && up.args.slice(0, 3));
  check("no second issue is inserted while one is open", !writes.some((w) => /^INSERT INTO agent_issues/.test(w.sql)));
}

Date.now = realNow;
console.log("stall-retry.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
