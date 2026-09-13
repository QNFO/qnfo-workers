# Source-verified findings — personal-companion/worker.js (2026-09-13)

Author: qnfo-ops. Every item below is quoted from the readable portion of
`personal-companion/worker.js` (sha `c06edffb22f3cefeed2d7568e1a7275f076320cc`, size
62,666 bytes) as returned by `github_repo_read`. Nothing here is inferred from prose.

**READ CEILING, stated up front:** the tool returned 32,768 characters and marked the rest
`...(truncated to 32768 chars)`. Requesting `maxChars: 70000` did not raise it. Everything
below the 32,768-byte mark — including the route handlers for `/`, `/p/<slug>`,
`/api/pieces`, `/feed.xml` and `/health` — is **not readable from this endpoint**, so no
patch for those routes can be written or reviewed here. That is a hard capability limit,
not a decision.

## 1. `authorized()` is fail-open — confirmed at line level

```js
function authorized(request, env) {
  var key = env.COMPANION_KEY || "";
  if (!key) return true;                 // <-- fail-OPEN
  var u = new URL(request.url);
  var q = u.searchParams.get("k") || "";
  var c = request.headers.get("Cookie") || "";
  var m = c.indexOf("pc_key=");
  var ck = m >= 0 ? c.slice(m + 7).split(";")[0] : "";
  return safeEqual(q, key) || safeEqual(ck, key);
}
```

With `COMPANION_KEY` unset — its live state — **every request is authorised**. This is not
an inference from the masthead reading "Private."; it is the source. It is also the
mechanism behind the keyless `/api/pieces` response verified live on 2026-09-13.

Consequence for sequencing: inverting this to fail-closed **before** `COMPANION_KEY` is set
would take the page down on the next deploy. Set the key first. The ordering objection
recorded in `REMEDIATION-2026-09-13.md` §5 is correct and this source confirms why.

## 2. The repo file is not what production runs

```js
var VERSION = "1.0.0";
```

Live `/health` reports **`version: "v1.1.0"`, `pieces: 7`**. The deployed worker is a
different build from the one in this directory. So `worker.js` here cannot be treated as
the source of truth for live behaviour, and a patch written against it may not apply.
`deployed-current.worker.js` is byte-identical to `worker.js` per the earlier reconciliation,
which means the repo holds two copies of a version production is not running.

## 3. `loadContinuity()` — the exact statement QRI-3 §2 asks to change

```js
var fb = await env.PERSONAL.prepare(
  "SELECT f.slug, f.signal, f.note, p.title FROM companion_feedback f LEFT JOIN companion_pieces p ON p.slug = f.slug ORDER BY f.id DESC LIMIT 12"
).all();
...
lines.push("HOW HE REACTED (this is the strongest signal you have)");
lines.push("- [" + fr[j].signal + "] " + squish(fr[j].title || fr[j].slug) + ...);
```

Three defects visible in four lines, all as described second-hand and now confirmed:

- `LEFT JOIN` — orphan slugs survive the join.
- `fr[j].title || fr[j].slug` — an orphan renders its **raw slug** into the briefing as if it
  were something the reader reacted to.
- `LIMIT 12` — the window is the newest 12 rows, and the label above it asserts they are
  *"the strongest signal you have"*. Measured 2026-09-13: of those 12 rows, **6 are
  machine-written** (probe ids fall in 1–42). The label is false for half the window.
  At the 45-row snapshot it was 9 of 12; the ratio decays as human rows accumulate, but
  tagging `source` does not fix the window itself.

## 4. `companion_feedback` has no `source` column

From `ensureSchema`:

```js
"CREATE TABLE IF NOT EXISTS companion_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, signal TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL)"
```

Confirms the `ALTER TABLE ... ADD COLUMN source` in QRI-1 §3 and QRI-3 §0 is genuinely
required, and that re-running it errors (SQLite has no `ADD COLUMN IF NOT EXISTS`), which
aborts the remainder of the batch.

## 5. Why the existing name check cannot see "Rowan" — the mechanism

`unverifiedNames()` already exists in the worker and is meant to catch names not present in
the anchors. It builds its candidates with `nameCandidates()`, which requires a **two-word
capitalised sequence**:

```js
if (sp !== 1 || !isCap(s, j)) continue;   // exactly one space, then a capital
var b = readWord(s, j);
if (b.w.length < 3 || STOP[b.w] === true) continue;
out.push(a.w + " " + b.w);
```

So the unit of detection is a bigram. A **single-word** personal name is never a candidate,
which is precisely why the published "Rowan" passed every automated check. This is the
mechanical cause of the one-word-name gap; the earlier session's measurement — that
loosening it to flag any capitalised token absent from the anchors produced **47 candidates
on the defect-free piece 12**, including `Only`, `High`, `Court`, `Eighty` — is the
mechanical consequence of the same design. The gap is real and the obvious fix is
unusable; a name list, not a case heuristic, is what would close it.

## 6. "Who is I" — answered from the generation prompt

`P_STYLE`, first line:

```js
"You are writing for one reader: Rowan.",
```

and later in the same prompt:

```js
"- self-reference as a model or assistant; no greeting, no sign-off, no signature, no footer",
"- meta-commentary about writing, essays, readers, publishing, or disclosure",
```

The prompt instructs the model to write **for** Rowan. The published essay writes **about**
him — "Rowan rated it 5 out of 5 for felt energy" — which is the addressee's name leaking
from the briefing into the piece. That is defect 1 of the errata, and this is its origin:
the instruction to address one reader, with nothing preventing the model from naming him.

The same prompt forbids meta-commentary about "readers", which is why the published text's
first person is unmarked — the writer is instructed not to identify itself, so "I" has no
referent in the prose and is supplied only by the briefing.

Also relevant to the errata's provenance claim: `P_CRITIQUE` opens *"You are an adversarial
reader. You dislike fluency. You are looking for reasons this piece is worthless."* and
`ACCEPT_FLOOR = 5`. That is why 6 of 7 live pieces carry `verdict: "reject"` — expected
output, not a withdrawal signal, exactly as QRI-1 §1 states.

## 7. What this addendum does not establish

- Nothing about the route handlers, because they are past the read ceiling. The `/api/pieces`
  exposure is verified live by HTTP, but its **code cannot be read or patched from here**.
- Nothing about whether production's v1.1.0 behaves as this file does. Item 1 is a statement
  about the repo source; live behaviour was verified separately and independently (the
  keyless 200 from `/api/pieces`).
- `wordCount()` in the worker counts runs of non-whitespace with whitespace defined as
  space, `\n`, `\r`, `\t`. The 2503 figure computed for QRI-2's correction used `split(/\s+/)`,
  which additionally matches other Unicode whitespace. For this ASCII text the two agree;
  they would diverge on a body containing a non-breaking space or an em-space.
