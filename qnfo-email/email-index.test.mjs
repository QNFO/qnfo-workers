// EMAIL-INDEX-WRITER-1 offline fixtures. No network, no production data.
// ADVERSARIAL: proves the copy is idempotent, capped, excludes spam/outbound, and that retired stores stop alerting.
// It does not prove personal-life accepts the insert in production (verified live after deploy) nor that mail reaches qnfo.org.
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const api = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {emailIndexSync,emailIndexTime,freshnessGuard,RETIRED_STORES,EMAIL_INDEX_CAP,VERSION};")();
const fail = [];
const eq = (l, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };
const ok = (l, c) => { if (!c) fail.push(l); };

function mkEnv(emails, existing) {
  const idx = new Map((existing || []).map((id) => [id, { message_id: id }]));
  const db = (kind) => ({ prepare: (q) => { let a = []; const st = { bind: (...x) => { a = x; return st },
    all: async () => {
      if (/FROM email_index WHERE store/.test(q)) return { results: [...idx.values()].map((r) => ({ message_id: r.message_id })) };
      if (/FROM emails WHERE/.test(q)) return { results: emails.filter((e) => !["spam", "sent"].includes(e.status) && !["alerts", "test"].includes(e.classification)).map((e) => ({ ...e, body: String(e.body_text || "").slice(0, 1200) })) };
      return { results: [] } },
    run: async () => { if (/^INSERT OR IGNORE INTO email_index/.test(q)) { if (!idx.has(a[0])) idx.set(a[0], { message_id: a[0], store: a[1], folder: a[2], sender: a[3], subject: a[4], received_at: a[5], category: a[6], summary: a[7] }); } return { meta: { changes: 1 } } } }; return st } });
  return { idx, env: { PERSONAL: db("p"), AUDIT_DB: db("a") } };
}
const mk = (n, o) => ({ message_id: "m" + n, sender: "a" + n + "@x.test", subject: "S" + n, received_at: "2026-10-0" + (1 + (n % 5)) + "T10:00:00.000Z", classification: "personal", status: "archived", body_text: "hello   world\n" + "x".repeat(500), ...o });

// 1 copies inbound, skips spam/sent/alerts, maps fields
const E = [mk(1), mk(2, { status: "spam" }), mk(3, { status: "sent" }), mk(4, { classification: "alerts" }), mk(5, { received_at: "2026-10-05 09:31:37" })];
const A = mkEnv(E);
const r1 = await api.emailIndexSync(A.env);
eq("first sync", [r1.inserted, r1.already, r1.capped, r1.error, A.idx.size], [2, 0, false, null, 2]);
const m1 = A.idx.get("m1");
eq("mapping", [m1.store, m1.folder, m1.sender, m1.subject, m1.category], ["qnfo.org", "qnfo-inbox", "a1@x.test", "S1", "personal"]);
ok("summary capped 300 and collapsed", m1.summary.length === 300 && m1.summary.startsWith("hello world xxx"));
eq("time normalised", A.idx.get("m5").received_at, "2026-10-05T09:31:37.000000Z");
// 2 idempotent
const r2 = await api.emailIndexSync(A.env);
eq("rerun idempotent", [r2.inserted, r2.already, A.idx.size], [0, 2, 2]);
// 3 cap
const big = Array.from({ length: 450 }, (_, i) => mk(100 + i));
const B = mkEnv(big);
const rb = await api.emailIndexSync(B.env);
eq("cap 200", [rb.inserted, rb.capped, B.idx.size], [200, true, 200]);
const rb2 = await api.emailIndexSync(B.env);
eq("second run continues", [rb2.inserted, B.idx.size], [200, 400]);
// 4 fail closed
eq("no PERSONAL", (await api.emailIndexSync({ AUDIT_DB: A.env.AUDIT_DB })).error, "PERSONAL binding missing");
const bad = await api.emailIndexSync({ PERSONAL: { prepare: () => { throw new Error("boom secret detail") } }, AUDIT_DB: A.env.AUDIT_DB });
eq("error is generic", bad.error, "sync failed (see worker log)");
// 5 retired stores
eq("retired list", Object.keys(api.RETIRED_STORES).sort(), ["gmail", "rowan.quni@outlook.com", "rwnquni@outlook.com"]);
for (const v of Object.values(api.RETIRED_STORES)) eq("reason", v, "no credentialed writer; owner-held Microsoft Graph/Google secrets absent; mail reaches the system by forwarding to rowan.quni@qnfo.org");
const old = "2026-08-01 00:00:00", fresh = new Date().toISOString().slice(0, 19).replace("T", " ");
const issues = [];
const FE = { AUDIT_DB: { prepare: (q) => { let a = []; const st = { bind: (...x) => { a = x; return st }, first: async () => ({ last_seen: fresh }), run: async () => { if (/INTO agent_issues/.test(q)) issues.push(a[0]); return { meta: { changes: 1 } } } }; return st } },
  PERSONAL: { prepare: (q) => { const st = { bind: () => st, first: async () => ({ last_seen: fresh }), all: async () => ({ results: [{ store: "gmail", last_seen: old }, { store: "rowan.quni@outlook.com", last_seen: old }, { store: "rwnquni@outlook.com", last_seen: old }, { store: "qnfo.org", last_seen: fresh }] }) }; return st } } };
const g = await api.freshnessGuard(FE);
eq("retired not flagged, live fresh", [g.stale, g.filed, issues.length, g.retired.length], [[], 0, 0, 3]);
// 6 EMAIL-INDEX-NO-CODES-1: one-time codes stay out of email_index (same rule as personal-api MSGRAPH-NO-CODES-1)
const S = mkEnv([mk(901, { subject: "Gmail Forwarding Confirmation - Receive Mail from someone@gmail.com" }), mk(902, { subject: "Your verification code" }), mk(903, { subject: "Fleet code for the dashboard" }), mk(904, { subject: "Booking confirmation - Hotel Example" })]);
const rs = await api.emailIndexSync(S.env);
eq("codes skipped, booking kept", [rs.inserted, rs.secret, [...S.idx.keys()]], [1, 3, ["m904"]]);
console.log(JSON.stringify({ version: api.VERSION, failures: fail }));
if (fail.length) process.exit(1);
