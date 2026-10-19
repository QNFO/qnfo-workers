// personal-api/companion-gp.test.mjs (COMPANION-GP-SUMMARY-1, agent_issues 100202, pillar personal)
// A one-page, 90-day summary he can show his GP (huisarts): built when he asks, plain words, no diagnosis, no chat text, journal and
// mood notes only when ticked, read-only (nothing stored, mailed, shared or posted). Pure builder cases, then the real reader and
// route against an in-memory personal-life.
// Run: node personal-api/companion-gp.test.mjs
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
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

console.log("\n[the builder, in plain words]");
{
  const to = "2026-10-19", from = C.addDays(to, -89);
  const day = (n) => C.addDays(to, -n);
  const moodDays = [];
  for (let n = 80; n >= 29; n -= 3) moodDays.push({ day: day(n), m: 3.5 });   // earlier stretch: 3.5
  for (let n = 27; n >= 0; n -= 2) moodDays.push({ day: day(n), m: 2.5 });    // the last four weeks: 2.5
  moodDays.push({ day: day(10), m: 1 });
  const out = C.gpSummaryBuild({ from, to, days: 90, moodDays, who5: [{ day: day(60), score: 56 }, { day: day(30), score: 44 }, { day: day(2), score: 36 }], sleepDays: [{ day: day(3), hours: 6 }, { day: day(2), hours: 7.5 }, { day: day(1), hours: 5 }],
    helps: { activities: [{ key: "a", title: "a ten-minute walk outside", score: 4.2, n: 3 }, { key: "b", title: "tidy", score: 3.2, n: 4 }, { key: "c", title: "one rating only", score: 5, n: 1 }] } });
  const text = out.lines.join("\n");
  ok("it names the period and says it is not a medical assessment and does not diagnose", /Period: 2026-07-22 to 2026-10-19 \(90 days\)/.test(out.lines[0]) && /not a medical assessment/.test(out.lines[0]) && /does not diagnose/.test(out.lines[0]), out.lines[0]);
  ok("mood is summarised with days logged, average and range", /Mood \(1 is rough, 5 is great\): logged on \d+ of 90 days, average [\d.]+, lowest 1, highest 3\.5\./.test(text), text);
  ok("days rated 1 or 2 are counted in words", /\d+ days? (was|were) rated 1 or 2/.test(text));
  ok("the last four weeks are set against the four before, in words", /The last four weeks averaged 2\.\d, against 3\.5 for the four weeks before: a little lower\./.test(text), text);
  ok("WHO-5 readings are listed with their dates, the lowest named, the threshold stated neutrally", /WHO-5 well-being index \(0 to 100, higher is better; below 50 is the published threshold for a closer look\): 56 on .*; 44 on .*; 36 on .*\. The lowest was 36 on /.test(text));
  ok("the sleep proxy is labelled as a proxy, not measured sleep", /a proxy from message times, not measured sleep\): about 6\.2 hours on average over 3 nights, from 5 to 7\.5 hours/.test(text), text);
  ok("what helped lists only activities rated at least twice and well", /a ten-minute walk outside \(4\.2, 3 times\)/.test(text) && !/tidy/.test(text) && !/one rating only/.test(text));
  ok("weeks are Monday-based with days logged, average, lowest and highest", out.weeks.length >= 10 && out.weeks.every((w) => new Date(w.week + "T12:00:00Z").getUTCDay() === 1 && w.days >= 1 && w.low <= w.avg && w.avg <= w.high), out.weeks.slice(0, 2));
  ok("WHO-5 and sleep come back structured too", out.who5.length === 3 && out.sleep.nights === 3 && out.sleep.avg_hours === 6.2);
  ok("no text is included unless asked for", out.texts === null && out.included.journal === false && out.included.notes === false);
  const forbidden = /depress|disorder|anxiety|bipolar|diagnos(e|is|ed)|suffer|clinical|symptom/i;
  ok("no diagnosing words anywhere outside the sentence that says it does not diagnose", !forbidden.test(out.lines.slice(1).join(" ") + out.footer + out.title), out.lines.slice(1));
  ok("the footer says it was not sent to anyone", /not sent to anyone/.test(out.footer));
}
{
  const thin = C.gpSummaryBuild({ from: "2026-07-22", to: "2026-10-19", days: 90, moodDays: [{ day: "2026-10-01", m: 3 }], who5: [], sleepDays: [], helps: null });
  ok("a thin record says so instead of inventing a pattern", /only 1 day in this period, which is too few to show a pattern/.test(thin.lines.join("\n")) && /no readings in this period/.test(thin.lines.join("\n")) && /does not measure sleep/.test(thin.lines.join("\n")) && /not rated enough/.test(thin.lines.join("\n")));
  ok("an empty record does not throw", C.gpSummaryBuild({ from: "a", to: "2026-10-19" }).lines.length >= 5);
  const t = C.gpSummaryBuild({ from: "2026-07-22", to: "2026-10-19", days: 90, moodDays: [], journal: [{ date: "2026-10-01", content: "x".repeat(900) }], notes: [{ day: "2026-10-02", score: 2, note: "rough" }] });
  ok("ticked text is included, cut to a short length, and labelled", t.texts.journal[0].text.length === 400 && t.texts.notes[0].text === "rough" && t.included.journal && t.included.notes);
  const only = C.gpSummaryBuild({ from: "a", to: "2026-10-19", journal: [{ date: "d", content: "hello" }] });
  ok("each tick stands alone", only.texts.journal.length === 1 && only.texts.notes === null);
}

