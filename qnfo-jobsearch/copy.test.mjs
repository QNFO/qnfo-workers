// qnfo-jobsearch copy-quality suite (JOBSEARCH-COPY-1, owner directive 2026-11-10). Run: node qnfo-jobsearch/copy.test.mjs
// Proves: the text the owner sees (recall questions and the sentences he taps onto a resume) and the text a recruiter sees (resume, PDF) is grammatical,
// capitalized and typeset like professionally written copy, for every question the fleet can ask and for the resume built for real postings.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const T = w.__test;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- polishProse: known defects, each fixed once and stable
const P = T.polishProse;
const cases = [
  ["built sql dashboards for the api team", "Built SQL dashboards for the API team."],
  ["Led a team of 12 ,across 3 agencies", "Led a team of 12, across 3 agencies."],
  ["Managed the program from 2011-2015 and  reported to the \"director\"", "Managed the program from 2011\u20132015 and reported to the \u201cdirector.\u201d"],
  ["Wrote papers. cited by 20+ studies. also trained staff", "Wrote papers. Cited by 20+ studies. Also trained staff."],
  ["Built a AI evaluation harness and an LLM judge", "Built an AI evaluation harness and an LLM judge."],
  ["Worked for a university and an hour a day on the project", "Worked for a university and an hour a day on the project."],
  ["Owner's tools - used daily by 50-60 staff", "Owner’s tools – used daily by 50–60 staff."],
  ["See https://doi.org/10.5281/zenodo.17176733 for the method", "See https://doi.org/10.5281/zenodo.17176733 for the method."],
  ["Used e.g. Tableau and Python.", "Used e.g. Tableau and Python."],
  ["Built a SQL pipeline and a LLM judge for an KPI report", "Built an SQL pipeline and an LLM judge for a KPI report."],
  ["worked 2019 - present on data governance", "Worked 2019–Present on data governance."],
];
for (const [a, b] of cases) ok(P(a) === b, "polish: " + a, P(a));
ok(P("M.S. in City and Regional Studies, Rutgers, 2008", { sentence: false }) === "M.S. in City and Regional Studies, Rutgers, 2008", "fragments get no period");
for (const [a] of cases) ok(P(P(a)) === P(a), "polish is idempotent: " + a);

// ---- every question the fleet can ask reads as written English
const looksOk = (s) => /^[A-Z]/.test(s) && /[?.]$/.test(s) && !/ {2}/.test(s) && !/\b(?:involving|work on) [a-z]+\?$/.test(s);
const vocab = T.vocabulary();
let asked = 0, unlabeled = [];
for (const [term, kind] of vocab) {
  const q = T.recallQuestion("term:" + term);
  if (!q) { if (kind !== "skill" && !T.SOFTWARE.has(term)) unlabeled.push(term); continue; }
  asked++;
  ok(looksOk(q.ask), "question reads as a sentence: " + q.ask);
  for (const d of Object.values(q.drafts)) ok(looksOk(d) && !/\b(?:ngo|onderzoek|gemeente|overheid|stakeholder)[.?]$/.test(d), "resume sentence is grammatical: " + d);
  ok(!/[a-z]\.[A-Z]/.test(q.ask + Object.values(q.drafts).join(" ")), "no run-on punctuation: " + term);
}
ok(asked > 150, "most of the vocabulary can be asked", asked);
// a keyword with no noun phrase is never asked (it would be an ungrammatical question); every vocabulary keyword has one
ok(unlabeled.length === 0, "every non-software keyword has a noun phrase in TOPIC_LABEL", unlabeled);
for (const s of T.RECALL_SEED) {
  const q = T.recallQuestion("seed:" + s.id);
  ok(q && looksOk(q.ask) && Object.values(q.drafts).every(looksOk) && Object.values(q.drafts).every((d) => !d.includes("(")), "seed question and drafts are clean: " + s.id, q && q.drafts);
}
ok(T.recallQuestion("term:stakeholder").ask === "Does your experience include stakeholder engagement?", "a bare keyword becomes a noun phrase");
ok(T.recallQuestion("term:stakeholder").drafts.hands === "Hands-on experience with stakeholder engagement.", "and a professional bullet");
ok(T.recallQuestion("term:gemeente").ask === "Have you worked with Dutch municipal governments?", "organizations take worked with");
ok(T.recallQuestion("term:onderzoek").ask === "Does your experience include research?", "Dutch keywords are asked in English");
ok(T.recallQuestion("term:power bi").ask === "Have you used Power BI in your work?", "tool names keep their brand casing");
ok(T.recallQuestion("term:statistics").skillName === "Statistics" || T.recallQuestion("term:statistics").skillName === "", "a concept does not become a malformed skill");

