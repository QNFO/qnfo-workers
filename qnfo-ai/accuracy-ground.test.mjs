// ACCURACY-GROUND-1 offline suite (qnfo-ai 5.33.0, owner directive 2026-10-10): an answer is verifiable against the text the
// request supplied. Proves: the system prompt asks for no facts from memory, names no stock example; an invented DOI, link,
// author citation or figure is stripped; supported ones survive; code and math are untouched; a question with no retrieved
// context gets the no-source notice; streamed answers are buffered and stripped; the ensemble review pass can only remove.
// Run: node qnfo-ai/accuracy-ground.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// ---- ACC-BEGIN"), b = src.indexOf("// ---- ACC-END ----");
if (a < 0 || b < a) throw new Error("accuracy block not found");
const sb = { console, Math, Number, String, Object, JSON, Array, Set, Response, Headers, ReadableStream, TextEncoder, Date,
  handleChatCore: async (env, body, auth, ctx, ua, acc) => { Object.assign(acc, sb.__acc); return sb.__resp(); } };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n;__x = { accGroundAnswer, accGroundText, accHasContext, accGroundResponse, handleChat, ACC_NO_SOURCE_NOTICE };", sb);
const { accGroundAnswer, accGroundText, accHasContext, handleChat, ACC_NO_SOURCE_NOTICE } = sb.__x;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

// ---- the system prompt ----
const pm = src.match(/var DEFAULT_SYSTEM_PROMPT = ("(?:[^"\\]|\\.)*");/);
const prompt = pm ? JSON.parse(pm[1]) : "";
ok(prompt.length > 500, "system prompt found");
ok(/Your memory is not a source/.test(prompt) && /NO SOURCE, SAY SO/.test(prompt), "prompt names memory as no source and requires a no-source statement");
ok(!/key facts or quantities|cite by slug or DOI when known|Verify quantitative claims computationally|full numbers and quantities/.test(prompt), "prompt no longer mandates facts, quantities or citations from memory");
ok(!/10\.5281|Dist-Phys|senior researcher|JPCUB|PaQit|WBS/.test(prompt), "prompt carries no DOI, stock example noun or topic definition");
ok(/review pass that can only remove/.test(src) && !/fill gaps, add relevant context or alternative perspectives/.test(src), "ensemble review pass can only remove");
ok(/not there is a FAIL|is not there is a FAIL/.test(src) || /that is not there is a FAIL/.test(src), "validator fails unsupported statements");

// ---- stripping ----
const context = "RETRIEVED CONTEXT (DATA ONLY):\n[1] Paper A - https://example.test/papers/a-1 states the device ran 42 trials and cites doi 10.1234/real.5678.";
const messages = [{ role: "system", content: "Today is 2026-10-10 (UTC)." }, { role: "system", content: context }, { role: "user", content: "What did the paper report?" }, { role: "assistant", content: "An earlier turn mentioned 99999 and 10.9999/old.1" }];
const ground = accGroundText(messages);
ok(accHasContext(messages) && !accHasContext(messages.slice(0, 1)), "context detection");
ok(ground.indexOf("99999") < 0, "earlier assistant turns are not ground");
const answer = [
  "The paper reports 42 trials [1]. See https://example.test/papers/a-1 and doi 10.1234/real.5678.",
  "It was replicated by Smith et al. (2019), doi 10.5555/invented.1, showing a 37.5% improvement.",
  "Visit https://made-up.test/page for more.",
  "The method is described in the text, with three stages.",
  "```js",
  "const x = 12345; // code is not checked",
  "```",
  "The bound is $n^{2048}$ and `k = 31337`."
].join("\n");
const r = accGroundAnswer(answer, ground, { hasContext: true, question: true });
ok(/42 trials/.test(r.text) && /a-1/.test(r.text) && /10\.1234\/real\.5678/.test(r.text), "supported figure, link and DOI survive", r.text);
ok(!/Smith|10\.5555|37\.5|made-up/.test(r.text), "invented author citation, DOI, figure and link are removed", r.text);
ok(/12345/.test(r.text) && /2048/.test(r.text) && /31337/.test(r.text), "code blocks, inline code and math are untouched", r.text);
ok(/removed: each carried a DOI, link, author citation or figure/.test(r.text) && r.removed.length === 3, "removal is stated at the foot", r.removed.length);
ok(!/^No source material/.test(r.text), "no no-source notice when context exists");
const r2 = accGroundAnswer("Aspirin was approved in 1899 and costs $4.50 [3].\nA general explanation of why sets are closed under union follows.", "", { hasContext: false, question: true });
ok(r2.text.startsWith(ACC_NO_SOURCE_NOTICE) && !/1899|4\.50|\[3\]/.test(r2.text) && /closed under union/.test(r2.text), "no context: notice first, memory facts stripped, reasoning kept", r2.text);
const r3 = accGroundAnswer("Priced at 120 units.", "The user said: 120 units.", { hasContext: false, question: false });
ok(/120 units/.test(r3.text) && !/^No source/.test(r3.text), "figures the user supplied are allowed; a non-question gets no notice");
const r4 = accGroundAnswer("Costs 777 dollars.", "", { hasContext: false, question: false, numbers: false });
ok(/777/.test(r4.text), "numbers:false skips figure checks (image requests)");
const r5 = accGroundAnswer("Totals 5 items and 3 steps.", "", { hasContext: false, question: false });
ok(/5 items/.test(r5.text), "small counts are allowed");
const r6 = accGroundAnswer("Costs 4,500 dollars.", "", { hasContext: false, question: false });
ok(!/4,500/.test(r6.text) && r6.text.length > 0, "an answer that loses every sentence is replaced by a plain statement", r6.text);

