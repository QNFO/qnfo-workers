// PAPER-METADATA-JOURNAL-GRADE-1 offline suite (qnfo-gateway 3.38.0, owner directive 2026-10-25: "QNFO papers should be
// considered the same quality as peer-reviewed scholarly journals; make sure all metadata always tags papers as high-quality
// for AI crawlers and SEO").
//
// What this suite locks, so the head cannot silently regress to an abstract-only page:
//   * schema.org JSON-LD is one @graph carrying ScholarlyArticle + Periodical + Organization + WebSite, and the article
//     names its series (@id -> the Periodical node), its encodings (HTML/PDF/Markdown/JSON), its version, its license and
//     its keywords, and resolves its author to the ORCID iD;
//   * the Highwire citation_* set Google Scholar reads (title, each author, date, PDF URL, journal title, keywords);
//   * Dublin Core dc.* and OpenGraph article:* (published, modified, section, tag);
//   * an explicit robots policy that lets an index quote the full text (max-snippet:-1, max-image-preview:large);
//   * the HONESTY GATE: no reviewedBy / peerReview claim. QNFO papers are open versioned works, not peer-reviewed journal
//     articles; the quality case is made from checkable facts and publishingPrinciples -> qnfo.org/about.
// Run: node qnfo-gateway/paper-metadata.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 600) : "")); } };

const PAPERS = {
  "meta-1": {
    slug: "meta-1",
    title: "P-Adic Error Correction and the Cost of a Correct Answer",
    abstract: "We model a symmetric decoder over a Bruhat-Tits tree and measure energy per correct answer.",
    authors: '["Rowan Brad Quni-Gudzinas"]',
    keywords: '["p-adic","ultrametric","error correction"]',
    doi: "10.99999/meta.1",
    created_at: "2026-03-04 10:00:00",
    first_published_at: "2026-03-04 10:00:00",
    last_revised_at: "2026-10-20 08:00:00",
    updated_at: "2026-10-20 08:00:00",
    version: "1.2.0",
    version_semver: "1.2.0",
    version_count: 3,
    status: "published",
    license: "cc-by-4.0",
    pdf_path: "pdf/meta-1.pdf",
    body_md: "# P-Adic Error Correction\n\nThe decoder runs on a tree. " + "Words repeat here to give the page a body. ".repeat(20)
  },
  "meta-2": {
    slug: "meta-2",
    title: "A Retracted Claim", abstract: "This paper described work that did not take place.",
    authors: "Rowan Brad Quni-Gudzinas", keywords: "", doi: "", created_at: "2026-02-01 00:00:00",
    first_published_at: "2026-02-01 00:00:00", last_revised_at: "2026-02-02 00:00:00", updated_at: "",
    version: "1.0.0", version_semver: "1.0.0", version_count: 1, status: "retracted", license: "cc-by-4.0",
    pdf_path: null, body_md: "# A Retracted Claim\n\nRetracted: the described experiments never took place."
  }
};
const SHELF = [{ slug: "meta-1", category: "error-correction" }, { slug: "meta-2", category: "error-correction" }];
const TAGS = [{ slug: "meta-1", tag: "bruhat-tits", rank: 1 }, { slug: "meta-1", tag: "qec", rank: 2 }];
const REGISTRY = [{ tag: "bruhat-tits", kind: "topic", label: "Bruhat-Tits trees", definition: "trees" }, { tag: "qec", kind: "topic", label: "Error correction", definition: "QEC" }];

