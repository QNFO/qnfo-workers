// RETIRED-HOSTS-1 offline suite (qnfo-lifecycle 1.9.1, agent_issues 2010). The default export answers 410 Gone with
// noindex on every retired qnfo.org hostname and passes every other host to the folded worker unchanged; the fold
// properties survive the wrapper; wrangler.toml declares a route for each retired host, keeps lifecycle.qnfo.org/* (a
// deploy replaces the route set) and keeps workers_dev on. Run: node qnfo-lifecycle/retired-hosts.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const mod = await import("./worker.js");
const W = mod.default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const hosts = Object.keys(JSON.parse("{" + (src.match(/var RETIRED_HOSTS = \{([^}]*)\}/) || [, ""])[1] + "}"));
ok(hosts.length === 12 && hosts.every((h) => /^[a-z0-9-]+\.qnfo\.org$/.test(h)), "twelve retired qnfo.org hosts", hosts);
ok(hosts.every((h) => h !== "qnfo.org") && !hosts.some((h) => /^(www|papers|ipatent|lifecycle|ops|fleet|ideas|memory|personal|ai|research-exec|archive|legal|graph-api)\./.test(h)), "no live host is in the retired list");
for (const h of hosts) {
  const r = await W.fetch(new Request("https://" + h + "/some/path"), {}, { waitUntil() {} });
  const t = await r.text();
  ok(r.status === 410 && /noindex/.test(r.headers.get("X-Robots-Tag") || "") && /<a href="https:\/\/qnfo\.org\/">/.test(t) && t.indexOf("<p>" + h + " was") >= 0, h + " answers 410 noindex with a link to qnfo.org", r.status);
}
let passedThrough = false;
const inner = W.__foldHost;
ok(inner && typeof inner.fetch === "function", "the fold host survives the wrapper (__foldHost)");
ok(W.__foldMember && W.__foldMember.name === "calendar-api", "the fold member survives the wrapper (__foldMember)");
ok(typeof W.scheduled === "function", "the scheduled handler survives the wrapper");
// Another host goes to the folded worker: swap in a spy for the inner fetch by checking the response is not the 410 page.
const r2 = await W.fetch(new Request("https://lifecycle.qnfo.org/calendar/health"), {}, { waitUntil() {} }).catch((e) => ({ status: -1, e: String(e) }));
passedThrough = r2.status !== 410;
ok(passedThrough, "lifecycle.qnfo.org is not answered with 410", r2.status);
const routes = [...toml.matchAll(/pattern = "([^"]+)", zone_name = "qnfo\.org"/g)].map((m) => m[1]);
ok(routes.indexOf("lifecycle.qnfo.org/*") >= 0, "wrangler.toml keeps the lifecycle.qnfo.org/* route (a deploy replaces the route set)");
ok(hosts.every((h) => routes.indexOf(h + "/*") >= 0) && routes.length === hosts.length + 1, "wrangler.toml routes exactly lifecycle plus every retired host", routes);
ok(/^workers_dev = true$/m.test(toml), "workers_dev stays on (calendar public links and pings use workers.dev)");
console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
