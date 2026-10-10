// MENTION-RADAR-1 (#1641): offline proof for radar-hub mentionMod. Run: node scripts/mention-radar-test.mjs
// Checks: self-references excluded, dedupe on the canonical url (within a run, across runs and across sources),
// reach_signals rows per channel/day, and a failed API writes no reach_signals row (a gap, never a zero).
import fs from "node:fs";
const src = fs.readFileSync(new URL("../radar-hub/worker.js", import.meta.url), "utf8");
const a = src.indexOf("// MENTION-RADAR-1 begin");
const b = src.indexOf("// MENTION-RADAR-1 end");
if (a < 0 || b < a) throw new Error("MENTION-RADAR-1 markers missing");
const mentionMod = new Function(src.slice(a, b) + "; return mentionMod;")();
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.error("FAIL", m); } else console.log("ok  ", m); };

// in-memory D1 covering the statements the module issues
function mkDb() {
  const mentions = [], signals = new Map();
  const db = {
    mentions, signals,
    prepare(sql) {
      const st = { sql, x: [], bind(...x) { st.x = x; return st; },
        async all() {
          if (/FROM citation_stats/.test(sql)) return { results: [{ doi: "10.5281/ZENODO.21637028" }, { doi: "10.5281/zenodo.11111111" }] };
          return { results: [] };
        },
        async first() {
          if (/COUNT\(\*\) AS n FROM external_mentions/.test(sql)) {
            const [source, d] = st.x;
            return { n: mentions.filter((m) => m.source === source && m.first_seen.slice(0, 10) === d).length };
          }
          return null;
        },
        async run() {
          if (/INSERT OR IGNORE INTO external_mentions/.test(sql)) {
            const [ts, source, title, url, author, score, created, first_seen, url2] = st.x;
            if (url !== url2) throw new Error("NOT EXISTS key mismatch");
            if (mentions.some((m) => m.url === url)) return { meta: { changes: 0 } };
            mentions.push({ ts, source, title, url, author, score, created, first_seen });
            return { meta: { changes: 1 } };
          }
          if (/INSERT OR REPLACE INTO reach_signals/.test(sql)) {
            const [date, channel, metric, value, quality] = st.x;
            signals.set([date, "mention-radar", channel, "site", "qnfo", metric].join("|"), { value, quality });
            return { meta: { changes: 1 } };
          }
          throw new Error("unexpected sql " + sql);
        } };
      return st;
    } };
  return db;
}

