// COMPANION-NO-TYPING-1:talk-cost (agent_issues 1001641, owner 2026-10-29: "LLM cost keeps adding up"): the Talk tab's two one-tap asks are answered from the calendar
// and next actions with no model call, and an identical single-turn ask is answered from a ten-minute copy. Words with a risk signal never take either shortcut.
// Runs the real companion against the phone-journey harness (in-memory D1, fake chat model that returns a fixed sentence).
import assert from "node:assert/strict";
import * as C from "./companion.js";
import { startCompanion, CHAT_REPLY } from "../scripts/ux-journeys/apps/companion-harness.mjs";

let pass = 0;
const ok = (name, cond, detail) => { assert.ok(cond, name + (detail === undefined ? "" : " :: " + JSON.stringify(detail))); pass++; };

// ---- pure part
ok("the two presets are recognised, ignoring case and spaces", C.talkPresetKind("What is on today?") === "today" && C.talkPresetKind("  what is NEXT? ") === "next");
ok("other words are not presets", C.talkPresetKind("What is on today? and tomorrow") === null && C.talkPresetKind("") === null && C.talkPresetKind(null) === null);
const t = { hour: 10.5, agenda: { calendar: { state: "ok" }, today: [{ title: "Dentist", start: "2026-11-05T09:00:00", all_day: false }, { title: "Call mum", start: "2026-11-05T12:30:00", all_day: false }, { title: "Holiday", start: "2026-11-05", all_day: true }] },
  next_actions: [{ title: "Tidy the desk", minutes: 15 }, { title: "Read one chapter", minutes: 30 }], one_thing: { title: "Tidy the desk", minutes: 15 } };
const today = C.localTalkAnswer("today", t);
ok("today lists the events with their times and the next actions", /09:00 Dentist; 12:30 Call mum; Holiday\./.test(today) && /Next actions: Tidy the desk; Read one chapter\./.test(today), today);
const next = C.localTalkAnswer("next", t);
ok("next names the first event still ahead and the one thing to do, not the finished one", /Next on your calendar: 12:30 Call mum\./.test(next) && !/Dentist/.test(next) && /Next thing to do: Tidy the desk \(about 15 min\)\./.test(next), next);
ok("an empty day says so plainly", /Nothing on your calendar today\. No open next actions\./.test(C.localTalkAnswer("today", { agenda: { today: [] }, next_actions: [] })));
ok("an unreadable calendar is not reported as an empty day", /could not read the calendar/.test(C.localTalkAnswer("today", { agenda: { calendar: { state: "unreachable" }, today: [] }, next_actions: [] })));
ok("the cache key is a hash of the normalised ask, never the ask", (await C.talkCacheKey("  Hello   THERE ")) === (await C.talkCacheKey("hello there")) && !/hello/.test(await C.talkCacheKey("hello there")) && (await C.talkCacheKey("   ")) === null);
ok("the cache table is in the privacy list, so export and delete cover it", C.PRIVACY_TABLES.some((x) => x.table === "cmp_talk_cache"));

// ---- through the real route
const h = await startCompanion();
try {
  const cookie = (await fetch(h.base + "/__harness/session")).headers.get("set-cookie").split(";")[0];
  const chat = async (messages) => (await fetch(h.base + "/companion/api/chat", { method: "POST", headers: { Cookie: cookie, "X-Companion": "1", "Content-Type": "application/json" }, body: JSON.stringify({ messages }) })).json();
  const rows = async () => Number((await h.raw.prepare("SELECT COUNT(*) AS n FROM cmp_talk_cache").get()).n);

  let r = await chat([{ role: "user", content: "What is on today?" }]);
  ok("a preset is answered locally from the seeded next actions, with no model reply", r.ok && r.how === "local" && /Call the dentist/.test(r.reply) && r.reply !== CHAT_REPLY, r);
  r = await chat([{ role: "user", content: "What is next?" }]);
  ok("what is next is local too", r.ok && r.how === "local" && /Next thing to do:/.test(r.reply), r);
  ok("a local answer writes no cache row", (await rows()) === 0);

  r = await chat([{ role: "user", content: "Tell me something kind" }]);
  ok("a first free ask goes to the model", r.ok && r.how === "model" && r.reply === CHAT_REPLY, r);
  ok("and leaves one cache row", (await rows()) === 1);
  h.raw.prepare("UPDATE cmp_talk_cache SET reply = 'copy of the first answer'").run();
  r = await chat([{ role: "user", content: " tell me SOMETHING kind " }]);
  ok("the same ask within ten minutes is answered from the copy", r.ok && r.how === "cached" && r.reply === "copy of the first answer", r);
  h.raw.prepare("UPDATE cmp_talk_cache SET ts = ?").run(new Date(Date.now() - 11 * 60 * 1000).toISOString());
  r = await chat([{ role: "user", content: "Tell me something kind" }]);
  ok("after ten minutes it goes to the model again", r.ok && r.how === "model" && r.reply === CHAT_REPLY, r);

  r = await chat([{ role: "assistant", content: "Hello" }, { role: "user", content: "Tell me something kind" }]);
  ok("a follow-up inside a conversation is never served from the copy", r.how === "model", r);

  const before = await rows();
  r = await chat([{ role: "user", content: "I want to kill myself" }]);
  ok("words with a risk signal skip the cache and still carry the crisis lines", r.how === "model" && !!r.crisis && (await rows()) === before, r);
} finally { await h.close(); }

console.log("companion-talk-local: " + pass + " passed");
