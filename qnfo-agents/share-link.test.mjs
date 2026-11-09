// SHARE-LINK-1 (issue 9833), offline: redaction, token shape, the read-only page, and the route wiring. Run: node --no-warnings qnfo-agents/share-link.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redactSecrets, shareToken, shareTokenOk, renderShareHtml } from "./src/lib.js";
const ts = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");

const dirty = "token: abcd1234efgh5678 ghp_" + "a".repeat(30) + " sk-" + "b".repeat(24) + " Authorization: Bearer " + "c".repeat(30) + " AKIA" + "A".repeat(16) + " " + "f".repeat(40) + "\n-----BEGIN PRIVATE KEY-----\nMIIEvQ\n-----END PRIVATE KEY-----\nplain text stays";
const clean = redactSecrets(dirty);
for (const frag of ["abcd1234efgh5678", "ghp_", "sk-bbbb", "cccccccccc", "AKIAAAAA", "ffffffffff", "MIIEvQ"]) assert.ok(!clean.includes(frag), "redacted: " + frag);
assert.ok(clean.includes("plain text stays") && clean.includes("[redacted]"), "ordinary text is kept");

const t = shareToken();
assert.ok(shareTokenOk(t) && shareToken() !== t, "48 hex characters, random");
assert.ok(!shareTokenOk("../x") && !shareTokenOk(t + "0"), "a malformed token is refused");

const html = renderShareHtml({ shared_at: "2026-11-09", turns: [{ turn: 1, prompt: "<script>x</script>", answer: "ok" }] });
assert.ok(html.includes("noindex") && !html.includes("<script>x"), "page is noindex and escapes content");

assert.ok(/\/\^\\\/share\\\/\(\[0-9a-f\]\{48\}\)\$\//.test(ts) && /env\.SHARES\.get\("shares\/"/.test(ts), "GET /share/<token> reads R2 with no caller check");
assert.ok(ts.indexOf("shareGet = ") < ts.indexOf("if (!caller) return json"), "the share page is served before the caller gate");
assert.ok(/sessionMatch\[2\] === "share"/.test(ts) && /scope !== "write"/.test(ts.split('sessionMatch[2] === "share"')[1].slice(0, 400)), "POST/DELETE need the write scope");
assert.ok(/customMetadata\?\.caller !== caller/.test(ts) && /SHARES\.delete\(key\)/.test(ts), "revoke is owner-only and deletes the object");
assert.ok(/binding = "SHARES"/.test(toml), "R2 binding declared");
console.log("share-link ok");
