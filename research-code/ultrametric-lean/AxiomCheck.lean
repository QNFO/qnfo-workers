-- SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
-- Copyright (c) 2026 Rowan Brad Quni-Gudzinas
-- Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
-- Non-commercial use only; commercial use requires a separate agreement.
import Ultrametric
-- CI fails if any theorem depends on `sorryAx`; standard axioms (propext, Quot.sound) are fine.
#print axioms Ultrametric.isosceles
#print axioms Ultrametric.ball_any_center
#print axioms Ultrametric.ball_nested_or_disjoint
#print axioms Ultrametric.confinement
#print axioms Ultrametric.unique_decoding
#print axioms Ultrametric.separation_r_not_enough
