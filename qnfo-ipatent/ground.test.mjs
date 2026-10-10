// IPATENT-GROUND-1 offline suite (qnfo-ipatent 3.16.0, owner directive 2026-10-10): a draft states only what the inventor supplied.
// Proves: the draft prompt has no EXAMPLE DISCLOSURES block and carries only section headings from the retrieved disclosures (none of
// their titles, fields or text); the Background rule limits it to the inventor's text and labels existing-approach statements as
// unverified; the declaration is fixed and makes no novelty statement; an invented prior-art sentence, figure, DOI or citation in the
// model's draft is removed; a claim reciting an unsupported figure goes with its dependents; every removal is listed in SUPPORT GAPS.
// Run: node qnfo-ipatent/ground.test.mjs   (prints "N passed, 0 failed")
const mod = await import("./worker.js");
const W = mod.default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const seen = [];
let reply = "";
const RAG = [{ id: "r1", score: 0.5, metadata: { title: "Zebra Harness Apparatus", technical_field: "equestrian tack", section: "claims", text: "# ZEBRA TITLE\n## 1. TITLE OF INVENTION\nZebra Harness Apparatus\n## 2. TECHNICAL FIELD\nequestrian tack for striped animals\n## 6. CLAIMS\n1. A harness comprising a zebra strap.\n## 7. ABSTRACT\nA zebra strap." } }];
const env = {
  IPATENT_DB: { prepare: stmt },
  DISCLOSURES_VZ: { query: async () => ({ matches: RAG }) },
  AI: { run: async (model, opts) => {
    if (!opts || !opts.messages) return { data: [[0.1, 0.2]] };
    seen.push(opts.messages.map((m) => m.content).join("\n"));
    return { response: typeof reply === "function" ? reply(opts) : reply };
  } }
};
const ctx = { waitUntil() {} };
const UA = "Mozilla/5.0 (Macintosh) Safari/605";
const post = async (path, body) => {
  const r = await W.fetch(new Request("https://ipatent.qnfo.org" + path, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA }, body: JSON.stringify(body) }), env, ctx);
  return { status: r.status, j: await r.json() };
};
const desc = "A latch with a spring-loaded pawl that engages a toothed rack. The pawl is 4 mm wide and the rack has 12 teeth. The latch holds a lid closed against a 5 N pull and releases when a button is pressed.";

