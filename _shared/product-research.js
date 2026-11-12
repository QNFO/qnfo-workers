// _shared/product-research.js: PRODUCT-RESEARCH-1 (Rowan, 2026-11-12). "Research and development and competitive analysis is a key part of
// improving a product ... These virtual agents should be doing what a product manager would do."
//
// Once a day per app, with no model call and no key, the fleet does a product manager's homework:
//   1. reads the best-practice and competitor pages named in APPS (fetch, cached at the edge for a day) and asks the keyless Hacker News
//      search (hn.algolia.com) for new products launched in the app's space;
//   2. checks each best practice against what the app already ships (FEATURES, whose markers _shared/product-research.test.mjs proves are in
//      the app's code) and against the backlog in docs/ONE-THING-BACKLOG.md (the backlog id of each practice, checked by the same test);
//   3. reads real use (companion: which cards Rowan taps, which asks go unanswered, from the personal D1);
//   4. opens one qnfo-audit agent_issues row per gap, ranked by weight, live source support and use, with a code-task line so the code loop
//      builds it, and a code-probe line that closes the issue once the feature's marker is on main; a closed issue is never refiled;
//   5. writes a dated row to qnfo-audit product_research_runs with a plain-language digest, which the companion shows on its Data tab
//      (GET /companion/api/research) and reading.q08.org/research shows in full;
//   6. is watched twice: metric product_research_stale_apps (v_product_research_freshness, migrations/2026-11-12-product-research.sql) and
//      the companion's hourly self-check `research-stale`.
// A new app joins APPS in the PR that ships it; the test fails a phone-journey app that has neither an entry nor a line on the shrink-only
// scripts/product-research-allowlist.txt. Kill switch: ops_config product_research = off.
//
// Pure ESM, no imports: personal-companion inlines it as namespace PR (scripts/inline-pipeline-modules.mjs); tests load it directly.

export const RESEARCH_VERSION = "1.0.0";
export const DIRECTIVE_ID = "PRODUCT-RESEARCH-1";
export const RUN_EVERY_H = 20;          // one run a day per app, tolerant of the hourly tick drifting
export const STALE_AFTER_H = 26;        // daily cadence plus at most 120 minutes (QUEUE-SLA-1)
export const NEW_ISSUES_PER_RUN = 3;    // the top gaps go to the build loop first; the rest wait for the next day
export const FETCH_TIMEOUT_MS = 8000;
export const MAX_TEXT = 200000;

