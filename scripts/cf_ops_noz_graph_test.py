"""NO-ZENODO-DOI-7 offline suite for scripts/cf_ops_actions.py noz-scrub-graph (agent_issues 2448, umbrella 2273).

No network. Proves the pure rewrites (nozg_text, nozg_props, nozg_new_id, nozg_name, nozg_plan) on the shapes measured in
qnfo-graph on 2026-10-12: registrar-shaped node ids of five forms, property blobs with doi / zenodo_doi / zenodo_url /
zenodo_id / record_url keys, "Z<n>: <title>" and "[Zenodo] <doi>" names, the ZENODO-PUBLISH template nodes, edges whose
endpoints or ids name the registrar, archive_publications with a 10.5281 doi, invalid JSON blobs, third-party DOIs kept, a
rename that collides with an existing paper:<slug> node (merge), idempotence. Then drives noz_scrub_graph() against a fake
d1q: dry writes nothing; live backs up the three tables before any write, deletes edges before nodes, renames in
insert -> move edges -> delete order, re-counts and exits 0 at zero.
Run: python3 scripts/cf_ops_noz_graph_test.py   -> prints "N passed, 0 failed"
"""
import contextlib
import importlib.util
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cf_ops_actions", os.path.join(HERE, "cf_ops_actions.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

passed = failed = 0


def ok(c, label, detail=None):
    global passed, failed
    if c:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if detail is None else " :: " + str(detail)[:400]))


P = m.NOZ_PAPERS_BASE
DOI_MAP = {"10.5281/zenodo.111": "alpha-paper", "10.5281/zenodo.222": "beta-paper"}

# 1. text
ok(m.nozg_text("Archived on Zenodo (Zenodo) with a Zenodo DOI: https://doi.org/10.5281/zenodo.111", DOI_MAP) == "Archived at papers.qnfo.org with a DOI: %s/alpha-paper/" % P, "text: word rules and a mapped DOI link", m.nozg_text("Archived on Zenodo (Zenodo) with a Zenodo DOI: https://doi.org/10.5281/zenodo.111", DOI_MAP))
ok(m.nozg_text("The `zenodo_publish.py` QC gate", DOI_MAP) == "The `archive_publish.py` QC gate", "text: the script name")
ok(m.nozg_text("ZENODO-PUBLISH", DOI_MAP) == "ARCHIVE-PUBLISH", "text: the template name")
ok(m.nozg_text("https://zenodo.org/records/222", DOI_MAP) == P + "/beta-paper/", "text: a record URL maps to the page")
ok(m.nozg_text("see 10.5281/zenodo.999", DOI_MAP) == "see " + P, "text: an unmapped DOI falls back to the archive index")
ok(m.nozg_text("zenodoish-thing", DOI_MAP) == "archiveish-thing", "text: the catch-all turns a glued word into archive")
ok(m.nozg_text("Compare 10.1038/nphys1234 (Nature)", DOI_MAP) == "Compare 10.1038/nphys1234 (Nature)", "text: a third-party DOI is untouched")
ok(m.nozg_text("", DOI_MAP) == "" and m.nozg_text("plain", DOI_MAP) == "plain", "text: empty and clean strings pass through")
# dry run 133 (2026-10-12): a one-token value took the prose phrase ("type":"the QNFO archive") and a slug of a deleted shell row
# was rewritten inside its URL ("papers/the QNFO archive-105281archive<n>/")
ok(m.nozg_text("zenodo", DOI_MAP) == "archive" and m.nozg_text("zenodo-sync", DOI_MAP) == "archive-sync", "text: a single token takes archive in place, never the prose phrase")
ok(m.nozg_text("https://papers.qnfo.org/papers/zenodo-105281zenodo21017184/", DOI_MAP) == "https://papers.qnfo.org/papers/archive-105281archive21017184/", "text: a URL stays one token")

