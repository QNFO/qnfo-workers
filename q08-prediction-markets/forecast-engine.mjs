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
  // Q08-GROWTH-1 (owner 2026-11-12: "things that have some nexus with technology and current events ... really hard-hitting world event shit"):
  // a question about the firms and rules that set the AI and chip cycle is consequential on its own; listed last so leadership and capital keep their channel.
  { key: "tech", re: /\b(nvidia|openai|anthropic|tsmc|asml|semiconductors?|chips?|chipmakers?|ai|artificial intelligence|agi|gpus?|data cent(?:er|re)s?|antitrust|xai|deepmind|microsoft|alphabet|google|apple|amazon|meta|tesla)\b/i,
    moves: "AI and semiconductor equities: the largest weights in the Nasdaq-100 and their supply chains." },
];
// Q08-GROWTH-1: the technology nexus, read on every category (a CEO's exit at Nvidia or a chip export rule both carry it).
export const TECH_NEXUS = CONSEQUENCE[CONSEQUENCE.length - 1].re;
// Trivial or unforecastable from news: sports, price brackets (no news signal decides them), entertainment, stunts.
export const TRIVIAL = /\b(vs\.?|spread:|o\/u|win on \d|worlds \d{4}|champions league|nba|nfl|super bowl|grand prix|bitcoin|btc|ethereum|eth|solana|dip to \$|above \$|reach \$|gta|marathon|aliens?|divorce|album|box office|tweets?|posts?|mlb|nhl|ufc|fifa|world cup|wimbledon|formula 1|f1|oscars?|grammys?|emmys?|eurovision|mrbeast|streamer|youtuber|kardashians?|taylor swift|celebrity)\b/i;

// Q08-GROWTH-1: where the token budget goes. Tokens are spent on the questions with the widest financial transmission first: the channel's
// weight, a technology nexus, how contested the crowd is (a 50% question carries more information than a 3% one) and how much money trades it.
export const CATEGORY_WEIGHT = { monetary: 1, "energy-geopolitics": 1, leadership: 0.9, tech: 0.9, capital: 0.85, macro: 0.85, "officials-rules": 0.75 };
export function consequenceScore(q) {
  const c = q && q.category ? { key: q.category } : classify(q && q.title);
  if (!c) return 0;
  const p = Number.isFinite(+q.prior) ? +q.prior : 0.5;
  const contested = 4 * p * (1 - p), liq = Math.min(1, Math.log10(1 + Math.max(0, +q.vol24 || 0)) / 6);
  return +((CATEGORY_WEIGHT[c.key] ?? 0.7) + (TECH_NEXUS.test(String(q.title || "")) ? 0.35 : 0) + 0.5 * contested + 0.4 * liq + (q.incoherent ? 0.15 : 0)).toFixed(3);
}
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
export function combine(prior, verdicts, { shrink = 0.5, cap = 1, scale = 1 } = {}) {
  const ok = verdicts.filter((v) => v && v.ok);
  if (ok.length < 2) return { p: prior, shift: 0, why: "fewer than two valid model verdicts: the crowd stands" };
  const signs = new Set(ok.map((v) => Math.sign(v.shift)));
  if (signs.size === 1 && signs.has(0)) return { p: prior, shift: 0, why: "no model found evidence the crowd has not priced: the crowd stands" };
  if (signs.size > 1) return { p: prior, shift: 0, why: signs.has(0) ? "only one model saw a reason to move: the crowd stands" : "models disagree on direction: the crowd stands" };
  const mean = ok.reduce((a, v) => a + v.shift, 0) / ok.length;
  const shift = Math.max(-cap, Math.min(cap, shrink * scale * mean));
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
const HINT = { tech: "AI chips", monetary: "interest rates", macro: "economy", "energy-geopolitics": "oil", leadership: "CEO", capital: "IPO", "officials-rules": "government" };
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
    kept.push({ ...q, category: c.key, moves: c.moves, evidence, trigger: t.why, days: Math.round(days), score: consequenceScore({ ...q, category: c.key }) });
  }
  // One leg per family per tick: the leg nearest 30 days out carries the most news signal per token.
  const best = new Map();
  for (const q of kept) { const b = best.get(q.family); if (!b || Math.abs(q.days - 30) < Math.abs(b.days - 30)) best.set(q.family, q); }
  // Q08-GROWTH-1: the update budget goes to the most consequential questions first (was: incoherent legs, then evidence count).
  const chosen = [...best.values()].sort((a, b) => (b.score - a.score) || (b.evidence.length - a.evidence.length)).slice(0, limits.maxUpdatesPerTick);
  return { chosen, skipped, candidates: markets.length, consequential: consequential.length, coverage, starved: [...starved.values()].sort((a, b) => a.days - b.days) };
}

