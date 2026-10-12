// SUBSCRIBE-FUNNEL-1, SUBSCRIBE-SEND-HONEST-1, SUBSCRIBE-RESEND-BOUND-1 (qnfo-subscribers 1.2.0, issue 1753) offline test.
// Run: node qnfo-subscribers/funnel.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, "worker.js")).href);
const worker = mod.default;
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

function makeEnv(opts) {
  opts = opts || {};
  const subs = new Map(opts.subs || []);          // email -> { status, unsub_token, mailed_recently }
  const counts = {};                               // stage|source -> n
  const sends = [];
  const writes = [];
  const db = {
    prepare(sql) {
      let args = [];
      const s = {
        bind(...a) { args = a; return s; },
        async first() {
          if (/FROM email_suppression/.test(sql)) return (opts.suppressed || []).includes(args[0]) ? { x: 1 } : null;
          if (/COUNT\(\*\) AS c FROM subscribers WHERE ip_hash/.test(sql)) return { c: opts.ipCount || 0 };
          if (/FROM subscribers WHERE email = /.test(sql)) { const r = subs.get(args[0]); return r ? Object.assign({ email: args[0] }, r) : null; }
          if (/FROM subscribers WHERE unsub_token/.test(sql)) { for (const [e, r] of subs) if (r.unsub_token === args[0]) return { email: e, status: r.status }; return null; }
          return null;
        },
        async all() {
          if (/FROM subscribe_funnel/.test(sql)) return { results: Object.keys(counts).map((k) => ({ stage: k.split("|")[0], source: k.split("|")[1], n: counts[k] })) };
          return { results: [] };
        },
        async run() {
          writes.push(sql);
          if (/INSERT INTO subscribe_funnel/.test(sql)) { const k = args[0] + "|" + args[1]; counts[k] = (counts[k] || 0) + 1; return { meta: { changes: 1 } }; }
          if (/INSERT INTO subscribers/.test(sql)) { if (!subs.has(args[0])) subs.set(args[0], { status: "pending", unsub_token: args[2], mailed_recently: 0 }); return { meta: { changes: 1 } }; }
          if (/UPDATE subscribers SET welcomed_at/.test(sql)) { const r = subs.get(args[0]); if (r) r.mailed_recently = 1; return { meta: { changes: 1 } }; }
          if (/UPDATE subscribers SET status='subscribed'/.test(sql)) { for (const r of subs.values()) if (r.unsub_token === args[0]) r.status = "subscribed"; return { meta: { changes: 1 } }; }
          return { meta: { changes: 0 } };
        }
      };
      return s;
    }
  };
  const SEND_EMAIL = { async send(m) { if (opts.failSend) throw new Error("E_DELIVERY_FAILED"); sends.push(m); return { messageId: "m" + sends.length }; } };
  return { env: { AUDIT: db, LIVING: db, SEND_EMAIL, SUBSCRIBERS_TOKEN: opts.token }, subs, counts, sends, writes };
}
const ctx = { waitUntil() {} };
const UA = "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0";
const call = (env, path, init) => worker.fetch(new Request("https://qnfo-subscribers.q08.workers.dev" + path, Object.assign({ headers: { "User-Agent": UA } }, init)), env, ctx);
const post = (env, body, extra) => call(env, "/subscribe", { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "User-Agent": UA, "X-Forwarded-For": "203.0.113.9" }, extra || {}), body: JSON.stringify(body) });

// version: a minimum, never an exact value
{
  const m = src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/);
  ok(m && (Number(m[1]) > 1 || (Number(m[1]) === 1 && Number(m[2]) >= 2)), "VERSION is at least 1.2.0", m && m[0]);
}

