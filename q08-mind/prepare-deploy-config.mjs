import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function prepareDeployConfig(source) {
  let config = source.replace(/^routes = \[[\s\S]*?^\]\r?\n?/m, "");
  const originalName = config;
  config = config.replace(/^name = "mind"$/m, 'name = "q08-mind"');
  // MIND-DIR-CONVERGE-1 (0.33.2, 2026-10-25) renamed the checked-in identity to the production name so the fleet graph
  // stops reporting one worker as an undeployed "mind" directory plus a deployed "q08-mind" script with no tracked
  // source. The substitution above is therefore already done in the source file: accept that state, but keep failing on
  // ANY other name so a typo still cannot reach production.
  if (config === originalName && !/^name = "q08-mind"$/m.test(config)) {
    throw new Error('expected the placeholder Worker name `name = "mind"` or the converged production name `name = "q08-mind"`');
  }

  // MIND-DIR-CONVERGE-1 (0.33.2) added a real [observability] table (enabled = true, head_sampling_rate) plus
  // [observability.traces] to the checked-in file. This preparer produces the Wrangler-3 fallback config, and Wrangler 3
  // cannot parse a second [observability] table ("Can't redefine existing key") nor the traces sub-table. Strip EVERY
  // observability table from the source (the table and its sub-tables, whatever keys they carry) before emitting the one
  // disabled block this fallback needs, so the generated config stays valid however the source evolves.
  function stripObservability(text) {
    const kept = [];
    let skipping = false;
    for (const line of text.split("\n")) {
      const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (header) {
        const name = header[1].trim();
        skipping = name === "observability" || name.startsWith("observability.");
      }
      if (!skipping) kept.push(line);
    }
    return kept.join("\n");
  }
  config = stripObservability(config);
  return `${config.trimEnd()}\n\n[observability]\nenabled = false\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourcePath, outputPath] = process.argv.slice(2);
  if (!sourcePath || !outputPath) {
    throw new Error("usage: node prepare-deploy-config.mjs <source.toml> <output.toml>");
  }
  writeFileSync(outputPath, prepareDeployConfig(readFileSync(sourcePath, "utf8")));
}
