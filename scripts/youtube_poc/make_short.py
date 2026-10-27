#!/usr/bin/env python3
"""YT-POC-2: director spec -> vertical 1080x1920 short with animated diagrams (Manim) + word-timed karaoke captions.

  python -I make_short.py directors/<name>.json [--out DIR] [--voice en-US-AndrewNeural]
Stages: edge-tts per beat with WordBoundary -> beat durations -> Manim render (short_scene.py) -> ASS karaoke ->
ffmpeg mux -> metadata.json (Shorts). Deps: pip install manim edge-tts imageio-ffmpeg
"""
import argparse, asyncio, json, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from make_video import fetch_article, ffbin, duration, BASE  # noqa: E402


async def tts_words(text, voice, mp3):
    import edge_tts
    words, com = [], edge_tts.Communicate(text, voice, rate="-2%", boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append((ch["text"], ch["offset"] / 1e7, ch["duration"] / 1e7))
    return words


def ass_time(x):
    return f"{int(x//3600)}:{int(x%3600//60):02d}:{x%60:05.2f}"


def build_ass(words, path):
    """3-word chunks; the spoken word is amber and larger."""
    hdr = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
           "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
           "Style: C,Segoe UI,92,&H00FFFFFF,&H00FFFFFF,&H00301510,&H00000000,1,0,0,0,100,100,0,0,1,7,2,2,60,60,330,1\n\n"
           "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n")
    ev = []
    chunks, cur = [], []
    for wd in words:                      # up to 3 words, never across a sentence end
        cur.append(wd)
        if len(cur) == 3 or wd[0][-1:] in ".?!":
            chunks.append(cur); cur = []
    if cur: chunks.append(cur)
    for ci, chunk in enumerate(chunks):
        for i, (w, s, d) in enumerate(chunk):
            end = chunk[i + 1][1] if i + 1 < len(chunk) else min(s + d + 0.15, chunks[ci + 1][0][1] if ci + 1 < len(chunks) else 1e9)
            txt = " ".join((r"{\c&H06B7FF&\fscx118\fscy118}" + x + r"{\r}") if j == i else x for j, (x, _, _) in enumerate(chunk))
            ev.append(f"Dialogue: 0,{ass_time(s)},{ass_time(end)},C,,0,0,0,,{txt}")
    Path(path).write_text(hdr + "\n".join(ev) + "\n", encoding="utf8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("director"); ap.add_argument("--out", default=str(Path.home() / "yt-out"))
    ap.add_argument("--voice", default="en-US-AndrewNeural"); ap.add_argument("--quality", default="h")
    a = ap.parse_args()
    spec = json.loads(Path(a.director).read_text("utf8"))
    out = Path(a.out) / ("short-" + Path(a.director).stem); out.mkdir(parents=True, exist_ok=True)
    ff = ffbin()
    art = fetch_article(spec["slug"])

    t, allw, lst = 0.0, [], []
    for i, b in enumerate(spec["beats"]):
        mp3 = out / f"b{i}.mp3"
        w = asyncio.run(tts_words(b["narr"], a.voice, mp3))
        d = duration(ff, mp3)
        b["dur"] = round(d + 0.45, 2)
        allw += [(x, s + t, dd) for x, s, dd in w]
        wav = out / f"b{i}.wav"   # pad each beat to its scene length so audio and picture stay locked
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(mp3), "-af", "apad", "-t", str(b["dur"]), "-ar", "24000", "-ac", "1", str(wav)], check=True)
        lst.append(f"file '{wav.as_posix()}'"); t += b["dur"]
    (out / "a.txt").write_text("\n".join(lst) + "\n"); total = t
    subprocess.run([ff, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(out / "a.txt"), str(out / "audio.wav")], check=True)
    build_ass(allw, out / "cap.ass")
    (out / "spec.json").write_text(json.dumps(spec), "utf8")
    print(f"{len(spec['beats'])} beats, {total:.1f}s; rendering Manim...")

    env = dict(os.environ, SHORT_SPEC=str(out / "spec.json"), PATH=os.path.dirname(ff) + os.pathsep + os.environ["PATH"])
    subprocess.run([sys.executable, "-m", "manim", "render", f"-q{a.quality}", "--fps", "30", "-r", "1080,1920", "--media_dir", str(out / "media"),
                    "-o", "diagram", str(HERE / "short_scene.py"), "ShortScene"], check=True, env=env, stdout=subprocess.DEVNULL)
    silent = next((out / "media").rglob("diagram.mp4"))
    final = out / "short.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(silent), "-i", str(out / "audio.wav"), "-vf", "subtitles=cap.ass", "-c:v", "libx264",
                    "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(final)],
                   check=True, cwd=out)

    title = spec["title"][:80]
    meta = {"title": f"{title} #Shorts"[:100],
            "description": f"{art['short']}\n\nFull plain-language article (no jargon, no mathematics): {art['url']}\nPaper: {BASE}/papers/{art['slug']}\n\n"
                           "AI disclosure: the voice is synthetic (text-to-speech) and the animations are generated from the plain-language version of a QNFO paper.\n#Shorts #science #research",
            "tags": ["Shorts", "science", "research explained", "QNFO"], "categoryId": "27", "privacyStatus": "private",
            "containsSyntheticMedia": True, "madeForKids": False, "duration_s": round(total, 1), "source": art["url"]}
    (out / "metadata.json").write_text(json.dumps(meta, indent=1), "utf8")
    print(f"OK {final} ({total:.0f}s, {final.stat().st_size/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