console.log("\n[the reader against a real record]");
const raw = new DatabaseSync(":memory:");
raw.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT, energy INTEGER, energy_label TEXT)");
const env = { PERSONAL: d1(raw), API_KEY: "k" };
await C.ensureSchema(env.PERSONAL, true);
const DAY = 864e5;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const T = Date.now();
const SECRET_JOURNAL = "JOURNAL-SECRET-LINE about my mother", SECRET_CHAT = "CHAT-SECRET-LINE about my fears", SECRET_NOTE = "NOTE-SECRET-LINE after the meeting", SECRET_CAPTURE = "CAPTURE-SECRET-LINE call the bank";
for (let n = 1; n <= 80; n += 2) {
  const ms = T - n * DAY, d = ymd(ms);
  raw.prepare("INSERT INTO cmp_mood (id, ts, day, score, note) VALUES (?,?,?,?,?)").run("m" + n, new Date(ms).toISOString(), d, n < 28 ? 2 : 4, n === 5 ? SECRET_NOTE : null);
  raw.prepare("INSERT INTO wellbeing_checkins (ts, day, mood, source) VALUES (?,?,?, 'reply')").run(new Date(ms).toISOString(), d, n < 28 ? 3 : 4);
}
raw.prepare("INSERT INTO cmp_measures (id, ts, day, instrument, items_json, raw, score) VALUES ('w1', ?, ?, 'who5', '[3,3,3,3,3]', 15, 60)").run(new Date(T - 70 * DAY).toISOString(), ymd(T - 70 * DAY));
raw.prepare("INSERT INTO cmp_measures (id, ts, day, instrument, items_json, raw, score) VALUES ('w2', ?, ?, 'who5', '[1,1,1,1,1]', 5, 20)").run(new Date(T - 5 * DAY).toISOString(), ymd(T - 5 * DAY));
for (let k = 0; k < 3; k++) raw.prepare("INSERT INTO cmp_activity_log (id, ts, day, activity_id, title, category, pleasure, mastery) VALUES (?,?,?, 'act-walk', 'a ten-minute walk outside, no phone', 'nature', 5, 4)").run("l" + k, new Date(T - (10 + k) * DAY).toISOString(), ymd(T - (10 + k) * DAY));
raw.prepare("INSERT INTO journal (id, ts, date, content, source) VALUES ('j1', ?, ?, ?, 'companion')").run(new Date(T - 3 * DAY).toISOString(), ymd(T - 3 * DAY), SECRET_JOURNAL);
raw.prepare("INSERT INTO chat (id, thread, ts, role, content) VALUES ('c1', 'companion-x', ?, 'user', ?)").run(new Date(T - 2 * DAY).toISOString(), SECRET_CHAT);
raw.prepare("INSERT INTO cmp_inbox (id, ts, kind, raw_text, status) VALUES ('i1', ?, 'text', ?, 'processed')").run(new Date(T - 2 * DAY).toISOString(), SECRET_CAPTURE);
// message times that make a clear night: 23:00 and 07:00 local on twelve days
const tz = "Europe/Amsterdam";
for (let n = 20; n < 32; n++) {
  const dayStr = ymd(T - n * DAY);
  const st = new Date(C.dayStartIso(dayStr, tz)).getTime();
  raw.prepare("INSERT INTO cmp_mood (id, ts, day, score) VALUES (?,?,?,3)").run("late" + n, new Date(st - 1 * 36e5).toISOString(), ymd(T - (n + 1) * DAY));
  raw.prepare("INSERT INTO cmp_mood (id, ts, day, score) VALUES (?,?,?,3)").run("early" + n, new Date(st + 7 * 36e5).toISOString(), dayStr);
}
const snapshot = () => Object.fromEntries(raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => [t.name, raw.prepare("SELECT COUNT(*) AS n FROM " + t.name).get().n]));
const before = snapshot();
const base = await C.gpSummary(env, {});
const txt = JSON.stringify(base);
ok("the summary builds from the record", base.ok && base.period.days === 90 && base.weeks.length >= 8 && base.who5.length === 2 && base.helps.length === 1, { weeks: base.weeks.length, who5: base.who5.length });
ok("mood from both the companion's taps and the e-mail check-ins is counted by day", /logged on \d+ of 90 days/.test(base.lines.join(" ")));
ok("the sleep proxy is built from the message times", base.sleep && base.sleep.nights >= 8 && base.sleep.avg_hours >= 5.5 && base.sleep.avg_hours <= 9, base.sleep);
ok("WHO-5: the low reading is there", base.who5[1].score === 20);
ok("by default none of his own words is in it: no journal, no mood note, no chat, no capture", !txt.includes("SECRET") && base.texts === null, txt.match(/[A-Z]+-SECRET[^"]*/g));
const withJ = await C.gpSummary(env, { journal: true });
ok("ticking the journal adds the journal line only", JSON.stringify(withJ).includes(SECRET_JOURNAL) && !JSON.stringify(withJ).includes(SECRET_NOTE) && withJ.texts.notes === null);
const withN = await C.gpSummary(env, { notes: true });
ok("ticking the notes adds the mood note only", JSON.stringify(withN).includes(SECRET_NOTE) && !JSON.stringify(withN).includes(SECRET_JOURNAL));
const both = JSON.stringify(await C.gpSummary(env, { journal: true, notes: true }));
ok("even with both ticked, chat conversations and captures are never in it", !both.includes(SECRET_CHAT) && !both.includes(SECRET_CAPTURE));
ok("building it writes nothing anywhere (every table has the same row count)", JSON.stringify(snapshot()) === JSON.stringify(before), { before, after: snapshot() });
{
  const src = C.gpSummary.toString() + C.gpSummaryBuild.toString();
  ok("the builder has no way to send or keep anything: no mail, no fetch, no insert, update or delete", !/SEND_EMAIL|fetch\(|INSERT|UPDATE |DELETE |\.run\(/.test(src) && !/SEND_EMAIL|\bsendMail|\bsend\(/.test(fs.readFileSync(new URL("./companion.js", import.meta.url), "utf8").match(/COMPANION-GP-SUMMARY-1, rule 24[\s\S]*?\n\/\/ The longest quiet stretch/)[0]));
}

console.log("\n[the route is behind the sign-in and read-only]");
{
  const deps = { version: "t", auth: async (req) => req.headers.get("Authorization") === "Bearer k", doStub: () => ({ fetch: async () => new Response("{}") }) };
  const call = (path, init) => C.handleCompanion(new Request("https://me.q08.org/companion/api/" + path, init), env, { waitUntil() {} }, deps);
  const anon = await call("gp-summary");
  ok("no sign-in, no summary (401)", anon.status === 401 && !(await anon.text()).includes("Period"));
  const good = await call("gp-summary", { headers: { Authorization: "Bearer k" } });
  const j = await good.json();
  ok("signed in: the sheet as JSON, not cached", good.status === 200 && j.ok && j.lines.length >= 5 && good.headers.get("Cache-Control") === "no-store");
  ok("the ticks are query flags and default off", !JSON.stringify(j).includes("SECRET"));
  const t1 = await (await call("gp-summary?journal=1", { headers: { Authorization: "Bearer k" } })).json();
  ok("?journal=1 adds the journal line", JSON.stringify(t1).includes(SECRET_JOURNAL));
  const post = await call("gp-summary", { method: "POST", headers: { Authorization: "Bearer k", "Content-Type": "application/json" }, body: "{}" });
  ok("it is GET only: a POST finds nothing", post.status === 404);
  ok("there is no mail, share or export-to-someone route for it", !/gp-summary\/(send|mail|share|email)/.test(fs.readFileSync(new URL("./companion.js", import.meta.url), "utf8")));
}

console.log("\n[the page]");
{
  const html = C.PAGE_HTML;
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  let parses = true; try { new Function(script); } catch (e) { parses = String(e); }
  ok("the page script parses", parses === true, parses);
  ok("the Data tab has the GP card with both ticks, off by default", /function gpCard\(\)/.test(html) && /Include my journal lines/.test(html) && /Include the notes I typed with mood taps/.test(html) && /gp-summary\?journal='\+\(j\.checked\?1:0\)\+'&notes='\+\(n\.checked\?1:0\)/.test(html) && !/checked:true|checked=true/.test(html));
  ok("it says nothing is sent to anyone and that it does not diagnose", /Nothing is sent to anyone/.test(html) && /does not diagnose anything/.test(html));
  const fn = html.match(/function showGp\(r\)\{[\s\S]*?\nfunction discreetRow/)[0];
  ok("the sheet is built with textContent only (no innerHTML of his data)", !/innerHTML\s*=\s*[^'\s]/.test(fn) && !/innerHTML\s*\+=/.test(fn) && (fn.match(/innerHTML/g) || []).length === 1);
  ok("the sheet prints alone (print CSS hides the app) and has a print button", /@media print\{[\s\S]*?#gp-print:not\(\.hide\)\{display:block!important\}/.test(html) && /window\.print\(\)/.test(html) && /nav,#q-note,#login,\.v,\.noprint\{display:none!important\}/.test(html));
  ok("closing it, the sign-in view and sign-out clear the sheet from the page", /function closeGp\(\)\{[^}]*innerHTML=''/.test(html) && /function showLogin\(\)\{closeGp\(\)/.test(html));
  ok("a failure shows a warning instead of a blank page", /gp-summary[\s\S]*say\(out,r\.error\|\|'failed',true\)/.test(html));
}

console.log("\n[worker.js parity]");
{
  const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  ok("worker.js carries COMPANION-GP-SUMMARY-1 (the issue's closing probe)", w.includes("COMPANION-GP-SUMMARY-1"));
  ok("worker.js carries the route and the builder", w.includes('r === "gp-summary" && m === "GET"') && w.includes("function gpSummaryBuild(d)"));
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
