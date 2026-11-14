// ORG-OUTREACH-1 producer: seeding, site verification, contact and mission extraction, fit, robots.
// Run: node --no-warnings _shared/org-discovery.test.mjs
import { normName, guessSegment, seedRows, candidateSites, verifySite, extractContact, extractFitNote, scoreFit, robotsAllows, assess, siteHost } from "./org-discovery.js";
import { eligibility } from "./org-outreach.js";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

ok(normName("The Example Institute, Inc.") === "exampleinstitute", "legal suffixes and punctuation drop out", normName("The Example Institute, Inc."));
ok(guessSegment("Apex Ventures", "Analyst") === "funder" && guessSegment("Open Philanthropy Foundation", "x") === "third-sector", "segment from the name");
ok(guessSegment("Policy Research Institute", "Evaluator") === "research-institute" && guessSegment("Safety Labs", "Engineer") === "ai-lab", "institutes and labs");
ok(guessSegment("Acme Plumbing", "Plumber") === null, "an unrelated company has no segment");

const seeds = seedRows([
  { company: "Example Institute", title: "Research Analyst", url: "https://boards.greenhouse.io/exampleinstitute/jobs/1" },
  { company: "Example Institute", title: "Another", url: "https://example.org/jobs/2" },
  { company: "Beta Labs", title: "ML Engineer", url: "https://beta.org/careers/9" },
  { company: "AB", title: "x", url: "https://ab.org" },
  { company: "Acme Plumbing", title: "Plumber", url: "https://acme.example/jobs" },
]);
ok(seeds.length === 2, "one row per organisation, unclassifiable and tiny names dropped", seeds);
ok(!/greenhouse/.test(String(seeds.find((s) => s.org === "Example Institute").website)), "an ATS host is never an organisation's site");
ok(seeds.find((s) => s.org === "Beta Labs").website === "https://beta.org", "an own-host posting gives the origin");
ok(candidateSites("Example Institute")[0] === "https://exampleinstitute.org" && candidateSites("AB").length === 0, "candidate origins");

const page = `<html><head><title>Example Institute | Independent policy research</title>
<meta name="description" content="Example Institute is an independent research organisation evaluating autonomous systems and public policy for the public interest.">
</head><body><h1>Example Institute</h1><p>Write to <a href="mailto:Info@exampleinstitute.org">us</a> or jane.doe@exampleinstitute.org or press@other.com. <img src="logo@2x.png"></p></body></html>`;
ok(verifySite(page, "Example Institute"), "a page that names the company verifies");
ok(!verifySite("<title>Totally Different Co</title>", "Example Institute"), "a page that does not name it is rejected");
const c = extractContact(page, "https://www.exampleinstitute.org");
ok(c && c.email === "info@exampleinstitute.org" && c.role, "role address on the site's own domain wins", c);
ok(extractContact("<p>press@other.com</p>", "https://exampleinstitute.org") === null, "an address on another domain is never taken");
ok(extractContact("<p>noreply@exampleinstitute.org privacy@exampleinstitute.org</p>", "https://exampleinstitute.org") === null, "system addresses are skipped");
ok(extractContact("<p>sales@exampleinstitute.org</p>", "https://exampleinstitute.org").email === "sales@exampleinstitute.org", "plain text address on the domain");
ok(extractContact("<p>team [at] exampleinstitute.org</p>", "https://exampleinstitute.org").email === "team@exampleinstitute.org", "a [at] obfuscation is read");
const note = extractFitNote(page);
ok(note && note.startsWith("its own site describes its work as “") && note.includes("autonomous systems"), "the note quotes the organisation's own description", note);
ok(extractFitNote("<p>short</p>") === null, "no quotable description gives no note");
ok(scoreFit("independent research and policy evaluation, evidence", "research-institute") >= 0.5 && scoreFit("we sell shoes", "research-institute") < 0.5, "fit rises with segment terms only");
ok(!robotsAllows("User-agent: *\nDisallow: /") && robotsAllows("User-agent: *\nDisallow: /private") && robotsAllows("") && robotsAllows("User-agent: googlebot\nDisallow: /"), "robots wildcard disallow-all is honoured");
ok(siteHost("https://www.Example.org/x") === "example.org", "site host");
// review-gate findings on e536772
ok(!robotsAllows("User-agent: QNFO-research-bot\nDisallow: /"), "a group that names this bot is honoured with no wildcard group");
ok(!robotsAllows("User-agent: *\nDisallow:\n\nUser-agent: qnfo-research-bot\nDisallow: /"), "a bot-specific disallow overrides a permissive wildcard group");
ok(robotsAllows("User-agent: *\nDisallow: /\n\nUser-agent: qnfo-research-bot\nDisallow: /private"), "a bot-specific group that allows overrides a wildcard disallow-all");
ok(!robotsAllows("User-agent: googlebot\nUser-agent: *\nDisallow: /"), "stacked user-agent lines share one group");
ok(robotsAllows("User-agent: googlebot\nDisallow: /"), "another bot's disallow does not apply to us");
ok(!robotsAllows("User-agent: qnfo-research\nDisallow:\n\nUser-agent: *\nDisallow: /") && !robotsAllows("User-agent: bot\nDisallow:\n\nUser-agent: *\nDisallow: /"), "a fragment of our name is another crawler: the wildcard group still applies");
ok(seedRows([null, undefined, { company: "Beta Labs", title: "ML Engineer", url: "https://beta.org/x" }]).length === 1, "a null posting is skipped");
const two = seedRows([{ company: "Example Institute", title: "Analyst", url: "https://boards.greenhouse.io/x/1" }, { company: "Example Institute", title: "Analyst 2", url: "https://exampleinstitute.org/jobs/2" }]);
ok(two.length === 1 && two[0].website === "https://exampleinstitute.org", "a later posting on the organisation's own host fills in the site", two);

const a = assess("Example Institute", "research-institute", "https://exampleinstitute.org", [{ url: "https://exampleinstitute.org/", html: page }]);
ok(a.email === "info@exampleinstitute.org" && a.fit >= 0.5 && a.source_url === "https://exampleinstitute.org/", "assess yields a complete row", a);
ok(assess("Example Institute", "research-institute", "https://exampleinstitute.org", [{ url: "u", html: "<title>Other</title><p>info@exampleinstitute.org</p>" }]).reason === "site-not-verified", "an unverified site yields nothing");
ok(assess("Example Institute", "research-institute", "https://exampleinstitute.org", []).reason === "no-pages", "no pages");
// the row discovery produces passes the outreach lane's own eligibility
const el = eligibility({ email: a.email, org: "Example Institute", segment: "research-institute", fit: a.fit, fit_note: a.fit_note, source_url: a.source_url });
ok(el.ok, "a discovered row is eligible for the lane", el);

console.log("org-discovery: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
