// LARGE-FILE-READ-1 (qnfo-fleet-control 0.24.1) offline suite. No network: the GitHub API is a scripted stub.
// Proves: a file under 1 MB is read from the contents API as before; a file above 1 MB (contents API: encoding "none", no
// content, a sha) is read from the git blobs API by that sha, byte for byte; a missing file is still "missing"; a failing
// blob read is transient (retried next tick), never "too large"; a contents answer with neither content nor sha is still
// "too large"; evReadFile follows the same path.
// Run: node --no-warnings qnfo-fleet-control/large-file-read.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const cut = (start, end) => {
  const a = src.indexOf(start), b = src.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error("cannot find " + start);
  return src.slice(a, b + end.length);
};
const code = [
  cut("async function evApi(env, method, path, body) {", '__name(evApi, "evApi");'),
  cut("function evDecode(b64) {", '__name(evDecode, "evDecode");'),
  cut("async function evReadFile(env, path, ref) {", '__name(evReadFile, "evReadFile");'),
  cut("async function cmRead(env, path, ref) {", '__name(cmRead, "cmRead");'),
].join("\n");

const big = "// head\n" + "x".repeat(1100000) + "\n// é tail\n";
const small = "var VERSION = \"1.0.0\";\n";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64").replace(/(.{60})/g, "$1\n");
const state = { calls: [], blobStatus: 200 };
async function timedFetch(url) {
  const p = String(url).replace("https://api.github.com/repos/QNFO/qnfo-workers", "");
  state.calls.push(p);
  const resp = (status, j) => ({ status, async json() { return j; }, async text() { return j === undefined || j === null ? "" : JSON.stringify(j); } });
  let m;
  if ((m = /^\/contents\/(.+)\?ref=(.+)$/.exec(p))) {
    const path = m[1].split("/").map(decodeURIComponent).join("/");
    if (path === "w/small.js") return resp(200, { encoding: "base64", content: b64(small), sha: "s1" });
    if (path === "w/big.js") return resp(200, { encoding: "none", content: "", sha: "b1", size: Buffer.byteLength(big) });
    if (path === "w/nosha.js") return resp(200, { encoding: "none", content: "" });
    return resp(404, { message: "Not Found" });
  }
  if ((m = /^\/git\/blobs\/(.+)$/.exec(p))) {
    if (state.blobStatus !== 200) return resp(state.blobStatus, { message: "x" });
    if (m[1] === "b1") return resp(200, { encoding: "base64", content: b64(big), sha: "b1" });
    return resp(404, { message: "Not Found" });
  }
  return resp(404, { message: "unscripted " + p });
}
const sb = { __name: (f) => f, timedFetch, EVOLVE_REPO: "QNFO/qnfo-workers", evGh: () => ({}), TextDecoder, Uint8Array, atob, encodeURIComponent, String };
vm.createContext(sb);
vm.runInContext(code + "\n__x = { cmRead, evReadFile };", sb);
const { cmRead, evReadFile } = sb.__x;

let r = await cmRead({}, "w/small.js", "head1");
ok(r.text === small && !r.via, "a file under 1 MB is read from the contents API", r);
ok(!state.calls.some((c) => c.indexOf("/git/blobs/") === 0), "no blob read for a small file", state.calls);

state.calls = [];
r = await cmRead({}, "w/big.js", "head1");
ok(r.text === big && r.via === "blob", "a file above 1 MB is read from the git blobs API by its sha, byte for byte", { len: r.text && r.text.length, via: r.via });
ok(state.calls.length === 2 && state.calls[1] === "/git/blobs/b1", "one contents read and one blob read", state.calls);

r = await cmRead({}, "w/missing.js", "head1");
ok(r.missing === true, "a missing file is still reported missing", r);

r = await cmRead({}, "w/nosha.js", "head1");
ok(r.tooLarge === true && r.text === undefined, "a contents answer with neither content nor sha is still too large", r);

state.blobStatus = 502;
r = await cmRead({}, "w/big.js", "head1");
ok(r.transient === true && /blob w\/big\.js HTTP 502/.test(r.why), "a failing blob read is transient, never 'too large'", r);
state.blobStatus = 200;

ok((await evReadFile({}, "w/big.js", "main")) === big, "evReadFile reads a file above 1 MB through the blob");
ok((await evReadFile({}, "w/small.js", "main")) === small, "evReadFile still reads a small file from the contents API");
ok((await evReadFile({}, "w/missing.js", "main")) === null, "evReadFile returns null for a missing file");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
