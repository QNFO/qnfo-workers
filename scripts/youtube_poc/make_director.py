#!/usr/bin/env python3
"""YT-POC-4: plain-language article -> director spec (beats JSON) with an LLM writer and a claim checker.

  python -I make_director.py <paper-slug> [--out directors/<slug>.json] [--beats 8]
Writer: qnfo-ai (open chat endpoint, model "qnfo") gets the article, the template catalogue and speech-writing rules.
Checks (a beat that fails is dropped, never repaired silently; the hook and the call to action are always kept):
  1. schema: kind known, required fields present, strings fit their length budget;
  2. numbers: every number in the narration, labels and numeric params must occur in the article (digits or words);
  3. words: sentences of at most 18 words, no URL, no unexplained jargon list from the article's glossary-less rule (checker LLM, second call, different prompt).
A report is written beside the spec (<name>.report.json) with every drop and its reason.
"""
import argparse, json, re, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from make_video import fetch_article  # noqa: E402

AI = "https://qnfo-ai.q08.workers.dev/v1/chat/completions"
AI_FALLBACK = "https://ai.qnfo.org/v1/chat/completions"

# kind -> (required keys, what it shows). The scene (short_scene.py) implements each of these.
CATALOGUE = {
    "hook":    (["lines"], 'big words pop in, e.g. {"kind":"hook","lines":["What if science","paid more for","STORIES","than for","TESTS?"],"hi":[2,4]}; "hi" = indices shown in the accent colour; max 5 lines of at most 16 characters'),
    "versus":  (["left", "right"], 'two cards: {"left":"Testable guess","right":"Safe story"} (each at most 18 characters)'),
    "payoff":  (["bars"], 'signed bars: {"bars":[[-2.4,2,"c1","Guess: right"],[0,-1,"c3","Guess: wrong"],[2.4,1,"c2","Story: always"]]} = [x (-2.4,0,2.4), value (-3..3), colour c1/c2/c3, label]'),
    "meter":   (["need", "have", "need_label", "have_label", "axis_label", "verdict"], 'marker climbs towards a threshold: need/have are fractions 0..1; labels at most 24 characters'),
    "dots":    (["from", "to", "a", "b"], '20 dots changing mix: from/to fractions 0..1, a/b group names (at most 14 characters)'),
    "bignum":  (["value", "label"], 'ring + counting number: {"value":350,"frac":1.0,"color":"c1","label":"bits per second","sub":"normal state"}; frac = ring fill 0..1'),
    "flow":    (["nodes"], 'boxes joined by arrows, 2-4 nodes of at most 22 characters: {"nodes":["Source","Filter","Experience"]}'),
    "compare": (["items"], 'horizontal bars: {"title":"...","items":[["Bandwidth",0.68,"c1","a third less"],["Clarity",0.5,"c2","half"]]} = [label, fraction 0..1, colour, value text]; 2-3 items'),
    "list":    (["items"], '2-4 numbered points of at most 38 characters: {"title":"Two dials","items":["...","..."]}'),
    "cta":     ([], "last beat only, added by the tool; do not write it"),
}
NUMS = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
        "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
        "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
SCALE = {"hundred": 100, "thousand": 1000, "million": 10**6}
MAX_WORDS = 160   # about 60 s at the narrator pace; retention drops sharply after that
STR_LIMITS = {"left": 18, "right": 18, "need_label": 24, "have_label": 24, "axis_label": 40, "verdict": 20, "a": 14, "b": 14, "label": 30, "sub": 40, "title": 30}


def numbers_in(text):
    """Every number in text as a float: digits ('350', '2.5', '10,000') and spelled words ('three hundred and fifty', 'six in ten' -> 6, 10)."""
    out = {float(m.replace(",", "")) for m in re.findall(r"\d[\d,]*\.?\d*", text) if m.strip(",.")}
    cur, seen = None, False
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in NUMS:
            cur = (cur or 0) + NUMS[w]; seen = True
        elif w in SCALE and seen:
            cur = (cur or 1) * SCALE[w] if cur and cur < SCALE[w] else (cur or 1) * SCALE[w]
        elif w == "and" and seen:
            continue
        else:
            if seen: out.add(float(cur))
            cur, seen = None, False
    if seen: out.add(float(cur))
    # also each component word on its own ('six in ten' is two numbers, 'three hundred and fifty' also contains 3, 50, 350)
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in NUMS: out.add(float(NUMS[w]))
    return out


def beat_strings(b):
    vals = []
    def walk(x):
        if isinstance(x, str): vals.append(x)
        elif isinstance(x, (list, tuple)):
            for y in x: walk(y)
        elif isinstance(x, dict):
            for y in x.values(): walk(y)
    for k, v in b.items():
        if k not in ("kind", "exit", "rate"): walk(v)
    return vals


