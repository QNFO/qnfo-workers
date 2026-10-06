# QNFO-ULA v2.1: Software Terms (draft for QNFO/license)

Owner direction 2026-10-06: Creative Commons is not reliable for software, so update the QNFO Unified License Agreement
for software, keep its core tenets (any use that generates money needs a separate agreement), and keep everything based
on the QNFO-ULA. `QNFO/license` is the canonical home of the license. The session that wrote this draft could not push
there, so the finished files wait here.

## What to do

Copy everything in `for-QNFO-license/` to the root of `QNFO/license` and commit it to its default branch. This adds three
v2.1 files, replaces `LICENSE` and `README.md`, and leaves the v2.0 files unchanged.
Posting is the moment v2.1 takes effect (section 10.3). qnfo-gateway 3.11.0 then serves it at https://legal.qnfo.org/
within the hour, and keeps v2.0 at https://legal.qnfo.org/v2.0. Before that, every page serves v2.0 exactly as now.

Rebuild the text and HTML after editing the Markdown:
`python3 docs/license/md2txt.py QNFO-ULA-v2.1.md 'QNFO Unified License Agreement v2.1\n\nEffective: on posting at https://qnfo.org/legal/license (v2.0: May 29, 2026) · SPDX: LicenseRef-QNFO-ULA-2.1 · QNFO Hub\n' > QNFO-ULA-v2.1.txt`
(the same script reproduces the published v2.0 .txt byte for byte from its Markdown).

## What changed from v2.0, and why

| v2.0 problem for code | v2.1 answer | Modelled on |
|---|---|---|
| CC BY-NC-SA 4.0 is the base license for code; Creative Commons advises against CC for software | Software (defined in 12.1, including Lean proofs) gets its own base terms, section 12; everything else stays CC BY-NC-SA 4.0 | CC FAQ |
| "Commercial" is written for documents | 12.3: any use of the Software that generates money needs a separate agreement under 10.7. It lists sale, hosting, SaaS, ad-funded, paid deliverables, any for-profit use including evaluation, bundling in sold hardware, and training commercial models. The existing 2.4 carve-outs (personal, teaching, published research, non-profits, government) are kept | PolyForm Noncommercial 1.0.0; ULA 2.1, 2.4 |
| ShareAlike says nothing about source code, compiled code, linking or hosting | 12.4: derivatives stay under the ULA, complete source must go to every recipient, notices are kept, a modified copy offered over a network must offer its source, and your own separate files that only import the code may carry your license | MPL-2.0 (file-level), AGPL-3.0 section 13 |
| CC licenses grant no patent rights (CC 4.0 section 2(b)(2)), so users of QNFO code had no patent license | 12.5: a patent license for non-commercial use only, which ends if the user sues claiming the Software infringes a patent | Apache-2.0 section 3 |
| No contribution terms, so code with outside contributions could not be commercially licensed | 12.7: a DCO-style certification, plus a license to the Licensor to relicense contributions under 10.7 | DCO 1.1 |
| Third-party components and GPL interaction were unaddressed | 12.6: they keep their own licenses; no combination that would require GPL/LGPL/AGPL distribution | — |
| "Open source" was implied | 12.8: source-available, not open source (fails Open Source Definition criterion 6) | OSD |
| Automatic termination on any slip | 12.11: one 30-day cure for notice and source breaches only; commercial use without an agreement has no cure | GPL-3.0 section 8, PolyForm |

Unchanged, and applying to Software in full: the preamble, non-commercial use (2.1, with the 85% liquidated damages in
6.1), the RAIL use restrictions (2.2), the AI-training rules, attribution (3), patent prior-art citation (5), ownership
(7), Swiss law and ICC arbitration (8), disclaimers (9), and the public-benefit commercial licensing framework (10.7).

## Decisions only the Licensor can make (defaults chosen in this draft)

1. **The 2.4 carve-outs.** v2.0 treats grants, donations and tuition that fund research, teaching or non-profit work as
   not revenue from the Content. Section 12.3 keeps that for Software. A strict reading of "anything that generates
   money" would remove it, which would also stop universities and grant-funded labs from using QNFO code.
2. **The patent license (12.5).** It covers only patents that the Software as distributed necessarily infringes, and
   only for non-commercial use.
3. **File-level ShareAlike (12.4(d)).** Code that imports a QNFO library can carry its own license. Strong copyleft (the
   whole program under the ULA) is the stricter alternative, at a further cost to adoption.
4. **The one-time 30-day cure (12.11).**

This is a drafted license, not legal advice. A review by a lawyer admitted in Switzerland (the governing law, section 8)
before posting is the prudent step.
