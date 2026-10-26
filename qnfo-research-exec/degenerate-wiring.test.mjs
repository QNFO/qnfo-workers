// DEGENERATE-TEXT-1 wiring suite for qnfo-research-exec (the acceptance test of the code task on agent_issues DEGENERATE-TEXT-PRODUCER-1).
// The producer failure of 2026-10-26: the reconcile model looped ("The paper is written in LaTeTe ... Te Te Te", 24,586 characters), the
// "output shorter than 10,000 characters" test took the loop for a reconciled paper, the complete stage wrote the real paper after it, and finalGates,
// releaseGateVerdict and the title fallback had no check for repetition, for text ahead of the first heading or for a title cut from the raw idea.
// qnfo-cloud-ops 1.41.0 now withdraws such a paper within the hour; this suite holds the producer to the same detector:
//   1. the DEGENERATE-TEXT block in this worker is byte-identical to qnfo-cloud-ops/degenerate-text.mjs;
//   2. releaseGateVerdict (the publish-time gate) gives a loop the same verdict as the qnfo-cloud-ops sweep and a clean paper the same pass;
//   3. finalGates (review and verify) raises a HARD gate-degenerate fix for a loop and for more than DEGEN_PREHEADING_MAX characters ahead of the
//      first heading, and none for a clean paper;
//   4. stageReconcile strips or rejects a degenerate model output instead of keeping it (a stripped output under the floor takes the existing
//      best-leg degrade path), and the paper title never falls back to the raw idea cut at 140 characters (ensurePaperRow uses ideaTitle).
// Until the block is in worker.js this suite prints PENDING and passes: the file is under another session's live work claim (the code loop's), and the
// wiring is a code task whose closing probe is the marker itself. Run: node qnfo-research-exec/degenerate-wiring.test.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const libSrc = readFileSync(new URL("../qnfo-cloud-ops/degenerate-text.mjs", import.meta.url), "utf8");
const ops = readFileSync(new URL("../qnfo-cloud-ops/worker.js", import.meta.url), "utf8");
const block = (t) => { const b = t.indexOf("// DEGENERATE-TEXT-BEGIN"), e = t.indexOf("// DEGENERATE-TEXT-END"); return b >= 0 && e > b ? t.slice(b, e + "// DEGENERATE-TEXT-END".length) : ""; };

if (!block(src)) {
  console.log("PENDING DEGENERATE-TEXT-PRODUCER-1: qnfo-research-exec/worker.js does not carry the DEGENERATE-TEXT block yet; the publication sweep in qnfo-cloud-ops (pub-gate-v5-degenerate) withdraws a degenerate paper within the hour meanwhile.");
  console.log("0 passed, 0 failed (pending)");
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d).slice(0, 700) : "")); } };
const fnText = (text, name) => { const s = text.indexOf("function " + name + "("); if (s < 0) return ""; let d = 0; for (let i = text.indexOf("{", s); i < text.length; i++) { if (text[i] === "{") d++; else if (text[i] === "}" && --d === 0) return text.slice(s, i + 1); } return ""; };
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { reviserMod as __reviser, errataMod as __errata, REVISER_VERSION as __rv, ERRATA_VERSION as __ev };\n").toString("base64"));
const { releaseGateVerdict, finalGates } = mod;

const doc = (n) => readFileSync(new URL("../docs/" + n, import.meta.url), "utf8");
const prose = doc("ENSEMBLE-POLICY.md") + "\n" + doc("OUTPUT-QUALITY-LEDGER.md") + "\n" + doc("PAPER-LEDGER.md");
const LOOP_HEAD = ": 1. The paper is written in LaTe LaTeTe. 2. The paper is written in LaTeTe. The paper is written in LaTeTeTe. The paper is written in LaTeTeTe. The paper is written in LaTeTeTe. The paper is written in LaTeTeTeTe TeTeTe ";
const real = "## Abstract\n\nScalable quantum computation is limited by active error correction.\n\n## Related work\n\n" + prose.slice(0, 9000) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n\n## References\n\n1. Example (2020). A title. arXiv:2001.00001\n";
const failure = "\n" + LOOP_HEAD + "Te ".repeat(8122) + "\n\n" + real;

ok(block(src) === block(libSrc), "the DEGENERATE-TEXT block in worker.js is byte-identical to qnfo-cloud-ops/degenerate-text.mjs");
{
  const opsGate = new Function(block(ops) + "\n" + fnText(ops, "pubGateSectionStructure") + "\n" + fnText(ops, "pubGateScore") + "\n" + fnText(ops, "pubGateVerdictRaw") + "\nreturn function (md) { return pubGateVerdictRaw(pubGateScore(md)); };")();
  const a = releaseGateVerdict(failure), o = opsGate(failure);
  ok(a.pass === 0 && /^quality:degenerate-text /.test(a.reason) && a.reason === o.reason, "releaseGateVerdict gives the 2026-10-26 failure the verdict the publication sweep gives it", { a, o });
  const c = releaseGateVerdict(real), co = opsGate(real);
  ok(c.pass === co.pass && c.reason === co.reason, "and a clean paper the same verdict as the sweep", { c, co });
}
{
  const f = finalGates(failure, { structure: true });
  ok(!f.ok && f.fixes.some((x) => x.id === "gate-degenerate" && x.severity === "HARD"), "finalGates raises a HARD gate-degenerate fix for the loop", f.fixes.map((x) => x.id));
  const wall = finalGates("\n" + "A paragraph of prose that is not a heading. ".repeat(60) + "\n\n" + real, { structure: true });
  ok(wall.fixes.some((x) => x.id === "gate-degenerate" && /ahead of the first heading/.test(x.claim || x.reason || "")), "finalGates raises it for more than 1,500 characters of text ahead of the first heading", wall.fixes.map((x) => [x.id, x.claim]));
  const clean = finalGates(real, { structure: true });
  ok(!clean.fixes.some((x) => x.id === "gate-degenerate"), "finalGates raises nothing of the kind for a clean paper", clean.fixes.map((x) => x.id));
}
{
  const rec = fnText(src, "stageReconcile");
  ok(/degenerateTextStrip\(|degenerateTextScan\(/.test(rec), "stageReconcile reads the model output with the detector", rec.length);
  ok(/reconcile-degenerate/.test(rec), "and logs a reconcile-degenerate event when it strips or rejects an output");
  const ens = fnText(src, "ensurePaperRow");
  ok(/ideaTitle\(/.test(ens) && !/String\(row\.idea \|\| "QNFO research paper"\)\.slice\(0, 140\)/.test(ens), "ensurePaperRow takes the fallback title from ideaTitle, not from the raw idea cut at 140 characters", ens.slice(0, 200));
  const it = mod.ideaTitle;
  if (typeof it === "function") {
    const t = it("Passive Fault Tolerance via Bruhat-Tits Tree Codes. Claim: encoding quantum information on Bruhat-Tits trees (p-adic ultrametric geometry) yields passive fault tolerance");
    ok(t === "Passive Fault Tolerance via Bruhat-Tits Tree Codes" && !/claim\s*:/i.test(t), "ideaTitle keeps the idea's title sentence and drops its Claim clause", t);
    ok(it("A".repeat(300)).length <= 140 && it("").length > 0, "ideaTitle is at most 140 characters and never empty");
  } else {
    ok(false, "ideaTitle is exported for the test (add it to the module's test exports)");
  }
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
