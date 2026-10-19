// personal-companion/travel.test.mjs
// Run: node --no-warnings personal-companion/travel.test.mjs
// TRAVEL-PLANNER-1. DDL is applied one statement per prepare(), as D1 requires. Fixtures are invented; no owner data.

import { readFileSync } from "node:fs";
import { travelBlock } from "../scripts/inline-companion-travel.mjs";
import { DatabaseSync } from "node:sqlite";
import {
  DDL, DEFAULTS, ensureTravel, cfg, addDays, localParts, tripState, bookingLink, parseOptions, rankAndMark,
  promptFor, modelText, sign, verify, mailFor, travelTick, handleTravel, reconcile,
  parseChat, chatPrompt, chatModels, chatTurn, makeToken, tokenOk, authKey, accessOk, CHAT_SYSTEM
} from "./travel.js";

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
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) ?? null; }
      };
      return api;
    }
  };
}

function freshEnv() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT, amount REAL, currency TEXT, booking_ref TEXT, source TEXT, source_subject TEXT, energy INTEGER, energy_label TEXT, notes TEXT, ingested_at TEXT NOT NULL)");
  raw.exec("CREATE TABLE profile (id TEXT PRIMARY KEY, facet TEXT NOT NULL, label TEXT NOT NULL, statement TEXT NOT NULL, evidence TEXT, confidence REAL DEFAULT 0.7, updated_at TEXT NOT NULL, domain TEXT, claim TEXT, status TEXT)");
  return { raw, env: { PERSONAL: d1(raw), COMPANION_KEY: "test-companion-key" } };
}
const ev = (raw, id, category, title, city, country, s, e) =>
  raw.prepare("INSERT INTO events (id, category, title, city, country, start_date, end_date, ingested_at) VALUES (?,?,?,?,?,?,?,?)").run(id, category, title, city, country, s, e, "2026-10-01T00:00:00Z");

const C = { ...DEFAULTS };
const NOW = Date.parse("2026-11-03T09:30:00Z"); // a Tuesday, 10:30 in Amsterdam

console.log("\n[schema]");
{
  const { raw, env } = freshEnv();
  await ensureTravel(env.PERSONAL);
  await ensureTravel(env.PERSONAL); // idempotent
  const names = raw.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')").all().map((r) => r.name);
  ok("tables created", ["travel_options", "travel_reactions", "travel_notices", "travel_config"].every((n) => names.includes(n)), names);
  raw.prepare("UPDATE travel_config SET value = '80' WHERE key = 'max_per_night'").run();
  await ensureTravel(env.PERSONAL);
  ok("owner-edited config wins over defaults", (await cfg(env.PERSONAL)).max_per_night === "80");
  let threw = false;
  try { raw.prepare("INSERT INTO travel_reactions (reaction, ts) VALUES ('maybe', 'x')").run(); } catch (e) { threw = true; }
  ok("reactions ledger refuses an unknown reaction", threw);
}

console.log("\n[dates]");
ok("addDays crosses a month", addDays("2026-10-30", 3) === "2026-11-02");
const lp = localParts(NOW, "Europe/Amsterdam");
ok("localParts in Amsterdam", lp.day === "2026-11-03" && lp.hour === 10 && lp.weekday === 2, lp);

console.log("\n[trip state]");
{
  const rows = [
    { category: "lodging", title: "Stay A", city: "Lecce", country: "IT", start_date: "2026-11-01", end_date: "2026-11-04" }
  ];
  const s = tripState(rows, "2026-11-03", C);
  ok("on the road: check-out tomorrow, nothing after", s.mode === "road" && s.city === "Lecce" && s.checkin === "2026-11-04", s);
  const cont = rows.concat([{ category: "lodging", title: "Stay B", city: "Taranto", country: "IT", start_date: "2026-11-04", end_date: "2026-11-06" }]);
  const s2 = tripState(cont, "2026-11-03", C);
  ok("a following stay moves the gap to its check-out", s2.mode === "road" && s2.city === "Taranto" && s2.checkin === "2026-11-06", s2);
  const home = rows.concat([{ category: "travel", title: "Flight BRI to EIN (Wizz Air 1)", city: "Bari", country: "IT", start_date: "2026-11-04", end_date: "2026-11-04" }]);
  ok("a flight home right after the stay ends the trip", tripState(home, "2026-11-03", C).mode === "home");
  const far = [{ category: "lodging", title: "Stay", city: "Lecce", country: "IT", start_date: "2026-11-01", end_date: "2026-11-20" }];
  ok("a check-out beyond lead_days is not proposed yet", tripState(far, "2026-11-03", C).mode === "home");
  ok("future lodging is reported as booked", tripState(far, "2026-10-20", C).futureBooked === true);
  const atHome = [{ category: "lodging", title: "Home stay", city: "Amsterdam", country: "NL", start_date: "2026-11-01", end_date: "2026-11-04" }];
  ok("a stay in the home city is not a trip", tripState(atHome, "2026-11-03", C).mode === "home");
  ok("malformed dates are ignored", tripState([{ category: "lodging", city: "X", start_date: "soon", end_date: "" }], "2026-11-03", C).mode === "home");
}

