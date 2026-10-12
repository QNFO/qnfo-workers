// SOURCE-FRESHNESS-LIMITS-1 (qnfo-email 2.6.2, agent_issues 2162), offline suite, no network, synthetic data.
// Proves: the inbox sources keep the 3-day limit; personal-life.events takes FRESH_LIMIT_DAYS_EVENTS (30 days), so a
// 9-day-old booking row files nothing while a 40-day-old one files an issue whose title names the 30-day limit; a stale inbox
// source still files with the 3-day limit; an open issue is refreshed in place (first line only), never duplicated.
// ADVERSARIAL: it does not prove the deployed version; the closing probe on the issue reads live rows for that.
// Run: node qnfo-email/freshness-guard.test.mjs
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const lib = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {VERSION,freshnessGuard,FRESH_LIMIT_DAYS,FRESH_LIMIT_DAYS_EVENTS};")();
const fail = [];
let n = 0;
const eq = (l, g, w) => { n++; if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };

const v = lib.VERSION.split("-")[0].split(".").map(Number);
eq("version is at least 2.6.2", v[0] > 2 || (v[0] === 2 && (v[1] > 6 || (v[1] === 6 && v[2] >= 2))), true);
eq("limits: inbox 3 days, events 30 days", [lib.FRESH_LIMIT_DAYS, lib.FRESH_LIMIT_DAYS_EVENTS], [3, 30]);

const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString().replace("T", " ").slice(0, 19);
// env: audit.emails newest `inboxAge` days old, personal email_index (live store) newest `indexAge`, events newest `eventsAge`
function env(inboxAge, indexAge, eventsAge) {
  const issues = [];
  const stmt = (sql) => {
    let args = [];
    const s = {
      bind: (...a) => { args = a; return s; },
      async first() {
        if (/FROM emails/.test(sql)) return { last_seen: daysAgo(inboxAge) };
        if (/FROM events/.test(sql)) return { last_seen: daysAgo(eventsAge) };
        return null;
      },
      async all() {
        if (/FROM email_index/.test(sql)) return { results: [{ store: "qnfo.org", last_seen: daysAgo(indexAge) }] }; // the live store (EMAIL_INDEX_STORE)
        return { results: [] };
      },
      async run() {
        if (/INSERT OR IGNORE INTO agent_issues/.test(sql)) {
          if (issues.some((i) => i.title === args[0])) return { meta: { changes: 0 } };
          issues.push({ title: args[0], description: args[1] });
          return { meta: { changes: 1 } };
        }
        if (/UPDATE agent_issues SET description/.test(sql)) {
          const i = issues.find((x) => x.title === args[0]);
          if (i) i.description = args[1] + (i.description.includes("\n") ? i.description.slice(i.description.indexOf("\n")) : "");
          return { meta: { changes: i ? 1 : 0 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return s;
  };
  return { env: { AUDIT_DB: { prepare: stmt }, PERSONAL: { prepare: stmt } }, issues };
}

// 1. a quiet fortnight of bookings files nothing; the inbox is fresh
{
  const t = env(1, 1, 9);
  const r = await lib.freshnessGuard(t.env);
  eq("events 9 days old under the 30-day limit: nothing stale", r.stale.filter((s) => /events/.test(s)), []);
  eq("no issue filed", t.issues.length, 0);
}
// 2. 40-day-old events: one issue whose title names the 30-day limit
{
  const t = env(1, 1, 40);
  const r = await lib.freshnessGuard(t.env);
  eq("events stale", r.stale.some((s) => /personal-life\.events ingest:40d/.test(s)), true);
  eq("one issue, title names 30 days", t.issues.map((i) => i.title), ["SOURCE-FRESHNESS-1: personal-life.events ingest has no new rows for over 30 days"]);
  eq("description names the measurement", /Newest row: .* UTC, 40 days ago/.test(t.issues[0].description), true);
  // the next tick refreshes the first line and keeps appended notes
  t.issues[0].description += "\nPROGRESS: a session note";
  await lib.freshnessGuard(t.env);
  eq("no duplicate issue", t.issues.length, 1);
  eq("the appended note survives the refresh", /\nPROGRESS: a session note$/.test(t.issues[0].description), true);
}
// 3. a stale inbox keeps the 3-day limit
{
  const t = env(5, 1, 1);
  const r = await lib.freshnessGuard(t.env);
  eq("inbox stale at 5 days", r.stale.some((s) => /audit\.emails\):5d/.test(s)), true);
  eq("title names 3 days", t.issues.map((i) => i.title), ["SOURCE-FRESHNESS-1: qnfo-email inbound (audit.emails) has no new rows for over 3 days"]);
}
// 4. 4-day-old events: inside the events limit, outside the inbox limit; only the events limit applies to events
{
  const t = env(1, 1, 4);
  const r = await lib.freshnessGuard(t.env);
  eq("4-day-old events are fresh", r.stale, []);
}

console.log(fail.length ? fail.join("\n") : "", n + " checks, " + fail.length + " failed");
process.exit(fail.length ? 1 : 0);