// ------------------------------------------------------------------ registry
// features: what the app ships today; `marker` must occur in `code` (checked by the test, so "live" means on main).
// practices: what good apps in the space do. `covered_by` names a feature when the app already does it; otherwise `backlog` is the id in
// docs/ONE-THING-BACKLOG.md and `marker` is the text the code will carry once it ships (the issue's code-probe). `terms` are the words that
// show a source supports it. `weight` 3 = matters most for Rowan (structure, no typing, honesty), 1 = nice to have.
export const APPS = [
  { app: "companion", label: "the companion", host: "me.q08.org", code: "personal-api/companion.js", journeys: ["companion", "me-companion-regression-guard"],
    usage: "companion",
    features: [
      { key: "calm", label: "One-tap calm-down screen", marker: "CALM_STEPS" },
      { key: "activation", label: "Small activities rated afterwards", marker: "cmp_activity_log" },
      { key: "safety-plan", label: "Safety plan", marker: "SAFETY_PLAN_FIELDS" },
      { key: "who5", label: "WHO-5 wellbeing check", marker: "WHO5_ITEMS" },
      { key: "crisis", label: "Crisis lines when things are heavy", marker: "crisisText" },
      { key: "export", label: "Download and delete everything", marker: "export async function exportAll" },
      { key: "offline", label: "Works offline and syncs later", marker: "OFFLINE_JS" },
      { key: "dictate", label: "Speak instead of typing", marker: "/companion/api/dictate" },
      { key: "timer", label: "Focus timer", marker: "focusClock" },
      { key: "pause", label: "Pause the companion", marker: "export async function setPause" },
      { key: "sleep", label: "Sleep from phone use", marker: "sleepFromTimestamps" }
    ],
    practices: [
      { key: "grounding", label: "A quick way to calm down when overwhelmed", terms: ["breath", "grounding", "panic", "calm"], weight: 3, covered_by: "calm" },
      { key: "behavioural-activation", label: "Small doable activities, rated afterwards", terms: ["activity", "activities", "habit", "small steps"], weight: 3, covered_by: "activation" },
      { key: "safety", label: "A safety plan and crisis help one tap away", terms: ["crisis", "safety plan", "helpline", "emergency"], weight: 3, covered_by: "safety-plan" },
      { key: "privacy", label: "Your data can be downloaded and deleted", terms: ["privacy", "your data", "delete", "export"], weight: 3, covered_by: "export" },
      { key: "no-typing", label: "Nothing needs typing", terms: ["voice", "one tap", "tap", "dictat"], weight: 3, covered_by: "dictate" },
      { key: "evening-recap", label: "An evening recap of what got done today", terms: ["recap", "review your day", "end of the day", "end of day", "reflect"], weight: 2,
        backlog: "COMPANION-RECAP-1", marker: "COMPANION-RECAP-1" },
      { key: "transitions", label: "A heads-up before the next thing starts", terms: ["transition", "heads-up", "heads up", "visual timer", "countdown", "reminder before"], weight: 3,
        backlog: "COMPANION-TRANSITION-1", marker: "COMPANION-TRANSITION-1" },
      { key: "routines", label: "Visual routines: the same steps in the same order", terms: ["routine", "visual schedule", "visual planner", "morning routine"], weight: 3,
        backlog: "COMPANION-ROUTINES-1", marker: "COMPANION-ROUTINES-1" },
      { key: "task-breakdown", label: "Break a big task into small steps with one tap", terms: ["break down", "breakdown", "step by step", "smaller steps", "to-do", "todo"], weight: 2,
        backlog: "COMPANION-BREAKDOWN-1", marker: "COMPANION-BREAKDOWN-1" },
      { key: "mood-patterns", label: "Patterns from your own days, like what lifts or drops mood", terms: ["pattern", "insight", "trend", "correlat", "what affects"], weight: 2,
        backlog: "COMPANION-FORECAST-1", marker: "COMPANION-FORECAST-1" },
      { key: "ai-honesty", label: "It says it is an AI when things get heavy", terms: ["artificial intelligence", "ai system", "chatbot", "interacting with an ai", "transparency"], weight: 3,
        backlog: "COMPANION-AIDISCLOSE-1", marker: "COMPANION-AIDISCLOSE-1" },
      { key: "kind-progress", label: "Progress you can see, with no shame for missed days", terms: ["streak", "reward", "celebrate", "self-care", "progress"], weight: 1,
        backlog: "COMPANION-KIND-PROGRESS-1", marker: "COMPANION-KIND-PROGRESS-1" },
      { key: "body-doubling", label: "Working alongside someone, even virtually", terms: ["body doubling", "body-doubling", "co-working", "coworking", "accountability"], weight: 1,
        backlog: "COMPANION-BODY-DOUBLE-1", marker: "COMPANION-BODY-DOUBLE-1" },
      { key: "calm-measured", label: "Checking that the calm-down screen actually helps", terms: ["outcome", "evidence", "effective", "measure"], weight: 1,
        backlog: "COMPANION-CALM-MEASURE-1", marker: "COMPANION-CALM-MEASURE-1" }
    ],
    sources: [
      { name: "APA app evaluation model", kind: "practice", url: "https://www.psychiatry.org/psychiatrists/practice/mental-health-apps/the-app-evaluation-model" },
      { name: "NHS self-help guides", kind: "practice", url: "https://www.nhs.uk/mental-health/self-help/" },
      { name: "EU AI Act, Article 50", kind: "practice", url: "https://artificialintelligenceact.eu/article/50/" },
      { name: "Finch", kind: "competitor", url: "https://finchcare.com/" },
      { name: "Tiimo", kind: "competitor", url: "https://www.tiimoapp.com/" },
      { name: "Daylio", kind: "competitor", url: "https://daylio.net/" },
      { name: "How We Feel", kind: "competitor", url: "https://howwefeel.org/" },
      { name: "Goblin Tools", kind: "competitor", url: "https://goblin.tools/" }
    ],
    discover: ["mood tracker", "mental health app", "adhd app", "autism app"] },
  { app: "mind", label: "the reading list", host: "mind.q08.org", code: "q08-mind/worker.js", journeys: [], usage: null,
    features: [
      { key: "daily-pick", label: "One book picked for today", marker: "function pickFor(" },
      { key: "videos", label: "A talk to watch", marker: "function videoPickFor(" },
      { key: "evidence", label: "How strong the evidence is", marker: "function badge(" },
      { key: "how", label: "How to use the list", marker: "function howPage(" }
    ],
    practices: [
      { key: "daily-pick", label: "One clear pick instead of a long list", terms: ["recommend", "pick", "for you", "personalised", "personalized"], weight: 3, covered_by: "daily-pick" },
      { key: "evidence", label: "Shows which books are backed by evidence", terms: ["evidence", "experts", "endorsed", "reviewed by"], weight: 3, covered_by: "evidence" },
      { key: "listen", label: "A way to listen instead of read", terms: ["audiobook", "audio", "listen"], weight: 2, backlog: "MIND-AUDIO-1", marker: "MIND-AUDIO-1" },
      { key: "library", label: "Where to borrow each book for free", terms: ["library", "libraries", "borrow", "free"], weight: 2, backlog: "MIND-LIBRARY-1", marker: "MIND-LIBRARY-1" },
      { key: "content-notes", label: "Gentle notes about heavy content before you start", terms: ["content warning", "trigger warning", "content note"], weight: 2,
        backlog: "MIND-CONTENT-NOTES-1", marker: "MIND-CONTENT-NOTES-1" },
      { key: "progress", label: "One tap for read it or not for me, which tunes the next pick", terms: ["want to read", "finished", "track", "shelf", "progress"], weight: 2,
        backlog: "MIND-PROGRESS-1", marker: "MIND-PROGRESS-1" }
    ],
    sources: [
      { name: "Reading Well", kind: "practice", url: "https://reading-well.org.uk/" },
      { name: "The StoryGraph", kind: "competitor", url: "https://thestorygraph.com/" },
      { name: "Blinkist", kind: "competitor", url: "https://www.blinkist.com/" },
      { name: "Libby", kind: "competitor", url: "https://libbyapp.com/" }
    ],
    discover: ["reading app", "book recommendations"] }
];