console.log("\n[links]");
{
  const l = new URL(bookingLink({ city: "Lecce", country: "IT", checkin: "2026-11-04", nights: 2, maxPerNight: 100, currency: "EUR" }));
  ok("booking search link has dates, one adult and a price ceiling", l.hostname === "www.booking.com" && l.searchParams.get("checkin") === "2026-11-04" && l.searchParams.get("checkout") === "2026-11-06" && l.searchParams.get("group_adults") === "1" && l.searchParams.get("nflt") === "price=EUR-min-100-1", l.toString());
}

console.log("\n[model output]");
{
  const a = parseOptions('Sure!\n```json\n{"options":[{"city":"Matera","country":"IT","kind":"old town","nights":2,"est_per_night":70,"why":"Cave town."},{"city":"matera","country":"IT"},{"city":"Bari","nights":99},{"city":"<b>Otranto</b>","why":"coast"}]}\n```');
  ok("fenced JSON parsed, duplicate city dropped, capped at 3", a.length === 3 && a[0].city === "Matera" && a[1].city === "Bari", a);
  ok("nights clamped to 7", a[1].nights === 7);
  ok("markup characters stripped", !/[<>]/.test(a[2].city), a[2]);
  ok("bare array accepted", parseOptions('[{"city":"Gdynia"},{"city":"Sopot"}]').length === 2);
  ok("garbage gives nothing", parseOptions("I cannot help").length === 0);
  ok("modelText reads chat-completions shape", modelText({ choices: [{ message: { content: "x" } }] }) === "x");
  ok("modelText reads response shape", modelText({ response: "y" }) === "y");
  const msgs = promptFor({ mode: "road", city: "Lecce", country: "IT", checkin: "2026-11-04", recent: ["Lecce"] }, C, [{ label: "L", statement: "S" }], [{ reaction: "no", city: "Naples" }], "November");
  ok("prompt carries rejections and never asks a question of the owner", /Naples/.test(msgs[1].content) && /never ask questions/i.test(msgs[0].content));
}

console.log("\n[rank and pick]");
{
  const opts = [{ city: "Naples", kind: "capital" }, { city: "Matera", kind: "old town" }, { city: "Otranto", kind: "coast" }, { city: "Lecce", kind: "old town" }];
  const r = rankAndMark(opts, [{ reaction: "no", city: "naples" }, { reaction: "booked", city: "Polignano", kind: "coast" }], { city: "Bari", recent: ["Lecce"] });
  ok("rejected and recent cities dropped", r.map((o) => o.city).join() === "Matera,Otranto", r);
  ok("exactly one pick, on the kind the owner books", r.filter((o) => o.pick).length === 1 && r.find((o) => o.pick).city === "Otranto", r);
  const r2 = rankAndMark([{ city: "A" }, { city: "B" }], [], { recent: [] });
  ok("no history: the model's first is the pick", r2[0].pick === 1 && r2[1].pick === 0);
}

console.log("\n[signing]");
{
  const s = await sign("k1", "tr_abc");
  ok("signature verifies", await verify("k1", "tr_abc", s));
  ok("other id refused", !(await verify("k1", "tr_abd", s)));
  ok("other key refused", !(await verify("k2", "tr_abc", s)));
  ok("no key refuses everything", !(await verify("", "tr_abc", s)));
  ok("junk signature refused", !(await verify("k1", "tr_abc", "!!!")));
}

console.log("\n[mail]");
{
  const m = mailFor({ mode: "road", city: "Lecce", checkin: "2026-11-04" }, [{ city: "Matera", country: "IT", nights: 2, pick: 1, link: "https://www.booking.com/x", why: "w" }, { city: "Bari", nights: 1, pick: 0, link: "https://www.booking.com/y" }], ["https://reading.q08.org/travel/o/tr_1?s=a", null], C);
  ok("subject names the pick", /Matera is my pick/.test(m.subject), m.subject);
  ok("pick is starred and nothing claims a booking", /★ 1\. Matera/.test(m.body) && /Nothing is booked for you/.test(m.body));
  ok("mail has no question mark", !m.body.includes("?") || !/\?\s*$/m.test(m.body.replace(/https?:\/\/\S+/g, "")), m.body);
}

