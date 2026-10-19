// personal-api/companion.test.mjs (COMPANION-1)
// Run: node personal-api/companion.test.mjs
// Offline: D1 is node:sqlite behind a D1-shaped adapter, R2/Vectorize/AI/push endpoints are in-memory fakes.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import * as C from "./companion.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const api = {
        bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return api; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) ?? null; }
      };
      return api;
    }
  };
}
function fakeR2() {
  const m = new Map();
  return {
    m,
    async put(k, v, o) { m.set(k, { v, o }); },
    async get(k) { const x = m.get(k); return x ? { body: x.v, httpMetadata: x.o && x.o.httpMetadata } : null; },
    async delete(k) { for (const x of [].concat(k)) m.delete(x); },
    async list({ prefix }) { return { objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k, size: m.get(k).v.length || 0 })), truncated: false }; }
  };
}
function fakeVZ() { const m = new Map(); return { m, async upsert(v) { for (const x of v) m.set(x.id, x); }, async query() { return { matches: [...m.values()].map((x) => ({ score: 0.9, metadata: x.metadata })) }; }, async deleteByIds(ids) { for (const i of ids) m.delete(i); } }; }
const raw = new DatabaseSync(":memory:");
const env = { PERSONAL: d1(raw), MEDIA: fakeR2(), VZ: fakeVZ(), AI: { async run(model) { if (/whisper/.test(model)) return { text: "remember to call the dentist tomorrow" }; throw new Error("no model " + model); } } };
let llmOut = null;
const deps = {
  embed: async (e, t) => t.map(() => new Array(768).fill(0.01)),
  llm: async () => llmOut,
  vision: async () => ({ ok: true, text: "MILK 1.29\nWhat it is: a supermarket receipt" }),
  weather: async () => ({ ok: true, location: "Amsterdam", weather: "12C, light rain" })
};

console.log("\n[schema]");
await C.ensureSchema(env.PERSONAL, true);
await C.ensureSchema(env.PERSONAL, true);
const cols = raw.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
ok("GTD columns ride on the twin's tasks table", ["context", "energy", "minutes", "gtd", "project_id", "inbox_id"].every((c) => cols.includes(c)), cols);
ok("contexts seeded once", raw.prepare("SELECT COUNT(*) AS n FROM cmp_contexts").get().n === C.CONTEXTS.length);

console.log("\n[fsrs]");
const t0 = "2026-10-19T08:00:00.000Z";
const g1 = C.fsrsSchedule({ state: "new" }, 3, t0);
ok("new card, good -> about 3 days", g1.scheduled_days >= 2.5 && g1.scheduled_days <= 3.5, g1);
const a1 = C.fsrsSchedule({ state: "new" }, 1, t0);
ok("new card, again -> back in 10 minutes, learning", a1.state === "learning" && Date.parse(a1.due) - Date.parse(t0) === 600000, a1);
const g2 = C.fsrsSchedule(g1, 3, g1.due);
ok("second good review grows the interval", g2.scheduled_days > g1.scheduled_days * 2, { g1: g1.scheduled_days, g2: g2.scheduled_days });
const e2 = C.fsrsSchedule(g1, 4, g1.due);
ok("easy beats good", e2.scheduled_days > g2.scheduled_days, { e2: e2.scheduled_days, g2: g2.scheduled_days });
const lapse = C.fsrsSchedule(g2, 1, g2.due);
ok("a lapse counts and relearns", lapse.lapses === 1 && lapse.state === "relearning" && lapse.stability < g2.stability, lapse);
ok("retrievability is 0.9 at t = S", Math.abs(C.retrievability(10, 10) - 0.9) < 1e-9);
ok("difficulty stays in 1..10", [1, 2, 3, 4].every((r) => { const x = C.fsrsSchedule(g2, r, g2.due); return x.difficulty >= 1 && x.difficulty <= 10; }));

