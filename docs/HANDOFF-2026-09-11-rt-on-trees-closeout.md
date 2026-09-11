# HANDOFF 2026-09-11 — Ryu-Takayanagi on tree spacetimes (session closeout)

Endpoint: qnfo-ops. Client: ChatBox (mobile). Thread: retail confidence variables ->
manifold-vs-tree assumption -> RT on tree spacetimes -> computational verification -> closeout.

## Headline

RT does not require a manifold. It is a theorem on arbitrary graphs (random tensor networks,
Hayden-Nezami-Qi-Walter-Yang, arXiv:1601.01694) and holds exactly on trees, where the bulk is
literally a tree (p-adic AdS/CFT, Bruhat-Tits tree). What RT needs is a minimal-cut structure
plus large bond dimension, not differentiable structure.

## Verified this session (recomputed with run_code, 2026-09-11)

Model: finite p-ary tree, depth N, boundary = leaves, unit edge capacities, S/logD = min edge cut.

- Tree DP cross-validated against an independent Edmonds-Karp max-flow (Menger) implementation:
  0 mismatches on all 256 masks (p=2, N=3) and 3000 sampled masks (p=2, N=4).
- Entropy is quantized in integer units of log D.
- Cut histogram over all 65536 regions, p=2 N=4:
  {0:2, 1:58, 2:676, 3:4048, 4:13200, 5:22848, 6:18816, 7:5632, 8:256}
- Purity S(A) = S(A^c): 0 violations in 65536 regions.
- Max entropy 8 = 2^(N-1) = number of sibling pairs, attained by exactly 256 masks, verified to
  be precisely those that split EVERY sibling pair (alternating is one of them, not unique).
- Ultrametric balls: cut = 1 at every measure/depth (p=2 N=4 depths 1-3; N=6 depths 1-5, leaf
  counts 32/16/8/4/2). Ball entropy is independent of ball size.
- Ultrametricity: d = 2^-depth(LCA) satisfies the strong triangle inequality in 0 of 32768
  ordered triples (32 leaves); same 32 leaves on the real line violate it in 9920 of 32768.
- Ball structure: 30 tree balls (N=5) -> 0 partial overlaps in 435 pairs; 64 grid-graph balls
  -> 656 partial overlaps in 2016 pairs.

## Falsified claim (correction)

An earlier claim in this session (and in a queued research idea) said the min cut "equals the
number of ultrametric components (fragmentation) of A". FALSE as a general formula:

- cover = cut+1 holds in only 22.24% of the 65536 regions.
- Counterexample A = all leaves but one: cut 1, maximal-ball cover 4.
- Counterexample A = single leaf: cut 1, cover 1.
- Agrees only for scattered regions (alternating: cut 8, cover 8).

Operational definition: the tree DP; equivalently min number of monochromatic clades minus 1.

## Open tension (unresolved)

Finite truncation makes the two-point cut bounded and independent of separation: cut 1 for
sibling pairs (LCA depth N-1), cut 2 for all other pairs. The p-adic CFT boundary computation
instead gives S proportional to log_p |x-y|_p, growing with separation. Candidate resolutions:
(a) the bulk dual of a p-adic CFT region is not a leaf-subtree; (b) boundary legs must be
weighted; (c) the relevant RT surface is the geodesic between the two bounding points, the
p-adic boundary being totally disconnected (no perimeter). Also open: Lorentzian dynamics,
quantum corrections (FLM / entanglement wedge have no tree analog), loops/winding as
quotient-emergent (trees have no cycles), HaPPY as a cycles counterexample.

## Placement

Primary: QNFO.ADL.001 Adelic Shannon Theory (DOI 10.5281/zenodo.21336099); QNFO.UMP.009 Adelic
Cross-Domain Program (DOI 10.5281/zenodo.21965332). Ontological source: QNFO.SLB.001.
Tension: Winding Numbers and Strange Loops (DOI 10.5281/zenodo.17322662).
MANDATORY: cite the 5-finding Disconfirming Registry against the adelic thesis.

## Evidence not yet logged

Hung et al. arXiv:1902.01411; Heydeman et al. 2021; Ebert et al. PRD 107,126011 (2023);
Hayden et al. arXiv:1601.01694; Pastawski-Yoshida-Harlow-Preskill arXiv:1503.06237.
Target: QNFO.RES.014 + ADL.001 / UMP.009 threads.

## Next actions

1. Resolve the two-point cut vs log-law tension (infinite-tree limit or correct bulk dual).
2. Log the 5 references into QNFO.RES.014 and the adelic threads.
3. Add an RT-on-trees subsection to the adelic program with the Disconfirming Registry citation.
4. Cheapest independent test: ultrametricity of high-dimensional embeddings.
5. Correct any text asserting the fragmentation formula.

## D1 handoff rows (drafted, NOT written — see blocker below)

