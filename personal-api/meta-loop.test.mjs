import { test } from "node:test";
import assert from "node:assert";
import { metaSignals, recordMeta, metaLoop } from "./companion.js";

test("frustration and themes are read, no words kept", () => {
  const m = metaSignals("The mic is still not working again, this is so frustrating");
  assert.ok(m.flags.includes("frustration") && m.flags.includes("repeat") && m.themes.includes("voice-input") && m.sentiment < 0);
  assert.ok(metaSignals("great, thanks").flags.includes("praise"));
});

function fakeDb(rows, issues) {
  return { prepare(sql) { return { bind(...a) { return {
    run: async () => {
      if (/INSERT INTO cmp_meta/.test(sql)) rows.push({ channel: a[2], sentiment: a[3], flags: a[4], themes: a[5], outcome: a[7] });
      if (/INSERT INTO agent_issues/.test(sql)) issues.push(a[0]);
      return {};
    },
    all: async () => ({ results: rows }),
    first: async () => (/agent_issues/.test(sql) && issues.includes(a[0]) ? { id: 1 } : null),
  }; } }; } };
}

test("three mic failures file exactly one issue", async () => {
  const rows = [], issues = [], db = fakeDb(rows, issues), env = { PERSONAL: db, AUDIT: db };
  for (let i = 0; i < 3; i++) await recordMeta(env, { source: "mic-event", channel: "mic", text: "", outcome: "blocked", words: 0 });
  const r1 = await metaLoop(env, new Date().toISOString()), r2 = await metaLoop(env, new Date().toISOString());
  assert.deepStrictEqual(r1.filed, ["voice-input"]);
  assert.deepStrictEqual(r2.filed, []);
  assert.equal(issues.length, 1);
});