# 2. properties
props = json.dumps({"zenodo_id": 20329449, "doi": "10.5281/zenodo.111", "title": "Signal and Worker", "date": "2026-05-21", "record_url": "https://zenodo.org/records/111",
                    "source": "sync-2026-07-05", "distribution_status": "draft", "zenodo_doi": "10.5281/zenodo.111", "zenodo_url": "https://doi.org/10.5281/zenodo.111", "zenodo_note": "mirrored on Zenodo"})
new, changed = m.nozg_props(props, DOI_MAP, "alpha-paper")
obj = json.loads(new)
ok(changed and "zenodo_id" not in obj and "zenodo_doi" not in obj and "zenodo_url" not in obj, "props: registrar identifier keys are dropped", obj)
ok(obj.get("doi") == "" and obj.get("record_url") == P + "/alpha-paper/" and obj.get("url") == P + "/alpha-paper/", "props: doi -> '', record_url -> the page, url set from the slug", obj)
ok(obj.get("archive_note") == "mirrored at papers.qnfo.org" and obj.get("title") == "Signal and Worker" and obj.get("date") == "2026-05-21", "props: a text key is renamed and scrubbed; other values untouched", obj)
ok("zenodo" not in new.lower() and "10.5281" not in new, "props: nothing of the registrar remains", new)
new2, changed2 = m.nozg_props(new, DOI_MAP, "alpha-paper")
ok(new2 == new and not changed2, "props: scrubbing the result again changes nothing")
new3, changed3 = m.nozg_props(json.dumps({"doi": "10.1038/nphys1234", "cites": ["10.5281/zenodo.222", "10.1103/PhysRevA.1"]}), DOI_MAP)
ok(changed3 and json.loads(new3)["doi"] == "10.1038/nphys1234" and json.loads(new3)["cites"] == [P + "/beta-paper/", "10.1103/PhysRevA.1"], "props: third-party DOIs kept, nested lists scrubbed", new3)
bad, changedb = m.nozg_props('{\\section\\:\\6.5.7\\,\\zenodo\\:1}', DOI_MAP)
ok(changedb and "zenodo" not in bad.lower() and bad.startswith("{"), "props: invalid JSON is treated as text", bad)
same, changeds = m.nozg_props('{"version":"1.0"}', DOI_MAP)
ok(not changeds and same == '{"version":"1.0"}', "props: a clean blob is byte-identical")
nul, changedn = m.nozg_props(None, DOI_MAP)
ok(nul is None and not changedn, "props: NULL stays NULL")

# 3. ids and names
ok(m.nozg_new_id("zenodo-10-5281-zenodo-111", DOI_MAP) == ("paper:alpha-paper", "111", "alpha-paper"), "id: zenodo-10-5281-zenodo-<n> maps to paper:<slug>")
ok(m.nozg_new_id("zenodo-222", DOI_MAP)[0] == "paper:beta-paper" and m.nozg_new_id("zenodo-zenodo.222", DOI_MAP)[0] == "paper:beta-paper", "id: zenodo-<n> and zenodo-zenodo.<n>")
ok(m.nozg_new_id("10.5281/zenodo.999", DOI_MAP) == ("archive-record-999", "999", None) and m.nozg_new_id("paper-doi-10.5281-zenodo.999", DOI_MAP)[0] == "archive-record-999", "id: an unmapped record becomes archive-record-<n>")
ok(m.nozg_new_id("template-zenodo-publish", DOI_MAP) == ("template-archive-publish", None, None), "id: another id with the word takes archive")
ok(m.nozg_new_id("paper:alpha-paper", DOI_MAP) == (None, None, None) and m.nozg_new_id("org-qnfo", DOI_MAP) == (None, None, None), "id: clean ids are left alone")
ok(m.nozg_name("Z20329449: Signal and Worker", {}, "20329449", DOI_MAP) == "Signal and Worker", "name: the Z<n>: prefix goes")
ok(m.nozg_name("[Zenodo] 10.5281/zenodo.111", {"title": "Alpha"}, "111", DOI_MAP) == "Alpha" and m.nozg_name("[Zenodo] 10.5281/zenodo.999", {}, "999", DOI_MAP) == "Archive record 999", "name: the bracket form takes the title or a record label")
ok(m.nozg_name("ZENODO-PUBLISH", {}, None, DOI_MAP) == "ARCHIVE-PUBLISH" and m.nozg_name("Philosophy of Science", {}, None, DOI_MAP) == "Philosophy of Science", "name: word rules; clean names untouched")