console.log("\n[tick]");
{
  const { raw, env } = freshEnv();
  ev(raw, "e1", "lodging", "Stay A", "Lecce", "IT", "2026-11-01", "2026-11-04");
  const sent = [];
  const fakeAi = async () => ({ response: JSON.stringify({ options: [{ city: "Matera", country: "IT", kind: "old town", nights: 2, why: "a" }, { city: "Otranto", country: "IT", kind: "coast", why: "b" }, { city: "Bari", country: "IT", kind: "second city", why: "c" }] }) });
  const deps = { now: NOW, ai: fakeAi, send: async (s, b) => { sent.push({ s, b }); return { ok: true }; }, key: "sigkey" };
  const dry = await travelTick(env, { ...deps, dry: true });
  ok("dry run previews and writes nothing", dry.preview && raw.prepare("SELECT COUNT(*) n FROM travel_options").get().n === 0 && sent.length === 0, dry);
  const r1 = await travelTick(env, deps);
  ok("road gap gets 3 options and one mail", r1.proposed === 3 && sent.length === 1, r1);
  const rows = raw.prepare("SELECT * FROM travel_options ORDER BY rank").all();
  ok("one pick stored", rows.filter((r) => r.pick).length === 1);
  ok("ids are random hex", rows.every((r) => /^tr_[0-9a-f]{18}$/.test(r.id)));
  ok("mail links are signed", /\/travel\/o\/tr_[0-9a-f]{18}\?s=/.test(sent[0].b));
  const r2 = await travelTick(env, deps);
  ok("second tick is idempotent", r2.proposed === 0 && sent.length === 1 && /already proposed/.test(r2.skipped), r2);

  const night = await travelTick(env, { ...deps, now: Date.parse("2026-11-03T23:30:00Z") });
  ok("no mail outside mail hours", /outside mail hours/.test(night.skipped || ""), night);

  // the owner books one of the proposed cities: recorded as the strongest signal, the others superseded
  ev(raw, "e2", "lodging", "Stay B", "Otranto", "IT", "2026-11-04", "2026-11-06");
  const rec = await reconcile(env.PERSONAL, raw.prepare("SELECT * FROM events").all(), "2026-11-03", "2026-11-03T12:00:00Z");
  const st = raw.prepare("SELECT city, status FROM travel_options ORDER BY rank").all();
  ok("booking lands as booked, others superseded", rec.booked === 1 && st.find((x) => x.city === "Otranto").status === "booked" && st.filter((x) => x.status === "superseded").length === 2, st);
  ok("booked reaction written", raw.prepare("SELECT COUNT(*) n FROM travel_reactions WHERE reaction = 'booked' AND city = 'Otranto'").get().n === 1);
}
{
  const { raw, env } = freshEnv();
  ev(raw, "e1", "lodging", "Stay A", "Lecce", "IT", "2026-11-01", "2026-11-04");
  const r = await travelTick(env, { now: NOW, ai: async () => { throw new Error("model down"); }, send: async () => ({ ok: true }), key: "k" });
  ok("model failure proposes nothing", r.proposed === 0 && /no usable options/.test(r.skipped), r);
  const r2 = await travelTick(env, { now: NOW, ai: async () => ({ response: '{"options":[{"city":"A"},{"city":"B"}]}' }), send: async () => ({ ok: false, error: "smtp" }), key: "k" });
  ok("undelivered mail leaves no proposal behind", /send failed/.test(r2.error || "") && raw.prepare("SELECT COUNT(*) n FROM travel_options").get().n === 0, r2);
}
{
  const { raw, env } = freshEnv();
  raw.prepare("INSERT INTO events (id, category, title, city, country, start_date, end_date, booking_ref, ingested_at) VALUES ('e9','lodging','Loft','Gdynia','PL','2026-11-04','2026-11-06','REF1','x')").run();
  const sent = [];
  const r = await travelTick(env, { now: NOW, ai: async () => ({}), send: async (s, b) => { sent.push(b); return { ok: true }; }, key: "k" });
  ok("day-before stay gets one early check-in note", r.notices === 1 && /early check-in/.test(sent[0]) && /REF1/.test(sent[0]), { r, sent });
  await travelTick(env, { now: NOW + 3600e3, ai: async () => ({}), send: async (s, b) => { sent.push(b); return { ok: true }; }, key: "k" });
  ok("check-in note is sent once", sent.filter((b) => /early check-in/.test(b)).length === 1);
  raw.prepare("UPDATE travel_config SET value = 'off' WHERE key = 'enabled'").run();
  ok("enabled=off stops the tick", /enabled = off/.test((await travelTick(env, { now: NOW, send: async () => ({ ok: true }) })).skipped || ""));
}
{
  const { env } = freshEnv();
  const sun = Date.parse("2026-11-08T09:00:00Z");
  const fakeAi = async () => ({ response: '{"options":[{"city":"Porto"},{"city":"Ghent"},{"city":"Trieste"}]}' });
  const sent = [];
  const tue = await travelTick(env, { now: NOW, ai: fakeAi, send: async (s) => { sent.push(s); return { ok: true }; }, key: "k" });
  ok("home: no ideas on other weekdays", /not the ideas day/.test(tue.skipped || "") && sent.length === 0, tue);
  const r = await travelTick(env, { now: sun, ai: fakeAi, send: async (s) => { sent.push(s); return { ok: true }; }, key: "k" });
  ok("home: weekly ideas on the ideas day", r.mode === "home" && r.proposed === 3 && /Where next/.test(sent[0]), r);
}