// accepted sign-up: counted as submit and confirm_mail_sent, one mail
{
  const t = makeEnv();
  const r = await post(t.env, { email: "Reader@Example.edu", source: "papers" });
  const j = await r.json();
  ok(r.status === 200 && j.ok && j.pending && j.confirmation_sent, "an accepted sign-up answers ok with a mail sent", j);
  ok(t.sends.length === 1 && t.sends[0].to === "reader@example.edu", "one confirmation mail", t.sends.length);
  ok(t.counts["submit|papers"] === 1 && t.counts["confirm_mail_sent|papers"] === 1, "submit and mail are counted by source", t.counts);
  ok(!JSON.stringify(t.counts).includes("example.edu") && !JSON.stringify(t.counts).includes("203.0.113"), "the counter holds no address and no IP");
  // the same address again within the hour: no second mail
  const r2 = await post(t.env, { email: "reader@example.edu", source: "papers" });
  const j2 = await r2.json();
  ok(r2.status === 200 && j2.ok && j2.pending && j2.confirmation_sent === false && j2.already_sent === true, "a repeat within the hour answers ok without a mail", j2);
  ok(t.sends.length === 1 && t.counts["submit_repeat|papers"] === 1 && t.counts["submit|papers"] === 1, "the repeat sends nothing and is counted apart", t.counts);
}

// the mail cannot be sent: the visitor is told, the row stays pending
{
  const t = makeEnv({ failSend: true });
  const r = await post(t.env, { email: "a@example.org", source: "qnfo.org" });
  const j = await r.json();
  ok(r.status === 502 && j.ok === false && /could not send/i.test(j.error), "a failed confirmation mail is an error, not 'check your inbox'", j);
  ok(t.counts["confirm_mail_failed|qnfo.org"] === 1 && !t.counts["confirm_mail_sent|qnfo.org"], "the failure is counted", t.counts);
  ok(t.subs.get("a@example.org").status === "pending" && t.subs.get("a@example.org").mailed_recently === 0, "the row stays pending and may be retried at once");
}

// outcomes that never mail
{
  const t = makeEnv({ suppressed: ["s@example.org"], subs: [["c@example.org", { status: "subscribed", unsub_token: "tok-c", mailed_recently: 0 }]] });
  const hp = await (await post(t.env, { email: "x@example.org", website: "http://spam", source: "qnfo.org" })).json();
  ok(hp.ok === true && t.counts["submit_honeypot|qnfo.org"] === 1, "a honeypot hit is counted", t.counts);
  const bad = await post(t.env, { email: "not-an-address", source: "qnfo.org" });
  ok(bad.status === 400 && t.counts["submit_invalid|qnfo.org"] === 1, "an invalid address is counted");
  await post(t.env, { email: "s@example.org", source: "qnfo.org" });
  ok(t.counts["submit_suppressed|qnfo.org"] === 1, "a suppressed address is counted");
  const c = await (await post(t.env, { email: "c@example.org", source: "qnfo.org" })).json();
  ok(c.ok && c.pending === false && t.counts["submit_already_confirmed|qnfo.org"] === 1, "a confirmed address is not asked again", c);
  ok(t.sends.length === 0, "none of these sends a mail", t.sends.length);
  const rl = makeEnv({ ipCount: 5 });
  const r = await post(rl.env, { email: "y@example.org", source: "qnfo.org" });
  ok(r.status === 429 && rl.counts["submit_rate_limited|qnfo.org"] === 1 && rl.sends.length === 0, "the per-network limit still holds and is counted");
  await post(t.env, { email: "z@example.org", source: "<script>Evil Source!</script>" });
  ok(Object.keys(t.counts).every((k) => /^[a-z_]+\|[a-z0-9._-]{1,40}$/.test(k)), "a source is reduced to a short safe label", Object.keys(t.counts));
}