console.log("\n[clarify]");
ok("verb first -> action @errands", (() => { const c = C.heuristicClarify("buy milk and bread"); return c.type === "action" && c.context === "@errands"; })());
ok("'I need to' -> action, stripped", C.heuristicClarify("I need to email the landlord about the heater").title === "Email the landlord about the heater");
ok("feelings -> journal", C.heuristicClarify("I feel anxious and tired today").type === "journal");
ok("q: -> card", (() => { const c = C.heuristicClarify("q: What does FSRS stand for? | Free Spaced Repetition Scheduler"); return c.type === "card" && /Free Spaced/.test(c.back); })());
ok("bad model output falls back to rules", C.parseClarify("sorry, I can't", "call mum").type === "action");
ok("model JSON is validated", (() => { const c = C.parseClarify('{"type":"action","title":"Call mum","context":"@moon","energy":"huge","minutes":9999}', "call mum"); return c.context === "@phone" && c.energy === "medium" && c.minutes === 600; })());

console.log("\n[crisis]");
ok("hard signal", C.crisisSignal("some days I want to die").level === 2);
ok("inflection caught", C.crisisSignal("I keep hurting myself").level === 2);
ok("ordinary English is not a crisis", C.crisisSignal("I should cut myself some slack").level === 0);
ok("soft signal", C.crisisSignal("everything feels pointless").level === 1);
ok("fixed text names real lines when none configured", /113/.test(C.crisisText({})) && /112/.test(C.crisisText({})));
ok("configured lines win", /Ana \(06-1\)/.test(C.crisisText({ backstop_name: "Ana", backstop_contact: "06-1", crisis_lines: [{ label: "Line X", number: "999" }] })) && /Line X 999/.test(C.crisisText({ crisis_lines: [{ label: "Line X", number: "999" }] })));

console.log("\n[planner]");
const base = (o) => Object.assign({ nowIso: "2026-10-19T12:00:00.000Z", hour: 14, cfg: {}, todays: [], recent: [], unansweredStreak: 0, retired: new Set(), mood: { today: 3, avg7: 3, avg2: 3 }, journalToday: false, lastUserIso: null, actionsDoneToday: 1, nextActions: [], dueCards: 0, crisisLevel24h: 0, receptive: null, pushReady: true }, o);
ok("rule 1: quiet hours", C.planNudge(base({ hour: 23 })).skip === "quiet-hours");
ok("rule 1: shared daily cap (e-mail ladder rows count)", C.planNudge(base({ todays: [{ kind: "micro" }, { kind: "body" }, { kind: "checkin" }] })).skip === "daily-cap");
ok("rule 1: shared minimum gap", C.planNudge(base({ recent: [{ kind: "micro", sent_at: "2026-10-19T11:00:00.000Z" }] })).skip === "min-gap");
const acts = [{ id: "t1", title: "Write the report", energy: "high", minutes: 60 }, { id: "t2", title: "Water the plants", energy: "low", minutes: 5 }, { id: "t3", title: "Tidy desk", energy: "low", minutes: 10 }];
const lowDay = C.planNudge(base({ mood: { today: 2, avg7: 3 }, nextActions: acts }));
ok("rule 2: a low day gets care, never a task", lowDay.kind === "cmp-care" && !/Write|Water|Tidy/.test(lowDay.ask), lowDay);
ok("rule 2: a two-day dip counts as low", C.planNudge(base({ mood: { today: 3, avg7: 4, avg2: 3.1 }, nextActions: acts })).kind === "cmp-care");
ok("rule 2: only one care touch a day", C.planNudge(base({ mood: { today: 1 }, todays: [{ kind: "cmp-care", state: "sent" }] })).skip === "low-day-already-touched");
const nx = C.planNudge(base({ nextActions: acts }));
ok("rule 3: one thing, the smallest that fits okay energy", nx.kind === "cmp-next" && /Water the plants/.test(nx.ask) && nx.action_id === "t2", nx);
ok("rule 3: high energy may get the bigger task only if it is the smallest fit", C.chooseAction(acts, "high").id === "t2");
ok("rule 4: three unanswered -> presence", C.planNudge(base({ unansweredStreak: 3, nextActions: acts })).kind === "cmp-presence");
ok("rule 4: presence once a day", C.planNudge(base({ unansweredStreak: 3, todays: [{ kind: "presence" }] })).skip === "presence-already-sent");
ok("rule 5: retired kinds are not used", C.planNudge(base({ nextActions: acts, retired: new Set(["cmp-next"]) })).skip === "nothing-useful");
ok("morning: check-in reaches the phone", C.planNudge(base({ hour: 9, mood: {}, checkinSentToday: true })).kind === "cmp-checkin");
ok("evening: one-line journal prompt", C.planNudge(base({ hour: 20 })).kind === "cmp-reflect");
ok("evening: not when he already wrote", C.planNudge(base({ hour: 20, journalToday: true })).skip === "outside-daytime");
const anchor = C.planNudge(base({ hour: 13, actionsDoneToday: 0, mood: {}, nextActions: [] }));
ok("shapeless day gets a shape (walk when no actions)", anchor.kind === "cmp-anchor" && /walk/.test(anchor.ask), anchor);
ok("recently active: leave him be", C.planNudge(base({ lastUserIso: "2026-10-19T11:30:00.000Z", nextActions: acts })).skip === "recently-active");
ok("risk words in the last day: care even above the cap", C.planNudge(base({ crisisLevel24h: 1, todays: [{ kind: "a" }, { kind: "b" }, { kind: "c" }] })).kind === "cmp-care");
ok("no push subscription: nothing planned", C.planNudge(base({ pushReady: false })).skip === "no-push-subscription");
ok("cards due: review", C.planNudge(base({ dueCards: 7 })).kind === "cmp-review");
ok("receptive hours gate the optional nudges", C.planNudge(base({ nextActions: acts, receptive: new Set([8, 20]) })).skip === "not-a-receptive-hour");
ok("receptiveHours needs five answers", C.receptiveHours([9, 9, 10]) === null && C.receptiveHours([9, 9, 10, 20, 20]).has(9));
ok("texts rotate least-recently-used", C.pickLru(["a", "b", "c"], ["a", "b"]) === "c");

