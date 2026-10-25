// WEBMCP-FLEET-1 tests (2026-10-25). Run: node --test _shared/webmcp.test.mjs
//
// These lock the parts a live probe cannot cheaply lock: the manifest is honest about every tool (name, description,
// schema, a same-origin path), the route answers only the three bridge paths, the attach wrapper is idempotent, and the
// generated bridge actually registers every tool and calls the site with a RELATIVE path — including when a caller
// passes an absolute URL as the path argument, which must never become a request to another origin.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOCK = readFileSync(join(ROOT, "_shared", "webmcp.js"), "utf8");

const EXPORTS = "\n;globalThis.__wm = { wmManifest, wmPacks, wmRoute, wmBridgeSource, wmAttach, wmPackIds, wmMcp, wmMcpCard, wmToolUrl, wmExecTool, WM_PACK_DEFS, WM_HOST_PACKS, WM_VERSION, WM_BRIDGE_PATH, WM_PACKS_PATH, WM_MANIFEST_PATH, WM_MANIFEST_URL, WM_MCP_PATH, wmPlatformOn };";

function loadBlock() {
  const sandbox = { URL, URLSearchParams, Response, Headers, console, String, Number, Array, Object, JSON, RegExp, Math, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(BLOCK + EXPORTS).runInContext(sandbox);
  return sandbox.__wm;
}

test("manifest advertises only well-formed, same-origin tools", () => {
  const wm = loadBlock();
  assert.equal(wm.WM_VERSION.length > 0, true);
  const seen = new Map();
  for (const host of Object.keys(wm.WM_HOST_PACKS).concat(["unknown.example"])) {
    const man = wm.wmManifest(host, "test-worker");
    assert.equal(man.schema_version, "webmcp/v1");
    assert.equal(man.host, host);
    assert.ok(man.packs.length >= 1, host + " has packs");
    let count = 0;
    for (const p of man.packs) {
      assert.ok(p.id && p.title && p.description, host + "/" + p.id + " pack has title and description");
      for (const t of p.tools) {
        count++;
        assert.match(t.name, /^[a-z][a-z0-9_]*$/, host + " tool name " + t.name);
        assert.ok(t.description && t.description.length > 20, host + " " + t.name + " has a real description");
        assert.equal(t.inputSchema.type, "object", host + " " + t.name + " has an object schema");
        if (t.local) {
          assert.equal(t.request, null, host + " " + t.name + " local tool has no request");
        } else {
          assert.ok(t.request && t.request.path, host + " " + t.name + " has a request path");
          const callerPath = t.request.path === "{path}";
          assert.equal(callerPath || t.request.path.startsWith("/"), true, host + " " + t.name + " path is same-origin: " + t.request.path);
          assert.equal(t.request.path.startsWith("//"), false, host + " " + t.name + " path is not protocol-relative");
          assert.equal(/^[a-z][a-z0-9+.-]*:/i.test(t.request.path), false, host + " " + t.name + " path carries no scheme");
          assert.match(t.request.method || "GET", /^(GET|POST)$/);
        }
        if (seen.has(t.name) && seen.get(t.name) !== JSON.stringify(t.request)) {
          assert.fail("tool " + t.name + " is defined twice with different requests");
        }
        seen.set(t.name, JSON.stringify(t.request));
      }
    }
    assert.equal(man.tool_count, count, host + " tool_count matches the table");
  }
});

test("host pack map is what each surface actually needs", () => {
  const wm = loadBlock();
  assert.equal(wm.wmPackIds("papers.qnfo.org").join(","), "site,papers");
  assert.equal(wm.wmPackIds("qnfo.org").join(","), "site,papers");
  assert.equal(wm.wmPackIds("fleet.qnfo.org").join(","), "site,fleet");
  assert.equal(wm.wmPackIds("ideas.qnfo.org").join(","), "site,ideas");
  assert.equal(wm.wmPackIds("q08.org").join(","), "site,signals");
  assert.equal(wm.wmPackIds("mind.q08.org").join(","), "site,mind");
  assert.equal(wm.wmPackIds("qwav.uk").join(","), "site", "an unmapped host gets the site pack, never a tool it cannot answer");
});

test("route answers exactly the three bridge paths and nothing else", async () => {
  const wm = loadBlock();
  const base = "https://papers.qnfo.org";
  const bridge = wm.wmRoute(new Request(base + wm.WM_BRIDGE_PATH), "qnfo-gateway");
  assert.ok(bridge, "bridge route answers");
  assert.equal(bridge.status, 200);
  assert.match(bridge.headers.get("Content-Type"), /text\/javascript/);
  const js = await bridge.text();
  assert.match(js, /modelContext/);
  assert.match(js, /registerTool/);
  assert.equal(/^\s*import\s/m.test(js), false, "bridge is a self-contained classic IIFE, not a module with imports");
  assert.equal(js.includes("export "), false, "bridge has no export statements");
  new vm.Script(js); // parses

  const packs = wm.wmRoute(new Request(base + wm.WM_MANIFEST_URL), "qnfo-gateway");
  const body = await packs.json();
  assert.equal(body.host, "papers.qnfo.org");
  assert.equal(body.worker, "qnfo-gateway");
  assert.equal(body.tool_count, body.packs.reduce((n, p) => n + p.tools.length, 0));

  const man = await wm.wmRoute(new Request(base + wm.WM_MANIFEST_PATH), "qnfo-gateway").json();
  assert.equal(man.paths.bridge, wm.WM_BRIDGE_PATH);
  assert.equal(man.paths.mcp, wm.WM_MCP_PATH);
  const legacy = await wm.wmRoute(new Request(base + wm.WM_PACKS_PATH), "qnfo-gateway").json();
  assert.equal(legacy.tool_count, body.tool_count, "the legacy packs path is the same manifest");

  assert.equal(wm.wmRoute(new Request(base + "/api/papers"), "qnfo-gateway"), null, "any other path is not ours");
  assert.equal(wm.wmRoute(new Request(base + "/.webmcp/other"), "qnfo-gateway"), null);
  const post = wm.wmRoute(new Request(base + wm.WM_BRIDGE_PATH, { method: "POST" }), "qnfo-gateway");
  assert.equal(post.status, 405);
});

test("attach wraps fetch once, routes bridge paths, leaves other responses alone", async () => {
  const wm = loadBlock();
  let calls = 0;
  let injected = 0;
  const sandbox = { wmAttach: wm.wmAttach, wmRoute: wm.wmRoute, wmWithHtml: null };
  // HTMLRewriter is a global in the worker runtime; the block reads it defensively.
  const target = {
    async fetch(request) { calls++; return new Response("<html><head><title>t</title></head></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } }); }
  };
  const before = target.fetch;
  wm.wmAttach(target, "test-worker");
  wm.wmAttach(target, "test-worker");
  assert.notEqual(target.fetch, before, "fetch was wrapped");
  assert.equal(target.__wm, wm.WM_VERSION);

  const passthrough = await target.fetch(new Request("https://qnfo.org/about"), {}, {});
  assert.equal(calls, 1);
  assert.equal(passthrough.status, 200);
  const br = await target.fetch(new Request("https://qnfo.org" + wm.WM_BRIDGE_PATH), {}, {});
  assert.equal(br.status, 200);
  assert.equal(calls, 1, "the bridge path never reaches the wrapped worker");
});

test("bridge registers every tool and calls the site with a relative path, even for a hostile argument", async () => {
  const wm = loadBlock();
  const manifest = wm.wmManifest("papers.qnfo.org", "qnfo-gateway");
  const registered = [];
  const fetches = [];
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    JSON,
    String,
    Number,
    Array,
    Object,
    RegExp,
    Math,
    Promise,
    setTimeout,
    document: {
      title: "QNFO Papers",
      querySelectorAll: () => [{ tagName: "H1", textContent: "Living papers" }],
      querySelector: () => null,
      documentElement: { getAttribute: () => "en" },
      modelContext: { registerTool: (t) => { registered.push(t); } }
    },
    navigator: {},
    location: { href: "https://papers.qnfo.org/papers", pathname: "/papers" },
    fetch: async (url, init) => {
      fetches.push({ url: String(url), init });
      if (String(url).includes("/api/webmcp/manifest.json")) return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true, got: String(url) }), { headers: { "Content-Type": "application/json" } });
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(wm.wmBridgeSource()).runInContext(sandbox);
  await new Promise((r) => setTimeout(r, 30));

  const state = sandbox.__webmcp;
  assert.ok(state, "bridge published its state");
  assert.equal(state.supported, true);
  assert.equal(state.mode, "registered");
  assert.equal(state.registered, manifest.tool_count, "every advertised tool was registered");
  assert.equal(state.tools.slice().sort().join(","), registered.map((t) => t.name).sort().join(","));

  const search = registered.find((t) => t.name === "search_papers");
  const res = await search.execute({ q: "p-adic", limit: 5 });
  const last = fetches[fetches.length - 1];
  assert.equal(last.url, "/api/papers?q=p-adic&limit=5");
  assert.equal(res.isError, false);
  assert.match(res.content[0].text, /"ok":true/);

  // The path argument must never turn into another origin's request.
  const read = registered.find((t) => t.name === "read_page");
  const nBefore = fetches.length;
  const refused = await read.execute({ path: "https://evil.example/steal" });
  assert.equal(fetches.length, nBefore, "a foreign URL issued no request at all");
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /relative to this site/);
  await read.execute({ path: "//evil.example/steal" });
  const proto = fetches[fetches.length - 1];
  assert.equal(proto.url, "/evil.example/steal", "a protocol-relative path stays a path on this origin");

  const pc = registered.find((t) => t.name === "get_page_context");
  const ctxRes = await pc.execute({});
  assert.match(ctxRes.content[0].text, /papers\.qnfo\.org/);
});

