// GOOGLE-IDENTITY-DETECT-1 offline suite: public DNS with a google-site-verification TXT resolves the owner card and sets
// gsc_verified=1; without it nothing is resolved and gsc_verified=0; a DNS failure changes nothing.
// Run: node qnfo-fleet-control/google-identity.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const i = src.indexOf("async function googleIdentityDetect(env) {");
let d = 0, j = src.indexOf("{", i), end = -1;
for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) { end = k + 1; break; } } }
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
async function run(answer, status) {
  const writes = [];
  const AUDIT = { prepare(sql) { const st = { a: [], bind(...a) { st.a = a; return st; }, async run() { writes.push({ sql, a: st.a }); return {}; } }; return st; } };
  const ctx = vm.createContext({ AbortSignal, JSON, String, Date, console, fetch: async () => new Response(JSON.stringify({ Answer: answer }), { status: status || 200 }) });
  vm.runInContext(src.slice(i, end) + "\nthis.f = googleIdentityDetect;", ctx);
  return { r: await ctx.f({ AUDIT }), writes };
}
let a = await run([{ data: '"v=spf1 include:_spf.mx.cloudflare.net ~all"' }, { data: '"google-site-verification=abc123XYZ"' }]);
ok(a.r.ok && a.r.verified === 1, "TXT present: verified", a.r);
ok(a.writes.some((w) => /UPDATE human_actions SET status = 'resolved'/.test(w.sql) && /google-site-verification=abc123XYZ/.test(w.a[0])), "card resolved with the record as evidence");
ok(a.writes.some((w) => /gsc_verified/.test(w.sql) && w.a[0] === 1), "metric set to 1");
let b = await run([{ data: '"v=spf1 include:_spf.mx.cloudflare.net ~all"' }]);
ok(b.r.verified === 0 && !b.writes.some((w) => /human_actions/.test(w.sql)) && b.writes.some((w) => /gsc_verified/.test(w.sql) && w.a[0] === 0), "no TXT: metric 0, card untouched");
let c = await run([], 502);
ok(!c.r.ok && c.writes.length === 0, "DNS failure changes nothing");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
