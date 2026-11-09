// personal-companion/travel-feedback.test.mjs
// Run: node --no-warnings personal-companion/travel-feedback.test.mjs
// TRAVEL-FEEDBACK-1 (agent_issues 1002268) and TRAVEL-TRIP-STATE-1 (1002269). Fixtures are invented; no owner data.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  ensureTravel, applyTap, addReason, applyPair, rankPicks, tasteSummary, tasteHint, tasteMap, decayed, pickTags, reasonDeltas,
  stopState, tripBanner, tripChecks, shiftPlan, tripToday, weatherVerdict, TASTE_PAIRS, TASTE_CLAMP, SIGNALS, CALENDAR_SEED
} from "./travel.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
function d1(db) {
  return { prepare(sql) { let args = []; const api = {
    bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return api; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) ?? null; } }; return api; } };
}
const NOW = "2026-11-09T09:00:00.000Z";
const PK1 = "pk_" + "a".repeat(18), PK2 = "pk_" + "b".repeat(18), PK3 = "pk_" + "c".repeat(18);
async function fresh() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT, amount REAL, currency TEXT, booking_ref TEXT, source TEXT, ingested_at TEXT)");
  const db = d1(raw);
  await ensureTravel(db);
  const ins = raw.prepare("INSERT INTO travel_picks (id, stop_id, city, kind, rank, name, area, why, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  ins.run(PK1, "s1", "Jaipur", "eat", 1, "Candle Bistro", "Old City", "cozy candlelit bistro", "open", NOW);
  ins.run(PK2, "s1", "Jaipur", "do", 2, "Amber Fort", "Amer", "famous iconic fort, crowded", "open", NOW);
  ins.run(PK3, "s1", "Jaipur", "eat", 3, "Spice Market Stalls", "Bapu Bazaar", "busy street food market", "open", NOW);
  return { raw, db };
}

console.log("\n[tap ledger]");
{
  const { raw, db } = await fresh();
  ok("every documented signal is a known tap", ["love", "like", "skip", "hate", "instead", "save", "book", "open", "pass"].every((s) => SIGNALS.includes(s)));
  ok("an unknown signal is refused", (await applyTap(db, { target_type: "pick", target_id: PK1, signal: "meh" }, NOW)).ok === false);
  ok("an unknown pick is refused", (await applyTap(db, { target_type: "pick", target_id: "pk_" + "f".repeat(18), signal: "love" }, NOW)).ok === false);
  ok("a malformed id is refused", (await applyTap(db, { target_type: "pick", target_id: "x'; DROP TABLE travel_picks;--", signal: "love" }, NOW)).ok === false);
  const r = await applyTap(db, { target_type: "pick", target_id: PK1, signal: "love" }, NOW);
  ok("love is recorded", r.ok && r.changed && r.feedback_id > 0 && r.reasons.length === 0, r);
  const t = tasteMap(raw.prepare("SELECT * FROM travel_taste").all(), NOW);
  ok("love raises the pick's tags", t.cozy && t.cozy.weight === 2 && t["kind:eat"].weight === 2, t);
  const h = await applyTap(db, { target_type: "pick", target_id: PK2, signal: "hate" }, NOW);
  ok("hate offers reason chips and replaces nothing", h.ok && h.reasons.length > 0 && h.replace === false, h);
  ok("hate hides the pick", raw.prepare("SELECT status FROM travel_picks WHERE id = ?").get(PK2).status !== "open");
  const i = await applyTap(db, { target_type: "pick", target_id: PK3, signal: "instead" }, NOW);
  ok("something-else asks the page to replace the pick", i.ok && i.replace === true);
  const o1 = await applyTap(db, { target_type: "pick", target_id: PK1, signal: "open" }, NOW);
  const o2 = await applyTap(db, { target_type: "pick", target_id: PK1, signal: "open" }, NOW);
  ok("an implicit open is counted once in six hours", o1.changed === true && o2.changed === false);
  for (let n = 0; n < 12; n++) await applyTap(db, { target_type: "pick", target_id: PK1, signal: "love" }, NOW);
  ok("weights are clamped", tasteMap(raw.prepare("SELECT * FROM travel_taste").all(), NOW).cozy.weight <= TASTE_CLAMP);
}

