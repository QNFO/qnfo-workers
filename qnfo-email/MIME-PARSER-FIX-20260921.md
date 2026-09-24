# qnfo-email MIME parser fix — 2026-09-21

## Problem

Inbound emails `796` and `802` stored empty `body_text` / `body_html` despite authenticated delivery metadata. `796` was a Yahoo `multipart/alternative` message with `content-length: 8486`; `802` was text/plain quoted-printable. The live `qnfo-email` parser is too naive for these MIME shapes.

## Evidence

Affected rows in `qnfo-audit.emails`:

- `783` `arne@green-coding.io`, status `processed`, body_text length `1959` — strategic reply pending.
- `796` `jmichaelnicky@yahoo.fr`, status `processed`, body lengths `0/0`, `multipart/alternative`, DKIM/DMARC/SPF pass, spam score 0.
- `802` `alexandra_patelkoj@mail.com`, status `processed`, body lengths `0/0`, quoted-printable text/plain, DKIM/DMARC/SPF pass, spam score 0.

Live worker evidence:

- Worker: `qnfo-email`
- Live version observed: `2.0.6`
- Bindings to preserve: `AUDIT_DB`, `EVENTS`, `GATEWAY_EMAIL_KEY`, `INGEST_TOKEN`, `OPS_KEY`, `SEND_EMAIL`
- Live-only event/calendar forwarding hook exists and must be preserved.

Canonical repo evidence:

- `qnfo-email/worker.js` and `qnfo-email/deployed-current.worker.js` are version `2.0.5`, size `34773` bytes.
- Current `parseBody` locates multipart parts, then looks for body separator using literal `\n\n`; standard MIME frequently uses `\r\n\r\n`.
- Current quoted-printable handling only removes soft line breaks and does not decode hex escapes such as `=20`.

## Required patch

Target version: `2.0.7`.

Patch requirements:

1. Replace `parseBody(raw)` with a MIME parser that:
   - reads `rawText` once and returns it as `rawText`;
   - parses MIME headers case-insensitively;
   - splits header/body with `/\r?\n\r?\n/`;
   - supports `multipart/*` boundaries recursively;
   - collects `text/plain` and `text/html` leaf bodies;
   - decodes `quoted-printable` including hex escapes and soft line breaks;
   - decodes `base64` where possible;
   - falls back to decoded root body when no text/html leaf is found.
2. Preserve the live calendar/event forwarding hook:
   - use `parsed.rawText || ""`;
   - forward likely calendar/travel/invitation messages to `env.EVENTS.fetch("https://qnfo-events/ingest", ...)`.
3. Preserve suppression check in `/send` path.
4. Preserve all bindings via `cf_worker_deploy` binding-preserving deployment.

## Parser replacement

Use this replacement block from `async function parseBody(raw) {` through before `async function storeEmail`:

