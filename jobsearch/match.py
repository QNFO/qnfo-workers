"""Deterministic, explainable matching. Hard gates first, then score; every score has reasons.

Optional LLM layer (rerank_llm) may only reorder/annotate; it never writes claims.
"""
import re

CLUSTER_KW = {
    "research_mgmt": ["research program", "research portfolio", "research operations", "research management", "program management", "research strategy", "head of research", "research lead"],
    "federal": ["federal government", "federal agenc", "government agenc", "public sector", "public administration", "government"],
    "transport_modeling": ["transportation", "travel demand", "mobility", "urban planning", "transit", "forecasting"],
    "policy_research": ["public policy", "policy research", "survey", "social science", "evidence-based"],
    "ai_systems": ["llm", "large language model", "ai agent", "agentic", "generative ai", "applied ai", "machine learning", "ai evaluation", "evals", "rag "],
    "research_integrity": ["research integrity", "reproducib", "peer review", "scientific integrity", "open science", "provenance", "responsible ai", "ai governance", "ai safety", "audit", "trustworthy"],
    "data_product": ["data product", "data platform", "analytics"],
    "quantum_energy": ["quantum", "energy efficiency", "benchmark"],
    "nonprofit": ["nonprofit", "non-profit", "civil society"],
    "product": ["product manager", "product management", "roadmap"],
    "data_science": ["data science", "data scientist"],
}
TITLE_STRONG = ["research manager", "research program", "head of research", "director of research", "research director", "research operations",
                "research integrity", "ai governance", "ai policy", "research lead", "data product", "ai evaluation", "research strategy",
                "program manager, research", "research partnerships", "science policy", "responsible ai", "trust and safety research"]
TITLE_MEDIUM = ["product manager", "program manager", "principal", "director", "head of", "lead", "research", "policy", "strategist"]
TITLE_EXCLUDE = ["intern", "junior", "entry", "graduate", "new grad", "apprentice", "sales", "scientist", "account executive", "recruiter", "counsel", "attorney",
                 "engineer", "architect", "solutions", "customer success", "devops", "site reliability", "security engineer", "designer", "marketing", "finance", "accountant", "payroll"]
LOC_OK = ["amsterdam", "netherlands", "nederland", "europe", "emea", "eu ", "worldwide", "anywhere", "global", "remote"]
LOC_BAD_REMOTE = ["us only", "united states only", "us-only", "usa only", "canada only", "uk only", "india only", "latam", "apac only"]
CORE = {"federal", "policy_research", "transport_modeling", "research_mgmt"}
FRONTIER = {"ai_systems", "research_integrity"}


def _has(text, kws):
    return [k for k in kws if k in text]


def clusters_in(desc, title=""):
    """A cluster counts only on 2+ distinct keyword hits, or 1 hit in the title (single mentions are noise)."""
    t, ti = desc.lower(), title.lower()
    return {c for c, kws in CLUSTER_KW.items() if len(_has(t, kws)) >= 2 or _has(ti, kws)}


HOME = ["amsterdam", "netherlands", "nederland", "rotterdam", "utrecht", "eindhoven", "the hague", "europe", "emea", "european", "eu ", "eu-", "worldwide", "anywhere", "global"]
EUROPE_OTHER = ["germany", "berlin", "munich", "france", "paris", "london", "uk", "united kingdom", "ireland", "dublin", "spain", "madrid", "barcelona", "portugal", "lisbon",
                "italy", "belgium", "brussels", "denmark", "copenhagen", "sweden", "stockholm", "norway", "oslo", "finland", "helsinki", "austria", "vienna", "switzerland", "zurich", "poland", "warsaw", "czech", "prague"]