# 4. the plan
NODES = [
    {"id": "zenodo-10-5281-zenodo-111", "label": "Paper", "name": "[Zenodo] 10.5281/zenodo.111", "properties": json.dumps({"doi": "10.5281/zenodo.111", "title": "Alpha", "zenodo_doi": "10.5281/zenodo.111"})},
    {"id": "zenodo-222", "label": "Paper", "name": "Z222: Beta", "properties": json.dumps({"zenodo_id": 222, "doi": "10.5281/zenodo.222"})},
    {"id": "paper:beta-paper", "label": "Paper", "name": "Beta", "properties": json.dumps({"slug": "beta-paper", "doi": "", "zenodo_url": ""})},
    {"id": "zenodo-999", "label": "Paper", "name": "Z999: Gamma", "properties": json.dumps({"doi": "10.5281/zenodo.999"})},
    {"id": "t-zenodo-publish", "label": "Template", "name": "ZENODO-PUBLISH", "properties": "{\"type\":\"prompt-template\"}"},
    {"id": "decision-dec-015", "label": "Decision", "name": "DEC-015: QC Gates", "properties": json.dumps({"content": "The `zenodo_publish.py` QC gate"})},
    {"id": "theorem-x", "label": "Theorem", "name": "T", "properties": "{\\zenodo\\:1}"},
]
EDGES = [
    {"id": "e-owns-t-zenodo-publish", "source_id": "org-qnfo", "target_id": "t-zenodo-publish", "properties": "{}"},
    {"id": "edge-pub-1", "source_id": "silent-radix", "target_id": "zenodo-10-5281-zenodo-111", "properties": "{}"},
    {"id": "edge-90000", "source_id": "kepler-program", "target_id": "zenodo-222", "properties": json.dumps({"doi": "10.5281/zenodo.222"})},
    {"id": "edge-self", "source_id": "zenodo-222", "target_id": "paper:beta-paper", "properties": "{}"},
    {"id": "edge-999", "source_id": "zenodo-999", "target_id": "org-qnfo", "properties": "{}"},
]
PUBS = [{"id": "pub-1", "doi": "10.5281/zenodo.111", "title": "Alpha on Zenodo"}, {"id": "pub-2", "doi": "10.1038/x", "title": "Other"}]
plan = m.nozg_plan(NODES, EDGES, PUBS, DOI_MAP)
ok(plan["node_deletes"] == ["t-zenodo-publish"], "plan: the template node is deleted", plan["node_deletes"])
ren = {r["old"]: r for r in plan["renames"]}
ok(set(ren) == {"zenodo-10-5281-zenodo-111", "zenodo-222", "zenodo-999"}, "plan: the three registrar-shaped ids are renamed", list(ren))
ok(ren["zenodo-10-5281-zenodo-111"]["new"] == "paper:alpha-paper" and not ren["zenodo-10-5281-zenodo-111"]["merge"] and ren["zenodo-10-5281-zenodo-111"]["name"] == "Alpha", "plan: a mapped record becomes paper:<slug> with the title as its name", ren["zenodo-10-5281-zenodo-111"])
ok(ren["zenodo-222"]["new"] == "paper:beta-paper" and ren["zenodo-222"]["merge"], "plan: a record whose paper:<slug> node exists merges into it", ren["zenodo-222"])
ok(ren["zenodo-999"]["new"] == "archive-record-999" and ren["zenodo-999"]["name"] == "Gamma", "plan: an unmapped record becomes archive-record-<n>", ren["zenodo-999"])
ok(all("zenodo" not in (r["properties"] or "").lower() and "10.5281" not in (r["properties"] or "") for r in plan["renames"]), "plan: renamed nodes carry scrubbed properties")
ok(json.loads(ren["zenodo-10-5281-zenodo-111"]["properties"]).get("url") == P + "/alpha-paper/", "plan: the mapped node gets its in-house url")
upd = {u["id"]: u for u in plan["updates"]}
ok(set(upd) == {"decision-dec-015", "theorem-x", "paper:beta-paper"}, "plan: in-place updates for the decision text, the invalid blob and the clean paper's empty zenodo_url key", list(upd))
ok("archive_publish.py" in upd["decision-dec-015"]["properties"] and "zenodo" not in upd["theorem-x"]["properties"].lower(), "plan: text and invalid-JSON blobs are scrubbed in place")
ok(plan["edge_deletes"] == ["e-owns-t-zenodo-publish", "edge-self"], "plan: the template's edge and the edge that would become a self-loop are deleted", plan["edge_deletes"])
eu = {e["id"]: e for e in plan["edge_updates"]}
ok(eu["edge-pub-1"]["target_id"] == "paper:alpha-paper" and eu["edge-90000"]["target_id"] == "paper:beta-paper" and eu["edge-999"]["source_id"] == "archive-record-999", "plan: edges follow the renamed and merged nodes", eu)
ok(json.loads(eu["edge-90000"]["properties"])["doi"] == "", "plan: an edge's doi property is emptied")
ok(plan["pub_updates"] == [{"id": "pub-1", "doi": None, "title": "Alpha at papers.qnfo.org"}], "plan: the 10.5281 publication loses its doi and its title is scrubbed; the third-party one is untouched", plan["pub_updates"])
ok(plan["counts"] == {"node_deletes": 1, "renames": 3, "updates": 3, "edge_deletes": 2, "edge_updates": 3, "pub_updates": 1, "merges": 1}, "plan: counts", plan["counts"])
ok(plan["leftovers"] == [], "plan: no leftover mention", plan["leftovers"])
ok(len(plan["samples"]) >= 3 and all(set(s) == {"id", "before", "after"} for s in plan["samples"]), "plan: samples carry id, before, after")
# a second pass over the planned result finds nothing to do
NODES2 = [{"id": r["new"], "label": "Paper", "name": r["name"], "properties": r["properties"]} for r in plan["renames"] if not r["merge"]] + \
         [{"id": u["id"], "label": "x", "name": u["name"], "properties": u["properties"]} for u in plan["updates"]]
