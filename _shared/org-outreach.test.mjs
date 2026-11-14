// ORG-OUTREACH-1: eligibility, message, mode, segment learner, batch selection and reply classification.
// Run: node --no-warnings _shared/org-outreach.test.mjs
import { eligibility, buildMessage, effectiveMode, selectBatch, classifyReply, outcomeFor, segmentRecords, SEGMENTS, OPT_OUT, FACTS } from "./org-outreach.js";
import { chooseKnob } from "./improve-loop.js";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

const good = { email: "partnerships@lab.example.org", org: "Example Lab", segment: "ai-lab", fit: 0.8, source_url: "https://lab.example.org/about",
  fit_note: "your published mission is oversight of autonomous AI systems in deployment" };
const OK = (t, c) => eligibility(t, c).ok;
// example.org is not reserved by RESERVED_DOMAIN (only example TLD); use it as a stand-in public domain.
ok(OK(good), "a role address with a public source and a specific reason is eligible", eligibility(good));
ok(eligibility({ ...good, email: "someone@gmail.com" }).reasons.includes("free-mail"), "free mail is refused");
ok(eligibility({ ...good, email: "a@agency.gov" }).reasons.includes("reserved-domain"), "a government domain is refused");
ok(eligibility({ ...good, source_url: "" }).reasons.includes("no-public-source"), "no public source is refused");
ok(eligibility({ ...good, fit_note: "great fit" }).reasons.includes("no-specific-reason"), "a generic reason is refused");
ok(eligibility({ ...good, fit: 0.2 }).reasons.includes("low-fit"), "low fit is refused");
ok(eligibility({ ...good, segment: "x" }).reasons.includes("unknown-segment"), "unknown segment is refused");
ok(eligibility({ ...good, email: "jane.doe@inst.de" }).reasons.includes("named-person-restricted-region"), "a named person in a restricted region is refused");
ok(OK({ ...good, email: "info@inst.de" }), "a role address in a restricted region is allowed");
ok(eligibility(good, { suppressed: new Set([good.email]) }).reasons.includes("suppressed"), "suppression wins");
ok(eligibility(good, { suppressedDomains: new Set(["lab.example.org"]) }).reasons.includes("domain-suppressed"), "domain suppression wins");
ok(eligibility(good, { contacted: new Set([good.email]) }).reasons.includes("recently-contacted"), "no repeat contact");

const m = buildMessage(good, { booking_url: "https://cal.example.org/rowan", postal_address: "1 Example Street, Town" });
ok(m.blocked === null, "with a postal address the message is sendable");
ok(m.text.includes(OPT_OUT), "opt-out line present");
ok(m.text.includes("automated system"), "automation is disclosed");
ok(m.text.includes(good.source_url) && m.text.includes(good.fit_note), "the specific reason and its source are quoted");
ok(m.text.includes("https://cal.example.org/rowan"), "the booking link is used when set");
ok(FACTS.every((f) => m.text.includes(f)), "every fact is verbatim from FACTS");
ok(!/\bI am applying\b/i.test(m.text) && m.text.includes("not applying for a role"), "it does not read as a job application");
ok(!/^Re:/i.test(m.subject), "no fake Re: subject");
ok(buildMessage(good, {}).blocked === "postal-address-missing", "no postal address blocks a live send");

ok(effectiveMode({ mode: "live", postal_address: "x" }, true) === "live", "live needs mode, kill switch and postal address");
ok(effectiveMode({ mode: "live", postal_address: "x" }, false) === "draft", "kill switch off degrades to draft");
ok(effectiveMode({ mode: "live" }, true) === "draft", "missing postal address degrades to draft");
ok(effectiveMode({}, true) === "draft", "default is draft");
ok(effectiveMode({ mode: "off" }, true) === "off", "off is off");

const recs = segmentRecords([{ segment: "ai-lab", sends: 40, positive: 0 }, { segment: "funder", sends: 10, positive: 3 }]);
ok(recs.find((r) => r.knob === "ai-lab").retired, "30 sends and no positive reply stops a segment");
ok(!recs.find((r) => r.knob === "funder").retired, "a segment with positives stays");
ok(chooseKnob(recs).knob !== "ai-lab", "the learner never picks a retired segment");

const mk = (i, seg, dom) => ({ ...good, email: "info@" + dom, org: "Org " + i, segment: seg, fit: 0.9 - i / 100 });
const targets = [mk(1, "funder", "a.org"), mk(2, "funder", "a.org"), mk(3, "ai-lab", "b.org"), mk(4, "third-sector", "c.org"), mk(5, "ai-firm", "d.org"), mk(6, "research-institute", "e.org")];
const ctx = { cfg: { daily_cap: 3, per_domain_cap: 1 }, shared: { n: 0, cap: 8 }, sentToday: 0, segmentRows: [], choose: chooseKnob, suppressed: new Set(), contacted: new Set() };
const b = selectBatch(targets, ctx);
ok(b.picked.length === 3, "the daily cap bounds the batch", b.picked.length);
ok(new Set(b.picked.map((p) => p.target.email.split("@")[1])).size === 3, "one per domain per day");
ok(b.capped, "reports the cap");
ok(selectBatch(targets, { ...ctx, shared: { n: 8, cap: 8 } }).picked.length === 0, "the shared 8/day cap stops this lane too");
ok(selectBatch(targets, { ...ctx, shared: { n: 6, cap: 8 } }).picked.length === 2, "the shared cap leaves only the remainder");
ok(selectBatch(targets, { ...ctx, sentToday: 3 }).picked.length === 0, "already at the lane cap today");
const skip = selectBatch([{ ...good, email: "x@gmail.com" }], ctx);
ok(skip.picked.length === 0 && skip.skipped[0].reasons.includes("free-mail"), "ineligible rows are skipped with reasons");
ok(selectBatch([], ctx).picked.length === 0, "empty queue is fine");

ok(classifyReply("Out of office until Monday") === "auto", "auto reply");
ok(classifyReply("Please unsubscribe me") === "stop", "stop");
ok(classifyReply("Thanks, not interested at this time") === "decline", "decline");
ok(classifyReply("Interesting. Let's schedule a call next week") === "interested", "interested");
ok(classifyReply("Who are you?") === "other", "other");
ok(outcomeFor("stop").suppress === true && outcomeFor("interested").positive === 1 && outcomeFor("auto").status === null, "outcomes write back correctly");
ok(Object.keys(SEGMENTS).length === 5, "five segments");

console.log("org-outreach: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