def location_gate(loc, desc_head):
    l = (loc or "").lower() + " "
    if not l.strip():
        return "check", "location missing"
    if any(b in l for b in LOC_BAD_REMOTE):
        return "fail", f"location restricted: {loc}"
    if "united states" in l and "remote" in l and not any(k in l for k in HOME):
        return "ok", f"US-based remote; owner authorized in US ({loc})"
    if any(k in l for k in HOME):
        return "ok", loc
    if any(re.search(r"\b" + re.escape(k) + r"\b", l) for k in EUROPE_OTHER):
        return "check", f"Europe but not NL; relocation or employer-of-record unverified ({loc})"
    if re.sub(r"[^a-z]", "", l) in ("remote", "remoteremote"):
        if re.search(r"(must|should) (be )?(located|based|reside) in the (u\.?s|united states|uk|canada)", desc_head.lower()):
            return "fail", "remote but posting requires US/UK/CA residence"
        return "check", "remote, region unspecified"
    if re.search(r"\b(us|usa|united states|san francisco|new york|seattle|washington|boston|austin|chicago|los angeles|palo alto|mountain view|menlo park|sf|nyc|dc)\b|, (ca|ny|wa|ma|tx|il|dc)\b", l):
        return "check", f"US on-site/hybrid: relocation from Amsterdam, owner says negotiable ({loc})"
    return "check", f"Elsewhere: owner will relocate but is authorized only in NL/US; visa needed ({loc})"


def evaluate(job):
    title = job["title"].lower()
    desc = job["desc"]
    why, flags, loc_pen = [], [], 0
    if any(x in title for x in ("intern", "junior", "entry", "graduate", "new grad", "apprentice", "trainee", "engineer", "architect")):
        return {"status": "excluded", "reason": "seniority below target"}
    if any(x in title for x in TITLE_EXCLUDE) and not any(s in title for s in TITLE_STRONG):
        return {"status": "excluded", "reason": "role family excluded by title"}
    strong = _has(title, TITLE_STRONG)
    medium = _has(title, TITLE_MEDIUM)
    if not strong and not medium:
        return {"status": "excluded", "reason": "title not in target families"}
    gate, loc_note = location_gate(job["location"], desc[:3000])
    if gate == "fail":
        return {"status": "excluded", "reason": loc_note}
    if gate == "check":
        flags.append("LOCATION: " + loc_note)
        loc_pen = 15 if loc_note.startswith(("Elsewhere", "Europe")) else 10
    cl = clusters_in(desc, job["title"])
    t_score = 40 if strong else 20 if len(medium) >= 2 or "research" in medium else 12
    e_score = min(45, 9 * len(cl))
    unique = bool(cl & CORE) and bool(cl & FRONTIER)
    u_score = 15 if unique else 0
    if strong:
        why.append(f"title match: {strong[0]}")
    elif medium:
        why.append(f"title family: {', '.join(medium[:2])}")
    why.append("evidence clusters: " + ", ".join(sorted(cl)) if cl else "no evidence clusters")
    if unique:
        why.append("uncommon intersection: research-program or policy-research management + AI or research-integrity systems")
    score = t_score + e_score + u_score - loc_pen
    low = desc.lower()
    if re.search(r"ph\.?d\.?[^.\n]{0,40}(required|must)|(required|must)[^.\n]{0,40}ph\.?d", low):
        flags.append("DEGREE: PhD appears required; owner holds M.S.")
        score -= 20
    if re.search(r"security clearance|u\.?s\.? citizen", low):
        flags.append("AUTH: clearance/citizenship language present")
    if re.search(r"right to work|work authori[sz]ation|visa sponsorship|eligible to work", low):
        if loc_note and gate == "check" and not loc_note.startswith("US"):
            flags.append("AUTH: work-authorization language; owner is authorized in NL and US only")
    lang = re.findall(r"(?:fluen\w*|proficien\w*|native)[^.\n]{0,30}\b(german|dutch|french|spanish|italian|japanese|korean|mandarin|portuguese|hindi)", low)
    if lang:
        flags.append("LANGUAGE: posting asks for " + ", ".join(sorted(set(lang))) + "; owner lists English only")
    yrs = [int(x) for x in re.findall(r"(\d{1,2})\+?\s*(?:or more )?years", low)]
    if yrs and max(yrs) > 22:
        flags.append(f"YEARS: asks {max(yrs)}+ years")
    tier = "A" if score >= 70 and cl else "B" if score >= 45 else "C"
    return {"status": "ok", "score": score, "tier": tier, "clusters": sorted(cl), "unique": unique, "why": why, "flags": flags}


def rank(jobs):
    ok, excl = [], {}
    for j in jobs:
        r = evaluate(j)
        if r["status"] == "ok" and r["tier"] != "C":
            ok.append({**j, "match": r})
        else:
            k = r.get("reason", "score below threshold")
            k = re.sub(r":.*", "", k)
            excl[k] = excl.get(k, 0) + 1
    ok.sort(key=lambda j: -j["match"]["score"])
    return ok, excl
