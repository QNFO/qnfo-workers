# SKIL — Framework Level Discipline (DPRF)

**Skill:** assign every claim a DPRF level and run the two gates.
**When to use:** claiming, pre-registering, auditing, red-teaming, or publishing any QNFO research
object. **Source:** QNFO.RES.032 FRAMEWORK.md v0.1 · PLCY/MAP-TERRITORY-REALIZATION-GATE.md

## Step 1 — Assign a level (R1)

Pick the level on the pre-arithmetic ladder where the claim's **object** lives:

| Level | Test question |
|:------|:--------------|
| D0 | Is this about the cut/mark primitive itself? |
| D1 | Is structure present but number absent (order, hierarchy, partition)? |
| D2 | Is this about counting and composing distinctions (addition, multiplication, factorization)? |
| D3 | Is this about patterns of that composition (distribution, L-functions)? |
| D4 | Is this about assigning size (norms, valuations, places)? |
| D5 | Is this about the relational form (metrics, ultrametricity, rigidity)? |
| D6 | Is this about distinction made operational (entropy, two-point functions, discrimination)? |
| D7 | Is this about finite-resolution application to observation (protocol, instrument, noise)? |
| D8 | Is this a falsifiable claim about the world? |

Spans are allowed (`DX–DY`) **only** with a declared bridge list, one bridge per step.

## Step 2 — Declare the commitment fields

- `ontic_commitment`: `methodological` unless explicitly reifying (then `heuristic` or `ontic`).
- `map_territory`: `map` for identities/theorems, `bridge` for declared passages,
  `territory` for empirical claims.
- `carrier`: definitional / formal / computational / empirical / engineered.

## Step 3 — Run the gates

G1: ontic commitment declared? If `ontic` → G2 triple present and pre-registered? If not → demote
to `heuristic`.

G2: if `bridge`/`territory` → protocol + null model + falsifier all present and pre-specified?
If not → demote one rung (`territory`→`bridge`→`map`).

## Step 4 — Check for the four defect classes

`LEAK-X-Y` · `ONTIC-SMUGGLE` · `MAP-AS-TERRITORY` · `OBJ-CONFLATE`
— see PLCY/MAP-TERRITORY-REALIZATION-GATE.md §5 for definitions and fixes.

## Step 5 — Record the verdict

```
claim=<name> level=<DX> ontic=methodological map_territory=<status> gates=G1:PASS,G2:PASS defects=0
```

Attach to the pre-registration (claim sheet T-1), the audit note, or the publication gate log.
Templates live in QNFO/qnfo-research, branch
res/paper/distinction-primitive-research-framework, `templates/`.
