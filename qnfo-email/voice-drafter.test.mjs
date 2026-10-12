// EMAIL-VOICE-DRAFTER-1 (2.8.0, agent_issues 2373): the pure parts of the tiered drafter, loaded from worker.js the way the
// other qnfo-email suites do (the module as a function; no bindings).
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const lib = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn { VERSION, VOICE_DEFAULT, voiceSection, voiceNeverList, neverListHits, ungroundedClaims, tierByRules, parseTierJson, noticeIntent, __handler };")();

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const vm = /^(\d+)\.(\d+)\./.exec(lib.VERSION);
ok(vm && (+vm[1] > 2 || (+vm[1] === 2 && +vm[2] >= 8)), "VERSION at least 2.8");

// voice document sections
const doc = lib.VOICE_DEFAULT;
ok(/Tier 1 NO REPLY/.test(lib.voiceSection(doc, "Tiers")) && /Tier 3 OWNER SENDS/.test(lib.voiceSection(doc, "Tiers")), "section: Tiers");
ok(lib.voiceSection(doc, "Shape").indexOf("Rowan") > 0 && lib.voiceSection(doc, "Nope") === "", "section: Shape, unknown heading empty");
const never = lib.voiceNeverList(doc);
ok(never.indexOf("I hope this email finds you well") >= 0 && never.indexOf("delve") >= 0, "never list parsed", never);
ok(never.every(p => p.length <= 60), "never list keeps phrases, leaves rules to the editor");
ok(lib.neverListHits("Hi, I hope this email finds you well. Let us delve in.", never).length === 2, "never hits: two phrases");
ok(lib.neverListHits("Yes, the paper is at the link you sent.\n\nRowan", never).length === 0, "never hits: clean draft");

// ungrounded claims
const mail = "Subject: your paper\nCould you send the PDF of the adelic paper? I am Jane Smith from Utrecht.";
ok(lib.ungroundedClaims("Jane Smith, the PDF is at the link in your mail.\n\nRowan", [mail, doc, "Rowan Brad Quni-Gudzinas"]).length === 0, "ungrounded: names from the mail are grounded");
const ug = lib.ungroundedClaims("I published it on 2024-03-15 with Peter Jones; see https://example.org/x.pdf", [mail, doc]);
ok(ug.indexOf("https://example.org/x.pdf") >= 0 && ug.indexOf("Peter Jones") >= 0 && ug.some(x => /2024/.test(x)), "ungrounded: a URL, a name and a date the mail lacks", ug);
ok(lib.ungroundedClaims("Best Regards", [mail]).length === 0, "ungrounded: a sign-off phrase is not a name");

// tier rules: the two named test cases are tier 1
const praiseAsk = "Hi there, I came across your work on the adelic repository and was really impressed by your commit. Would you be open to providing a signed statement for my EB-1A petition? https://a.example https://b.example https://c.example";
const r1 = lib.tierByRules("Request", praiseAsk, "kottevarun@gmail.com");
ok(r1 && r1.tier === "1" && /machine-written/.test(r1.reason), "rules: templated praise plus a signed-statement ask is tier 1 (email 984)", r1);
const podcast = "Hello there, we would love to feature you as a guest on our podcast. Would you be interested in a quick 15-minute chat? Book a slot: https://calendly.example/x";
const r2 = lib.tierByRules("Podcast invitation", podcast, "team@authoreate.com");
ok(r2 && r2.tier === "1", "rules: podcast pitch is tier 1 (queue 56)", r2);
const r3 = lib.tierByRules("Letter", "Dear Rowan, could you write a letter of recommendation for my application?", "colleague@uni.example");
ok(r3 && r3.tier === "3" && /commitment/.test(r3.reason), "rules: a recommendation letter is tier 3", r3);
const r4 = lib.tierByRules("Re: paper", "Thanks Rowan, where can I find the PDF of the phase 2 paper?", "friend@example.org");
ok(r4 === null, "rules: a plain question is left to the classifier", r4);
ok(lib.tierByRules("x", "anything", "noreply@service.example").tier === "1", "rules: a machine sender address is tier 1");
ok(lib.tierByRules("Call for papers", "Submit your manuscript to our journal, impact factor 3.2", "editor@journal.example").tier === "1", "rules: solicitation wording is tier 1");

// classifier JSON
ok(lib.parseTierJson('Sure: {"machine_written": false, "tier": 2, "confident": true, "reason": "asks where the PDF is"}').tier === "2", "classifier: confident tier 2");
ok(lib.parseTierJson('{"machine_written": true, "tier": 3, "confident": true, "reason": "x"}').tier === "1", "classifier: machine-written forces tier 1");
ok(lib.parseTierJson('{"tier": 2, "confident": false}').tier === "1", "classifier: unsure is tier 1");
ok(lib.parseTierJson("I cannot tell").tier === "1", "classifier: unreadable is tier 1");
ok(lib.parseTierJson('{"tier": 3, "confidence": 0.9, "reason": "contract"}').tier === "3", "classifier: numeric confidence accepted");

// owner reply intents
ok(lib.noticeIntent("SEND") === "send-draft" && lib.noticeIntent("ok, send it") === "send-draft" && lib.noticeIntent("Send as is.") === "send-draft", "intent: SEND sends the draft");
ok(lib.noticeIntent("Send her the dates: Tuesday works, Thursday does not.") === "send", "intent: a typed reply that starts with send is still the owner's text");
ok(lib.noticeIntent("ignore") === "ignore" && lib.noticeIntent("spam") === "block", "intent: ignore and spam unchanged");

// wiring
ok(src.indexOf('await tierReplyQueue(env)') > 0 && src.indexOf("await drainReplyQueue(env)") > src.indexOf("await tierReplyQueue(env)"), "scheduled: tiers before the drain");
ok(src.indexOf("email_suppression WHERE lower(email)=?1\").bind(normalizeAddress(row.sender))") > 0, "drain: suppression checked before an auto-send");
ok(src.indexOf("await voiceLearnWeekly(env)") > 0, "scheduled: weekly learning runs");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
