// MIND-DOI-FIX-1 (q08-mind 2.2.1): the source link of an entry must be the record the entry cites.
//
// 2026-10-21: two entries linked the wrong record. doris-situationism pointed at 10.1017/CBO9780511613292, which has no
// Crossref record (404); neff-compassion pointed at 10.1037/0022-3514.84.4.822, which is Brown and Ryan on mindfulness.
// Nothing in CI compared a link with its citation, so both shipped. This suite pins the two repaired entries to the Crossref
// record (title, first author, year) read from api.crossref.org on 2026-10-26, checks that the worker renders those links on
// /q/<slug> and /api/entries.json (the entry pages are built from data/entries-*.json, nothing is inlined), and checks the
// corpus shape the issues' definition of done names. No network: the Crossref facts are the pins below.
//
// To pin another entry: read https://api.crossref.org/works/<doi>, copy the title, first author's family name and year, and
// add a row. The row is evidence, not a target: when the entry's own title or author differs from Crossref, fix the entry.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const A = JSON.parse(read("data/entries-a.json"));
const B = JSON.parse(read("data/entries-b.json"));
const ALL = [...A, ...B];
const BY_SLUG = new Map(ALL.map((e) => [e.s, e]));

// Crossref, read 2026-10-26. `wrong` lists DOIs that were or could be mistaken for this entry's record, with why.
const PINS = {
  "doris-situationism": {
    file: A,
    doi: "10.1017/cbo9781139878364",
    title: "Lack of Character",
    family: "Doris",
    year: "2002",
    wrong: { "10.1017/cbo9780511613292": "no Crossref record (404)" },
  },
  "neff-compassion": {
    file: B,
    doi: "10.1080/15298860309027",
    title: "The Development and Validation of a Scale to Measure Self-Compassion",
    family: "Neff",
    year: "2003",
    wrong: {
      "10.1037/0022-3514.84.4.822": "Brown and Ryan, The benefits of being present (mindfulness)",
      "10.1080/15298860309032": "Neff, Self-Compassion: An Alternative Conceptualization of a Healthy Attitude Toward Oneself, a different paper",
    },
  },
};

// ---- corpus shape (the issues' definition of done) -------------------------------------------------------------------
// Minimums, not equalities: the reading list may grow, it may not lose the entries these issues repaired.
assert.ok(A.length >= 18, "entries-a.json keeps at least its 18 entries");
assert.ok(B.length >= 18, "entries-b.json keeps at least its 18 entries");
assert.equal(BY_SLUG.size, ALL.length, "no two entries share a slug");
assert.ok(BY_SLUG.size >= 36, "at least the 36 slugs of 2.2.0 remain");
for (const e of ALL) if (e.n) assert.ok(BY_SLUG.has(e.n), `${e.s}: n points at a slug that exists (${e.n})`);
const links = ALL.map((e) => String(e.l || "").toLowerCase()).filter(Boolean);
assert.equal(new Set(links).size, links.length, "no two entries share one source link");

// ---- each pinned entry cites the record its link resolves to ----------------------------------------------------------
for (const [slug, pin] of Object.entries(PINS)) {
  const e = BY_SLUG.get(slug);
  assert.ok(e, `${slug} exists`);
  assert.ok(pin.file.includes(e), `${slug} lives in the file the issue names`);
  assert.equal(e.l, "https://doi.org/" + pin.doi, `${slug}: l is the verified DOI`);
  assert.ok(e.w.toLowerCase().startsWith(pin.title.toLowerCase()), `${slug}: the entry's title (${e.w}) is the Crossref title (${pin.title})`);
  assert.ok(e.a.toLowerCase().includes(pin.family.toLowerCase()), `${slug}: the entry's author (${e.a}) carries ${pin.family}`);
  assert.equal(String(e.y), pin.year, `${slug}: the entry's year is the Crossref year`);
  for (const [bad, why] of Object.entries(pin.wrong)) {
    assert.ok(!e.l.toLowerCase().includes(bad), `${slug}: l must not be ${bad} (${why})`);
  }
}
// The old strings are gone from the data files, not only from the two entries.
assert.ok(!/10\.1017\/cbo9780511613292/i.test(read("data/entries-a.json") + read("data/entries-b.json")), "the DOI with no Crossref record is gone from the data");

// ---- the worker renders what the files hold ---------------------------------------------------------------------------
// worker.js imports its JSON as modules, which plain node cannot load. Inline the three data files into a temp copy of the
// worker (the same text, with each import line replaced by a const) and call its fetch handler.
const src = read("worker.js");
const inlined = src.replace(/^import (\w+) from "\.\/data\/([\w-]+\.json)";$/gm, (_m, name, file) => `const ${name} = ${read("data/" + file).trim()};`);
assert.notEqual(inlined, src, "the data imports were found and inlined");
assert.ok(!/^import /m.test(inlined), "no import is left in the inlined worker");
const dir = mkdtempSync(join(tmpdir(), "mind-doi-"));
try {
  const file = join(dir, "worker.mjs");
  writeFileSync(file, inlined);
  const worker = (await import(pathToFileURL(file).href)).default;
  const get = async (path) => {
    const r = await worker.fetch(new Request("https://mind.q08.org" + path), {}, { waitUntil() {} });
    return { status: r.status, body: await r.text() };
  };
  const api = await get("/api/entries.json");
  assert.equal(api.status, 200, "/api/entries.json answers 200");
  for (const [slug, pin] of Object.entries(PINS)) {
    const page = await get("/q/" + slug);
    assert.equal(page.status, 200, `/q/${slug} answers 200`);
    const anchor = new RegExp(`<a href="https://doi\\.org/${pin.doi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`);
    assert.match(page.body, anchor, `/q/${slug} links https://doi.org/${pin.doi}`);
    for (const bad of Object.keys(pin.wrong)) assert.ok(!page.body.toLowerCase().includes(bad), `/q/${slug} does not link ${bad}`);
    assert.ok(api.body.includes("https://doi.org/" + pin.doi), `/api/entries.json carries ${pin.doi}`);
  }
  assert.ok(!/10\.1017\/cbo9780511613292/i.test(api.body), "/api/entries.json no longer carries the DOI with no Crossref record");
  assert.ok(!api.body.includes("10.1037/0022-3514.84.4.822"), "/api/entries.json no longer carries the Brown and Ryan DOI");
  const health = JSON.parse((await get("/health")).body);
  assert.equal(health.entries, ALL.length, "/health counts the entries the data files hold");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ---- the bump says what changed ---------------------------------------------------------------------------------------
const mirror = read("deployed-current.worker.js");
assert.equal(mirror, src, "deployed-current.worker.js is byte-identical to worker.js (mirror-guard)");
const version = src.match(/^var VERSION = "(\d+)\.(\d+)\.(\d+)";$/m);
assert.ok(version, "worker.js declares var VERSION");
const [maj, min, pat] = version.slice(1).map(Number);
assert.ok(maj > 2 || (maj === 2 && (min > 2 || (min === 2 && pat >= 1))), `VERSION ${version.slice(1).join(".")} is at least 2.2.1, the release that carries the DOI fixes`);

console.log("q08-mind entries-doi: ok");
