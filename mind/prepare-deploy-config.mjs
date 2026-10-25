import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function prepareDeployConfig(source) {
  let config = source.replace(/^routes = \[[\s\S]*?^\]\r?\n?/m, "");
  const originalName = config;
  config = config.replace(/^name = "mind"$/m, 'name = "q08-mind"');
  if (config === originalName) {
    throw new Error('expected the placeholder Worker name `name = "mind"`');
  }

  config = config.replace(/^\[observability\.traces\]\r?\nenabled = false\r?\n?/m, "");
  return `${config.trimEnd()}\n\n[observability]\nenabled = false\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourcePath, outputPath] = process.argv.slice(2);
  if (!sourcePath || !outputPath) {
    throw new Error("usage: node prepare-deploy-config.mjs <source.toml> <output.toml>");
  }
  writeFileSync(outputPath, prepareDeployConfig(readFileSync(sourcePath, "utf8")));
}
