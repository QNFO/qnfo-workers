// personal-api TOOL-TRACE-MEMORY-1 suite (4.7.1, agent_issues #1805, charter pillar: personal).
// The chat loop logs each tool call as a chat row pair with model "tool" (and MCP calls with model "mcp-tool"), e.g.
// assistant content 'tool:web_search args={"q":"..."} => ERROR search engine unreachable'. Those rows are the internal
// trace, not answers Rowan saw. Proves that loadThreadMemory and the cross-thread block of loadPrimeContext leave them out
// while keeping the real user and assistant turns. Synthetic rows only.
// Run: node personal-api/tool-trace-memory.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const patched = src + "\nexport { loadThreadMemory as __threadMemory, loadPrimeContext as __prime };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));
const { __threadMemory: threadMemory, __prime: prime } = mod;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };

const wrap = (d) => ({
  prepare(sql) {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: d.prepare(sql).all(...args) }; },
      async first() { return d.prepare(sql).get(...args) || null; },
      async run() { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return s;
  },
  async batch(list) { return Promise.all(list.map((x) => x.run())); }
});

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE chat (id TEXT PRIMARY KEY, thread TEXT, ts TEXT, role TEXT, content TEXT, model TEXT, source TEXT, ua TEXT)");
// Empty tables loadPrimeContext reads before its cross-thread block (it returns null if any query throws).
db.exec("CREATE TABLE profile (facet TEXT, label TEXT, statement TEXT, confidence REAL); CREATE TABLE events (id TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, category TEXT, start_date TEXT, end_date TEXT); CREATE TABLE notes (ts TEXT, kind TEXT, content TEXT)");
const ins = db.prepare("INSERT INTO chat (id, thread, ts, role, content, model, source, ua) VALUES (?,?,?,?,?,?,?,?)");
let n = 0;
const row = (thread, ts, role, content, model) => ins.run("c" + (++n), thread, ts, role, content, model, "chatbox", "");
// Thread A: one tool round, then the real answer (the shape logged live on 2026-10-04 in thread t-67ddfcb2ada9dfb9).
row("tA", "2026-10-04T12:46:30.000Z", "user", "What is the weather in San Francisco?", "tool");
row("tA", "2026-10-04T12:46:30.000Z", "assistant", 'tool:web_search args={"q":"San Francisco weather now","k":3} => ERROR search engine unreachable', "tool");
row("tA", "2026-10-04T12:46:54.000Z", "user", "What is the weather in San Francisco?", "personal-twin-chat");
row("tA", "2026-10-04T12:46:54.000Z", "assistant", "The live weather search could not be completed because the search engine was unreachable.", "personal-twin-chat");
// Thread B: an MCP tool call logged with model mcp-tool, then the newest real answer.
row("tB", "2026-10-04T13:08:19.000Z", "user", 'mcp:calendar_list {"from":"2026-10-01"}', "mcp-tool");
row("tB", "2026-10-04T13:08:19.000Z", "assistant", "ok", "mcp-tool");
row("tC", "2026-10-04T13:10:00.000Z", "assistant", "You have two events tomorrow.", "personal-twin-chat");
const env = { PERSONAL: wrap(db) };

{
  const mem = await threadMemory(env, "tA", [{ role: "user", content: "and tomorrow?" }]);
  ok(typeof mem === "string" && mem.indexOf("search engine was unreachable") >= 0, "the real assistant answer stays in thread memory", mem);
  ok(mem.indexOf("tool:web_search") < 0 && mem.indexOf("args=") < 0, "the tool-trace row is not fed back as an ASSISTANT turn", mem);
  ok((mem.match(/USER: What is the weather in San Francisco\?/g) || []).length === 1, "the question appears once, not once per logged round", mem);
}
{
  const mem = await threadMemory(env, "tB", []);
  ok(mem === null, "a thread with only MCP trace rows yields no memory block", mem);
}
{
  const p = await prime(env, "what is on tomorrow", "tZ");
  const cross = typeof p === "string" ? p.slice(p.indexOf("RECENT CROSS-THREAD ANSWERS")) : "";
  ok(cross.indexOf("RECENT CROSS-THREAD ANSWERS") === 0, "the cross-thread block is still built", p);
  ok(cross.indexOf("You have two events tomorrow.") >= 0 && cross.indexOf("search engine was unreachable") >= 0, "real answers from other threads are kept", cross);
  ok(cross.indexOf("tool:web_search") < 0 && !/\]\s+ok\s*(\n|$)/.test(cross), "tool and mcp-tool trace rows are left out of the cross-thread block", cross);
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
