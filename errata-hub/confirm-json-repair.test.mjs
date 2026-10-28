// ERRATA-CONFIRM-JSON-REPAIR-1 (errata-hub, mirrored in its host qnfo-research-exec; agent_issues 1000489) offline suite. No network, synthetic replies.
// Proves: parseConfirmVerdict reads a clean verdict as before; a reply with a lone backslash (LaTeX, a path) is repaired and read; legal escapes are not doubled; a reply that cannot be read returns
// null and logs a warning (console.warn), never console.error, so a deferred row does not count as a failing worker; the same function text is in the host worker.
// Run: node errata-hub/confirm-json-repair.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const guest = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const host = readFileSync(new URL("../qnfo-research-exec/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const grab = (s) => { const i = s.indexOf("function parseConfirmVerdict(text) {"); const j = s.indexOf("\n}\n", i); return s.slice(i, j + 3); };
const fnText = grab(guest);
ok(fnText.length > 300 && fnText === grab(host), "the function text is identical in errata-hub and in its host qnfo-research-exec");

const errs = [], warns = [];
const parse = new Function("console", fnText + "\nreturn parseConfirmVerdict;")({ error: (...a) => errs.push(a.join(" ")), warn: (...a) => warns.push(a.join(" ")) });

ok(JSON.stringify(parse('{"confirmed": true, "why": "the quote is in the text"}')) === JSON.stringify({ confirmed: true, why: "the quote is in the text" }), "a clean verdict reads as before");
ok(parse('prefix {"confirmed": "yes", "why": "x"} suffix').confirmed === true, "a verdict inside prose reads, a string yes is true");
const latex = '{"confirmed": false, "why": "the paper writes \\alpha and \\beta here but not that claim"}';
const r = parse(latex);
ok(r && r.confirmed === false && /\\alpha/.test(r.why), "a lone backslash (LaTeX) is repaired and the verdict is read", r);
const path = '{"confirmed": true, "why": "see C:\\x\\y"}';
ok(parse(path) && parse(path).confirmed === true, "a lone backslash in a path is repaired");
const legal = '{"confirmed": true, "why": "line one\\nline two \\"quoted\\" and \\u0041"}';
const rl = parse(legal);
ok(rl && rl.confirmed === true && rl.why.indexOf("line one line two") === 0 && /"quoted"/.test(rl.why) && /A$/.test(rl.why), "legal escapes are not doubled", rl);
ok(errs.length === 0 && warns.length === 0, "no log line for a reply that parses or repairs", { errs, warns });
ok(parse('{"confirmed": maybe, "why": }') === null && errs.length === 0 && warns.length === 1 && /verdict is not JSON/.test(warns[0]), "an unreadable reply returns null, logs one warning and no error", { errs, warns });
ok(parse("no json here") === null && parse("") === null && parse(null) === null, "no braces, nothing: null");
ok(parse('{"why": "no confirmed field"}') === null, "a verdict without a boolean is null");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
