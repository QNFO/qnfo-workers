#!/usr/bin/env node
// RM-SEEDED-CLAIM-HARNESS-1 (agent_issues 1000665, charter pillar research): seeds known-false claims (scripts/seeded-claims.json) into a clean
// paper body and records whether the deterministic claim scan of qnfo-research-exec (fabricatedClaimScan, the first layer of claimAudit) flags
// each one. The scan is read from qnfo-research-exec/worker.js on this checkout, so the result is about the code that is deployed from main.
//
// Usage: node scripts/seeded_claim_harness.mjs [--worker <path>] [--seeds <path>]
// Output (stdout, one JSON object): { ok, reason?, control_flagged, runs: [{ seed_id, gate, kind, caught, detail }] }
// ok is false (and runs is empty) when the scan cannot be extracted or the clean control sentence is flagged: a harness whose control fails
// measures nothing, and scripts/bp26_seeded.py then records no run (the metric stays unknown, never 0).
// Nothing is published, posted or written to a paper; the seeds exist only in memory.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const workerPath = arg("--worker", join(here, "..", "qnfo-research-exec", "worker.js"));
const seedsPath = arg("--seeds", join(here, "seeded-claims.json"));

const BODY = "# Bounds on step counts\n\n## Introduction\n\nThis paper derives a bound on the number of steps required.\n\n## Results\n\n";
const CONTROL = "The derivation follows from the lemma above and the bound is tight in the stated regime.";

export function loadScan(workerSrc) {
  const lines = workerSrc.split(/\r?\n/);
  const a = lines.findIndex((l) => l.startsWith("var CI_SKIP_HEAD_RE"));
  const b = lines.findIndex((l) => l.startsWith("function ciExtractPrompt"));
  if (a < 0 || b < 0 || b <= a) throw new Error("fabricatedClaimScan block not found in the worker (CI_SKIP_HEAD_RE .. ciExtractPrompt)");
  return new Function(lines.slice(a, b).join("\n") + "\nreturn fabricatedClaimScan;")();
}

export function runHarness(workerSrc, seedDoc) {
  let scan;
  try { scan = loadScan(workerSrc); } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 200), control_flagged: null, runs: [] }; }
  const control = scan(BODY + CONTROL + "\n").length;
  if (control > 0) return { ok: false, reason: "clean control sentence was flagged: the scan is not a usable measurement", control_flagged: true, runs: [] };
  const runs = (seedDoc.seeds || []).map((s) => {
    const hits = scan(BODY + s.text + "\n");
    return { seed_id: s.id, gate: s.gate || "fabricated-scan", kind: s.kind || "", caught: hits.length > 0 ? 1 : 0, detail: hits.length ? "flagged as " + hits[0].kind : "not flagged by the deterministic scan" };
  });
  return { ok: true, control_flagged: false, runs };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = runHarness(readFileSync(workerPath, "utf8"), JSON.parse(readFileSync(seedsPath, "utf8")));
  process.stdout.write(JSON.stringify(out) + "\n");
}