console.log("\n[routes]");
{
  const { raw, env } = freshEnv();
  ev(raw, "e1", "lodging", "Stay A", "Lecce", "IT", "2026-11-01", "2026-11-04");
  const fakeAi = async () => ({ response: '{"options":[{"city":"Matera","kind":"old town"},{"city":"Bari"}]}' });
  await travelTick(env, { now: NOW, ai: fakeAi, send: async () => ({ ok: true }), key: "sig" });
  const o = raw.prepare("SELECT * FROM travel_options WHERE city = 'Matera'").get();
  const s = await sign("sig", o.id);
  const base = "https://reading.q08.org/travel/o/" + o.id;
  const deps = { key: "sig", now: NOW };
  ok("unrelated path is not handled", (await handleTravel(new Request("https://reading.q08.org/other"), env, deps)) === null);
  ok("bad signature is refused", (await handleTravel(new Request(base + "?s=xx"), env, deps)).status === 403);
  const g = await handleTravel(new Request(base + "?s=" + s), env, deps);
  const html = await g.text();
  ok("GET shows the option and changes nothing", g.status === 200 && /Matera/.test(html) && raw.prepare("SELECT status FROM travel_options WHERE id = ?").get(o.id).status === "proposed");
  ok("page is noindex and no-store", g.headers.get("X-Robots-Tag") === "noindex" && g.headers.get("Cache-Control") === "no-store");
  const post = await handleTravel(new Request(base + "?s=" + s, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "action=pick" }), env, deps);
  ok("POST pick records the choice and books nothing", post.status === 200 && /Nothing has been booked/.test(await post.text()) && raw.prepare("SELECT status FROM travel_options WHERE id = ?").get(o.id).status === "picked");
  ok("pick reaction written", raw.prepare("SELECT COUNT(*) n FROM travel_reactions WHERE reaction = 'pick'").get().n === 1);
  const b = raw.prepare("SELECT * FROM travel_options WHERE city = 'Bari'").get();
  const sb = await sign("sig", b.id);
  await handleTravel(new Request("https://reading.q08.org/travel/o/" + b.id + "?s=" + sb + "&action=no", { method: "POST" }), env, deps);
  ok("POST no rejects and is remembered", raw.prepare("SELECT status FROM travel_options WHERE id = ?").get(b.id).status === "rejected" && raw.prepare("SELECT COUNT(*) n FROM travel_reactions WHERE reaction = 'no' AND city = 'Bari'").get().n === 1);
  ok("no signing key: links refused", (await handleTravel(new Request(base + "?s=" + s), env, { key: "" })).status === 403);
  ok("API needs the companion key", (await handleTravel(new Request("https://reading.q08.org/api/travel"), env, deps)).status === 401);
  const api = await handleTravel(new Request("https://reading.q08.org/api/travel", { headers: { Authorization: "Bearer test-companion-key" } }), env, deps);
  const j = await api.json();
  ok("API returns config, options and reactions", api.status === 200 && j.options.length === 2 && j.reactions.length === 2 && j.config.enabled === "on", j);
  ok("run route is POST only", (await handleTravel(new Request("https://reading.q08.org/api/travel/run", { headers: { Authorization: "Bearer test-companion-key" } }), env, deps)).status === 405);
}


