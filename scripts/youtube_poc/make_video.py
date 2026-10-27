#!/usr/bin/env python3
"""YT-POC-1: plain-language QNFO paper -> narrated MP4 + YouTube metadata.

Stages: fetch (papers.qnfo.org quickread HTML) -> script (scenes) -> tts (edge-tts) -> frames (Pillow)
-> assemble (ffmpeg via imageio-ffmpeg) -> metadata.json. No paid API, no key.

  python -I make_video.py <slug> [--out DIR] [--voice en-US-AriaNeural] [--max-sections N]
Deps: pip install imageio-ffmpeg edge-tts pillow
"""
import argparse, asyncio, html, json, os, re, subprocess, sys, urllib.request
from pathlib import Path

W, H = 1920, 1080
BASE = "https://papers.qnfo.org"
BG, INK, TEAL, MUTED = (245, 247, 251), (24, 29, 51), (14, 143, 143), (110, 118, 140)
FONTS = ["C:/Windows/Fonts/georgia.ttf", "C:/Windows/Fonts/segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]
FONTS_B = ["C:/Windows/Fonts/georgiab.ttf", "C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 qnfo-yt-poc"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf8", "replace")


def txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def fetch_article(slug):
    h = get(f"{BASE}/papers/{slug}/quickread")
    h = re.sub(r"<script.*?</script>", "", h, flags=re.S)
    m = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
    short = re.search(r'<section class="qa-short".*?</h2>(.*?)</section>', h, re.S)
    if not (m and short):
        raise SystemExit(f"no plain-language article for {slug} (coverage is partial; try another slug)")
    secs = []
    for sm in re.finditer(r'<section class="qa-sec">\s*<h2>(.*?)</h2>(.*?)</section>', h, re.S):
        head, body = txt(sm.group(1)), sm.group(2)
        if head.lower().startswith(("words used", "learn more")):
            continue
        paras = [txt(p) for p in re.findall(r"<p>(.*?)</p>", body, re.S)]
        if paras:
            secs.append({"heading": head, "text": " ".join(paras)})
    terms = [(txt(a), txt(b)) for a, b in re.findall(r"<dt>(.*?)</dt><dd>(.*?)</dd>", h, re.S)]
    cat = re.search(r'<div class="ph-meta">.*?</div>', h, re.S)
    return {"slug": slug, "title": txt(m.group(1)), "short": txt(short.group(1)), "sections": secs, "terms": terms,
            "url": f"{BASE}/papers/{slug}/quickread", "meta": txt(cat.group(0)) if cat else ""}


def sentences(t):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", t) if s.strip()]


def build_scenes(a, max_sections):
    """Scene = (kind, heading, narration, caption chunks). Hook first, takeaway last: retention structure."""
    sc = [{"kind": "title", "heading": a["title"], "narr": a["short"]}]
    for s in a["sections"][:max_sections]:
        sc.append({"kind": "body", "heading": s["heading"], "narr": f'{s["heading"]}. {s["text"]}'})
    sc.append({"kind": "outro", "heading": "Read it in plain language",
               "narr": "That was the short version. The full plain-language article, with links to learn more, is on papers dot q n f o dot org. "
                       "Follow for more research explained without jargon."})
    for x in sc:
        x["caps"] = sentences(x["narr"])
    return sc


async def tts(text, voice, path):
    import edge_tts
    await edge_tts.Communicate(text, voice, rate="-4%").save(str(path))


def ffbin():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def duration(ff, f):
    r = subprocess.run([ff, "-i", str(f)], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])


def font(paths, size):
    from PIL import ImageFont
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def wrap(d, t, f, maxw):
    lines, cur = [], ""
    for w in t.split():
        trial = (cur + " " + w).strip()
        if d.textlength(trial, font=f) <= maxw:
            cur = trial
        else:
            lines.append(cur); cur = w
    return lines + ([cur] if cur else [])


def frame(path, sc, cap, idx, n_scenes, progress, series):
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 24, H], fill=TEAL)
    d.text((110, 70), series.upper(), font=font(FONTS_B, 30), fill=TEAL)
    d.text((W - 110 - 520, 70), "AI-GENERATED NARRATION", font=font(FONTS_B, 26), fill=MUTED)  # BP26-AI-ACT-ART50-1: visible label
    big = sc["kind"] in ("title", "outro")
    hf = font(FONTS_B, 84 if big else 64)
    y = 330 if big else 190
    for ln in wrap(d, sc["heading"], hf, W - 260)[:4]:
        d.text((110, y), ln, font=hf, fill=INK); y += 100 if big else 78
    cf = font(FONTS, 46)
    y = max(y + 30, 640 if big else 400)
    d.rectangle([110, y - 18, 230, y - 12], fill=TEAL)
    for ln in wrap(d, cap, cf, W - 300)[:7]:
        d.text((110, y + 10), ln, font=cf, fill=INK if big else (40, 46, 72)); y += 66
    d.text((110, H - 90), f"{idx + 1} / {n_scenes}", font=font(FONTS, 28), fill=MUTED)
    d.text((W - 110 - 330, H - 90), "papers.qnfo.org", font=font(FONTS_B, 28), fill=MUTED)
    d.rectangle([0, H - 12, int(W * progress), H], fill=TEAL)
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug"); ap.add_argument("--out", default=str(Path.home() / "yt-out"))
    ap.add_argument("--voice", default="en-US-AriaNeural"); ap.add_argument("--max-sections", type=int, default=6)
    ap.add_argument("--series", default="QNFO in plain language")
    a_ = ap.parse_args()
    out = Path(a_.out) / a_.slug[:40]; out.mkdir(parents=True, exist_ok=True)
    ff = ffbin()

    art = fetch_article(a_.slug); (out / "article.json").write_text(json.dumps(art, indent=1), "utf8")
    scenes = build_scenes(art, a_.max_sections)
    print(f"article: {art['title']!r}, {len(scenes)} scenes")

    # TTS per caption sentence: exact timing, no alignment step
    segs, t = [], 0.0
    list_a, list_v = [], []
    for i, sc in enumerate(scenes):
        for j, cap in enumerate(sc["caps"]):
            mp3 = out / f"a_{i:02d}_{j:02d}.mp3"
            if not mp3.exists():
                asyncio.run(tts(cap, a_.voice, mp3))
            dur = duration(ff, mp3) + (0.35 if j == len(sc["caps"]) - 1 else 0.1)
            segs.append({"scene": i, "cap": cap, "mp3": mp3, "start": t, "dur": dur}); t += dur
    total = t
    for k, s in enumerate(segs):
        png = out / f"f_{k:03d}.png"
        frame(png, scenes[s["scene"]], s["cap"], s["scene"], len(scenes), (s["start"] + s["dur"]) / total, a_.series)
        list_v.append(f"file '{png.as_posix()}'\nduration {s['dur']:.3f}")
        list_a.append(f"file '{s['mp3'].as_posix()}'")
    (out / "v.txt").write_text("\n".join(list_v) + f"\nfile '{(out / f'f_{len(segs)-1:03d}.png').as_posix()}'\n", "utf8")
    (out / "a.txt").write_text("\n".join(list_a) + "\n", "utf8")

    # captions (SRT) for accessibility + YouTube upload
    def ts(x): return f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(x%1*1000):03d}"
    (out / "captions.srt").write_text("\n".join(f"{k+1}\n{ts(s['start'])} --> {ts(s['start']+s['dur'])}\n{s['cap']}\n" for k, s in enumerate(segs)), "utf8")

    mp4 = out / "video.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(out / "v.txt"),
                    "-f", "concat", "-safe", "0", "-i", str(out / "a.txt"), "-vf", "fps=24,format=yuv420p",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "160k", "-shortest",
                    "-movflags", "+faststart", str(mp4)], check=True)

    # YouTube metadata: chapters from scene starts, disclosure on, link back to the paper
    starts, seen = [], set()
    for s in segs:
        if s["scene"] not in seen:
            seen.add(s["scene"]); starts.append((s["start"], scenes[s["scene"]]["heading"] if s["scene"] else "Overview"))
    chapters = "\n".join(f"{int(a//60):02d}:{int(a%60):02d} {h[:60]}" for a, h in starts)
    desc = (f"{art['short']}\n\nRead the full plain-language article (no jargon, no mathematics): {art['url']}\n"
            f"The technical paper: {BASE}/papers/{art['slug']}\n\nChapters\n{chapters}\n\n"
            "Narration is synthetic (text-to-speech). Script is a plain-language rewrite of a QNFO paper, checked against the paper.")
    meta = {"title": art["title"][:95], "description": desc, "tags": ["QNFO", "research explained", "plain language", "science"],
            "categoryId": "27", "privacyStatus": "private", "containsSyntheticMedia": True, "madeForKids": False,
            "defaultLanguage": "en", "duration_s": round(total, 1), "source": art["url"]}
    (out / "metadata.json").write_text(json.dumps(meta, indent=1), "utf8")
    for p in out.glob("a_*.mp3"): pass
    print(f"OK {mp4} ({total:.0f}s, {mp4.stat().st_size/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
