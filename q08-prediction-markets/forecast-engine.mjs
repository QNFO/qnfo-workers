// forecast-engine.mjs (inside q08-prediction-markets): consequential forecasts from the signal stream, at a few thousand tokens per update (FORECAST-ENGINE-1).
// Gates, self-halt and the spin-off criteria are code below (GATES, spinoffStatus); the audit that motivated it is in the header above.
//
// Why it exists (audit 2026-11-12, numbers read from D1 that day):
// - q08-signal-engine wrote essays first and forecasts as a by-product. In the 14 days to 2026-11-12 it ran 539 times, published 9
//   pieces and spent about 23 million Workers AI tokens (qnfo-audit ai_call_counters), about 2.6 million tokens per published piece.
//   131 of its 158 pieces carry a retraction, and it has produced 4 forecasts in total, none resolved.
// - q08-prediction-markets estimated short-horizon Polymarket questions with the price hidden from the models. On its 30 resolved
//   estimates the models scored Brier 0.218 against 0.039 for the market price: the crowd was 5.6 times more accurate. Most of its
//   universe was Bitcoin brackets, sports spreads and streamer stunts.
//
// What this engine does instead (forecast first, prose last):
//   1 select   keep only questions with a financial transmission (rates, leadership of listed firms, capital raises, energy and
//              geopolitics, officials and rules); drop sports, price brackets, entertainment. Deterministic, 0 tokens.
//   2 prior    start from the crowd: the market price, repaired for coherence across the dates of one question (a "by Dec 31"
//              leg can never be below a "by Nov 13" leg). Incoherent or stale legs are themselves a signal. 0 tokens.
//   3 match    link the signal stream (q08-signal.signal_log: news feeds, searches, HN, arXiv, Federal Register) to each question by
//              entity overlap. 0 tokens. A family with no matched evidence is fetched for by name (NEWS-LANE-1, issue 11057):
//              GDELT doc search on the question's own entities, Google News RSS as the second path, rows kept in fe_signal.
//   4 trigger  re-forecast only when new matched evidence arrived or the prior moved 5 points. Most hours cost nothing.
//   5 adjust   two models from different families each propose a bounded log-odds shift from the prior, citing evidence ids.
//              About 1.5k tokens in and a few hundred out per model.
//   6 gate     deterministic: an uncited or out-of-range shift is dropped; disagreeing directions cancel to the prior;
//              the mean shift is halved and capped at 1 logit. The engine can only move away from the crowd with evidence.
//   7 ledger   append-only, hash-chained rows in q08-trades fe_forecast; scored against the prior on resolution, so the only
//              headline number is value added over the crowd (Brier of the prior minus Brier of the engine).
//   8 card     the public page renders each forecast from its row: number, prior, what moved it, what it moves. No essay.
//
// Paper only. No order, wallet or exchange key exists here. Money stays an owner decision (IC-GATE-001).
export const FE_VERSION = "1"; // ledger schema version, recorded on every row

// ---------- 1 select: what makes a question consequential ----------
// Each rule names the financial channel a question moves; the page shows it so a reader sees why it matters.
export const CONSEQUENCE = [
  { key: "monetary", re: /\b(fed|fomc|interest rates?|rate (cut|hike)s?|ecb|bank of england|boj|basis points?)\b/i,
    moves: "Borrowing costs: mortgage rates, bond prices and equity valuations." },
  { key: "macro", re: /\b(cpi|inflation|unemployment|jobs report|payrolls|gdp|recession)\b/i,
    moves: "The data the Fed and bond markets act on." },
  { key: "leadership", re: /\b(ceo|chair(man)?|resign(ation)?|removal|ousted?|step(s)? down)\b/i,
    moves: "Leadership of a listed company: its share price, and its suppliers' and customers'." },
  { key: "capital", re: /\b(ipo|s-1|listing|go(es)? public|acquisition|acquire|merger|buyout)\b/i,
    moves: "The price and timing of a major capital raise or deal, and its read-across to peers." },
  { key: "energy-geopolitics", re: /\b(iran|blockade|ceasefire|opec|oil|strait|sanctions?|invade|nuclear deal|regime)\b/i,
    moves: "Oil and shipping prices, defence stocks and inflation expectations." },
  { key: "officials-rules", re: /\b(secretary of|impeach(ed|ment)?|shutdown|tariffs?|executive order|bill passes|supreme court|export (rule|control)s?)\b/i,
    moves: "The officials and rules that set contracts, tariffs and budgets." },
];
// Trivial or unforecastable from news: sports, price brackets (no news signal decides them), entertainment, stunts.
export const TRIVIAL = /\b(vs\.?|spread:|o\/u|win on \d|worlds \d{4}|champions league|nba|nfl|super bowl|grand prix|bitcoin|btc|ethereum|eth|solana|dip to \$|above \$|reach \$|gta|marathon|aliens?|divorce|album|box office|tweets?|posts?)\b/i;

export function classify(title) {
  const t = String(title || "");
  if (!t || TRIVIAL.test(t) || /\(synthetic\)/i.test(t)) return null;
  const hit = CONSEQUENCE.find((c) => c.re.test(t));
  return hit ? { key: hit.key, moves: hit.moves } : null;
}

