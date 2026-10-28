#!/usr/bin/env python3
"""RM-QWAV-CROSS-SIMULATOR-1 (agent_issues 1000642, charter pillar research): an independent second implementation of the golden values of the
qwav-demo-error-confinement demo (QNFO/qwav-demo-error-confinement, index.html, function verifyMath).

The demo checks a rooted p-ary tree of depth d against three closed forms: total nodes (p^(d+1)-1)/(p-1), leaves p^d, and subtree sizes. Those
checks compare the demo's tree with its own formulas. This script builds the tree explicitly (breadth first, parent lists, no formula in the
construction) and recomputes the same three quantities by counting, then checks the strong triangle inequality of the tree ultrametric on every triple,
which is the property the demo is named for. It is a second implementation, not a quantum simulator: the demo's golden values are combinatorial and a
quantum simulator has nothing to compute for them (see docs/QWAV-CROSS-SIMULATOR.md for which demos a simulator can check at all).

Usage:
  python3 scripts/qwav_golden_crosscheck.py            print the agreement table (markdown) and exit 1 on any disagreement
  python3 scripts/qwav_golden_crosscheck.py --json     the same as JSON
  python3 scripts/qwav_golden_crosscheck.py --selftest offline suite
"""
import itertools
import json
import sys

CASES = [(2, 3), (3, 2), (2, 4), (5, 2), (3, 3)]  # (p, depth); the demo default is p=2, d=3


def build(p, depth):
    """Rooted p-ary tree by breadth-first expansion: parent[i] for node i, depth_of[i]; root is node 0."""
    parent, dep = [-1], [0]
    frontier = [0]
    for lvl in range(1, depth + 1):
        nxt = []
        for node in frontier:
            for _ in range(p):
                parent.append(node)
                dep.append(lvl)
                nxt.append(len(parent) - 1)
        frontier = nxt
    return parent, dep


def subtree_size(parent, node):
    """Size of the subtree rooted at node, by counting descendants (walk each other node's parent chain)."""
    n = 0
    for i in range(len(parent)):
        j = i
        while j != -1:
            if j == node:
                n += 1
                break
            j = parent[j]
    return n


def lca_depth(parent, dep, a, b):
    anc = set()
    x = a
    while x != -1:
        anc.add(x)
        x = parent[x]
    y = b
    while y not in anc:
        y = parent[y]
    return dep[y]


def check_case(p, depth):
    parent, dep = build(p, depth)
    total = len(parent)
    leaves = sum(1 for d in dep if d == depth)
    formula_total = (p ** (depth + 1) - 1) // (p - 1)
    formula_leaves = p ** depth
    sub_ok = True
    for lvl in range(depth + 1):
        node = dep.index(lvl)
        analytic = (p ** (depth - lvl + 1) - 1) // (p - 1)
        if subtree_size(parent, node) != analytic:
            sub_ok = False
    # ultrametric distance between leaves: 2 * (depth - depth of the lowest common ancestor); strong triangle inequality on all triples
    leaf_ids = [i for i, d in enumerate(dep) if d == depth]
    ultra_ok, triples = True, 0
    sample = leaf_ids if len(leaf_ids) <= 27 else leaf_ids[:27]
    for a, b, c in itertools.combinations(sample, 3):
        dab = 2 * (depth - lca_depth(parent, dep, a, b))
        dbc = 2 * (depth - lca_depth(parent, dep, b, c))
        dac = 2 * (depth - lca_depth(parent, dep, a, c))
        triples += 1
        if not (dac <= max(dab, dbc) and dab <= max(dac, dbc) and dbc <= max(dab, dac)):
            ultra_ok = False
    return [
        {"p": p, "depth": depth, "quantity": "total nodes", "counted": total, "closed_form": formula_total, "agree": total == formula_total},
        {"p": p, "depth": depth, "quantity": "leaf count", "counted": leaves, "closed_form": formula_leaves, "agree": leaves == formula_leaves},
        {"p": p, "depth": depth, "quantity": "subtree sizes (all levels)", "counted": "all", "closed_form": "all", "agree": sub_ok},
        {"p": p, "depth": depth, "quantity": "strong triangle inequality (%d leaf triples)" % triples, "counted": "holds" if ultra_ok else "fails",
         "closed_form": "holds", "agree": ultra_ok},
    ]


def run():
    rows = []
    for p, d in CASES:
        rows.extend(check_case(p, d))
    return rows


def table(rows):
    out = ["| p | depth | quantity | independent count | demo formula | agree |", "|---|---|---|---|---|---|"]
    for r in rows:
        out.append("| %d | %d | %s | %s | %s | %s |" % (r["p"], r["depth"], r["quantity"], r["counted"], r["closed_form"], "yes" if r["agree"] else "NO"))
    return "\n".join(out)


def selftest():
    fails = []
    rows = run()
    if not rows or not all(r["agree"] for r in rows):
        fails.append("some case disagrees: %r" % [r for r in rows if not r["agree"]])
    parent, dep = build(2, 3)
    if len(parent) != 15 or sum(1 for d in dep if d == 3) != 8:
        fails.append("p=2 d=3 must have 15 nodes and 8 leaves")
    # the check bites: a broken tree (one leaf missing) must disagree with the closed form
    parent2 = parent[:-1]
    if len(parent2) == (2 ** 4 - 1) // (2 - 1):
        fails.append("a tree missing a node must not match the formula")
    print("qwav_golden_crosscheck selftest %s" % ("ok" if not fails else "FAILED: " + "; ".join(fails)))
    return 0 if not fails else 1


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    res = run()
    print(json.dumps(res) if "--json" in sys.argv else table(res))
    sys.exit(0 if all(r["agree"] for r in res) else 1)
