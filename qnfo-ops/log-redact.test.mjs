// OPS-TOOL-MAILBOX-LOGIN-LINKS-1 (agent_issues 100036), qnfo-ops 2.49.0 offline suite. No network; every URL, code and key
// below is synthetic. Proves: login/auth links lose everything after the host, plain links stay, one-time codes, bearer
// credentials, key=value secrets, JWTs and long hex/base64 runs are masked, and the log, transcript and mailbox-tool paths
// call the redactor.
// LOG-REDACT-2 (qnfo-ops 2.49.1) extends it: ops_jobs.payload, one-time codes on their own line / bare / spaced, keyword-less
// links in mailbox results, segment-anchored login paths (no false positives on fleet URLs), the budget checkpoint prompt,
// module-scope regexes and a 1 MB timing bound.
// Run: node qnfo-ops/log-redact.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const blk = grab("var OPS_REDACT_MARK", "\n__name(redactLooksSecret");
ok(blk.length > 500, "the redaction block is found in worker.js");
const lib = new Function("function __name(f){return f}\n" + blk + "\nreturn { redactSecrets, redactDeep, redactedSnippet, toolReadsMailbox, redactUrl, redactJobBody: typeof redactJobBody === \"function\" ? redactJobBody : null };")();
const R = lib.redactSecrets;
const M = "[redacted]";

// Login and auth links: host kept, rest masked.
const links = [
  ["https://app.example.test/magic-link?token=AbC123xyz", "https://app.example.test/"],
  ["https://example.test/login?email=a%40b.test&code=998877", "https://example.test/"],
  ["https://auth.example.test/verify/9f8e7d6c5b4a39281706f5e4d3c2b1a0", "https://auth.example.test/"],
  ["https://id.example.test/oauth/callback?state=xyz&code=4/0AbCdEf", "https://id.example.test/"],
  ["https://example.test/api/auth/signin/email?callbackUrl=%2F&token=deadbeefcafe", "https://example.test/"],
  ["https://mail.example.test/u/QmFzZTY0VG9rZW5WYWx1ZTEyMzQ1Njc4OQ", "https://mail.example.test/"],
  ["https://example.test/reset-password?k=zzz", "https://example.test/"],
  ["https://example.test/one-time/abc", "https://example.test/"],
  ["https://example.test/x?otp=123456", "https://example.test/"],
];
for (const [u, host] of links) {
  const out = R("Click " + u + " to continue");
  ok(out === "Click " + host + M + " to continue", "login link masked: " + host, out);
}
// HTML-escaped query separator still counts.
ok(R("<a href=\"https://example.test/go?a=1&amp;token=Zx9Zx9Zx9\">") .indexOf("Zx9") < 0, "an &amp;token= parameter is masked");

// Ordinary links stay readable.
for (const u of ["https://qnfo.org/papers/123", "https://github.com/QNFO/qnfo-workers/pull/2603", "https://example.test/docs/getting-started?lang=en", "https://arxiv.org/abs/2401.01234"]) {
  ok(R("see " + u) === "see " + u, "plain link kept: " + u, R("see " + u));
}
// A 40-char git SHA in a link or text survives.
const sha = "0123456789abcdef0123456789abcdef01234567";
ok(R("commit " + sha) === "commit " + sha, "a 40-hex commit sha is kept");
ok(R("https://github.com/QNFO/qnfo-workers/commit/" + sha).indexOf(sha) >= 0, "a commit link is kept");

// One-time codes next to their words.
const codes = [
  ["Your verification code is 482913.", "482913"],
  ["Sign-in code: 1029 3847", null],
  ["Your login code is 123-456", "123-456"],
  ["Enter passcode 77441122 to continue", "77441122"],
  ["OTP: 5566", "5566"],
  ["938271 is your verification code", "938271"],
  ["Your code: ABCD-EFGH", "ABCD-EFGH"],
  ["security code 314159", "314159"],
];
for (const [t, v] of codes) {
  const out = R(t);
  ok(out.indexOf(M) >= 0 && (!v || out.indexOf(v) < 0), "code masked: " + t, out);
}
ok(R("error code 1042 from the edge") === "error code 1042 from the edge", "an error code is not a one-time code");
ok(R("HTTP 500 after 1200 ms") === "HTTP 500 after 1200 ms", "plain numbers stay");

