import re, sys
def convert(md, header):
    out = list(header)
    lines = md.split("\n")
    i = 0
    while i < len(lines):
        l = lines[i]
        if l.strip() == "---":
            i += 1
            if i < len(lines) and lines[i].strip() == "":
                i += 1
            continue
        if l.startswith("```"):
            l = "`" + l[3:]
        else:
            heading = l.startswith("#")
            l = re.sub(r"^#+ ", "", l)
            if not heading:
                l = re.sub(r"^\s*\d+\. ", "", l)
            l = re.sub(r"^> ?", "", l)
            l = re.sub(r"^- ", "", l)
            l = l.replace("**", "")
            l = re.sub(r"^\*(.+?)\*(\s*)$", r"\1\2", l)
            l = re.sub(r"`([^`]*)`", r"\1", l)
        out.append(l)
        i += 1
    return "\n".join(out)
if __name__ == "__main__":
    md = open(sys.argv[1], encoding="utf-8").read()
    header = sys.argv[2].split("\\n")
    sys.stdout.write(convert(md, header))
