# research-code

QNFO research libraries, staged and tested here until each has its own public repository (CODE-REACH-1,
`docs/CODE-REACH-PROGRAM.md`). Every library is tested on each change by `.github/workflows/research-code.yml` and is
registered in D1 `qnfo-audit.research_code_libraries`.

| Library | Field | Kind | Tests |
|---|---|---|---|
| [agentic-collapse](agentic-collapse/) | AI | paper companion | 16 unittest; finds the v1 trajectory off its own equations |
| [ignorance-audit](ignorance-audit/) | metascience | standalone tool and companion | 20 unittest |
| [ultrametric-lean](ultrametric-lean/) | mathematics, formal verification | Lean 4 formalization | lake build, no sorryAx |

Rules: offline tests, pinned toolchain, no secret or model provider inside a library, claim/test/status in every README,
`CITATION.cff` pointing at the paper, QNFO-ULA `LICENSE`. A library that disagrees with its paper
pins the disagreement in a test and files an `agent_issues` row.
