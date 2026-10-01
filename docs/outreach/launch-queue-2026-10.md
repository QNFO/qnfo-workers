# Launch queue, October 2026 (STRATEGY-1)

Ready-to-approve posts for the selected works (docs/STRATEGY.md s2.4). LinkedIn posts go to Buffer as drafts and are published
only after the owner's one-tap approval (LinkedIn API Terms 3.1). Bluesky versions post automatically inside the s5 gates.
Every claim below is taken from the work's own abstract; nothing names a company. One link per post, UTM-tagged with a
short campaign code: jps-metric = joules-per-solution-metric, qec-landauer = jpcub-qec-landauer, jpcub-17 =
jpcub-competitive-landscape, fleet-lessons = quniverse-fleet-lessons (entity_map, s6.2).

Schedule (Europe/Amsterdam, Tue/Thu mornings, then the bandit in s6.4 takes over): post 1 Tue 2026-10-06, post 2 Thu
2026-10-08, post 3 Tue 2026-10-13, post 4 Thu 2026-10-15.

---

## 1. The Joules-per-Solution metric (work 1)

**LinkedIn**

> What does a correct answer cost?
>
> Computing benchmarks usually report speed, or energy for one kind of workload. I surveyed 14 of them (SPECpower, Green500,
> ML.ENERGY, NeuroBench and others) and none lets you compare energy across domains.
>
> So I defined one: joules per solution, the total system energy per correct answer. It counts six components: computation,
> memory, I/O, cooling, power conversion and amortised manufacturing. It comes with a five-phase measurement protocol and
> anti-gaming rules: pre-registration, adversarial validation, Pareto-frontier reporting, component audits, and a living
> benchmark.
>
> If you measure energy on any platform, quantum or classical, I would value your critique, and your numbers.
>
> https://papers.qnfo.org/papers/joules-per-solution-metric?utm_source=linkedin&utm_medium=social&utm_campaign=jps-metric

**Bluesky (under 300 characters)**

> What does a correct answer cost? Joules per solution: total system energy per correct answer, with anti-gaming rules. None of 14 existing benchmarks compares across domains.
> https://papers.qnfo.org/papers/joules-per-solution-metric?utm_source=bluesky&utm_medium=social&utm_campaign=jps-metric

Source: abstract of 10.5281/zenodo.21637028.

---

## 2. Error correction is a Landauer machine (work 2)

**LinkedIn**

> Measurement-based quantum error correction has a thermodynamic price.
>
> Every cycle of measurement-based error correction erases information, and Landauer's principle prices each erased bit at
> no less than kT ln 2. So correction overhead converges to a positive floor: (n-k)/k x kT ln 2 per logical qubit per round
> for an [[n,k]] code. I computed and checked how that floor scales across code families.
>
> Two further results: a two-level nested code cut per-round erasures 1.6-3x against flat codes of equal rate on a
> clustered channel, at the cost of more residual errors; and the floor is an architecture choice, because autonomous
> (dissipative) correction sits outside the claim.
>
> https://papers.qnfo.org/papers/jpcub-qec-landauer?utm_source=linkedin&utm_medium=social&utm_campaign=qec-landauer

**Bluesky**

> Measurement-based QEC erases bits each round, so Landauer sets a floor: (n-k)/k x kT ln 2 per logical qubit per round. Autonomous correction is outside the claim.
> https://papers.qnfo.org/papers/jpcub-qec-landauer?utm_source=bluesky&utm_medium=social&utm_campaign=qec-landauer

Source: abstract of 10.5281/zenodo.22261547.

---

## 3. Energy per correct answer across 17 quantum platforms (work 3)

**LinkedIn**

> Which quantum architecture spends the least energy per correct answer?
>
> I estimated joules per solution for 17 platforms (13 gate-model processors across superconducting, trapped-ion and
> neutral-atom architectures, plus 4 other entries) from their published specifications, using one system-level power model.
> These are estimates, not measurements.
>
> The ranking says gate speed, not cooling, qubit count or fidelity alone, dominates energy per solution. Room-temperature
> operation does not rescue slow gates: microsecond gates (about 125x slower than superconducting) let execution energy
> overwhelm the cooling advantage. Neutral atoms come out the most balanced, competitive with superconducting systems at
> about a quarter of the system power.
>
> Measured numbers would beat my estimates. If you have them, I would like to compare.
>
> https://papers.qnfo.org/papers/jpcub-competitive-landscape?utm_source=linkedin&utm_medium=social&utm_campaign=jpcub-17

**Bluesky**

> Energy per correct answer for 17 quantum platforms, estimated from published specs: gate speed, not cooling, dominates. Estimates, not measurements; data welcome.
> https://papers.qnfo.org/papers/jpcub-competitive-landscape?utm_source=bluesky&utm_medium=social&utm_campaign=jpcub-17

Source: abstract of 10.5281/zenodo.21821767.

---

## 4. What I learned operating an autonomous research system (work 7)

**LinkedIn**

> For about a year an autonomous agent has run my research and publishing system on Cloudflare Workers, under my direction,
> with no code written by me. I wrote up what it is, what it was for, where it worked and where it failed.
>
> What worked: it reliably produces and publishes research, and its most durable asset is an operating discipline in which
> every observed failure becomes an enforceable gate.
>
> What did not: autonomy is incomplete (3.6 out of 5 on the system's own assessment), maintenance has repeatedly outrun
> self-healing, and a consolidation wave that shrank the fleet from 57 to 38 workers retired a load-bearing function before it
> was restored.
>
> If you run agents in production, the failure ledger is the part worth reading.
>
> https://papers.qnfo.org/papers/quniverse-fleet-lessons?utm_source=linkedin&utm_medium=social&utm_campaign=fleet-lessons

**Bluesky**

> A year of an autonomous agent running my research system: every observed failure became an enforceable gate; autonomy 3.6/5 on its own scoring. The failure ledger:
> https://papers.qnfo.org/papers/quniverse-fleet-lessons?utm_source=bluesky&utm_medium=social&utm_campaign=fleet-lessons

Source: abstract of 10.5281/zenodo.23079905.

---

## Checks before each post goes out
- The link resolves 200 and the paper page shows the abstract.
- The text has no mojibake (`Ã`, `â€`, `â\x80`) and no banned organisation label (s2.1).
- Bluesky text is at most 300 characters including the link.
- Post id or URI is stored with its `utm_campaign` (POST-ID-UTM-1, agent_issues 1712).