Schema confirmed: handoffs(id INTEGER PK AUTOINCREMENT, session_id TEXT NOT NULL,
project_id TEXT NOT NULL, phase_completed INTEGER, summary TEXT, pending_work TEXT,
next_action TEXT, r2_handoff_path TEXT, timestamp TEXT DEFAULT (datetime('now')), wbs_code TEXT).
Latest existing row before these: id 29113.

```sql
INSERT INTO handoffs (session_id, project_id, phase_completed, summary, pending_work, next_action, r2_handoff_path, wbs_code) VALUES (
 'chatbox-rt-on-trees-2026-09-11', 'qnfo', 1,
 'RT-ON-TREES CLOSEOUT (2026-09-11): verified by independent computation on finite p-ary trees (boundary = leaves, S/logD = min edge cut). Tree DP cross-validated against Edmonds-Karp max-flow (Menger): 0 mismatches (all 256 masks p=2,N=3; 3000 sampled masks p=2,N=4). Entropy quantized in integer units of logD; cut histogram over all 65536 regions of the p=2,N=4 tree {0:2,1:58,2:676,3:4048,4:13200,5:22848,6:18816,7:5632,8:256}. Purity S(A)=S(A^c): 0 violations in 65536 regions. Max entropy 8 = 2^(N-1) = number of sibling pairs, attained by exactly 256 masks, verified to be precisely those splitting EVERY sibling pair. A contiguous ultrametric ball has cut 1 at every measure and depth (p=2 N=4 depths 1-3; N=6 depths 1-5). Ultrametricity: d=2^-depth(LCA) satisfies the strong triangle inequality in 0 of 32768 ordered triples on 32 leaves; the same 32 leaves on the real line violate it in 9920 of 32768. Tree balls are nested-or-disjoint (30 balls, 0 partial overlaps in 435 pairs) vs 64 grid balls giving 656 partial overlaps in 2016 pairs. FALSIFIED: min cut is NOT the ultrametric component count / maximal-ball cover (cover = cut+1 in only 22.24 percent; A = all-but-one-leaf gives cut 1 vs cover 4).',
 'OPEN TENSION (unresolved): finite-truncated two-point cut is bounded and independent of separation (sibling pairs 1, all others 2) while the p-adic CFT boundary result scales as log_p |x-y|_p. Candidate resolutions: bulk dual is not a leaf-subtree; boundary legs weighted; RT surface is the geodesic between the two bounding points of a totally disconnected boundary. Also open: Lorentzian dynamics, quantum corrections, loops/winding as quotient-emergent, HaPPY cycles counterexample. MANDATORY: cite the 5-finding Disconfirming Registry. EVIDENCE NOT YET LOGGED: arXiv:1902.01411; Heydeman et al. 2021; PRD 107,126011; arXiv:1601.01694; arXiv:1503.06237.',
 'Resolve the two-point cut vs log-law tension. Log the 5 references into QNFO.RES.014 and the ADL.001 / UMP.009 threads. Add an RT-on-trees subsection with the Disconfirming Registry citation. Run the ultrametricity test on embeddings. Correct any text asserting the fragmentation formula.',
 'handoffs/2026-09-11/rt-on-trees-closeout.md', 'QNFO.ADL.RT-TREE-2026-09-11'
);

INSERT INTO handoffs (session_id, project_id, phase_completed, summary, pending_work, next_action, r2_handoff_path, wbs_code) VALUES (
 'chatbox-ops-handoff-writepath-2026-09-11', 'qnfo', 0,
 'OPS GAP (2026-09-11): the qnfo-ops endpoint cannot write the handoffs table. ops_d1_query is strictly read-only (probe rejected: read-only SELECT/WITH only - mutation keywords are rejected anywhere in the statement). r2_* tools are read-only. No registered service exposes a handoff write route (service_registry: only qnfo-archive has handoff-search, a consumer). Durable writes available: ops-workspace (R2-backed) and GitHub. R2 convention confirmed: qnfo-audit bucket, handoffs/<date>/<slug>.md (4 objects, newest 2026-09-02).',
 'Closeout rows drafted as executable INSERTs in ops-workspace/handoffs/2026-09-11-handoff-rows.sql and in this document. They need a writer: a handoff-write route on a worker holding the D1 binding, or a maintainer executing the SQL.',
 'Expose a POST handoff route (or a write-capable tool) so the ops endpoint can close out sessions directly.',
 'handoffs/2026-09-11/ops-handoff-writepath-closeout.md', 'QNFO.OPS.HANDOFF-WRITEPATH-2026-09-11'
);
```

## Secondary finding: research_queue did not persist

The RT-on-trees idea was submitted twice to research_queue (once earlier in the session, once at
closeout). The second call returned ok with related papers but `expressed: {"ok":false,
"error":"The operation was aborted"}`. Verification: `SELECT ... FROM research_queue WHERE
created_at >= '2026-09-11'` returns 0 rows. So the finding is NOT in the research pipeline and
must be re-submitted once the expression step is fixed.