const ORCID = "0009-0002-4317-5604";
const json = (o) => ({ ok: true, status: 200, json: async () => o });
const fixtures = {
  openalex(u) {
    if (u.includes("author.orcid")) return json({ meta: { next_cursor: null }, results: [{ id: "https://openalex.org/W1", doi: "https://doi.org/10.5281/zenodo.21637028" }, { id: "https://openalex.org/W2", doi: null }] });
    if (u.includes("cites:W1|W2")) return json({ meta: { next_cursor: null }, results: [
      { id: "https://openalex.org/W900", doi: "https://doi.org/10.1000/EXT.1", display_name: "An external paper", authorships: [{ author: { display_name: "Ada Lovelace", orcid: "https://orcid.org/0000-0001" } }], referenced_works: ["https://openalex.org/W1"], publication_date: "2026-09-01", cited_by_count: 3 },
      { id: "https://openalex.org/W901", doi: "https://doi.org/10.5281/zenodo.99", display_name: "Self citation", authorships: [{ author: { display_name: "Rowan Brad Quni-Gudzinas", orcid: "https://orcid.org/" + ORCID } }], referenced_works: ["https://openalex.org/W1"] }
    ] });
    throw new Error("unexpected openalex url " + u);
  },
  datacite(u) {
    const q = decodeURIComponent(u);
    if (!q.includes("relatedIdentifiers.relatedIdentifier:")) throw new Error("bad datacite url");
    return json({ data: [
      // same citing work as openalex (doi case differs): must be deduped across sources
      { id: "10.1000/ext.1", attributes: { doi: "10.1000/ext.1", creators: [{ name: "Lovelace, Ada" }], titles: [{ title: "An external paper" }], relatedIdentifiers: [{ relatedIdentifier: "10.5281/zenodo.21637028", relationType: "Cites" }], published: "2026" } },
      { id: "10.1000/ext.2", attributes: { doi: "10.1000/ext.2", creators: [{ name: "Turing, Alan" }], titles: [{ title: "Second external" }], relatedIdentifiers: [{ relatedIdentifier: "https://doi.org/10.5281/zenodo.22261547", relationType: "References" }], published: "2026" } },
      { id: "10.1000/ext.3", attributes: { doi: "10.1000/ext.3", creators: [{ name: "Noether, Emmy" }], titles: [{ title: "Only a version link" }], relatedIdentifiers: [{ relatedIdentifier: "10.5281/zenodo.22261547", relationType: "IsVersionOf" }] } },
      { id: "10.5281/zenodo.21641108", attributes: { doi: "10.5281/zenodo.21641108", creators: [{ name: "QNFO Research Collective" }, { name: "Quni-Gudzinas, Rowan Brad", nameIdentifiers: [{ nameIdentifier: "https://orcid.org/" + ORCID }] }], titles: [{ title: "self" }], relatedIdentifiers: [{ relatedIdentifier: "10.5281/zenodo.21637028", relationType: "Cites" }] } }
    ], links: {} });
  },
  bluesky(u) {
    return json({ posts: [
      { uri: "at://did:plc:ext1/app.bsky.feed.post/3abc", author: { did: "did:plc:ext1", handle: "reader.bsky.social", displayName: "A Reader" }, record: { text: "Interesting: https://papers.qnfo.org/papers/jps", createdAt: "2026-09-30T00:00:00Z" }, likeCount: 2, repostCount: 1 },
      { uri: "at://did:plc:vad2yeqflg5uznmp557zge5c/app.bsky.feed.post/3own", author: { did: "did:plc:vad2yeqflg5uznmp557zge5c", handle: "qnfo.bsky.social", displayName: "Rowan Brad Quni-Gudzinas" }, record: { text: "my post https://qnfo.org" } },
      { uri: "at://did:plc:ext2/app.bsky.feed.post/3fuzzy", author: { did: "did:plc:ext2", handle: "x.bsky.social" }, record: { text: "nothing relevant here" } }
    ] });
  },
  hn(u) {
    return json({ hits: [
      { objectID: "42", title: "QNFO energy benchmark", url: "https://qnfo.org/x", author: "pg", points: 5, created_at: "2026-09-29" },
      { objectID: "43", comment_text: "see the qnfo paper", story_title: "Quantum energy", author: "dang", created_at: "2026-09-29" },
      { objectID: "44", title: "QnfOOoTOrDE video", url: "https://youtube.com/watch?v=QnfOOoTOrDE", author: "z" }
    ] });
  }
};
function mkFetch(down) {
  const calls = [];
  const f = async (u, init) => {
    calls.push(u);
    if (!init || !init.headers || !/QNFO-mention-radar/.test(init.headers["User-Agent"])) throw new Error("missing UA");
    // Route on the parsed hostname, not a substring of the URL (CodeQL js/incomplete-url-substring-sanitization).
    const host = new URL(u).hostname;
    const under = (d) => host === d || host.endsWith("." + d);
    const k = under("openalex.org") ? "openalex" : under("datacite.org") ? "datacite" : under("bsky.app") ? "bluesky" : under("algolia.com") ? "hn" : null;
    if (!k) throw new Error("unexpected host " + u);
    if (down.includes(k)) return { ok: false, status: 429, json: async () => ({}) };
    return fixtures[k](u);
  };
  f.calls = calls;
  return f;
}

const now = new Date("2026-10-01T08:30:00Z");

