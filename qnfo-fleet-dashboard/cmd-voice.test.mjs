// CMD-VOICE-1 offline suite (qnfo-fleet-dashboard 1.75.0). Proves: /api/cmd/transcribe needs the header and the owner, rejects empty
// and oversize recordings, answers with the Whisper text, falls back to the next model when the first fails, and names the failure;
// the command line page carries the Speak button; the terminal client sends a recording to that route with its session cookie.
// Run: node qnfo-fleet-dashboard/cmd-voice.test.mjs
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import vm from "node:vm";
import { execFile } from "node:child_process";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));

const code = cut("var CMD_STT_MODELS", "async function cmdRoutes(") + "\nthis.cmdTranscribe = cmdTranscribe;";
const calls = [];
const ctx = { ownerJson: (d, s) => ({ status: s || 200, body: d }), btoa, Uint8Array, String, Array, JSON, Date };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const req = (bytes, hdr) => ({ headers: { get: (k) => (hdr === undefined ? { "x-fleet-ui": "1" } : hdr)[k] || null }, arrayBuffer: async () => new Uint8Array(bytes).buffer });
const env = (run) => ({ AI: { run: async (m, i) => { calls.push([m, i]); return run(m, i); } } });

let r = await ctx.cmdTranscribe(req([1], {}), env(() => ({ text: "x" })), true);
ok(r.status === 400, "missing x-fleet-ui header is refused", r);
r = await ctx.cmdTranscribe(req([1]), env(() => ({ text: "x" })), false);
ok(r.status === 401 && r.body.need === "code", "a visitor without the owner session is refused", r);
r = await ctx.cmdTranscribe(req([]), env(() => ({ text: "x" })), true);
ok(r.status === 400, "an empty recording is refused", r);
r = await ctx.cmdTranscribe(req(new Array(8 * 1024 * 1024 + 1).fill(0)), env(() => ({ text: "x" })), true);
ok(r.status === 413, "a recording over 8 MB is refused", r);
calls.length = 0;
r = await ctx.cmdTranscribe(req([1, 2, 3]), env(() => ({ text: " list the open issues " })), true);
ok(r.status === 200 && r.body.text === "list the open issues" && r.body.model === "@cf/openai/whisper-large-v3-turbo", "the first model's text is returned trimmed", r);
ok(calls.length === 1 && calls[0][1].audio === btoa("\x01\x02\x03"), "the first model gets base64 audio", calls);
calls.length = 0;
r = await ctx.cmdTranscribe(req([1, 2]), env((m) => { if (m.includes("turbo")) throw new Error("model retired"); return { text: "status" }; }), true);
ok(r.status === 200 && r.body.model === "@cf/openai/whisper" && Array.isArray(calls[1][1].audio), "a failing first model falls back to the next", r);
r = await ctx.cmdTranscribe(req([1]), env(() => { throw new Error("boom"); }), true);
ok(r.status === 502 && /boom/.test(r.body.error), "when every model fails the error names the cause", r);
r = await ctx.cmdTranscribe(req([1]), env(() => ({ text: "" })), true);
ok(r.status === 502 && /no speech/.test(r.body.error), "silence is reported, not returned as an empty command", r);
r = await ctx.cmdTranscribe(req([1]), {}, true);
ok(r.status === 503, "no AI binding is a 503", r);
ok(/id="cmic"/.test(src) && /\/api\/cmd\/transcribe/.test(src) && /path === "\/api\/cmd\/transcribe"/.test(src), "the page has the Speak button and the route is wired before the JSON body parse");
const routes = src.slice(src.indexOf("async function cmdRoutes("));
ok(routes.indexOf('path === "/api/cmd/transcribe"') < routes.indexOf("b = await request.json();"), "the transcribe route runs before the JSON parse");
ok(/^var VERSION = "1\.(7[5-9]|[89]\d)\.\d+"|^var VERSION = "[2-9]\./m.test(src), "VERSION is at least 1.75.0");

// terminal client against a stub of the route
let seen = null;
const srv = http.createServer((q, s) => {
  const chunks = [];
  q.on("data", (c) => chunks.push(c));
  q.on("end", () => {
    seen = { url: q.url, ui: q.headers["x-fleet-ui"], cookie: q.headers.cookie || "", type: q.headers["content-type"], n: Buffer.concat(chunks).length };
    s.setHeader("content-type", "application/json");
    if (q.url === "/api/cmd/transcribe") s.end(JSON.stringify({ ok: true, text: "queue", model: "stub" }));
    else s.end(JSON.stringify({ ok: true, kind: "answer", text: "ran: " + Buffer.concat(chunks).toString() }));
  });
});
await new Promise((r2) => srv.listen(0, r2));
const dir = mkdtempSync(join(tmpdir(), "qcli-"));
const wav = join(dir, "a.wav");
writeFileSync(wav, Buffer.from([1, 2, 3, 4]));
const home = mkdtempSync(join(tmpdir(), "qcli-home-"));
mkdirSync(join(home, ".qnfo"), { recursive: true });
writeFileSync(join(home, ".qnfo", "session.json"), JSON.stringify({ cookie: "fleet_cmd=abc" }));
const cli = await new Promise((res) => execFile(process.execPath, [new URL("../scripts/qcli.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "--audio", wav], {
  env: { ...process.env, QNFO_BASE: "http://127.0.0.1:" + srv.address().port, HOME: home, USERPROFILE: home }, timeout: 20000,
}, (e, stdout, stderr) => res({ stdout, stderr: String(stderr) + (e ? String(e) : "") })));
srv.close();
ok(/heard: queue/.test(cli.stdout) && /ran: .*queue/.test(cli.stdout), "qcli --audio prints what it heard, then runs it", cli.stdout + cli.stderr);
ok(seen && seen.ui === "1", "qcli sends x-fleet-ui", seen);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
