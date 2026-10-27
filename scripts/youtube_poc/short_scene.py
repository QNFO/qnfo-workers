"""Manim scene for a vertical (9:16) short. Reads the beat list from $SHORT_SPEC (json: {"beats":[{"kind","dur","params"...}]}).

Templates: versus, payoff, meter, dots, hook, cta. Each is a small animated diagram; a beat animates for about
60 % of its length and then holds with gentle motion, so the picture changes with the narration instead of captioning it.
"""
import json, math, os
from manim import *

config.frame_width, config.frame_height = 9, 16
config.background_color = "#0F1530"

TEAL, AMBER, RED, INK, SOFT = "#2EC4B6", "#FFB703", "#FF5A5F", "#F4F6FB", "#7C86AD"
FONT = "Segoe UI"


def T(s, size=40, color=INK, bold=True, **k):
    return Text(s, font=FONT, font_size=size, color=color, weight=BOLD if bold else NORMAL, **k)


class ShortScene(Scene):
    def construct(self):
        spec = json.load(open(os.environ["SHORT_SPEC"], encoding="utf8"))
        self.add_background()
        tag = T("QNFO IN PLAIN LANGUAGE", 22, TEAL).to_edge(UP, buff=0.7)
        ai = T("AI-GENERATED NARRATION", 16, SOFT, bold=False).next_to(tag, DOWN, buff=0.12)
        self.add(tag, ai)
        for b in spec["beats"]:
            t0 = self.time
            grp = getattr(self, "beat_" + b["kind"])(b)
            used = self.time - t0
            hold = max(0.0, b["dur"] - used - 0.35)
            if hold: self.wait(hold)
            self.play(FadeOut(grp), run_time=0.35)

    # --- living background: slow drifting translucent circles
    def add_background(self):
        circles = VGroup(*[Circle(radius=r, fill_color=c, fill_opacity=0.10, stroke_width=0).move_to([x, y, 0])
                           for r, c, x, y in [(2.6, TEAL, -3, 4), (3.2, AMBER, 3.5, -2), (2.0, RED, -2, -5), (2.4, TEAL, 3, 6)]])
        base = [m.get_center().copy() for m in circles]
        def drift(g):
            t = self.time
            for i, m in enumerate(g):
                m.move_to(base[i] + np.array([0.5 * math.sin(t * 0.4 + i), 0.5 * math.cos(t * 0.3 + i * 2), 0]))
        circles.add_updater(drift); self.add(circles)

    # --- hook / cta: big words pop in one by one
    def beat_hook(self, b):
        words = b["lines"]
        g = VGroup(*[T(w, b.get("size", 76), AMBER if i in b.get("hi", []) else INK) for i, w in enumerate(words)]).arrange(DOWN, buff=0.35).move_to(UP * 1.5)
        self.play(LaggedStart(*[FadeIn(m, shift=UP * 0.4, scale=0.7) for m in g], lag_ratio=0.35), run_time=min(1.8, b["dur"] * 0.5))
        self.play(Indicate(g[b.get("hi", [0])[0]], color=AMBER, scale_factor=1.12), run_time=0.7)
        return g

    def beat_cta(self, b):
        a = T(b["title"], 56).move_to(UP * 2.8)
        box = RoundedRectangle(corner_radius=0.3, width=7.4, height=1.5, color=TEAL, fill_color=TEAL, fill_opacity=0.18, stroke_width=4).move_to(UP * 0.3)
        u = T(b["url"], 46, TEAL).move_to(box)
        sub = T(b["sub"], 34, SOFT, bold=False).next_to(box, DOWN, buff=0.5)
        g = VGroup(a, box, u, sub)
        self.play(FadeIn(a, shift=UP * 0.3), run_time=0.5)
        self.play(Create(box), Write(u), run_time=0.9)
        self.play(FadeIn(sub), run_time=0.4)
        self.play(Indicate(u, color=AMBER), run_time=0.6)
        return g

    # --- versus: two cards with icons
    def beat_versus(self, b):
        def card(x, color, label, icon):
            r = RoundedRectangle(corner_radius=0.3, width=3.9, height=5.2, color=color, fill_color=color, fill_opacity=0.14, stroke_width=4).move_to([x, 1.2, 0])
            lab = T(label, 34, color).next_to(r.get_bottom(), UP, buff=0.55)
            icon.move_to(r.get_center() + UP * 0.5)
            return VGroup(r, icon, lab)
        target = VGroup(*[Circle(radius=rr, color=TEAL, stroke_width=7) for rr in (1.2, 0.8, 0.4)], Dot(radius=0.12, color=AMBER))
        story = VGroup(*[Line(LEFT * 1.0, RIGHT * (1.0 - 0.3 * (i % 2)), color=AMBER, stroke_width=9) for i in range(5)]).arrange(DOWN, buff=0.28, aligned_edge=LEFT)
        story.add(Star(n=5, outer_radius=0.35, color=AMBER, fill_opacity=1).next_to(story, UP, buff=0.3))
        left, right = card(-2.1, TEAL, b["left"], target), card(2.1, AMBER, b["right"], story)
        self.play(FadeIn(left, shift=RIGHT * 0.8), run_time=0.6)
        self.play(FadeIn(right, shift=LEFT * 0.8), run_time=0.6)
        self.play(LaggedStart(*[Indicate(m, color=AMBER, scale_factor=1.15) for m in target[:3]], lag_ratio=0.2), run_time=1.0)
        return VGroup(left, right)

    # --- payoff: bars grow from a baseline
    def beat_payoff(self, b):
        base_y = 1.6
        line = Line(LEFT * 3.8, RIGHT * 3.8, color=SOFT).move_to([0, base_y, 0])
        self.play(Create(line), run_time=0.3)
        out = VGroup(line)
        for x, v, color, label in b["bars"]:
            h = abs(v) * 1.5
            bar = Rectangle(width=1.5, height=h, color=color, fill_color=color, fill_opacity=0.85, stroke_width=0)
            bar.move_to([x, base_y + (h / 2 if v > 0 else -h / 2), 0])
            grow = bar.copy().stretch_to_fit_height(0.01).move_to([x, base_y, 0])
            val = T(("+" if v > 0 else "−") + str(abs(v)), 44, color)
            val.next_to(bar, UP if v > 0 else DOWN, buff=0.18)
            lab = T(label, 26, INK, bold=False).move_to([x, base_y - 2.6, 0])
            self.play(Transform(grow, bar), FadeIn(val, shift=UP * 0.2), FadeIn(lab), run_time=0.7)
            out.add(grow, val, lab)
        return out

    # --- meter: marker climbs to its value and stops short of the threshold
    def beat_meter(self, b):
        x0, x1, y = -3.3, 3.3, 1.8
        axis = Line([x0, y, 0], [x1, y, 0], color=SOFT, stroke_width=10)
        xs = lambda f: x0 + (x1 - x0) * f
        thr = Line([xs(b["need"]), y - 0.7, 0], [xs(b["need"]), y + 0.7, 0], color=AMBER, stroke_width=8)
        thr_lab = T(b["need_label"], 28, AMBER).next_to(thr, UP, buff=0.25)
        fill = Line([x0, y, 0], [x0, y, 0], color=TEAL, stroke_width=18)
        dot = Dot([x0, y, 0], radius=0.26, color=TEAL)
        have = T(b["have_label"], 30, TEAL).next_to(axis, DOWN, buff=0.9)
        cap = T(b["axis_label"], 26, SOFT, bold=False).next_to(axis, DOWN, buff=0.3).align_to(axis, LEFT)
        self.play(Create(axis), FadeIn(cap), run_time=0.4)
        self.play(Create(thr), FadeIn(thr_lab, shift=DOWN * 0.2), run_time=0.5)
        end = [xs(b["have"]), y, 0]
        self.play(dot.animate.move_to(end), fill.animate.put_start_and_end_on([x0, y, 0], end), run_time=1.6, rate_func=smooth)
        self.play(dot.animate.set_color(RED), fill.animate.set_color(RED), FadeIn(have.set_color(RED).next_to(dot, DOWN, buff=0.5)), run_time=0.5)
        gap = T(b["verdict"], 40, RED).move_to([0, -1.0, 0])
        self.play(FadeIn(gap, scale=0.8), Wiggle(dot), run_time=0.7)
        return VGroup(axis, thr, thr_lab, fill, dot, have, cap, gap)

    # --- dots: a population whose mix changes
    def beat_dots(self, b):
        n, cols = 20, 5
        pts = [[(i % cols - 2) * 1.05, 2.9 - (i // cols) * 1.05, 0] for i in range(n)]
        k0, k1 = round(b["from"] * n), round(b["to"] * n)
        dots = VGroup(*[Dot(p, radius=0.38, color=TEAL if i < k0 else AMBER) for i, p in enumerate(pts)])
        leg = VGroup(VGroup(Dot(color=TEAL, radius=0.16), T(b["a"], 26, TEAL)).arrange(RIGHT, buff=0.2),
                     VGroup(Dot(color=AMBER, radius=0.16), T(b["b"], 26, AMBER)).arrange(RIGHT, buff=0.2)).arrange(RIGHT, buff=0.7).move_to([0, 4.4 + 0.0, 0])
        cnt = T(f"{k0} of {n}", 54, TEAL).move_to([0, -1.9, 0])
        self.play(LaggedStart(*[GrowFromCenter(d) for d in dots], lag_ratio=0.03), FadeIn(leg), FadeIn(cnt), run_time=1.0)
        order = range(k0, k1) if k1 > k0 else range(k0 - 1, k1 - 1, -1)
        anims = [dots[i].animate.set_color(TEAL if k1 > k0 else AMBER).scale(1.25) for i in order]
        new = T(f"{k1} of {n}", 54, TEAL).move_to(cnt)
        self.play(LaggedStart(*anims, lag_ratio=0.25), Transform(cnt, new), run_time=max(1.2, min(3.2, 0.25 * len(anims) + 1)))
        self.play(*[dots[i].animate.scale(0.8) for i in order], run_time=0.3)
        return VGroup(dots, leg, cnt)