// ---------- 2 prior: one question, many dated legs ----------
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
// "by November 13, 2026?" / "through December 31?" / "before 2027?" -> ISO date of the deadline (year defaults to the reference year).
export function deadlineOf(title, refYear) {
  const t = String(title || "");
  let m = t.match(/\b(?:by|through|before|after)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s*(\d{4}))?/i);
  if (m) {
    const y = m[3] ? +m[3] : refYear;
    return new Date(Date.UTC(y, MONTHS[m[1].toLowerCase()], +m[2])).toISOString().slice(0, 10);
  }
  m = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
  if (m) return new Date(Date.UTC(+m[2], MONTHS[m[1].toLowerCase()] + 1, 0)).toISOString().slice(0, 10);
  m = t.match(/\bbefore\s+(\d{4})\b/i) || t.match(/\bby (?:the )?end of (\d{4})\b/i);
  if (m) return (/before/i.test(m[0]) ? +m[1] - 1 : +m[1]) + "-12-31";
  return null;
}
// The question with its date removed: legs of one question share this key.
export function familyKey(title) {
  return String(title || "")
    .replace(/\b(by|through|before)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(,?\s*\d{4})?/ig, "$1 <date>")
    .replace(/\bbefore\s+\d{4}\b/ig, "before <date>")
    .replace(/[?]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
// "Will X happen by D" grows with D; "X continues through D" shrinks with D.
export const directionOf = (title) => (/\b(continues?|remain|stays?|still)\b/i.test(title) ? -1 : 1);

// Pool-adjacent-violators: the closest monotone sequence (weighted least squares). Fresher legs weigh more.
export function isotonic(values, weights, dir = 1) {
  const v = values.map((x) => dir * x), blocks = [];
  for (let i = 0; i < v.length; i++) {
    blocks.push({ s: v[i] * weights[i], w: weights[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].s / blocks[blocks.length - 2].w > blocks[blocks.length - 1].s / blocks[blocks.length - 1].w) {
      const b = blocks.pop(), a = blocks.pop();
      blocks.push({ s: a.s + b.s, w: a.w + b.w, n: a.n + b.n });
    }
  }
  const out = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(dir * (b.s / b.w));
  return out;
}

// Groups dated legs, repairs each family to a coherent curve and reports the legs whose quoted price broke coherence.
export function termStructure(markets, nowMs) {
  const refYear = new Date(nowMs).getUTCFullYear(), fam = new Map();
  for (const m of markets) {
    const d = deadlineOf(m.title, refYear);
    if (!d) continue;
    const k = familyKey(m.title);
    if (!fam.has(k)) fam.set(k, []);
    fam.get(k).push({ ...m, deadline: d });
  }
  const out = [];
  for (const [key, legs] of fam) {
    legs.sort((a, b) => a.deadline.localeCompare(b.deadline));
    const dir = directionOf(legs[0].title);
    const w = legs.map((l) => {
      const ageH = Math.max(0, (nowMs - Date.parse(l.updated_at || 0)) / 3600000);
      return Math.max(0.01, Math.log10(10 + (+l.vol24 || 0)) / (1 + (ageH / 12) ** 2)); // a quote 3 days old weighs ~1/40 of a fresh one
    });
    const fit = isotonic(legs.map((l) => +l.yes), w, dir);
    legs.forEach((l, i) => {
      const ageH = Math.round(Math.max(0, (nowMs - Date.parse(l.updated_at || 0)) / 3600000));
      out.push({ ...l, family: key, prior: clampP(fit[i]), quoted: +l.yes, incoherent: Math.abs(fit[i] - l.yes) >= 0.05, age_h: ageH });
    });
  }
  return out;
}

// ---------- 3 match: signals to questions ----------
const STOP = new Set("will the a an of by to in on for and or be is are was at as with from before after through end next out than this that its it his her their into over under new say says said about us u.s".split(" "));
export function entities(title) {
  const words = String(title || "").replace(/[^A-Za-z0-9$.\- ]/g, " ").split(/\s+/).filter(Boolean);
  const set = new Set();
  for (const w of words) {
    const l = w.toLowerCase().replace(/\.$/, "");
    if (l.length < 3 || STOP.has(l) || /^\d+$/.test(l) || MONTHS[l] !== undefined) continue;
    if (/^[A-Z]/.test(w) || l.length >= 6) set.add(l);
  }
  return [...set];
}
// Proper entities: capitalised words of the question that are not stop words or months ("Jensen", "Huang", "Anthropic", "Fed").
export function properEntities(title) {
  const out = new Set();
  for (const w of String(title || "").replace(/[^A-Za-z0-9.\- ]/g, " ").split(/\s+/)) {
    const l = w.toLowerCase().replace(/\.$/, "");
    if (/^[A-Z]/.test(w) && l.length >= 3 && !STOP.has(l) && MONTHS[l] === undefined) out.add(l);
  }
  return [...out];
}
// Evidence for one question: signals naming at least one of its proper entities, best overlap then newest first.
export function matchEvidence(question, signals, { max = 6, sinceMs = 0 } = {}) {
  const proper = properEntities(question.title), all = entities(question.title);
  if (!proper.length) return [];
  const has = (text, e) => new RegExp("\\b" + e.replace(/[.$-]/g, "\\$&") + "\\b", "i").test(text);
  const out = [];
  for (const s of signals) {
    const t = Date.parse(String(s.created_at || "").replace(" ", "T") + (/Z|\+/.test(String(s.created_at)) ? "" : "Z"));
    if (Number.isFinite(t) && t < sinceMs) continue;
    if (!proper.some((e) => has(s.title, e))) continue;
    out.push({ ...s, overlap: all.filter((e) => has(s.title, e)).length });
  }
  out.sort((a, b) => b.overlap - a.overlap || String(b.created_at).localeCompare(String(a.created_at)));
  return out.slice(0, max).map((s, i) => ({ id: "E" + (i + 1), title: s.title, url: s.url, source: s.source, date: String(s.created_at || "").slice(0, 10) }));
}

// ---------- 4 trigger ----------
export function needsUpdate(last, prior, evidence) {
  if (!last) return { yes: true, why: "first forecast" };
  const seen = new Set(JSON.parse(last.evidence_json || "[]").map((e) => e.url));
  const fresh = evidence.filter((e) => !seen.has(e.url)).length;
  if (fresh) return { yes: true, why: fresh + " new signal" + (fresh > 1 ? "s" : "") };
  if (Math.abs(prior - last.prior) >= 0.05) return { yes: true, why: "crowd moved " + Math.round(100 * (prior - last.prior)) + " pts" };
  return { yes: false, why: "no new evidence" };
}

// ---------- 5 adjust: a compact prompt ----------
export function buildPrompt(q, evidence, today) {
  const ev = evidence.map((e) => `${e.id} [${e.date}, ${e.source}] ${e.title}`).join("\n");
  return [
    `Today is ${today}. Question: "${q.title}" Resolves on: ${q.deadline}.`,
    `Crowd probability (prediction market, coherence-repaired): ${pct(q.prior)}.`,
    `New evidence (headlines only; nothing else is known to you):`,
    ev || "(none)",
    ``,
    `Task: decide whether this evidence justifies moving away from the crowd. The crowd is usually right; move only if a headline`,
    `carries information the price plausibly has not absorbed. Answer with ONE line of JSON and nothing else:`,
    `{"shift": <log-odds change from -2 to 2, 0 if no reason>, "cites": ["E1", ...], "mechanism": "<one sentence: how the cited`,
    `evidence changes the odds>", "watch": "<one observable event in the next week that would settle the direction>"}`,
  ].join("\n");
}

// ---------- 6 gate ----------
export function parseShift(text, evidenceIds) {
  const s = String(text || "");
  const m = s.match(/\{[\s\S]*"shift"[\s\S]*?\}(?![\s\S]*"shift")/);
  if (!m) return { ok: false, why: "no JSON" };
  let j;
  try { j = JSON.parse(m[0]); } catch { return { ok: false, why: "bad JSON" }; }
  const shift = Number(j.shift);
  if (!Number.isFinite(shift) || Math.abs(shift) > 2) return { ok: false, why: "shift out of range" };
  const cites = (Array.isArray(j.cites) ? j.cites : []).map(String).filter((c) => evidenceIds.includes(c));
  if (shift !== 0 && !cites.length) return { ok: false, why: "uncited shift" };
  return { ok: true, shift, cites, mechanism: String(j.mechanism || "").slice(0, 300), watch: String(j.watch || "").slice(0, 200) };
}

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const clampP = (p) => Math.min(0.995, Math.max(0.005, +p));
export const pct = (p) => (Math.round(1000 * p) / 10) + "%";

// Shrink 0.5 and cap 1 logit: two cheap models move the crowd a little, with reasons, never a lot on their own.
export function combine(prior, verdicts, { shrink = 0.5, cap = 1 } = {}) {
  const ok = verdicts.filter((v) => v && v.ok);
  if (ok.length < 2) return { p: prior, shift: 0, why: "fewer than two valid model verdicts: the crowd stands" };
  const signs = new Set(ok.map((v) => Math.sign(v.shift)));
  if (signs.size === 1 && signs.has(0)) return { p: prior, shift: 0, why: "no model found evidence the crowd has not priced: the crowd stands" };
  if (signs.size > 1) return { p: prior, shift: 0, why: signs.has(0) ? "only one model saw a reason to move: the crowd stands" : "models disagree on direction: the crowd stands" };
  const mean = ok.reduce((a, v) => a + v.shift, 0) / ok.length;
  const shift = Math.max(-cap, Math.min(cap, shrink * mean));
  return { p: clampP(sigmoid(logit(clampP(prior)) + shift)), shift, why: shift === 0 ? "no evidence-backed reason to move" : "evidence-backed shift" };
}

// ---------- 7 ledger and scoring ----------
export async function sha256Hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const brier = (p, o) => (p - o) * (p - o);
// Value added over the crowd on resolved forecasts: positive means the engine beat the price it started from.
export function valueAdded(rows) {
  const r = rows.filter((x) => x.outcome === 0 || x.outcome === 1);
  if (!r.length) return { n: 0 };
  const bp = r.reduce((a, x) => a + brier(x.prior, x.outcome), 0) / r.length;
  const be = r.reduce((a, x) => a + brier(x.p, x.outcome), 0) / r.length;
  return { n: r.length, brier_prior: +bp.toFixed(4), brier_engine: +be.toFixed(4), value_added: +(bp - be).toFixed(4) };
}

// ---------- the spin-off as code: gates the ledger evaluates on itself ----------
// Each gate is computed from settled rows only; the tick consumes the verdict (it halts model spend when the engine is provably worse than the crowd),
// /api/forecasts publishes it and the page shows the next gate. Nothing waits for a reader or a decision.
export function bootstrapCI(diffs, { reps = 2000, seed = 12345 } = {}) {
  if (!diffs.length) return null;
  let x = seed >>> 0;
  const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const means = [];
  for (let r = 0; r < reps; r++) { let t = 0; for (let i = 0; i < diffs.length; i++) t += diffs[Math.floor(rnd() * diffs.length)]; means.push(t / diffs.length); }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(0.025 * reps)], hi: means[Math.floor(0.975 * reps) - 1] };
}
export const GATES = [
  { key: "prove", n: 60, need: "value added > 0 (point estimate)", test: (ci, va) => va > 0, next: "widen coverage and run on; the essay engine stays signals-only" },
  { key: "attention", n: 60, need: "95% bootstrap interval of value added above 0", test: (ci) => !!ci && ci.lo > 0, next: "publish alerts and a weekly scorecard from the ledger" },
  { key: "spin-out", n: 200, need: "95% bootstrap interval above 0 on 200+ settled", test: (ci) => !!ci && ci.lo > 0, next: "own repository, own account, data feed" },
];
// One score per question: its last forecast before it settled (re-forecasts of one question are not independent samples).
export function lastPerSlug(rows) { const m = new Map(); for (const x of rows) m.set(x.slug, x); return [...m.values()]; }
export function spinoffStatus(rows) {
  rows = lastPerSlug(rows);
  const r = rows.filter((x) => x.outcome === 0 || x.outcome === 1);
  const diffs = r.map((x) => brier(x.prior, x.outcome) - brier(x.p, x.outcome));
  const va = diffs.length ? diffs.reduce((a, d) => a + d, 0) / diffs.length : 0;
  const ci = bootstrapCI(diffs);
  const gates = GATES.map((g) => ({ key: g.key, n_needed: g.n, need: g.need, passed: r.length >= g.n && g.test(ci, va), next: g.next }));
  const nextGate = gates.find((g) => !g.passed) || null;
  // Provably worse than the crowd: stop paying for adjustments and publish the crowd until the evidence turns.
  const halted = r.length >= 60 && !!ci && ci.hi < 0;
  return { settled: r.length, value_added: diffs.length ? +va.toFixed(4) : null, ci95: ci ? { lo: +ci.lo.toFixed(4), hi: +ci.hi.toFixed(4) } : null, gates, next_gate: nextGate && nextGate.key, halted };
}

// ---------- the pipeline (I/O injected, so the same code runs in the cron, the tests and the demo) ----------
export const MODELS = ["@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/moonshotai/kimi-k2.6"]; // two families (deepseek, moonshot)
// Thinking off: measured 2026-11-12 with this prompt, glm-5.3-flash (no switch) spent its whole 1200-token budget reasoning and
// returned no answer on 3 of 3 questions; deepseek with thinking on used ~850 output tokens for a 60-token JSON line.
// The switches are the ones q08-signal-engine measured for its fact-check (FACTCHECK-NOTHINK-1).
export function noThinking(model) {
  const m = String(model).toLowerCase();
  if (m.includes("kimi") || m.includes("deepseek")) return { chat_template_kwargs: { thinking: false } };
  if (m.includes("gpt-oss")) return { reasoning: { effort: "low" } };
  return {};
}
export const LIMITS = { maxUpdatesPerTick: 4, evidencePerQuestion: 6, maxTokens: 400, horizonDaysMax: 120, newsFetchPerTick: 6, newsRefetchMin: 180 };

// ---------- 3b news lane (NEWS-LANE-1, issue 11057) ----------
// On 2026-11-12 948 of 1,205 signals were Hacker News front-page stories, so Iran, Hegseth and macro questions matched nothing and were
// skipped. The question itself names what to look for: each starved family is searched by its proper entities, at most newsFetchPerTick
// families an hour, each family again only after newsRefetchMin minutes. GDELT is the first path, Google News RSS the second; either may fail alone.
const HINT = { monetary: "interest rates", macro: "economy", "energy-geopolitics": "oil", leadership: "CEO", capital: "IPO", "officials-rules": "government" };
export function newsQuery(title, category) {
  const ents = properEntities(title).filter((e) => /^[a-z0-9]/.test(e)).slice(0, 4);
  if (!ents.length) return "";
  const q = ents.join(" ");
  return q.length < 6 && HINT[category] ? q + " " + HINT[category] : q;
}
const decodeXml = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
export function parseGdelt(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return null; } // GDELT answers its rate limit and query errors in plain text
  return (j.articles || []).map((a) => {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(String(a.seendate || ""));
    return { title: String(a.title || "").trim(), url: String(a.url || ""), created_at: m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : null };
  }).filter((a) => a.title && /^https?:\/\//.test(a.url));
}
export function parseNewsRss(xml) {
  const out = [];
  for (const it of String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || []) {
    const tag = (n) => decodeXml((new RegExp("<" + n + "[^>]*>([\\s\\S]*?)<\\/" + n + ">").exec(it) || [])[1]);
    const t = Date.parse(tag("pubDate"));
    const title = tag("title").replace(/\s+-\s+[^-]{2,60}$/, ""); // "Headline - Publisher"
    if (title && /^https?:\/\//.test(tag("link"))) out.push({ title, url: tag("link"), created_at: Number.isFinite(t) ? sqlTime(t) : null });
  }
  return out;
}
// fetchText(url) -> { ok, status, text }. Returns { source, items, tried } with source "gdelt", "gnews" or "" when both paths came back empty.
export async function fetchNews(query, fetchText) {
  const tried = [];
  try {
    const r = await fetchText("https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=10&sort=datedesc&timespan=7d&query=" + encodeURIComponent(query + " sourcelang:english"));
    const items = r.ok ? parseGdelt(r.text) : null;
    tried.push("gdelt:" + (items ? items.length : "error " + r.status));
    if (items && items.length) return { source: "gdelt", items, tried };
  } catch (e) { tried.push("gdelt:" + String(e && e.message || e).slice(0, 60)); }
  try {
    const r = await fetchText("https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=" + encodeURIComponent(query + " when:7d"));
    const items = r.ok ? parseNewsRss(r.text).slice(0, 10) : [];
    tried.push("gnews:" + (r.ok ? items.length : "error " + r.status));
    if (items.length) return { source: "gnews", items, tried };
  } catch (e) { tried.push("gnews:" + String(e && e.message || e).slice(0, 60)); }
  return { source: "", items: [], tried };
}
// Fetches for the starved families of one plan and stores what it found; returns the rows it added (for the re-plan) and a log.
export async function newsLane(db, starved, fetchText, nowMs, { limits = LIMITS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const recent = new Set(((await db.prepare("SELECT family FROM fe_fetch WHERE fetched_at > ?").bind(new Date(nowMs - limits.newsRefetchMin * 60000).toISOString()).all()).results || []).map((r) => r.family));
  const todo = starved.filter((q) => !recent.has(q.family) && newsQuery(q.title, q.category)).slice(0, limits.newsFetchPerTick);
  const added = [], log = [];
  for (let i = 0; i < todo.length; i++) {
    const q = todo[i], query = newsQuery(q.title, q.category);
    if (i) await sleep(5500); // GDELT asks for one request every 5 seconds
    const res = await fetchNews(query, fetchText);
    let n = 0;
    for (const it of res.items) {
      const id = res.source + ":" + (await sha256Hex(it.url)).slice(0, 24);
      const row = { source: res.source, title: it.title.slice(0, 300), url: it.url.slice(0, 1000), created_at: it.created_at || sqlTime(nowMs) };
      const ins = await db.prepare("INSERT OR IGNORE INTO fe_signal (id, source, family, query, title, url, created_at) VALUES (?,?,?,?,?,?,?)").bind(id, row.source, q.family, query, row.title, row.url, row.created_at).run();
      if (ins?.meta?.changes !== 0) { added.push(row); n++; }
    }
    await db.prepare("INSERT OR REPLACE INTO fe_fetch (family, query, fetched_at, source, found) VALUES (?,?,?,?,?)").bind(q.family, query, new Date(nowMs).toISOString(), res.source || res.tried.join(","), n).run();
    log.push({ family: q.family, query, source: res.source, found: res.items.length, added: n, tried: res.tried });
  }
  return { added, log };
}

// Steps 1-4 for every candidate market: returns the questions to update this tick and why the rest were skipped.
export function plan(markets, signals, lastByslug, nowMs, limits = LIMITS) {
  const kept = [], skipped = { trivial: 0, no_deadline: 0, past_or_far: 0, unchanged: 0, no_evidence: 0 };
  const starved = new Map(), coverage = {};
  const consequential = markets.filter((m) => { const c = classify(m.title); if (!c) skipped.trivial++; return !!c; });
  const legs = termStructure(consequential, nowMs);
  skipped.no_deadline = consequential.length - legs.length;
  for (const q of legs) {
    const days = (Date.parse(q.deadline) - nowMs) / 86400000;
    if (days < 1 || days > limits.horizonDaysMax) { skipped.past_or_far++; continue; }
    const c = classify(q.title);
    const evidence = matchEvidence(q, signals, { max: limits.evidencePerQuestion, sinceMs: nowMs - 21 * 86400000 });
    const cv = coverage[c.key] || (coverage[c.key] = { legs: 0, with_evidence: 0 });
    cv.legs++;
    if (!evidence.length) {
      skipped.no_evidence++;
      const s0 = starved.get(q.family);
      if (!s0 || Math.abs(days - 30) < Math.abs(s0.days - 30)) starved.set(q.family, { family: q.family, slug: q.slug, title: q.title, category: c.key, days });
      continue;
    }
    cv.with_evidence++;
    const t = needsUpdate(lastByslug[q.slug], q.prior, evidence);
    if (!t.yes) { skipped.unchanged++; continue; }
    kept.push({ ...q, category: c.key, moves: c.moves, evidence, trigger: t.why, days: Math.round(days) });
  }
  // One leg per family per tick: the leg nearest 30 days out carries the most news signal per token.
  const best = new Map();
  for (const q of kept) { const b = best.get(q.family); if (!b || Math.abs(q.days - 30) < Math.abs(b.days - 30)) best.set(q.family, q); }
  const chosen = [...best.values()].sort((a, b) => (b.incoherent - a.incoherent) || (b.evidence.length - a.evidence.length)).slice(0, limits.maxUpdatesPerTick);
  return { chosen, skipped, candidates: markets.length, consequential: consequential.length, coverage, starved: [...starved.values()].sort((a, b) => a.days - b.days) };
}

// Steps 5-7 for one question. ask(model, prompt) -> { text, in_tok, out_tok }.
export async function forecastOne(q, ask, today) {
  const prompt = buildPrompt(q, q.evidence, today), ids = q.evidence.map((e) => e.id);
  const answers = await Promise.all(MODELS.map(async (m) => { try { return { model: m, ...(await ask(m, prompt)) }; } catch (e) { return { model: m, text: "", error: String(e && e.message || e), in_tok: 0, out_tok: 0 }; } }));
  const verdicts = answers.map((a) => ({ model: a.model, ...parseShift(a.text, ids) }));
  const c = combine(q.prior, verdicts);
  const tokens = answers.reduce((a, x) => a + (x.in_tok || 0) + (x.out_tok || 0), 0);
  return { slug: q.slug, title: q.title, deadline: q.deadline, category: q.category, moves: q.moves, quoted: q.quoted, prior: q.prior,
    incoherent: q.incoherent, age_h: q.age_h, p: c.p, shift: c.shift, why: c.why, trigger: q.trigger, evidence: q.evidence, verdicts, tokens, prompt_chars: prompt.length };
}

// ---------- D1 (q08-trades holds the ledger beside the paper-trading tables it replaces) ----------
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS fe_forecast (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, deadline TEXT, category TEXT, moves TEXT, quoted REAL, prior REAL NOT NULL, p REAL NOT NULL, shift REAL, why TEXT, trig TEXT, evidence_json TEXT, verdicts_json TEXT, tokens INTEGER, outcome INTEGER, resolved_at TEXT, prev_hash TEXT, hash TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS fe_forecast_slug ON fe_forecast(slug, id)",
  "CREATE TABLE IF NOT EXISTS fe_signal (id TEXT PRIMARY KEY, source TEXT NOT NULL, family TEXT, query TEXT, title TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS fe_signal_created ON fe_signal(created_at)",
  "CREATE TABLE IF NOT EXISTS fe_fetch (family TEXT PRIMARY KEY, query TEXT, fetched_at TEXT NOT NULL, source TEXT, found INTEGER)",
  "CREATE TABLE IF NOT EXISTS fe_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT NOT NULL, candidates INTEGER, consequential INTEGER, updated INTEGER, tokens INTEGER, skipped_json TEXT, error TEXT)",
];
export async function ensureSchema(db) { for (const s of SCHEMA) await db.prepare(s).run(); }

async function readInputs(env, nowMs) {
  if (!env.SIGNAL_DB) throw new Error("SIGNAL_DB (q08-signal) is not bound");
  const m = await env.TRADES_DB.prepare("SELECT slug, title, yes, vol24, updated_at, ends_at FROM pt_market WHERE closed = 0 AND yes > 0.01 AND yes < 0.99 AND updated_at > ?").bind(new Date(nowMs - 7 * 86400000).toISOString()).all();
  // SIGNALS-ENGINE-2 (q08-signal-engine 0.52.0): the stream now carries news feeds, GDELT and Google News searches and discovered publishers
  // beside Hacker News, arXiv and the Federal Register, so every source but repository listings is read (a repo name never matches a question).
  const s = await env.SIGNAL_DB.prepare("SELECT source, title, url, created_at FROM signal_log WHERE created_at > datetime('now','-21 days') AND source <> 'github' ORDER BY created_at DESC LIMIT 3000").all();
  const n = await env.TRADES_DB.prepare("SELECT source, title, url, created_at FROM fe_signal WHERE created_at > ? ORDER BY created_at DESC LIMIT 1500").bind(sqlTime(nowMs - 21 * 86400000)).all();
  const last = await env.TRADES_DB.prepare("SELECT f.* FROM fe_forecast f JOIN (SELECT slug, max(id) id FROM fe_forecast GROUP BY slug) l ON l.id = f.id").all();
  const lastBy = {};
  for (const r of last.results || []) lastBy[r.slug] = r;
  return { markets: m.results || [], signals: (n.results || []).concat(s.results || []), lastBy };
}

// Workers AI binding first (it takes the thinking switch); the fleet router is the second path if the binding is missing or fails.
async function workersAiAsk(env, model, prompt) {
  const body = { messages: [{ role: "user", content: prompt }], max_tokens: LIMITS.maxTokens, temperature: 0.2 };
  if (env.AI) {
    try {
      const r = await env.AI.run(model, { ...body, ...noThinking(model) });
      const msg = r?.choices?.[0]?.message || {};
      const text = r?.response ?? msg.content ?? "";
      if (String(text || "").trim()) return { text: String(text), in_tok: r?.usage?.prompt_tokens || 0, out_tok: r?.usage?.completion_tokens || 0, path: "binding" };
    } catch (e) { if (!env.QNFO_AI) throw e; }
  }
  if (!env.QNFO_AI) throw new Error("no AI path bound");
  const alias = { "@cf/deepseek-ai/deepseek-v4-flash-0731": "deepseek-v4-flash-wa", "@cf/moonshotai/kimi-k2.6": "kimi-k2.6" }[model] || model;
  const r = await env.QNFO_AI.fetch("https://qnfo-ai.internal/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: alias, ...body, max_tokens: 1500 }) });
  if (!r.ok) throw new Error("router " + r.status + " for " + alias);
  const j = await r.json();
  return { text: String(j.choices?.[0]?.message?.content || ""), in_tok: j.usage?.prompt_tokens || 0, out_tok: j.usage?.completion_tokens || 0, path: "router" };
}

async function defaultFetchText(url) {
  const r = await fetch(url, { headers: { "user-agent": "q08-forecasts/1 (+https://markets.q08.org/forecasts)", accept: "application/json, application/rss+xml, text/xml" }, signal: AbortSignal.timeout(10000) });
  return { ok: r.ok, status: r.status, text: await r.text() };
}
export async function tick(env, nowMs = Date.now()) {
  await ensureSchema(env.TRADES_DB);
  const { markets, signals, lastBy } = await readInputs(env, nowMs);
  let pl = plan(markets, signals, lastBy, nowMs), news = { added: [], log: [] };
  if (String(env.FE_NEWS || "on") !== "off" && pl.starved.length) {
    try {
      news = await newsLane(env.TRADES_DB, pl.starved, env.__fetchText || defaultFetchText, nowMs);
      if (news.added.length) pl = plan(markets, news.added.concat(signals), lastBy, nowMs);
    } catch (e) { news.log.push({ error: String(e && e.message || e).slice(0, 200) }); }
  }
  const past = (await env.TRADES_DB.prepare("SELECT slug, prior, p, outcome FROM fe_forecast WHERE outcome IS NOT NULL ORDER BY id").all()).results || [];
  const spin = spinoffStatus(past);
  if (spin.halted) pl.chosen = []; // self-halt: the evidence says the adjustments hurt; the ledger keeps the crowd's number until it turns
  const today = new Date(nowMs).toISOString().slice(0, 10);
  let tokens = 0, updated = 0, error = null;
  for (const q of pl.chosen) {
    try {
      const f = await forecastOne(q, (m, p) => workersAiAsk(env, m, p), today);
      tokens += f.tokens;
      const prev = await env.TRADES_DB.prepare("SELECT hash FROM fe_forecast ORDER BY id DESC LIMIT 1").first();
      const created = new Date(nowMs).toISOString();
      const body = JSON.stringify([created, f.slug, f.prior, f.p, f.evidence.map((e) => e.url), prev?.hash || ""]);
      const hash = await sha256Hex(body);
      await env.TRADES_DB.prepare("INSERT INTO fe_forecast (created_at, slug, title, deadline, category, moves, quoted, prior, p, shift, why, trig, evidence_json, verdicts_json, tokens, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(created, f.slug, f.title, f.deadline, f.category, f.moves, f.quoted, f.prior, f.p, f.shift, f.why, f.trigger, JSON.stringify(f.evidence), JSON.stringify(f.verdicts), f.tokens, prev?.hash || null, hash).run();
      updated++;
    } catch (e) { error = String(e && e.message || e).slice(0, 300); }
  }
  if (spin.halted) error = "self-halted: 95% interval of value added is below zero on " + spin.settled + " settled";
  // Resolution: a closed market whose YES price sits at 0 or 1 settles every forecast on it (the pilot's fetch keeps pt_market current).
  await env.TRADES_DB.prepare("UPDATE fe_forecast SET outcome = (SELECT CASE WHEN m.yes >= 0.99 THEN 1 ELSE 0 END FROM pt_market m WHERE m.slug = fe_forecast.slug), resolved_at = ? WHERE outcome IS NULL AND EXISTS (SELECT 1 FROM pt_market m WHERE m.slug = fe_forecast.slug AND m.closed = 1 AND (m.yes >= 0.99 OR m.yes <= 0.01))").bind(new Date(nowMs).toISOString()).run().catch(() => null);
  await env.TRADES_DB.prepare("INSERT INTO fe_tick (ran_at, candidates, consequential, updated, tokens, skipped_json, error) VALUES (?,?,?,?,?,?,?)")
    .bind(new Date(nowMs).toISOString(), pl.candidates, pl.consequential, updated, tokens, JSON.stringify({ ...pl.skipped, coverage: pl.coverage, news: news.log }), error).run();
  return { candidates: pl.candidates, consequential: pl.consequential, updated, tokens, skipped: pl.skipped, coverage: pl.coverage, news: news.log, error };
}

// ---------- 8 card: the page ----------
const COVER_LABEL = { monetary: "Interest rates", macro: "Economic data", leadership: "Company leadership", capital: "Deals and listings", "energy-geopolitics": "Energy and geopolitics", "officials-rules": "Officials and rules" };
export function renderPage(rows, stats, head) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cards = rows.map((r) => {
    const ev = JSON.parse(r.evidence_json || "[]"), vs = JSON.parse(r.verdicts_json || "[]");
    const moved = Math.round(100 * (r.p - r.prior));
    const badge = moved === 0 ? `<span class="ds-badge">With the crowd</span>` : `<span class="ds-badge ds-badge-accent">${moved > 0 ? "+" : ""}${moved} pts vs crowd</span>`;
    const mech = vs.find((v) => v.ok && v.mechanism && v.shift !== 0)?.mechanism || r.why;
    const watch = vs.find((v) => v.ok && v.watch)?.watch || "";
    return `<article class="ds-card"><div class="fe-top"><h2 class="ds-card-title">${esc(r.title)}</h2><div class="fe-p">${esc(pct(r.p))}</div></div>
<div class="ds-meta">${badge} Crowd ${esc(pct(r.prior))}${r.quoted != null && Math.abs(r.quoted - r.prior) >= 0.05 ? ` (quoted ${esc(pct(r.quoted))}, inconsistent with the other dates)` : ""} · settles ${esc(r.deadline)}</div>
<p class="fe-why">${esc(mech)}</p>
<p class="ds-muted"><b>What it moves:</b> ${esc(r.moves)}${watch ? `<br><b>Watch:</b> ${esc(watch)}` : ""}</p>
<details class="ds-more"><summary>Evidence (${ev.length}) and model verdicts</summary><div class="ds-more-body"><ul>${ev.map((e) => `<li>${esc(e.id)} <a href="${esc(e.url)}" rel="nofollow noopener">${esc(e.title)}</a> <small>${esc(e.source)}, ${esc(e.date)}</small></li>`).join("")}</ul>
<ul>${vs.map((v) => `<li><small>${esc(String(v.model).split("/").pop())}: ${v.ok ? "shift " + esc(v.shift) + " citing " + esc((v.cites || []).join(", ") || "none") : "set aside (" + esc(v.why) + ")"}</small></li>`).join("")}</ul>
<small>${esc(r.tokens)} tokens · ledger hash ${esc(String(r.hash).slice(0, 12))}</small></div></details></article>`;
  }).join("\n");
  const va = stats.value || {};
  return `<!doctype html><html lang="en"><head>${head("Q08 Forecasts", "Consequential forecasts derived from public signals, scored against the crowd.", FE_CSS)}</head><body class="ds">
<header class="ds-top"><div class="ds-top-in"><a class="ds-brand" href="/">Q08 Forecasts</a></div></header>
<main class="ds-main"><div class="ds-head"><h1>Forecasts that move money</h1><p>Each number starts from the prediction-market crowd and moves only when fresh public signals justify it. Every forecast is scored against the crowd it started from.</p></div>
<section class="ds-stats"><div class="ds-stat"><div class="k">Open forecasts</div><div class="v">${rows.length}</div></div><div class="ds-stat"><div class="k">Tokens per forecast</div><div class="v">${stats.tokens_per ? esc(stats.tokens_per) : "–"}</div></div><div class="ds-stat"><div class="k">Value added vs crowd</div><div class="v">${va.n ? esc(va.value_added) : "–"}</div></div></section>
${va.n ? "" : `<p class="ds-note">No forecast has settled yet. Value added (crowd Brier minus engine Brier) appears here after the first settles.</p>`}
${stats.spinoff ? `<p class="ds-note">Next gate: <b>${esc(stats.spinoff.next_gate || "all passed")}</b>. ${esc((stats.spinoff.gates.find((g) => g.key === stats.spinoff.next_gate) || {}).need || "")} (${esc(stats.spinoff.settled)} settled).${stats.spinoff.halted ? " Adjustments are halted: the engine is publishing the crowd's number." : ""}</p>` : ""}
${stats.coverage ? `<details class="ds-more"><summary>Coverage: ${esc(Object.values(stats.coverage).reduce((a, c) => a + c.with_evidence, 0))} of ${esc(Object.values(stats.coverage).reduce((a, c) => a + c.legs, 0))} questions have fresh evidence</summary><div class="ds-more-body"><ul>${Object.entries(stats.coverage).map(([k, c]) => `<li>${esc(COVER_LABEL[k] || k)}: ${esc(c.with_evidence)} of ${esc(c.legs)}</li>`).join("")}</ul></div></details>` : ""}
${cards || `<div class="ds-empty"><b>No forecasts yet</b>The engine runs hourly and writes its first forecasts when a consequential question has fresh signals.</div>`}
<footer class="fe-foot"><a href="/paper">Paper-trading pilot</a><a href="/whitepaper">White paper</a><a href="/api/forecasts">Data (JSON)</a><span>Not investment advice. Paper money only.</span></footer>
</main></body></html>`;
}
export const FE_CSS = ".fe-top{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}.fe-p{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ds-accent)}.fe-why{margin:10px 0 6px}.fe-foot{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:24px;font-size:14px;color:var(--ds-ink-2)}.fe-foot a{display:inline-flex;align-items:center;min-height:44px}";

export async function latestRows(env) {
  await ensureSchema(env.TRADES_DB);
  const r = await env.TRADES_DB.prepare("SELECT f.* FROM fe_forecast f JOIN (SELECT slug, max(id) id FROM fe_forecast GROUP BY slug) l ON l.id = f.id WHERE f.outcome IS NULL AND f.deadline >= date('now') ORDER BY abs(f.p - f.prior) DESC, f.id DESC LIMIT 40").all();
  const all = await env.TRADES_DB.prepare("SELECT slug, prior, p, outcome, tokens FROM fe_forecast ORDER BY id").all();
  const rows = all.results || [];
  const tok = rows.length ? Math.round(rows.reduce((a, x) => a + (x.tokens || 0), 0) / rows.length) : 0;
  const lt = await env.TRADES_DB.prepare("SELECT skipped_json FROM fe_tick ORDER BY id DESC LIMIT 1").first().catch(() => null);
  let coverage = null; try { coverage = JSON.parse(lt?.skipped_json || "{}").coverage || null; } catch (e) { coverage = null; }
  const src = await env.TRADES_DB.prepare("SELECT source, count(*) n FROM fe_signal WHERE created_at > datetime('now','-21 days') GROUP BY source").all().catch(() => ({ results: [] }));
  return { rows: r.results || [], stats: { value: valueAdded(lastPerSlug(rows)), spinoff: spinoffStatus(rows), tokens_per: tok, total: rows.length, coverage, news_signals: Object.fromEntries((src.results || []).map((x) => [x.source, x.n])) } };
}

