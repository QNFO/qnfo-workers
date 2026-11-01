import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const document = readFileSync(new URL("./CODE-AGENT-CONSOLE.md", import.meta.url), "utf8");
const inventory = document.split("## Slice 0 inventory")[1].split("\nFindings:")[0];

test("the /cmd inventory distinguishes its signed-out baseline and links every failing stage", () => {
  const rows = [...inventory.matchAll(/^\| (\d+) \|.*$/gm)];
  assert.deepEqual(rows.map((match) => Number(match[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.match(inventory, /not\*\* the required ten authenticated owner turns/i);

  const failures = rows.slice(3).map((match) => match[0]);
  assert.equal(failures.length, 7);
  for (const row of failures) {
    assert.match(row, /\[#5442\]\(https:\/\/github\.com\/QNFO\/qnfo-workers\/issues\/5442\)/);
  }
  for (const row of failures.slice(0, 5)) assert.match(row, /\| polling —/);
  assert.match(failures[5], /\| hand-off/);
  assert.match(failures[6], /\| render/);
});