// Credentials.
ok(R("Authorization: Bearer FAKExNOTxAxKEYx1234567890") === "Authorization: Bearer " + M, "bearer masked", R("Authorization: Bearer FAKExNOTxAxKEYx1234567890"));
ok(R('{"api_key":"fake-key-0000-1111-2222"}') === '{"api_key":"' + M + '"}', "api_key json value masked", R('{"api_key":"fake-key-0000-1111-2222"}'));
ok(R('{\\"token\\":\\"abcdef123456\\"}').indexOf("abcdef123456") < 0, "an escaped json token is masked");
ok(R("password=hunter2hunter2") === "password=" + M, "password= masked");
ok(R("const t = env.ROUTER_KEY; token = env.ROUTER_KEY") .indexOf("env.ROUTER_KEY") >= 0, "a reference to an env binding is not masked");
ok(R("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.c2lnbmF0dXJlZmFrZQ end") === "jwt " + M + " end", "a JWT is masked", R("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.c2lnbmF0dXJlZmFrZQ end"));
ok(R("hex " + "ab".repeat(32)) === "hex " + M, "a 64-hex secret is masked");
ok(R("b64 QWxhZGRpbjpvcGVuIHNlc2FtZQ1234567890abcdefXYZ") === "b64 " + M, "a long mixed base64 run is masked");
ok(R("qnfo-ops-deployed-current-worker-module-name-long") === "qnfo-ops-deployed-current-worker-module-name-long", "a long lowercase identifier is kept");

// Structured values.
const deep = lib.redactDeep({ args: { code: "const u = 'https://app.example.test/magic-link?token=Q1w2E3r4';" }, n: 5, list: ["Your verification code is 112233"] });
ok(JSON.stringify(deep).indexOf("Q1w2E3r4") < 0 && JSON.stringify(deep).indexOf("112233") < 0 && deep.n === 5, "redactDeep walks objects and arrays");
const snip = lib.redactedSnippet({ args: { code: "x".repeat(580) + " https://app.example.test/magic-link?token=LONGTOKENVALUE123" } }, 600);
ok(snip.indexOf("LONGTOKEN") < 0 && snip.length <= 600, "redactedSnippet masks before it truncates", snip.slice(-60));
ok(R(undefined) === undefined && R("") === "", "non-strings pass through");

// Mailbox tools.
ok(lib.toolReadsMailbox("email_check", {}) === true, "email_check reads the mailbox");
ok(lib.toolReadsMailbox("ops_d1_query", { sql: "SELECT body_text FROM emails ORDER BY id DESC" }) === true, "ops_d1_query over emails reads the mailbox");
ok(lib.toolReadsMailbox("ops_d1_query", { sql: "SELECT id FROM agent_issues" }) === false, "ops_d1_query over agent_issues does not");
ok(lib.toolReadsMailbox("workspace_read", { path: "a.js" }) === false, "workspace_read does not");

