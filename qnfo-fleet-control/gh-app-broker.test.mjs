// GH-APP-BROKER-1 (qnfo-fleet-control 0.32.0) offline suite: the App JWT is a valid RS256 token signed with a PKCS#8 key, a PKCS#1
// key is refused with the conversion named, GitHub hosts are recognised, and the wiring swaps the token in on both entry points
// with a per-request fallback to the personal token. No network.
// Run: node qnfo-fleet-control/gh-app-broker.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { webcrypto, generateKeyPairSync, createVerify } from "node:crypto";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- GH-APP-BROKER-1:BEGIN"), b = src.indexOf("// ---- GH-APP-BROKER-1:END");
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x) : "")); if (!c) fails++; };
check(a > 0 && b > a, "the pure block is marked");
const sandbox = { crypto: webcrypto, TextEncoder, Uint8Array, btoa, atob, JSON, String, Math };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b) + "\n__export = { ghAppJwt, ghAppIsGithub, ghAppPemDer, GH_APP_FALLBACK_STATUS };", sandbox);
const { ghAppJwt, ghAppIsGithub, GH_APP_FALLBACK_STATUS } = sandbox.__export;

const kp = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const der = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", kp.privateKey));
const pem = "-----BEGIN PRIVATE KEY-----\n" + der.toString("base64").match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----\n";
const now = 1792000000;
const jwt = await ghAppJwt("123456", pem, now);
const [h, c, s] = jwt.split(".");
const dec = (x) => JSON.parse(Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
check(dec(h).alg === "RS256" && dec(h).typ === "JWT", "the header is RS256 JWT", dec(h));
const cl = dec(c);
check(cl.iss === "123456" && cl.iat === now - 60 && cl.exp === now + 540, "claims: iss is the App id, iat 60 s back, exp 9 minutes ahead", cl);
const ok = await webcrypto.subtle.verify("RSASSA-PKCS1-v1_5", kp.publicKey, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"), new TextEncoder().encode(h + "." + c));
check(ok, "the signature verifies with the public key");
check(!/[+/=]/.test(jwt), "the token is base64url without padding");
// GH-APP-PKCS1-1: the key GitHub actually issues is PKCS#1. It is converted to PKCS#8 and signs a valid JWT.
const kp1 = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pkcs1Pem = kp1.privateKey.export({ type: "pkcs1", format: "pem" });
check(/BEGIN RSA PRIVATE KEY/.test(pkcs1Pem), "the fixture really is a PKCS#1 key");
const jwt1 = await ghAppJwt("654321", pkcs1Pem, now);
const [h1, c1, s1] = jwt1.split(".");
const v1 = createVerify("RSA-SHA256");
v1.update(h1 + "." + c1);
v1.end();
check(v1.verify(kp1.publicKey, Buffer.from(s1.replace(/-/g, "+").replace(/_/g, "/"), "base64")),
  "a PKCS#1 key is converted to PKCS#8 and its JWT verifies (GH-APP-PKCS1-1)");
check(dec(c1).iss === "654321", "the PKCS#1-path JWT names the App id", dec(c1));
check(ghAppIsGithub("https://api.github.com/repos/QNFO/x") && ghAppIsGithub("https://raw.githubusercontent.com/QNFO/x/main/a") && !ghAppIsGithub("https://qnfo-ops.q08.workers.dev/health"), "GitHub API and raw hosts are recognised, fleet hosts are not");
check(ghAppIsGithub({ url: "https://api.github.com/user" }), "a Request object is recognised by its url");
check([401, 403, 404].every((x) => GH_APP_FALLBACK_STATUS.includes(x)), "401, 403 and 404 fall back to the personal token");

const d2 = src.indexOf("var worker_default2 = {");
const schedAt = src.indexOf("async scheduled(event, env, ctx) {", d2);
const fetchHead = src.slice(d2, d2 + 600), sched = src.slice(schedAt, src.indexOf('if (cron === "*/10 * * * *") {', schedAt));
check(/env = await ghAppEnv\(env\)/.test(fetchHead), "fetch swaps the App token in before any route");
check(/env = await ghAppEnv\(env\)/.test(sched), "scheduled swaps the App token in before any step");
check(/github_app_token_ok/.test(sched), "the tick writes github_app_token_ok");
check(/gh_app_primary/.test(src) && /=== "off"/.test(src.slice(src.indexOf("async function ghAppEnv"), src.indexOf("async function ghAppEnv") + 600)), "ops_config gh_app_primary = off restores the personal token");
check(/globalThis\.fetch = async function ghAppFetch/.test(src), "the per-request fallback wraps fetch");
const st = src.slice(src.indexOf("function ghAppStatus()"), src.indexOf("function ghAppStatus()") + 400);
check(!/ghAppCache\.token\b/.test(st), "GET /gh-app never reports token text");
const v = (/var VERSION = "([^"]+)"/.exec(src) || [])[1];
check(versionAtLeast(v, "0.32.0"), "VERSION is at least 0.32.0", v);
console.log(fails ? fails + " failed" : "all passed");
if (fails) process.exit(1);