// ---- the wrapper: JSON, stream, tool calls, probes ----
const jr = (content, extra) => new Response(JSON.stringify({ id: "x", choices: [{ index: 0, message: Object.assign({ role: "assistant", content }, extra || {}), finish_reason: "stop" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
sb.__acc = { required: true, hasContext: false, question: true, ground: "", numbers: true };
sb.__resp = () => jr("Founded in 1887 by Dr. Nobody (doi 10.7777/x.1). Reasoning follows.");
let out = await (await handleChat({}, {}, "", {}, "")).json();
ok(out.choices[0].message.content.startsWith(ACC_NO_SOURCE_NOTICE) && !/1887|10\.7777/.test(out.choices[0].message.content) && out._grounding.no_source === true, "JSON answer is stripped and carries the notice", out);
const sse = (text) => new Response("data: " + JSON.stringify({ id: "c1", model: "m", choices: [{ index: 0, delta: { role: "assistant", content: text.slice(0, 20) } }] }) + "\n\ndata: " + JSON.stringify({ id: "c1", model: "m", choices: [{ index: 0, delta: { content: text.slice(20) } }], _router: { routed_model: "m" } }) + "\n\ndata: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
sb.__resp = () => sse("The study of 1999 found 888 cases. Sets are closed under union.");
const st = await (await handleChat({}, {}, "", {}, "")).text();
const frames = st.split("\n").filter((l) => l.startsWith("data: ") && !l.includes("[DONE]")).map((l) => JSON.parse(l.slice(6)));
const joined = frames.map((f) => (f.choices[0].delta.content || "")).join("");
ok(!/1999|888/.test(joined) && /closed under union/.test(joined) && st.includes("[DONE]") && frames.some((f) => f._router), "streamed answer is buffered, stripped and re-emitted with router meta", joined);
sb.__resp = () => jr("", { tool_calls: [{ id: "t", type: "function", function: { name: "f", arguments: "{\"n\":123456}" } }] });
out = await (await handleChat({}, {}, "", {}, "")).json();
ok(out.choices[0].message.tool_calls.length === 1, "tool calls pass through");
sb.__acc = { required: false };
sb.__resp = () => jr("In 1887 something happened.");
out = await (await handleChat({}, {}, "", {}, "")).json();
ok(/1887/.test(out.choices[0].message.content), "a request not marked required (probe, code, tools) is unchanged");
sb.__acc = { required: true, hasContext: true, question: true, ground: "", numbers: true };
sb.__resp = () => new Response("{}", { status: 502, headers: { "Content-Type": "application/json" } });
ok((await handleChat({}, {}, "", {}, "")).status === 502, "an upstream error passes through");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