// ------------------------------------------------------------------ pure helpers (tested offline)
export function appByKey(key) { return APPS.find((a) => a.app === key) || null; }

export function htmlToText(html) {
  return String(html || "").slice(0, MAX_TEXT)
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

// Headings on a competitor's page are how it names its features: the raw material for ideas.
export function headings(html) {
  const out = [], seen = new Set(), re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m;
  while ((m = re.exec(String(html || "").slice(0, MAX_TEXT))) && out.length < 40) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (t.length < 4 || t.length > 80 || seen.has(k) || !/[a-z]{3}/i.test(t)) continue;
    seen.add(k); out.push(t);
  }
  return out;
}

const STOP = new Set(["the", "and", "for", "with", "your", "you", "our", "app", "a", "an", "to", "of", "in", "on", "is", "it", "that", "this", "how", "what", "why", "get", "more", "all", "are", "can", "from", "by", "we", "be"]);
export function words(s) { return String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)); }

// An idea is a competitor heading that shares no meaningful word with anything the app ships or already plans.
export function ideasFrom(app, pages) {
  const known = new Set();
  for (const f of app.features) words(f.label).forEach((w) => known.add(w));
  for (const p of app.practices) { words(p.label).forEach((w) => known.add(w)); p.terms.forEach((t) => words(t).forEach((w) => known.add(w))); }
  const out = [], seen = new Set();
  for (const pg of pages) {
    if (pg.kind !== "competitor" || !pg.headings) continue;
    for (const h of pg.headings) {
      const ws = words(h);
      if (ws.length < 2 || ws.some((w) => known.has(w))) continue;
      const k = ws.join(" ");
      if (seen.has(k)) continue;
      seen.add(k); out.push({ idea: h, seen_at: pg.name });
      if (out.length >= 8) return out;
    }
  }
  return out;
}

export function supportFor(practice, pages) {
  const by = [];
  for (const pg of pages) if (pg.text && practice.terms.some((t) => pg.text.indexOf(t) >= 0)) by.push(pg.name);
  return by;
}

// Usage gaps: an ask sent at least 4 times in 14 days and answered under 10% of the time.
export function usageGaps(usage) {
  const out = [];
  for (const a of (usage && usage.asks) || []) {
    if (a.sent >= 4 && a.answered / a.sent < 0.1) out.push({ key: "ignored-ask-" + String(a.kind).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40), kind: a.kind, sent: a.sent, answered: a.answered });
  }
  return out;
}