def check_beat(b, article_nums, article_text):
    """Return a reason string when the beat must be dropped, else None."""
    kind = b.get("kind")
    if kind not in CATALOGUE or kind == "cta":
        return f"unknown kind {kind!r}"
    for k in CATALOGUE[kind][0]:
        if k not in b:
            return f"missing {k}"
    if not b.get("narr") or len(b["narr"]) > 330:
        return "narr missing or over 330 characters"
    for s in re.split(r"(?<=[.!?])\s+", b["narr"]):
        if len(s.split()) > 18:
            return f"sentence over 18 words: {s[:60]}"
    if re.search(r"https?://|\.org|\.com|dot org", b["narr"], re.I):
        return "narration speaks a URL"
    for k, lim in STR_LIMITS.items():
        if isinstance(b.get(k), str) and len(b[k]) > lim:
            return f"{k} over {lim} characters"
    if kind == "hook" and (len(b["lines"]) > 5 or any(len(x) > 18 for x in b["lines"])):
        return "hook lines too long or too many"
    if kind == "flow" and not 2 <= len(b["nodes"]) <= 4:
        return "flow needs 2-4 nodes"
    if kind in ("list",) and not 2 <= len(b["items"]) <= 4:
        return "list needs 2-4 items"
    if kind == "compare" and not 2 <= len(b["items"]) <= 3:
        return "compare needs 2-3 items"
    if kind == "bignum":
        try: float(b["value"])
        except Exception: return "bignum value not numeric"
        if float(b["value"]) not in article_nums:
            return f"bignum value {b['value']} is not in the article"
    # numbers: everything the viewer hears or reads must come from the article
    for s in beat_strings(b):
        for n in numbers_in(s):
            if n not in article_nums and n not in (1.0, 2.0, 3.0, 4.0):  # list/step counts and "two dials" style words are not claims
                return f"number {n:g} not in the article (in: {s[:50]!r})"
    return None


def call(messages, max_tokens=24000):   # the router model reasons first; a small cap is spent before any answer appears
    import time
    last = None
    for wait in (0, 90, 180, 300):        # public endpoint is rate limited per address: back off on 429/5xx
        time.sleep(wait)
        for url in (AI, AI_FALLBACK):
            try:
                req = urllib.request.Request(url, data=json.dumps({"model": "qnfo", "messages": messages, "max_tokens": max_tokens, "temperature": 0.7}).encode(),
                                             headers={"content-type": "application/json", "user-agent": "qnfo-yt-director"})
                return json.load(urllib.request.urlopen(req, timeout=420))["choices"][0]["message"]["content"]
            except Exception as e:
                last = e
    raise RuntimeError(f"qnfo-ai unreachable: {last}")


def parse_json(txt):
    txt = txt.replace("�", "-")
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        raise ValueError("no JSON object in reply")
    return json.loads(m.group(0))


def writer_prompt(art, nbeats):
    cat = "\n".join(f'- {k}: {d}' for k, (_, d) in CATALOGUE.items() if k != "cta")
    body = "\n\n".join(f"## {s['heading']}\n{s['text']}" for s in art["sections"])
    return f"""You write a 35-55 second vertical YouTube Short (a voice-over plus one animated diagram per beat) from a plain-language science article.
Reply with ONE JSON object only: {{"title": "...", "beats": [...]}}. No prose, no code fences. Do not deliberate at length: plan briefly, then write the JSON.

HARD RULES
- Use ONLY facts and numbers that are in the article below. Never add a number, name, study or claim that is not there. Keep its caveats (assumptions, what it does not show) in one beat.
- {nbeats} beats and 110-150 spoken words IN TOTAL (a Short people finish is 40-55 seconds). Beat 1 is kind "hook": a concrete, surprising claim or question from the article in under 12 spoken words, no greeting, no "welcome". Then build one idea per beat. Penultimate beat states the honest limit. Do not write the closing call to action; the tool adds it.
- Every beat has "narr": what the narrator says. Write for the ear: contractions, sentences of at most 15 words, vary length, use commas and question marks where a speaker would change pitch, spell numbers as words in narr ("three hundred and fifty", "two in three"), no URLs, no brackets, no jargon without a plain gloss.
- Pick a DIFFERENT template for most beats; never use the same kind three times; use at least 4 different kinds. Fit the picture to the idea (a change over time or in mix -> dots or compare; a quantity -> bignum; a process or chain -> flow; a contrast -> versus; a checklist or caveats -> list).
- Strings shown on screen are short. Numbers on screen must match the article exactly.
- Optional per beat: "rate": "+0%" (slower) to "+8%" for emphasis.

TEMPLATES (kind: what it shows and its fields)
{cat}

ARTICLE TITLE: {art['title']}
SHORT VERSION: {art['short']}

{body}
"""