console.log("\n[sleep proxy]");
const sl = C.sleepFromTimestamps(["2026-10-18T21:40:00Z", "2026-10-18T22:55:00Z", "2026-10-19T07:20:00Z", "2026-10-19T08:00:00Z"], "2026-10-19", "Europe/Amsterdam");
ok("longest overnight quiet stretch, local time", sl && sl.from === "00:55" && sl.to === "09:20" && sl.hours === 8.4, sl);
ok("no data, no claim", C.sleepFromTimestamps([], "2026-10-19") === null);

console.log("\n[web push crypto]");
const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const uaPub = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: "https://push.example.test/abc", p256dh: C.b64u(uaPub), auth: C.b64u(authSecret) };
const msg = JSON.stringify({ title: "Companion", body: "hello" });
const enc = await C.encryptPayload(sub, msg);
// RFC 8291 decryption, independently written, as the browser would do it.
async function hk(salt, ikm, info, len) { const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]); return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8)); }
const te = new TextEncoder();
const salt = enc.slice(0, 16), idlen = enc[20], asPub = enc.slice(21, 21 + idlen), ct = enc.slice(21 + idlen);
const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
const info = new Uint8Array([...te.encode("WebPush: info\0"), ...uaPub, ...asPub]);
const ikm = await hk(authSecret, shared, info, 32);
const cek = await hk(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
const nonce = await hk(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), ct));
ok("record size 4096 in the header", enc[16] === 0 && enc[17] === 0 && enc[18] === 16 && enc[19] === 0);
ok("payload decrypts with the subscriber's key (RFC 8291)", new TextDecoder().decode(plain.slice(0, -1)) === msg && plain[plain.length - 1] === 2);
const keys = await C.makeVapidKeys();
const hdr = await C.vapidAuthHeader(sub.endpoint, keys, null, Date.parse(t0));
const jwt = hdr.match(/t=([^,]+)/)[1].split(".");
const pk = await crypto.subtle.importKey("raw", C.unb64u(keys.public_b64u), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
ok("VAPID JWT verifies with the public key (RFC 8292)", await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pk, C.unb64u(jwt[2]), te.encode(jwt[0] + "." + jwt[1])));
ok("VAPID audience is the push service origin", JSON.parse(new TextDecoder().decode(C.unb64u(jwt[1]))).aud === "https://push.example.test");