plan2 = m.nozg_plan(NODES2, [], [], DOI_MAP)
ok(plan2["counts"] == {"node_deletes": 0, "renames": 0, "updates": 0, "edge_deletes": 0, "edge_updates": 0, "pub_updates": 0, "merges": 0}, "plan: idempotent", plan2["counts"])


# 5. the action against a fake d1q
class FakeGraph:
    def __init__(self, nodes, edges, pubs, fail_backup=False):
        self.nodes = {n["id"]: dict(n) for n in nodes}
        self.edges = {e["id"]: dict(e) for e in edges}
        self.pubs = {p["id"]: dict(p) for p in pubs}
        self.calls = []
        self.backed = set()
        self.fail_backup = fail_backup

    def matching_nodes(self):
        return [n for n in self.nodes.values() if "zenodo" in (n["id"] + n["name"] + (n["properties"] or "")).lower() or "10.5281" in (n["properties"] or "")]

    def matching_edges(self):
        ids = {n["id"] for n in self.matching_nodes()}
        return [e for e in self.edges.values() if "zenodo" in (e["id"] + e["source_id"] + e["target_id"] + (e["properties"] or "")).lower() or e["source_id"] in ids or e["target_id"] in ids]

    def matching_pubs(self):
        return [p for p in self.pubs.values() if (p["doi"] or "").lower().startswith("10.5281") or "zenodo" in (p["title"] or "").lower()]

    def remaining(self):
        return len(self.matching_nodes()) + len([e for e in self.edges.values() if "zenodo" in (e["id"] + e["source_id"] + e["target_id"] + (e["properties"] or "")).lower()]) + len(self.matching_pubs())

    def __call__(self, sql, params=None):
        params = params or []
        self.calls.append((sql, list(params)))
        s = sql.strip()
        if s.startswith("SELECT id, label, name, properties FROM nodes"):
            return True, [dict(n) for n in self.matching_nodes()]
        if s.startswith("SELECT id, source_id, target_id, properties FROM edges"):
            return True, [dict(e) for e in self.matching_edges()]
        if s.startswith("SELECT id, doi, title FROM archive_publications"):
            return True, [dict(p) for p in self.matching_pubs()]
        if s.startswith("CREATE TABLE IF NOT EXISTS " + m.NOZG_BAK):
            if self.fail_backup:
                return False, ["boom"]
            self.backed.add(s.split(" ")[5])
            return True, []
        if len(self.backed) < 3 and not s.startswith("SELECT"):
            raise AssertionError("write before the three backups: " + s[:60])
        if s.startswith("DELETE FROM edges WHERE id = ?1"):
            self.edges.pop(params[0], None)
            return True, []
        if s.startswith("DELETE FROM nodes WHERE id = ?1"):
            if any(e["source_id"] == params[0] or e["target_id"] == params[0] for e in self.edges.values()):
                return False, ["FOREIGN KEY constraint failed"]
            self.nodes.pop(params[0], None)
            return True, []
        if s.startswith("INSERT INTO nodes"):
            new, name, props, old = params
            if new in self.nodes:
                return False, ["UNIQUE constraint failed: nodes.id"]
            src = self.nodes[old]
            self.nodes[new] = {"id": new, "label": src["label"], "name": name, "properties": props}
            return True, []
        if s.startswith("UPDATE edges SET source_id = ?1"):
            if params[0] not in self.nodes:
                return False, ["FOREIGN KEY constraint failed"]
            for e in self.edges.values():
                if e["source_id"] == params[1]:
                    e["source_id"] = params[0]
            return True, []
        if s.startswith("UPDATE edges SET target_id = ?1"):
            if params[0] not in self.nodes:
                return False, ["FOREIGN KEY constraint failed"]
            for e in self.edges.values():
                if e["target_id"] == params[1]:
                    e["target_id"] = params[0]
            return True, []
        if s.startswith("UPDATE nodes SET name = ?1, properties = ?2"):
            n = self.nodes.get(params[2])
            if n and (n["properties"] == (params[3] if len(params) > 3 else None)):
                n["name"], n["properties"] = params[0], params[1]
            return True, []
        if s.startswith("UPDATE edges SET id = ?1"):
            e = self.edges.pop(params[4], None)
            if e:
                e.update({"id": params[0], "source_id": params[1], "target_id": params[2], "properties": params[3]})
                self.edges[params[0]] = e
            return True, []
        if s.startswith("UPDATE archive_publications"):
            p = self.pubs.get(params[2])
            if p:
                p["doi"], p["title"] = params[0], params[1]
            return True, []
        if s.startswith("SELECT (SELECT COUNT(*) FROM nodes"):
            return True, [{"n": self.remaining()}]
        return False, ["unexpected " + s[:60]]