export function rankGaps(app, pages, usage) {
  const gaps = [];
  for (const p of app.practices) {
    if (p.covered_by) continue;
    const by = supportFor(p, pages);
    const score = p.weight * 2 + Math.min(by.length, 3);
    gaps.push({ type: "practice", key: p.key, label: p.label, backlog: p.backlog, marker: p.marker, weight: p.weight, support: by, score,
      priority: score >= 7 ? "high" : score >= 4 ? "medium" : "low" });
  }
  for (const u of usageGaps(usage)) {
    gaps.push({ type: "usage", key: u.key, label: "Rework or retire the \"" + u.kind + "\" ask: it went unanswered " + (u.sent - u.answered) + " of " + u.sent + " times in 14 days",
      kind: u.kind, sent: u.sent, answered: u.answered, support: [], score: 8, priority: "medium" });
  }
  return gaps.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export function issueTitle(app, key) { return DIRECTIVE_ID + ":" + app + ":" + key; }

export function issueBody(app, gap, nowIso) {
  const day = nowIso.slice(0, 10);
  if (gap.type === "usage") {
    return "Found by the daily product research of " + app.label + " (" + DIRECTIVE_ID + ", " + day + "): the \"" + gap.kind + "\" ask was sent " + gap.sent
      + " times in 14 days and answered " + gap.answered + " times. Rowan does not use it as it is. Change it to one tap with a clearer reason to answer, send it at a better time, or stop sending it; "
      + "record the choice in a comment in the code. The research loop closes this issue on its own when the ask is answered at least a quarter of the time or is no longer sent. Pillar personal.\n"
      + "code-task: repo=qnfo-workers path=" + app.code;
  }
  return "Found by the daily product research of " + app.label + " (" + DIRECTIVE_ID + ", " + day + "): good apps in this space offer \"" + gap.label + "\" and " + app.label + " does not yet. "
    + (gap.support.length ? "Seen today in: " + gap.support.join(", ") + ". " : "No source page mentioned it today; it stays on the list from the earlier best-practice review. ")
    + "Backlog item " + gap.backlog + " in docs/ONE-THING-BACKLOG.md. Build it the way the app works: one tap, no typing, no model call unless there is no other way, plain words. "
    + "Put the text " + gap.marker + " in a comment next to the new code so the closing probe finds it. Pillar personal.\n"
    + "code-task: repo=qnfo-workers path=" + app.code + "\n"
    + "code-probe: " + JSON.stringify({ paths: [app.code], contains: gap.marker });
}

export function digestLines(app, r) {
  const lines = [];
  lines.push("Read " + r.sources_ok + " of " + (r.sources_ok + r.sources_failed) + " sources about what good apps like " + app.label + " do.");
  const open = r.gaps.filter((g) => g.state !== "shipped");
  const shipped = r.gaps.filter((g) => g.state === "shipped");
  if (!open.length) lines.push("Nothing is missing that the sources point to.");
  else lines.push((open.length === 1 ? "One thing" : open.length + " things") + " to add, most important first: " + open.slice(0, 4).map((g) => g.label.charAt(0).toLowerCase() + g.label.slice(1)).join("; ") + ".");
  if (shipped.length) lines.push("Already built after earlier research: " + shipped.slice(0, 3).map((g) => g.label.charAt(0).toLowerCase() + g.label.slice(1)).join("; ") + ".");
  const covered = app.practices.filter((p) => p.covered_by).length;
  lines.push(app.label.charAt(0).toUpperCase() + app.label.slice(1) + " already does " + covered + " of the " + app.practices.length + " things on the list.");
  if (r.usage && r.usage.top_cards && r.usage.top_cards.length) lines.push("Used most in the last two weeks: " + r.usage.top_cards.slice(0, 3).map((c) => c.card).join(", ") + ".");
  if (r.players && r.players.length) lines.push("New apps launched in this space: " + r.players.slice(0, 3).map((p) => p.name).join(", ") + ".");
  if (r.ideas && r.ideas.length) lines.push("Ideas seen elsewhere: " + r.ideas.slice(0, 3).map((i) => i.idea).join("; ") + ".");
  return lines;
}

// ------------------------------------------------------------------ I/O
async function fetchPage(src, fetcher) {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const r = await fetcher(src.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; q08-product-research/1.0)", accept: "text/html,application/json" },
      cf: { cacheTtl: 86400, cacheEverything: true }, signal: ctl ? ctl.signal : undefined });
    if (!r || !r.ok) return { name: src.name, kind: src.kind, url: src.url, ok: false, status: r ? r.status : 0 };
    const html = (await r.text()).slice(0, MAX_TEXT);
    return { name: src.name, kind: src.kind, url: src.url, ok: true, status: r.status, text: htmlToText(html), headings: headings(html) };
  } catch (e) {
    return { name: src.name, kind: src.kind, url: src.url, ok: false, status: 0, error: String(e && e.message || e).slice(0, 120) };
  } finally { if (t) clearTimeout(t); }
}

