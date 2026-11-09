// OUTBOUND-QUEUE-1: queued mail is sent from qnfo.org with the disclosure footer, suppressed recipients are skipped, bad addresses error. Offline, synthetic data.
// Run: node qnfo-email/outbound-queue.test.mjs
import fs from "node:fs";
import assert from "node:assert/strict";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";
const src = stripWorkerDefaultExport(fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8"));
const lib = new Function(src.replace(/export default\{/, "const __handler={") + "\nreturn {VERSION,drainOutboundQueue};")();
const v = lib.VERSION.split("-")[0].split(".").map(Number);
assert.ok(v[0] > 2 || (v[0] === 2 && v[1] >= 13), "version is at least 2.13.0");

const rows = [
  { id: 1, to_addr: "a@example.org", subject: "Hi", body_text: "Hello", from_addr: "qnfo@qnfo.org" },
  { id: 2, to_addr: "stop@example.org", subject: "Hi", body_text: "Hello", from_addr: "qnfo@qnfo.org" },
  { id: 3, to_addr: "not an address", subject: "Hi", body_text: "Hello", from_addr: "owner@gmail.com" },
];
const updates = [], sent = [], logged = [];
const env = {
  SEND_EMAIL: { send: async (m) => sent.push(m) },
  AUDIT_DB: { prepare: (sql) => { let a = []; const s = {
    bind: (...x) => { a = x; return s; },
    all: async () => ({ results: rows }),
    first: async () => (/email_suppression/.test(sql) && a[0] === "stop@example.org" ? { 1: 1 } : null),
    run: async () => { if (/INSERT INTO emails/.test(sql)) logged.push(a); else updates.push([sql.match(/status='(\w+)'/)?.[1], a[0]]); },
  }; return s; } },
};
const out = await lib.drainOutboundQueue(env);
assert.deepEqual(out, { sent: 1, suppressed: 1, errors: 1 });
assert.equal(sent.length, 1);
assert.equal(sent[0].from, "qnfo@qnfo.org");
assert.match(sent[0].text, /autonomous agent on behalf of Rowan Quni/);
assert.equal(logged.length, 1, "the send is logged in emails");
assert.deepEqual(updates.map((u) => u[0]).sort(), ["error", "sent", "suppressed"]);
console.log("outbound-queue ok");
