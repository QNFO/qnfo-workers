// PAPER-TAGS-1: the multi-label layer over the nine shelves. Proves the tag filter composes with the shelf
// filter and search, that /papers/tags is a catalogue rather than a paper, that an unknown tag filters nothing,
// and that the library still renders when paper_tag/tag_registry do not exist (a restored or fresh database).
// Run: node qnfo-gateway/tags.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 200))); } };

const PAPERS = [
  { slug: "qec-padic", title: "Ultrametric Quantum Error Correction on Bruhat-Tits Trees", abstract: "error correction on p-adic trees", created_at: "2026-10-10", status: "published", version: "1", doi: null, authors: "Rowan" },
  { slug: "jpcub", title: "The Joules-per-Solution Metric", abstract: "energy per correct answer", created_at: "2026-10-09", status: "published", version: "1", doi: null, authors: "Rowan" },
  { slug: "ignorance", title: "The Universal Ignorance Audit", abstract: "a method for systematic inquiry", created_at: "2026-10-08", status: "published", version: "1", doi: null, authors: "Rowan" }
];
const SHELVES = { "qec-padic": { category: "qec", secondary: '["mathematics"]' }, "jpcub": { category: "energy", secondary: "[]" }, "ignorance": { category: "ai-epistemics", secondary: "[]" } };
const REGISTRY = [
  { tag: "error-correction", kind: "topic", label: "Error correction", description: "Codes, fault tolerance, logical qubits", sort: 2 },
  { tag: "bruhat-tits", kind: "method", label: "Bruhat–Tits trees", description: "Bruhat-Tits trees used as the model space", sort: 1 },
  { tag: "energy-benchmarking", kind: "use", label: "Energy benchmarking", description: "Measuring energy per result", sort: 3 },
  { tag: "ultrametric", kind: "method", label: "Ultrametric", description: "Non-Archimedean geometry", sort: 1 },
  { tag: "knowledge-integrity", kind: "topic", label: "Knowledge integrity", description: "Ignorance audits and calibration", sort: 2 }
];
const TAGS = [
  { slug: "qec-padic", tag: "error-correction", rank: 0 }, { slug: "qec-padic", tag: "bruhat-tits", rank: 1 }, { slug: "qec-padic", tag: "ultrametric", rank: 2 },
  { slug: "jpcub", tag: "energy-benchmarking", rank: 0 }, { slug: "jpcub", tag: "error-correction", rank: 1 },
  { slug: "ignorance", tag: "knowledge-integrity", rank: 0 }
];

function makeEnv(opts = {}) {
  const withTags = opts.withTags !== false;
  const d1 = {
    prepare(sql) {
      const st = {
        _args: [],
        bind(...a) { st._args = a; return st; },
        async all() {
          if (/FROM papers p WHERE p\.slug IS NOT NULL/.test(sql)) {
            let rows = PAPERS.slice();
            if (/p\.title LIKE \?/.test(sql)) {
              const t = String(st._args[0] || "").replace(/%/g, "").toLowerCase();
              rows = rows.filter(p => (p.title + " " + p.abstract + " " + p.authors).toLowerCase().includes(t));
            }
            return { results: rows };
          }
          if (/FROM paper_category/.test(sql)) return { results: Object.entries(SHELVES).map(([slug, s]) => ({ slug, ...s })) };
          if (/FROM tag_registry/.test(sql)) return withTags ? { results: REGISTRY.slice() } : (() => { throw new Error("no such table: tag_registry"); })();
          if (/FROM paper_tag/.test(sql)) return withTags ? { results: TAGS.slice() } : (() => { throw new Error("no such table: paper_tag"); })();
          return { results: [] };
        },
        async first() {
          if (/COUNT\(\*\)/.test(sql)) return { n: PAPERS.length };
          if (/FROM papers WHERE slug = \?/.test(sql)) return PAPERS.find(p => p.slug === st._args[0]) || null;
          return null;
        },
        async run() { return {}; }
      };
      return st;
    }
  };
  return { LIVING_PAPER: d1, DB: d1, QNFO_BUCKET: { async get() { return null; } }, RELEASES: { async head() { return null; } } };
}
const get = async (env, url, accept = "text/html") => {
  const r = await worker.fetch(new Request(url, { headers: { Accept: accept } }), env, { waitUntil() {} });
  return { status: r.status, text: await r.text(), ct: r.headers.get("content-type") || "" };
};

