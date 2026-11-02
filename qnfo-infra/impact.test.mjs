// CITATION-TRACKING-ALL-DOIS-1: offline regression for complete, stable DOI pagination.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { indexerMod as __member };\n").toString("base64"));
const papers = Array.from({ length: 217 }, (_, i) => ({
  slug: "paper-" + String(i).padStart(3, "0"),
  doi: "10.1000/test-" + String(i).padStart(3, "0"),
  created_at: i < 167 ? "2026-10-01 00:00:00" : null
}));
const writes = { citations: [], scores: [] };
let pageReads = 0;

const audit = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async run() {
        if (sql.includes("INSERT OR REPLACE INTO citation_stats")) writes.citations.push(args);
        if (sql.includes("INSERT OR REPLACE INTO impact_scores")) writes.scores.push(args);
        return { success: true };
      },
      async all() { return { results: [] }; },
      async first() { return null; }
    };
  }
};
const living = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return { c: papers.length }; },
      async all() {
        pageReads++;
        const [cursorStarted, cursorHasTimestamp, cursorCreatedAt, cursorSlug, pageSize] = args;
        const ordered = papers.slice().sort((a, b) => {
          if (a.created_at === null && b.created_at !== null) return 1;
          if (a.created_at !== null && b.created_at === null) return -1;
          if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
          return a.slug.localeCompare(b.slug);
        });
        const remaining = !cursorStarted
          ? ordered
          : cursorHasTimestamp
            ? ordered.filter((p) => p.created_at === null || p.created_at < cursorCreatedAt || (p.created_at === cursorCreatedAt && p.slug > cursorSlug))
            : ordered.filter((p) => p.created_at === null && p.slug > cursorSlug);
        return { results: remaining.slice(0, pageSize) };
      }
    };
  }
};

const originalFetch = globalThis.fetch;
let sourceCalls = 0;
globalThis.fetch = async (input) => {
  sourceCalls++;
  const url = new URL(input);
  if (url.hostname === "api.crossref.org") {
    return Response.json({ message: { "is-referenced-by-count": 2 } });
  }
  if (url.hostname === "api.openalex.org") {
    return Response.json({ cited_by_count: 3 });
  }
  throw new Error("unexpected host " + url.hostname);
};

try {
  const response = await mod.__member.fetch(new Request(
    "https://qnfo-infra.q08.workers.dev/run?commit=1&limit=50",
    { headers: { Authorization: "Bearer impact-test-token" } }
  ), { LIVING_PAPER: living, QNFO_AUDIT: audit, IMPACT_TOKEN: "impact-test-token" }, {});
  const result = await response.json();
  if (response.status !== 200) throw new Error("expected success, received " + response.status);
  if (result.papers !== papers.length) throw new Error("collected " + result.papers + " of " + papers.length + " DOI records");
  if (result.stats.length !== papers.length || result.errors.length) throw new Error("incomplete stats or errors in result");
  if (writes.scores.length !== papers.length || writes.citations.length !== papers.length * 2) throw new Error("not every DOI was persisted from both sources");
  if (sourceCalls !== papers.length * 2 || pageReads !== 5) throw new Error("unexpected external calls or page count, including the null-timestamp cursor page");
  if (writes.scores.some((row) => row[1] !== 5)) throw new Error("citation scores were not aggregated from both providers");
  console.log("citation impact tests passed: all " + papers.length + " DOIs collected across " + pageReads + " pages, including 50 with null created_at");
} finally {
  globalThis.fetch = originalFetch;
}
