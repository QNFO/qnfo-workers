// FILING-2: the daily pass files a newly published paper on a shelf AND tags it, with no human step. Proves:
// the tag vocabulary comes from tag_registry (not a literal), invented tags are dropped, the pass is bounded,
// an already-filed paper is not touched, and orphan tag rows are swept.
// Run: node qnfo-gateway/tags-auto.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "gwa-"));
writeFileSync(join(dir, "w.mjs"), readFileSync(join(here, "worker.js"), "utf8") +
  "\nexport { fileUnreadPapers, tagSystemPrompt };\n");
const W = await import(pathToFileURL(join(dir, "w.mjs")).href);

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 200))); } };

const REGISTRY = [
  { tag: "ultrametric", kind: "method", description: "Non-Archimedean geometry" },
  { tag: "error-correction", kind: "topic", description: "Codes, fault tolerance" },
  { tag: "quantum-foundations", kind: "topic", description: "Measurement and interpretation" },
  { tag: "platform-selection", kind: "use", description: "Judging a vendor or platform" }
];

// three public papers: one fully filed, one with a shelf but no tags, one with neither
function makeWorld() {
  return {
    papers: [
      { slug: "filed", title: "A filed paper", abstract: "ultrametric codes", created_at: "2026-10-18", status: "published" },
      { slug: "shelf-only", title: "Shelf but no tags", abstract: "error correction in qubits", created_at: "2026-10-17", status: "published" },
      { slug: "new", title: "A brand new paper on p-adic error correction", abstract: "error correction on trees", created_at: "2026-10-18", status: "published" }
    ],
    category: [{ slug: "filed", category: "mathematics" }, { slug: "shelf-only", category: "qec" }],
    tags: [{ slug: "filed", tag: "ultrametric", rank: 0 }, { slug: "orphan-slug", tag: "retired-tag", rank: 0 }],
    inserts: { category: [], tag: [], deletes: 0 }
  };
}

function makeEnv(world, opts = {}) {
  const calls = [];
  const d1 = {
    prepare(sql) {
      const st = {
        _args: [],
        bind(...a) { st._args = a; return st; },
        async all() {
          if (/FROM tag_registry/.test(sql)) return { results: REGISTRY.slice() };
          if (/NOT EXISTS \(SELECT 1 FROM paper_category/.test(sql)) {
            const have = new Set(world.category.map(c => c.slug));
            return { results: world.papers.filter(p => !have.has(p.slug)).slice(0, st._args[0] || 12) };
          }
          if (/NOT EXISTS \(SELECT 1 FROM paper_tag/.test(sql)) {
            const have = new Set(world.tags.map(t => t.slug));
            return { results: world.papers.filter(p => !have.has(p.slug)).slice(0, st._args[0] || 12) };
          }
          return { results: [] };
        },
        async first() { return { n: world.papers.length }; },
        async run() {
          if (/DELETE FROM paper_tag WHERE tag NOT IN/.test(sql)) { world.inserts.deletes++; return { meta: { changes: 1 } }; }
          return { meta: { changes: 0 } };
        }
      };
      return st;
    },
    async batch(stmts) {
      for (const s of stmts || []) {
        if (/INSERT INTO paper_category/.test(s._sql || "")) world.inserts.category.push(s._args);
        else if (/INSERT INTO paper_tag/.test(s._sql || "")) world.inserts.tag.push(s._args);
      }
      return [];
    }
  };
  // tag the prepared statements so batch() can tell them apart
  const origPrepare = d1.prepare;
  d1.prepare = function(sql) {
    const st = origPrepare.call(d1, sql);
    const ob = st.bind;
    st.bind = function(...a) { st._args = a; st._sql = sql; return st; };
    st._sql = sql;
    return st;
  };
  const env = {
    LIVING_PAPER: d1,
    AI: {
      async run(model, body) {
        const sys = body.messages[0].content;
        const user = body.messages[1].content;
        calls.push({ sys, user });
        const n = (user.match(/^\d+\./gm) || []).length;
        const items = [];
        if (/SHELVES/.test(sys)) {
          for (let i = 0; i < n; i++) items.push({ i, primary: "qec", secondary: ["mathematics"], confidence: 80, why: "codes" });
        } else {
          for (let i = 0; i < n; i++) items.push({ i, tags: ["error-correction", "ultrametric", "not-a-real-tag", "platform-selection"] });
        }
        return { response: { items } };
      }
    }
  };
  if (opts.noAI) env.AI = undefined;
  return { env, calls };
}

// 1. the tag prompt is built from the registry, not a literal list
const prompt = W.tagSystemPrompt({ "ultrametric": REGISTRY[0], "error-correction": REGISTRY[1], "platform-selection": REGISTRY[3] });
ok(prompt.includes("ultrametric (method) - Non-Archimedean geometry"), "prompt lists the registry tag with its kind and meaning");
ok(prompt.includes("platform-selection (use)"), "prompt groups the use tags");
ok(prompt.includes("METHOD") && prompt.includes("USE"), "prompt names the kinds");

// 2. a run files the shelf and the tags for the unfiled papers
const world = makeWorld();
const { env, calls } = makeEnv(world);
const res = await W.fileUnreadPapers(env, 24);
ok(res.filed === 1, "the unshelved paper was filed", res);
ok(world.inserts.category.length === 1 && world.inserts.category[0][0] === "new", "the shelf row is for the new paper", world.inserts.category);
ok(world.inserts.tag.length >= 2, "the untagged papers were tagged", world.inserts.tag.length);
const taggedSlugs = [...new Set(world.inserts.tag.map(a => a[0]))].sort();
ok(taggedSlugs.join() === "new,shelf-only", "only papers with no tags were tagged", taggedSlugs);
ok(!world.inserts.tag.some(a => a[1] === "not-a-real-tag"), "a tag the model invented is dropped");
ok(world.inserts.tag.every(a => REGISTRY.some(r => r.tag === a[1])), "only registry tags are written");
ok(world.inserts.tag.filter(a => a[0] === "shelf-only").length === 3, "at most the registry-valid tags are stored per paper", world.inserts.tag.filter(a => a[0] === "shelf-only"));
ok(calls.length === 2, "one model call for the shelf batch and one for the tag batch", calls.length);
ok(world.inserts.deletes === 1, "the orphan sweep ran");

// 3. nothing left to do is a no-op, and a missing AI binding is handled
const done = makeEnv(makeWorld());
done.env.LIVING_PAPER.prepare = ((orig) => function(sql) {
  const st = orig.call(this, sql);
  if (/NOT EXISTS \(SELECT 1 FROM paper_category/.test(sql)) st.all = async () => ({ results: [] });
  if (/NOT EXISTS \(SELECT 1 FROM paper_tag/.test(sql)) st.all = async () => ({ results: [] });
  return st;
})(done.env.LIVING_PAPER.prepare);
const noop = await W.fileUnreadPapers(done.env, 24);
ok(noop.filed === 0 && noop.tagged === 0, "a fully filed corpus does nothing", noop);
const noAI = await W.fileUnreadPapers(makeEnv(makeWorld(), { noAI: true }).env, 24);
ok(noAI.filed === 0 && /binding/.test(noAI.reason || ""), "a missing AI binding is reported, not thrown", noAI);

console.log(`\nFILING-2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
