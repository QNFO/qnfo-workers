// Q08-DOMAIN-FORM-2 (agent_issues 1001954) and CROSS-LINK-FOLLOWUP-3 (1001712): the Federal Register lane parses into policy candidates,
// and the page shell renders the QNFO family bar and the Keep exploring module on the server.
// Output MUST contain "0 failed" on success.   node q08-signal-engine/official-lane.test.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const kw = src.split("\n").find((l) => l.startsWith("var DOMAIN_ARXIV_KEYWORDS"));
const keep = src.split("\n").find((l) => l.startsWith("var FEDREG_KEEP"));
const a = src.indexOf("function parseFederalRegister(");
const b = src.indexOf("async function scrapeFederalRegister(");
ok(kw && keep && a > 0 && b > a, "the parser and its constants are in the worker");
// DOMAIN_ARXIV_KEYWORDS may span several lines: take its whole statement.
const kwStart = src.indexOf("var DOMAIN_ARXIV_KEYWORDS");
const kwEnd = src.indexOf("];", kwStart) + 2;
const parse = new Function(src.slice(kwStart, kwEnd) + "\n" + keep + "\n" + src.slice(a, b) + "\nreturn parseFederalRegister;")();

const long = "This final rule amends the regulations on the approval of new medical devices and sets out the procedure agencies must follow when they review an application.";
const out = parse({ results: [
  { document_number: "2026-1", title: "Medical device approval", abstract: long, html_url: "https://www.federalregister.gov/d/2026-1", body_html_url: "https://www.federalregister.gov/documents/full_text/html/2026/11/09/2026-1.html" },
  { document_number: "2026-2", title: "No abstract", abstract: "", html_url: "https://www.federalregister.gov/d/2026-2", body_html_url: "https://x/y" },
  { document_number: "2026-3", title: "No full text", abstract: long, html_url: "https://www.federalregister.gov/d/2026-3" }
] });
ok(out.length === 1 && out[0].id === "2026-1", "only a document with an abstract and a full-text url is a candidate");
ok(out[0].source === "fedreg" && out[0].domain === "policy" && out[0].url.indexOf("federalregister.gov") > 0, "the candidate carries source fedreg, domain policy and the document link");
ok(parse(null).length === 0 && parse({}).length === 0, "an empty answer yields no candidates");
ok(/federalregister\.gov\/api\/v1\/documents\.json/.test(src), "the lane reads the Federal Register JSON API");
ok(/async function scrapeFederalRegister\(env, domains\) \{\s*var d = domains[^\n]*\n\s*if \(!d\.policy\) return \[\];/.test(src), "the lane runs only behind the policy token");
ok(/body_html_url\) return String\(story\.body_html_url\)/.test(src), "the full text comes from body_html_url");

// CROSS-LINK-FOLLOWUP-3
ok(/var Q08_FAMILY_BAR = '<div class="q-family">/.test(src) && /The QNFO family<\/span><a href="https:\/\/qnfo\.org\/">QNFO<\/a><a href="https:\/\/qwav\.org\/">QWAV<\/a>/.test(src), "the family bar names QNFO and QWAV");
ok(/data-q-keep="q08"/.test(src) && /class="q-explore"/.test(src), "the Keep exploring module carries data-q-keep for hydration");
ok(/<a class="q-skip" href="#main">Skip to main content<\/a>' \+ Q08_FAMILY_BAR \+ '<header class="q-top">/.test(src), "the bar sits before the header");
ok(/Q08_EXPLORE \+ '<footer class="q-foot">/.test(src), "the module sits before the footer");
ok(src.indexOf("The QNFO family: <a href=\"https://qnfo.org/\">QNFO</a>") > 0, "the footer carries the family line");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