// the sign-up page: a view is counted for a person, not for a declared bot; a form post is answered with a page
{
  const t = makeEnv();
  const r = await call(t.env, "/subscribe?utm_source=linkedin", { method: "GET" });
  const h = await r.text();
  ok(r.status === 200 && /<form method="post" action="\/subscribe"/.test(h) && /name="email"/.test(h) && /name="source" value="linkedin"/.test(h), "GET /subscribe is a form that posts to this worker");
  ok(/weekly digest/.test(h) && /confirm/.test(h) && /unsubscribe/.test(h), "the page states the cadence, the double opt-in and the unsubscribe");
  ok(t.counts["page_view|linkedin"] === 1, "the view is counted by source", t.counts);
  await call(t.env, "/subscribe", { method: "GET", headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } });
  ok(t.counts["page_view_bot|subscribe-page"] === 1 && t.counts["page_view|linkedin"] === 1, "a declared bot is counted apart", t.counts);
  const f = await call(t.env, "/subscribe", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA }, body: "email=form%40example.org&hp=&source=linkedin" });
  const fh = await f.text();
  ok(f.status === 200 && /text\/html/.test(f.headers.get("Content-Type")) && /Check your inbox/.test(fh), "a form post is answered with a page", f.status);
  ok(t.sends.length === 1 && t.counts["submit|linkedin"] === 1, "the form post signs up like the JSON post", t.counts);
  const fb = await call(t.env, "/subscribe", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA }, body: "email=nope&source=linkedin" });
  ok(/valid email/.test(await fb.text()), "a bad address on the form shows the form again with the reason");
  const v = await call(t.env, "/funnel/view?source=papers", { method: "POST" });
  ok(v.status === 204 && t.counts["box_view|papers"] === 1, "another surface can report a view of its box", t.counts);
}

// confirm page and confirmation are counted; GET /funnel reports the funnel and its largest leak
{
  const t = makeEnv({ subs: [["p@example.org", { status: "pending", unsub_token: "tok-p", mailed_recently: 1 }]] });
  await call(t.env, "/confirm?token=tok-p", { method: "GET" });
  await call(t.env, "/confirm?token=tok-p", { method: "POST" });
  ok(t.counts["confirm_page|email"] === 1 && t.counts["confirmed|email"] === 1, "confirm page and confirmation are counted", t.counts);
  ok(t.subs.get("p@example.org").status === "subscribed", "the POST still confirms");
}
{
  const s = mod.funnelSummary([{ stage: "box_view", source: "papers", n: 400 }, { stage: "page_view", source: "linkedin", n: 100 }, { stage: "submit", source: "papers", n: 5 },
    { stage: "confirm_mail_sent", source: "papers", n: 5 }, { stage: "confirm_page", source: "email", n: 4 }, { stage: "confirmed", source: "email", n: 3 }, { stage: "submit_honeypot", source: "papers", n: 9 }]);
  ok(s.stages.submit === 5 && s.stages.submit_honeypot === 9 && s.by_source.papers.box_view === 400, "the summary totals stages and sources");
  ok(s.largest_leak && s.largest_leak.step === "view -> submit" && s.largest_leak.rate === 0.01, "the largest leak is the step with the lowest pass-through", s.largest_leak);
  ok(mod.funnelSummary([]).largest_leak === null, "no data names no leak");
  const t = makeEnv();
  await post(t.env, { email: "q@example.org", source: "papers" });
  const r = await call(t.env, "/funnel", { method: "GET" });
  const j = await r.json();
  ok(r.status === 200 && j.window_days === 30 && j.stages.submit === 1 && Array.isArray(j.steps) && Array.isArray(j.limits), "GET /funnel is open and returns counts", j);
  ok(!JSON.stringify(j).includes("q@example.org"), "GET /funnel shows no address");
}

// the digest route still accepts its token, in constant time
{
  ok(await mod.safeEqual("secret-token", "secret-token") && !(await mod.safeEqual("secret-token", "secret-tokem")) && !(await mod.safeEqual("a", "secret-token")), "safeEqual compares whole values");
  const t = makeEnv({ token: "tok-digest" });
  const bad = await call(t.env, "/run/digest", { method: "POST", headers: { Authorization: "Bearer wrong" } });
  const good = await call(t.env, "/run/digest", { method: "POST", headers: { Authorization: "Bearer tok-digest" } });
  ok(bad.status === 401 && good.status === 200, "the digest token is still accepted and a wrong one refused", [bad.status, good.status]);
  ok(!/token !== env\.SUBSCRIBERS_TOKEN/.test(src) && !/Math\.random\(/.test(src), "no direct secret comparison and no Math.random id");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
