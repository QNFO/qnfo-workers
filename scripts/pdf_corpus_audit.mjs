// scripts/pdf_corpus_audit.mjs — TYPESET-PRO-2 recurrence guard.
//
// WHY  The 1.5.0 paper typesetter shipped with three defects that no unit test caught, because the fixtures were
//      cleaner than the corpus: citations wrapped across a source line break printed as raw text, the numbered
//      reference list most papers carry in their own body was ignored, and an unmatched key was styled as an error
//      even in papers with no bibliography at all. The suites now pin each of those behaviours, but only a corpus
//      run proves the renderer still holds on real papers.
// WHAT Renders a stratified sample of published papers through the deployed worker's /html endpoint (a string
//      render, no Browser Rendering session) and fails when a page carries a raw `[@key]` marker, mojibake, a
//      duplicated title, or a reference list with no entries where the paper has one.
// HOW  node scripts/pdf_corpus_audit.mjs [--worker https://qnfo-pdf.q08.workers.dev] [--limit 40] [--json]
//      Slugs come from https://papers.qnfo.org/sitemap.xml (public, newest first), so the script needs no token.
// EXIT 1 when any hard defect is found; 0 otherwise. Offline, no secrets.
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const WORKER = arg("worker", "https://qnfo-pdf.q08.workers.dev").replace(/\/$/, "");
const LIMIT = Math.max(1, Math.min(400, parseInt(arg("limit", "40"), 10) || 40));
const JSON_OUT = args.includes("--json");

async function slugs() {
  const r = await fetch("https://papers.qnfo.org/sitemap.xml", { headers: { "user-agent": "qnfo-audit/1.0" } });
  const xml = await r.text();
  const out = [];
  const re = /<loc>https:\/\/papers\.qnfo\.org\/papers\/([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) out.push(decodeURIComponent(m[1]));
  return out;
}

function score(slug, status, html) {
  const refItems = (html.match(/class="ref"/g) || []).length;
  const firstBody = html.indexOf("</header>");
  const bodyPart = firstBody >= 0 ? html.slice(firstBody) : html;
  const problems = [];
  // markers inside <pre>/<code> are legitimate source text, not a rendering defect
  const visible = bodyPart.replace(/<pre[\s\S]*?<\/pre>/g, " ").replace(/<code[\s\S]*?<\/code>/g, " ");
  const raw = (visible.match(/\[@/g) || []).length;
  if (raw > 0) problems.push("raw-citation-markers:" + raw);
  if (/Ã[\u0080-\u00BF]|â€/.test(html)) problems.push("mojibake");
  if ((html.match(/class="paper-title"/g) || []).length > 1) problems.push("double-title");
  if (/<header class="paper-head">/.test(html) === false) problems.push("no-title-block");
  if (/<h2>References<\/h2>\s*<section/.test(html)) problems.push("references-heading-without-list");
  return {
    slug,
    status,
    bytes: html.length,
    references: refItems,
    // count the rendered spans only — PRINT_CSS also contains the literal ".cite-missing" rule, and
    // matching that made the first version of this audit report 40 phantom unresolved keys
    unresolved: (html.match(/class="cite cite-missing"/g) || []).length,
    problems
  };
}

const all = await slugs();
if (!all.length) {
  console.error("pdf_corpus_audit: no slugs in the sitemap");
  process.exit(2);
}
// take a spread across the sitemap rather than only the newest pages
const step = Math.max(1, Math.floor(all.length / LIMIT));
const sample = [];
for (let i = 0; i < all.length && sample.length < LIMIT; i += step) sample.push(all[i]);

const rows = [];
let i = 0;
async function lane() {
  while (i < sample.length) {
    const slug = sample[i++];
    try {
      const r = await fetch(WORKER + "/html/" + encodeURIComponent(slug), { headers: { "user-agent": "qnfo-audit/1.0" } });
      rows.push(score(slug, r.status, await r.text()));
    } catch (e) {
      rows.push({ slug, status: 0, problems: ["fetch-failed:" + String(e && e.message || e).slice(0, 80)] });
    }
  }
}
await Promise.all([lane(), lane(), lane(), lane()]);

const hard = rows.filter((r) => r.problems.length > 0);
const summary = {
  audited: rows.length,
  clean: rows.length - hard.length,
  referencesRendered: rows.reduce((a, b) => a + (b.references || 0), 0),
  papersWithReferences: rows.filter((r) => (r.references || 0) > 0).length,
  failures: hard.map((r) => ({ slug: r.slug, problems: r.problems }))
};
if (JSON_OUT) {
  console.log(JSON.stringify({ summary, rows }, null, 1));
  writeFileSync("pdf-corpus-audit.json", JSON.stringify({ summary, rows }, null, 1));
} else {
  for (const r of rows) {
    console.log((r.problems.length ? "FAIL " : "ok   ") + r.slug.slice(0, 62).padEnd(64) + " refs=" + (r.references || 0) + (r.problems.length ? "  " + r.problems.join(",") : ""));
  }
  console.log("\n" + summary.clean + "/" + summary.audited + " clean · " + summary.papersWithReferences + " papers with a reference list · " + summary.referencesRendered + " entries");
}
process.exit(hard.length ? 1 : 0);
