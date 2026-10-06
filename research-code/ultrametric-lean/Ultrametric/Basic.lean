/-!
# Natural-valued ultrametrics

A dependency-free (no Mathlib) formalization of the facts the QNFO ultrametric programme leans on:
the isosceles property, "every point of a ball is its centre", nested-or-disjoint balls, and the
error-confinement / unique-decoding property of ultrametric codes.

Distances take values in `Nat`. That covers tree (cophenetic depth) ultrametrics and, after the
monotone reindexing `n ↦ N - v`, p-adic distances on any bounded range of valuations. Mathlib's
`IsUltrametricDist` is the general real-valued setting; these statements are textbook facts and are
proved here so they can be checked with a bare Lean toolchain in seconds.
-/

namespace Ultrametric

/-- An ultrametric with natural-number distances. -/
structure NatUltrametric (α : Type) where
  d : α → α → Nat
  self_zero : ∀ x, d x x = 0
  eq_of_zero : ∀ x y, d x y = 0 → x = y
  symm : ∀ x y, d x y = d y x
  ultra : ∀ x y z, d x z ≤ max (d x y) (d y z)

variable {α : Type} (U : NatUltrametric α)

/-- Every triangle is isosceles: if two sides differ, the third equals the longer one. -/
theorem isosceles (x y z : α) (h : U.d x y ≠ U.d y z) :
    U.d x z = max (U.d x y) (U.d y z) := by
  have h1 := U.ultra x y z
  have h2 := U.ultra x z y
  have h3 := U.ultra y x z
  rw [U.symm z y] at h2
  rw [U.symm y x] at h3
  omega

/-- The closed ball of radius `r` about `c`. -/
def NatUltrametric.ball (c : α) (r : Nat) (x : α) : Prop := U.d c x ≤ r

/-- Every point of a ball is a centre of it. -/
theorem ball_any_center (c y : α) (r : Nat) (hy : U.ball c r y) (x : α) :
    U.ball c r x ↔ U.ball y r x := by
  unfold NatUltrametric.ball at *
  have h1 := U.ultra y c x
  have h2 := U.ultra c y x
  rw [U.symm y c] at h1
  constructor <;> intro h <;> omega

/-- Two balls of radii `r ≤ s` are nested or disjoint. -/
theorem ball_nested_or_disjoint (c c' : α) (r s : Nat) (hrs : r ≤ s) :
    (∀ x, U.ball c r x → U.ball c' s x) ∨ (∀ x, ¬ (U.ball c r x ∧ U.ball c' s x)) := by
  by_cases hshare : ∃ x, U.ball c r x ∧ U.ball c' s x
  · left
    intro y hy
    obtain ⟨x, hx, hx'⟩ := hshare
    unfold NatUltrametric.ball at *
    have h1 := U.ultra c' x c
    have h2 := U.ultra c' c y
    rw [U.symm x c] at h1
    omega
  · right
    intro x hx
    exact hshare ⟨x, hx⟩

/-- Error confinement: a state within `r` of codeword `c` is, from any codeword `c'` more than
`r` away from `c`, exactly as far as `c` is. -/
theorem confinement (c c' x : α) (r : Nat) (hsep : r < U.d c c') (hx : U.d c x ≤ r) :
    U.d c' x = U.d c' c := by
  have h := isosceles U c' c x (by rw [U.symm c' c]; omega)
  rw [h, U.symm c' c]
  omega

/-- Unique decoding: codewords separated by more than `r` decode every error of size at most `r`
uniquely. The Hamming-space condition is separation of at least `2r + 1`; here `r + 1` suffices. -/
theorem unique_decoding (c c' x : α) (r : Nat) (hsep : r < U.d c c') (hx : U.d c x ≤ r) :
    r < U.d c' x := by
  rw [confinement U c c' x r hsep hx, U.symm c' c]
  exact hsep

/-- The bound is tight: separation `r` is not enough in general (witness: the discrete metric
with `r = 1`, where two distinct codewords and the state `x = c'` both sit within distance 1). -/
def discrete (α : Type) [DecidableEq α] : NatUltrametric α where
  d x y := if x = y then 0 else 1
  self_zero x := by simp
  eq_of_zero x y h := by
    by_cases hxy : x = y
    · exact hxy
    · simp [hxy] at h
  symm x y := by
    by_cases hxy : x = y
    · simp [hxy]
    · have : ¬ y = x := fun h => hxy h.symm
      simp [hxy, this]
  ultra x y z := by
    by_cases hxz : x = z
    · simp [hxz]
    · by_cases hxy : x = y
      · subst hxy; simp [hxz]
      · simp [hxy, hxz]
        split <;> omega

theorem separation_r_not_enough :
    ∃ (c c' x : Bool), c ≠ c' ∧ (discrete Bool).d c c' ≤ 1 ∧ (discrete Bool).d c x ≤ 1 ∧
      ¬ (1 < (discrete Bool).d c' x) := by
  refine ⟨false, true, true, by decide, ?_, ?_, ?_⟩ <;> simp [discrete]

end Ultrametric