emitted = []
m.emit = lambda obj: emitted.append(obj)
LP = lambda sql, params=None: (True, [{"slug": "alpha-paper", "doi": "10.5281/zenodo.111", "zenodo_doi": None}, {"slug": "beta-paper", "doi": None, "zenodo_doi": "10.5281/zenodo.222"},  # noqa: E731
                                     {"slug": "zenodo-105281zenodo999", "doi": "10.5281/zenodo.999", "zenodo_doi": None}])  # a deleted shell row's slug: never a map target

fake = FakeGraph(NODES, EDGES, PUBS)
with contextlib.redirect_stdout(io.StringIO()) as buf:
    rc = m.noz_scrub_graph("acct", "tok", "dry", run=fake, run_lp=LP)
rep = emitted[-1]
ok(rc == 0 and rep["dry"] is True and rep["doi_map"] == 2 and rep["counts"]["renames"] == 3 and rep["leftovers"] == [], "dry: plan reported, exit 0", rep)
ok(all(c[0].strip().startswith("SELECT") for c in fake.calls), "dry: only reads", [c[0][:40] for c in fake.calls if not c[0].strip().startswith("SELECT")])
ok("noz-scrub-graph zenodo-10-5281-zenodo-111" in buf.getvalue(), "dry: samples are printed")