// ---- the bank and the resume built from it
const jobs = [
  { id: "a", company: "Acme Research", title: "Research Program Manager", location: "Amsterdam", url: "https://example.org/a", desc: "Lead our research program and research operations for public sector clients. You will build Tableau dashboards for agency leaders." },
  { id: "b", company: "Agent Labs", title: "AI Systems Researcher", location: "Amsterdam", url: "https://example.org/b", desc: "Evaluate autonomous AI agents, large language model evaluation, and AI governance for safety teams." },
];
for (const job of jobs) {
  const sc = { clusters: ["research_mgmt", "federal", "ai_systems", "autonomous_systems", "data_product"] };
  const md = T.buildResume(job, sc);
  ok(T.verify(md, job).length === 0, "polished resume still verifies against the CV", T.verify(md, job));
  const issues = T.copyLint(md);
  ok(issues.length === 0, "resume passes the copy lint: " + job.title, issues);
  const plain = T.stripTags(md);
  const pdf = Buffer.from(T.pdfOf(plain, "Resume")).toString("latin1");
  ok(pdf.startsWith("%PDF-1.4") && pdf.includes("\x95") && /\(.*\x96.*\)/.test(pdf.replace(/\n/g, " ")) || !/–/.test(plain), "the PDF keeps bullets and en dashes as real glyphs");
  ok(!pdf.includes("(- "), "the PDF has no hyphen standing in for a bullet");
}
const bank = T.polishBank(JSON.parse(JSON.stringify(T.BANK_SEED)));
ok(bank.facts.every((f) => /^[A-Z0-9]/.test(f.text) && /[.!?)]$/.test(f.text)), "every CV fact is a capitalized, closed sentence", bank.facts.filter((f) => !/^[A-Z0-9]/.test(f.text) || !/[.!?)]$/.test(f.text)).map((f) => f.id));
ok(bank.facts.every((f) => P(f.text) === f.text), "the bank is already polished (idempotent)");
{
  // a role line sets its dates flush right on the same line as the title, never wrapped under it
  const pdf2 = Buffer.from(T.pdfOf("# N\n\n## Experience\n**Product Manager and Senior Methods Advisor**, AARP Public Policy Institute, Washington, DC | 2016\u20132021\n- Led the Index.\n", "T")).toString("latin1");
  ok(/\(2016\x962021\) Tj/.test(pdf2) && !pdf2.includes("| 2016"), "role dates are drawn flush right, without the pipe");
}
{
  // a fact an earlier recall answer saved with the old wording is rewritten when the bank loads, keeping the depth the owner tapped
  const old = JSON.parse(JSON.stringify(T.BANK_SEED));
  old.facts.push({ id: "F99", role: "R05", text: "Hands-on work on stakeholder.", tags: [], source: "recall:term:stakeholder", status: "verified" });
  old.recall = { "term:stakeholder": { answer: "yes", role: "R05", depth: "hands", fact: "F99", at: "2026-11-09T00:00:00Z" } };
  T.applyBank(old, 7);
  const f99 = T.LEDGER.facts.find((x) => x.id === "F99");
  ok(f99 && f99.text === "Hands-on experience with stakeholder engagement.", "an old recall fact takes today's wording", f99);
  T.applyBank(JSON.parse(JSON.stringify(T.BANK_SEED)), 0);
}
console.log(`copy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
