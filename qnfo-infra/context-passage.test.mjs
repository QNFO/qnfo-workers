// SOURCE-VOICE-1 offline suite (qnfo-infra 1.4.0, agent_issues 2468). Proves:
//  1. a PAPER_VZ hit in retrieveRecords carries the body passage that matched (the indexer's chunk), after the abstract;
//  2. a paper with a NULL abstract still carries its passage (it reached qnfo-ai as its title alone before);
//  3. the enrichment no longer throws (isZenodoId was defined only inside the indexer member: every hit read "enrich error");
//  4. a retired registrar DOI is still hidden.
// Run: node qnfo-infra/context-passage.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { retrieveRecords as __rr, paperHitPassage as __php, indexerMod as __im };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

const intro = "Introduction text about rational measurement. ".repeat(30);
const target = "MATCHED PASSAGE: every measurement outcome is a finite-precision rational number by the Bekenstein bound. ".repeat(8);
const body = "# The Q-vs-R Question\n\n## 1. Introduction\n\n" + intro + "\n\n## 2. Measurement Finitude\n\n" + target + "\n\n## 3. More\n\n" + "Tail text. ".repeat(200);
const chunks = mod.__im.chunkText(body);
const idx = chunks.findIndex((c) => c.includes("MATCHED PASSAGE"));
ok(idx > 0, "the fixture's passage lands in a later chunk", idx);

const rows = {
  "qnr-justification-memo": { identifier: "qnr", title: "The Q-vs-R Question", authors: "[]", doi: null, slug: "qnr-justification-memo", status: "published", abstract: null, body_md: body },
  "with-abstract": { identifier: "wa", title: "With Abstract", authors: "[]", doi: "10.5281/zenodo.123", slug: "with-abstract", status: "published", abstract: "A stored abstract of the paper.", body_md: body }
};
const env = {
  AI: { async run() { return { data: [new Array(768).fill(0.1)] }; } },
  PAPER_VZ: { async query() { return { matches: [{ id: "a", score: 0.9, metadata: { slug: "qnr-justification-memo", chunk: String(idx), total: String(chunks.length) } }, { id: "b", score: 0.8, metadata: { slug: "with-abstract", chunk: "999" } }] }; } },
  LIVING: { prepare() { let a = []; const o = { bind(...x) { a = x; return o; }, async first() { return rows[a[0]] || null; } }; return o; } }
};
const out = await mod.__rr(env, "is measurement rational?", "research", 4);
const hits = out.sources.PAPER_VZ || out.sources["PAPER_VZ"];
const texts = JSON.stringify(out);
ok(!/enrich error/.test(texts), "enrichment no longer throws", texts.slice(0, 300));
ok(/MATCHED PASSAGE: every measurement outcome/.test(texts), "the NULL-abstract paper carries the passage that matched", texts.slice(0, 400));
ok(/A stored abstract of the paper\. — /.test(texts), "a stored abstract leads the passage");
ok(!/10\.5281/.test(JSON.stringify(hits || out).replace(/"meta":\{[^}]*\}/g, "")) || !/DOI 10\.5281/.test(texts), "a retired registrar DOI is not shown", texts.slice(0, 300));
ok(mod.__php({ abstract: "", body_md: "" }, 0) === "", "an empty row gives an empty passage");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