// Keyless discovery of new products: Show HN posts of the last 30 days.
export async function discoverPlayers(app, fetcher, nowMs) {
  const since = Math.floor(nowMs / 1000) - 30 * 86400, out = [], seen = new Set();
  for (const q of app.discover || []) {
    try {
      const r = await fetcher("https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=5&numericFilters=created_at_i%3E" + since + "&query=" + encodeURIComponent(q),
        { cf: { cacheTtl: 86400, cacheEverything: true } });
      if (!r || !r.ok) continue;
      const j = await r.json();
      for (const h of (j && j.hits) || []) {
        const name = String(h.title || "").replace(/^show hn:\s*/i, "").split(/\s[-–—:|]\s/)[0].trim().slice(0, 60);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        out.push({ name, url: h.url || ("https://news.ycombinator.com/item?id=" + h.objectID), query: q, at: h.created_at || null });
      }
    } catch (e) { /* discovery is best effort; the fixed sources carry the run */ }
  }
  return out.slice(0, 10);
}

async function one(db, sql, ...args) { try { return await db.prepare(sql).bind(...args).first(); } catch (e) { return null; } }
async function all(db, sql, ...args) { try { const r = await db.prepare(sql).bind(...args).all(); return (r && r.results) || []; } catch (e) { return []; } }

// Real use of the companion: counts only, never what was said.
export async function companionUsage(db, nowMs) {
  const since = new Date(nowMs - 14 * 86400e3).toISOString(), day = since.slice(0, 10);
  const asks = (await all(db, "SELECT kind, COUNT(*) AS sent, SUM(CASE WHEN state = 'done' OR (response IS NOT NULL AND trim(response) <> '') THEN 1 ELSE 0 END) AS answered FROM companion_nudges WHERE sent_at >= ? GROUP BY kind ORDER BY sent DESC LIMIT 20", since))
    .map((r) => ({ kind: String(r.kind), sent: Number(r.sent) || 0, answered: Number(r.answered) || 0 }));
  const top_cards = (await all(db, "SELECT card, SUM(n) AS taps FROM cmp_card_taps WHERE day >= ? GROUP BY card ORDER BY taps DESC LIMIT 8", day))
    .map((r) => ({ card: String(r.card), taps: Number(r.taps) || 0 }));
  const act = await one(db, "SELECT COUNT(*) AS n FROM cmp_activity_log WHERE ts >= ?", since);
  const caps = await one(db, "SELECT COUNT(*) AS n FROM cmp_inbox WHERE ts >= ?", since);
  return { window_days: 14, asks, top_cards, activities: Number(act && act.n) || 0, captures: Number(caps && caps.n) || 0 };
}

export const AUDIT_DDL = [
  "CREATE TABLE IF NOT EXISTS product_research_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, app TEXT NOT NULL, run_at TEXT NOT NULL, version TEXT, sources_ok INTEGER NOT NULL DEFAULT 0, sources_failed INTEGER NOT NULL DEFAULT 0, sources_json TEXT, gaps_json TEXT, ideas_json TEXT, players_json TEXT, usage_json TEXT, digest TEXT, filed INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0, error TEXT)",
  "CREATE INDEX IF NOT EXISTS product_research_runs_app ON product_research_runs(app, run_at)",
  "CREATE TABLE IF NOT EXISTS product_research_apps (app TEXT PRIMARY KEY, host TEXT, registered_at TEXT NOT NULL, note TEXT)"
];