// 1) all sources up
const db = mkDb();
let out = await mentionMod.run({ AUDIT: db }, { fetch: mkFetch([]), now });
const urls = db.mentions.map((m) => m.url).sort();
ok(out.status === "ok", "all sources ok -> status ok (" + JSON.stringify(out.sources) + ")");
ok(out.owner_dois === 8, "owner DOIs = 7 selected works + 1 new from citation_stats (case-normalised), got " + out.owner_dois);
ok(urls.includes("https://doi.org/10.1000/ext.1"), "openalex external citation recorded under a lowercased doi url");
ok(!urls.some((u) => u.includes("zenodo.99") || u.includes("21641108")), "self citations (ORCID, name, QNFO label) excluded");
ok(db.mentions.filter((m) => m.url === "https://doi.org/10.1000/ext.1").length === 1, "same citing work from openalex and datacite stored once");
ok(urls.includes("https://doi.org/10.1000/ext.2") && !urls.includes("https://doi.org/10.1000/ext.3"), "datacite References counted; IsVersionOf ignored");
ok(urls.includes("https://bsky.app/profile/did:plc:ext1/post/3abc"), "external bluesky post recorded with a stable url");
ok(!urls.some((u) => u.includes("vad2yeq") || u.includes("3fuzzy")), "own bluesky posts and irrelevant fuzzy hits excluded");
ok(db.mentions.filter((m) => m.source === "bluesky").length === 1, "three bluesky queries returning the same post -> one row");
ok(urls.some((x) => x === "https://qnfo.org/x") && urls.some((x) => x === "https://news.ycombinator.com/item?id=43") && !urls.some((u) => u.includes("youtube")), "hn: story url, comment item url, whole-word filter");
const sig = (ch, m) => db.signals.get(["2026-10-01", "mention-radar", ch, "site", "qnfo", m].join("|"));
ok(sig("openalex", "mentions").value === 1 && sig("datacite", "mentions").value === 1 && sig("bluesky", "mentions").value === 1 && sig("hn", "mentions").value === 2, "reach_signals mentions per channel/day");
ok(sig("datacite", "mentions_visible").value === 2, "mentions_visible counts what the API returned (deduped), got " + (sig("datacite", "mentions_visible") || {}).value);
ok(sig("openalex", "mentions").quality === "human" && sig("bluesky", "mentions").quality === "unknown", "quality labels within the CHECK set");

// 2) rerun the same day: no duplicate rows, signals unchanged (idempotent)
const before = db.mentions.length;
out = await mentionMod.run({ AUDIT: db }, { fetch: mkFetch([]), now });
ok(db.mentions.length === before, "rerun writes no duplicates");
ok(Object.values(out.new_mentions).every((n) => n === 0), "rerun reports 0 new per channel");
ok(sig("hn", "mentions").value === 2, "rerun keeps the per-day mentions value (recomputed from D1)");

// 3) API failures: skipped, not zero
const db2 = mkDb();
out = await mentionMod.run({ AUDIT: db2 }, { fetch: mkFetch(["openalex", "bluesky"]), now });
ok(out.status === "degraded", "two sources down -> degraded");
ok(out.sources.openalex === "error:http 429" && out.sources.bluesky === "error:http 429", "failure recorded per source as error:http 429");
const keys = Array.from(db2.signals.keys());
ok(!keys.some((k) => k.includes("|openalex|") || k.includes("|bluesky|")), "failed sources write NO reach_signals row (no false zero)");
ok(keys.some((k) => k.includes("|datacite|site|qnfo|mentions")) && keys.some((k) => k.includes("|hn|site|qnfo|mentions")), "healthy sources still write their rows");
ok(db2.mentions.some((m) => m.url === "https://doi.org/10.1000/ext.1" && m.source === "datacite-cites"), "with openalex down, datacite still records the citing work");

// 4) everything down
const db3 = mkDb();
out = await mentionMod.run({ AUDIT: db3 }, { fetch: mkFetch(["openalex", "datacite", "bluesky", "hn"]), now });
ok(out.status === "error" && db3.signals.size === 0 && db3.mentions.length === 0, "all down -> status error, nothing written");

// 5) /mentions/run requires POST
const r = await mentionMod.fetch(new Request("https://x/run"), { AUDIT: mkDb() });
ok(r.status === 405, "GET /mentions/run refused (405)");

if (fail) { console.error(fail + " failure(s)"); process.exit(1); }
console.log("mention-radar-test: all passed");
