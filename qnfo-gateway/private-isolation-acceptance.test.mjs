import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "./worker.js";

for (const name of ["qnfo-gateway", "qnfo-ai-search", "qnfo-research-exec", "qnfo-subscribers"]) {
  const config = readFileSync(new URL("../" + name + "/wrangler.toml", import.meta.url), "utf8")
    .replace(/^\s*#.*$/gm, "");
  assert(!/database_name\s*=\s*"qnfo-identity"/.test(config), name + " must not bind the private identity database");
  assert(!/binding\s*=\s*"IDENTITY"/.test(config), name + " must not declare the private binding");
}

const research = new DatabaseSync(":memory:");
const identity = new DatabaseSync(":memory:");
research.exec(`
  CREATE TABLE papers(slug TEXT,title TEXT,abstract TEXT,authors TEXT,doi TEXT,created_at TEXT,updated_at TEXT,version TEXT,license TEXT,keywords TEXT,body_md TEXT,status TEXT);
  INSERT INTO papers VALUES('synthetic-us07','Synthetic public research fixture','Public abstract','[]',NULL,'2000-01-01','2000-01-01','1.0.0','test','[]','PUBLIC-RESEARCH-BODY-US07','published');
`);
identity.exec("CREATE TABLE owner_docs(key TEXT,body_md TEXT,visibility TEXT)");
identity.prepare("INSERT INTO owner_docs VALUES(?,?,?)").run("identity", "PRIVATE-IDENTITY-US07-SYNTHETIC", "private");
identity.prepare("INSERT INTO owner_docs VALUES(?,?,?)").run("identity--v20000101000000", "PRIVATE-HISTORY-US07-SYNTHETIC", "history");
const before = identity.prepare("SELECT * FROM owner_docs ORDER BY key").all();
const privateValues = before.map(row => row.body_md);
const queries = [];
let identityReads = 0;
const binding = {
  prepare(sql) {
    queries.push(sql);
    assert(!/owner_docs|owner_client_keys|owner_sessions/i.test(sql), "public research must not query private tables");
    let args = [];
    const q = {
      bind(...values) { args = values; return q; },
      async first() { return research.prepare(sql).get(...args) || null; },
      async all() { return { results: research.prepare(sql).all(...args) }; }
    };
    return q;
  }
};
const env = {
  LIVING_PAPER: binding,
  IDENTITY: { prepare() { identityReads++; throw new Error("Public research entered the private fixture store"); } }
};
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("US07 fixtures must not access a network"); };
try {
  const call = path => worker.fetch(new Request("https://papers.qnfo.org" + path, {
    headers: { Accept: "application/json" }
  }), env, { waitUntil() {} });
  const positive = await call("/papers/synthetic-us07.md");
  assert.equal(positive.status, 200);
  assert((await positive.text()).includes("PUBLIC-RESEARCH-BODY-US07"), "positive control proves public research remains readable");
  for (const path of [
    "/api/owner/doc/identity", "/api/owner/doc/identity--v20000101000000",
    "/owner/doc/identity", "/owner/edit/identity", "/papers/identity.md",
    "/papers/identity--v20000101000000.md", "/api/paper-context/identity"
  ]) {
    const response = await call(path);
    const body = await response.text();
    assert.equal(response.status, 404, path + " must not expose private fixture documents");
    assert(privateValues.every(value => !body.includes(value)));
  }
  assert(queries.length > 0);
  assert.equal(identityReads, 0);
  assert.deepEqual(identity.prepare("SELECT * FROM owner_docs ORDER BY key").all(), before);
  assert.equal(networkCalls, 0);
  console.log("PASS US07 research isolation: public markdown readable; private document/history routes absent, no private-store access, no network; research configs exclude IDENTITY");
} finally {
  globalThis.fetch = originalFetch;
  research.close();
  identity.close();
}
