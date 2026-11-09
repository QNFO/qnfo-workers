import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TARGETS } from "../scripts/voice-apply.mjs";

const src = readFileSync(new URL("./voice.js", import.meta.url), "utf8");
const mod = new Function(src + "\nreturn { VX_CLIENT, vxHeaders, vxAttach, vxTranscribe };")();

test("client script parses and covers textarea, input, speech api and recorder fallback", () => {
  new Function(mod.VX_CLIENT);
  for (const s of ["webkitSpeechRecognition", "MediaRecorder", "textarea", "/__voice/transcribe", "data-novoice".replace("data-", "")]) assert.ok(mod.VX_CLIENT.includes(s), s);
});
test("microphone policy: zone-style microphone=() is replaced, none is added, other values kept", () => {
  const a = new Headers({ "Permissions-Policy": "camera=(), microphone=(), geolocation=()" }); mod.vxHeaders(a);
  assert.match(a.get("Permissions-Policy"), /microphone=\(self\)/); assert.doesNotMatch(a.get("Permissions-Policy"), /microphone=\(\)/);
  const b = new Headers(); mod.vxHeaders(b); assert.match(b.get("Permissions-Policy"), /microphone=\(self\)/);
  const c = new Headers({ "Permissions-Policy": "microphone=(self)" }); mod.vxHeaders(c); assert.equal(c.get("Permissions-Policy"), "microphone=(self)");
});
test("nonce-only CSP gains 'self' so /__voice.js loads", () => {
  const h = new Headers({ "Content-Security-Policy": "default-src 'none'; script-src 'nonce-abc'; connect-src 'self'" }); mod.vxHeaders(h);
  assert.match(h.get("Content-Security-Policy"), /script-src 'self' 'nonce-abc'/);
});
test("attach serves the script and refuses cross-site or header-less transcription", async () => {
  const t = { async fetch() { return new Response("<html><body>x</body></html>", { headers: { "Content-Type": "text/html" } }); } };
  mod.vxAttach(t, "t");
  const js = await t.fetch(new Request("https://x.test/__voice.js"), {}, {});
  assert.equal(js.status, 200); assert.match(await js.text(), /__vx/);
  const bad = await t.fetch(new Request("https://x.test/__voice/transcribe", { method: "POST", body: "a" }), {}, {});
  assert.equal(bad.status, 403);
  globalThis.__vxStt = async () => ({ ok: true, text: "hello" });
  const okr = await t.fetch(new Request("https://x.test/__voice/transcribe", { method: "POST", body: "a", headers: { "x-voice": "1" } }), {}, {});
  assert.deepEqual(await okr.json(), { ok: true, text: "hello" }); delete globalThis.__vxStt;
  const page = await t.fetch(new Request("https://x.test/"), {}, {});
  assert.match(page.headers.get("Permissions-Policy"), /microphone=\(self\)/);
});
test("every target worker carries the block and the attach call", () => {
  for (const w of TARGETS) {
    const s = readFileSync(new URL("../" + w + "/worker.js", import.meta.url), "utf8");
    assert.ok(s.includes("VOICE-INPUT-1:BEGIN") && /vxAttach\(\w+, "/.test(s), w);
  }
});