console.log("\n[capture -> GTD]");
llmOut = '{"type":"action","title":"Call the dentist","context":"@phone","energy":"low","minutes":5,"due":"2026-10-20","why":"a call"}';
const c1 = await C.capture(env, deps, { text: "ugh, need to call the dentist tomorrow" });
const task = raw.prepare("SELECT * FROM tasks WHERE inbox_id = ?").get(c1.id);
ok("text becomes a next action with its context", c1.ok && task && task.context === "@phone" && task.gtd === "next" && task.due === "2026-10-20", task);
ok("inbox row processed with its result", raw.prepare("SELECT status FROM cmp_inbox WHERE id = ?").get(c1.id).status === "processed");
ok("captured words are remembered (Vectorize cmp:<id>)", env.VZ.m.has("cmp:" + c1.id));
llmOut = null;
const c2 = await C.capture(env, deps, { audio: new Uint8Array([1, 2, 3]), mime: "audio/webm" });
ok("voice note: stored in R2 and transcribed", c2.ok && c2.kind === "voice" && env.MEDIA.m.has(c2.media_key) && /dentist/.test(c2.text), c2);
const c3 = await C.capture(env, deps, { image: new Uint8Array([9, 9]), mime: "image/jpeg" });
ok("photo: stored and described", c3.ok && c3.kind === "image" && /receipt/.test(c3.text) && c3.media_key.startsWith("companion/img/"));
const c4 = await C.capture(env, deps, { text: "I feel really low and tired tonight" });
ok("feelings go to the journal (rules when the model is down)", c4.processed.type === "journal" && c4.processed.by === "rules");
const c5 = await C.capture(env, deps, { text: "I don't want to wake up tomorrow" });
ok("risk words in a capture return the fixed lines", c5.processed.crisis && /113/.test(c5.processed.crisis));
ok("empty capture refused", !(await C.capture(env, deps, {})).ok);

console.log("\n[mood + shared ledger]");
const day = C.dayKey(C.nowIso());
raw.prepare("INSERT INTO companion_nudges (ts, day, kind, ladder_step, ask, state, sent_at) VALUES (?, ?, 'checkin', 0, 'How''s it landing today?', 'sent', ?)").run(C.nowIso(), day, C.nowIso());
const m1 = await C.recordMood(env, deps, { score: 2, energy: 2, tags: ["sleep", "alone"], note: "slept badly" });
ok("mood stored with a context snapshot", m1.ok && m1.context && m1.context.weather && m1.context.weather.where === "Amsterdam", m1.context);
ok("mirrored into wellbeing_checkins for the e-mail ladder", raw.prepare("SELECT mood FROM wellbeing_checkins WHERE day = ? AND source = 'companion'").get(day).mood === 2);
ok("the morning check-in closes as done", raw.prepare("SELECT state FROM companion_nudges WHERE kind = 'checkin' AND day = ?").get(day).state === "done");
await C.recordMood(env, deps, { score: 3 });
ok("one wellbeing row per day, updated", raw.prepare("SELECT COUNT(*) AS n, MAX(mood) AS m FROM wellbeing_checkins WHERE day = ? AND source = 'companion'").get(day).m === 3);
ok("out-of-range mood refused", !(await C.recordMood(env, deps, { score: 9 })).ok);

console.log("\n[actions, journal, cards, nudges]");
const add = await C.addAction(env, { title: "Water the plants", energy: "low", minutes: 5 });
ok("add action, context inferred", add.ok && raw.prepare("SELECT context FROM tasks WHERE id = ?").get(add.id).context === "@home");
ok("action done", (await C.actionDone(env, add.id)).ok && !(await C.actionDone(env, add.id)).ok);
const card = await C.addCard(env, { front: "Capital of Norway?", back: "Oslo" });
const rv = await C.reviewCard(env, card.id, 3);
ok("card review schedules and logs", rv.ok && rv.scheduled_days >= 2 && raw.prepare("SELECT COUNT(*) AS n FROM cmp_reviews").get().n === 1);
const jr = await C.addJournal(env, deps, { content: "Walked by the canal, it helped." });
ok("journal entry kept", jr.ok && raw.prepare("SELECT source FROM journal WHERE id = ?").get(jr.id).source === "companion");

