// personal-watch offline suite. Run: node personal-watch/worker.test.mjs
// Proves: health names the worker, the page client script parses, the queue interleaves sources from stubbed feeds, a mood filters.
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const config = readFileSync(join(here, "wrangler.toml"), "utf8");
const traces = config.split(/^\s*\[/m).find((section) => section.startsWith("observability.traces]")) || "";
ok(/^enabled\s*=\s*true\s*$/m.test(traces), "Workers traces are explicitly enabled, not just logs");

const yt = (n) => "<feed>" + [1, 2, 3, 4].map((i) => `<entry><yt:videoId>${n}${i}</yt:videoId><title>${n} t${i}</title></entry>`).join("") + "</feed>";
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes("youtube.com/feeds")) return new Response(yt(url.slice(-6)));
  if (url.includes("vimeo.com")) return new Response("<rss><item><title>V</title><link>https://vimeo.com/channels/staffpicks/123</link></item></rss>");
  if (url.includes("archive.org")) return new Response(JSON.stringify({ response: { docs: [{ identifier: "a1", title: "A" }] } }));
  return new Response("", { status: 404 });
};

const h = await (await w.fetch(new Request("https://x/health"))).json();
ok(h.worker === "personal-watch" && /^\d+\.\d+\.\d+/.test(h.version), "health names worker and version");
const page = await (await w.fetch(new Request("https://x/"))).text();
let parses = true; try { new Function(page.match(/<script>([\s\S]*)<\/script>/)[1]); } catch (e) { parses = false; }
ok(parses, "page client script parses");
const q = (await (await w.fetch(new Request("https://x/api/queue"))).json()).queue;
ok(q.some((v) => v.src === "youtube") && q.some((v) => v.src === "vimeo" && v.id === "123") && q.some((v) => v.src === "archive"), "queue mixes youtube, vimeo, archive");
ok(q.slice(1).every((v, i) => v.by !== q[i].by) || q.length < 3, "no source twice in a row");
const calm = (await (await w.fetch(new Request("https://x/api/queue?mood=calm"))).json()).queue;
ok(calm.length > 0 && calm.every((v) => v.mood === "calm"), "mood filter holds");
ok((await w.fetch(new Request("https://x/nope"))).status === 404, "unknown path 404");
console.log(`personal-watch: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