console.log("\n[reasons]");
{
  const { raw, db } = await fresh();
  const h = await applyTap(db, { target_type: "pick", target_id: PK2, signal: "skip" }, NOW);
  const before = raw.prepare("SELECT weight FROM travel_taste WHERE tag = 'touristy'").get().weight;
  ok("an unknown reason is refused", (await addReason(db, h.feedback_id, "because", NOW)).ok === false);
  const a = await addReason(db, h.feedback_id, "too_touristy", NOW);
  const after = raw.prepare("SELECT weight FROM travel_taste WHERE tag = 'touristy'").get().weight;
  ok("too touristy lowers the touristy tag", a.changed === true && after < before, { before, after });
  ok("a reason counts once", (await addReason(db, h.feedback_id, "too_touristy", NOW)).changed === false && raw.prepare("SELECT weight FROM travel_taste WHERE tag = 'touristy'").get().weight === after);
  const l = await applyTap(db, { target_type: "pick", target_id: PK1, signal: "love" }, NOW);
  ok("a reason does not go with a love", (await addReason(db, l.feedback_id, "too_far", NOW)).ok === false);
  ok("reasonDeltas never touches unrelated tags", Object.keys(reasonDeltas("too_pricey", ["cozy"])).join() === "pricey");
}

console.log("\n[cold start pairs]");
{
  const { raw, db } = await fresh();
  const p = TASTE_PAIRS[0];
  ok("a bad pair or side is refused", (await applyPair(db, "zz", "a", NOW)).ok === false && (await applyPair(db, p.id, "c", NOW)).ok === false);
  ok("a pair answer is recorded", (await applyPair(db, p.id, "a", NOW)).changed === true);
  ok("a pair is answered once", (await applyPair(db, p.id, "b", NOW)).changed === false);
  const t = tasteMap(raw.prepare("SELECT * FROM travel_taste").all(), NOW);
  ok("the chosen side wins, the other side loses", t.cozy.weight > 0 && t.market.weight < 0, t);
}

console.log("\n[ranking]");
{
  const { raw, db } = await fresh();
  await applyTap(db, { target_type: "pick", target_id: PK1, signal: "love" }, NOW);
  await applyTap(db, { target_type: "pick", target_id: PK2, signal: "skip" }, NOW);
  const taste = tasteMap(raw.prepare("SELECT * FROM travel_taste").all(), NOW);
  const fb = raw.prepare("SELECT target_id, signal FROM travel_feedback").all();
  const list = raw.prepare("SELECT * FROM travel_picks").all().map((x) => ({ ...x }));
  const ranked = rankPicks(list, taste, fb, { formed: false });
  ok("the loved pick leads, the skipped one trails", ranked[0].id === PK1 && ranked[ranked.length - 1].id === PK2, ranked.map((x) => x.id));
  ok("the order names the tap behind it", /You loved/.test(ranked[0].why_rank) && !/skipped (jaipur|old city)/i.test(ranked.map((x) => x.why_rank).join(" ")), ranked.map((x) => x.why_rank));
  ok("no wildcard before taste has formed", ranked.every((x) => !x.wildcard));
  ok("an empty table keeps the given order", rankPicks(list, {}, [], {}).map((x) => x.id).join() === list.map((x) => x.id).join());
  let wild = 0;
  for (let n = 0; n < 40; n++) {
    const l = [PK1, PK2, PK3, "pk_" + n.toString(16).padStart(18, "0")].map((id, k) => ({ id, kind: "eat", name: "Place " + k, area: "Area " + k, why: k ? "market" : "cozy" }));
    wild += rankPicks(l, { cozy: { weight: 4 } }, [], { formed: true }).filter((x) => x.wildcard).length;
  }
  ok("a wildcard appears sometimes, never in every list", wild > 0 && wild < 40, wild);
  const s = tasteSummary(raw.prepare("SELECT * FROM travel_taste").all(), 2, NOW);
  ok("the summary lists likes and dislikes without city or area tags", s.likes.every((e) => !/^(city|area):/.test(e.tag)) && s.formed === false);
  ok("taste hint stays empty until taste has formed", tasteHint(s) === "" && /likes/.test(tasteHint({ formed: true, likes: [{ label: "cozy" }], dislikes: [] })));
  ok("decay halves a weight over the half-life", Math.abs(decayed(4, "2026-09-10T00:00:00Z", "2026-11-09T00:00:00Z") - 2) < 0.05);
  ok("pickTags reads vibe words", pickTags({ kind: "eat", name: "Jazz Bistro" }).includes("live_music"));
}

