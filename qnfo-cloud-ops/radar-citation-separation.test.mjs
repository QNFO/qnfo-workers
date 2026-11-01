import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const start = source.indexOf("async function jobRadar(env) {");
const end = source.indexOf('__name(jobRadar, "jobRadar");', start);
assert.ok(start >= 0 && end > start, "jobRadar is present");

const insertedSources = [];
const context = vm.createContext({
  SE_SEARCH_URL: "https://api.stackexchange.test/search",
  radarStatus: () => "ok",
  seFailureNote: () => "http:500",
  fetch: async (url) => {
    if (String(url).startsWith("https://hn.algolia.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hits: String(url).includes("restrictSearchableAttributes")
            ? []
            : [{ title: "QNFO mentioned independently", url: "https://example.test/mention" }]
        })
      };
    }
    if (String(url).startsWith("https://lobste.rs")) {
      return { ok: true, status: 200, text: async () => "<rss></rss>" };
    }
    return { ok: true, status: 200, json: async () => ({ items: [] }) };
  }
});
const jobRadar = vm.runInContext(source.slice(start, end) + "\njobRadar;", context);
const env = {
  AUDIT: {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            all: async () => ({
              results: [{ doi: "10.5281/example", cites: 2, at: "2026-11-01T00:00:00Z" }]
            }),
            run: async () => {
              if (sql.startsWith("INSERT OR IGNORE INTO external_mentions")) {
                insertedSources.push(values[1]);
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            }
          };
        },
        run: async () => ({ meta: { changes: 0 } })
      };
    }
  }
};

const result = await jobRadar(env);
assert.deepEqual(insertedSources, ["hn"]);
assert.equal(result.notes.sources.citations, "ok:1");
assert.equal(result.notes.new_mentions, 1);
console.log("citation feeds stay separate while external mentions are retained");
