import assert from "node:assert/strict";
import { searchSkills } from "./src/lib.js";
const items = [{ name: "d1_query", description: "Read-only SQL on D1" }, { name: "send_email", description: "Send an email" }, { name: "github_pr", description: "Open a pull request on GitHub" }];
assert.equal(searchSkills(items, "sql")[0].name, "d1_query");
assert.equal(searchSkills(items, "pull request")[0].name, "github_pr");
assert.equal(searchSkills(items, "zzzz").length, 0);
assert.equal(searchSkills(items, "").length, 3);
assert.equal(searchSkills(items, "email github", 1).length, 1);
console.log("skill-search ok");
