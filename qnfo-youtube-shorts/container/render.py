"""YT-SERVER-1 render core, shared by server.py (Cloudflare Container) and the GitHub-runner fallback.

render(job, outdir) -> dict(path, duration_s). job = {"title", "beats": [{"kind", ..., "sentences": [{"text", "audio_b64"}]}]}.
Word times are not returned by Workers AI TTS, so each sentence's measured length is split over its words by character count
(sentence-level timing is exact, word-level is proportional).
"""
import base64, json, os, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CR, NL = chr(13), chr(10)
FONT = os.environ.get("SHORT_FONT", "DejaVu Sans")


def probe(path):
    if not shutil.which("ffprobe"):      # runner or dev machine with ffmpeg only: read "Duration: hh:mm:ss.xx" from ffmpeg -i
        err = subprocess.run(["ffmpeg", "-i", str(path)], capture_output=True, text=True).stderr
        m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def ass_time(x):
    return f"{int(x//3600)}:{int(x%3600//60):02d}:{x%60:05.2f}"


def build_ass(words, path):
    hdr = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
           "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
           f"Style: C,{FONT},84,&H00FFFFFF,&H00FFFFFF,&H00301510,&H00000000,1,0,0,0,100,100,0,0,1,7,2,2,60,60,330,1\n\n"
           "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n")
    chunks, cur = [], []
    for wd in words:
        cur.append(wd)
        if len(cur) == 3 or wd[0][-1:] in ".?!":
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    ev = []
    for ci, chunk in enumerate(chunks):
        for i, (w, s, d) in enumerate(chunk):
            nxt = chunk[i + 1][1] if i + 1 < len(chunk) else min(s + d + 0.15, chunks[ci + 1][0][1] if ci + 1 < len(chunks) else 1e9)
            txt = " ".join((r"{\c&H06B7FF&\fscx118\fscy118}" + x + r"{\r}") if j == i else x for j, (x, _, _) in enumerate(chunk))
            ev.append(f"Dialogue: 0,{ass_time(s)},{ass_time(nxt)},C,,0,0,0,,{txt}")
    Path(path).write_text(hdr + "\n".join(ev) + "\n", encoding="utf8")


def split_words(text, start, dur):
    ws = text.split()
    if not ws:
        return []
    total = sum(len(w) + 1 for w in ws)
    out, t = [], start
    for w in ws:
        d = dur * (len(w) + 1) / total
        out.append((w, t, d))
        t += d
    return out


def render(job, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    beats = job["beats"]
    t, allw, lst = 0.0, [], []
    for i, b in enumerate(beats):
        parts, bt = [], 0.0
        for j, s in enumerate(b["sentences"]):
            f = out / f"b{i}s{j}.mp3"
            f.write_bytes(base64.b64decode(s["audio_b64"]))
            d = probe(f)
            allw += split_words(s["text"], t + bt, d)
            bt += d
            parts.append(f)
        dur = round(bt + 0.45, 2)
        b["dur"] = dur
        (out / f"b{i}.txt").write_text("".join(f"file '{p.as_posix()}'\n" for p in parts))
        wav = out / f"b{i}.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(out / f"b{i}.txt"), "-af", "apad", "-t", str(dur), "-ar", "24000", "-ac", "1", str(wav)], check=True)
        lst.append(f"file '{wav.as_posix()}'")
        t += dur
    (out / "a.txt").write_text("\n".join(lst) + "\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(out / "a.txt"), str(out / "audio.wav")], check=True)
    build_ass(allw, out / "cap.ass")
    spec = {"beats": [{k: v for k, v in b.items() if k != "sentences"} for b in beats]}
    (out / "spec.json").write_text(json.dumps(spec), "utf8")
    env = dict(os.environ, SHORT_SPEC=str(out / "spec.json"), SHORT_FONT=FONT)
    m = subprocess.run([sys.executable, "-m", "manim", "render", "-qm", "--fps", "30", "-r", "1080,1920", "--media_dir", str(out / "media"),
                        "-o", "diagram", str(HERE / "short_scene.py"), "ShortScene"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if m.returncode != 0:      # YT-RENDER-ERR-1: the caller sees why, not only the exit status
        lines = [ln for ln in m.stderr.replace(CR, NL).split(NL) if ln.strip() and "it/s]" not in ln]
        raise RuntimeError("manim exit %s: %s" % (m.returncode, " | ".join(lines)[-900:]))
    silent = next((out / "media").rglob("diagram.mp4"))
    final = out / "short.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(out / "audio.wav"), "-vf", "subtitles=cap.ass", "-c:v", "libx264",
                    "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(final)],
                   check=True, cwd=out)
    return {"path": str(final), "duration_s": round(t, 1), "bytes": final.stat().st_size}


if __name__ == "__main__":      # runner fallback: python render.py job.json outdir
    r = render(json.load(open(sys.argv[1], encoding="utf8")), sys.argv[2])
    print(json.dumps(r))