// One research run for one app. deps: { fetch, nowMs }.
export async function researchApp(env, app, deps) {
  const nowMs = deps.nowMs, now = new Date(nowMs).toISOString(), stamp = now.replace("T", " ").slice(0, 19), fetcher = deps.fetch;
  const pages = [];
  for (const src of app.sources) pages.push(await fetchPage(src, fetcher));
  const players0 = await discoverPlayers(app, fetcher, nowMs);
  const prev = await one(env.AUDIT, "SELECT players_json FROM product_research_runs WHERE app = ? ORDER BY id DESC LIMIT 1", app.app);
  let prevNames = new Set(); try { prevNames = new Set(JSON.parse((prev && prev.players_json) || "[]").map((p) => String(p.name).toLowerCase())); } catch (e) { prevNames = new Set(); }
  const players = players0.filter((p) => !prevNames.has(p.name.toLowerCase()));
  const usage = app.usage === "companion" && env.PERSONAL ? await companionUsage(env.PERSONAL, nowMs) : null;
  const gaps = rankGaps(app, pages, usage);
  const res = { filed: 0, updated: 0, closed: 0 };
  let newLeft = NEW_ISSUES_PER_RUN;
  for (const g of gaps) {
    const title = issueTitle(app.app, g.key);
    const last = await one(env.AUDIT, "SELECT id, status FROM agent_issues WHERE title = ? ORDER BY id DESC LIMIT 1", title);
    if (last && last.status === "closed") { g.state = g.type === "usage" ? "open" : "shipped"; g.issue = last.id; if (g.type !== "usage") continue; }
    if (last && last.status !== "closed") {
      g.state = "open"; g.issue = last.id;
      try { await env.AUDIT.prepare("UPDATE agent_issues SET description = ?, updated_at = ? WHERE id = ? AND description <> ?").bind(issueBody(app, g, now), stamp, last.id, issueBody(app, g, now)).run(); res.updated++; } catch (e) { /* evidence refresh is best effort */ }
      continue;
    }
    if (newLeft <= 0) { g.state = "queued"; continue; }
    try {
      const r = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'personal-companion:product-research', 'personal', ?, 'open', ?, ?)")
        .bind(title, issueBody(app, g, now), g.priority, stamp, stamp).run();
      g.state = "open"; g.issue = r && r.meta ? r.meta.last_row_id : null; res.filed++; newLeft--;
    } catch (e) { g.state = "queued"; console.error(JSON.stringify({ evt: "product-research:file", app: app.app, key: g.key, error: String(e && e.message || e).slice(0, 200) })); }
  }
  // Usage gaps close on their own when the ask is answered again or no longer sent.
  const openUsage = await all(env.AUDIT, "SELECT id, title FROM agent_issues WHERE title LIKE ? AND status <> 'closed'", issueTitle(app.app, "ignored-ask-") + "%");
  for (const row of openUsage) {
    if (gaps.some((g) => issueTitle(app.app, g.key) === row.title)) continue;
    try {
      await env.AUDIT.prepare("UPDATE issue_triage SET triage_state = 'closed', close_evidence = ? WHERE issue_id = ?")
        .bind(DIRECTIVE_ID + " measured " + now + ": the ask is answered at least a tenth of the time over 14 days, or is no longer sent.", row.id).run();
      res.closed++;
    } catch (e) { /* the next run retries */ }
  }
  const ideas = ideasFrom(app, pages.filter((p) => p.ok));
  const ok = pages.filter((p) => p.ok).length;
  const run = { app: app.app, run_at: now, sources_ok: ok, sources_failed: pages.length - ok, gaps, ideas, players, usage };
  const digest = digestLines(app, run).join("\n");
  const sources = pages.map((p) => ({ name: p.name, kind: p.kind, ok: p.ok, status: p.status }));
  await env.AUDIT.prepare("INSERT INTO product_research_runs (app, run_at, version, sources_ok, sources_failed, sources_json, gaps_json, ideas_json, players_json, usage_json, digest, filed, updated, closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(app.app, now, RESEARCH_VERSION, ok, pages.length - ok, JSON.stringify(sources),
      JSON.stringify(gaps.map((g) => ({ key: g.key, type: g.type, label: g.label, priority: g.priority, support: g.support, state: g.state || "queued", issue: g.issue || null }))),
      JSON.stringify(ideas), JSON.stringify(players0), usage ? JSON.stringify(usage) : null, digest, res.filed, res.updated, res.closed).run();
  return Object.assign(res, { app: app.app, sources_ok: ok, sources_failed: pages.length - ok, gaps: gaps.length, players: players.length, ideas: ideas.length });
}

