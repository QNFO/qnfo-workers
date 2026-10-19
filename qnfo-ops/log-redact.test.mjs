// OPS-TOOL-MAILBOX-LOGIN-LINKS-1 (agent_issues 100036), qnfo-ops 2.49.0 offline suite. No network; every URL, code and key
// below is synthetic. Proves: login/auth links lose everything after the host, plain links stay, one-time codes, bearer
// credentials, key=value secrets, JWTs and long hex/base64 runs are masked, and the log, transcript and mailbox-tool paths
// call the redactor.
// Run: node qnfo-ops/log-redact.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const blk = grab("var OPS_REDACT_MARK", "\n__name(redactLooksSecret");
ok(blk.length > 500, "the redaction block is found in worker.js");
const lib = new Function("function __name(f){return f}\n" + blk + "\nreturn { redactSecrets, redactDeep, redactedSnippet, toolReadsMailbox, redactUrl };")();
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
ok(src.indexOf("const text = toolReadsMailbox(name, args) ? redactSecrets(JSON.stringify(res)) : JSON.stringify(res);") >= 0, "mailbox tool results are redacted before the model sees them");
ok(/async function logOps\(env, rec\) \{\n  await ensureSchema\(env\);\n  \/\* OPS-TOOL-MAILBOX-LOGIN-LINKS-1/.test(src), "logOps redacts the transcript");
ok(src.indexOf("redactSecrets(String(x.tool_log))") >= 0, "ops_jobs tool_log is redacted");
ok(!/INSERT INTO cloud_ops_events \(id, ts, kind, text, meta, job, status\) VALUES \(\?1, \?2, \?3, \?4, \?5, \?6, \?7\)"\)\.bind\(randId\("evt-"\), iso\(\), "ops_ai_tool", name, snippet\(/.test(src), "no ops_ai_tool write uses the bare snippet");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