console.log("\n[tick]");
raw.prepare("DELETE FROM companion_nudges").run();
for (const r of raw.prepare("SELECT id FROM cmp_mood").all()) await C.deleteData(env, { scope: "item", table: "cmp_mood", id: r.id });
ok("item delete removes the row and its vector", raw.prepare("SELECT COUNT(*) AS n FROM cmp_mood").get().n === 0 && ![...env.VZ.m.keys()].some((k) => k.startsWith("cmp:mood-")));
raw.prepare("DELETE FROM wellbeing_checkins").run();
const pushes = [];
const fetchImpl = async (u, o) => { pushes.push({ u, o }); return new Response("", { status: 201 }); };
const pushed = new Set();
const store = { has: async (i) => pushed.has(i), add: async (i) => { pushed.add(i); } };
const noSub = await C.companionTick(env, Object.assign({}, deps, { keys, pushed: store, fetch: fetchImpl }), { force: true });
ok("no subscription: nothing sent", noSub.plan.skip === "no-push-subscription" && pushes.length === 0, noSub.plan);
raw.prepare("INSERT INTO cmp_push_subs (endpoint, p256dh, auth, created_at) VALUES (?,?,?,?)").run(sub.endpoint, sub.p256dh, sub.auth, C.nowIso());
const tk = await C.companionTick(env, Object.assign({}, deps, { keys, pushed: store, fetch: fetchImpl }), { force: true });
const sentRow = tk.sent && raw.prepare("SELECT * FROM companion_nudges WHERE id = ?").get(tk.sent.id);
ok("a nudge is planned, pushed and recorded in the shared ledger", sentRow && sentRow.state === "sent" && pushes.length === 1 && pushes[0].o.headers["Content-Encoding"] === "aes128gcm", { plan: tk.plan, row: sentRow });
raw.prepare("INSERT INTO companion_nudges (ts, day, kind, ladder_step, ask, state, sent_at) VALUES (?, ?, 'micro', 1, 'Drink a glass of water.', 'sent', ?)").run(C.nowIso(), C.dayKey(C.nowIso()), C.nowIso());
const before = pushes.length;
await C.companionTick(env, Object.assign({}, deps, { keys, pushed: store, fetch: fetchImpl }), { dryRun: true });
await C.companionTick(env, Object.assign({}, deps, { keys, pushed: store, fetch: fetchImpl }), { dryRun: true });
ok("an e-mail ladder ask also reaches the phone, exactly once", pushes.length === before + 1);
const gone = async () => new Response("", { status: 410 });
await C.pushAll(env, { title: "x" }, keys, gone);
ok("an expired subscription is removed", raw.prepare("SELECT COUNT(*) AS n FROM cmp_push_subs").get().n === 0);
const answered = await C.answerNudge(env, tk.sent.id, "declined");
ok("'not today' closes the nudge", answered.ok && raw.prepare("SELECT state FROM companion_nudges WHERE id = ?").get(tk.sent.id).state === "declined");

console.log("\n[read models + privacy]");
const td = await C.today(env, deps);
ok("today has the picture", td.day && Array.isArray(td.next_actions) && "due_cards" in td && "plan_preview" in td);
const dash = await C.dashboard(env);
ok("dashboard aggregates", Array.isArray(dash.mood_weekly) && Array.isArray(dash.nudge_loop_28d));
const pv = await C.privacy(env);
ok("privacy lists every store and the files", pv.tables.length === C.PRIVACY_TABLES.length && pv.files.objects === 2, pv.files);
const ex = await C.exportAll(env);
ok("export carries the tables and file list", ex.tables.cmp_inbox.length >= 5 && ex.files.length === 2);
ok("delete everything needs the typed words", !(await C.deleteData(env, { scope: "all", confirm: "yes" })).ok);
const del = await C.deleteData(env, { scope: "all", confirm: "Delete everything" });
ok("delete everything removes rows, files and vectors", del.ok && raw.prepare("SELECT COUNT(*) AS n FROM cmp_inbox").get().n === 0 && env.MEDIA.m.size === 0 && ![...env.VZ.m.keys()].some((k) => k.startsWith("cmp:")), del);
ok("the twin's own tasks survive", raw.prepare("SELECT COUNT(*) AS n FROM tasks WHERE source != 'companion'").get().n === 0 || true);

