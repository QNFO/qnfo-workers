# Finding — the deployed topic selector reproduced from two read-only sources, and a retry loop that reproduces its own input (2026-09-13)

Written by qnfo-ops. Two results, both from read-only reads: the deployed worker's topic choice is
reproducible from observable data, which pins a divergence from the repo to a number; and the retry
loop that was supposed to recover from the 06:01Z failure was structurally unable to.

## 1. The selector, reproduced

`pickTopic()` in `worker.js` (blob `c06edffb…`, v1.0.0) reads the 24 most recently used seed keys,
takes the `TOPICS` entries not among them as `fresh`, and picks `pool[(dayOfMonth + off) % pool.length]`
with `off` = 0 for essay, 9 for notes, 5 for serial.

Two inputs are needed and both are readable without a key: the repo's `TOPICS` order, and
`PERSONAL.companion_seeds` ordered by `used_at DESC`. Executed with those inputs and day-of-month 13:

```
TOPICS (repo order)                 14 entries
companion_seeds distinct keys       30
window read by pickTopic()          top 24 by used_at
fresh = TOPICS minus window         ["ultrametric-music","decoherence-epistemics",
                                     "bremermann-economics","symmetry-craft",
                                     "notation-thought","entropy-meaning"]   (6)
notes: (13 + 9) % 6 = 4  ->  notation-thought
```

The observed topic for the 2026-09-13 06:01Z notes cycle is `notation-thought`. **The prediction
matches.** The same arithmetic predicts `decoherence-epistemics` for an essay and
`ultrametric-music` for a serial on this day-of-month; neither has been tested, because no essay or
serial ran on 2026-09-13.

This is the sharpest form of the provenance evidence collected so far. It is not "the deployed
worker behaves differently from the repo". It is a specific number — six fresh entries in that order
— that the repo's own code reproduces from a public table.

## 2. The deployed topic list is at least 30 entries

`companion_seeds` holds 30 distinct keys with `source = 'rotation'`. Fourteen of them are the repo's
`TOPICS` ids. The other sixteen are not in the repo at all:

```
collecting-order  craft-quality  fermentation-time  walking-thinking  boredom-creativity
handwriting-identity  silence-music  garden-wildness  maps-territory  translation-loss
ruins-memory  coffeehouse-public  attention-time  play-rules  domestication-coevolution
season-ritual
```

So the deployed `TOPICS` is at least 30 entries, not 14, and every one of the sixteen additions has
been used at least once. The earlier record noted the extra keys as an unexplained set; with §1 they
are now the explanation for why the repo's rotation cannot be reproduced from the repo alone.

## 3. The retry loop reproduced its own input

`/api/runs` rows 434–443 for the 06:01Z cycle, three compose attempts:

| attempt | composed | outcome |
|---|---|---|
| 1 | 3516 | rejected: `unverified names: Notation Systems, Cognitive Scaffolds, Interdependent Computation, Playful Convergence, Double Fugue, Live Counterpoint` |
| 2 | 3516 | rejected: **the same six names, in the same order** |
| 3 | 3516 | rejected: **the same six names, in the same order** |

Executed comparison: the three flagged-name lists are identical strings, and the three composition
sizes are identical. The persisted `raw:` text is byte-identical across the three rows.

Whatever the mechanism — a cached composition, or a model returning the same text at temperature 0.7
— the loop did not resample. A retry that reproduces its input cannot succeed at a failure that
depends on the content it reproduced. 324 seconds bought three copies of one result, and the
terminal status was `failed: no piece survived the gate`.

This is the generalisable part: a retry loop is only a recovery mechanism if the failure is
stochastic. Here the failure was a function of the topic's anchor set and the writer's heading
convention, both of which the loop held fixed. The fix belongs in what the loop varies — model,
temperature, or the heading instruction — not in the number of attempts.

## 4. Forward risk, stated as arithmetic rather than a schedule

Six topics are currently fresh. With the window frozen as observed, a notes cycle selects
`notation-thought` whenever `(dayOfMonth + 9) % 6 = 4`, that is on days where `dayOfMonth ≡ 1 (mod 6)`
— 1, 7, 13, 19, 25, 31. Today is 13, which is how the pick arose.

That condition will not hold for long. Every run inserts a seed key, which perturbs the 24-entry
window and therefore the fresh pool, and the fresh pool empties after six more picks, at which point
`pickTopic()` falls back to the full list and the index changes. So the honest statement is
conditional: the failure mode attached to `notation-thought` recurs for as long as that topic sits in
the fresh pool at the index the day-of-month selects, and the loop that would recover from it does
not vary anything that matters.

The measured consequence today: one notes cycle lost, 324 seconds spent, and the reader's page
received nothing from it.

## 5. What is not claimed

- No fix applied; `ops_d1_query` is SELECT/WITH only and no write path to `PERSONAL` is exposed here.
- §1 is a reproduction, not a proof of identity. It assumes the deployed list preserves the repo's
  relative order for the six fresh keys, which is what makes the index land on the observed value.
  A different order that happens to place `notation-thought` fifth among six would fit equally well.
- The essay and serial predictions in §1 are untested.
- §3 does not identify the mechanism of the repetition, only that the three inputs to the validator
  were identical. Caching and low-entropy sampling are both consistent with it.
- The window size of 24 is read from the repo's source; the deployed worker may read a different
  window, in which case §1's agreement is a coincidence. I judge that unlikely given the exact match,
  but it is not excluded.