console.log("\n[chat: parsing]");
{
  const good = JSON.stringify({ reply: "Three ideas.", options: [{ city: "Lisbon", country: "PT", kind: "capital", checkin: "2026-11-20", nights: 3, est_per_night: 70, why: "Light and cheap.", pick: false }, { city: "Porto", country: "PT", nights: 2, pick: true }, { city: "Lisbon" }], question: { text: "Before or after the 20th?", choices: ["Before", "After", "", "Either", "Flexible"] }, learned: [{ label: "likes coast", statement: "Prefers a sea view." }, { label: "", statement: "x" }] });
  const pc = parseChat("```json\n" + good + "\n```", "2026-11-03");
  ok("chat JSON parsed from a fenced reply", pc.reply === "Three ideas." && pc.options.length === 2, pc);
  ok("one pick kept, as the model marked it", pc.options.filter((o) => o.pick).length === 1 && pc.options[1].pick === 1);
  ok("a valid future check-in is kept", pc.options[0].checkin === "2026-11-20");
  ok("question keeps at most 4 non-empty choices", pc.question.text === "Before or after the 20th?" && pc.question.choices.length === 4 && !pc.question.choices.includes(""), pc.question);
  ok("learned items need a label and a statement", pc.learned.length === 1);
  ok("a past check-in is dropped", parseChat(JSON.stringify({ reply: "x", options: [{ city: "Gent", checkin: "2026-01-01" }] }), "2026-11-03").options[0].checkin === "");
  const prose = parseChat("Lisbon is lovely this time of year.", "2026-11-03");
  ok("prose without JSON is still shown", prose.reply.startsWith("Lisbon") && prose.options.length === 0);
  ok("raw broken JSON is not shown as a reply", parseChat("{\"reply\": \"cut", "2026-11-03").reply === "");
  ok("html is stripped from the reply", !/<script/.test(parseChat(JSON.stringify({ reply: "hi <script>x</script>" })).reply));
}

console.log("\n[chat: prompt and models]");
{
  const msgs = chatPrompt({ c: C, today: "2026-11-03", state: { mode: "road", city: "Lecce", country: "IT", checkin: "2026-11-04", recent: ["Bari"] }, booked: [], profile: [{ label: "museums", statement: "Likes museums." }], reactions: [{ reaction: "no", city: "Rome" }],
    history: [{ role: "user", content: "somewhere warm" }, { role: "assistant", content: "Ideas.", meta: JSON.stringify({ options: [{ city: "Malaga", pick: 1 }], question: { text: "How long?" } }) }], text: "" });
  ok("system prompt forbids questionnaires and booking", /Never send a list of questions/.test(CHAT_SYSTEM) && /never book or pay/i.test(CHAT_SYSTEM));
  ok("context carries location, profile and rejections", /Lecce/.test(msgs[0].content) && /Likes museums/.test(msgs[0].content) && /Turned down before: Rome/.test(msgs[0].content));
  ok("history replays the options shown", /Options shown: Malaga \(my pick\)/.test(msgs[2].content) && /Asked: How long\?/.test(msgs[2].content));
  const long = Array.from({ length: 40 }, (_, i) => ({ label: "fact " + i, statement: "x".repeat(200) + " end" + i }));
  const big = chatPrompt({ c: C, today: "2026-11-03", state: { mode: "home", recent: [] }, booked: [], profile: long, reactions: [], history: [], text: "hi" });
  ok("stay searches carry the party size", /group_adults=2/.test(bookingLink({ city: "Gent", checkin: "2026-11-04", nights: 2, adults: "2" })) && /group_adults=1/.test(bookingLink({ city: "Gent", checkin: "2026-11-04", nights: 2 })));
  ok("a ~9k-character profile reaches the model whole", /end39/.test(big[0].content));
  ok("prompts assume no solo traveller and name no one", !/solo/.test(CHAT_SYSTEM) && /companion/.test(CHAT_SYSTEM) && !/solo/.test(JSON.stringify(promptFor({ mode: "home", recent: [] }, C, [], [], "May"))));
  ok("an empty turn asks for an opening proposal", /just opened the planner/.test(msgs[msgs.length - 1].content));
  ok("chat models come from config, filtered by the worker's ban list", JSON.stringify(chatModels({ chat_models: "@cf/a/x-flash, @cf/b/y,not-a-model" }, (m) => !/-flash/.test(m))) === JSON.stringify(["@cf/b/y"]));
  ok("an empty model list falls back to the menu", chatModels({ chat_models: "" }).length === 3);
}