test("a browser without modelContext gets no registration and no error", async () => {
  const wm = loadBlock();
  const manifest = wm.wmManifest("fleet.qnfo.org", "qnfo-fleet-dashboard");
  const sandbox = {
    console, URL, URLSearchParams, JSON, String, Number, Array, Object, RegExp, Math, Promise, setTimeout,
    document: { title: "fleet", querySelectorAll: () => [], querySelector: () => null, documentElement: { getAttribute: () => "en" } },
    navigator: {},
    location: { href: "https://fleet.qnfo.org/", pathname: "/" },
    fetch: async () => new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } })
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(wm.wmBridgeSource()).runInContext(sandbox);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(sandbox.__webmcp.supported, false);
  assert.equal(sandbox.__webmcp.mode, "standalone");
  assert.equal(sandbox.__webmcp.registered, 0);
  assert.equal(sandbox.__webmcp.tools.length, manifest.tool_count, "the tools are still discoverable to an agent that reads the page state");
});

test("the bridge stands down where Cloudflare's own WebMCP bridge is already on the page", async () => {
  // Measured live 2026-10-25: the qnfo.org zone has the platform toggle on, so the edge injects its own bridge and
  // resolves /.webmcp/bridge.js to the platform bundle before the worker is reached. Registering the same tool names a
  // second time would collide, so ours must detect that tag and register nothing, while still publishing what it found.
  const wm = loadBlock();
  const manifest = wm.wmManifest("papers.qnfo.org", "qnfo-gateway");
  const registered = [];
  const sandbox = {
    console, URL, URLSearchParams, JSON, String, Number, Array, Object, RegExp, Math, Promise, setTimeout,
    document: {
      title: "QNFO Papers",
      querySelectorAll: () => [],
      querySelector: (sel) => (String(sel).includes("/.webmcp/bridge.js") ? { tagName: "SCRIPT" } : null),
      documentElement: { getAttribute: () => "en" },
      modelContext: { registerTool: (t) => { registered.push(t); } }
    },
    navigator: {},
    location: { href: "https://papers.qnfo.org/", pathname: "/" },
    fetch: async () => new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } })
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(wm.wmBridgeSource()).runInContext(sandbox);
  await new Promise((r) => setTimeout(r, 30));
  const state = sandbox.__webmcp;
  assert.equal(state.supported, true);
  assert.equal(state.platform_bridge, true);
  assert.equal(state.mode, "platform");
  assert.equal(state.registered, 0);
  assert.equal(registered.length, 0, "no tool was registered twice");
  assert.ok(state.tools.length > 0, "the tool list is still published for inspection");
});

test("a platform-toggled zone is left to the platform bridge, and no 503 endpoint is advertised", () => {
  const wm = loadBlock();
  assert.equal(wm.wmPlatformOn("qnfo.org"), true);
  assert.equal(wm.wmPlatformOn("papers.qnfo.org"), true, "every host on the qnfo.org zone is owned by the platform bridge");
  assert.equal(wm.wmPlatformOn("q08.org"), false);
  assert.equal(wm.wmPlatformOn("ask.qwav.tech"), false, "a qwav host is not qnfo.org");
  assert.equal(wm.wmPlatformOn("qnfo.net"), false, "a different zone is not qnfo.org");
  const names = [];
  for (const host of Object.keys(wm.WM_HOST_PACKS)) for (const p of wm.wmPacks(host)) for (const tool of p.tools) names.push(tool.name);
  assert.equal(names.includes("list_proposals"), false, "GET /api/proposals answered 503; a 503 endpoint must not be advertised");
});
