#!/usr/bin/env node
// scripts/doi-zenodo-inventory.mjs: DOI-ZENODO-INVENTORY-1 (agent_issues 100587; charter pillars reach and security; owner directive NOZ-DOI-1, 2026-10-10:
// the deposit registrar account is closed, every 10.5281 DOI is dead, no output may name it or carry them; amendment 10:09: third-party DOIs stay).
//
// WHAT   A reproducible inventory of every use of the retired registry and every DOI reference in the tracked files of this repository, so the fleet-wide
//        sweep that agent_issues 100587 asks for is a command, not a one-off grep. Each line that names the registry (the word, or the 10.5281 prefix) or carries a DOI
//        is classified, and the report lists per class and per top-level directory how many files and hits there are and prints every line that could EMIT the
//        registry (an "emitter candidate": a non-comment, non-guard line of a worker, script or other code file).
//        Location classes (first match): mirror (deployed-current.worker.js copies, skipped), history-migration (migrations/), history-doc (docs/handoff, docs/closeouts,
//        docs/CLOSEOUT-*, docs/HANDOFF-*, docs/research-memos, audits/, ops-workspace/), owner-source (papers/, funding/, research-code/: owner-authored sources, never
//        edited by a sweep), generated-doc (docs/PORTFOLIO.md, docs/QUNIVERSE-CHARTER.md: rewritten by loops), retired (a directory that carries a RETIRED or FOLDED
//        file), test (suites and fixtures), code (worker.js, scripts), doc (other markdown), other.
//        Line kinds: comment, guard (the line removes, filters, refuses or compares the token: NOT LIKE, indexOf, a regex, a scrub), fixture (inside a test), record (a
//        migration or history document names it), third-party-doi (a DOI whose prefix is not 10.5281), emitter-candidate.
// WHY    On 2026-10-26 the 100587 sweep had no inventory: 135 tracked files (927 hits before mirrors are removed) still name the registry, and the question "does any
//        worker still emit it" had no machine answer. The answer this tool gives is the emitter-candidate list; 0 lines means every remaining hit is a guard, a comment,
//        a fixture, a record or an owner source.
// USAGE  node scripts/doi-zenodo-inventory.mjs [--root DIR] [--json FILE] [--md FILE] [--max-lines N]
//        No network, no secrets, read-only. Exit 0 always (it reports; the closing probe of the issue and the code-probe guards decide).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REGISTRY_RE = /zenodo|10\.5281/i;
// One reference is one match: a DOI under the closed prefix (10.5281/ and what follows) counts once even when its suffix names the registry too.
export const REFERENCE_RE = /10\.5281\/\S*|10\.5281|zenodo/gi;
export const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>)\]]+/g;
export const MAX_FILE_BYTES = 6_000_000;

