"""Offline checks for make_director: number extraction and the deterministic beat gate. Run: python -I test_director_checks.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_director as m

art = "The model says normal capacity is about three hundred and fifty bits per second. In changed states it drops to about one hundred and eighty. A guess must be right more than two times in three."
nums = m.numbers_in(art)
assert 350.0 in nums and 180.0 in nums and 3.0 in nums, nums
ok = {"kind": "bignum", "value": 350, "label": "bits per second", "narr": "Normal capacity is about three hundred and fifty bits per second."}
assert m.check_beat(ok, nums, art) is None
bad_num = dict(ok, value=500, narr="Capacity is five hundred bits per second.")
assert "not in the article" in m.check_beat(bad_num, nums, art)
assert "missing" in m.check_beat({"kind": "flow", "narr": "Short."}, nums, art)
assert "URL" in m.check_beat({"kind": "list", "items": ["a", "b"], "narr": "Go to papers.org now."}, nums, art)
long = {"kind": "list", "items": ["a", "b"], "narr": " ".join(["word"] * 19) + "."}
assert "18 words" in m.check_beat(long, nums, art)
print("ok")