console.log("\n[trip state]");
{
  const S = { start_date: "2026-11-20", end_date: "2026-11-25" };
  ok("a stop with no covered nights is a draft", stopState(S, "2026-11-09", 0) === "draft");
  ok("some covered nights is partial", stopState(S, "2026-11-09", 2) === "partial");
  ok("all nights covered is booked", stopState(S, "2026-11-09", 5) === "booked");
  ok("a stop that has ended is done", stopState(S, "2026-11-26", 0) === "done");
  const place = (o) => ({ id: "s1", city: "Jaipur", start_date: "2026-11-12", end_date: "2026-11-16", state: "draft", sleep: { nights_open: 4 }, weather: { high: 27, low: 12, kind: "lastyear" }, ...o });
  const b = tripBanner([place()], [], "2026-11-09");
  ok("an unbooked plan 3 days out raises the banner with shifts", b && b.kind === "unbooked" && b.days_to_start === 3 && b.shifts.join() === "7,14,30", b);
  ok("no banner when something is booked", tripBanner([place({ state: "partial" })], [], "2026-11-09") === null);
  ok("no banner when a journey is booked", tripBanner([place()], [{ booked: ["x"] }], "2026-11-09") === null);
  ok("no banner more than 14 days out", tripBanner([place({ start_date: "2026-12-30" })], [], "2026-11-09") === null);
  ok("weather verdicts", weatherVerdict({ high: 40, low: 25 }) === "avoid" && weatherVerdict({ high: 35, low: 20 }) === "caution" && weatherVerdict({ high: 27, low: 12 }) === "go" && weatherVerdict(null) === null);
  const fest = CALENDAR_SEED.map((r) => ({ day: r[1], end_day: r[2], place: r[3], name: r[5], impact: r[6], lead_days: r[7] })).find((f) => /Pushkar/.test(f.name));
  const cal = [{ day: fest.day, end_day: fest.end_day, place: fest.place, name: fest.name, impact: fest.impact, lead_days: fest.lead_days, verified: 0 }];
  const c = tripChecks({
    places: [place({ city: "Pushkar", start_date: "2026-11-15", end_date: "2026-11-25", weather: { high: 40, low: 20, kind: "forecast" } })],
    visa: [{ status: "over", text: "Overstays Nepal", entry_date: "2026-12-01" }], moves: [{ fog: true, day: "2026-12-02", from: "Delhi", to: "Agra" }], cal, today: "2026-11-09"
  });
  const kinds = c.list.map((x) => x.kind);
  ok("checks cover booking, weather, festival, visa and fog", ["booking", "weather", "festival", "visa", "fog"].every((k) => kinds.includes(k)), kinds);
  ok("bad items sort first and next holds at most 3 actions", c.list[0].severity === "bad" && c.next.length <= 3 && c.open === c.list.filter((x) => x.severity !== "ok").length);
  ok("a festival date from a secondary source is flagged", c.list.find((x) => x.kind === "festival").verified === false && /secondary/.test(c.list.find((x) => x.kind === "festival").text));
  ok("a booked stop silences the festival action", tripChecks({ places: [place({ city: "Pushkar", start_date: "2026-11-15", end_date: "2026-11-25", state: "booked" })], cal, today: "2026-11-09" }).list.find((x) => x.kind === "festival").action === "");
}