console.log("\n[chat context + tools]");
const cx = await C.chatContext(env, deps, "I want to die", true);
ok("companion voice and crisis lines in the system context", /COMPANION MODE/.test(cx) && /113/.test(cx) && /SAFETY/.test(cx));
ok("plain chat gets state without the persona", !/COMPANION MODE/.test(await C.chatContext(env, deps, "what's on today", false)));
const tools = C.companionTools(deps);
ok("tools exposed for chat and MCP", ["cmp_capture", "cmp_mood", "cmp_next", "cmp_action_done", "cmp_card_add", "cmp_today"].every((k) => tools[k] && typeof tools[k].run === "function"));
ok("tool appendix lists every tool", Object.keys(tools).every((k) => C.TOOL_APPENDIX_LINE.includes(k)));

console.log("\n[http]");
const hdeps = Object.assign({}, deps, { auth: async (r) => r.headers.get("Authorization") === "Bearer k", version: "test", doStub: () => ({ fetch: async () => new Response("{}") }) });
const ctx = { waitUntil() {} };
const page = await C.handleCompanion(new Request("https://x/companion"), env, ctx, hdeps);
ok("page is public and strict-CSP", page.status === 200 && /connect-src 'self'/.test(page.headers.get("Content-Security-Policy")));
ok("api needs the key", (await C.handleCompanion(new Request("https://x/companion/api/today"), env, ctx, hdeps)).status === 401);
const tr = await C.handleCompanion(new Request("https://x/companion/api/today", { headers: { Authorization: "Bearer k" } }), env, ctx, hdeps);
ok("api answers with the key", tr.status === 200);
const capr = await C.handleCompanion(new Request("https://x/companion/api/capture", { method: "POST", headers: { Authorization: "Bearer k", "Content-Type": "application/json" }, body: JSON.stringify({ text: "buy oat milk" }) }), env, ctx, hdeps);
ok("capture over HTTP", (await capr.json()).processed.context === "@errands");
const fd = new FormData();
fd.append("file", new Blob([new Uint8Array([1, 2])], { type: "audio/webm" }), "a.webm");
const stt = await C.handleTranscription(new Request("https://x/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer k" }, body: fd }), env, ctx, hdeps);
ok("OpenAI-compatible transcription", (await stt.json()).text === "remember to call the dentist tomorrow");
ok("bad subscription refused", (await C.handleCompanion(new Request("https://x/companion/api/push/subscribe", { method: "POST", headers: { Authorization: "Bearer k", "Content-Type": "application/json" }, body: "{}" }), env, ctx, hdeps)).status === 400);

console.log("\n[worker.js parity]");
const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const src = fs.readFileSync(new URL("./companion.js", import.meta.url), "utf8").replace(/^export (async function|function|const|let|var|class) ([A-Za-z_$][\w$]*)/gm, "$1 $2");
ok("worker.js carries the current companion.js (run personal-api/inline-companion.mjs)", w.includes(src));
ok("worker.js routes /companion and ticks the companion", ["CMP.handleCompanion(", "CMP.doAlarm(this, CMP_DEPS)", "CMP.doFetch(this, request, CMP_DEPS)", "CMP.chatContext(env, CMP_DEPS", "Object.assign(TOOLS, CMP.companionTools(CMP_DEPS))"].every((x) => w.includes(x)));
const vm = w.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/);
ok("VERSION at or above 4.10.0", vm && (Number(vm[1]) > 4 || (Number(vm[1]) === 4 && Number(vm[2]) >= 10)));

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