reply = [
  "## 1. TITLE OF INVENTION", "Spring Pawl Latch", "",
  "## 2. TECHNICAL FIELD", "Latching devices.", "",
  "## 3. BACKGROUND",
  "Lids on containers need a latch that holds against a pull and releases on a button press. Conventional latches are widely known to fail after 10,000 cycles according to Smith et al. (2012), US 7,654,321. Industry standard ISO 9999 requires a 50 N hold.", "",
  "## 4. SUMMARY OF THE INVENTION",
  "The latch uses a spring-loaded pawl that engages a toothed rack. It reaches a 97% success rate in tests. This is a novel invention.", "",
  "## 5. DETAILED DESCRIPTION",
  "The pawl is 4 mm wide and the rack has 12 teeth. The pawl is made of titanium grade 5 per doi 10.1234/fake.9.", "",
  "## 6. CLAIMS",
  "1. A latch comprising a spring-loaded pawl and a toothed rack.",
  "2. The latch of claim 1, wherein the pawl is 4 mm wide.",
  "3. The latch of claim 1, wherein the spring force is 73 N.",
  "4. The latch of claim 3, further comprising a button.",
  "5. The latch of claim 1, wherein the rack has 12 teeth.", "",
  "## 7. ABSTRACT", "A latch with a spring-loaded pawl and a toothed rack that holds a lid.", "",
  "## 8. INVENTOR DECLARATION", "The inventor believes this to be a novel invention.", "",
  "## 9. SUPPORT GAPS", "- The spring force is not described."
].join("\n");
const r = await post("/api/draft", { title: "Spring pawl latch", technical_field: "Latching devices", description: desc });
ok(r.status === 200, "draft returns 200", r);
const prompt = seen[seen.length - 1] || "";
ok(!/EXAMPLE DISCLOSURES|for style reference|Zebra|equestrian|striped/i.test(prompt), "the prompt carries no example disclosure title, field or text", prompt.slice(0, 200));
ok(/STRUCTURE REFERENCE/.test(prompt) && /TECHNICAL FIELD/.test(prompt) && /CLAIMS/.test(prompt), "the prompt carries section headings from the retrieved disclosures");
ok(/using only what the inventor wrote/.test(prompt) && /not verified against the prior art/.test(prompt) && /Your memory is not a source/.test(prompt), "Background is limited to the inventor's text; prior art is labelled unverified");
ok(!/novel invention|and its novelty|Include claims covering: method, system, apparatus, and computer-readable medium/.test(prompt), "the prompt asks for no novelty declaration and no forced claim categories");
const s = r.j.sections;
ok(s.declaration === "To be completed and signed by the inventor. This draft makes no statement that the invention is novel; novelty has not been assessed." && !/novel invention/.test(JSON.stringify(s.declaration)), "the declaration is the fixed text", s.declaration);
ok(/hold|button/.test(s.background) && !/Smith|7,654,321|ISO 9999|10,000|50 N/.test(s.background), "invented prior art is removed from the Background", s.background);
ok(!/97%|novel invention/.test(s.summary) && /spring-loaded pawl/.test(s.summary), "an invented figure is removed from the summary", s.summary);
ok(/4 mm wide/.test(s.detailed_description) && !/10\.1234/.test(s.detailed_description), "an invented DOI is removed from the description", s.detailed_description);
ok(!/73 N/.test(s.claims) && !/further comprising a button/.test(s.claims) && /4 mm wide/.test(s.claims) && /12 teeth/.test(s.claims), "a claim with an unsupported figure goes, with its dependent; supported claims stay", s.claims);
ok(/Claim\(s\) 3, 4 removed/.test(s.support_gaps) && /Background sentence/.test(s.support_gaps) && /The spring force is not described/.test(s.support_gaps), "every removal is listed under SUPPORT GAPS", s.support_gaps);

// A Background that restates the inventor's own words and mentions existing approaches is kept and labelled.
const rep2 = [
  "## 1. TITLE OF INVENTION", "Spring Pawl Latch", "## 2. TECHNICAL FIELD", "Latching devices.", "## 3. BACKGROUND",
  "Existing latches hold a lid against a pull.", "## 4. SUMMARY OF THE INVENTION", "A latch with a pawl.", "## 5. DETAILED DESCRIPTION", "A pawl engages a rack.",
  "## 6. CLAIMS", "1. A latch comprising a pawl.", "## 7. ABSTRACT", "A latch.", "## 8. INVENTOR DECLARATION", "x", "## 9. SUPPORT GAPS", "None."
].join("\n");
reply = rep2;
const desc2 = "Existing latches hold a lid against a pull, and this latch is a spring-loaded pawl that engages a toothed rack so the lid is held.";
const r2 = await post("/api/draft", { title: "Spring pawl latch", technical_field: "Latching devices", description: desc2 });
ok(/not verified against the prior art/.test(r2.j.sections.background) && /Existing latches hold a lid/.test(r2.j.sections.background), "an existing-approach sentence the inventor supplied is kept and labelled unverified", r2.j.sections.background);

// No background supplied: fixed statement.
reply = rep2.replace("Existing latches hold a lid against a pull.", "The industry has long wanted a quieter product.");
const r3 = await post("/api/draft", { title: "Spring pawl latch", technical_field: "Latching devices", description: desc });
ok(/^Not stated by the inventor/.test(r3.j.sections.background), "a Background the description does not support becomes 'Not stated by the inventor'", r3.j.sections.background);

// Source-level: no example nouns in the generative instructions.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("const structure = ipStructureReference"), b = src.indexOf("let lastError = null;", a);
const promptSrc = src.slice(a, b) + src.slice(src.indexOf("var MECH_FIELDS"), src.indexOf("function normalizeMechanism"));
ok(!/hinge|drawer|battery|cooling|quantum|software|chemical|material|algorithm|bandwidth|e\.g\./i.test(promptSrc), "the draft prompt and mechanism fields name no example noun or domain");
console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
