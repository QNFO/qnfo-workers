"""Tailoring + verification. Output lines are assembled ONLY from ledger text; the verifier
re-checks the finished artifact line by line against facts.json, so a bad edit cannot ship.

Tags (HTML comments at line end):  F:<id> verbatim fact text/pitch | H:<id> headline | J job-derived | S static | P person header
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = json.load(open(os.path.join(HERE, "facts.json"), encoding="utf-8"))
FACTS = {f["id"]: f for f in LEDGER["facts"]}
HEADS = {h["id"]: h for h in LEDGER["headlines"]}
P = LEDGER["person"]
STATIC = {
    "Hello,", "Best regards,", "## Experience highlights", "## Credentials",
    LEDGER["closing"], P["name"],
}
# technology / credential vocabulary the owner has NOT claimed: must never appear in output
FORBIDDEN_TERMS = ["kubernetes", "tensorflow", "pytorch", "java ", "rust", "golang", "aws", "azure", "gcp", "spark", "docker", "react", "tableau",
                   "power bi", "snowflake", "databricks", "scrum master", "six sigma", "cissp", "phd", "ph.d", "mba", "cfa", "security clearance", "fluent"]


def tag(line, t):
    return f"{line} <!--{t}-->"


def pick_facts(clusters, k=5):
    cl = set(clusters)
    scored = []
    for i, f in enumerate(LEDGER["facts"]):
        if f["id"] in ("F16", "F17"):
            continue
        s = len(cl & set(f["cluster"]))
        if s:
            scored.append((-s, i, f))
    scored.sort(key=lambda x: (x[0], x[1]))
    return [f for _, _, f in scored[:k]]


def headline(clusters):
    cl = set(clusters)
    a = len(cl & set(HEADS["H1"]["cluster"]) | cl & {"federal", "policy_research", "transport_modeling"})
    b = len(cl & set(HEADS["H2"]["cluster"]))
    return HEADS["H1"] if a > b else HEADS["H2"]


def job_terms(job, clusters, n=2):
    from match import CLUSTER_KW
    d = (job["desc"] + " " + job["title"]).lower()
    out = []
    for c in clusters:
        for kw in CLUSTER_KW.get(c, []):
            if kw.strip() in d and kw.strip() not in out and len(kw.strip()) > 4:
                out.append(kw.strip())
                break
        if len(out) >= n:
            break
    return out


def build_resume(job, m):
    facts = pick_facts(m["clusters"], 5)
    h = headline(m["clusters"])
    L = [tag("# " + P["name"], "P"), tag(f"{P['location']} | {P['email']} | {P['links']['site']} | {P['links']['linkedin']}", "P"),
         tag(f"Earlier work is published under {P['also_published_as']}.", "P"), "",
         tag(h["text"], "H:" + h["id"]), "", tag("## Experience highlights", "S")]
    L += [tag("- " + f["text"], "F:" + f["id"]) for f in facts]
    L += ["", tag("## Credentials", "S"), tag("- " + FACTS["F16"]["text"], "F:F16"), tag("- " + FACTS["F17"]["text"], "F:F17")]
    return "\n".join(L) + "\n"


def build_note(job, m):
    facts = pick_facts(m["clusters"], 3)
    terms = job_terms(job, m["clusters"])
    L = [tag("Hello,", "S"), "",
         tag(f"I am applying for the {job['title']} role at {job['company']}.", "J:title")]
    if terms:
        L.append(tag("The posting mentions " + " and ".join(f'"{t}"' for t in terms) + ", which is the work I have done:", "J:terms:" + "|".join(terms)))
    L.append("")
    L += [tag(f["pitch"], "F:" + f["id"]) for f in facts]
    L += ["", tag(LEDGER["closing"], "S"), "", tag("Best regards,", "S"), tag(P["name"], "S")]
    return "\n".join(L) + "\n"


def _nums(s):
    return set(re.findall(r"\d[\d,.]*\+?", s))


def verify(doc, job):
    """Return a list of violations (empty = verified)."""
    bad = []
    allowed_nums = set()
    for f in LEDGER["facts"]:
        allowed_nums |= _nums(f["text"]) | _nums(f["pitch"])
    for h in LEDGER["headlines"]:
        allowed_nums |= _nums(h["text"])
    allowed_nums |= _nums(json.dumps(P)) | _nums(job["title"]) | _nums(job["company"])
    jd = (job["desc"] + " " + job["title"]).lower()
    for n, raw in enumerate(doc.splitlines(), 1):
        if not raw.strip():
            continue
        m = re.match(r"^(.*?) <!--(.+)-->$", raw)
        if not m:
            bad.append(f"L{n}: untagged line: {raw[:60]}")
            continue
        text, t = m.group(1), m.group(2)
        kind = t.split(":")[0]
        if kind == "F":
            f = FACTS.get(t.split(":")[1])
            body = text[2:] if text.startswith("- ") else text
            if not f or body not in (f["text"], f["pitch"]):
                bad.append(f"L{n}: text does not equal ledger fact {t}")
        elif kind == "H":
            h = HEADS.get(t.split(":")[1])
            if not h or text != h["text"]:
                bad.append(f"L{n}: headline differs from ledger {t}")
        elif kind == "S":
            if text not in STATIC:
                bad.append(f"L{n}: static line not allowlisted: {text[:60]}")
        elif kind == "P":
            if not (text.startswith("# " + P["name"]) or P["email"] in text or text.startswith("Earlier work is published under")):
                bad.append(f"L{n}: person line not from ledger")
        elif kind == "J":
            if t == "J:title":
                if text != f"I am applying for the {job['title']} role at {job['company']}.":
                    bad.append(f"L{n}: job line altered")
            else:
                for term in re.findall(r'"([^"]+)"', text):
                    if term.lower() not in jd:
                        bad.append(f"L{n}: quoted term not in posting: {term}")
        else:
            bad.append(f"L{n}: unknown tag {t}")
    low = doc.lower()
    for term in FORBIDDEN_TERMS:
        if term in low and term.strip() not in (job["company"] + " " + job["title"]).lower():
            # allowed only if the owner's ledger itself contains it
            if term.strip() not in json.dumps(LEDGER).lower():
                bad.append(f"forbidden unclaimed term in output: {term.strip()}")
    for num in _nums(re.sub(r"<!--.*?-->", "", doc)):
        if num not in allowed_nums and num.rstrip(".,") not in {x.rstrip(".,") for x in allowed_nums}:
            bad.append(f"number not in ledger: {num}")
    return bad


def verify_freeform(text, fact_ids):
    """For any future LLM paraphrase: numbers and proper nouns must come from the cited facts."""
    src = " ".join(FACTS[i]["text"] + " " + FACTS[i]["pitch"] for i in fact_ids)
    bad = [f"number not in cited facts: {n}" for n in _nums(text) if n not in _nums(src)]
    caps = set(re.findall(r"\b[A-Z][A-Za-z.&]{2,}\b", text)) - {"The", "At", "And", "For", "With", "Hello", "Best", "Full"}
    bad += [f"entity not in cited facts: {c}" for c in caps if c not in src]
    return bad