fake = FakeGraph(NODES, EDGES, PUBS)
with contextlib.redirect_stdout(io.StringIO()):
    rc = m.noz_scrub_graph("acct", "tok", "live", run=fake, run_lp=LP)
rep = emitted[-1]
ok(rc == 0 and rep["ok"] is True and rep["remaining"] == 0 and rep["failed"] == [], "live: exit 0 at zero remaining, no failed step", rep)
ok(rep["done"] == {"node_deletes": 1, "renames": 2, "merges": 1, "updates": 3, "edge_deletes": 2, "edge_updates": 3, "pub_updates": 1}, "live: every planned step ran (2 inserts, 1 merge, 3 in-place updates)", rep["done"])
ok(len(fake.backed) == 3 and rep["backup_tables"] == [m.NOZG_BAK + "_nodes", m.NOZG_BAK + "_edges", m.NOZG_BAK + "_pubs"], "live: the three backups exist before the first write", fake.backed)
ok("paper:alpha-paper" in fake.nodes and "archive-record-999" in fake.nodes and "zenodo-10-5281-zenodo-111" not in fake.nodes and "zenodo-222" not in fake.nodes and "t-zenodo-publish" not in fake.nodes, "live: renamed, merged and template nodes are gone; new ids exist", sorted(fake.nodes))
ok(fake.edges["edge-pub-1"]["target_id"] == "paper:alpha-paper" and fake.edges["edge-90000"]["target_id"] == "paper:beta-paper" and "edge-self" not in fake.edges and "e-owns-t-zenodo-publish" not in fake.edges, "live: edges follow the renames and the deletes", fake.edges)
ok(fake.pubs["pub-1"]["doi"] is None and fake.pubs["pub-2"]["doi"] == "10.1038/x", "live: the registrar doi is nulled, the third-party one kept")
ok(fake.remaining() == 0, "live: the store holds no mention")
kinds = [c[0].split(" ")[0] + (" edges" if "FROM edges" in c[0] or "UPDATE edges" in c[0] else " nodes" if "nodes" in c[0] else "") for c in fake.calls if not c[0].strip().startswith("SELECT")]
ok(kinds.index("CREATE nodes") < kinds.index("DELETE edges") < kinds.index("DELETE nodes") < kinds.index("INSERT nodes"), "live: backup, then edge deletes, then node deletes, then the renames", kinds[:8])

fake = FakeGraph(NODES, EDGES, PUBS, fail_backup=True)
with contextlib.redirect_stdout(io.StringIO()):
    rc = m.noz_scrub_graph("acct", "tok", "live", run=fake, run_lp=LP)
ok(rc == 1 and emitted[-1]["stage"] == "backup" and fake.remaining() > 0, "live: a failed backup stops everything before any write", emitted[-1])

with contextlib.redirect_stdout(io.StringIO()):
    rc = m.noz_scrub_graph("acct", "tok", "wet", run=fake, run_lp=LP)
ok(rc == 2, "an unknown mode is refused with exit 2")

print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
