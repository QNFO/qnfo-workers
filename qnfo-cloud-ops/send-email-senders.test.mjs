// SEND-EMAIL-SENDER-RESTRICT-1 (agent_issues 2421), offline suite. No network.
// wrangler.toml restricts the SEND_EMAIL binding to allowed_sender_addresses (applied by qnfo-ops 2.45.0 on deploy), so a
// send from any other address is refused by Cloudflare. This suite reads every env.SEND_EMAIL use in worker.js, resolves the
// `from` of each send() call to an address, and fails when the code sends as an address the allowlist does not name, when
// the allowlist names one the code never uses, or when a use cannot be read (the binding passed around, a computed sender).
// ADVERSARIAL: a static read. It proves the code and the allowlist agree, not that Cloudflare accepts either.
// Run: node --no-warnings qnfo-cloud-ops/send-email-senders.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

// The allowlist, read the way the qnfo-ops installer reads it: the [[send_email]] block, one line per key.
const blocks = toml.split(/^\s*\[/m).filter((b) => /^\[send_email\]\]/.test(b));
ok(blocks.length === 1, "one [[send_email]] block", blocks.length);
const line = blocks.length ? (blocks[0].match(/^\s*allowed_sender_addresses\s*=\s*\[([^\]\n]*)\]\s*(#.*)?$/m) || null) : null;
const allowed = line ? (line[1].match(/"([^"]*)"/g) || []).map((q) => q.slice(1, -1)) : [];
ok(allowed.length > 0, "allowed_sender_addresses is declared on one line", allowed);

// Every use of the binding: a send() call, or a presence check (!env.SEND_EMAIL / !!env.SEND_EMAIL).
const uses = [];
const rx = /env\.SEND_EMAIL\b/g;
let m;
while ((m = rx.exec(src)) !== null) {
  const before = src.slice(Math.max(0, m.index - 2), m.index);
  const after = src.slice(m.index + m[0].length, m.index + m[0].length + 8);
  if (/^\.send\(/.test(after)) uses.push({ at: m.index, kind: "send" });
  else if (/!$/.test(before) && !/^\s*\./.test(after)) uses.push({ at: m.index, kind: "check" });
  else uses.push({ at: m.index, kind: "unreadable", text: src.slice(m.index - 40, m.index + 60) });
}
ok(!/\[\s*["']SEND_EMAIL["']\s*\]/.test(src) && !/\{\s*[^}]*\bSEND_EMAIL\b[^}]*\}\s*=\s*env\b/.test(src), "the binding is never read by a computed key or destructured");
const bad = uses.filter((u) => u.kind === "unreadable");
ok(bad.length === 0, "every env.SEND_EMAIL use is a send() call or a presence check", bad);
const sends = uses.filter((u) => u.kind === "send");
ok(sends.length >= 1, "at least one send() call", sends.length);

// Resolve each send's from: a literal { email: "..." }, a string literal, or a top-level const/var holding one.
const resolveIdent = (id) => {
  const d = new RegExp("(?:var|const|let)\\s+" + id + "\\s*=\\s*(\\{[^}]*\\}|\"[^\"]*\")").exec(src);
  if (!d) return null;
  const assigns = (src.match(new RegExp("(?<![\\w.])" + id + "\\s*=(?!=)", "g")) || []).length;
  if (assigns !== 1) return null;
  return fromValue(d[1]);
};
function fromValue(v) {
  const s = String(v).trim();
  const lit = /^"([^"]+)"$/.exec(s);
  if (lit) return lit[1];
  const obj = /^\{[^}]*\bemail\s*:\s*"([^"]+)"[^}]*\}$/.exec(s);
  if (obj) return obj[1];
  if (/^[A-Za-z_$][\w$]*$/.test(s)) return resolveIdent(s);
  return null;
}
const used = new Set();
for (const u of sends) {
  const call = src.slice(u.at, u.at + 400);
  const f = /\bfrom\s*:\s*(\{[^}]*\}|"[^"]*"|[A-Za-z_$][\w$]*)/.exec(call);
  const addr = f ? fromValue(f[1]) : null;
  ok(!!addr, "the sender of the send() call at offset " + u.at + " resolves to an address", call.slice(0, 160));
  if (addr) {
    used.add(addr);
    ok(allowed.includes(addr), addr + " is in allowed_sender_addresses (or its send would be refused)", allowed);
  }
}
for (const a of allowed) ok(used.has(a), a + " in the allowlist is an address worker.js sends as (no stale entries)", Array.from(used));

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