// 1. tag filter narrows the list, and composes with the shelf filter
const env = makeEnv();
const all = await get(env, "https://papers.qnfo.org/papers?format=json", "application/json");
ok(all.status === 200 && JSON.parse(all.text).total === 3, "unfiltered library lists every paper", all.status);
const jall = JSON.parse(all.text);
ok(jall.papers.every(p => Array.isArray(p.tags)), "each paper carries its tags in the JSON API", jall.papers[0]);
ok(jall.papers.find(p => p.slug === "qec-padic").tags.includes("bruhat-tits"), "the QEC paper carries its method tag");

const one = JSON.parse((await get(env, "https://papers.qnfo.org/papers?format=json&tag=error-correction", "application/json")).text);
ok(one.total === 2 && one.tag === "error-correction", "?tag=error-correction selects the two papers that carry it", one.total);
ok(one.papers.map(p => p.slug).sort().join() === "jpcub,qec-padic", "the right papers are selected");

const both = JSON.parse((await get(env, "https://papers.qnfo.org/papers?format=json&tag=error-correction&category=energy", "application/json")).text);
ok(both.total === 1 && both.papers[0].slug === "jpcub", "tag composes with shelf: error-correction inside energy", both.total);

const searchTagged = JSON.parse((await get(env, "https://papers.qnfo.org/papers?format=json&tag=error-correction&search=Joules", "application/json")).text);
ok(searchTagged.total === 1, "tag composes with search", searchTagged.total);

const unknown = JSON.parse((await get(env, "https://papers.qnfo.org/papers?format=json&tag=not-a-tag", "application/json")).text);
ok(unknown.total === 3 && unknown.tag === null, "an unknown tag filters nothing and reports no tag", unknown.tag);

// 2. the index shows the tag row and the cards carry tags
const html = (await get(env, "https://papers.qnfo.org/papers")).text;
ok(/data-tag="error-correction"/.test(html), "index renders a tag chip");
ok(/tag-more|All 5 tags/.test(html), "index links to the full catalogue");
ok(/class="pc-tag"/.test(html), "paper cards carry tag chips");
ok(/title="Codes, fault tolerance, logical qubits/.test(html), "tag chip carries its definition");
const tagged = (await get(env, "https://papers.qnfo.org/papers?tag=error-correction")).text;
ok(/<span id="ix-head">Error correction papers</.test(tagged), "heading names the active tag rather than saying All papers");
ok(/Error correction\.<\/b>/.test(tagged) || /Codes, fault tolerance/.test(tagged), "active tag explains itself on the page");

// 3. /papers/tags is a catalogue, not a paper
const cat = await get(env, "https://papers.qnfo.org/papers/tags");
ok(cat.status === 200, "the tag catalogue renders", cat.status);
const catText = cat.text;
ok(catText.indexOf("Method") >= 0 && catText.indexOf("Topic") > catText.indexOf("Method") && catText.indexOf("Use") > catText.indexOf("Topic"), "catalogue groups tags by kind, in order", [catText.indexOf("Method"), catText.indexOf("Topic"), catText.indexOf("Use")]);
ok(cat.text.includes("Measuring energy per result"), "catalogue shows what a use tag means");
ok(!/Paper not found/.test(cat.text), "the catalogue is not treated as a missing paper");
const catJson = JSON.parse((await get(env, "https://papers.qnfo.org/papers/tags?format=json", "application/json")).text);
ok(catJson.kinds.length === 3 && catJson.kinds.every(k => Array.isArray(k.tags)), "catalogue has a JSON form");
ok(catJson.kinds.find(k => k.kind === "use").tags[0].papers === 1, "catalogue counts papers per tag");

// 4. degradation: no tag tables at all -> the library still renders, shelves intact
const bare = await get(makeEnv({ withTags: false }), "https://papers.qnfo.org/papers");
ok(bare.status === 200, "library renders when paper_tag/tag_registry do not exist", bare.status);
ok(/data-cat="qec"/.test(bare.text), "shelf chips still render without tags");
ok(!/class="pc-tag"/.test(bare.text), "no tag chips are invented when there are no tags");

console.log(`\nPAPER-TAGS-1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