const HISTORY_DOC = [/^docs\/handoff\//, /^docs\/closeouts\//, /^docs\/CLOSEOUT-/, /^docs\/HANDOFF-/, /^docs\/research-memos\//, /^audits\//, /^ops-workspace\//];
const OWNER_SOURCE = [/^papers\//, /^funding\//, /^research-code\//];
const GENERATED_DOC = [/^docs\/PORTFOLIO\.md$/, /^docs\/QUNIVERSE-CHARTER\.md$/];
const TEST_FILE = /(\.test\.mjs|\.test\.js|_test\.py|-test\.mjs|\.fixture\.json)$/;
// A guard compares, filters or replaces the token. A regex literal is recognised by an opening slash that is not part of a URL (not after a colon, a slash or a word character).
const GUARD_SYNTAX = /\b(NOT\s+LIKE|LIKE|indexOf|includes|startsWith|endsWith|RegExp|replaceAll)\b|\.(test|match|replace)\(|(?<![:/\w])\/[^/\n]*(zenodo|10\\?\.5281)[^/\n]*\/[gimsuy]*/i;
const GUARD_WORDS = /\b(NOZ|NO-REGISTRAR|scrub\w*|DEAD_DOIS?|dead|never|refus\w*|guard\w*|strip\w*|drop\w*|remov\w*|retired?|filter\w*|absent|sanitiz\w*|clean\w*|NO-ZENODO)\b/i;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#|--|<!--)/;

/** Directory prefixes that carry a RETIRED or FOLDED marker file. */
export function retiredDirs(files) {
  const out = new Set();
  for (const f of files) {
    const m = /^([^/]+)\/(RETIRED|FOLDED)(\.[a-z]+)?$/.exec(f);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Directories that hold a worker.js (their deployed-current.worker.js is a mirror of it, not a second source). */
export function workerDirs(files) {
  const out = new Set();
  for (const f of files) {
    const m = /^(.*)\/worker\.js$/.exec(f);
    if (m) out.add(m[1]);
  }
  return out;
}

/** The location class of a tracked path, or "mirror" for a file the scan skips (a deployed-current copy of a worker.js that is also tracked). */
export function classifyPath(path, retired = new Set(), withWorker = null) {
  const mm = /^(.*)\/deployed-current\.worker\.js$/.exec(path);
  if (mm && (withWorker === null || withWorker.has(mm[1]))) return "mirror";
  if (/^migrations\//.test(path)) return "history-migration";
  if (HISTORY_DOC.some((r) => r.test(path))) return "history-doc";
  if (OWNER_SOURCE.some((r) => r.test(path))) return "owner-source";
  if (GENERATED_DOC.some((r) => r.test(path))) return "generated-doc";
  const top = path.split("/")[0];
  if (retired.has(top)) return "retired";
  if (TEST_FILE.test(path)) return "test";
  if (/(^|\/)worker\.js$/.test(path) || /^scripts\//.test(path)) return "code";
  if (/\.md$/i.test(path)) return "doc";
  return "other";
}

/** The kind of one line that names the registry or carries a DOI. */
export function classifyLine(line, locClass) {
  const registry = REGISTRY_RE.test(line);
  const dois = line.match(DOI_RE) || [];
  const thirdParty = dois.filter((d) => !/^10\.5281\//.test(d));
  if (!registry) return thirdParty.length ? "third-party-doi" : "none";
  if (locClass === "history-migration" || locClass === "history-doc") return "record";
  if (locClass === "owner-source") return "owner-text";
  if (locClass === "generated-doc") return "generated";
  if (locClass === "test") return "fixture";
  if (COMMENT_LINE.test(line)) return "comment";
  if (GUARD_SYNTAX.test(line) || GUARD_WORDS.test(line)) return "guard";
  if (locClass === "retired") return "retired";
  if (locClass === "code") return "emitter-candidate";
  return "other";
}

const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

/**
 * @param {string[]} files tracked paths
 * @param {(path: string) => string|null} readText text of a file, or null when binary or too large
 */
export function scan(files, readText, maxLines = 400) {
  const retired = retiredDirs(files);
  const withWorker = workerDirs(files);
  const rep = {
    scanned_files: 0, skipped_files: 0, mirror_files: 0,
    registry: { files: 0, hits: 0 }, doi: { files: 0, third_party_hits: 0, registry_prefix_hits: 0 },
    by_location: {}, by_kind: {}, by_top: {}, emitter_candidates: [], third_party_files: [], top_files: [],
  };
  const perFile = [];
  for (const path of [...files].sort()) {
    const loc = classifyPath(path, retired, withWorker);
    if (loc === "mirror") { rep.mirror_files++; continue; }
    const text = readText(path);
    if (text == null) { rep.skipped_files++; continue; }
    rep.scanned_files++;
    let zHits = 0, tHits = 0;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (ln.length < 6) continue;
      const hasReg = REGISTRY_RE.test(ln);
      const dois = ln.match(DOI_RE) || [];
      if (!hasReg && !dois.length) continue;
      const kind = classifyLine(ln, loc);
      if (hasReg) {
        const n = (ln.match(REFERENCE_RE) || []).length;
        zHits += n;
        bump(rep.by_kind, kind, n);
        if (kind === "emitter-candidate" && rep.emitter_candidates.length < maxLines) rep.emitter_candidates.push({ path, line: i + 1, text: ln.trim().slice(0, 240) });
      }
      const tp = dois.filter((d) => !/^10\.5281\//.test(d)).length;
      tHits += tp;
      rep.doi.registry_prefix_hits += dois.length - tp;
    }
    if (zHits) {
      rep.registry.files++; rep.registry.hits += zHits;
      const l = (rep.by_location[loc] ||= { files: 0, registry_hits: 0, third_party_doi_hits: 0 });
      l.files++; l.registry_hits += zHits;
      const top = path.includes("/") ? path.split("/")[0] : "(root)";
      const t = (rep.by_top[top] ||= { files: 0, registry_hits: 0 });
      t.files++; t.registry_hits += zHits;
    }
    if (tHits) {
      rep.doi.files++; rep.doi.third_party_hits += tHits;
      (rep.by_location[loc] ||= { files: 0, registry_hits: 0, third_party_doi_hits: 0 }).third_party_doi_hits += tHits;
      rep.third_party_files.push({ path, hits: tHits });
    }
    if (zHits) perFile.push({ path, location: loc, hits: zHits });
  }
  rep.top_files = perFile.sort((a, b) => b.hits - a.hits || (a.path < b.path ? -1 : 1)).slice(0, 25);
  rep.third_party_files.sort((a, b) => b.hits - a.hits || (a.path < b.path ? -1 : 1));
  rep.third_party_files = rep.third_party_files.slice(0, 25);
  return rep;
}

export function renderMarkdown(rep, meta = {}) {
  const L = [];
  L.push("| Measure | Value |", "|---|---|");
  L.push("| Tracked text files scanned | " + rep.scanned_files + " (mirrors skipped " + rep.mirror_files + ", binary or over " + MAX_FILE_BYTES + " bytes skipped " + rep.skipped_files + ") |");
  L.push("| Files naming the registry (zenodo or 10.5281) | " + rep.registry.files + " files, " + rep.registry.hits + " hits |");
  L.push("| Files with a third-party DOI | " + rep.doi.files + " files, " + rep.doi.third_party_hits + " DOIs |");
  L.push("| Emitter candidates (non-comment, non-guard code lines) | " + rep.emitter_candidates.length + " |");
  if (meta.commit) L.push("| Commit scanned | " + meta.commit + " |");
  L.push("", "| Location class | Files naming the registry | Registry hits | Third-party DOI hits |", "|---|---|---|---|");
  for (const [k, v] of Object.entries(rep.by_location).sort((a, b) => b[1].registry_hits - a[1].registry_hits)) L.push("| " + k + " | " + v.files + " | " + v.registry_hits + " | " + v.third_party_doi_hits + " |");
  L.push("", "| Line kind | Registry hits |", "|---|---|");
  for (const [k, n] of Object.entries(rep.by_kind).sort((a, b) => b[1] - a[1])) L.push("| " + k + " | " + n + " |");
  L.push("", "| Top-level directory | Files | Registry hits |", "|---|---|---|");
  for (const [k, v] of Object.entries(rep.by_top).sort((a, b) => b[1].registry_hits - a[1].registry_hits).slice(0, 30)) L.push("| " + k + " | " + v.files + " | " + v.registry_hits + " |");
  L.push("", "Emitter candidates:", "");
  if (!rep.emitter_candidates.length) L.push("none");
  for (const e of rep.emitter_candidates) L.push("- `" + e.path + ":" + e.line + "` " + e.text.replace(/`/g, "'"));
  return L.join("\n") + "\n";
}

function listTracked(root) {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString("utf8").split("\0").filter(Boolean);
  } catch (e) {
    const out = [];
    const walk = (d, rel) => {
      for (const n of readdirSync(join(d), { withFileTypes: true })) {
        if (n.name === ".git" || n.name === "node_modules") continue;
        const p = rel ? rel + "/" + n.name : n.name;
        if (n.isDirectory()) walk(join(d, n.name), p); else out.push(p);
      }
    };
    walk(root, "");
    return out;
  }
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = resolve(arg("--root") || ".");
  const files = listTracked(root);
  const readText = (p) => {
    const full = join(root, p);
    try {
      if (statSync(full).size > MAX_FILE_BYTES) return null;
      const buf = readFileSync(full);
      if (buf.subarray(0, 4000).includes(0)) return null;
      return buf.toString("utf8");
    } catch (e) { return null; }
  };
  let commit = null;
  try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim(); } catch (e) { commit = null; }
  const rep = scan(files, readText, Number(arg("--max-lines")) || 400);
  rep.commit = commit;
  rep.generated_at = new Date().toISOString();
  if (arg("--json")) writeFileSync(arg("--json"), JSON.stringify(rep, null, 2));
  const md = renderMarkdown(rep, { commit });
  if (arg("--md")) writeFileSync(arg("--md"), md);
  process.stdout.write(md);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2));
void existsSync;
