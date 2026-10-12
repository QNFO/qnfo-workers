#!/usr/bin/env python3
"""NO-ZENODO-DOI-5 offline suite for scripts/cf_ops_actions.py noz-scrub-bodies (agent_issues 2278, umbrella 2273).

Proves the pure rewrite noz_scrub(): front-matter doi and superseded_by rules, doi.org links mapped and unmapped, the reference-entry
forms, the **DOI:** self line, each standalone-word shape, fenced code untouched except for link and DOI rewrites, change counts,
an empty leftover list and idempotence (a second scrub changes nothing). Then drives noz_scrub_bodies() against a fake d1q: dry
writes nothing; live creates the backup table before any UPDATE and every UPDATE carries the old body as its predicate.
Run: python3 scripts/cf_ops_noz_scrub_test.py   -> prints "N passed, 0 failed"
"""
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("cf_ops_actions", HERE / "cf_ops_actions.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

passed = failed = 0


def ok(cond, msg, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL", msg, json.dumps(extra, default=str)[:500] if extra is not None else "")


DOI_MAP = {"10.5281/zenodo.111": "alpha-paper", "10.5281/zenodo.222": "beta-paper", "10.5281/zenodo.333": "gamma-paper"}
P = "https://papers.qnfo.org/papers"


def scrub(text, self_slug="alpha-paper", doi_map=DOI_MAP):
    return m.noz_scrub(text, doi_map, self_slug)


# 1. front matter: doi emptied, superseded_by mapped to a slug or removed, a registrar-named key removed, other lines kept
fm = '---\ntitle: "T"\ndoi: "10.5281/zenodo.111"\nsuperseded_by: "10.5281/zenodo.222"\nstatus: "published"\n---\n\nBody.\n'
new, n, left = scrub(fm)
ok(new == '---\ntitle: "T"\ndoi: ""\nsuperseded_by: "beta-paper"\nstatus: "published"\n---\n\nBody.\n', "front matter: doi emptied and superseded_by mapped to the slug", new)
ok(n == 2 and left == [], "front matter: two changes, no leftover", (n, left))
new, n, left = scrub('---\ndoi: "10.5281/zenodo.999"\nsuperseded_by: "10.5281/zenodo.999"\nzenodo_doi: "10.5281/zenodo.111"\nkeep: 1\n---\nx\n')
ok(new == '---\ndoi: ""\nkeep: 1\n---\nx\n', "front matter: an unmapped superseded_by line and a registrar-named key are removed", new)
ok(n == 3 and left == [], "front matter: three changes, no leftover", (n, left))
new, n, left = scrub('---\nrecord: "https://doi.org/10.5281/zenodo.222"\n---\n')
ok(new == '---\nrecord: "%s/beta-paper/"\n---\n' % P and left == [], "front matter: any other value takes the URL rewrite", new)
new, n, left = scrub('Intro\n---\ndoi: "10.5281/zenodo.111"\n---\n')
ok(new == 'Intro\n---\ndoi: "%s/alpha-paper/"\n---\n' % P, "a --- block that is not at the top is body text, not front matter", new)

# 2. doi.org links, mapped and unmapped, http and https, trailing slash
new, n, left = scrub("See https://doi.org/10.5281/zenodo.222 and http://doi.org/10.5281/zenodo.333/ and https://doi.org/10.5281/zenodo.777 here.")
ok(new == "See %s/beta-paper/ and %s/gamma-paper/ and %s here." % (P, P, P), "doi.org links map to the paper page or the index", new)
ok(n == 3 and left == [], "three link changes, no leftover", (n, left))
new, n, left = scrub("A [10.5281/zenodo.222](https://doi.org/10.5281/zenodo.222) and [the record](https://doi.org/10.5281/zenodo.333).")
ok(new == "A %s/beta-paper/ and [the record](%s/gamma-paper/)." % (P, P), "a markdown link whose label is the DOI becomes the bare URL; another label is kept", new)
new, n, left = scrub("Record https://zenodo.org/records/222 and https://zenodo.org/record/555 and https://zenodo.org/communities/x.")
ok(new == "Record %s/beta-paper/ and %s and %s." % (P, P, P) and left == [], "zenodo.org URLs map by record id or fall back to the index", new)

# 3. reference-entry forms
new, n, left = scrub("Quni, R. (2026). *Title*. Zenodo. 10.5281/zenodo.222.")
ok(new == "Quni, R. (2026). *Title*. QNFO. %s/beta-paper/." % P, "Zenodo. <doi>. -> QNFO. <url>.", new)
new, n, left = scrub("Quni, R. (2026). *Title*. Zenodo. https://doi.org/10.5281/zenodo.888")
ok(new == "Quni, R. (2026). *Title*. QNFO. %s" % P, "Zenodo. <doi.org link> unmapped -> QNFO. <index>", new)
new, n, left = scrub("Smith (2025). Thing. DOI 10.5281/zenodo.333.")
ok(new == "Smith (2025). Thing. %s/gamma-paper/." % P, "DOI <doi>. -> <url>.", new)
new, n, left = scrub("Smith (2025). Thing. DOI: 10.5281/zenodo.333")
ok(new == "Smith (2025). Thing. %s/gamma-paper/" % P, "DOI: <doi> -> <url>", new)
new, n, left = scrub("Smith (2025). Thing. doi:10.5281/zenodo.444")
ok(new == "Smith (2025). Thing. %s" % P, "doi:<doi> unmapped -> index", new)
ok(left == [], "reference forms leave nothing", left)

# 4. **DOI:** line: the paper's own DOI -> its own page; another paper's -> that page; unmapped -> index
new, n, left = scrub("**DOI:** 10.5281/zenodo.111\n\ntext")
ok(new == "**URL:** %s/alpha-paper/\n\ntext" % P and n == 1, "**DOI:** own DOI -> **URL:** own page", new)
new, n, left = scrub("**DOI:** https://doi.org/10.5281/zenodo.222", self_slug="alpha-paper")
ok(new == "**URL:** %s/beta-paper/" % P, "**DOI:** another paper's DOI -> that paper's page", new)
new, n, left = scrub("**DOI:** 10.5281/zenodo.999", self_slug="alpha-paper")
ok(new == "**URL:** %s" % P, "**DOI:** unmapped -> index", new)
new, n, left = scrub("- **DOI:** `10.5281/zenodo.111`")
ok(new == "- **URL:** %s/alpha-paper/" % P, "a backticked **DOI:** value is rewritten too", new)

# 5. any remaining bare token, including a placeholder id
new, n, left = scrub("Cite 10.5281/zenodo.222 or 10.5281/zenodo.XXXXXXX or 10.5281/zenodo.")
ok(new == "Cite %s/beta-paper/ or %s or %s." % (P, P, P) and left == [], "bare DOI tokens map, a placeholder or bare prefix falls back to the index", new)

# 6. standalone word shapes
new, n, left = scrub("Published (Zenodo) in 2026.")
ok(new == "Published in 2026." and n == 1, "(Zenodo) removed with the spaces normalised", new)
new, n, left = scrub("The Zenodo DOI and all Zenodo DOIs resolve.")
ok(new == "The DOI and all DOIs resolve." and n == 2, "Zenodo DOI(s) -> DOI(s)", new)
new, n, left = scrub("Deposited on Zenodo, available via Zenodo and at Zenodo. On Zenodo it lives.")
ok(new == "Deposited at papers.qnfo.org, available at papers.qnfo.org and at papers.qnfo.org. At papers.qnfo.org it lives." and n == 4, "on/via/at Zenodo -> at papers.qnfo.org, sentence case kept", new)
new, n, left = scrub("Zenodo mints DOIs; ZENODO is a registrar; we left zenodo.")
ok(new == "the QNFO archive mints DOIs; the QNFO archive is a registrar; we left the QNFO archive." and n == 3, "any other Zenodo/ZENODO/zenodo -> the QNFO archive", new)
new, n, left = scrub("Found at (Zenodo) .  Also here (Zenodo) , done.")
ok(new == "Found at. Also here, done.", "doubled spaces and ' .' / ' ,' left by removals are collapsed", new)
new, n, left = scrub("| a | Zenodo |\n|---|---|\n  indented line with Zenodo")
ok(new == "| a | the QNFO archive |\n|---|---|\n  indented line with the QNFO archive", "leading indentation is kept, only inner runs collapse", new)

# 7. fenced code: words untouched, link and DOI rewrites applied
code = "Text Zenodo here.\n```yaml\ndoi: 10.5281/zenodo.222\npublisher: Zenodo\nurl: https://doi.org/10.5281/zenodo.333\n```\nAfter Zenodo.\n~~~\nZenodo stays\n~~~\n"
new, n, left = scrub(code)
want = "Text the QNFO archive here.\n```yaml\ndoi: %s/beta-paper/\npublisher: Zenodo\nurl: %s/gamma-paper/\n```\nAfter the QNFO archive.\n~~~\nZenodo stays\n~~~\n" % (P, P)
ok(new == want, "fenced code keeps the word, rewrites links and DOIs", new)
ok(n == 4, "fenced-code sample counts four changes", n)
ok(len(left) == 2 and all("Zenodo" in c for c in left), "the words left inside fenced code are reported as leftover contexts", left)

# 8. unrelated text is byte-identical; empty and None pass through
plain = "Nothing to see.\n\n  * list\n| t | a  b |\nDOI 10.1234/other.1 stays.\n"
ok(scrub(plain) == (plain, 0, []), "a text without the registrar is returned unchanged with zero changes")
ok(scrub("") == ("", 0, []) and scrub(None) == (None, 0, []), "empty and None pass through")

# 9. change counts and idempotence on a realistic body
body = ('---\ntitle: "Alpha"\ndoi: "10.5281/zenodo.111"\nsuperseded_by: "10.5281/zenodo.222"\n---\n\n# Alpha\n\n**DOI:** 10.5281/zenodo.111\n\n'
        'This paper is archived on Zenodo (Zenodo) with a Zenodo DOI. See https://doi.org/10.5281/zenodo.333.\n\n```\nhttps://doi.org/10.5281/zenodo.222\n```\n\n'
        '## References\n\n1. Quni, R. (2026). *Beta*. Zenodo. 10.5281/zenodo.222.\n2. Other (2024). Thing. DOI: 10.5281/zenodo.555\n')
new, n, left = scrub(body)
ok(left == [] and "zenodo" not in new.lower() and "10.5281" not in new, "a realistic body leaves nothing", left)
ok(n == 10, "a realistic body counts ten changes (2 front matter, 1 DOI line, 4 on the prose line, 1 in code, 2 references)", n)
again, n2, left2 = scrub(new)
ok(again == new and n2 == 0 and left2 == [], "scrubbing the result again changes nothing", (n2, left2))
ok("**URL:** %s/alpha-paper/" % P in new and 'superseded_by: "beta-paper"' in new and "QNFO. %s/beta-paper/." % P in new, "the realistic body carries the expected rewrites", new)
ok("```\n%s/beta-paper/\n```" % P in new, "the fenced block in the realistic body got only the URL rewrite", new)

# 10. noz_url and the leftover limit
ok(m.noz_url("111", DOI_MAP) == P + "/alpha-paper/" and m.noz_url("nope", DOI_MAP) == P and m.noz_url(None, DOI_MAP) == P, "noz_url maps or falls back")
new, n, left = scrub("```\n" + "Zenodo\n" * 9 + "```")
ok(len(left) == 5, "leftover contexts are capped at five", len(left))


# 11. the action against a fake d1q
class FakeD1:
    def __init__(self, papers, fail_backup=False):
        self.papers = papers  # slug -> dict(status, doi, zenodo_doi, body_md, abstract)
        self.calls = []
        self.fail_backup = fail_backup
        self.backup_rows = None

    def matching(self):
        return sorted(s for s, p in self.papers.items() if p["status"] in ("published", "distributed", "external_preprint")
                      and any(k in (f or "").lower() for f in (p["body_md"], p["abstract"]) for k in ("zenodo", "10.5281")))

    def __call__(self, acct, token, sql, params):
        self.calls.append((sql, list(params)))
        s = sql.strip()
        if s.startswith("SELECT slug, doi, zenodo_doi"):
            return True, [{"slug": k, "doi": p["doi"], "zenodo_doi": p["zenodo_doi"]} for k, p in sorted(self.papers.items())
                          if p["status"] in ("published", "distributed", "external_preprint") and ((p["doi"] or "").startswith("10.5281/") or (p["zenodo_doi"] or "").startswith("10.5281/"))]
        if s.startswith("SELECT slug, body_md, abstract"):
            off = params[0]
            rows = self.matching()[off:off + m.NOZ_PAGE]
            return True, [{"slug": k, "body_md": self.papers[k]["body_md"], "abstract": self.papers[k]["abstract"]} for k in rows]
        if s.startswith("CREATE TABLE IF NOT EXISTS " + m.NOZ_BAK_TABLE):
            if self.fail_backup:
                return False, ["boom"]
            if self.backup_rows is None:
                self.backup_rows = [dict(self.papers[k]) for k in self.matching()]
            return True, []
        if s.startswith("SELECT COUNT(*) AS n FROM " + m.NOZ_BAK_TABLE):
            return True, [{"n": len(self.backup_rows or [])}]
        if s.startswith("SELECT COUNT(*) AS n FROM papers"):
            return True, [{"n": len(self.matching())}]
        if s.startswith("UPDATE papers SET body_md = ?1, abstract = ?2, updated_at = datetime('now') WHERE slug = ?3 AND body_md = ?4"):
            if self.backup_rows is None:
                raise AssertionError("UPDATE before the backup table exists")
            p = self.papers.get(params[2])
            if p and p["body_md"] == params[3]:
                p["body_md"], p["abstract"] = params[0], params[1]
                return True, [{"slug": params[2]}]
            return True, []
        return False, ["unexpected " + s[:60]]


def papers():
    body = lambda slug, doi: '---\ntitle: "%s"\ndoi: "%s"\n---\n\n**DOI:** %s\n\nArchived on Zenodo. See https://doi.org/10.5281/zenodo.222.\n' % (slug, doi, doi)  # noqa: E731
    return {
        "alpha-paper": {"status": "published", "doi": "10.5281/zenodo.111", "zenodo_doi": None, "body_md": body("alpha-paper", "10.5281/zenodo.111"), "abstract": "A Zenodo deposit."},
        "beta-paper": {"status": "distributed", "doi": None, "zenodo_doi": "10.5281/zenodo.222", "body_md": body("beta-paper", "10.5281/zenodo.222"), "abstract": None},
        "clean-paper": {"status": "published", "doi": "10.9999/x", "zenodo_doi": None, "body_md": "Nothing here.", "abstract": "Clean."},
        "draft-paper": {"status": "draft", "doi": "10.5281/zenodo.333", "zenodo_doi": None, "body_md": "Draft on Zenodo.", "abstract": None},
    }


emitted = []
m.emit = lambda obj: emitted.append(obj)
import io, contextlib  # noqa: E401,E402

# dry: nothing written, the plan reported
fake = FakeD1(papers())
m.d1q = fake
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    rc = m.noz_scrub_bodies("acct", "tok", "dry")
ok(rc == 0, "dry returns 0", rc)
ok(not [c for c in fake.calls if c[0].startswith(("UPDATE", "CREATE"))], "dry mode writes nothing", [c[0][:40] for c in fake.calls])
ok(fake.papers["alpha-paper"]["body_md"].count("zenodo") == 3, "dry mode leaves the bodies as they were", fake.papers["alpha-paper"]["body_md"])
rep = emitted[-1]
ok(rep["action"] == "noz-scrub-bodies" and rep["dry"] is True and rep["rows"] == 2 and rep["rows_changed"] == 2 and rep["doi_map"] == 2 and rep["leftovers"] == 0, "dry summary: two matching rows (the draft and the clean paper are not read), both changed, no leftover", rep)
ok(len(rep["snippets"]) >= 3 and rep["snippets"][0]["slug"] == "alpha-paper" and "before" in rep["snippets"][0], "dry summary carries before/after snippets", rep["snippets"][:2])
out = buf.getvalue()
ok("noz-scrub-bodies alpha-paper: body" in out and "noz-scrub-bodies beta-paper: body" in out, "dry prints a per-row change line", out[:300])

# live: backup first, optimistic UPDATEs, re-count, exit 0
fake = FakeD1(papers())
m.d1q = fake
with contextlib.redirect_stdout(io.StringIO()):
    rc = m.noz_scrub_bodies("acct", "tok", "live")
ok(rc == 0, "live returns 0 when nothing remains", (rc, emitted[-1]))
kinds = [c[0].split(" ")[0] for c in fake.calls]
ok("CREATE" in kinds and kinds.index("CREATE") < kinds.index("UPDATE"), "the backup table is created before the first UPDATE", kinds)
ok(fake.calls[[c[0].startswith("CREATE") for c in fake.calls].index(True)][0].startswith("CREATE TABLE IF NOT EXISTS bak_20261012_noz_bodies AS SELECT slug, status, body_md, abstract FROM papers WHERE status IN"), "the backup is idempotent and copies slug, status, body_md, abstract of the matching rows", fake.calls)
ups = [c for c in fake.calls if c[0].startswith("UPDATE")]
ok(len(ups) == 2 and all("WHERE slug = ?3 AND body_md = ?4" in c[0] and c[0].rstrip().endswith("RETURNING slug") for c in ups), "every UPDATE carries the optimistic predicate on the old body", [c[0] for c in ups])
ok(all(c[1][3] in (papers()[c[1][2]]["body_md"],) for c in ups), "the predicate parameter is the body as read", [(c[1][2], c[1][3][:30]) for c in ups])
ok(all("updated_at = datetime('now')" in c[0] for c in ups), "updated_at is stamped")
ok("zenodo" not in (fake.papers["alpha-paper"]["body_md"] + fake.papers["alpha-paper"]["abstract"]).lower(), "alpha's body and abstract are scrubbed in the fake store", fake.papers["alpha-paper"])
ok(fake.papers["alpha-paper"]["body_md"].startswith('---\ntitle: "alpha-paper"\ndoi: ""\n---\n\n**URL:** %s/alpha-paper/\n' % P), "alpha's own **DOI:** line became its own URL", fake.papers["alpha-paper"]["body_md"])
ok(fake.papers["beta-paper"]["body_md"].count("%s/beta-paper/" % P) == 2 and fake.papers["beta-paper"]["abstract"] is None, "beta (zenodo_doi column) maps its own DOI; a NULL abstract stays NULL", fake.papers["beta-paper"])
ok(fake.papers["draft-paper"]["body_md"] == "Draft on Zenodo.", "a draft is outside the statuses and untouched")
rep = emitted[-1]
ok(rep["ok"] is True and rep["dry"] is False and rep["updated"] == 2 and rep["skipped"] == 0 and rep["failed"] == [] and rep["remaining"] == 0 and rep["backed_up"] == 2 and rep["backup_table"] == m.NOZ_BAK_TABLE, "live summary: 2 backed up, 2 updated, 0 remaining", rep)
ok(len(fake.backup_rows) == 2 and "zenodo" in fake.backup_rows[0]["body_md"], "the backup holds the pre-scrub bodies", fake.backup_rows[0]["body_md"][:60])

# live with a concurrent edit: the row is skipped, the count stays above zero, exit 1
fake = FakeD1(papers())
orig_call = FakeD1.__call__


def racing(self, acct, token, sql, params):
    if sql.startswith("UPDATE") and params[2] == "beta-paper" and "racer" not in self.papers["beta-paper"]["body_md"]:
        self.papers["beta-paper"]["body_md"] += "\nracer edit on Zenodo"
    return orig_call(self, acct, token, sql, params)


FakeD1.__call__ = racing
m.d1q = fake
with contextlib.redirect_stdout(io.StringIO()):
    rc = m.noz_scrub_bodies("acct", "tok", "live")
FakeD1.__call__ = orig_call
rep = emitted[-1]
ok(rc == 1 and rep["ok"] is False and rep["updated"] == 1 and rep["skipped"] == 1 and rep["remaining"] == 1, "a body that changed under us is skipped, not overwritten, and the run exits 1", rep)
ok(fake.papers["beta-paper"]["body_md"].endswith("racer edit on Zenodo"), "the concurrent edit survives")

# live with a failed backup: no UPDATE, exit 1
fake = FakeD1(papers(), fail_backup=True)
m.d1q = fake
with contextlib.redirect_stdout(io.StringIO()):
    rc = m.noz_scrub_bodies("acct", "tok", "live")
ok(rc == 1 and not [c for c in fake.calls if c[0].startswith("UPDATE")] and emitted[-1]["stage"] == "backup", "a failed backup stops the run before any UPDATE", emitted[-1])

# an unknown mode is refused before any read
fake = FakeD1(papers())
m.d1q = fake
rc = m.noz_scrub_bodies("acct", "tok", "wet")
ok(rc == 2 and not fake.calls, "an unknown mode is refused with exit 2 and no query", emitted[-1])

# paging: 120 matching rows are read in three pages of 50
many = {("p%03d" % i): {"status": "published", "doi": None, "zenodo_doi": None, "body_md": "on Zenodo %d" % i, "abstract": None} for i in range(120)}
fake = FakeD1(many)
m.d1q = fake
with contextlib.redirect_stdout(io.StringIO()):
    rc = m.noz_scrub_bodies("acct", "tok", "dry")
pages = [c for c in fake.calls if c[0].startswith("SELECT slug, body_md, abstract")]
ok(rc == 0 and [c[1][0] for c in pages] == [0, 50, 100] and emitted[-1]["rows"] == 120, "bodies are read 50 at a time by OFFSET", ([c[1] for c in pages], emitted[-1]["rows"]))

print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
