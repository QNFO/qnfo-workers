// q08-mind — mind.q08.org  (2.0.0-mind-2)
// A reading list for the inside. Primary sources, one question each, and a probe.
// Binding-free by design: no D1/KV/R2/AI/service bindings, no outbound fetches,
// no client-side JavaScript. The corpus is data (data/entries-*.json), so a wrong
// entry is fixed by editing JSON, never by editing rendering code.
//
// MIND-Q08-3 (2026-10-21): every entry carries an evidence grade and, where one
// exists, a real effect size. The evidence shelf exists so the reader can
// calibrate the rest of the corpus. Instruments are labelled as instruments.

import A from "./data/entries-a.json";
import B from "./data/entries-b.json";

const VERSION = "2.0.0-mind-2";
const BUILT = "2026-10-21";
const ENTRIES = [...A, ...B];
const BY_SLUG = new Map(ENTRIES.map((e) => [e.s, e]));

const SHELVES = [
  { id: "attention", label: "Attention", blurb: "What you notice, and what noticing costs." },
  { id: "self", label: "Self", blurb: "Whether the thing doing the reporting can be trusted." },
  { id: "affect", label: "Feeling", blurb: "How emotion is built, labelled and forecast." },
  { id: "will", label: "Will", blurb: "Intention, situation, and what breaks the link." },
  { id: "meaning", label: "Meaning", blurb: "Worth, purpose, and the difference between them." },
  { id: "practice", label: "Practice", blurb: "Things that can be done, with their real sizes." },
  { id: "evidence", label: "Evidence", blurb: "Claims that did not survive, kept on purpose." },
  { id: "measure", label: "Measure", blurb: "Instruments, and what each one cannot see." },
];

const GRADES = {
  A: ["Replicated at scale", "A meta-analysis or multi-lab replication with a stable effect. Safe to reason from; the size still varies."],
  B: ["Replicated, size uncertain", "Independent studies agree on direction; the magnitude moves between samples."],
  C: ["Contested or single study", "One study, a live controversy, or a disputed factor structure. Treat as a hypothesis."],
  D: ["Failed replication", "The reported effect did not hold at scale, or is not distinguishable from zero."],
  P: ["Argument, not measurement", "A philosophical or primary text. It can be right and still be untested."],
};

const START = ["killingsworth-wandering", "nisbett-wilson", "vazire-soka", "gollwitzer-plans", "osc-2015"];

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const paragraphs = (s) => String(s || "").split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");

function badge(g) {
  const m = GRADES[g] || ["ungraded", "No grade recorded."];
  return `<span class="badge g-${esc(g)}" title="${esc(m[1])}">${esc(g)} · ${esc(m[0])}</span>`;
}