// The hourly entry point: runs each app whose last run is RUN_EVERY_H old. deps: { fetch, nowMs } (both optional in production).
export async function researchTick(env, deps) {
  deps = Object.assign({ fetch: (u, o) => fetch(u, o), nowMs: Date.now() }, deps || {});
  if (!env || !env.AUDIT) return { skipped: "no AUDIT binding" };
  const flag = await one(env.AUDIT, "SELECT value FROM ops_config WHERE key = 'product_research'");
  if (flag && String(flag.value).toLowerCase() === "off") return { skipped: "ops_config product_research = off" };
  for (const ddl of AUDIT_DDL) { try { await env.AUDIT.prepare(ddl).run(); } catch (e) { /* the migration owns the tables */ } }
  const now = new Date(deps.nowMs).toISOString(), out = { ran: [], skipped: [] };
  for (const app of APPS) {
    try { await env.AUDIT.prepare("INSERT OR IGNORE INTO product_research_apps (app, host, registered_at, note) VALUES (?, ?, ?, ?)").bind(app.app, app.host, now, "registered by " + DIRECTIVE_ID + " " + RESEARCH_VERSION).run(); } catch (e) { /* watched by the migration seed */ }
    const last = await one(env.AUDIT, "SELECT MAX(run_at) AS at FROM product_research_runs WHERE app = ?", app.app);
    if (last && last.at && deps.nowMs - Date.parse(last.at) < RUN_EVERY_H * 3600e3) { out.skipped.push(app.app); continue; }
    try { out.ran.push(await researchApp(env, app, deps)); }
    catch (e) {
      out.ran.push({ app: app.app, error: String(e && e.message || e).slice(0, 200) });
      try { await env.AUDIT.prepare("INSERT INTO product_research_runs (app, run_at, version, error) VALUES (?, ?, ?, ?)").bind(app.app, now, RESEARCH_VERSION, String(e && e.message || e).slice(0, 300)).run(); } catch (e2) { /* the stale metric catches a run that cannot even record */ }
    }
  }
  return out;
}

// Latest run per app, for /api/research, the /research page and the companion's Data tab.
export async function researchStatus(env) {
  const out = { ok: true, version: RESEARCH_VERSION, apps: [] };
  for (const app of APPS) {
    const r = await one(env.AUDIT, "SELECT run_at, sources_ok, sources_failed, gaps_json, ideas_json, players_json, digest, error FROM product_research_runs WHERE app = ? AND error IS NULL ORDER BY id DESC LIMIT 1", app.app);
    let gaps = [], ideas = [], players = [];
    try { gaps = JSON.parse((r && r.gaps_json) || "[]"); ideas = JSON.parse((r && r.ideas_json) || "[]"); players = JSON.parse((r && r.players_json) || "[]"); } catch (e) { /* shown as empty */ }
    const ageH = r && r.run_at ? Math.round((Date.now() - Date.parse(r.run_at)) / 3600e3) : null;
    out.apps.push({ app: app.app, label: app.label, host: app.host, last_run: r ? r.run_at : null, age_h: ageH, stale: ageH === null || ageH > STALE_AFTER_H,
      digest: r && r.digest ? String(r.digest).split("\n") : ["The first research run happens within the hour."],
      gaps: gaps.map((g) => ({ label: g.label, priority: g.priority, state: g.state })), ideas, players,
      practices: app.practices.length, covered: app.practices.filter((p) => p.covered_by).length });
  }
  return out;
}

const escH = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STATE_WORD = { open: "being built", queued: "next in line", shipped: "built" };

// One card per app, in the shared design system's classes. Plain words, no ids.
export function researchCards(st) {
  return st.apps.map((a) => '<section class="ds-card"><h2>' + escH(a.label.charAt(0).toUpperCase() + a.label.slice(1)) + "</h2>"
    + "<p>" + (a.last_run ? "Last checked " + escH(a.last_run.slice(0, 16).replace("T", " ")) + " UTC." : "Not checked yet.") + (a.stale && a.last_run ? " This is late; the fleet has been told." : "") + "</p>"
    + a.digest.map((l) => "<p>" + escH(l) + "</p>").join("")
    + (a.gaps.length ? '<details class="ds-more"><summary>Everything on the list (' + a.gaps.length + ")</summary><ul>"
      + a.gaps.map((g) => "<li>" + escH(g.label) + " (" + escH(STATE_WORD[g.state] || "next in line") + ")</li>").join("") + "</ul></details>" : "")
    + "</section>").join("");
}