console.log("\n[chat: turn]");
{
  const { raw, env } = freshEnv();
  ev(raw, "l1", "lodging", "Stay Lecce", "Lecce", "IT", "2026-11-01", "2026-11-04");
  raw.prepare("INSERT INTO profile (id, facet, label, statement, confidence, updated_at, domain) VALUES ('travel:stay-type', 'travel', 'stay type', 'Private room with own bathroom.', 0.9, 'x', 'personal')").run();
  const seen = [];
  const reply = { reply: "From Lecce, three stops. **Matera** is my pick.", options: [{ city: "Matera", country: "IT", kind: "old town", nights: 2, why: "Cave town, two hours away.", pick: true }, { city: "Bari", country: "IT" }, { city: "Polignano a Mare", country: "IT" }], question: null, learned: [{ label: "likes old towns", statement: "Enjoys walkable old towns." }] };
  const deps = { now: NOW, ai: async (m, input) => { seen.push({ m, input }); if (m === "@cf/openai/gpt-oss-120b") throw new Error("model down"); return { response: JSON.stringify(reply) }; } };
  const r = await chatTurn(env, deps, { text: "Somewhere nearby, nothing big." });
  ok("first model failing falls through to the next", r.ok && r.message.meta.model === "@cf/zai-org/glm-5.3", r);
  ok("the model saw the stored preference and the user's words", /Private room with own bathroom/.test(seen[1].input.messages[0].content) && seen[1].input.messages.at(-1).content === "Somewhere nearby, nothing big.");
  ok("options come back with stay and transit links from where the owner is", r.message.meta.options.length === 3 && /booking\.com/.test(r.message.meta.options[0].link) && /origin=Lecce/.test(r.message.meta.options[0].transit) && r.message.meta.options[0].checkin === "2026-11-04");
  ok("options are stored for reconcile and reactions", raw.prepare("SELECT COUNT(*) n FROM travel_options WHERE mode = 'chat'").get().n === 3);
  const learned = raw.prepare("SELECT * FROM profile WHERE id = 'travel:chat-likes-old-towns'").get();
  ok("what it learned is written to the profile (facet travel)", learned && learned.facet === "travel" && learned.status === "active" && /walkable/.test(learned.statement), learned);
  ok("both sides of the turn are kept", raw.prepare("SELECT COUNT(*) n FROM travel_chat").get().n === 2);
  await chatTurn(env, { ...deps, ai: async () => ({ response: JSON.stringify({ ...reply, learned: [{ label: "likes old towns", statement: "Loves old towns." }] }) }) }, { text: "more like Matera" });
  const again = raw.prepare("SELECT statement, confidence FROM profile WHERE id = 'travel:chat-likes-old-towns'").get();
  ok("learning the same thing again updates it and raises confidence", again.statement === "Loves old towns." && again.confidence > 0.7, again);
  const down = await chatTurn(env, { ...deps, ai: async () => { throw new Error("all down"); } }, { text: "hello" });
  ok("all models down: an honest error and nothing stored", !down.ok && /No model answered/.test(down.error) && raw.prepare("SELECT COUNT(*) n FROM travel_chat").get().n === 4);
  ok("an empty message without open is refused", !(await chatTurn(env, deps, { text: "  " })).ok);
}