console.log("\n[shift and undo]");
{
  const { raw, db } = await fresh();
  const st = raw.prepare("INSERT INTO travel_stops (id, trip, city, country, start_date, end_date, updated_at) VALUES (?,?,?,?,?,?,?)");
  st.run("s1", "next", "Delhi", "IN", "2026-11-12", "2026-11-16", NOW);
  st.run("s2", "next", "Pokhara", "NP", "2026-11-16", "2026-11-22", NOW);
  raw.prepare("INSERT INTO travel_permits (id, person, country, entry_date, max_days, updated_at) VALUES ('p1','A','IN','2026-11-12',90,?)").run(NOW);
  ok("zero, fractional and huge shifts are refused", [0, 1.5, 999, -61].every(async (n) => (await shiftPlan(db, n, "2026-11-09", NOW)).ok === false));
  const r = await shiftPlan(db, 14, "2026-11-09", NOW);
  ok("shift moves every stop and the visa entry", r.ok && r.stops === 2 && r.permits === 1, r);
  ok("dates moved by 14 days", raw.prepare("SELECT start_date FROM travel_stops WHERE id='s1'").get().start_date === "2026-11-26");
  const u = await shiftPlan(db, r.undo_days, "2026-11-09", NOW);
  ok("undo restores the original dates", u.ok && raw.prepare("SELECT start_date, end_date FROM travel_stops WHERE id='s2'").get().start_date === "2026-11-16" && raw.prepare("SELECT entry_date FROM travel_permits").get().entry_date === "2026-11-12");
  ok("an ended plan has nothing to move", (await shiftPlan(db, 7, "2027-06-01", NOW)).ok === false);
}

console.log("\n[today card]");
{
  const places = [
    { city: "Delhi", country_name: "India", start_date: "2026-11-12", end_date: "2026-11-16", state: "draft", sleep: { nights_open: 4 }, weather: null, eat: [] },
    { city: "Pokhara", country_name: "Nepal", start_date: "2026-11-16", end_date: "2026-11-22", state: "booked", sleep: { nights_open: 0 }, weather: null, eat: [{ name: "Lakeside Cafe", area: "Lakeside", map: "m", why_rank: "You liked food picks." }] }
  ];
  const before = tripToday({ today: "2026-11-09", places, moves: [], banner: null, checks: { next: [{ text: "x" }] } });
  ok("before the trip it counts down to the first stop", before.mode === "countdown" && before.days_to_start === 3 && before.stop.city === "Delhi" && before.next_actions.length === 1, before);
  const during = tripToday({ today: "2026-11-17", places, moves: [{ day: "2026-11-22", from: "Pokhara", to: "Delhi", booked: [] }] });
  ok("during the trip it shows tonight's pick and the next move", during.mode === "away" && during.tonight.name === "Lakeside Cafe" && during.move.to === "Delhi", during);
  ok("with no plan it says none", tripToday({ today: "2027-06-01", places }).mode === "none");
}

console.log("\n[client script]");
{
  const src = readFileSync(new URL("./travel.js", import.meta.url), "utf8");
  const js = /const CHAT_JS = String\.raw`([\s\S]*?)`;/.exec(src);
  ok("the page script is found", !!js);
  if (js) {
    ok("page script has no template-literal hazards", !/\$\{/.test(js[1]));
    let err = null; try { new Function(js[1]); } catch (e) { err = String(e); }
    ok("page script parses", err === null, err);
    ok("page script posts every tap route", ["/travel/api/tap", "/travel/api/tap-reason", "/travel/api/taste-pair", "/travel/api/shift"].every((p) => js[1].includes(p)));
  }
  ok("routes exist for tap, reason, pair, shift and the bearer today card", ["/travel/api/tap", "/travel/api/tap-reason", "/travel/api/taste-pair", "/travel/api/shift", "/api/travel/today"].every((p) => src.includes(p)));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
