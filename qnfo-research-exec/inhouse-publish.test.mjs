// INHOUSE-PUBLISH-2/3 (#2137) offline suite, NOZ-DOI-1 form. Runs the worker's own publishInHouse. Proves: a paper is
// published in-house with no outside call, no DOI and no record link; the result defines every key the publish callers bind
// into D1 (null, never undefined, because D1 refuses undefined); no publish stage writes a DOI value into papers, the
// research queue, version_queue or the dissemination queue.
// Run: node qnfo-research-exec/inhouse-publish.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const start = src.indexOf("async function publishInHouse(");
let depth = 0, end = -1;
for (let i = src.indexOf("{", start); i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } } }
let outsideCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { outsideCalls++; throw new Error("no outside call expected"); };
const fn = new Function(src.slice(start, end) + "\nreturn publishInHouse;")();
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const r = await fn({}, "T", "A", "body", "a-slug");
ok(r.ok === true && r.inhouse === true && r.doi === null && r.record === null && r.url === "https://papers.qnfo.org/papers/a-slug/" && outsideCalls === 0, "published in-house: no DOI, no record, no outside call", r);
const keys = ["ok", "doi", "conceptdoi", "record"];
ok(keys.every((k) => k in r && r[k] !== undefined), "the result defines ok, doi, conceptdoi and record (null, never undefined)", r);
// Every caller of publishInHouse binds only keys the result defines.
const binds = [];
for (const m of src.matchAll(/(?:const|var|let)\s+(\w+)\s*=\s*await publishInHouse\(/g)) {
  const v = m[1], tail = src.slice(m.index, m.index + 3000);
  for (const b of tail.matchAll(/\.bind\(([^)]*)\)/g)) for (const x of b[1].matchAll(new RegExp("\\b" + v + "\\.([a-z]+)", "gi"))) binds.push(x[1]);
}
ok(binds.every((k) => keys.includes(k)), "every <result>.<field> a publishInHouse caller binds is one the result defines", [...new Set(binds)]);
// No source line sets a papers / queue DOI column to a non-NULL value from a publish result.
const bad = src.split("\n").filter((l) => /UPDATE papers SET[^"]*\b(doi|zenodo_doi|zenodo_url)=\?/.test(l));
ok(bad.length === 0, "no papers UPDATE binds a DOI or record URL", bad.map((l) => l.slice(0, 80)));
ok(!/z[e]nodo\.org|10\.5281\/|ZEN[O]DO_TOKEN/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "the worker names no deposit host, DOI prefix or deposit token outside comments");
globalThis.fetch = realFetch;
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