// Steps 5-7 for one question. ask(model, prompt) -> { text, in_tok, out_tok }.
export async function forecastOne(q, ask, today, opts = {}) {
  const prompt = buildPrompt(q, q.evidence, today), ids = q.evidence.map((e) => e.id);
  const answers = await Promise.all(MODELS.map(async (m) => { try { return { model: m, ...(await ask(m, prompt)) }; } catch (e) { return { model: m, text: "", error: String(e && e.message || e), in_tok: 0, out_tok: 0 }; } }));
  const verdicts = answers.map((a) => ({ model: a.model, ...parseShift(a.text, ids) }));
  const c = combine(q.prior, verdicts, opts);
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
  // VALUE-PIPELINE-1: daily closes of the financial instruments each question category moves (FRED, no key), so the page can show the market context.
  "CREATE TABLE IF NOT EXISTS fe_proxy (series TEXT NOT NULL, date TEXT NOT NULL, value REAL NOT NULL, fetched_at TEXT, PRIMARY KEY (series, date))",
  // Q08-GROWTH-1: the broadcast ledger (one post per call and per settlement), the product manager's knobs and its run log.
  "CREATE TABLE IF NOT EXISTS fe_broadcast (key TEXT PRIMARY KEY, slug TEXT NOT NULL, kind TEXT NOT NULL, thread_slug TEXT NOT NULL, queued_at TEXT NOT NULL, text TEXT, arm TEXT)",
  "CREATE TABLE IF NOT EXISTS fe_experiment (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, arm TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, start_json TEXT, end_json TEXT, score REAL)",
  "CREATE TABLE IF NOT EXISTS fe_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT, reason TEXT)",
  "CREATE TABLE IF NOT EXISTS fe_settle (slug TEXT PRIMARY KEY, checked_at TEXT NOT NULL, state TEXT)",
  "CREATE TABLE IF NOT EXISTS fe_research (id TEXT PRIMARY KEY, source TEXT, title TEXT, url TEXT, summary TEXT, seen_at TEXT, need TEXT, score REAL, status TEXT DEFAULT 'new', issue_id INTEGER, settled_at TEXT)",
  "CREATE TABLE IF NOT EXISTS fe_pm (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT NOT NULL, metrics_json TEXT, decisions_json TEXT, filed_json TEXT)",
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
  const r = await fetch(url, { headers: { "user-agent": "q08-forecasts/1 (+https://markets.q08.org/forecasts)", accept: "application/json, application/rss+xml, text/xml, text/csv;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(10000) });
  return { ok: r.ok, status: r.status, text: await r.text() };
}
export async function tick(env, nowMs = Date.now()) {
  await ensureSchema(env.TRADES_DB);
  const { markets, signals, lastBy } = await readInputs(env, nowMs);
  // Q08-GROWTH-1: the product manager's knobs (fe_config) override the defaults, each inside a fixed range.
  const cfg = await readConfig(env.TRADES_DB), limits = { ...LIMITS, maxUpdatesPerTick: cfg.max_updates };
  let pl = plan(markets, signals, lastBy, nowMs, limits), news = { added: [], log: [] };
  if (String(env.FE_NEWS || "on") !== "off" && pl.starved.length) {
    try {
      news = await newsLane(env.TRADES_DB, pl.starved, env.__fetchText || defaultFetchText, nowMs);
      if (news.added.length) pl = plan(markets, news.added.concat(signals), lastBy, nowMs, limits);
    } catch (e) { news.log.push({ error: String(e && e.message || e).slice(0, 200) }); }
  }
  const past = (await env.TRADES_DB.prepare("SELECT slug, prior, p, outcome FROM fe_forecast WHERE outcome IS NOT NULL ORDER BY id").all()).results || [];
  const spin = spinoffStatus(past);
  if (spin.halted) pl.chosen = []; // self-halt: the evidence says the adjustments hurt; the ledger keeps the crowd's number until it turns
  const today = new Date(nowMs).toISOString().slice(0, 10);
  let tokens = 0, updated = 0, error = null;
  for (const q of pl.chosen) {
    try {
      const f = await forecastOne(q, (m, p) => workersAiAsk(env, m, p), today, { scale: cfg.shift_scale });
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
  // Q08-CLOCK-1: settlement by name first, so a market that closed and left the open feed still settles this hour.
  let settle = null;
  try { settle = await settleLane(env, env.__fetchText || defaultFetchText, nowMs); } catch (e) { settle = [{ error: String(e && e.message || e).slice(0, 160) }]; }
  // Resolution: a closed market whose YES price sits at 0 or 1 settles every forecast on it (the pilot's fetch keeps pt_market current).
  await env.TRADES_DB.prepare("UPDATE fe_forecast SET outcome = (SELECT CASE WHEN m.yes >= 0.99 THEN 1 ELSE 0 END FROM pt_market m WHERE m.slug = fe_forecast.slug), resolved_at = ? WHERE outcome IS NULL AND EXISTS (SELECT 1 FROM pt_market m WHERE m.slug = fe_forecast.slug AND m.closed = 1 AND (m.yes >= 0.99 OR m.yes <= 0.01))").bind(new Date(nowMs).toISOString()).run().catch(() => null);
  // VALUE-PIPELINE-1: score the pipeline's stages on every tick, so each stage's history is in fe_tick beside the run that produced it
  let stages = null;
  try { const sd = await storyData(env, nowMs); sd.coverage = pl.coverage; stages = stageScores(sd).map((g) => ({ key: g.key, value: g.value, n: g.n, met: g.met })); } catch (err) { stages = { error: String(err && err.message || err).slice(0, 160) }; }
  // VALUE-PIPELINE-1: refresh the financial-market proxies (at most every 6 hours per series; a failure never stops the tick).
  let proxies = null;
  if (String(env.FE_PROXY || "on") !== "off") { try { proxies = await proxyLane(env.TRADES_DB, env.__fetchText || defaultFetchText, nowMs); } catch (e) { proxies = { error: String(e && e.message || e).slice(0, 160) }; } }
  // Q08-GROWTH-1: the broadcast loop (new calls and every settlement, wins and losses, queued for the fleet's social drain) and the product
  // manager (daily: measure, adjust its knobs, file the next code change). Each fails soft and never stops the tick.
  let broadcast = null, pm = null;
  if (String(env.FE_BROADCAST || "on") !== "off") { try { broadcast = await broadcastLane(env, nowMs, cfg); } catch (e) { broadcast = { error: String(e && e.message || e).slice(0, 160) }; } }
  if (String(env.FE_PM || "on") !== "off") { try { pm = await productManager(env, nowMs); } catch (e) { pm = { error: String(e && e.message || e).slice(0, 160) }; } }
  // Q08-CLOCK-1: read the clock after this tick's writes and escalate any stage its own repair did not bring back.
  let clock = null;
  try { const c = await clockStatus(env, nowMs); clock = { on_time: c.on_time, stages: c.stages, late: c.list.filter((x) => !x.on_time).map((x) => x.key), escalated: await escalateClock(env, c, nowMs) }; } catch (e) { clock = { error: String(e && e.message || e).slice(0, 160) }; }
  await env.TRADES_DB.prepare("INSERT INTO fe_tick (ran_at, candidates, consequential, updated, tokens, skipped_json, error) VALUES (?,?,?,?,?,?,?)")
    .bind(new Date(nowMs).toISOString(), pl.candidates, pl.consequential, updated, tokens, JSON.stringify({ ...pl.skipped, coverage: pl.coverage, news: news.log, proxies, stages, broadcast, settle, clock, pm: pm && { ran: !!pm.ran, decisions: (pm.decisions || []).length, experiments: pm.experiments, filed: (pm.filed || []).length, error: pm.error } }), error).run();
  return { candidates: pl.candidates, consequential: pl.consequential, updated, tokens, skipped: pl.skipped, coverage: pl.coverage, news: news.log, chosen: pl.chosen.map((q) => ({ slug: q.slug, score: q.score })), broadcast, settle, clock, pm, error };
}

// ---------- 8 card: the page ----------
const COVER_LABEL = { tech: "Technology", monetary: "Interest rates", macro: "Economic data", leadership: "Company leadership", capital: "Deals and listings", "energy-geopolitics": "Energy and geopolitics", "officials-rules": "Officials and rules" };
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
  return `<!doctype html><html lang="en"><head>${head("Q08 Forecasts", "Consequential forecasts derived from public signals, scored against the crowd.", FE_CSS + VP_CSS)}</head><body class="ds">
${siteTop("forecasts")}
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


// ---------- 9 value: signal -> forecast -> edge -> value, in the open (VALUE-PIPELINE-1) ----------
// The owner's question (2026-11-12): how does a forecast become money, and where is that shown? The answer is computed here from the ledger,
// never written by hand: every forecast that disagrees with the crowd opens one simulated position at the crowd's price at that moment
// (the side the forecast favours, a fixed stake), held to resolution with no hindsight exit and marked to the live market until then.
// A forecast that agrees with the crowd holds no position: there is no edge to trade. Paper only: no order, wallet or account exists.
export const STAKE = 100, MIN_EDGE = 0.02, QUOTE_TOL = 0.2;
const r2 = (x) => Math.round(x * 100) / 100;
export function simulateBook(rows, yesBySlug = {}, { stake = STAKE, minEdge = MIN_EDGE } = {}) {
  const first = new Map(), last = new Map();
  for (const r of rows || []) { last.set(r.slug, r); if (!first.has(r.slug) && Math.abs(r.p - r.prior) >= minEdge) first.set(r.slug, r); }
  const positions = [];
  for (const [slug, e] of first) {
    const l = last.get(slug), side = e.p > e.prior ? "YES" : "NO";
    const entry = side === "YES" ? e.prior : 1 - e.prior, belief = side === "YES" ? e.p : 1 - e.p;
    const outcome = l.outcome === 0 || l.outcome === 1 ? Number(l.outcome) : null;
    // The entry is the crowd's coherent price (the term structure repaired across the question's dates). The live quote marks the position only while it agrees
    // with that structure: an illiquid leg can print 15 cents one hour and 99.95 the next (Jensen Huang, 2026-11-12), so a quote more than QUOTE_TOL from the
    // ledger's latest coherent price is set aside and the ledger price marks the position instead (mark_source says which).
    const rawLive = Number.isFinite(+yesBySlug[slug]) ? +yesBySlug[slug] : null;
    const live = rawLive != null && Math.abs(rawLive - l.prior) <= QUOTE_TOL ? rawLive : null;
    const yesNow = outcome != null ? outcome : live != null ? live : l.prior;
    const mark = side === "YES" ? yesNow : 1 - yesNow, shares = stake / entry, value = shares * mark;
    positions.push({ slug, title: e.title, category: e.category, side, opened_at: e.created_at, deadline: e.deadline, crowd_at_entry: +e.prior.toFixed(4), forecast_at_entry: +e.p.toFixed(4),
      forecast_now: +l.p.toFixed(4), entry: +entry.toFixed(4), mark: +mark.toFixed(4), marked_live: outcome == null && live != null, mark_source: outcome != null ? "outcome" : live != null ? "live quote" : rawLive != null ? "ledger (live quote " + Math.round(100 * rawLive) + "¢ incoherent)" : "ledger", settled: outcome != null, outcome, stake, shares: +shares.toFixed(2),
      value: r2(value), pnl: r2(value - stake), expected_pnl: r2(stake * (belief / entry - 1)) });
  }
  positions.sort((a, b) => Number(a.settled) - Number(b.settled) || Math.abs(b.pnl) - Math.abs(a.pnl));
  const sum = (f) => r2(positions.reduce((a, x) => a + f(x), 0)), settled = positions.filter((x) => x.settled);
  const staked = positions.length * stake, pnl = sum((x) => x.pnl);
  return { stake, min_edge: minEdge, positions, totals: { positions: positions.length, open: positions.length - settled.length, settled: settled.length,
    wins: settled.filter((x) => x.pnl > 0).length, losses: settled.filter((x) => x.pnl <= 0).length, staked, value: sum((x) => x.value), pnl,
    realized: r2(settled.reduce((a, x) => a + x.pnl, 0)), unrealized: r2(positions.filter((x) => !x.settled).reduce((a, x) => a + x.pnl, 0)),
    return_pct: staked ? r2((100 * pnl) / staked) : null, expected_pnl_at_entry: sum((x) => x.expected_pnl),
    with_crowd: new Set((rows || []).map((r) => r.slug)).size - positions.length } };
}

// Financial-market transmission: each question category moves an instrument; FRED's public CSV gives its daily close (no key).
// Shown as context beside the prediction-market position, never as a position of its own.
export const PROXIES = {
  monetary: { id: "DGS2", name: "2-year Treasury yield", unit: "%" },
  macro: { id: "DGS10", name: "10-year Treasury yield", unit: "%" },
  "energy-geopolitics": { id: "DCOILBRENTEU", name: "Brent crude oil", unit: "$/bbl" },
  leadership: { id: "NASDAQ100", name: "Nasdaq-100 index", unit: "" },
  capital: { id: "SP500", name: "S&P 500 index", unit: "" },
  "officials-rules": { id: "DGS10", name: "10-year Treasury yield", unit: "%" },
  tech: { id: "NASDAQ100", name: "Nasdaq-100 index", unit: "" },
};
export function parseFredCsv(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/).slice(1)) {
    const [d, v] = line.split(",");
    if (/^\d{4}-\d{2}-\d{2}$/.test(d || "") && v != null && v.trim() !== "." && Number.isFinite(+v)) out.push({ date: d, value: +v });
  }
  return out;
}
export async function proxyLane(db, fetchText, nowMs, { maxAgeMin = 360, days = 120 } = {}) {
  const ids = [...new Set(Object.values(PROXIES).map((p) => p.id))], log = [];
  const since = new Date(nowMs - days * 86400000).toISOString().slice(0, 10), iso = new Date(nowMs).toISOString();
  for (const id of ids) {
    const last = await db.prepare("SELECT max(fetched_at) t FROM fe_proxy WHERE series = ?").bind(id).first().catch(() => null);
    if (last && last.t && nowMs - Date.parse(last.t) < maxAgeMin * 60000) { log.push({ id, skipped: "fresh" }); continue; }
    try {
      const r = await fetchText("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id + "&cosd=" + since);
      const pts = r && r.ok ? parseFredCsv(r.text) : [];
      for (const pt of pts) await db.prepare("INSERT OR REPLACE INTO fe_proxy (series, date, value, fetched_at) VALUES (?,?,?,?)").bind(id, pt.date, pt.value, iso).run();
      log.push({ id, status: r && r.status, points: pts.length });
    } catch (e) { log.push({ id, error: String(e && e.message || e).slice(0, 120) }); }
  }
  return log;
}
// The instrument's move from the last close on or before the forecast to the latest close.
export function proxyMove(points, sinceIso) {
  if (!points || !points.length) return null;
  const d = String(sinceIso || "").slice(0, 10), sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const now = sorted[sorted.length - 1], start = [...sorted].reverse().find((x) => x.date <= d) || sorted[0];
  return { start_date: start.date, start: start.value, now_date: now.date, now: now.value, change: +(now.value - start.value).toFixed(3), change_pct: start.value ? +((100 * (now.value - start.value)) / start.value).toFixed(2) : null };
}
// The q08 reports about the same question: pieces whose title or concept names one of its proper entities.
export function relatedPieces(title, pieces, max = 2) {
  const proper = properEntities(title).filter((e) => e.length >= 4 || /^[a-z]{3}$/.test(e));
  if (!proper.length) return [];
  const has = (t, e) => new RegExp("\\b" + e.replace(/[.$-]/g, "\\$&") + "\\b", "i").test(t);
  return (pieces || []).map((p) => ({ p, n: proper.filter((e) => has((p.title || "") + " " + (p.core_concept || ""), e)).length })).filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || String(b.p.published_at).localeCompare(String(a.p.published_at))).slice(0, max)
    .map((x) => ({ title: x.p.title, url: Q08_ORIGIN + "/p/" + x.p.slug, date: String(x.p.published_at || "").slice(0, 10) }));
}
export const Q08_ORIGIN = "https://q08.org", MARKETS_ORIGIN = "https://markets.q08.org";
const safe = async (f, d) => { try { return await f(); } catch (e) { return d; } };
const all = (db, sql, ...b) => safe(async () => ((await db.prepare(sql).bind(...b).all()).results || []), []);
// Everything the pipeline pages and q08.org's front door show, read from D1 in one place; every read fails soft so a page always renders.
export async function storyData(env, nowMs = Date.now()) {
  const db = env && env.TRADES_DB, sig = env && env.SIGNAL_DB, out = { generated_at: new Date(nowMs).toISOString(), stake: STAKE };
  if (!db) return { ...out, empty: true };
  await safe(() => ensureSchema(db));
  const rows = await all(db, "SELECT id, created_at, slug, title, deadline, category, moves, prior, p, outcome FROM fe_forecast ORDER BY id");
  const slugs = [...new Set(rows.map((r) => r.slug))];
  const px = slugs.length ? await all(db, `SELECT slug, yes, closed, updated_at FROM pt_market WHERE slug IN (${slugs.map(() => "?").join(",")})`, ...slugs) : []; // standards-ok: only "?" placeholders are interpolated
  const book = simulateBook(rows, Object.fromEntries(px.map((m) => [m.slug, m.yes])));
  const open = lastPerSlug(rows).filter((r) => r.outcome == null && r.deadline >= out.generated_at.slice(0, 10));
  const edges = open.map((r) => Math.abs(r.p - r.prior));
  // signals: the q08 stream (news feeds, searches, HN, arXiv, Federal Register) plus the engine's own news lane, last 7 days
  const s7 = sig ? await all(sig, "SELECT source, count(*) n FROM signal_log WHERE created_at > datetime('now','-7 days') GROUP BY source") : [];
  const n7 = await all(db, "SELECT source, count(*) n FROM fe_signal WHERE created_at > datetime('now','-7 days') GROUP BY source");
  const bySource = {}; for (const x of s7.concat(n7)) bySource[x.source] = (bySource[x.source] || 0) + x.n;
  const pieces = sig ? await all(sig, "SELECT slug, title, core_concept, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 150") : [];
  const proxyRows = await all(db, "SELECT series, date, value FROM fe_proxy WHERE date > date('now','-150 days') ORDER BY series, date");
  const series = {}; for (const x of proxyRows) (series[x.series] = series[x.series] || []).push({ date: x.date, value: x.value });
  const firstAt = {}; for (const r of rows) if (!firstAt[r.slug]) firstAt[r.slug] = r.created_at;
  const posBy = Object.fromEntries(book.positions.map((p) => [p.slug, p]));
  // Q08-GROWTH-1: lead with the most consequential questions, then the widest gap from the market.
  const forecasts = open.map((r) => ({ r, score: consequenceScore(r) })).sort((a, b) => (b.score + 5 * Math.abs(b.r.p - b.r.prior)) - (a.score + 5 * Math.abs(a.r.p - a.r.prior))).map(({ r, score }) => {
    const pr = PROXIES[r.category], mv = pr ? proxyMove(series[pr.id], firstAt[r.slug]) : null;
    return { slug: r.slug, title: r.title, category: r.category, deadline: r.deadline, crowd: +r.prior.toFixed(4), forecast: +r.p.toFixed(4), edge_pts: Math.round(100 * (r.p - r.prior)), moves: r.moves, score, url: MARKETS_ORIGIN + "/f/" + r.slug, registered_at: firstAt[r.slug],
      market_url: "https://polymarket.com/market/" + r.slug, position: posBy[r.slug] || null, proxy: pr && mv ? { ...pr, ...mv } : pr ? { ...pr } : null, related: relatedPieces(r.title, pieces) };
  });
  // the paper-trading pilot (its own estimator, now off) and its scored record, losses included
  const acct = await safe(() => db.prepare("SELECT cash, start_cash FROM pt_account WHERE id = 1").first(), null);
  const openPos = await all(db, "SELECT p.qty, p.entry, p.side, m.yes FROM pt_position p LEFT JOIN pt_market m ON m.slug = p.slug WHERE p.closed_at IS NULL");
  const closed = await all(db, "SELECT slug, title, side, entry, exit, pnl, strategy, opened_at, closed_at, reason FROM pt_position WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 50");
  const curve = (await all(db, "SELECT ts, equity FROM pt_equity ORDER BY ts DESC LIMIT 2016")).reverse();
  const est = await all(db, "SELECT fair, market, outcome FROM pt_estimate WHERE outcome IN (0,1) AND fair IS NOT NULL AND market IS NOT NULL");
  let pilot = null;
  if (acct) {
    const markOpen = openPos.reduce((a, p) => a + p.qty * (p.yes == null ? p.entry : String(p.side).toLowerCase() === "yes" ? p.yes : 1 - p.yes), 0);
    const equity = acct.cash + markOpen, realized = closed.reduce((a, x) => a + (x.pnl || 0), 0);
    pilot = { start: acct.start_cash, equity: r2(equity), return_pct: r2((equity / acct.start_cash - 1) * 100), realized: r2(realized), open: openPos.length, closed: closed.length,
      wins: closed.filter((x) => x.pnl > 0).length, losses: closed.filter((x) => !(x.pnl > 0)).length, trades: closed, curve: curve.map((c) => ({ ts: c.ts, equity: r2(c.equity) })) };
  }
  const estimator = est.length ? { n: est.length, brier_model: +(est.reduce((a, x) => a + brier(x.fair, x.outcome), 0) / est.length).toFixed(4), brier_market: +(est.reduce((a, x) => a + brier(x.market, x.outcome), 0) / est.length).toFixed(4) } : { n: 0 };
  const lt = await safe(() => db.prepare("SELECT skipped_json FROM fe_tick ORDER BY id DESC LIMIT 1").first(), null);
  let coverage = null; try { coverage = JSON.parse((lt && lt.skipped_json) || "{}").coverage || null; } catch (err) { coverage = null; }
  const res = { ...out, coverage, signals: { last_7d: Object.values(bySource).reduce((a, n) => a + n, 0), by_source: bySource, reports: pieces.length, latest_reports: pieces.slice(0, 6).map((p) => ({ title: p.title, url: Q08_ORIGIN + "/p/" + p.slug, date: String(p.published_at || "").slice(0, 10) })) },
    forecasts: { open: open.length, disagree: open.filter((r) => Math.abs(r.p - r.prior) >= MIN_EDGE).length, mean_edge_pts: edges.length ? r2((100 * edges.reduce((a, x) => a + x, 0)) / edges.length) : null, list: forecasts },
    value_added: valueAdded(lastPerSlug(rows)), spinoff: spinoffStatus(rows), book, pilot, estimator };
  res.stages = stageScores(res);
  res.clock = await safe(() => clockStatus(env, nowMs), null);
  res.pm = await safe(() => pmStatus(env, nowMs), null);
  const settledRows = lastPerSlug(rows).filter((r) => r.outcome === 0 || r.outcome === 1);
  res.record = { settled: settledRows.length, right_side: settledRows.filter((r) => callOf(r).right_side).length, beat_market: settledRows.filter((r) => callOf(r).beat_crowd === true).length, ledger_url: MARKETS_ORIGIN + "/ledger" };
  return res;
}


// Each stage is an input -> output function with a scored target (owner 2026-11-12: "signal to value with forecasting in the middle").
// The scores are computed from the same rows as the pages, published in /api/story and recorded on every engine tick (fe_tick.skipped_json.stages).
export const STAGE_TARGETS = [
  { key: "signal", name: "Signals in", input: "public news, searches, filings and research", output: "evidence matched to each market question", metric: "coverage", target: 0.8, unit: "share of questions with fresh evidence", loop: "a question without evidence triggers a targeted news fetch (news lane)" },
  { key: "forecast", name: "Forecasts out", input: "the crowd's price and the matched evidence", output: "one probability per question", metric: "value_added", target: 0, unit: "crowd Brier minus forecast Brier on settled questions", loop: "the engine halts its adjustments when the 95% interval is below zero" },
  { key: "edge", name: "Edge vs the market", input: "the forecast and the live price", output: "a side and a price gap", metric: "mean_edge_pts", target: 2, unit: "points of disagreement on open forecasts; a gap under the spread cannot be captured", loop: "positions open only at 2 points or more" },
  { key: "value", name: "Value captured", input: "simulated positions at the market price", output: "profit and loss", metric: "settled_return_pct", target: 0, unit: "return on settled positions, %", loop: "the track record recomputes every position from the ledger" },
];
export function stageScores(d) {
  const cov = d.coverage ? Object.values(d.coverage) : [], legs = cov.reduce((a, c) => a + (c.legs || 0), 0);
  const t = ((d.book || {}).totals) || {}, va = d.value_added || {};
  const val = { signal: legs ? +(cov.reduce((a, c) => a + (c.with_evidence || 0), 0) / legs).toFixed(3) : null, forecast: va.n ? va.value_added : null,
    edge: (d.forecasts || {}).mean_edge_pts ?? null, value: t.settled ? r2((100 * t.realized) / (t.settled * ((d.book || {}).stake || STAKE))) : null };
  const n = { signal: legs, forecast: va.n || 0, edge: (d.forecasts || {}).open || 0, value: t.settled || 0 };
  return STAGE_TARGETS.map((g) => ({ ...g, value: val[g.key], n: n[g.key], met: val[g.key] == null ? null : g.key === "forecast" || g.key === "value" ? val[g.key] > g.target : val[g.key] >= g.target }));
}

// ---------- 10 the pages: one story, one navigation across q08.org and markets.q08.org ----------
export const NAV = [["pipeline", Q08_ORIGIN + "/", "Pipeline"], ["forecasts", MARKETS_ORIGIN + "/", "Forecasts"], ["ledger", MARKETS_ORIGIN + "/ledger", "Ledger"], ["track", MARKETS_ORIGIN + "/track-record", "Track record"], ["reports", Q08_ORIGIN + "/#reports", "Signal reports"], ["paper", MARKETS_ORIGIN + "/paper", "Paper desk"]];
export function siteTop(active) {
  return `<header class="ds-top"><div class="ds-top-in"><a class="ds-brand" href="${Q08_ORIGIN}/">q08 <span class="ds-muted vp-tag">signal to value</span></a><nav class="vp-nav" aria-label="q08">${NAV.map(([k, h, l]) => `<a href="${h}"${k === active ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav></div></header>`;
}
export const VP_CSS = ".vp-tag{font-weight:400;font-size:14px}.vp-nav{display:flex;gap:2px 14px;flex-wrap:wrap;justify-content:flex-end}.vp-nav a{display:inline-flex;align-items:center;min-height:44px;font-size:15px;color:var(--ds-ink-2);text-decoration:none}.vp-nav a[aria-current=page]{color:var(--ds-ink);font-weight:650}"
  + ".vp-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:0 0 16px;counter-reset:st}.vp-step{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-m);padding:12px 14px;text-decoration:none;color:var(--ds-ink);display:block}.vp-step .k{font-size:14px;color:var(--ds-ink-2);font-weight:600}.vp-step .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;margin:2px 0}.vp-step p{font-size:14px;color:var(--ds-ink-2);margin:0}.vp-step .vp-t{margin-top:8px;padding-top:8px;border-top:1px solid var(--ds-line)}"
  + ".vp-pos{margin:8px 0 4px;padding:10px 12px;border-radius:var(--ds-r-m);background:var(--ds-surface-2);font-size:15px}.vp-tbl{width:100%;border-collapse:collapse;font-size:15px}.vp-tbl th,.vp-tbl td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--ds-line);vertical-align:top}.vp-tbl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.vp-wrap{overflow-x:auto}.vp-spark{width:100%;height:80px;color:var(--ds-accent)}"
  + "@media (max-width:640px){.vp-nav{display:none}}";
const e = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const usd = (x) => (x == null || !Number.isFinite(+x) ? "–" : (x < 0 ? "−$" : "$") + Math.abs(+x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const signed = (x) => (x == null ? "–" : (x > 0 ? "+" : "") + usd(x));
const tone = (x) => (x > 0 ? "ds-good" : x < 0 ? "ds-bad" : "");
// The four stages with their live numbers; shared by the markets page and, through /api/story, by q08.org's front door.
const fmtStage = (g) => g.value == null ? "–" : g.key === "signal" ? Math.round(100 * g.value) + "%" : g.key === "value" ? g.value + "%" : String(g.value);
function targetLine(d, key) {
  const g = (d.stages || stageScores(d)).find((x) => x.key === key);
  const want = key === "signal" ? Math.round(100 * g.target) + "% or more" : key === "edge" ? g.target + " points or more" : "above " + g.target;
  return `<p class="vp-t">Target ${e(want)} · now ${e(fmtStage(g))} · ${g.met == null ? "<span>awaiting data</span>" : g.met ? '<span class="ds-good">met</span>' : '<span class="ds-bad">missed</span>'}</p>`;
}
export function flowHtml(d, base = "") {
  const s = d.signals || {}, f = d.forecasts || {}, b = (d.book || {}).totals || {}, pl = d.pilot;
  return `<div class="vp-flow">
<a class="vp-step" href="${Q08_ORIGIN}/#reports"><div class="k">1 · Signals in</div><div class="v">${e(s.last_7d != null ? s.last_7d.toLocaleString("en-US") : "–")}</div><p>public signals read in 7 days from ${e(Object.keys(s.by_source || {}).length)} source types: news, searches, filings, research</p>${targetLine(d, "signal")}</a>
<a class="vp-step" href="${MARKETS_ORIGIN}/#forecasts"><div class="k">2 · Forecasts out</div><div class="v">${e(f.open != null ? f.open : "–")}</div><p>live probabilities on real Polymarket questions that move money</p>${targetLine(d, "forecast")}</a>
<a class="vp-step" href="${MARKETS_ORIGIN}/#forecasts"><div class="k">3 · Edge vs the market</div><div class="v">${e(f.disagree != null ? f.disagree : "–")}</div><p>forecasts that disagree with the crowd${f.mean_edge_pts != null ? `, ${e(f.mean_edge_pts)} points on average` : ""}; the rest agree and hold no position</p>${targetLine(d, "edge")}</a>
<a class="vp-step" href="${MARKETS_ORIGIN}/track-record"><div class="k">4 · Value captured</div><div class="v ${tone(b.pnl)}">${b.positions ? e(signed(b.pnl)) : "–"}</div><p>${b.positions ? `simulated P&amp;L on ${e(b.positions)} position${b.positions === 1 ? "" : "s"} of ${e(usd(d.stake))}` : "no position yet: one opens when a forecast leaves the crowd"}${pl ? `; paper desk ${e(signed(pl.equity - pl.start))}` : ""}</p>${targetLine(d, "value")}</a>
</div>`;
}
function posLine(pos) {
  if (!pos) return `<div class="vp-pos">No position: the forecast agrees with the market, so there is no edge to trade.</div>`;
  return `<div class="vp-pos"><b>Simulated position:</b> buy ${e(pos.side)} at ${e(Math.round(pos.entry * 100))}¢ with ${e(usd(pos.stake))} on ${e(String(pos.opened_at).slice(0, 10))}. ${pos.settled ? "Settled" : pos.marked_live ? "Marked to the market now" : "Marked at the crowd's coherent price (the live quote is out of line with the question's other dates)"} at ${e(Math.round(pos.mark * 100))}¢: <b class="${tone(pos.pnl)}">${e(signed(pos.pnl))}</b>. If the forecast is right on average, expected ${e(signed(pos.expected_pnl))}.</div>`;
}
function proxyLine(px) {
  if (!px) return "";
  if (px.now == null) return `<p class="ds-muted"><b>Financial market:</b> ${e(px.name)} (data loading).</p>`;
  return `<p class="ds-muted"><b>Financial market:</b> ${e(px.name)} ${e(px.now)}${e(px.unit === "%" ? "%" : px.unit ? " " + px.unit : "")} on ${e(px.now_date)}, ${px.change >= 0 ? "+" : ""}${e(px.change)}${px.unit === "%" ? " points" : ""} since this forecast opened (${e(px.start_date)}). Context for where the same question is priced outside prediction markets, not a position.</p>`;
}
export function storyBody(d) {
  const list = ((d.forecasts || {}).list || []);
  const cards = list.map((f) => `<article class="ds-card" id="${e(f.slug)}"><div class="fe-top"><h3 class="ds-card-title"><a href="/f/${e(f.slug)}">${e(f.title)}</a></h3><div class="fe-p">${e(pct(f.forecast))}</div></div>
<div class="ds-meta">${f.edge_pts ? `<span class="ds-badge ds-badge-accent">${f.edge_pts > 0 ? "+" : ""}${e(f.edge_pts)} pts vs crowd</span>` : `<span class="ds-badge">With the crowd</span>`} Crowd ${e(pct(f.crowd))} · settles ${e(f.deadline)} · <a href="${e(f.market_url)}" rel="nofollow noopener">market</a></div>
${posLine(f.position)}
<p class="ds-muted"><b>What it moves:</b> ${e(f.moves)}</p>${proxyLine(f.proxy)}
${f.related && f.related.length ? `<p class="ds-muted"><b>Signal reports on q08.org:</b> ${f.related.map((r) => `<a href="${e(r.url)}">${e(r.title)}</a>`).join(" · ")}</p>` : ""}</article>`).join("\n");
  return cards || `<div class="ds-empty"><b>No forecasts yet</b>The engine runs hourly and writes one when a consequential market question has fresh signals.</div>`;
}
export function renderStory(d, head) {
  const b = (d.book || {}).totals || {};
  return `<!doctype html><html lang="en"><head>${head("q08: signal to value", "Public signals become forecasts on real prediction markets; every forecast's edge is priced and tracked as a simulated position, losses included.", FE_CSS + VP_CSS + GROWTH_CSS)}</head><body class="ds">
${siteTop("forecasts")}
<main class="ds-main"><div class="ds-head"><h1>Signals in. Forecasts out. Value measured.</h1><p>Funds and trading desks turn signals into forecasts and forecasts into positions behind closed doors. q08 runs that loop live and in the open: every signal, every forecast, every simulated position and every loss is on this page and in the <a href="/api/story">data</a>. Every forecast is <a href="/ledger">pre-registered</a> before its event.</p></div>
${heroHtml(d)}
${flowHtml(d)}
${clockHtml(d.clock)}
<p class="ds-note">How the value is captured: when a forecast leaves the market price, the side it favours is bought at that price. If the forecast is better calibrated than the crowd, those positions earn money on average; if not, they lose it, and the <a href="/track-record">track record</a> shows which. ${b.positions ? "" : "No forecast has left the crowd yet, so the book is empty."}</p>
<h2 id="forecasts">Forecasts that move money</h2>
${storyBody(d)}
${portfolioHtml()}
<footer class="fe-foot"><a href="/ledger">Ledger</a><a href="/track-record">Track record</a><a href="${Q08_ORIGIN}/#reports">Signal reports</a><a href="/paper">Paper desk</a><a href="/whitepaper">White paper</a><a href="/api/story">Data (JSON)</a><span>Simulated positions only. Not investment advice.</span></footer>
</main></body></html>`;
}
// The lead call: the most consequential open forecast that leaves the market, as a headline with its numbers, its hash and its settle date.
export function heroHtml(d) {
  const list = ((d.forecasts || {}).list || []), f = list.find((x) => x.edge_pts) || list[0];
  if (!f) return "";
  const r = d.record || {};
  return `<section class="vp-hero" aria-label="Lead call"><div class="k">Lead call · pre-registered ${e(String(f.registered_at || "").slice(0, 10))}${r.settled ? ` · record so far: ${e(r.right_side)} of ${e(r.settled)} settled on the right side` : ""}</div>
<h2><a href="/f/${e(f.slug)}">${e(f.title)}</a></h2><div class="n"><div><b>${e(pct(f.forecast))}</b><span>q08</span></div><div><b>${e(pct(f.crowd))}</b><span>the market</span></div><div><b>${e(f.deadline)}</b><span>settles</span></div></div>
<p class="ds-muted">${e(f.moves)} <a href="/f/${e(f.slug)}">From signal to settlement</a>.</p></section>`;
}
function pmHtml(pm) {
  if (!pm || !pm.runs) return "";
  const last = pm.runs[0];
  const kd = last ? (last.decisions || []).filter((x) => x.from !== undefined) : [];
  return `<h2>Product loop</h2><p class="ds-muted">A product manager runs inside the pipeline once a day: it reads its own numbers (${e(pm.questions ?? "–")} questions, ${e(pm.settled ?? 0)} settled, signal coverage ${e(pm.coverage == null ? "–" : Math.round(100 * pm.coverage) + "%")}, ${e(pm.broadcasts_7d ?? 0)} broadcasts this week${pm.traffic ? `, ${e(pm.traffic.pageviews_7d)} page views` : ""}), turns its own knobs (updates an hour: ${e(pm.config && pm.config.max_updates)}, posts a day: ${e(pm.config && pm.config.broadcast_per_day)}) and files the next growth or repair change for the fleet's code loop. Growth targets: ${(pm.growth || []).map((g) => `${e(g.name)} ${g.value == null ? "–" : e(g.value)} against ${e(g.target)} ${g.met == null ? "(no data yet)" : g.met ? "(met)" : "(missed)"}`).join("; ")}. ${(pm.experiments || [])[0] ? `Experiment running: ${e(pm.experiments[0].key)}, arm ${e(pm.experiments[0].arm)}.` : ""} ${last ? `Last run ${e(String(last.ran_at).slice(0, 16).replace("T", " "))} UTC: ${e(kd.length)} knob change${kd.length === 1 ? "" : "s"}${kd.length ? " (" + e(kd.map((x) => x.key + " " + x.from + "→" + x.to).join(", ")) + ")" : ""}, ${e(last.filed.filter((x) => x.new).length)} change filed.` : "First run within the day."} <a href="/api/pm">Its data</a>.</p>`;
}
function spark(curve) {
  if (!curve || curve.length < 2) return "";
  const v = curve.map((c) => c.equity), lo = Math.min(...v), hi = Math.max(...v), w = 600, h = 80, k = (hi - lo) || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 4 - ((y - lo) / k) * (h - 8)).toFixed(1)}`).join(" ");
  return `<svg class="vp-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Paper desk equity from ${e(usd(v[0]))} to ${e(usd(v[v.length - 1]))}"><polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" points="${pts}"/></svg>`;
}
export function renderTrackRecord(d, head) {
  const bk = d.book || { positions: [], totals: {} }, t = bk.totals || {}, pl = d.pilot, es = d.estimator || {}, va = d.value_added || {};
  const prow = (p) => `<tr><td><a href="/f/${e(p.slug)}">${e(p.title)}</a><br><small>${e(String(p.opened_at).slice(0, 10))} · forecast ${e(pct(p.forecast_at_entry))} vs crowd ${e(pct(p.crowd_at_entry))}</small></td><td>${e(p.side)} @ ${e(Math.round(p.entry * 100))}¢</td><td class="n">${e(Math.round(p.mark * 100))}¢${p.settled ? " settled" : ""}</td><td class="n ${tone(p.pnl)}">${e(signed(p.pnl))}</td></tr>`;
  const trow = (x) => `<tr><td>${e(x.title || x.slug)}<br><small>${e(String(x.opened_at || "").slice(0, 10))} to ${e(String(x.closed_at || "").slice(0, 10))} · ${e(x.reason || x.strategy || "")}</small></td><td>${e(String(x.side || "").toUpperCase())} @ ${e(Math.round((x.entry || 0) * 100))}¢</td><td class="n">${x.exit == null ? "–" : e(Math.round(x.exit * 100)) + "¢"}</td><td class="n ${tone(x.pnl)}">${e(signed(x.pnl))}</td></tr>`;
  const table = (rows, f) => `<div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Question</th><th>Bought</th><th>Now</th><th>P&amp;L</th></tr></thead><tbody>${rows.map(f).join("")}</tbody></table></div>`;
  return `<!doctype html><html lang="en"><head>${head("q08 track record", "Every simulated position the q08 forecasts took against real prediction markets, marked live, losses included.", FE_CSS + VP_CSS + GROWTH_CSS)}</head><body class="ds">
${siteTop("track")}
<main class="ds-main"><div class="ds-head"><h1>Track record</h1><p>What the forecasts would have made or lost, recomputed from the hash-chained ledger on every visit. Wins and losses both stay on this page.</p></div>
<section class="ds-stats"><div class="ds-stat"><div class="k">Forecast book P&amp;L</div><div class="v ${tone(t.pnl)}">${t.positions ? e(signed(t.pnl)) : "–"}</div></div><div class="ds-stat"><div class="k">Positions (open / settled)</div><div class="v">${e(t.open || 0)} / ${e(t.settled || 0)}</div></div><div class="ds-stat"><div class="k">Settled wins / losses</div><div class="v">${e(t.wins || 0)} / ${e(t.losses || 0)}</div></div><div class="ds-stat"><div class="k">Value added vs crowd</div><div class="v">${va.n ? e(va.value_added) : "–"}</div></div></section>
<h2>The pipeline's targets</h2><div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Stage</th><th>Input → output</th><th>Target</th><th>Now</th></tr></thead><tbody>${(d.stages || []).map((g) => `<tr><td>${e(g.name)}</td><td>${e(g.input)} → ${e(g.output)}<br><small>${e(g.unit)}. Loop: ${e(g.loop)}.</small></td><td class="n">${e(g.key === "signal" ? Math.round(100 * g.target) + "%" : g.target)}</td><td class="n ${g.met == null ? "" : g.met ? "ds-good" : "ds-bad"}">${e(fmtStage(g))}${g.met == null ? " (no data yet)" : ""}</td></tr>`).join("")}</tbody></table></div>
<h2>Forecast book</h2><p class="ds-muted">One ${e(usd(bk.stake || STAKE))} position per forecast that moved at least ${e(Math.round(100 * (bk.min_edge || MIN_EDGE)))} points from the market, bought at the market price at that moment, held to resolution. ${e(t.with_crowd || 0)} forecast${t.with_crowd === 1 ? "" : "s"} agree with the crowd and hold nothing. Expected P&amp;L at entry, if the forecasts are right: ${e(signed(t.expected_pnl_at_entry))}.</p>
${bk.positions && bk.positions.length ? table(bk.positions, prow) : `<div class="ds-empty"><b>No position yet</b>The first one opens the hour a forecast moves away from the market price.</div>`}
<h2>Paper desk</h2>${pl ? `<p class="ds-muted">The earlier pilot: ${e(usd(pl.start))} of simulated money traded by a price-blind estimator. Equity now ${e(usd(pl.equity))} (${e(pl.return_pct)}%), realized ${e(signed(pl.realized))} on ${e(pl.closed)} closed trades (${e(pl.wins)} won, ${e(pl.losses)} lost), ${e(pl.open)} open.</p>${spark(pl.curve)}${pl.trades.length ? table(pl.trades.slice(0, 20), trow) : ""}` : `<div class="ds-empty"><b>No paper desk data</b>The pilot's account appears after its first tick.</div>`}
<h2>Accuracy against the crowd</h2><p class="ds-muted">${es.n ? `The pilot's estimator, scored on ${e(es.n)} resolved questions: Brier ${e(es.brier_model)} against ${e(es.brier_market)} for the market price (lower is better). ${es.brier_model > es.brier_market ? "The market was more accurate, so the estimator was switched off and the current engine starts from the market price and moves only on cited signals." : "The estimator beat the market price."}` : "No resolved estimates yet."} ${va.n ? `Current engine on ${e(va.n)} settled: Brier ${e(va.brier_engine)} vs crowd ${e(va.brier_prior)}.` : "The current engine has no settled forecast yet; its score appears here when the first market resolves."}</p>
${clockHtml(d.clock)}
${pmHtml(d.pm)}
${portfolioHtml()}
<footer class="fe-foot"><a href="/">Forecasts</a><a href="/ledger">Ledger</a><a href="/api/pm">Product loop (JSON)</a><a href="/api/story">Data (JSON)</a><span>Simulated positions only. Not investment advice.</span></footer>
</main></body></html>`;
}

// ---------- 11 growth: pre-registration you can check, the pipeline to the event, broadcast, a product manager (Q08-GROWTH-1) ----------
// Owner 2026-11-12: "pre-register things and admit when we get things wrong ... show how that pipeline completes itself through to the event",
// "promote the hell out of it", and "is there a Q08 markets product manager that's thinking about how to plus this?". All of it is code below.

// Portfolio doors on every q08 forecast page (the explore rail carries the same catalog on the QNFO side, so the links run both ways).
export const PORTFOLIO = [
  ["Ultrastable", "https://ultrastable.io/", "the autonomous platform this whole pipeline runs on"],
  ["QNFO research", "https://qnfo.org/", "the open research imprint behind the method"],
  ["Paper library", "https://papers.qnfo.org/papers", "every paper open, versioned and citable"],
  ["Live fleet", "https://fleet.qnfo.org/", "watch the system that runs q08 work in real time"],
];
export function portfolioHtml() {
  return `<section class="vp-port" aria-label="More from the same system"><h2>Built by the same system</h2><div class="vp-port-g">${PORTFOLIO.map(([t, u, d]) => `<a href="${u}?utm_source=markets.q08.org&amp;utm_medium=portfolio&amp;utm_campaign=q08-growth"><b>${e(t)}</b><span>${e(d)}</span></a>`).join("")}</div></section>`;
}
export const GROWTH_CSS = ".vp-port{margin:32px 0 8px}.vp-port-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.vp-port-g a{display:block;min-height:44px;padding:12px 14px;border:1px solid var(--ds-line);border-radius:var(--ds-r-m);text-decoration:none;color:var(--ds-ink)}.vp-port-g a span{display:block;font-size:14px;color:var(--ds-ink-2);margin-top:2px}"
  + ".vp-hero{margin:4px 0 20px;padding:18px;border:1px solid var(--ds-line);border-radius:var(--ds-r-l);background:var(--ds-surface)}.vp-hero .k{font-size:14px;color:var(--ds-ink-2);font-weight:600}.vp-hero h2{margin:6px 0 8px;font-size:24px;line-height:1.25}.vp-hero h2 a{color:var(--ds-ink);text-decoration:none}.vp-hero .n{display:flex;gap:20px;flex-wrap:wrap;font-variant-numeric:tabular-nums}.vp-hero .n b{display:block;font-size:30px}.vp-hero .n span{font-size:14px;color:var(--ds-ink-2)}"
  + ".vp-steps{list-style:none;padding:0;margin:8px 0 16px;border-left:2px solid var(--ds-line)}.vp-steps li{padding:6px 0 10px 16px;position:relative}.vp-steps li b{display:block}.vp-steps li span{font-size:15px;color:var(--ds-ink-2)}.vp-hash{font-family:ui-monospace,monospace;font-size:14px;word-break:break-all}";

// The engine's call on a settled question, both ways it can be scored: did it pick the right side, and did it beat the price it started from.
export function callOf(r) {
  if (!r || !(r.outcome === 0 || r.outcome === 1)) return null;
  const o = Number(r.outcome), right = (r.p >= 0.5 ? 1 : 0) === o, be = brier(r.p, o), bc = brier(r.prior, o);
  return { outcome: o, right_side: right, beat_crowd: be < bc - 1e-9 ? true : be > bc + 1e-9 ? false : null, brier: +be.toFixed(4), brier_crowd: +bc.toFixed(4) };
}
export function verdictText(c) {
  if (!c) return "open";
  const side = c.right_side ? "right side" : "wrong side";
  return c.beat_crowd === true ? side + ", beat the market" : c.beat_crowd === false ? side + ", the market did better" : side + ", same as the market";
}

// Pre-registration check: every ledger row's hash is recomputed from what it committed to, and each row must point at the row before it.
// The recipe is public: sha256 of JSON [created_at, slug, prior, p, evidence urls, prev_hash or ""].
export async function verifyLedger(rows) {
  let prev = "", ok = 0;
  const broken = [];
  for (const r of rows || []) {
    let urls = [];
    try { urls = JSON.parse(r.evidence_json || "[]").map((x) => x.url); } catch (err) { urls = []; }
    const h = await sha256Hex(JSON.stringify([r.created_at, r.slug, r.prior, r.p, urls, r.prev_hash || ""]));
    const linked = (r.prev_hash || "") === prev, sealed = h === r.hash;
    if (linked && sealed) ok++; else broken.push({ id: r.id, sealed, linked });
    prev = r.hash || "";
  }
  return { rows: (rows || []).length, ok, intact: broken.length === 0, broken: broken.slice(0, 20), head: prev || null,
    recipe: "sha256(JSON.stringify([created_at, slug, prior, p, evidence urls in order, prev_hash or \"\"]))" };
}

// Financial sensitivity: how big the instrument's move since the forecast is against its own typical daily move.
// Yields move in points, indexes and oil in percent; z is the move over sqrt(trading days) typical moves.
export function proxySensitivity(points, sinceIso, unit) {
  if (!points || points.length < 15) return null;
  const s = [...points].sort((a, b) => a.date.localeCompare(b.date)), ch = [];
  const step = (a, b) => (unit === "%" ? b - a : (100 * (b - a)) / a);
  for (let i = 1; i < s.length; i++) if (s[i - 1].value) ch.push(step(s[i - 1].value, s[i].value));
  const m = ch.reduce((a, x) => a + x, 0) / ch.length, sd = Math.sqrt(ch.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, ch.length - 1));
  const d = String(sinceIso || "").slice(0, 10), i0 = Math.max(0, s.findLastIndex((x) => x.date <= d)), days = Math.max(1, s.length - 1 - i0);
  const move = step(s[i0].value, s[s.length - 1].value);
  return { daily_sd: +sd.toFixed(3), move: +move.toFixed(3), days, z: sd ? +(move / (sd * Math.sqrt(days))).toFixed(2) : null, unit: unit === "%" ? "points" : "%" };
}
// Prediction-market sensitivity: the other live questions about the same names, so a reader sees what else reprices when this one moves.
export function relatedMarkets(title, slug, markets, max = 5) {
  const proper = properEntities(title).filter((x) => x.length >= 4), fam = familyKey(title);
  if (!proper.length) return [];
  const has = (t, x) => new RegExp("\\b" + x.replace(/[.$-]/g, "\\$&") + "\\b", "i").test(t);
  return (markets || []).filter((m) => m.slug !== slug && familyKey(m.title) !== fam && !TRIVIAL.test(m.title) && proper.some((x) => has(m.title, x)))
    .sort((a, b) => (+b.vol24 || 0) - (+a.vol24 || 0)).slice(0, max)
    .map((m) => ({ slug: m.slug, title: m.title, yes: m.yes == null ? null : +(+m.yes).toFixed(3), vol24: Math.round(+m.vol24 || 0), url: "https://polymarket.com/market/" + m.slug }));
}

// One question, end to end: the signals, the pre-registered entries with their hashes, the markets it moves, and how it settles.
export async function forecastData(env, slug, nowMs = Date.now()) {
  const db = env && env.TRADES_DB;
  if (!db || !slug) return null;
  await safe(() => ensureSchema(db));
  const rows = await all(db, "SELECT * FROM fe_forecast WHERE slug = ? ORDER BY id", slug);
  if (!rows.length) return null;
  const last = rows[rows.length - 1], first = rows[0];
  const mk = await safe(() => db.prepare("SELECT slug, title, yes, vol24, closed, ends_at, updated_at FROM pt_market WHERE slug = ?").bind(slug).first(), null);
  const open = await all(db, "SELECT slug, title, yes, vol24 FROM pt_market WHERE closed = 0 AND yes > 0.01 AND yes < 0.99 ORDER BY vol24 DESC LIMIT 400");
  const pr = PROXIES[last.category] || null;
  const pts = pr ? await all(db, "SELECT date, value FROM fe_proxy WHERE series = ? ORDER BY date", pr.id) : [];
  const pieces = env.SIGNAL_DB ? await all(env.SIGNAL_DB, "SELECT slug, title, core_concept, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 150") : [];
  const book = simulateBook(rows, mk && mk.yes != null ? { [slug]: mk.yes } : {});
  let ev = [], vs = [];
  try { ev = JSON.parse(last.evidence_json || "[]"); vs = JSON.parse(last.verdicts_json || "[]"); } catch (err) { ev = []; vs = []; }
  const mv = pr ? proxyMove(pts, first.created_at) : null;
  return {
    slug, title: last.title, category: last.category, moves: last.moves, deadline: last.deadline, score: consequenceScore({ title: last.title, category: last.category, prior: last.prior, vol24: mk && mk.vol24 }),
    forecast: +last.p.toFixed(4), crowd: +last.prior.toFixed(4), live_quote: mk && mk.yes != null ? +(+mk.yes).toFixed(4) : null, market_closed: !!(mk && mk.closed), market_url: "https://polymarket.com/market/" + slug,
    call: callOf(last), position: book.positions[0] || null,
    entries: rows.map((r) => ({ id: r.id, at: r.created_at, crowd: +r.prior.toFixed(4), forecast: +r.p.toFixed(4), trigger: r.trig, hash: r.hash, prev_hash: r.prev_hash, tokens: r.tokens })),
    evidence: ev, verdicts: vs.map((v) => ({ model: String(v.model || "").split("/").pop(), ok: !!v.ok, shift: v.shift, cites: v.cites || [], mechanism: v.mechanism || "", watch: v.watch || "" })),
    related_markets: relatedMarkets(last.title, slug, open), related_reports: relatedPieces(last.title, pieces, 4),
    proxy: pr ? { ...pr, ...(mv || {}), sensitivity: proxySensitivity(pts, first.created_at, pr.unit) } : null,
    resolution: { source: "Polymarket market " + slug, rule: "settles when the market closes at 0 or 1; the engine reads the closed price and scores its last forecast against the crowd's price at that moment", by: last.deadline },
    generated_at: new Date(nowMs).toISOString(),
  };
}
function sensLine(px) {
  if (!px) return "";
  const s = px.sensitivity;
  const base = px.now == null ? `${e(px.name)} (data loading)` : `${e(px.name)} ${e(px.now)}${e(px.unit === "%" ? "%" : px.unit ? " " + px.unit : "")} on ${e(px.now_date)}`;
  return `<p><b>Financial market:</b> ${base}.${s ? ` Typical daily move ${e(s.daily_sd)} ${e(s.unit)}; since this forecast was pre-registered it moved ${s.move >= 0 ? "+" : ""}${e(s.move)} ${e(s.unit)} over ${e(s.days)} trading day${s.days === 1 ? "" : "s"}, ${e(s.z == null ? "–" : Math.abs(s.z))} typical moves ${s.z >= 0 ? "up" : "down"}.` : ""} Context for how the same question is priced outside prediction markets, not a position.</p>`;
}
export function renderForecast(d, head) {
  const c = d.call, pos = d.position, last = d.entries[d.entries.length - 1], first = d.entries[0];
  const steps = [
    ["Signals matched", `${d.evidence.length} public signal${d.evidence.length === 1 ? "" : "s"} matched to the question by name${d.related_reports.length ? `, ${d.related_reports.length} q08 signal report${d.related_reports.length === 1 ? "" : "s"}` : ""}.`],
    ["Pre-registered", `${e(String(first.at).replace("T", " ").slice(0, 16))} UTC, ledger hash <span class="vp-hash">${e(String(first.hash).slice(0, 16))}</span>, before the event.`],
    ["Updated in the open", `${d.entries.length} entr${d.entries.length === 1 ? "y" : "ies"}, each chained to the one before; the latest at ${e(String(last.at).replace("T", " ").slice(0, 16))} UTC.`],
    ["Settles on the event", `${e(d.resolution.rule)}; due by ${e(d.deadline)}. <a href="${e(d.market_url)}" rel="nofollow noopener">The market</a>.`],
    ["Scored in public", c ? `Outcome ${c.outcome ? "YES" : "NO"}: ${e(verdictText(c))} (Brier ${e(c.brier)} vs ${e(c.brier_crowd)}). It stays on the <a href="/ledger">ledger</a> either way.` : "Open. When it settles, the result is posted and kept here and on the ledger, right or wrong."],
  ];
  const ev = d.evidence.map((x) => `<li>${e(x.id)} <a href="${e(x.url)}" rel="nofollow noopener">${e(x.title)}</a> <small>${e(x.source)}, ${e(x.date)}</small></li>`).join("");
  const why = (d.verdicts.find((v) => v.ok && v.mechanism && v.shift !== 0) || {}).mechanism || "";
  const watch = (d.verdicts.find((v) => v.ok && v.watch) || {}).watch || "";
  const edge = Math.round(100 * (d.forecast - d.crowd));
  return `<!doctype html><html lang="en"><head>${head(d.title + " · q08 forecast", "q08 " + pct(d.forecast) + " vs market " + pct(d.crowd) + ". Pre-registered, hash-chained and scored in public when it settles.", FE_CSS + VP_CSS + GROWTH_CSS)}</head><body class="ds">
${siteTop("forecasts")}
<main class="ds-main"><div class="ds-head"><h1>${e(d.title)}</h1><p>${c ? "Settled. " + e(verdictText(c)) + "." : `q08 says <b>${e(pct(d.forecast))}</b>; the market says ${e(pct(d.crowd))}${edge ? ` (${edge > 0 ? "+" : ""}${e(edge)} points)` : ", so q08 agrees with it"}. Settles by ${e(d.deadline)}.`}</p></div>
<section class="ds-stats"><div class="ds-stat"><div class="k">q08 forecast</div><div class="v">${e(pct(d.forecast))}</div></div><div class="ds-stat"><div class="k">Market (coherent)</div><div class="v">${e(pct(d.crowd))}</div></div><div class="ds-stat"><div class="k">Simulated P&amp;L</div><div class="v ${tone(pos && pos.pnl)}">${pos ? e(signed(pos.pnl)) : "no position"}</div></div></section>
${why ? `<p class="fe-why">${e(why)}</p>` : ""}<p class="ds-muted"><b>What it moves:</b> ${e(d.moves)}${watch ? `<br><b>Watch:</b> ${e(watch)}` : ""}</p>
${sensLine(d.proxy)}
<h2>From signal to settlement</h2><ol class="vp-steps">${steps.map(([k, v]) => `<li><b>${e(k)}</b><span>${v}</span></li>`).join("")}</ol>
${d.related_markets.length ? `<h2>Markets that reprice with it</h2><div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Question</th><th>Yes</th><th>24h volume</th></tr></thead><tbody>${d.related_markets.map((m) => `<tr><td><a href="${e(m.url)}" rel="nofollow noopener">${e(m.title)}</a></td><td class="n">${e(pct(m.yes))}</td><td class="n">${e(usd(m.vol24).replace(".00", ""))}</td></tr>`).join("")}</tbody></table></div>` : ""}
${d.related_reports.length ? `<h2>Signal reports on q08.org</h2><ul>${d.related_reports.map((r) => `<li><a href="${e(r.url)}">${e(r.title)}</a> <small>${e(r.date)}</small></li>`).join("")}</ul>` : ""}
<details class="ds-more"><summary>Evidence (${d.evidence.length}) and the models' verdicts</summary><div class="ds-more-body"><ul>${ev}</ul><ul>${d.verdicts.map((v) => `<li><small>${e(v.model)}: ${v.ok ? "shift " + e(v.shift) + " citing " + e(v.cites.join(", ") || "none") : "set aside"}</small></li>`).join("")}</ul></div></details>
<details class="ds-more"><summary>Every pre-registered entry (${d.entries.length})</summary><div class="ds-more-body"><div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>When (UTC)</th><th>q08</th><th>Market</th><th>Hash</th></tr></thead><tbody>${[...d.entries].reverse().map((x) => `<tr><td>${e(String(x.at).replace("T", " ").slice(0, 16))}<br><small>${e(x.trigger || "")}</small></td><td class="n">${e(pct(x.forecast))}</td><td class="n">${e(pct(x.crowd))}</td><td class="vp-hash">${e(String(x.hash).slice(0, 12))}</td></tr>`).join("")}</tbody></table></div></div></details>
${portfolioHtml()}
<footer class="fe-foot"><a href="/">All forecasts</a><a href="/ledger">Ledger</a><a href="/track-record">Track record</a><a href="/api/f/${e(d.slug)}">Data (JSON)</a><span>Simulated positions only. Not investment advice.</span></footer>
</main></body></html>`;
}

// The ledger: every entry with its hash, the chain check, and every settled call with its verdict, misses first.
export async function ledgerData(env, nowMs = Date.now(), limit = 200) {
  const db = env && env.TRADES_DB;
  if (!db) return { empty: true, generated_at: new Date(nowMs).toISOString() };
  await safe(() => ensureSchema(db));
  const rows = await all(db, "SELECT id, created_at, slug, title, deadline, category, prior, p, evidence_json, outcome, resolved_at, prev_hash, hash FROM fe_forecast ORDER BY id");
  const chain = await verifyLedger(rows);
  const settled = lastPerSlug(rows).filter((r) => r.outcome === 0 || r.outcome === 1).map((r) => ({ slug: r.slug, title: r.title, deadline: r.deadline, resolved_at: r.resolved_at, forecast: +r.p.toFixed(4), crowd: +r.prior.toFixed(4), ...callOf(r) }))
    .sort((a, b) => Number(a.right_side) - Number(b.right_side) || String(b.resolved_at).localeCompare(String(a.resolved_at)));
  const n = settled.length, right = settled.filter((x) => x.right_side).length, beat = settled.filter((x) => x.beat_crowd === true).length, worse = settled.filter((x) => x.beat_crowd === false).length;
  const today = new Date(nowMs).toISOString().slice(0, 10), due = lastPerSlug(rows).filter((r) => r.deadline && r.deadline < today);
  return { generated_at: new Date(nowMs).toISOString(), chain, questions: new Set(rows.map((r) => r.slug)).size, entries: rows.length,
    record: { settled: n, right_side: right, wrong_side: n - right, beat_market: beat, market_better: worse, due: due.length, awaiting_settlement: due.filter((r) => r.outcome == null).length, value_added: valueAdded(lastPerSlug(rows)) },
    settled, latest: rows.slice(-limit).reverse().map((r) => ({ id: r.id, at: r.created_at, slug: r.slug, title: r.title, forecast: +r.p.toFixed(4), crowd: +r.prior.toFixed(4), hash: r.hash, prev_hash: r.prev_hash })) };
}
export function renderLedger(d, head) {
  const c = d.chain || { rows: 0, intact: true }, r = d.record || {};
  return `<!doctype html><html lang="en"><head>${head("q08 ledger", "Every q08 forecast, pre-registered and hash-chained before its event, and every settled call scored, misses included.", FE_CSS + VP_CSS + GROWTH_CSS)}</head><body class="ds">
${siteTop("ledger")}
<main class="ds-main"><div class="ds-head"><h1>The ledger</h1><p>Every forecast is written here before its event, chained by hash to the one before, and scored when the event settles. Wrong calls stay. The chain was ${c.rows ? (c.intact ? '<b class="ds-good">checked intact</b>' : '<b class="ds-bad">found broken</b>') : "empty"} on this visit${c.rows ? `: ${e(c.ok)} of ${e(c.rows)} entries recompute` : ""}.</p></div>
<section class="ds-stats"><div class="ds-stat"><div class="k">Pre-registered entries</div><div class="v">${e(d.entries || 0)}</div></div><div class="ds-stat"><div class="k">Settled: right / wrong side</div><div class="v">${e(r.right_side || 0)} / ${e(r.wrong_side || 0)}</div></div><div class="ds-stat"><div class="k">Beat the market / did worse</div><div class="v">${e(r.beat_market || 0)} / ${e(r.market_better || 0)}</div></div></section>
${r.awaiting_settlement ? `<p class="ds-note">${e(r.awaiting_settlement)} question${r.awaiting_settlement === 1 ? " is" : "s are"} past the deadline and waiting for the market to close; each is scored the hour it does.</p>` : ""}
<h2>Settled calls, misses first</h2>${d.settled && d.settled.length ? `<div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Question</th><th>Outcome</th><th>q08 / market</th><th>Verdict</th></tr></thead><tbody>${d.settled.map((x) => `<tr><td><a href="/f/${e(x.slug)}">${e(x.title)}</a><br><small>settled ${e(String(x.resolved_at || "").slice(0, 10))}</small></td><td>${x.outcome ? "YES" : "NO"}</td><td class="n">${e(pct(x.forecast))} / ${e(pct(x.crowd))}</td><td class="${x.right_side ? "ds-good" : "ds-bad"}">${e(verdictText(x))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ds-empty"><b>Nothing has settled yet</b>The first verdict appears here the hour its market closes, right or wrong.</div>`}
<h2>Latest entries</h2>${d.latest && d.latest.length ? `<div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>When (UTC)</th><th>Question</th><th>q08 / market</th><th>Hash ← previous</th></tr></thead><tbody>${d.latest.slice(0, 60).map((x) => `<tr><td>${e(String(x.at).replace("T", " ").slice(0, 16))}</td><td><a href="/f/${e(x.slug)}">${e(x.title)}</a></td><td class="n">${e(pct(x.forecast))} / ${e(pct(x.crowd))}</td><td class="vp-hash">${e(String(x.hash).slice(0, 10))} ← ${e(String(x.prev_hash || "genesis").slice(0, 10))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ds-empty"><b>No entries yet</b>The engine writes its first entry the hour a consequential question has fresh signals.</div>`}
<h2>Check it yourself</h2><p class="ds-muted">Each hash is ${e(c.recipe || "")}. Download every entry from <a href="/api/ledger">/api/ledger</a>, recompute, and compare. Each broadcast post carries the first 12 characters of its entry's hash, so a third party holds a timestamped copy.</p>
${portfolioHtml()}
<footer class="fe-foot"><a href="/">Forecasts</a><a href="/track-record">Track record</a><a href="/api/ledger">Ledger (JSON)</a><span>Simulated positions only. Not investment advice.</span></footer>
</main></body></html>`;
}

// ---------- broadcast: calls and settlements become posts in the fleet's social drain ----------
// qnfo-social drains qnfo-audit.social_threads (status queued, flagged selected) to Bluesky, Mastodon, LinkedIn, X and Substack with the
// fleet's existing credentials, adds the AI marker, probes the link and records engagement. This lane only writes the rows.
export const BROADCAST = { perDayDefault: 3, maxLen: 260 };
export function fitTitle(title, room) {
  const t = String(title || "").trim();
  if (t.length <= room) return t;
  const c = t.slice(0, Math.max(10, room - 1)), sp = c.lastIndexOf(" ");
  return (sp > room * 0.5 ? c.slice(0, sp) : c).replace(/[\s,;:.\-]+$/, "") + "…";
}
export const FORMATS = ["registered-first", "number-first"];
export function broadcastText(kind, r, url, maxLen = BROADCAST.maxLen, format = FORMATS[0]) {
  const tail = (s) => s + " " + url;
  let f;
  if (kind === "settled") {
    const c = callOf(r);
    f = (t) => `Settled: ${t} ${c.outcome ? "YES" : "NO"}. q08 had ${pct(r.p)}, the market ${pct(r.prior)}: ${verdictText(c)}. Pre-registered, kept on the record either way.`;
  } else {
    const d = Math.round(100 * (r.p - r.prior));
    f = format === "number-first"
      ? (t) => `q08 ${pct(r.p)}, market ${pct(r.prior)}: ${t} q08 disagrees by ${Math.abs(d)} points, on the record before the event (ledger ${String(r.hash || "").slice(0, 12)}). Settles ${r.deadline}.`
      : (t) => `Pre-registered: ${t} q08 ${pct(r.p)} vs market ${pct(r.prior)} (${d > 0 ? "+" : ""}${d} pts). Settles ${r.deadline}; scored in public, misses included. Ledger ${String(r.hash || "").slice(0, 12)}`;
  }
  const fixed = tail(f("")).length;
  return tail(f(fitTitle(r.title, Math.max(20, maxLen - fixed))));
}
export async function broadcastLane(env, nowMs, cfg = {}) {
  const db = env.TRADES_DB;
  if (!env.AUDIT) return { skipped: "no AUDIT binding" };
  const perDay = Math.max(0, Math.min(6, Number(cfg.broadcast_per_day ?? BROADCAST.perDayDefault)));
  const sent = await db.prepare("SELECT count(*) n FROM fe_broadcast WHERE queued_at > ?").bind(new Date(nowMs - 86400000).toISOString()).first();
  let room = perDay - ((sent && sent.n) || 0);
  if (room <= 0) return { skipped: "daily cap", per_day: perDay };
  const done = new Set(((await db.prepare("SELECT key FROM fe_broadcast").all()).results || []).map((x) => x.key));
  const rows = lastPerSlug((await db.prepare("SELECT id, created_at, slug, title, deadline, category, prior, p, outcome, hash FROM fe_forecast ORDER BY id").all()).results || []);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  // Settlements first, wins and losses alike (accountability is the brand); then the most consequential open calls that leave the market.
  const cands = rows.filter((r) => (r.outcome === 0 || r.outcome === 1) && !done.has("settled:" + r.slug)).map((r) => ({ kind: "settled", r, score: 9 }))
    .concat(rows.filter((r) => r.outcome == null && r.deadline >= today && Math.abs(r.p - r.prior) >= MIN_EDGE && !done.has("call:" + r.slug))
      .map((r) => ({ kind: "call", r, score: consequenceScore(r) + Math.abs(r.p - r.prior) * 5 })))
    .sort((a, b) => b.score - a.score);
  const queued = [];
  for (const c of cands) {
    if (room <= 0) break;
    const tslug = "q08-mk-" + c.kind + "-" + (await sha256Hex(c.kind + ":" + c.r.slug)).slice(0, 10);
    const arm = FORMATS.includes(cfg.broadcast_format) ? cfg.broadcast_format : FORMATS[0];
    const text = broadcastText(c.kind, c.r, MARKETS_ORIGIN + "/f/" + c.r.slug, BROADCAST.maxLen, arm);
    const ins = await env.AUDIT.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status, flags, notes, created_at) VALUES (?,?,?,'queued','selected',?,datetime('now'))")
      .bind(tslug, String(c.r.title).slice(0, 200), JSON.stringify([text]), "selected: q08 markets broadcast (Q08-GROWTH-1, " + c.kind + ")").run();
    await db.prepare("INSERT OR IGNORE INTO fe_broadcast (key, slug, kind, thread_slug, queued_at, text, arm) VALUES (?,?,?,?,?,?,?)").bind(c.kind + ":" + c.r.slug, c.r.slug, c.kind, tslug, new Date(nowMs).toISOString(), text, arm).run();
    queued.push({ kind: c.kind, slug: c.r.slug, thread: tslug, inserted: ins?.meta?.changes !== 0 });
    room--;
  }
  return { per_day: perDay, candidates: cands.length, queued };
}

// ---------- the product manager: measure, adjust its own knobs, file the next code change, check last time's call ----------
export const PM_KNOBS = {
  max_updates: { def: LIMITS.maxUpdatesPerTick, min: 2, max: 8 },
  broadcast_per_day: { def: BROADCAST.perDayDefault, min: 1, max: 6 },
};
export async function readConfig(db) {
  const out = { broadcast_format: FORMATS[0], shift_scale: 1 };
  for (const [k, v] of Object.entries(PM_KNOBS)) out[k] = v.def;
  try {
    for (const r of ((await db.prepare("SELECT key, value FROM fe_config").all()).results || [])) {
      const k = PM_KNOBS[r.key], n = Number(r.value);
      if (k && Number.isFinite(n)) out[r.key] = Math.max(k.min, Math.min(k.max, Math.round(n)));
    }
    const ss = Number(((await db.prepare("SELECT value FROM fe_config WHERE key = 'shift_scale'").first()) || {}).value);
    if (Number.isFinite(ss)) out.shift_scale = Math.max(0, Math.min(2, ss));
    const f = ((await db.prepare("SELECT value FROM fe_config WHERE key = 'broadcast_format'").first()) || {}).value;
    out.broadcast_format = FORMATS.includes(f) ? f : FORMATS[0];
  } catch (err) { out.broadcast_format = FORMATS[0]; }
  return out;
}
export async function pmMetrics(env, nowMs) {
  const db = env.TRADES_DB, iso = (ms) => new Date(ms).toISOString(), today = iso(nowMs).slice(0, 10);
  const rows = (await db.prepare("SELECT slug, title, created_at, deadline, category, prior, p, outcome, tokens FROM fe_forecast ORDER BY id").all()).results || [];
  const last = lastPerSlug(rows), wk = rows.filter((r) => r.created_at > iso(nowMs - 7 * 86400000));
  const due = last.filter((r) => r.deadline && r.deadline < today), settled = last.filter((r) => r.outcome === 0 || r.outcome === 1);
  const open = last.filter((r) => r.outcome == null && r.deadline >= today);
  const lt = await safe(() => db.prepare("SELECT skipped_json FROM fe_tick ORDER BY id DESC LIMIT 1").first(), null);
  let cov = null; try { const c = Object.values(JSON.parse((lt && lt.skipped_json) || "{}").coverage || {}); const legs = c.reduce((a, x) => a + x.legs, 0); cov = legs ? +(c.reduce((a, x) => a + x.with_evidence, 0) / legs).toFixed(3) : null; } catch (err) { cov = null; }
  const b7 = await safe(() => db.prepare("SELECT count(*) n FROM fe_broadcast WHERE queued_at > ?").bind(iso(nowMs - 7 * 86400000)).first(), { n: 0 });
  let posts = null, traffic = null, portfolio = null;
  if (env.AUDIT) {
    posts = await safe(async () => Object.fromEntries((((await env.AUDIT.prepare("SELECT status, count(*) n FROM social_threads WHERE slug LIKE 'q08-mk-%' AND created_at > datetime('now','-14 days') GROUP BY status").all()).results) || []).map((x) => [x.status, x.n])), null);
    traffic = await safe(async () => {
      const r = await env.AUDIT.prepare("SELECT sum(CASE WHEN date > date('now','-7 days') THEN value ELSE 0 END) w, sum(CASE WHEN date <= date('now','-7 days') THEN value ELSE 0 END) pw FROM reach_signals WHERE source = 'cf-rum-human' AND metric = 'pageviews' AND entity_type = 'host' AND entity_id = 'markets.q08.org' AND date > date('now','-14 days')").first();
      return r ? { pageviews_7d: r.w || 0, pageviews_prev_7d: r.pw || 0 } : null;
    }, null);
    // Cross-portfolio: clicks from q08 pages into QNFO and Ultrastable (the gateway's UTM ledger, utm_source=markets.q08.org or q08.org).
    portfolio = await safe(async () => { const r = await env.AUDIT.prepare("SELECT sum(value) v FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND channel IN ('markets.q08.org','q08.org','q08') AND date > date('now','-7 days')").first(); return (r && r.v) || 0; }, null);
  }
  const sp = spinoffStatus(rows), va = valueAdded(last);
  return { at: iso(nowMs), forecasts_7d: wk.length, questions: last.length, open: open.length, disagree: open.filter((r) => Math.abs(r.p - r.prior) >= MIN_EDGE).length,
    due: due.length, settled: settled.length, unresolved_overdue: due.filter((r) => r.outcome == null).length, resolution_rate: due.length ? +(due.filter((r) => r.outcome != null).length / due.length).toFixed(3) : null,
    right_side: settled.filter((r) => callOf(r).right_side).length, value_added: va.n ? va.value_added : null, halted: !!sp.halted,
    coverage: cov, tokens_per_forecast_7d: wk.length ? Math.round(wk.reduce((a, r) => a + (r.tokens || 0), 0) / wk.length) : null,
    mean_consequence_open: open.length ? +(open.reduce((a, r) => a + consequenceScore(r), 0) / open.length).toFixed(3) : null,
    broadcasts_7d: (b7 && b7.n) || 0, posts, traffic, portfolio_clicks_7d: portfolio,
    calibration: reliabilityBins(last), shift_scale: shiftScaleFit(rows) };
}
// Code levers: when a metric says the product is short, the PM files one issue a run for the fleet's code loop, with the file, an anchor and a
// probe that closes it when the metric recovers. Knob levers are applied directly (bounded, logged, reverted by deleting the fe_config row).
const CT = "code-task: repo=qnfo-workers path=q08-prediction-markets/forecast-engine.mjs";
const PROBE = (contains) => `runtime-probe: {"url": "https://markets.q08.org/api/pm", "status": 200, "contains": "${contains}"}`;
export const PM_LEVERS = [
  { key: "Q08-PM-RESOLVE-1", when: (m) => m.unresolved_overdue > 0, priority: "high",
    title: (m) => `Q08-PM-RESOLVE-1: ${m.unresolved_overdue} q08 forecast question(s) past the deadline are not settled`,
    body: (m) => `The q08 markets product manager measured ${m.due} questions past their deadline and ${m.settled} settled. A pre-registered call that never settles cannot be scored, so the track record stalls. Read the closed state for the deadline-passed slugs (pt_market is only refreshed for listed markets): fetch each overdue slug from the Gamma API by slug inside tick and settle it.\n${CT}\ncode-anchor: export async function tick(env, nowMs = Date.now()) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs so worker.js carries the module.\n${PROBE('\\"unresolved_overdue\\":0')}` },
  { key: "Q08-PM-COVERAGE-1", when: (m) => m.coverage != null && m.coverage < 0.6, priority: "medium",
    title: (m) => `Q08-PM-COVERAGE-1: only ${Math.round(100 * m.coverage)}% of consequential q08 questions have fresh evidence`,
    body: (m) => `Signal coverage is ${m.coverage} against a target of 0.8. Widen the news lane: raise newsFetchPerTick and add a third search path for starved families.\n${CT}\ncode-anchor: export async function newsLane(db, starved, fetchText, nowMs, { limits = LIMITS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.\n${PROBE('\\"coverage\\":0.8')}` },
  { key: "Q08-PM-REACH-1", when: (m) => m.posts && !m.posts.posted && m.broadcasts_7d >= 3, priority: "high",
    title: () => "Q08-PM-REACH-1: q08 broadcasts are queued but none has posted in 14 days",
    body: (m) => `fe_broadcast queued ${m.broadcasts_7d} posts in 7 days; social_threads q08-mk-* statuses: ${JSON.stringify(m.posts)}. Read why qnfo-social holds them (error column) and fix the row shape or the drain.\ncode-task: repo=qnfo-workers path=qnfo-social/worker.js\ncode-anchor: async function pickChannelRow(env, channel, epoch) {\n${PROBE('\\"posted\\"')}` },
  { key: "Q08-PM-EDGE-1", when: (m) => m.open >= 8 && m.disagree === 0, priority: "medium",
    title: (m) => `Q08-PM-EDGE-1: none of ${m.open} open q08 forecasts leaves the market price`,
    body: (m) => `With no disagreement there is nothing to trade, broadcast or score. Check the gate in combine (halving and the 1-logit cap) against the evidence count; if the models agree in direction on most questions, let a two-model agreement with three or more cited signals keep its full shift.\n${CT}\ncode-anchor: export function combine(prior, verdicts, { shrink = 0.5, cap = 1, scale = 1 } = {}) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.\n${PROBE('\\"disagree\\":')}` },
];
// Growth, not only repair (owner 2026-11-12: "That's what a product manager is about, growth"). Each target is read from pmMetrics; a missed one
// files a growth change below, and the experiment step tests one change to the product at a time and keeps the arm that grows.
export const GROWTH_TARGETS = [
  { key: "pageviews_wow", name: "Reader growth", target: 1.1, read: (m) => (m.traffic && m.traffic.pageviews_prev_7d ? +(m.traffic.pageviews_7d / m.traffic.pageviews_prev_7d).toFixed(3) : null), unit: "page views this week over last week" },
  { key: "posted_14d", name: "Distribution", target: 10, read: (m) => (m.posts ? m.posts.posted || 0 : null), unit: "q08 call and settlement posts that went out in 14 days" },
  { key: "portfolio_clicks_7d", name: "Cross-promotion", target: 10, read: (m) => m.portfolio_clicks_7d, unit: "clicks from q08 into QNFO and Ultrastable in 7 days" },
  { key: "open", name: "Questions covered", target: 12, read: (m) => m.open, unit: "open consequential forecasts" },
  { key: "disagree", name: "Calls with an edge", target: 3, read: (m) => m.disagree, unit: "open forecasts that leave the market by 2 points or more" },
  { key: "coverage", name: "Signal coverage", target: 0.8, read: (m) => m.coverage, unit: "share of questions with fresh evidence" },
];
export function growthScore(m) { return GROWTH_TARGETS.map((g) => { const v = g.read(m); return { key: g.key, name: g.name, target: g.target, value: v, met: v == null ? null : v >= g.target, unit: g.unit }; }); }
PM_LEVERS.push(
  { key: "Q08-PM-GROWTH-READERS-1", when: (m) => growthScore(m).find((x) => x.key === "pageviews_wow").met === false, priority: "medium",
    title: () => "Q08-PM-GROWTH-READERS-1: markets.q08.org readers did not grow 10% week over week",
    body: (m) => `Page views ${JSON.stringify(m.traffic)}. Growth lever: make each forecast page travel on its own. Add an Open Graph image route /og/<slug>.svg that draws the question, q08's number against the market and the settle date, and point the forecast page's og:image at it, so every shared link and every broadcast post shows the call.\n${CT}\ncode-anchor: export function renderForecast(d, head) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.` },
  { key: "Q08-PM-GROWTH-PORTFOLIO-1", when: (m) => m.portfolio_clicks_7d != null && m.portfolio_clicks_7d < 10, priority: "low",
    title: (m) => `Q08-PM-GROWTH-PORTFOLIO-1: ${m.portfolio_clicks_7d} clicks from q08 into QNFO and Ultrastable in 7 days`,
    body: () => `Cross-promotion is below 10 clicks a week. Growth lever: name the connection on each forecast page in one line ("the evidence matching and the ledger run on Ultrastable"), placed beside the pipeline steps instead of only in the footer block.\n${CT}\ncode-anchor: export function portfolioHtml() {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.` });
// One experiment at a time, run in alternating 7-day periods (sequential, so confounded by the news cycle; two periods per arm before a verdict).
// Outcome: markets.q08.org page views per broadcast posted in the period. The winning arm becomes the fe_config value; the log is fe_experiment.
export const EXPERIMENTS = [{ key: "broadcast_format", arms: FORMATS, periodDays: 7, minPeriods: 2 }];
export async function experimentStep(env, m, nowMs) {
  const db = env.TRADES_DB, now = new Date(nowMs).toISOString(), out = [];
  for (const x of EXPERIMENTS) {
    const cur = await db.prepare("SELECT * FROM fe_experiment WHERE key = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1").bind(x.key).first().catch(() => null);
    const snap = { pageviews_7d: m.traffic ? m.traffic.pageviews_7d : null, posted: m.posts ? m.posts.posted || 0 : null, broadcasts_7d: m.broadcasts_7d };
    if (cur && nowMs - Date.parse(cur.started_at) < x.periodDays * 86400000) { out.push({ key: x.key, arm: cur.arm, running: true }); continue; }
    if (cur) {
      const s0 = JSON.parse(cur.start_json || "{}"), posted = Math.max(1, (snap.posted ?? 0) - (s0.posted ?? 0));
      const score = snap.pageviews_7d == null ? null : +(snap.pageviews_7d / posted).toFixed(3);
      await db.prepare("UPDATE fe_experiment SET ended_at = ?, end_json = ?, score = ? WHERE id = ?").bind(now, JSON.stringify(snap), score, cur.id).run();
    }
    const done = ((await db.prepare("SELECT arm, count(*) n, avg(score) s FROM fe_experiment WHERE key = ? AND ended_at IS NOT NULL AND score IS NOT NULL GROUP BY arm").bind(x.key).all()).results) || [];
    if (x.arms.every((a) => ((done.find((d) => d.arm === a) || {}).n || 0) >= x.minPeriods)) {
      const best = [...done].sort((a, b) => b.s - a.s)[0];
      await db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES (?,?,?,?)").bind(x.key, best.arm, now, "experiment verdict: " + done.map((d) => d.arm + " " + (+d.s).toFixed(2) + " views a post over " + d.n + " weeks").join(" vs ")).run();
      out.push({ key: x.key, verdict: best.arm, arms: done });
      continue;
    }
    const next = x.arms[done.reduce((a, d) => a + d.n, 0) % x.arms.length];
    await db.prepare("INSERT INTO fe_experiment (key, arm, started_at, start_json) VALUES (?,?,?,?)").bind(x.key, next, now, JSON.stringify(snap)).run();
    await db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES (?,?,?,?)").bind(x.key, next, now, "experiment period: arm " + next).run();
    out.push({ key: x.key, arm: next, started: true });
  }
  return out;
}
// ---------- research lane (Q08-RESEARCH-1): scan outside sources for better practice, score against q08's needs, file the change, learn from the outcome ----------
// Owner 2026-11-12: a product manager goes out, finds what the best players do now and builds it in. First pass (Metaculus "AI Forecasting in 2026",
// AIA Forecaster technical report arXiv 2511.07678): Platt-style recalibration after aggregation, 3-7 diverse runs, agentic search, caps, live (not
// backtested) evaluation. Each need names the file and anchor where the practice lands, so the code loop can build it.
export const RESEARCH_NEEDS = [
  { key: "calibration", label: "recalibrate forecasts (Platt scaling, extremizing, probability caps, reliability checks)", terms: ["platt", "calibrat", "extremi", "reliability diagram", "overconfiden", "hedging", "brier", "log score", "proper scoring"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export function " + "combine(prior, verdicts, { shrink = 0.5, cap = 1, scale = 1 } = {}) {" },
  { key: "aggregation", label: "aggregate more and more diverse model runs (ensembles, supervisor reconciliation)", terms: ["ensemble", "aggregat", "median", "trimmed mean", "wisdom of the crowd", "supervisor", "superforecaster"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export async function " + "forecastOne(q, ask, today, opts = {}) {" },
  { key: "search", label: "gather evidence better (agentic search, more sources, base rates)", terms: ["agentic search", "retrieval", "search", "base rate", "reference class", "news"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export async function " + "newsLane(db, starved, fetchText, nowMs, { limits = LIMITS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {" },
  { key: "leakage", label: "keep forecasts honest (look-ahead leakage, open questions treated as resolved, live evaluation)", terms: ["leak", "foreknowledge", "look-ahead", "backtest", "contamination", "knowledge cutoff"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export function " + "buildPrompt(q, evidence, today) {" },
  { key: "track-record", label: "show the record the way the best platforms do (public scoring, peer scores, intervals)", terms: ["track record", "peer score", "leaderboard", "scorecard", "confidence interval", "resolved questions", "benchmark"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export function " + "renderTrackRecord(d, head) {" },
  { key: "distribution", label: "distribute and grow (shareable cards, newsletters, alerts, embeds)", terms: ["newsletter", "share", "embed", "alert", "api", "launch", "subscribers", "growth"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export function " + "renderForecast(d, head) {" },
];
export const RESEARCH_SOURCES = [
  { key: "arxiv-llm-forecasting", kind: "feed", w: 1.2, url: "https://export.arxiv.org/api/query?search_query=all:%22LLM+forecasting%22+OR+all:%22judgmental+forecasting%22+OR+all:%22prediction+markets%22&sortBy=submittedDate&sortOrder=descending&max_results=20" },
  { key: "arxiv-calibration", kind: "feed", w: 1.1, url: "https://export.arxiv.org/api/query?search_query=all:%22probabilistic+forecasting%22+AND+all:calibration+AND+all:language&sortBy=submittedDate&sortOrder=descending&max_results=15" },
  { key: "news-ai-forecasting", kind: "feed", w: 0.8, url: "https://news.google.com/rss/search?q=%22AI+forecasting%22+OR+%22forecasting+bot%22+when:7d&hl=en-US&gl=US&ceid=US:en" },
  { key: "news-markets-platforms", kind: "feed", w: 0.8, url: "https://news.google.com/rss/search?q=Kalshi+OR+Polymarket+OR+Metaculus+OR+Manifold+feature+OR+launch+when:14d&hl=en-US&gl=US&ceid=US:en" },
  { key: "good-judgment", kind: "feed", w: 1.1, url: "https://goodjudgment.com/feed/" },
  { key: "forecasting-newsletter", kind: "feed", w: 1.0, url: "https://forecasting.substack.com/feed" },
];
const decodeFeedTextX = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export function parseFeed(text) {
  const out = [], blocks = String(text || "").split(/<(?:item|entry)[\s>]/i).slice(1);
  for (const b of blocks) {
    const tag = (n) => { const m = b.match(new RegExp("<" + n + "[^>]*>([\\s\\S]*?)</" + n + ">", "i")); return m ? decodeFeedTextX(m[1]) : ""; };
    const href = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || tag("link") || tag("id");
    const title = tag("title");
    if (title && /^https?:/.test(href || "")) out.push({ title: title.slice(0, 240), url: href, summary: (tag("summary") || tag("description") || tag("content")).slice(0, 600) });
  }
  return out;
}
const hash8 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, "0"); };
const PRACTICE_CUES = ["we propose", "improves", "outperform", "introduces", "new method", "launch", "releases", "state-of-the-art", "beats"];
export function scoreCandidate(item, src, weights = {}) {
  const t = (item.title + " " + item.summary).toLowerCase();
  let best = null;
  for (const n of RESEARCH_NEEDS) {
    const hits = n.terms.filter((x) => t.includes(x)).length;
    if (hits >= 2 && (!best || hits * (weights[n.key] || 1) > best.hits * (weights[best.need] || 1))) best = { need: n.key, hits };
  }
  if (!best) return null;
  const cue = PRACTICE_CUES.some((c) => t.includes(c)) ? 10 : 0;
  return { need: best.need, score: Math.round(Math.min(100, (100 * Math.min(1, best.hits / 3)) * (src.w || 1) * (weights[best.need] || 1) + cue)) };
}
export const RESEARCH_MIN_SCORE = 55;
async function researchWeights(db) {
  const w = {};
  for (const r of (await all(db, "SELECT key, value FROM fe_config WHERE key LIKE 'rw:%'"))) { const n = Number(r.value); if (Number.isFinite(n)) w[r.key.slice(3)] = Math.max(0.5, Math.min(2, n)); }
  return w;
}
const setWeight = (db, need, v, now, why) => db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES (?,?,?,?)").bind("rw:" + need, String(Math.max(0.5, Math.min(2, +v.toFixed(2)))), now, why).run();
export async function researchLane(env, fetchText, nowMs, { sources = RESEARCH_SOURCES, minScore = RESEARCH_MIN_SCORE, maxFiled = 1 } = {}) {
  const db = env.TRADES_DB, now = new Date(nowMs).toISOString(), res = { fetched: 0, new: 0, filed: [], adopted: 0, stale: 0, errors: [] };
  const weights = await researchWeights(db);
  const pulled = await Promise.all(sources.map(async (s) => { try { const r = await fetchText(s.url); if (!r.ok) throw new Error("status " + r.status); return { s, items: parseFeed(r.text) }; } catch (err) { res.errors.push(s.key + ": " + String(err && err.message || err).slice(0, 60)); return { s, items: [] }; } }));
  for (const { s, items } of pulled) for (const it of items) {
    res.fetched++;
    const sc = scoreCandidate(it, s, weights); if (!sc) continue;
    const r = await db.prepare("INSERT OR IGNORE INTO fe_research (id, source, title, url, summary, seen_at, need, score, status) VALUES (?,?,?,?,?,?,?,?, 'new')").bind(hash8(it.url), s.key, it.title, it.url, it.summary, now, sc.need, sc.score).run();
    if (r.meta && r.meta.changes) res.new++;
  }
  // File the best new candidate per need that has no open issue (one change a run per need, at most maxFiled).
  if (env.AUDIT) {
    const cands = await all(db, "SELECT * FROM fe_research WHERE status = 'new' AND score >= ? AND seen_at > ? ORDER BY score DESC, seen_at DESC LIMIT 20", minScore, new Date(nowMs - 14 * 86400000).toISOString());
    for (const c of cands) {
      if (res.filed.length >= maxFiled) break;
      const need = RESEARCH_NEEDS.find((n) => n.key === c.need), key = "Q08-RESEARCH-" + c.need.toUpperCase() + "-1";
      const open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND substr(title, 1, ?) = ? LIMIT 1").bind(key.length + 1, key + ":").first().catch(() => null);
      if (open) continue;
      const t = Date.now();
      const r = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?)")
        .bind(key + ": " + c.title.slice(0, 110), `Research lane (Q08-RESEARCH-1) found a practice from ${c.source} that matches the q08 need "${need.label}" (score ${c.score}): ${c.title}\n${c.url}\n${c.summary}\nBuild the smallest version of it that q08 can measure (a recorded metric or a fe_config knob the product manager can revert), covered by q08-prediction-markets/growth.test.mjs.\ncode-task: repo=qnfo-workers path=${need.path}\ncode-anchor: ${need.anchor}\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.\nFiled by the q08 markets product manager at ${now}.`, "q08-prediction-markets", "optimization", "medium", t, t).run().catch((err) => ({ error: String(err && err.message || err) }));
      if (r.error) { res.errors.push("file: " + r.error.slice(0, 60)); continue; }
      const id = r.meta && r.meta.last_row_id;
      await db.prepare("UPDATE fe_research SET status = 'filed', issue_id = ?, settled_at = ? WHERE id = ?").bind(id || null, now, c.id).run();
      res.filed.push({ key, id: c.id, need: c.need, score: c.score });
    }
    // Learn from outcomes: a closed issue is adopted (the need's weight rises and the item becomes a signal); one still open after 14 days is stale (weight falls).
    for (const f of await all(db, "SELECT id, need, title, url, issue_id, settled_at FROM fe_research WHERE status = 'filed' AND issue_id IS NOT NULL")) {
      const st = await env.AUDIT.prepare("SELECT status FROM agent_issues WHERE id = ?").bind(f.issue_id).first().catch(() => null);
      if (st && st.status === "closed") {
        await db.prepare("UPDATE fe_research SET status = 'adopted', settled_at = ? WHERE id = ?").bind(now, f.id).run();
        await setWeight(db, f.need, (weights[f.need] || 1) + 0.15, now, "research adopted: " + f.title.slice(0, 80));
        await db.prepare("INSERT OR IGNORE INTO fe_signal (id, source, family, query, title, url, created_at) VALUES (?,?,?,?,?,?,?)").bind("research:" + f.id, "research", "tech", f.need, f.title, f.url, now).run();
        res.adopted++;
      } else if (st && f.settled_at && nowMs - Date.parse(f.settled_at) > 14 * 86400000) {
        await db.prepare("UPDATE fe_research SET status = 'stale', settled_at = ? WHERE id = ?").bind(now, f.id).run();
        await setWeight(db, f.need, (weights[f.need] || 1) - 0.1, now, "research stale: " + f.title.slice(0, 80));
        res.stale++;
      }
    }
  }
  return res;
}
export async function researchStatus(db) {
  const counts = Object.fromEntries((await all(db, "SELECT status, count(*) n FROM fe_research GROUP BY status")).map((x) => [x.status, x.n]));
  return { sources: RESEARCH_SOURCES.map((s) => s.key), needs: RESEARCH_NEEDS.map((n) => n.key), counts, weights: await researchWeights(db),
    top: await all(db, "SELECT source, need, score, status, title, url FROM fe_research ORDER BY seen_at DESC, score DESC LIMIT 8") };
}

// ---------- calibration (Q08-CALIB-1): the evidence shift is scaled by a factor fit on settled calls and kept only if cross-validation beats the unscaled forecast ----------
// Best practice from the AIA Forecaster and the Metaculus bot analyses: LLM forecasts hedge toward the prior; recalibrate after aggregation.
// Only the shift away from the crowd's price is scaled, so a question with no edge keeps the market price.
export function reliabilityBins(rows, edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]) {
  const r = rows.filter((x) => x.outcome === 0 || x.outcome === 1);
  return edges.slice(0, -1).map((lo, i) => { const b = r.filter((x) => x.p >= lo && x.p < edges[i + 1]); return { from: lo, to: Math.min(1, edges[i + 1]), n: b.length, mean_p: b.length ? +(b.reduce((a, x) => a + x.p, 0) / b.length).toFixed(3) : null, observed: b.length ? +(b.reduce((a, x) => a + x.outcome, 0) / b.length).toFixed(3) : null }; });
}
const scaled = (x, k) => clampP(sigmoid(logit(clampP(x.prior)) + k * (logit(clampP(x.p)) - logit(clampP(x.prior)))));
export function shiftScaleFit(rows, { minN = 30, folds = 5 } = {}) {
  const r = lastPerSlug(rows).filter((x) => (x.outcome === 0 || x.outcome === 1) && Math.abs(x.p - x.prior) > 1e-6);
  if (r.length < minN) return { n: r.length, apply: false, k: 1, why: "needs " + minN + " settled calls that left the price" };
  const grid = []; for (let k = 0; k <= 2.0001; k += 0.05) grid.push(+k.toFixed(2));
  const best = (train) => grid.map((k) => [k, train.reduce((a, x) => a + brier(scaled(x, k), x.outcome), 0) / train.length]).sort((a, b) => a[1] - b[1])[0][0];
  let cv = 0, base = 0;
  for (let f = 0; f < folds; f++) { const te = r.filter((_, i) => i % folds === f), tr = r.filter((_, i) => i % folds !== f), k = best(tr); cv += te.reduce((a, x) => a + brier(scaled(x, k), x.outcome), 0); base += te.reduce((a, x) => a + brier(x.p, x.outcome), 0); }
  const k = best(r), gain = (base - cv) / r.length;
  return { n: r.length, k, cv_gain: +gain.toFixed(4), apply: gain > 0.001 && k !== 1, why: gain > 0.001 ? "cross-validated Brier improves by " + gain.toFixed(4) : "no cross-validated gain" };
}
export async function productManager(env, nowMs, { force = false, everyH = 23 } = {}) {
  const db = env.TRADES_DB;
  await ensureSchema(db);
  const prev = await db.prepare("SELECT ran_at, metrics_json FROM fe_pm ORDER BY id DESC LIMIT 1").first().catch(() => null);
  if (!force && prev && nowMs - Date.parse(prev.ran_at) < everyH * 3600000) return { ran: false, next_at: new Date(Date.parse(prev.ran_at) + everyH * 3600000).toISOString() };
  const m = await pmMetrics(env, nowMs), cfg = await readConfig(db), now = new Date(nowMs).toISOString(), decisions = [], filed = [];
  let before = null; try { before = prev ? JSON.parse(prev.metrics_json || "null") : null; } catch (err) { before = null; }
  const set = async (key, value, reason) => {
    const k = PM_KNOBS[key], v = Math.max(k.min, Math.min(k.max, value));
    if (v === cfg[key]) return;
    await db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES (?,?,?,?)").bind(key, String(v), now, reason).run();
    decisions.push({ key, from: cfg[key], to: v, reason, revert: "DELETE FROM fe_config WHERE key = '" + key + "'" });
    cfg[key] = v;
  };
  // Token budget: spend more where evidence is plentiful and the adjustments are not losing; spend less when they are.
  if (m.halted || (m.value_added != null && m.value_added < 0 && m.settled >= 20)) await set("max_updates", cfg.max_updates - 1, "value added below zero on " + m.settled + " settled: fewer adjustments until it turns");
  else if (m.coverage != null && m.coverage >= 0.7 && (m.tokens_per_forecast_7d || 0) < 1500 && m.open >= 2 * cfg.max_updates) await set("max_updates", cfg.max_updates + 1, "coverage " + m.coverage + ", " + m.tokens_per_forecast_7d + " tokens a forecast and " + m.open + " open questions: one more update an hour");
  // Broadcast cadence: grow while posts go out and traffic holds, shrink when they pile up unposted.
  const posted = (m.posts && m.posts.posted) || 0, piled = m.posts ? Object.entries(m.posts).filter(([s]) => s !== "posted").reduce((a, [, n]) => a + n, 0) : 0;
  if (m.posts && piled >= 6 && posted === 0) await set("broadcast_per_day", cfg.broadcast_per_day - 1, piled + " broadcasts held or queued, none posted: slow down until the drain takes them");
  else if (posted >= 3 && m.traffic && m.traffic.pageviews_7d >= m.traffic.pageviews_prev_7d) await set("broadcast_per_day", cfg.broadcast_per_day + 1, posted + " posted and markets.q08.org pageviews " + m.traffic.pageviews_prev_7d + " -> " + m.traffic.pageviews_7d + ": one more a day");
  // One code change a run: the first lever whose metric is short and that has no open issue already.
  if (env.AUDIT) {
    for (const l of PM_LEVERS) {
      if (!l.when(m)) continue;
      const open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND substr(title, 1, ?) = ? LIMIT 1").bind(l.key.length + 1, l.key + ":").first().catch(() => null);
      if (open) { filed.push({ key: l.key, open: open.id }); continue; }
      const t = Date.now();
      const r = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?)")
        .bind(l.title(m), l.body(m) + "\nFiled by the q08 markets product manager (Q08-GROWTH-1, q08-prediction-markets) from its metrics at " + now + ".", "q08-prediction-markets", "optimization", l.priority, t, t).run().catch((err) => ({ error: String(err && err.message || err) }));
      filed.push({ key: l.key, new: !r.error, error: r.error });
      break;
    }
  }
  // Q08-CALIB-1: keep the fitted shift scale only while cross-validation says it beats the unscaled forecast; otherwise delete the knob.
  const ss = m.shift_scale;
  if (ss && ss.apply && cfg.shift_scale !== ss.k) { await db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES ('shift_scale',?,?,?)").bind(String(ss.k), now, "cv gain " + ss.cv_gain + " on " + ss.n + " settled calls").run(); decisions.push({ key: "shift_scale", from: cfg.shift_scale, to: ss.k, reason: ss.why, revert: "DELETE FROM fe_config WHERE key = 'shift_scale'" }); cfg.shift_scale = ss.k; }
  else if (ss && !ss.apply && cfg.shift_scale !== 1) { await db.prepare("DELETE FROM fe_config WHERE key = 'shift_scale'").run(); decisions.push({ key: "shift_scale", from: cfg.shift_scale, to: 1, reason: ss.why }); cfg.shift_scale = 1; }
  let research = null;
  try { research = await researchLane(env, env.__fetchText || defaultFetchText, nowMs); } catch (err) { research = { error: String(err && err.message || err).slice(0, 120) }; }
  let experiments = null;
  try { experiments = await experimentStep(env, m, nowMs); } catch (err) { experiments = [{ error: String(err && err.message || err).slice(0, 120) }]; }
  // Did last run's knob changes move what they were meant to move? Recorded beside this run, so a lever that does nothing is visible.
  const check = before ? { coverage: [before.coverage, m.coverage], broadcasts_7d: [before.broadcasts_7d, m.broadcasts_7d], pageviews_7d: [before.traffic && before.traffic.pageviews_7d, m.traffic && m.traffic.pageviews_7d], settled: [before.settled, m.settled] } : null;
  await db.prepare("INSERT INTO fe_pm (ran_at, metrics_json, decisions_json, filed_json) VALUES (?,?,?,?)").bind(now, JSON.stringify({ ...m, growth: growthScore(m), since_last: check, research }), JSON.stringify(decisions.concat((experiments || []).map((x) => ({ experiment: x })))), JSON.stringify(filed)).run();
  return { ran: true, metrics: m, growth: growthScore(m), decisions, experiments, filed, research, config: cfg };
}
export async function pmStatus(env, nowMs = Date.now()) {
  const db = env && env.TRADES_DB;
  if (!db) return { empty: true };
  await safe(() => ensureSchema(db));
  const runs = await all(db, "SELECT ran_at, metrics_json, decisions_json, filed_json FROM fe_pm ORDER BY id DESC LIMIT 14");
  const parse = (s) => { try { return JSON.parse(s || "null"); } catch (err) { return null; } };
  const latest = runs[0] ? parse(runs[0].metrics_json) : await pmMetrics(env, nowMs).catch(() => null);
  const exps = await all(db, "SELECT key, arm, started_at, ended_at, score FROM fe_experiment ORDER BY id DESC LIMIT 20");
  return { product: "q08 markets", loop: "daily: measure growth and health, adjust knobs (fe_config), run one experiment at a time (fe_experiment), file the next growth or repair change (agent_issues), check the last change", config: await readConfig(db), levers: PM_LEVERS.map((l) => l.key), research: await researchStatus(db),
    ...(latest || {}), growth: latest ? growthScore(latest) : [], experiments: exps, runs: runs.map((r) => ({ ran_at: r.ran_at, decisions: parse(r.decisions_json) || [], filed: parse(r.filed_json) || [] })) };
}

// ---------- clockwork: every stage has a cadence, a late line, a self-repair and an escalation (Q08-CLOCK-1) ----------
// Owner 2026-11-12: "this all needs to keep ticking like clockwork ... a stopped clock or an inaccurate clock is not a working clock."
// Each stage below is read from the rows the stage itself writes, so the clock cannot report a tick that did not happen. Late is measured in minutes
// (QUEUE-SLA-1: none over 120 minutes past its due time). Self-repair: the cron re-runs a late forecast tick on the next 5-minute fire instead of waiting
// for the next hour, and settlement fetches every overdue question by name. A stage still late is filed for the code loop with a probe that closes it.
export const CLOCK = [
  { key: "markets", name: "Market prices", every_min: 5, late_min: 20, repair: "the 5-minute cron refetches; the synthetic feed is never scored" },
  { key: "signals", name: "Signal stream", every_min: 60, late_min: 180, repair: "q08-signal-engine scrapes; the news lane fetches by question name when the stream is thin" },
  { key: "forecasts", name: "Forecast tick", every_min: 60, late_min: 90, repair: "a tick older than 80 minutes re-runs on the next 5-minute fire" },
  { key: "settlement", name: "Settlement checks", every_min: 60, late_min: 120, repair: "every question past its deadline is fetched by name each hour until it settles" },
  { key: "proxies", name: "Financial context", every_min: 360, late_min: 480, repair: "FRED is refetched every 6 hours per series" },
  { key: "pm", name: "Product manager", every_min: 1380, late_min: 1500, repair: "runs inside the forecast tick once a day" },
];
const ageMin = (t, nowMs) => { const ms = Date.parse(String(t || "").replace(" ", "T") + (/Z|\+/.test(String(t)) || !t ? "" : "Z")); return Number.isFinite(ms) ? Math.round((nowMs - ms) / 60000) : null; };
export async function clockStatus(env, nowMs = Date.now()) {
  const db = env && env.TRADES_DB;
  if (!db) return { empty: true };
  await safe(() => ensureSchema(db));
  const one = (dbx, sql, ...b) => safe(async () => ((await dbx.prepare(sql).bind(...b).first()) || {}).t || null, null);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const lastAt = {
    markets: await one(db, "SELECT max(updated_at) t FROM pt_market WHERE closed = 0"),
    signals: env.SIGNAL_DB ? await one(env.SIGNAL_DB, "SELECT max(created_at) t FROM signal_log") : null,
    forecasts: await one(db, "SELECT max(ran_at) t FROM fe_tick"),
    proxies: await one(db, "SELECT max(fetched_at) t FROM fe_proxy"),
    pm: await one(db, "SELECT max(ran_at) t FROM fe_pm"),
  };
  // Settlement is on time when every question past its deadline was checked within the window (the oldest check is the clock).
  const overdue = await all(db, "SELECT l.slug, c.checked_at FROM (SELECT slug, max(id) id FROM fe_forecast GROUP BY slug) x JOIN fe_forecast l ON l.id = x.id LEFT JOIN fe_settle c ON c.slug = l.slug WHERE l.outcome IS NULL AND l.deadline < ?", today);
  lastAt.settlement = overdue.length ? overdue.reduce((a, r) => (!r.checked_at ? "" : a === null ? r.checked_at : a < r.checked_at ? a : r.checked_at), null) : new Date(nowMs).toISOString();
  const ticks = await all(db, "SELECT ran_at FROM fe_tick WHERE ran_at > ?", new Date(nowMs - 7 * 86400000).toISOString());
  const hours = new Set(ticks.map((r) => String(r.ran_at).slice(0, 13))), firstT = ticks.length ? Math.min(...ticks.map((r) => Date.parse(r.ran_at))) : nowMs;
  const span = Math.max(1, Math.min(168, Math.floor((nowMs - firstT) / 3600000) + 1));
  const stages = CLOCK.map((c) => {
    const age = c.key === "settlement" && lastAt.settlement === "" ? null : ageMin(lastAt[c.key], nowMs);
    const onTime = age != null && age <= c.late_min;
    return { ...c, last_at: lastAt[c.key] || null, age_min: age, on_time: onTime, ...(c.key === "settlement" ? { overdue: overdue.length } : {}) };
  });
  const out = { generated_at: new Date(nowMs).toISOString(), on_time: stages.filter((s) => s.on_time).length, stages: stages.length, all_on_time: stages.every((s) => s.on_time),
    forecast_tick_hours_7d: hours.size, forecast_tick_on_time_rate_7d: +(Math.min(hours.size, span) / span).toFixed(3), list: stages };
  for (const s of stages) out[s.key + "_on_time"] = s.on_time; // flat keys, so a runtime probe can read one stage
  return out;
}
export function clockHtml(c) {
  if (!c || !c.list) return "";
  const ago = (m) => (m == null ? "never" : m < 90 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago");
  return `<details class="ds-more vp-clock"><summary>Pipeline clock: ${e(c.on_time)} of ${e(c.stages)} stages on time · forecast tick on time ${e(Math.round(100 * c.forecast_tick_on_time_rate_7d))}% of hours this week</summary><div class="ds-more-body"><div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Stage</th><th>Every</th><th>Last</th><th>State</th></tr></thead><tbody>${c.list.map((s) => `<tr><td>${e(s.name)}<br><small>${e(s.repair)}</small></td><td class="n">${e(s.every_min >= 60 ? s.every_min / 60 + " h" : s.every_min + " min")}</td><td class="n">${e(ago(s.age_min))}${s.overdue ? `<br><small>${e(s.overdue)} awaiting settlement</small>` : ""}</td><td class="${s.on_time ? "ds-good" : "ds-bad"}">${s.on_time ? "on time" : "late"}</td></tr>`).join("")}</tbody></table></div><p class="ds-muted"><a href="/api/clock">Clock data (JSON)</a>. A late stage repairs itself on the next fire; one that stays late is filed for the code loop automatically.</p></div></details>`;
}

// Settlement by name: pt_market is refreshed only for markets still listed as open, so a closed market drops out of the feed and would never settle.
// Every question past its deadline, and every one whose quote went stale (resolved early), is fetched from Gamma by slug each hour.
export function parseGammaClose(arr) {
  const m = Array.isArray(arr) ? arr[0] : arr;
  if (!m) return null;
  let p = m.outcomePrices;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch (err) { p = null; } }
  const yes = p ? parseFloat(p[0]) : NaN;
  return { closed: !!m.closed, yes: Number.isFinite(yes) ? yes : null, final: !!m.closed && Number.isFinite(yes) && (yes >= 0.99 || yes <= 0.01) };
}
export async function settleLane(env, fetchText, nowMs, { max = 12 } = {}) {
  const db = env.TRADES_DB, now = new Date(nowMs).toISOString(), today = now.slice(0, 10), stale = new Date(nowMs - 3 * 3600000).toISOString();
  const due = await all(db, "SELECT l.slug, l.deadline FROM (SELECT slug, max(id) id FROM fe_forecast GROUP BY slug) x JOIN fe_forecast l ON l.id = x.id LEFT JOIN pt_market m ON m.slug = l.slug LEFT JOIN fe_settle c ON c.slug = l.slug WHERE l.outcome IS NULL AND (l.deadline < ? OR m.updated_at IS NULL OR m.updated_at < ?) ORDER BY c.checked_at IS NOT NULL, c.checked_at LIMIT ?", today, stale, max);
  const log = [];
  for (const d of due) {
    let state = "error";
    try {
      const r = await fetchText("https://gamma-api.polymarket.com/markets?slug=" + encodeURIComponent(d.slug));
      const g = r && r.ok ? parseGammaClose(JSON.parse(r.text)) : null;
      state = !g ? "not found" : g.final ? "settled" : g.closed ? "closed, awaiting final price" : "open";
      if (g && g.yes != null) await db.prepare("UPDATE pt_market SET yes = ?, closed = ?, updated_at = ? WHERE slug = ?").bind(g.yes, g.closed ? 1 : 0, now, d.slug).run();
    } catch (err) { state = "error: " + String(err && err.message || err).slice(0, 80); }
    await db.prepare("INSERT OR REPLACE INTO fe_settle (slug, checked_at, state) VALUES (?,?,?)").bind(d.slug, now, state).run();
    log.push({ slug: d.slug, state });
  }
  return log;
}
// Escalation: a stage that stays late after its own repair becomes one open issue for the fleet's code loop, closed by its probe when the stage is on time.
export async function escalateClock(env, clock, nowMs) {
  if (!env.AUDIT || !clock || !clock.list) return [];
  const out = [];
  for (const s of clock.list.filter((x) => !x.on_time)) {
    const key = "Q08-CLOCK-" + s.key.toUpperCase() + "-1";
    const open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND substr(title, 1, ?) = ? LIMIT 1").bind(key.length + 1, key + ":").first().catch(() => null);
    if (open) { out.push({ key, open: open.id }); continue; }
    const t = nowMs;
    const desc = `The q08 markets pipeline clock reads stage "${s.name}" late: last ${s.last_at || "never"}, ${s.age_min == null ? "no record" : s.age_min + " minutes ago"}, late after ${s.late_min} minutes. Its own repair (${s.repair}) has not brought it back. Read the stage's writer and its Workers Logs, fix the cause.\ncode-task: repo=qnfo-workers path=q08-prediction-markets/forecast-engine.mjs\ncode-anchor: export async function clockStatus(env, nowMs = Date.now()) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.\nruntime-probe: {"url": "https://markets.q08.org/api/clock", "status": 200, "contains": "\\"${s.key}_on_time\\":true"}\nFiled by q08-prediction-markets Q08-CLOCK-1 at ${new Date(nowMs).toISOString()}.`;
    const r = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?)")
      .bind(key + ": q08 pipeline stage '" + s.name + "' is late (" + (s.age_min == null ? "no record" : s.age_min + " min") + ")", desc, "q08-prediction-markets", "reliability", "high", t, t).run().catch((err) => ({ error: String(err && err.message || err) }));
    out.push({ key, new: !r.error, error: r.error });
  }
  return out;
}

// Growth surfaces a reader or a crawler can subscribe to: every call and every settlement as a feed, every question page in the sitemap.
const x = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function feedXml(d) {
  const seen = new Set(), items = [];
  for (const r of d.settled || []) items.push({ t: "Settled: " + r.title + " " + (r.outcome ? "YES" : "NO") + " (" + verdictText(r) + ")", slug: r.slug, at: r.resolved_at, body: "q08 " + pct(r.forecast) + ", market " + pct(r.crowd) + "." });
  for (const r of d.latest || []) { if (seen.has(r.slug)) continue; seen.add(r.slug); items.push({ t: "q08 " + pct(r.forecast) + " vs market " + pct(r.crowd) + ": " + r.title, slug: r.slug, at: r.at, body: "Pre-registered " + String(r.at).slice(0, 16).replace("T", " ") + " UTC, ledger hash " + String(r.hash).slice(0, 12) + "." }); }
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0"><channel><title>q08 forecasts</title><link>${MARKETS_ORIGIN}/</link><description>Pre-registered forecasts on market-moving events, and every settlement, right or wrong.</description>${items.slice(0, 50).map((i) => `<item><title>${x(i.t)}</title><link>${MARKETS_ORIGIN}/f/${x(i.slug)}</link><guid isPermaLink="false">${x(i.slug + "@" + i.at)}</guid><pubDate>${new Date(Date.parse(i.at) || 0).toUTCString()}</pubDate><description>${x(i.body)}</description></item>`).join("")}</channel></rss>`;
}
export function sitemapXml(d) {
  const slugs = [...new Set((d.latest || []).map((r) => r.slug))];
  const urls = ["/", "/ledger", "/track-record"].map((p) => MARKETS_ORIGIN + p).concat(slugs.map((s) => MARKETS_ORIGIN + "/f/" + s));
  return `<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${x(u)}</loc></url>`).join("")}</urlset>`;
}
