// FLEET-CTL-STATIC-1 offline test (issues 1776, 1777): every iPatent page carries the owner's fleet command-line link as static
// HTML pointing at its own URL, loads no remote fleet script (the pages hold unfiled disclosure text), and the generated
// disclosure document carries no link at all.
// Run: node qnfo-ipatent/fleet-link.test.mjs
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const env = { IPATENT_DB: { prepare: () => { const q = { bind() { return q; }, async all() { return { results: [] }; }, async run() { return {}; }, async first() { return null; } }; return q; } } };
const ctx = { waitUntil() {} };
const UA = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const get = async (p) => { const r = await worker.fetch(new Request("https://ipatent.qnfo.org" + p, { headers: { "User-Agent": UA } }), env, ctx); return { status: r.status, html: await r.text() }; };
for (const p of ["/", "/guide", "/example", "/guide/before-you-publish"]) {
  const { status, html } = await get(p);
  const links = html.match(/<a id="fleet-ctl" href="([^"]+)"/g) || [];
  const href = (html.match(/<a id="fleet-ctl" href="([^"]+)"/) || [])[1] || "";
  ok(status === 200 && links.length === 1, p + ": exactly one fleet link", { status, n: links.length });
  ok(href === "https://fleet.qnfo.org/cmd?from=" + encodeURIComponent("https://ipatent.qnfo.org" + (p === "/" ? "/" : p)), p + ": the link opens the command line scoped to this page", href);
  ok(!/fleet\.qnfo\.org\/ctl\.js/.test(html), p + ": no remote fleet script on a page that holds disclosure text");
  ok(html.indexOf('id="fleet-ctl"') < html.lastIndexOf("</body>") && html.indexOf('id="fleet-ctl"') > html.lastIndexOf("</script>") - 1e9, p + ": the link sits before </body>");
}
const src = readFileSync(join(here, "worker.js"), "utf8");
const doc = src.slice(src.indexOf("function generateHtmlDocument("), src.indexOf("\n}\n", src.indexOf("function generateHtmlDocument(")));
ok(doc.length > 100 && !/fleetCtlLink|fleet-ctl|fleet\.qnfo\.org/.test(doc), "the generated disclosure document (saved and printed by the inventor) carries no fleet link");
ok(!/[^\x00-\x7F]/.test(src.slice(src.indexOf("function fleetCtlLink("), src.indexOf("function escapeHtml("))), "the helper is ASCII");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
