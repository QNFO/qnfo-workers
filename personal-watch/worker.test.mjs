// personal-watch offline suite. Run: node personal-watch/worker.test.mjs
import worker from "./worker.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const h = await (await worker.fetch(new Request("https://watch.test/health"))).json();
ok(h.worker === "personal-watch" && /^\d+\.\d+\.\d+/.test(h.version), "health names worker and version");
const r = await worker.fetch(new Request("https://watch.test/"));
ok(r.status === 302 && r.headers.get("location") === "https://rwnq8.github.io/tv/", "root redirects to the GitHub Pages player");
console.log(`personal-watch: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
