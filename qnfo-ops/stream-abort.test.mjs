// OPS-STREAM-ABORT-1 offline suite (qnfo-ops 2.59.1, agent_issues 1000162). No network: qnfo-audit is a real node:sqlite database with the cloud_ops_events table. Measured 2026-10-25: three
// client sessions ended in provider_error after 234 s, 318 s and 410 s with inputTokens 0, qnfo-ops analytics showed scriptThrewException and responseStreamDisconnected in the same window, and
// nothing in qnfo-audit said which end of the stream gave up or when (instrumentation first, no speculative fix: the issue says the cause is not known).
// Proves: opsStreamAbort writes one cloud_ops_events row of kind ops_stream_abort with the phase, elapsed time, tool calls, last tool, model, finalize flag and the newest ops_upstream_error of the
// previous ten minutes (id and age); the recorder writes at most one row per request whatever the number of triggers; a failing audit write or a throwing snapshot never reaches the caller; the
// four triggers are wired into handleChatCore (client cancel, runner throw, heartbeat write failure, done write failure) and a normal finish records nothing.
// Run: node --no-warnings qnfo-ops/stream-abort.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const blk = grab("// ---- OPS-STREAM-ABORT-1:BEGIN", "// ---- OPS-STREAM-ABORT-1:END");
ok(blk.length > 2500, "the OPS-STREAM-ABORT-1 block is found");

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT)");
let failWrite = false, n = 0;
const AUDIT = { prepare(sql) { let a = []; const s = { bind: (...x) => { a = x; return s; }, run: async () => { if (failWrite && /INSERT/.test(sql)) throw new Error("D1 down"); const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null }; return s; } };
const lib = new Function("randId", "iso", "VERSION", "console", blk + "\nreturn { opsStreamAbort, opsStreamAbortRecorder };")((p) => p + (++n), () => new Date().toISOString(), "2.59.1-test", { error() {} });
const waits = [];
const ctx = { waitUntil(p) { waits.push(p); } };
const rows = () => db.prepare("SELECT * FROM cloud_ops_events WHERE kind = 'ops_stream_abort'").all();
const snap = () => ({ elapsedMs: 272606, toolCalls: 43, toolOk: 41, lastTool: "shell_exec", model: "ops", servedBy: "deepseek/deepseek-v4-pro", finalized: false });

(async () => {
  // an upstream error two minutes ago is correlated; an older one is not
  db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES ('evt-old', ?, 'ops_upstream_error', 'x', '{}', 'qnfo-ops', 'error')").run(new Date(Date.now() - 40 * 60e3).toISOString());
  db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES ('evt-recent', ?, 'ops_upstream_error', 'upstream 429', '{}', 'qnfo-ops', 'error')").run(new Date(Date.now() - 120e3).toISOString());
  const note = lib.opsStreamAbortRecorder({ QNFO_AUDIT: AUDIT }, ctx, snap);
  ok(note("client-cancel", new Error("The stream was cancelled")) === true, "the first trigger records");
  await Promise.all(waits);
  let r = rows();
  ok(r.length === 1 && r[0].job === "qnfo-ops" && r[0].status === "error" && /^stream client-cancel after 273s, 43 tool call\(s\), last shell_exec$/.test(r[0].text), "one ops_stream_abort row with the phase, elapsed seconds and tool count", r);
  const m = JSON.parse(r[0].meta);
  ok(m.phase === "client-cancel" && m.elapsed_ms === 272606 && m.tool_calls === 43 && m.tool_ok === 41 && m.last_tool === "shell_exec" && m.model === "ops" && m.served_by === "deepseek/deepseek-v4-pro" && m.finalized === false && /cancelled/.test(m.error) && m.version === "2.59.1-test", "the meta carries the snapshot, the error and the version", m);
  ok(m.upstream_error_id === "evt-recent" && m.upstream_error_age_s >= 119 && m.upstream_error_age_s <= 130, "the newest ops_upstream_error of the last ten minutes is correlated (id and age), the 40 minute old one is not", m);
  ok(note("runner-throw", new Error("again")) === false && note("heartbeat-write-failed") === false, "later triggers of the same request record nothing");
  await Promise.all(waits);
  ok(rows().length === 1, "one row per request");

  // no recent upstream error: null fields, still one row
  db.exec("DELETE FROM cloud_ops_events");
  const note2 = lib.opsStreamAbortRecorder({ QNFO_AUDIT: AUDIT }, ctx, () => ({ elapsedMs: 1500, toolCalls: 0, finalized: true }));
  note2("runner-throw", "plain string error");
  await Promise.all(waits);
  r = rows(); const m2 = JSON.parse(r[0].meta);
  ok(r.length === 1 && m2.upstream_error_id === null && m2.upstream_error_age_s === null && m2.finalized === true && m2.last_tool === null && /plain string error/.test(m2.error) && /^stream runner-throw after 2s, 0 tool call\(s\)$/.test(r[0].text), "no upstream error in ten minutes: null correlation; a string error is kept", { r, m2 });

  // failures never reach the caller
  failWrite = true;
  const note3 = lib.opsStreamAbortRecorder({ QNFO_AUDIT: AUDIT }, ctx, snap);
  let threw = false; try { note3("client-cancel"); await Promise.all(waits); } catch (e) { threw = true; }
  ok(!threw, "a failing audit write is swallowed");
  failWrite = false;
  const note4 = lib.opsStreamAbortRecorder({ QNFO_AUDIT: AUDIT }, ctx, () => { throw new Error("snapshot broke"); });
  threw = false; try { note4("client-cancel"); await Promise.all(waits); } catch (e) { threw = true; }
  ok(!threw, "a throwing snapshot is swallowed");
  ok((await lib.opsStreamAbort({}, { phase: "x" })) === false && (await lib.opsStreamAbort(null, { phase: "x" })) === false, "without an audit binding nothing is written and nothing throws");

  // wiring in handleChatCore
  const core = grab("async function handleChatCore(", "__name(handleChat, \"handleChat\");");
  ok(core.length > 5000, "handleChatCore is found");
  ok(/let streamDone = false;\s*\n\s*const noteAbort = opsStreamAbortRecorder\(env, ctx, function\(\) \{/.test(core), "the recorder is created per request next to the stream state");
  ok(/streamController\.close\(\);\s*\n\s*streamDone = true;\s*\n\s*\} catch \(e\) \{\s*\n\s*noteAbort\("done-write-failed", e\);/.test(core), "emitDone marks the stream done after the close and records a failed done write");
  ok(/if \(!streamDone\) noteAbort\("heartbeat-write-failed", e\);/.test(core), "a failed heartbeat write before the done frame is recorded");
  ok(/cancel: [^\n]*function\(reason\) \{[^}]*\}[^}]*if \(!streamDone\) noteAbort\("client-cancel", reason\);/.test(core.replace(/\n/g, " ")), "a cancel before the done frame is recorded as client-cancel");
  ok(/runner\(\)\.catch\(function\(e\) \{\s*\n\s*noteAbort\("runner-throw", e\);/.test(core), "a runner throw is recorded before the terminated chunk is emitted");
  ok(!/noteAbort\([^)]*\)[^;]*finalize/.test(core), "a normal finish calls no abort hook (the hooks sit on failure paths only)");
  ok(/finalized: finalized/.test(core) && /toolLog\.filter\(function\(t\) \{ return t && t\.ok; \}\)\.length/.test(core), "the snapshot reads finalized and the tool log");
  ok(src === readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8"), "deployed-current.worker.js is identical to worker.js");
  const _v = (/^var VERSION = "(\d+)\.(\d+)\.(\d+)/m.exec(src) || []).slice(1).map(Number);
  ok(_v[0] > 2 || (_v[0] === 2 && (_v[1] > 59 || (_v[1] === 59 && _v[2] >= 1))), "VERSION is at least 2.59.1", _v);
  ok(/ops_stream_abort/.test(src), "the event kind of the closing probe is in worker.js");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