function page(title, body, extraHead = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="A reading list for the inside: primary sources on attention, self-knowledge, feeling and will, each with an evidence grade and a probe.">
<link rel="alternate" type="application/rss+xml" title="mind" href="/feed.xml">
${extraHead}<style>
:root{--bg:#fbfaf7;--fg:#1c1b19;--mut:#6b6660;--line:#e2ddd4;--acc:#7a4b2a}
@media(prefers-color-scheme:dark){:root{--bg:#161513;--fg:#eae6df;--mut:#a19a91;--line:#2e2b27;--acc:#d0a179}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.62 ui-serif,Georgia,"Times New Roman",serif;padding:2.4rem 1.2rem 5rem}
main{max-width:34rem;margin:0 auto}
a{color:var(--acc);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--acc) 35%,transparent)}
a:hover{border-bottom-color:var(--acc)}
h1{font-size:1.5rem;line-height:1.25;margin:0 0 .4rem;font-weight:600}
h2{font-size:1.02rem;margin:2.2rem 0 .5rem;font-weight:600;letter-spacing:.01em}
p{margin:0 0 .85rem}
.sub{color:var(--mut);font-size:.9rem;margin-bottom:2rem}
nav{font-size:.85rem;color:var(--mut);margin-bottom:2rem;display:flex;flex-wrap:wrap;gap:.4rem .9rem}
ul.plain{list-style:none;padding:0;margin:0}
ul.plain li{padding:.62rem 0;border-bottom:1px solid var(--line)}
ul.plain li:last-child{border-bottom:0}
.q{font-weight:600}
.meta{color:var(--mut);font-size:.82rem;margin-top:.15rem}
.badge{display:inline-block;font:600 .68rem/1.5 ui-sans-serif,system-ui,sans-serif;letter-spacing:.03em;padding:.05rem .38rem;border:1px solid var(--line);border-radius:3px;color:var(--mut);vertical-align:middle;white-space:nowrap}
.g-A{color:#2f6b3a;border-color:#2f6b3a55}.g-B{color:#3a5d7a;border-color:#3a5d7a55}
.g-C{color:#8a5a12;border-color:#8a5a1255}.g-D{color:#8f2f2f;border-color:#8f2f2f55}.g-P{color:var(--mut)}
.probe{border-left:2px solid var(--acc);padding:.1rem 0 .1rem .9rem;margin:1.2rem 0;color:var(--fg)}
.probe b{display:block;font:600 .72rem/1.6 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:.25rem}
footer{margin-top:3.4rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--mut);font-size:.8rem}
code{font:.85em ui-monospace,SFMono-Regular,Menlo,monospace;background:color-mix(in srgb,var(--fg) 7%,transparent);padding:.05rem .25rem;border-radius:3px}
</style></head><body><main>${body}
<footer>mind · <a href="/method">method</a> · <a href="/outside">outside view</a> · <a href="/record">record</a> · <a href="/api/entries.json">api</a> · <a href="/feed.xml">rss</a><br>No tracking, no accounts, no data plane. ${esc(VERSION)}</footer>
</main></body></html>`;
}

function entryList(list) {
  return `<ul class="plain">${list.map((e) => `<li><a class="q" href="/q/${esc(e.s)}">${esc(e.q)}</a>
<div class="meta">${esc(e.a)}${e.y ? ` · ${esc(e.y)}` : ""} · ${badge(e.e)}</div></li>`).join("")}</ul>`;
}

function home() {
  const body = `<h1>A reading list for the inside.</h1>
<p class="sub">Primary sources on how attention, self-knowledge, feeling and will actually work. One question each, an evidence grade, and a probe you can run on yourself. Not therapy, not diagnosis, not a personality test.</p>
<p><a href="/start">Start with five</a> · <a href="/method">How the grades work</a></p>
<h2>The shelves</h2>
<ul class="plain">${SHELVES.map((s) => {
    const n = ENTRIES.filter((e) => e.sh === s.id).length;
    return `<li><a class="q" href="/s/${s.id}">${esc(s.label)}</a> <span class="meta">(${n})</span><div class="meta">${esc(s.blurb)}</div></li>`;
  }).join("")}</ul>
<h2>Why this shape</h2>
<p>Most writing about the mind is a claim with no size attached. Here every entry says what kind of evidence stands behind it, and the <a href="/s/evidence">evidence shelf</a> keeps five claims that did not survive replication, because knowing the failure rate is part of knowing yourself.</p>`;
  return page("mind — a reading list for the inside", body);
}

function startPage() {
  const list = START.map((s) => BY_SLUG.get(s)).filter(Boolean);
  const body = `<h1>Five entries</h1>
<p class="sub">The shortest route in: the two entries that set the frame, the one that says why an outside view is needed, the one with the largest usable effect, and the base rate.</p>
${entryList(list)}
<p style="margin-top:1.6rem"><a href="/random">Or open a random entry</a></p>`;
  return page("Start — mind", body);
}

function methodPage() {
  const body = `<h1>Method</h1>
<p class="sub">What the grades mean, what the entries are, and what this is not.</p>
<h2>Evidence grades</h2>
<ul class="plain">${Object.entries(GRADES).map(([g, m]) => `<li>${badge(g)}<div class="meta" style="margin-top:.3rem">${esc(m[1])}</div></li>`).join("")}</ul>
<h2>Rules the corpus follows</h2>
<p>1. Every empirical entry names a primary source with a DOI or a publisher link. No secondary summaries.</p>
<p>2. Where a pooled estimate exists it is stated as a number: r, d, or a percentage. Direction without size is not a finding.</p>
<p>3. Claims that failed replication are kept, on their own shelf, at the same length as the claims that held. Removing them would flatter the rest.</p>
<p>4. No entry tells you who you are. Each one describes a mechanism and hands back a probe: a measurement you run, on yourself, that can come out either way.</p>
<p>5. Barnum statements are excluded by rule. If a sentence would be true of almost anyone, it is not in the corpus.</p>
<h2>What this is not</h2>
<p>Not diagnosis. Not treatment. Not a substitute for a clinician. No instrument here is scored for you, and none of them is a screening test. Self-report is a measurement with known error: it is retrospective, reconstructive, and sensitive to mood at the moment of answering. That is why the <a href="/outside">outside view</a> and the <a href="/record">record</a> exist.</p>
<h2>Reading a claim</h2>
<p>Ask three things in order: what was measured, in whom, and did anyone repeat it. A study of 40 undergraduates that measured a self-report of a feeling is a different object from a multi-lab replication that measured behaviour. Most popular claims about the mind fail the second or third question.</p>`;
  return page("Method — mind", body);
}

function outsidePage() {
  const body = `<h1>The outside view</h1>
<p class="sub">Self-report has a blind spot with a known shape, and another person can see it.</p>
<p>The self–other knowledge asymmetry finding is that you are the better judge of your internal states, and other people are the better judges of your observable and evaluative traits. Neither of you is the better judge of everything. So for questions about how you come across, an informant is a better instrument than your own memory.</p>
<h2>A protocol</h2>
<p>Send this to two people who have seen you work or live closely for more than a year. Ask them to answer in writing, not in conversation, and to give one concrete example per answer. Tell them not to soften it; the softening is the measurement error.</p>
<div class="probe"><b>Ask them</b>
1. What do I do when I am under pressure that I do not seem to notice?<br>
2. What do I say I want, and what do my choices suggest I want?<br>
3. Where am I least accurate about myself?<br>
4. What do I do that I would deny doing?<br>
5. What have I changed in the last two years that I have not acknowledged?</div>
<p>Then answer the same five about yourself, before reading theirs. The gap between the two sets is the data. Do not argue with it; write down where it is largest and check it against your <a href="/record">record</a> for the same month.</p>
<p>Two cautions. Informants have their own biases, including politeness and the version of you they need. And a single informant is a single study; two who disagree with each other are more informative than two who agree.</p>`;
  return page("Outside view — mind", body);
}

function recordPage() {
  const body = `<h1>The record</h1>
<p class="sub">Retrospective self-report is reconstruction. A contemporaneous record is measurement.</p>
<p>When you are asked how you felt last week, you do not retrieve the week; you build a summary from what is salient now, from your beliefs about yourself, and from the last thing that happened. This is why a diary written at the end of the month and a sample taken three times a day disagree, and why the sample is the better evidence.</p>
<h2>A protocol that costs four minutes a day</h2>
<p>Three times a day, at fixed times, write one line each for five fields. Fixed times matter: choosing when to record selects for the moments you notice, which is the bias you are trying to escape.</p>
<div class="probe"><b>Each sample</b>
1. Where I am, and what I am doing.<br>
2. Attention: on the task, on myself, or elsewhere.<br>
3. Feeling: two words, specific (not good or bad).<br>
4. What I want right now.<br>
5. One sentence I said or thought that I would not say aloud.</div>
<p>After two weeks, count rather than interpret: how many samples had attention elsewhere; which two feeling words recur; how often field 4 was about something other than the task in field 1. Counts survive; impressions do not.</p>
<h2>Why counts</h2>
<p>The mind-wandering literature works this way. Asking people how much they mind-wander produces a number that tracks their beliefs about themselves; sampling them during the day produces a different and more defensible number. Your own record should be built the second way.</p>
<p>Keep it out of this site. It is a sheet of paper or a local file: there is no data plane here, nothing is stored, and nothing is sent.</p>`;
  return page("The record — mind", body);
}

function shelfPage(id) {
  const s = SHELVES.find((x) => x.id === id);
  if (!s) return null;
  const list = ENTRIES.filter((e) => e.sh === id);
  const body = `<h1>${esc(s.label)}</h1><p class="sub">${esc(s.blurb)}</p>${entryList(list)}`;
  return page(`${s.label} — mind`, body);
}

function entryPage(slug) {
  const e = BY_SLUG.get(slug);
  if (!e) return null;
  const next = e.n ? BY_SLUG.get(e.n) : null;
  const shelf = SHELVES.find((s) => s.id === e.sh);
  const src = e.l ? `<p class="meta">Source: <a href="${esc(e.l)}" rel="noopener">${esc(e.a)}${e.w ? `, ${esc(e.w)}` : ""}${e.y ? ` (${esc(e.y)})` : ""}</a></p>` : "";
  const body = `<h1>${esc(e.q)}</h1>
<p class="sub">${esc(e.a)}${e.w ? ` · ${esc(e.w)}` : ""}${e.y ? ` · ${esc(e.y)}` : ""}</p>
<p>${badge(e.e)}</p>
${paragraphs(e.g)}
<div class="probe"><b>Probe</b>${esc(e.p)}</div>
${src}
<p class="meta">Shelf: <a href="/s/${esc(e.sh)}">${esc(shelf ? shelf.label : e.sh)}</a></p>
${next ? `<h2>Next</h2><p><a href="/q/${esc(next.s)}">${esc(next.q)}</a></p>` : `<h2>End of the chain</h2><p><a href="/random">Open another</a> · <a href="/start">Back to five</a></p>`}`;
  return page(`${e.q} — mind`, body);
}

function apiJson() {
  return JSON.stringify({
    worker: "q08-mind",
    version: VERSION,
    built: BUILT,
    count: ENTRIES.length,
    shelves: SHELVES.map((s) => ({ id: s.id, label: s.label, count: ENTRIES.filter((e) => e.sh === s.id).length })),
    grades: Object.fromEntries(Object.entries(GRADES).map(([g, m]) => [g, { label: m[0], note: m[1] }])),
    entries: ENTRIES,
  }, null, 1);
}

function feed() {
  const items = ENTRIES.slice(0, 30).map((e) => `<item><title>${esc(e.q)}</title><link>https://mind.q08.org/q/${esc(e.s)}</link><guid>https://mind.q08.org/q/${esc(e.s)}</guid><description>${esc(e.g)} (${esc(e.e)})</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>mind — a reading list for the inside</title><link>https://mind.q08.org/</link><description>Primary sources on attention, self-knowledge, feeling and will, with evidence grades.</description><language>en</language>${items}</channel></rss>`;
}

function sitemap() {
  const urls = ["/", "/start", "/method", "/outside", "/record", ...SHELVES.map((s) => `/s/${s.id}`), ...ENTRIES.map((e) => `/q/${e.s}`)];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>https://mind.q08.org${u}</loc><lastmod>${BUILT}</lastmod></url>`).join("")}</urlset>`;
}

const html = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
const text = (body, type, status = 200) =>
  new Response(body, { status, headers: { "content-type": type, "cache-control": "public, max-age=300" } });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";

    if (p === "/health") return text(JSON.stringify({ ok: true, worker: "q08-mind", version: VERSION, entries: ENTRIES.length, shelves: SHELVES.length, built: BUILT }), "application/json; charset=utf-8");
    if (p === "/api/entries.json") return text(apiJson(), "application/json; charset=utf-8");
    if (p === "/feed.xml") return text(feed(), "application/rss+xml; charset=utf-8");
    if (p === "/sitemap.xml") return text(sitemap(), "application/xml; charset=utf-8");
    if (p === "/robots.txt") return text("User-agent: *\nAllow: /\nSitemap: https://mind.q08.org/sitemap.xml\n", "text/plain; charset=utf-8");

    if (p === "/") return html(home());
    if (p === "/start") return html(startPage());
    if (p === "/method") return html(methodPage());
    if (p === "/outside") return html(outsidePage());
    if (p === "/record") return html(recordPage());
    if (p === "/random") {
      const e = ENTRIES[Math.floor(Math.random() * ENTRIES.length)];
      return new Response(null, { status: 302, headers: { location: `/q/${e.s}`, "cache-control": "no-store" } });
    }
    if (p.startsWith("/s/")) {
      const out = shelfPage(decodeURIComponent(p.slice(3)));
      return out ? html(out) : notFound();
    }
    if (p.startsWith("/q/")) {
      const out = entryPage(decodeURIComponent(p.slice(3)));
      return out ? html(out) : notFound();
    }
    return notFound();
  },
};

function notFound() {
  return html(page("Not found — mind", `<h1>Not found</h1><p>That page does not exist. The corpus is ${ENTRIES.length} entries across ${SHELVES.length} shelves.</p><p><a href="/">Contents</a> · <a href="/start">Start with five</a></p>`), 404);
}