def checker_prompt(art, beats):
    return f"""You fact-check narration for a science video against its source article. For EACH beat decide if every claim is supported by the article (paraphrase is fine; a new fact, a stronger claim, a dropped 'assumed' or 'model' qualifier, or an invented number is NOT).
Reply with ONE JSON object only: {{"verdicts":[{{"i":0,"ok":true,"why":""}}, ...]}}, one entry per beat in order.

ARTICLE:
{art['short']}
""" + "\n".join(f"{s['heading']}: {s['text']}" for s in art["sections"]) + "\n\nBEATS:\n" + "\n".join(f"{i}: {b['narr']}" for i, b in enumerate(beats))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug"); ap.add_argument("--out"); ap.add_argument("--beats", type=int, default=8); ap.add_argument("--tries", type=int, default=3)
    ap.add_argument("--no-llm-check", action="store_true")
    ap.add_argument("--recheck", help="re-run the LLM fact-check on an existing director JSON and report")
    a = ap.parse_args()
    art = fetch_article(a.slug)
    if a.recheck:
        beats = [b for b in json.load(open(a.recheck, encoding="utf8"))["beats"] if b["kind"] != "cta"]
        v = parse_json(call([{"role": "user", "content": checker_prompt(art, beats)}], 16000))["verdicts"]
        print(json.dumps([x for x in v if not x.get("ok", True)] or "all beats supported", indent=1)); return
    full = " ".join([art["title"], art["short"]] + [s["text"] for s in art["sections"]])
    nums = numbers_in(full)
    drops, spec, kept, beats = [], None, [], []
    msgs = [{"role": "user", "content": writer_prompt(art, a.beats)}]
    for attempt in range(a.tries):            # write -> check -> (if the hook or too many beats fell) rewrite with the checker's reasons
        raw = ""
        try:
            raw = call(msgs)
            spec = parse_json(raw)
            beats = spec["beats"]
        except Exception as e:
            drops.append({"attempt": attempt, "error": str(e)[:200], "reply_head": raw[:200]})
            continue
        kept, round_drops = [], []
        for i, b in enumerate(beats):
            why = check_beat(b, nums, full)
            if why:
                round_drops.append({"attempt": attempt, "beat": i, "kind": b.get("kind"), "stage": "deterministic", "why": why})
            else:
                kept.append(b)
        if not a.no_llm_check and kept:
            verdicts = None
            for _ in range(3):                 # a checker reply that does not parse is retried; it is never skipped silently
                try:
                    verdicts = parse_json(call([{"role": "user", "content": checker_prompt(art, kept)}], 16000))["verdicts"]
                    break
                except Exception as e:
                    round_drops.append({"attempt": attempt, "stage": "llm-checker", "why": f"checker reply unusable, retrying: {e}"[:200]})
            if verdicts is None:
                kept = []                      # fail closed: unchecked beats are not accepted
            else:
                bad = {v["i"]: v.get("why", "") for v in verdicts if not v.get("ok", True)}
                for i in sorted(bad, reverse=True):
                    round_drops.append({"attempt": attempt, "beat": i, "kind": kept[i].get("kind"), "stage": "llm-checker", "why": bad[i][:200]})
                    del kept[i]
        words = sum(len(b["narr"].split()) for b in kept)
        if kept and words > MAX_WORDS:
            round_drops.append({"attempt": attempt, "stage": "length", "why": f"narration is {words} words; cut to at most {MAX_WORDS - 10} by merging or removing the least important beats"})
            kept = []                          # too long to ship: rewrite, never trim silently
        drops += round_drops
        if kept and kept[0].get("kind") == "hook" and len(kept) >= 5:
            break
        msgs = [{"role": "user", "content": writer_prompt(art, a.beats)}, {"role": "assistant", "content": raw},
                {"role": "user", "content": "A fact-checker rejected these beats (index: reason):\n" + "\n".join(f"{d.get('beat')}: {d['why']}" for d in round_drops)
                 + "\nRewrite the WHOLE JSON, fixing exactly those problems: state only what the article supports, keep the 'assumed'/'model' qualifiers, and keep a strong hook as beat 1."}]
    if not kept or kept[0].get("kind") != "hook":
        raise SystemExit(f"hook beat missing or dropped after {a.tries} rounds; report: {drops}")
    if len(kept) < 5:
        raise SystemExit(f"only {len(kept)} beats survived the checks; report: {drops}")
    kept.append({"kind": "cta", "narr": "Want the full story, in plain language? It's free, and the link is in the description.",
                 "title": "Read it free", "url": "papers.qnfo.org", "sub": "No jargon. No mathematics."})
    out = Path(a.out or HERE / "directors" / f"{a.slug[:40].rstrip('-')}.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"slug": a.slug, "title": str(spec.get("title") or art["title"])[:80], "beats": kept}, indent=1, ensure_ascii=False), "utf8")
    out.with_suffix(".report.json").write_text(json.dumps({"written": len(beats), "kept": len(kept) - 1, "drops": drops,
                                                          "kinds": [b["kind"] for b in kept]}, indent=1), "utf8")
    print(f"OK {out}: {len(kept) - 1} beats kept of {len(beats)}, {len(drops)} drops, kinds {[b['kind'] for b in kept]}")


if __name__ == "__main__":
    main()