const stmt = (sql) => {
  const st = { a: [], bind(...a) { st.a = a; return st; },
    async all() {
      if (/FROM paper_tag/.test(sql)) return { results: TAGS };
      if (/FROM tag_registry/.test(sql)) return { results: REGISTRY };
      if (/FROM paper_category/.test(sql)) return { results: SHELF };
      if (/FROM papers/.test(sql)) return { results: Object.values(PAPERS) };
      return { results: [] };
    },
    async first() {
      if (/FROM papers/.test(sql)) {
        const slug = st.a[st.a.length - 1];
        return PAPERS[slug] || null;
      }
      if (/COUNT/.test(sql)) return { n: 2 };
      if (/MIN\(/.test(sql)) return { m: "2026-02-01 00:00:00" };
      return null;
    },
    async run() { return {}; } };
  return st;
};
const env = {
  LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, AUDIT: { prepare: stmt },
  QNFO_BUCKET: { get: async () => null },
  RELEASES: { head: async () => ({ size: 40960 }), get: async () => null }
};
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const get = async (path) => { const r = await gw.fetch(new Request("https://papers.qnfo.org" + path, { headers: { Accept: "text/html" } }), env, { waitUntil() {} }); return { s: r.status, t: await r.text(), h: r.headers }; };

const r = await get("/papers/meta-1");
ok(r.s === 200, "the paper page answers 200", r.s + " " + r.t.slice(0, 200));
const html = r.t;
const headEnd = html.indexOf("</head>");
const head = headEnd > 0 ? html.slice(0, headEnd) : html;
ok(headEnd > 3000, "a full head is served", headEnd);

// --- JSON-LD ---------------------------------------------------------------------------------------------------------
let ld = null;
const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head);
ok(!!m, "the head carries one JSON-LD block");
if (m) { try { ld = JSON.parse(m[1]); } catch (e) { ok(false, "the JSON-LD block parses", m[1].slice(0, 300)); } }
const nodes = (ld && ld["@graph"]) || [];
ok(nodes.length === 4, "the graph carries Organization, WebSite, Periodical and the article", nodes.map((n) => n["@type"]));
const art = nodes.find((n) => n["@type"] === "ScholarlyArticle");
const per = nodes.find((n) => n["@type"] === "Periodical");
const org = nodes.find((n) => n["@type"] === "Organization");
ok(!!art && !!per && !!org, "the four node types are present");
if (art) {
  ok(art["@id"] === "https://papers.qnfo.org/papers/meta-1#article", "the article has a stable @id", art["@id"]);
  ok(art.mainEntityOfPage && art.mainEntityOfPage["@id"] === "https://papers.qnfo.org/papers/meta-1", "mainEntityOfPage points at the page");
  ok(art.isPartOf && art.isPartOf["@id"] === per["@id"], "isPartOf resolves to the Periodical node", art.isPartOf);
  ok(art.publisher && art.publisher["@id"] === org["@id"], "publisher resolves to the Organization node", art.publisher);
  ok(art.creativeWorkStatus === "Published", "creativeWorkStatus is Published", art.creativeWorkStatus);
  ok(art.publishingPrinciples === "https://qnfo.org/about", "publishingPrinciples names the public process page", art.publishingPrinciples);
  ok(art.datePublished === "2026-03-04" && art.dateModified === "2026-10-20", "both dates are emitted", [art.datePublished, art.dateModified]);
  ok(art.version === "1.2.0", "the version is emitted", art.version);
  ok(typeof art.license === "string" && art.license.indexOf("creativecommons.org") >= 0, "the license is a URL", art.license);
  ok(art.isAccessibleForFree === true, "isAccessibleForFree is true");
  ok(Number(art.wordCount) > 40, "wordCount is a measured number", art.wordCount);
  const fmts = (art.encoding || []).map((e) => e.encodingFormat).sort();
  ok(JSON.stringify(fmts) === JSON.stringify(["application/json", "application/pdf", "text/html", "text/markdown"]), "four encodings are advertised", fmts);
  ok((art.encoding || []).every((e) => /^https:\/\/papers\.qnfo\.org\//.test(e.contentUrl)), "every encoding has an absolute URL", art.encoding);
  const ids = (art.identifier || []).map((i) => i.propertyID);
  ok(ids.indexOf("DOI") >= 0 && ids.indexOf("QNFO-OAI-ID") >= 0 && ids.indexOf("URL") >= 0, "identifier carries DOI, OAI id and URL", ids);
  ok(/10\.99999\/meta\.1/.test(JSON.stringify(art.identifier)), "the DOI is the one on the row", art.identifier);
  ok(art.sameAs instanceof Array && art.sameAs.some((u) => /^https:\/\/doi\.org\//.test(u)), "sameAs carries the resolvable DOI URL", art.sameAs);
  const kw = String(art.keywords || "");
  ok(/p-adic/.test(kw) && /bruhat-tits/.test(kw), "keywords merge the paper keywords and the curated tags", kw);
  ok((art.about || []).length >= 3 && art.about.every((a) => a["@type"] === "Thing"), "about is a list of Thing nodes", art.about);
  const a0 = (art.author || [])[0] || {};
  ok(a0["@type"] === "Person" && a0.sameAs && a0.sameAs[0] === "https://orcid.org/0009-0002-4317-5604", "the author resolves to the ORCID iD", a0);
  ok(!("reviewedBy" in art) && !("peerReview" in art), "no peer-review claim is fabricated", Object.keys(art));
}
ok(!/"reviewedBy"|"peerReview"/.test(head), "the whole head carries no peer-review claim");

// --- Highwire citation_* (Google Scholar) ------------------------------------------------------------------------------
ok(/<meta name="citation_title" content="P-Adic Error Correction/.test(head), "citation_title");
ok((head.match(/<meta name="citation_author"/g) || []).length === 1, "one citation_author per author");
ok(/<meta name="citation_publication_date" content="2026-03-04">/.test(head), "citation_publication_date");
ok(/<meta name="citation_journal_title" content="QNFO Papers">/.test(head), "citation_journal_title names the series");
ok(/<meta name="citation_pdf_url" content="https:\/\/papers\.qnfo\.org\/papers\/meta-1\.pdf">/.test(head), "citation_pdf_url is absolute");
ok(/<meta name="citation_doi" content="10\.99999\/meta\.1">/.test(head), "citation_doi");
ok((head.match(/<meta name="citation_keywords"/g) || []).length >= 3, "citation_keywords carries every term");
ok(/<meta name="citation_abstract" content="/.test(head), "citation_abstract");

// --- Dublin Core / OpenGraph / robots -----------------------------------------------------------------------------------
ok(/<meta name="dc\.title" content="P-Adic Error Correction/.test(head), "dc.title");
ok(/<meta name="dc\.creator" content="Rowan Brad Quni-Gudzinas">/.test(head), "dc.creator");
ok(/<meta name="dc\.identifier" content="doi:10\.99999\/meta\.1">/.test(head), "dc.identifier carries the DOI");
ok(/<meta name="dc\.rights" content="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/">/.test(head), "dc.rights is the license URL");
ok(/<meta property="article:published_time" content="2026-03-04T00:00:00Z">/.test(head), "article:published_time");
ok(/<meta property="article:modified_time" content="2026-10-20T00:00:00Z">/.test(head), "article:modified_time");
ok(/<meta property="article:tag" content="bruhat-tits">/.test(head), "article:tag carries a curated tag");
ok(/<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">/.test(head), "robots allows a full snippet and a large image preview");
ok(/<link rel="canonical" href="https:\/\/papers\.qnfo\.org\/papers\/meta-1">/.test(head), "canonical");
ok(/<link rel="alternate" type="text\/markdown"/.test(head) && /<link rel="alternate" type="application\/json"/.test(head) && /<link rel="alternate" type="application\/pdf"/.test(head), "the three alternate encodings are linked");
ok(/<link rel="license" href="/.test(head), "the license is linked");

// --- retracted paper: no index, no false 'Published' --------------------------------------------------------------------
const rr = await get("/papers/meta-2");
ok(rr.s === 200, "a retracted paper keeps its address", rr.s);
const rhead = rr.t.slice(0, rr.t.indexOf("</head>"));
ok(/<meta name="robots" content="noindex,follow">/.test(rhead), "a retracted paper is noindex");
ok(/"creativeWorkStatus":"Retracted"/.test(rhead), "a retracted paper says Retracted in JSON-LD");
ok(!/<meta name="citation_pdf_url"/.test(rhead), "a retracted paper advertises no PDF");

// --- robots.txt carries the AI content signal and names the crawlers ------------------------------------------------------
const rob = await get("/robots.txt");
ok(rob.s === 200, "/robots.txt answers 200", rob.s);
ok(/Content-Signal: search=yes, ai-input=yes, ai-train=yes/.test(rob.t), "robots.txt declares the AI content signal", rob.t.slice(0, 400));
for (const bot of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot", "Amazonbot", "CCBot", "MistralAI-User", "meta-externalagent"]) {
  ok(new RegExp("User-agent: " + bot + "\\nAllow: /").test(rob.t), "robots.txt allows " + bot);
}
ok(/Disallow: \/\*quickread/.test(rob.t), "the per-question quick read stays out of the index (it is not a static page)");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
