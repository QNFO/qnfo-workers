// COMPANION-MAIL-IN-1 offline fixtures (no network, no production data). Real subjects and senders from qnfo-audit.emails,
// 2026-11-16..21: of 17 inbound messages exactly one was written by a person, and only that one may reach the companion.
import fs from "node:fs";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";
const src = stripWorkerDefaultExport(fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8"));
const api = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {personMail,companionIndex,ultrastableTo,decodeSubject};")();
const fail = [];
const ok = (l, c) => { if (!c) fail.push(l); };
const H = (o) => ({ get: (n) => (o || {})[n.toLowerCase()] ?? null });

const automated = [
  ["b1aujfrz3a7pjn3mydsekmd2ttrppupepjugkwmu7lrsr2nnukkq@cf-bounce.qnfo.org", "QNFO sent as you - 2026-11-16 (2 items)"],
  ["b1aujfjmeepy@cf-bounce.notify.cloudflare.com", "[Alert] Your metered usage has reached your configured budget"],
  ["SRS0=3n9j=gj=microsoft.com=dmarcreport@qnfo.org", "=?utf-8?B?UmVwb3J0IERvbWFpbjogcW5mby5vcmc=?="],
  ["bounce-mc.us7_149139438.18251731-08b60f0c0c@mail223.suw101.mcdlv.net", "=?utf-8?Q?Quantum=20Ecosystem=20Update=20#59?="],
  ["bounce+966b89.2caf95-rowan.quni=qnfo.org@mail.orcarouter.ai", "Introducing Shield"],
  ["info@worldjournals.live", "Abstract Submission Deadline 20 January 2027 | ECAMCISM 2027 @ Amsterdam"],
  ["noreply@github.com", "[GitHub] An email address was added to your account."],
  ["010001a1fb2c8278@send.iceccme.com", "=?windows-1254?Q?IEEE_and_Scopus_publication_chance_-_Phuket?="],
  ["Some Shop <hello@shop.test>", "Your order"],
];
for (const [f, s] of automated) ok("automated stays out: " + f, api.personMail(f, s, H()) === false);
ok("a person is in", api.personMail("khalidhamdy50@gmail.com", "Local Outlook mail -> SQLite & Obsidian OKF (saw qnfo-workers#8252)", H()) === true);
ok("named person is in", api.personMail("Ada Lovelace <ada@example.org>", "Coffee next week?", H()) === true);
ok("list mail is out", api.personMail("ada@example.org", "Hi", H({ "list-unsubscribe": "<mailto:x>" })) === false);
ok("auto-reply is out", api.personMail("ada@example.org", "Out of office", H({ "auto-submitted": "auto-replied" })) === false);
ok("Q subject decodes UTF-8", api.decodeSubject("=?UTF-8?q?Don=E2=80=99t_Just_Block?=") === "Don’t Just Block");
ok("ultrastable header", api.ultrastableTo(H({ "x-ultrastable-to": "Hello@Ultrastable.io" })) === "hello@ultrastable.io");
ok("ultrastable header rejects other domains", api.ultrastableTo(H({ "x-ultrastable-to": "x@evil.test" })) === "");

const rows = [];
const env = { PERSONAL: { prepare: (q) => { const st = { bind: (...a) => { st.a = a; return st; }, run: async () => { rows.push({ q, a: st.a }); return {}; } }; return st; } } };
await api.companionIndex(env, { messageId: "<m1>", from: "noreply@github.com", subject: "[GitHub] x", bodyText: "", receivedAt: "2026-11-20T16:08:37.700Z", headers: H(), usTo: "" });
ok("automated mail writes nothing", rows.length === 0);
await api.companionIndex(env, { messageId: "<m2>", from: "ada@example.org", subject: "Your code is 123456", bodyText: "", receivedAt: "2026-11-20T16:08:37.700Z", headers: H(), usTo: "" });
ok("one-time codes never reach the companion", rows.length === 0);
await api.companionIndex(env, { messageId: "<m3>", from: "Ada <ada@example.org>", subject: "=?UTF-8?q?Caf=C3=A9?=", bodyText: "hi\n\nthere", receivedAt: "2026-11-20T16:08:37.700Z", headers: H(), usTo: "hello@ultrastable.io" });
ok("person mail written once", rows.length === 1 && /INSERT OR IGNORE INTO email_index/.test(rows[0].q));
ok("ultrastable store and folder", rows[0].a[1] === "ultrastable" && rows[0].a[2] === "hello@ultrastable.io");
ok("subject decoded, summary collapsed", rows[0].a[4] === "Café" && rows[0].a[6] === "hi there");
await api.companionIndex(env, { messageId: "<m5>", from: "bo@example.org", subject: "Hi", bodyText: "", bodyHtml: "<html><style>p{x}</style><p>Hello&nbsp;<b>there</b> &amp; bye</p></html>", receivedAt: "2026-11-20T16:08:37.700Z", headers: H(), usTo: "" });
ok("HTML-only mail previews as text: " + (rows[1] && rows[1].a[6]), rows.length === 2 && rows[1].a[6] === "Hello there & bye");
await api.companionIndex({}, { messageId: "<m4>", from: "ada@example.org", subject: "x", headers: H() });
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("companion-mail-in: all checks passed");
