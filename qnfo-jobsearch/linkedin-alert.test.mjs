// LINKEDIN-ALERT-1: a LinkedIn job-alert mail yields one posting per listing, from the mail text only. Run: node qnfo-jobsearch/linkedin-alert.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const w = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href)).default;
const parse = w.__test.parseLinkedinAlert;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL " + m); } };
const body = `Your job alert for AI evaluation

AI Evaluation Researcher
Acme Labs
Amsterdam, North Holland, Netherlands

View job: https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc

Research Lead, Autonomous Systems
Beta Institute
Remote

View job: https://www.linkedin.com/comm/jobs/view/4012345999/?trackingId=def

See all jobs: https://www.linkedin.com/comm/jobs/search?keywords=ai
`;
const r = parse("jobalerts-noreply@linkedin.com", "New jobs for AI evaluation", body);
ok(r.length === 2, "two listings, got " + r.length);
ok(r[0] && r[0].title === "AI Evaluation Researcher" && r[0].company === "Acme Labs" && /Amsterdam/.test(r[0].location), "first listing fields");
ok(r[0] && r[0].url === "https://www.linkedin.com/jobs/view/4012345678", "canonical url without tracking");
ok(r[1] && r[1].company === "Beta Institute", "second listing company");
ok(parse("hr@acme.com", "Interview invite", body).length === 0, "non-LinkedIn mail ignored");
ok(parse("jobalerts-noreply@linkedin.com", "x", "no links here").length === 0, "no links, no jobs");
console.log(fail ? fail + " failed" : "linkedin-alert: all passed");
process.exit(fail ? 1 : 0);
