# qwav demo cross-check (RM-QWAV-CROSS-SIMULATOR-1)

Charter pillar: **research**. Issue: agent_issues 1000642 (docs/SCOUT-ROADMAP-2026-10.md). Survey made 2026-10-28 from the demo repositories on GitHub
(`QNFO/qwav-demo-*`, each a single `index.html` plus README; the two read in full were `qwav-demo-error-confinement` and
`qwav-demo-hardware-visualizer`, a third, `qwav-demo-bt-qec`, was searched for simulator terms).

## What the survey found (the premise of the roadmap item does not hold as written)

The item asks to run each demo's golden value on "one independent quantum simulator" (eigenkit, ffsim, QuTiP, Cirq/qsim). The golden values that exist are
not quantum-simulation outputs:

| Demo | Golden values in the code | Quantum content | Independent check that fits |
|---|---|---|---|
| qwav-demo-error-confinement | `verifyMath`: total nodes (p^(d+1)-1)/(p-1), leaves p^d, subtree sizes, compared with the demo's own tree | none: a rooted p-ary tree and the strong triangle inequality | a second implementation that builds the tree by counting: `scripts/qwav_golden_crosscheck.py` (done, all agree) |
| qwav-demo-bt-qec | none found by search (one hit for a quantum term) | QEC wording, tree arithmetic | not yet: first extract the numbers the page shows |
| qwav-demo-hardware-visualizer | none (no "golden" string) | 40-atom lattice, Rydberg blockade and qubit text, drawn not computed | a blockade graph (atoms closer than the blockade radius) recomputed independently; a quantum simulator only if the page claims a dynamics value |
| qwav-demo-tree-distance, qwav-demo-ultrametric-convergence, qwav-demo-qpna-classifier, qwav-demo-monna-map-perspective | not read yet | tree and clustering geometry | second implementation (scipy cophenetic distance, networkx) |

So the table the item asks for ("demo, simulator, agreement") is built with the independent method that fits each demo; a quantum simulator is named only
where a demo computes a quantum quantity. Forcing a simulator onto a tree identity would produce an agreement that proves nothing.

## Done in this change

`python3 scripts/qwav_golden_crosscheck.py` builds the tree of `qwav-demo-error-confinement` by explicit expansion, recounts nodes, leaves and every level's subtree
size, and checks the strong triangle inequality on all leaf triples (up to 27 leaves). Result on 2026-10-28, five (p, depth) cases including the demo default
p=2, d=3: every row agrees.

## Still to do (owner: the code loop, one demo per task)

1. `qwav-demo-bt-qec`, `qwav-demo-hardware-visualizer`, and the four unread demos: list the numbers each page computes and displays, as a row in the table above.
2. For each, add the independent check that fits (a function in `scripts/qwav_golden_crosscheck.py` with a selftest case) and record the agreement.
3. Run the script in CI so a demo whose rule changes is noticed: the demos live in other repositories, so the check compares against the formulas in this file, not
   against their code. A change in a demo's formulas is not seen until step 1 is repeated for it.

## Failure mode

The check validates the demo's stated formulas, not that the demo's JavaScript implements them: a demo that displays a wrong number while its `verifyMath`
passes is not caught here. Closing that gap needs the page's computed values (a headless-browser read), which is not built.