console.log("\n[chat: sign-in and routes]");
{
  const { raw, env } = freshEnv();
  delete env.COMPANION_KEY;
  const mails = [];
  const deps = { now: NOW, send: async (s, b) => { mails.push({ s, b }); return { ok: true }; }, ai: async () => ({ response: JSON.stringify({ reply: "Hello. Porto is my pick.", options: [{ city: "Porto", country: "PT" }, { city: "Gent", country: "BE" }], question: { text: "This month?", choices: ["Yes", "No"] }, learned: [] }) }) };
  const H = "https://reading.q08.org";
  const page0 = await handleTravel(new Request(H + "/travel"), env, deps);
  ok("signed out: /travel offers an email code, no key", page0.status === 401 && /Email me a code/.test(await page0.text()));
  ok("signed out: the API refuses", (await handleTravel(new Request(H + "/travel/api/state"), env, deps)).status === 401);
  const key = await authKey(env, env.PERSONAL);
  ok("no worker secret: a random signing key is generated once and kept", key.length > 30 && key === await authKey(env, env.PERSONAL));
  const lg = await handleTravel(new Request(H + "/travel/login", { method: "POST" }), env, deps);
  const code = (/code: (\d{6})/.exec(mails[0] && mails[0].b || "") || [])[1];
  ok("login mails a 6-digit code to the owner and shows the code box", lg.status === 200 && mails.length === 1 && !!code && /Travel planner code: \d{6}/.test(mails[0].s) && /one-time-code/.test(await lg.text()));
  ok("the code is stored only as a MAC", !raw.prepare("SELECT code_mac FROM travel_logins").get().code_mac.includes(code));
  const form = (c) => new Request(H + "/travel/code", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "code=" + c });
  const wrong = await handleTravel(form(code === "000000" ? "111111" : "000000"), env, deps);
  ok("a wrong code is refused and counted", wrong.status === 401 && raw.prepare("SELECT attempts FROM travel_logins").get().attempts === 1);
  const pst = await handleTravel(form(code.slice(0, 3) + " " + code.slice(3)), env, deps);
  const ck = pst.headers.get("Set-Cookie") || "";
  ok("the right code (spaces allowed) sets a long-lived HttpOnly session cookie", pst.status === 303 && /^trv=\d+\./.test(ck) && /HttpOnly/.test(ck) && /Secure/.test(ck) && /Max-Age=10368000/.test(ck), ck);
  ok("a code works once", (await handleTravel(form(code), env, deps)).status === 401);
  const deps2 = { ...deps };
  await handleTravel(new Request(H + "/travel/login", { method: "POST" }), env, deps2);
  const code2 = /code: (\d{6})/.exec(mails[1].b)[1];
  for (let i = 0; i < 5; i++) await handleTravel(form(code2 === "000000" ? "111111" : "000000"), env, deps2);
  ok("five wrong guesses kill the code", (await handleTravel(form(code2), env, deps2)).status === 401);
  ok("an expired code is refused", (await handleTravel(new Request(H + "/travel/login", { method: "POST" }), env, deps)) && (await handleTravel(form(/code: (\d{6})/.exec(mails[2].b)[1]), env, { ...deps, now: NOW + 21 * 60e3 })).status === 401);
  await handleTravel(new Request(H + "/travel/login", { method: "POST" }), env, deps);
  const link = new URL(/https:\/\/\S+/.exec(mails[3].b)[0]);
  const g = await handleTravel(new Request(link.toString()), env, deps);
  ok("GET on the one-tap link only shows a button (mail scanners spend nothing)", g.status === 200 && /Sign in on this device/.test(await g.text()));
  ok("POST on the link signs in", (await handleTravel(new Request(link.toString(), { method: "POST" }), env, deps)).status === 303);
  ok("the link works once", (await handleTravel(new Request(link.toString(), { method: "POST" }), env, deps)).status === 401);
  ok("login mails are capped per hour", (await handleTravel(new Request(H + "/travel/login", { method: "POST" }), env, deps)).status === 429 && mails.length === 4, mails.length);
  const cookie = { Cookie: ck.split(";")[0] };
  const pg = await handleTravel(new Request(H + "/travel", { headers: cookie }), env, deps);
  const csp = pg.headers.get("Content-Security-Policy") || "";
  const old = await makeToken(key, "sess", Math.floor(NOW / 1000) + 10 * 86400);
  ok("a session near its end is renewed on use", /Max-Age=10368000/.test((await handleTravel(new Request(H + "/travel", { headers: { Cookie: "trv=" + old } }), env, deps)).headers.get("Set-Cookie") || ""));
  ok("signed in: the chat page is served with a nonce CSP", pg.status === 200 && /Travel planner/.test(await pg.text()) && /script-src 'nonce-/.test(csp) && /frame-ancestors 'none'/.test(csp), csp);
  const jpost = (path, body, extra) => handleTravel(new Request(H + path, { method: "POST", headers: { ...cookie, "Content-Type": "application/json", ...(extra || {}) }, body: JSON.stringify(body) }), env, deps);
  const ch = await (await jpost("/travel/api/chat", { open: true })).json();
  ok("opening turn proposes without a user message", ch.ok && ch.message.meta.options.length === 2 && raw.prepare("SELECT COUNT(*) n FROM travel_chat WHERE role = 'user'").get().n === 0, ch);
  ok("a foreign origin is refused", (await jpost("/travel/api/chat", { text: "hi" }, { Origin: "https://evil.example" })).status === 403);
  ok("a form post (no JSON) is refused", (await handleTravel(new Request(H + "/travel/api/chat", { method: "POST", headers: { ...cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: "text=hi" }), env, deps)).status === 415);
  const optId = ch.message.meta.options[0].id;
  ok("react pick records the choice", (await (await jpost("/travel/api/react", { id: optId, action: "pick" })).json()).changed === true && raw.prepare("SELECT status FROM travel_options WHERE id = ?").get(optId).status === "picked");
  const st = await (await handleTravel(new Request(H + "/travel/api/state", { headers: cookie }), env, deps)).json();
  ok("state folds live option status into the history", st.history.at(-1).meta.options[0].status === "picked" && st.models.menu.length === 3, st);
  raw.prepare("INSERT INTO profile (id, facet, label, statement, updated_at, domain) VALUES ('travel:chat-x', 'travel', 'x', 'X.', 'x', 'personal'), ('likes.museums', 'likes', 'museums', 'M.', 'x', 'personal')").run();
  await jpost("/travel/api/forget", { id: "travel:chat-x" });
  await jpost("/travel/api/forget", { id: "likes.museums" });
  ok("forget retracts a travel preference and leaves other facets alone", raw.prepare("SELECT status FROM profile WHERE id = 'travel:chat-x'").get().status === "retracted" && raw.prepare("SELECT status FROM profile WHERE id = 'likes.museums'").get().status === null);
  const mm = await (await jpost("/travel/api/model", { model: "@cf/moonshotai/kimi-k2.6" })).json();
  ok("the model menu reorders chat_models", mm.ok && (await cfg(env.PERSONAL)).chat_models.startsWith("@cf/moonshotai/kimi-k2.6,"));
  ok("a non-Workers-AI model id is refused", (await jpost("/travel/api/model", { model: "https://example.com/v1" })).status === 400);
  await jpost("/travel/api/reset", {});
  ok("a fresh conversation archives the old turns", raw.prepare("SELECT COUNT(*) n FROM travel_chat").get().n === 0 && raw.prepare("SELECT COUNT(*) n FROM travel_chat_archive").get().n === 1);
  const out = await jpost("/travel/api/logout", {});
  ok("sign out clears the cookie", /Max-Age=0/.test(out.headers.get("Set-Cookie") || ""));
  ok("a forged session cookie is refused", (await handleTravel(new Request(H + "/travel/api/state", { headers: { Cookie: "trv=9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } }), env, deps)).status === 401);
  const env2 = { ...env, COMPANION_KEY: "ck" };
  ok("the companion key cookie also signs in", (await handleTravel(new Request(H + "/travel/api/state", { headers: { Cookie: "a=b; pc_key=ck" } }), env2, deps)).status === 200);
  const t = await makeToken("k", "sess", Math.floor(NOW / 1000) + 60);
  ok("tokens are bound to their kind", (await tokenOk("k", "sess", t, NOW)) && !(await tokenOk("k", "login", t, NOW)));
}

console.log("\n[chat: Cloudflare Access]");
{
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
  const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const mk = async (payload) => { const hp = b64({ alg: "RS256", kid: "k1" }) + "." + b64(payload); const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(hp))).toString("base64url"); return hp + "." + sig; };
  const c = { access_team: "team", access_aud: "aud1" };
  const deps = { accessCerts: async () => ({ keys: [jwk] }) };
  const good = await mk({ aud: ["aud1"], exp: Math.floor(NOW / 1000) + 600, iss: "https://team.cloudflareaccess.com" });
  const rq = (j) => new Request("https://reading.q08.org/travel", { headers: { "Cf-Access-Jwt-Assertion": j } });
  ok("a valid Access token signs in", await accessOk(rq(good), c, deps, NOW));
  ok("wrong audience refused", !(await accessOk(rq(await mk({ aud: ["other"], exp: Math.floor(NOW / 1000) + 600, iss: "https://team.cloudflareaccess.com" })), c, deps, NOW)));
  ok("expired token refused", !(await accessOk(rq(good), c, deps, NOW + 3600e3)));
  ok("tampered token refused", !(await accessOk(rq(good.slice(0, -4) + "AAAA"), c, deps, NOW)));
  ok("Access off when not configured", !(await accessOk(rq(good), { access_team: "", access_aud: "" }, deps, NOW)));
}

console.log("\n[repository hygiene]");
{
  const src = readFileSync(new URL("./travel.js", import.meta.url), "utf8");
  ok("module holds no mail address", !/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(src));
  // the chat page's own script calls only this worker's /travel/api routes; the module itself fetches nothing
  const js = /const CHAT_JS = String\.raw`([\s\S]*?)`;/.exec(src);
  ok("module never calls a booking or payment API", !/fetch\(/.test(src.replace(js ? js[0] : "", "")));
  ok("the page script fetches only its own relative API", !!js && /fetch\(path/.test(js[1]) && !/https?:\/\//.test(js[1].replace(/https?:\/\/[^"'`\s]*\$\{/g, "")) && /"\/travel\/api\//.test(js[1]));
}

{
  const w = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const m = /\/\/ TRAVEL-INLINE-BEGIN[^\n]*\n[\s\S]*?\/\/ TRAVEL-INLINE-END\n/.exec(w);
  ok("worker.js carries travel.js inlined unchanged (run scripts/inline-companion-travel.mjs)", !!m && m[0] === travelBlock(readFileSync(new URL("./travel.js", import.meta.url), "utf8")));
  ok("worker.js routes /travel/ and runs the hourly travel step", /TRV\.handleTravel\(/.test(w) && /TRV\.travelTick\(/.test(w));
}

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
