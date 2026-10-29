import assert from "node:assert/strict";
import { misnumberedSubsections } from "./worker.js";
assert.equal(misnumberedSubsections("## 6. Discussion\n\n### 4.3 Stray\n\ntext\n\n### 6.1 Fine\n").length, 1);
assert.equal(misnumberedSubsections("## 1. A\n### 1.1 x\n## 2. B\n### 2.1 y\n#### 2.1.1 z\n").length, 0);
assert.equal(misnumberedSubsections("## 2. B\n```\n### 9.9 code\n```\n").length, 0);
assert.equal(misnumberedSubsections("## Abstract\n### 3.1 x\n").length, 0);
console.log("structure-numbering ok");