```js
async function parseBody(raw) {
  let bodyText = "", bodyHtml = "", rawText = "";
  try {
    rawText = await new Response(raw).text();
    const root = parseMimeEntity(rawText);
    const texts = [], htmls = [];
    collectMimeBodies(root, texts, htmls);
    bodyText = texts.join("\n\n").trim();
    bodyHtml = htmls.join("\n\n").trim();
    if (!bodyText && !bodyHtml) {
      bodyText = decodeTransfer(root.body || "", root.headers["content-transfer-encoding"] || "").trim();
    }
  } catch (e) { bodyText = "[parse: " + e.message + "]"; }
  return { bodyText: bodyText, bodyHtml: bodyHtml, rawText: rawText };
}

function parseMimeEntity(text) {
  const split = splitHeadersBody(String(text || ""));
  const headers = parseMimeHeaders(split.headers);
  const body = split.body;
  const ct = headers["content-type"] || "";
  const boundary = getMimeParam(ct, "boundary");
  const entity = { headers: headers, body: body, parts: [] };
  if (boundary && /multipart\//i.test(ct)) entity.parts = splitMultipart(body, boundary).map(parseMimeEntity);
  return entity;
}

function splitHeadersBody(text) {
  const m = /\r?\n\r?\n/.exec(text);
  if (!m) return { headers: "", body: text };
  return { headers: text.slice(0, m.index), body: text.slice(m.index + m[0].length) };
}

function parseMimeHeaders(block) {
  const out = {};
  let cur = "";
  for (const line of String(block || "").split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && cur) cur += " " + line.trim();
    else {
      if (cur) addMimeHeader(out, cur);
      cur = line;
    }
  }
  if (cur) addMimeHeader(out, cur);
  return out;
}
function addMimeHeader(out, line) {
  const i = line.indexOf(":");
  if (i > -1) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
}
function getMimeParam(header, name) {
  const re = new RegExp("(?:^|;)\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*(?:\\\"([^\\\"]*)\\\"|([^;\\s]*))", "i");
  const m = String(header || "").match(re);
  return m ? (m[1] || m[2] || "") : "";
}
function splitMultipart(body, boundary) {
  const marker = "--" + boundary;
  const parts = [];
  for (const seg of String(body || "").split(marker).slice(1)) {
    if (seg.startsWith("--")) break;
    const clean = seg.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (clean.trim()) parts.push(clean);
  }
  return parts;
}
function collectMimeBodies(entity, texts, htmls) {
  if (!entity) return;
  if (entity.parts && entity.parts.length) { for (const p of entity.parts) collectMimeBodies(p, texts, htmls); return; }
  const ct = (entity.headers["content-type"] || "text/plain").toLowerCase();
  const enc = entity.headers["content-transfer-encoding"] || "";
  const decoded = decodeTransfer(entity.body || "", enc).trim();
  if (!decoded) return;
  if (ct.indexOf("text/html") >= 0) htmls.push(decoded);
  else if (ct.indexOf("text/plain") >= 0 || !ct) texts.push(decoded);
}
function decodeTransfer(body, enc) {
  enc = String(enc || "").toLowerCase();
  if (enc.indexOf("base64") >= 0) {
    try { return atob(String(body || "").replace(/\s+/g, "")); } catch (e) { return String(body || ""); }
  }
  if (enc.indexOf("quoted-printable") >= 0) return decodeQuotedPrintable(String(body || ""));
  return String(body || "");
}
function decodeQuotedPrintable(s) {
  return String(s || "").replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); });
}
```

## Regression tests already run server-side

`node --check worker.js` passed on patched bundle.

Regression output:

- multipart quoted-printable: `bodyText === "Hello Rowan!"`, `bodyHtml === "<p>Hello</p>"`, `rawText` retained.
- plain quoted-printable: `bodyText === "prototype to small-batch production?"`.

Patched bundle details from container:

- length: `38071`
- sha256: `c3fb310fc4347742055e224535c9c30d7f511e845d7444edffce2169e113ce04`
- event hook present: yes
- rawText return present: yes

## Deployment blocker encountered

The patched bundle could be built and tested in the Cloudflare container, but the qnfo-ops tool path truncated stdout at 16,384 chars and repeated chunk-transfer attempts were output-limited. Therefore no safe `cf_worker_deploy` call was made in that session; live worker remained untouched rather than risking a truncated deploy.

## Post-deploy verification checklist

1. `cf_worker_deploy(worker="qnfo-email", content=<complete 38071-byte bundle>, version="2.0.7")`.
2. Verify `/health` reports `version: "2.0.7"`.
3. Confirm bindings still include `AUDIT_DB`, `EVENTS`, `GATEWAY_EMAIL_KEY`, `INGEST_TOKEN`, `OPS_KEY`, `SEND_EMAIL`.
4. Send or inject a multipart CRLF + quoted-printable test message; verify nonzero `body_text`.
5. Check that future messages no longer store empty bodies when `content-length` is nonzero.
