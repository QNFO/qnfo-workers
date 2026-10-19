// INTEG-MASTODON-VERIFY-1 offline suite (qnfo-social 0.16.12, agent_issues 2925). Proves the Mastodon profile sync is a function of
// env (the 0.16.10-codeagent draft was a top-level block on process.env that a Worker cannot run): it keeps the account's other
// link fields, drops the closed registrar's entry, sets Website to https://qnfo.org, PATCHes only when the fields differ, reports a
// failure's reason, and the daily engagement step calls it.
// Run: node qnfo-social/mastodon-profile.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const mod = await import("./worker.js");
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

ok(!/^\s*if \(process\.env\./m.test(src), "no top-level block on process.env");
ok(/mastodonProfileSync\(env\)/.test(src), "the engagement step calls mastodonProfileSync(env)");

const W = mod.mastodonWantedFields;
const dead = { name: "Zenodo Resume DOI", value: "10.5281/zenodo.1" };
const orcid = { name: "ORCID", value: "https://orcid.org/0009-0002-4317-5604" };
let w = W([orcid, dead, { name: "Website", value: "https://old.example" }]);
ok(JSON.stringify(w) === JSON.stringify([orcid, { name: "Website", value: "https://qnfo.org" }]), "keeps ORCID, drops the dead entry, replaces Website", w);
w = W([{ name: "Resume", value: "see zenodo.org/record/1" }]);
ok(w.length === 1 && w[0].name === "Website", "a dead value is dropped whatever the field is called", w);
ok(W(undefined).length === 1 && W(null)[0].value === "https://qnfo.org", "no fields: just the Website");
ok(W([1, 2, 3, 4, 5].map((i) => ({ name: "f" + i, value: "v" + i }))).length === 4, "never more than the four fields Mastodon allows");

function net(acct, status = { verify: 200, update: 200 }) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || "GET", body: init && init.body, auth: init && init.headers && init.headers.Authorization });
    if (/verify_credentials/.test(url)) return { ok: status.verify < 400, status: status.verify, json: async () => acct };
    return { ok: status.update < 400, status: status.update, json: async () => ({}) };
  };
  return { f, calls };
}
const env = { MASTODON_TOKEN: "tok-SECRET", MASTODON_HOST: "mstdn.science" };

let r = await mod.mastodonProfileSync({}, async () => { throw new Error("must not fetch"); });
ok(r.skipped, "no token: skipped, no request", r);

let n = net({ fields: [orcid, dead] });
r = await mod.mastodonProfileSync(env, n.f);
ok(r.changed === true && n.calls.length === 2 && n.calls[1].method === "PATCH", "a differing profile is PATCHed once", { r, calls: n.calls.length });
const sent = JSON.parse(n.calls[1].body || "{}");
ok(JSON.stringify(sent.fields_attributes) === JSON.stringify([orcid, { name: "Website", value: "https://qnfo.org" }]), "the PATCH body carries the wanted fields", sent);
ok(n.calls.every((c) => c.auth === "Bearer tok-SECRET" && /^https:\/\/mstdn\.science\/api\/v1\/accounts\//.test(c.url)), "requests go to the account API with the bearer token");
ok(!JSON.stringify(r).includes("tok-SECRET"), "the token never reaches the result");

n = net({ fields: [orcid, { name: "Website", value: '<a href="https://qnfo.org" rel="me">https://qnfo.org</a>', verified_at: "2026-10-19T00:00:00Z" }] });
r = await mod.mastodonProfileSync(env, n.f);
ok(r.changed === false && n.calls.length === 1 && r.verified === 1, "an already-correct profile (HTML-wrapped value) is left alone and its verified count read back", { r, calls: n.calls.length });

n = net({}, { verify: 401, update: 200 });
r = await mod.mastodonProfileSync(env, n.f);
ok(/verify_credentials 401/.test(r.error || "") && n.calls.length === 1, "a refused verify reports its status and stops", r);
n = net({ fields: [dead] }, { verify: 200, update: 422 });
r = await mod.mastodonProfileSync(env, n.f);
ok(/update_credentials 422/.test(r.error || "") && r.changed === false, "a refused update reports its status, never a success", r);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