// Wiring.
ok(/redactedSnippet\(\{ \/\* OPS-TOOL-META-ERROR-FIRST-1, OPS-TOOL-MAILBOX-LOGIN-LINKS-1 \*\/ error/.test(src), "logToolEvent writes cloud_ops_events.meta through redactedSnippet");
ok(src.indexOf("String(name), act, redactedSnippet({ args: args, result: res }, 600)") >= 0, "audit_trail evidence is redacted");
ok(src.indexOf("const text = toolReadsMailbox(name, args) ? JSON.stringify(redactDeep(res, 0, true)) : JSON.stringify(res);") >= 0, "mailbox tool results are redacted before the model sees them (LOG-REDACT-2: the parsed object, strict)");
ok(/async function logOps\(env, rec\) \{\n  await ensureSchema\(env\);\n  \/\* OPS-TOOL-MAILBOX-LOGIN-LINKS-1/.test(src), "logOps redacts the transcript");
ok(src.indexOf("redactSecrets(String(x.tool_log))") >= 0, "ops_jobs tool_log is redacted");
ok(!/INSERT INTO cloud_ops_events \(id, ts, kind, text, meta, job, status\) VALUES \(\?1, \?2, \?3, \?4, \?5, \?6, \?7\)"\)\.bind\(randId\("evt-"\), iso\(\), "ops_ai_tool", name, snippet\(/.test(src), "no ops_ai_tool write uses the bare snippet");

// ---- LOG-REDACT-2 (2.49.1): follow-ups from the independent review of PR 2603 ----
const digitsOnly = (t) => t.replace(/\D/g, "");
// (2) one-time codes in common email layouts, plain and as JSON.stringify leaves them (literal backslash-n).
const layouts = [
  ["Your Example sign-in code\n\n482913\n\nExpires in 10 minutes", "482913"],
  ["Your Example sign-in code\r\n\r\n482913\r\n", "482913"],
  ["Your sign-in code\\n\\n482913\\n\\nExpires in 10 minutes", "482913"],
  ["Your sign-in code\\r\\n\\r\\n482913", "482913"],
  ["Verification code\n\n  738201  \n\nIf you did not ask", "738201"],
  ["Code: 482913", "482913"],
  ["code = 55123344", "55123344"],
  ["Code:\n\n482913", "482913"],
  ["Use 482913 to sign in", "482913"],
  ["Enter 482913 to verify your email", "482913"],
  ["verification code: 4 8 2 9 1 3", "482913"],
  ["Your login code is 482 913", "482913"],
];
for (const [t, v] of layouts) {
  const out = R(t);
  ok(out.indexOf(M) >= 0 && out.indexOf(v) < 0 && digitsOnly(out.replace(/\[redacted\]/g, "")).indexOf(v.slice(0, 3)) < 0, "layout code masked: " + JSON.stringify(t), out);
}
// The same text through the parsed-object path (what the mailbox tools use) and through stringified JSON.
const mailRes = { ok: true, rows: [{ body_text: "Your Example sign-in code\n\n482913\n\nExpires in 10 minutes" }] };
ok(JSON.stringify(lib.redactDeep(mailRes, 0, true)).indexOf("482913") < 0, "redactDeep masks the code in a mailbox row");
ok(R(JSON.stringify(mailRes)).indexOf("482913") < 0, "stringified JSON with a literal backslash-n is masked too");
ok(lib.redactDeep({ b: "Hello\n\n551234\n\nBye" }, 0, true).b.indexOf("551234") < 0, "strict mode masks a standalone 6-8 digit line in a mail body");
ok(R("Hello\n\n551234\n\nBye") === "Hello\n\n551234\n\nBye", "general log redaction leaves a standalone number line alone");

// Ordinary numbers and error codes stay.
const keep = [
  "order 482913 shipped", "Total: 1,234,567 items", "error code 1042 from the edge", "Error code: 1042", "status code: 20000",
  "HTTP code: 502042", "exit code = 1234567", '{"code":1042,"ok":false}', '{\\"code\\": 10013}', "Invoice 2026 10 19 total 4 items",
  "Use 2024 to compute the year", "Use 482913 items", "Phone 555 0100", "build #482913 passed", "see section 4 2 1", "pin 3 of 4",
];
for (const t of keep) ok(R(t) === t, "ordinary text kept: " + t, R(t));

// (3) mailbox results mask every URL path and query, keyword or not; general redaction keeps the keyword and shape gate.
const bare = ["https://x.test/r/" + "a1b2c3d4".repeat(4), "https://example.test/u/abc12345", "https://x.test/r/abcdefghijklmnopqrstuvwxyz0123456789abcd", "https://news.example.test/?e=Zm9v"];
for (const u of bare) {
  ok(R("link: " + u, true) === "link: " + u.replace(/^(https?:\/\/[^\/?#]+).*$/, "$1") + "/" + M, "mailbox mode masks a keyword-less link: " + u, R("link: " + u, true));
}
ok(R("link: https://x.test/") === "link: https://x.test/" && R("link: https://x.test/", true) === "link: https://x.test/", "a bare host stays in both modes");
ok(R("link: https://x.test/r/" + "a1b2c3d4".repeat(4)).indexOf("a1b2c3d4") >= 0, "general mode keeps its keyword and shape gate");
ok(lib.redactDeep({ rows: [{ body: "go https://x.test/r/abc12345 now" }] }, 0, true).rows[0].body === "go https://x.test/" + M + " now", "redactDeep strict masks urls in nested rows");

// (4) false positives: path keywords sit on segment boundaries; single-letter params are not secrets.
const fleet = [
  "https://fleet.qnfo.org/api/session-stats", "https://qnfo.org/authors/x", "https://docs.example.com/guide/login-flow",
  "https://api.example.com/v1/items?t=1&k=2", "https://api.github.com/repos/QNFO/qnfo-workers/pulls?state=open&per_page=100",
  "https://qnfo.org/authority/verify-claims", "https://fleet.qnfo.org/api/resetcounters", "https://example.test/blog/confirmation-bias",
  "https://qnfo.org/papers?hash=abc&page=2",
];
for (const u of fleet) ok(R("see " + u) === "see " + u, "benign url kept: " + u, R("see " + u));
// ... while the real login shapes still go, with their keyword at a segment edge or as a token parameter.
for (const u of ["https://e.test/login", "https://e.test/a/sign-in/xyz", "https://e.test/auth/callback?x=1", "https://e.test/verify?x=1", "https://e.test/reset-password/xyz", "https://e.test/#/login", "https://e.test/magic-link-help", "https://e.test/x?auth_token=abc123", "https://e.test/x?key=abc123", "https://e.test/passwordless/start", "https://e.test/confirm/xyz"]) {
  ok(R("see " + u) === "see https://e.test/" + M, "login url still masked: " + u, R("see " + u));
}

// (1) ops_jobs.payload: the runner replays the stored copy, so the user's request stays verbatim and what other parties
// wrote (tool results, assistant text and tool-call arguments) is redacted.
ok(typeof lib.redactJobBody === "function", "redactJobBody exists");
if (typeof lib.redactJobBody === "function") {
  const link = "https://app.example.test/magic-link?token=Q1w2E3r4";
  const body = { model: "ops-exec", max_tokens: 4096, messages: [
    { role: "system", content: "You are ops. ref https://app.example.test/magic-link?token=SYSTEMKEEP1" },
    { role: "user", content: "please open " + link + " and use password=hunter2hunter2 in the check" },
    { role: "assistant", content: "I will read " + link, tool_calls: [{ id: "call_1", type: "function", function: { name: "run_code", arguments: JSON.stringify({ code: "fetch('" + link + "')" }) } }] },
    { role: "tool", tool_call_id: "call_1", name: "email_check", content: "Your sign-in code\n\n482913\n\nlink " + link },
    { role: "user", content: [{ type: "text", text: "second " + link }] },
  ] };
  const before = JSON.stringify(body);
  const out = lib.redactJobBody(body);
  ok(JSON.stringify(body) === before, "redactJobBody does not mutate the live request");
  ok(out.messages[0].content === body.messages[0].content, "the system message is kept verbatim");
  ok(out.messages[1].content === body.messages[1].content, "the user's request is kept verbatim (the runner replays it)");
  ok(out.messages[4].content[0].text === body.messages[4].content[0].text, "a user content part is kept verbatim");
  ok(out.messages[2].content.indexOf("Q1w2E3r4") < 0 && out.messages[2].tool_calls[0].function.arguments.indexOf("Q1w2E3r4") < 0, "assistant text and tool-call arguments are redacted", out.messages[2]);
  ok(out.messages[2].tool_calls[0].id === "call_1" && out.messages[3].tool_call_id === "call_1" && out.messages[3].name === "email_check", "tool-call ids and names survive so the replay still pairs them");
  ok(out.messages[3].content.indexOf("482913") < 0 && out.messages[3].content.indexOf("Q1w2E3r4") < 0, "tool results are redacted", out.messages[3].content);
  ok(JSON.stringify(out).indexOf("hunter2hunter2") >= 0 && out.model === "ops-exec" && out.max_tokens === 4096, "other fields pass through");
  ok(lib.redactJobBody({ model: "ops-exec" }).model === "ops-exec" && lib.redactJobBody(null) === null, "a body without messages passes through");
}
ok(src.indexOf("const stored = JSON.stringify(redactJobBody(body));") >= 0 && /INSERT INTO ops_jobs \(id, status, model, payload, created_at, updated_at\)[^\n]*\.bind\(jobId, "ops-exec", stored, iso\(\)\)/.test(src), "the ops_jobs INSERT binds the redacted copy, not the raw payload");
ok(src.indexOf("SELECT payload FROM ops_jobs WHERE id=?1") >= 0, "the workflow still loads its input from the stored payload (so the stored copy must stay replayable)");

// (3) the mailbox tool path redacts the parsed object, strict.
ok(src.indexOf("const text = toolReadsMailbox(name, args) ? JSON.stringify(redactDeep(res, 0, true)) : JSON.stringify(res);") >= 0, "mailbox tool results go through the strict deep redactor");

// (5) direct cloud_ops_events inserts carrying user text.
ok(src.indexOf('redactSecrets(String(prompt || "")).slice(0, 200)') >= 0, "the budget checkpoint text is redacted");
ok(/prompt: redactSecrets\(String\(prompt \|\| ""\)\)\.slice\(0, 1200\)/.test(src), "the budget checkpoint meta prompt is redacted");
ok(/bind\(randId\("evt-"\), iso\(\), "promoted to " \+ created\.id, redactedSnippet\(/.test(src), "ops_budget_promote meta is redacted");
ok(/bind\(randId\("evt-"\), iso\(\), redactSecrets\(String\(text\)\)\.slice\(0, 900\), redactedSnippet\(meta \|\| \{\}, 1500\), status\)/.test(src), "compat-verify event text and meta are redacted");

// (6) the compiled expressions live at module scope.
const fnBody = grab("function redactSecrets(", "function redactDeep(");
ok(fnBody.length > 100 && fnBody.indexOf("new RegExp(") < 0, "redactSecrets builds no RegExp per call");

// Timing: linear on 1 MB adversarial strings, in both modes.
const MB = 1 << 20;
const adversarial = {
  "spaces after a code word": "verification code " + " ".repeat(MB),
  "newlines after a code word": ("sign-in code" + "\n".repeat(40)).repeat(Math.floor(MB / 52)),
  "literal backslash-n runs": "your code " + "\\n".repeat(MB / 2),
  "repeated bare code labels": "code:".repeat(MB / 5),
  "digit runs": "1 ".repeat(MB / 2),
  "url path soup": "https://x.test/" + "/a-b_c.".repeat(MB / 7),
  "many urls": "https://a.test/x?y=1 ".repeat(MB / 21),
  "long alnum": "A1b".repeat(MB / 3),
};
for (const [name, text] of Object.entries(adversarial)) {
  for (const strict of [false, true]) {
    const t0 = Date.now();
    const out = R(text, strict);
    const ms = Date.now() - t0;
    ok(typeof out === "string" && ms < 3000, "1 MB '" + name + "' (strict=" + strict + ") finishes in under 3 s", ms + " ms");
  }
}

// ---- LOG-REDACT-2 second review (2.49.1) ----
// (A) the ops_jobs retention sweep covers cancelled rows (the one live row with a login link was cancelled and never swept).
ok(/DELETE FROM ops_jobs WHERE status IN \('succeeded','failed','terminated','cancelled'\) AND updated_at < \?1/.test(src), "the 14-day ops_jobs sweep deletes cancelled rows too");
ok(!/DELETE FROM ops_jobs WHERE status IN \('succeeded','failed','terminated'\)/.test(src), "no sweep statement leaves cancelled out");

// (B) one-time codes in HTML mail bodies, strict (mailbox) mode.
const S = (t) => R(t, true);
const htmlCases = [
  ["Your verification code: <b>482913</b>", "482913"],
  ["<p>Your verification code</p><p>482913</p>", "482913"],
  ['Your verification code is: <strong style="font-size:24px">482913</strong>', "482913"],
  ["Your verification code:&nbsp;482913", "482913"],
  ["Your verification code: &#52;&#56;&#50;&#57;&#49;&#51;", "482913"],
  ["Your verification code: &#x34;&#x38;&#x32;&#x39;&#x31;&#x33;", "482913"],
  ["Your verification code: 4​8​2​9​1​3", "482913"],
  ["Your verification code: 4\\u200b8\\u200b2\\u200b9\\u200b1\\u200b3", "482913"],
  ["Your login code is ８２４９１３", "482913"],
  ["Your login code is \\uff18\\uff12\\uff14\\uff19\\uff11\\uff13", "482913"],
  ["<html><body><table><tr><td>Sign in</td></tr><tr><td><span>482913</span></td></tr></table></body></html>", "482913"],
  ["<div>Hi Sam,</div><div style=\"font-size:32px\">738201</div><div>Expires soon</div>", "738201"],
  ["Your code <span>4</span><span>8</span><span>2</span><span>9</span><span>1</span><span>3</span>", "482913"],
  ["\\u003cp\\u003eYour verification code\\u003c/p\\u003e\\u003cp\\u003e482913\\u003c/p\\u003e", "482913"],
  ["<p>Use <b>482913</b> to sign in</p>", "482913"],
  ["Your&nbsp;verification&nbsp;code&nbsp;is&nbsp;<b>4&nbsp;8&nbsp;2&nbsp;9&nbsp;1&nbsp;3</b>", "482913"],
];
for (const [t, v] of htmlCases) {
  const out = S(t);
  ok(out.indexOf(M) >= 0 && digitsOnly(out.replace(/\[redacted\]/g, "")).indexOf(v.slice(0, 4)) < 0, "html mail code masked (strict): " + JSON.stringify(t), out);
}
ok(S(JSON.stringify({ rows: [{ body_html: "<p>Your verification code</p><p>482913</p>" }] })).indexOf("482913") < 0, "a stringified row with html is masked in strict mode");
ok(lib.redactDeep({ rows: [{ body_html: "<div>Code</div><div>482913</div>" }] }, 0, true).rows[0].body_html.indexOf("482913") < 0, "redactDeep strict masks a code in a parsed html body");
// links inside html still lose their path in strict mode and keep their host
ok(S('<a href="https://x.test/r/abc12345">Sign in</a>').indexOf("abc12345") < 0 && S('<a href="https://x.test/r/abc12345">Sign in</a>').indexOf("https://x.test/") >= 0, "an html href loses its path and keeps its host");
// negative set: benign html, urls and numbers stay readable
const benign = [
  ["<p>Hello Sam,</p><p>Your invoice is attached.</p>", "Hello Sam, Your invoice is attached."],
  ["Meeting at 10:30 &amp; lunch at noon", "Meeting at 10:30 & lunch at noon"],
  ["<ul><li>one</li><li>two</li></ul>", "one two"],
  ["5 &lt; 6 and 7 &gt; 3", "5 < 6 and 7 > 3"],
  ["<b>12345</b> items", "12345 items"],
  ["<td>Ref 4829</td>", "Ref 4829"],
  ["Plain text mail with no markup, 3 attachments, 2026-10-19.", "Plain text mail with no markup, 3 attachments, 2026-10-19."],
  ["<a href=\"https://qnfo.org/\">QNFO</a> site", "QNFO site"],
];
for (const [t, want] of benign) {
  const out = S(t);
  ok(out.indexOf(M) < 0 && out.replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").trim().indexOf(want.split(" ")[0]) >= 0 && want.split(" ").every((w) => out.indexOf(w) >= 0), "benign html kept (strict): " + JSON.stringify(t), out);
}
ok(S("see https://arxiv.org/abs/2401.01234") === "see https://arxiv.org/" + M, "strict mode still reduces a url to its host (by design)");
// normal (log) mode is untouched by the html pass
ok(R("<b>482913</b> items") === "<b>482913</b> items" && R("&#52;&#56;") === "&#52;&#56;", "general mode leaves html and entities alone");

// (C) 1 MB timing for the html pass, strict.
const htmlAdv = {
  "unclosed angle brackets": "<a".repeat(MB / 2),
  "lone lt": "<".repeat(MB),
  "many tags": "<b>1</b>".repeat(MB / 8),
  "entity soup": "&#5;".repeat(MB / 4),
  "ampersands": "&".repeat(MB),
  "zero width": "4​".repeat(MB / 2),
  "full width": "８".repeat(MB),
  "gt digits": ">1 ".repeat(MB / 3),
  "backslash u": "\\u200b".repeat(MB / 6),
  "long tag": "<div " + "a=b ".repeat(MB / 4),
  "gt spaces": ">" + " ".repeat(MB),
  "tag then digits": "<p>1 2 3 4 5 6 7 8 </p>".repeat(MB / 24),
};
for (const [name, text] of Object.entries(htmlAdv)) {
  const t0 = Date.now();
  const out = R(text, true);
  const ms = Date.now() - t0;
  ok(typeof out === "string" && ms < 3000, "1 MB html '" + name + "' (strict) finishes in under 3 s", ms + " ms");
}

// (D) minors: ?code=NNN status params and /auth/health paths stay readable; bare "code:" needs 6-8 digits.
for (const u of ["https://fleet.qnfo.org/api/status?code=200", "https://example.test/check?a=1&code=404", "https://qnfo-ops.q08.workers.dev/auth/health", "https://qnfo-ops.q08.workers.dev/auth/status?x=1"]) {
  ok(R("Probe " + u + " now") === "Probe " + u + " now", "status-style url kept: " + u, R("Probe " + u + " now"));
}
for (const u of ["https://example.test/login?code=998877", "https://id.example.test/x?code=4/0AbCdEf", "https://example.test/cb?code=1234", "https://example.test/auth/callback"]) {
  ok(R("see " + u) === "see " + u.replace(/^(https?:\/\/[^\/?#]+).*$/, "$1") + "/" + M, "code-bearing url still masked: " + u, R("see " + u));
}
ok(R("code: 1234 lines") === "code: 1234 lines" && R("Code: 12 items") === "Code: 12 items", "bare code: with a short number is kept");
ok(R("Code: 482913").indexOf("482913") < 0 && R("code = 55123344").indexOf("55123344") < 0, "bare code: with 6-8 digits is still masked");
ok(R("pin: 4821").indexOf("4821") < 0, "a labelled pin stays masked");

// (E) redactJobBody covers developer role and legacy function_call arguments like tool content.
if (typeof lib.redactJobBody === "function") {
  const jb = lib.redactJobBody({ messages: [
    { role: "developer", content: "code: 482913 https://x.test/login?token=zzz9zzz9" },
    { role: "function", name: "email_check", content: "Your sign-in code\n\n482913" },
    { role: "assistant", content: null, function_call: { name: "run_code", arguments: JSON.stringify({ t: "code: 482913", u: "https://x.test/login?token=zzz9zzz9" }) } },
    { role: "assistant", content: [{ type: "text", text: "code: 482913" }] },
  ] });
  const j = JSON.stringify(jb);
  ok(j.indexOf("482913") < 0 && j.indexOf("zzz9zzz9") < 0, "developer, function and function_call content is redacted", j);
  ok(jb.messages[2].function_call.name === "run_code" && JSON.parse(jb.messages[2].function_call.arguments) !== null, "function_call keeps its name and stays valid JSON");
}

// (F) retention rule and tradeoff records.
{
  let mig = "";
  try { mig = readFileSync(new URL("../migrations/2026-10-19-ops-jobs-login-scrub.sql", import.meta.url), "utf8"); } catch (e) { mig = ""; }
  ok(/^-- APPLY-BY: ci$/m.test(mig) && /^-- DB: qnfo-audit$/m.test(mig) && /^-- Rollback: /m.test(mig), "the scrub migration opts in to ci with a rollback line");
  const bakSel = (/CREATE TABLE IF NOT EXISTS bak_20261019_ops_jobs_login_scrub AS SELECT (.*?) FROM ops_jobs/s.exec(mig) || [])[1] || "";
  ok(/^-- BACKUP: bak_20261019_ops_jobs_login_scrub$/m.test(mig) && bakSel === "id, status, updated_at, length(payload) AS payload_len, length(response) AS response_len, length(tool_log) AS tool_log_len", "the backup table is created first and holds ids and lengths only", bakSel);
  ok(/UPDATE ops_jobs SET\s+payload/.test(mig) && /'cancelled'/.test(mig) && /-1 day/.test(mig), "the scrub blanks payload for terminal rows (cancelled included) older than a day");
  ok(/INTO control_registry/.test(mig) && /ops-jobs-terminal-sweep/.test(mig) && /ops-jobs-payload-redaction/.test(mig) && /INTO queue_sla/.test(mig), "the migration records the retention rule and the continuation tradeoff");
  ok(/continuation/i.test(mig) && /redacted tool output/i.test(mig), "the tradeoff (continuations replay redacted tool output) is recorded in the migration");
  // The window is a slice of the VERSION changelog comment, which grows with every release; widen it
  // rather than reordering history when a new entry is prepended (2026-10-25, 2.55.2).
  ok(/continuation/i.test(src.slice(0, src.indexOf("var VERSION") + 20000)) && /redacted tool output/i.test(src.slice(0, src.indexOf("var VERSION") + 20000)), "the VERSION note records that continuations replay redacted tool output");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
