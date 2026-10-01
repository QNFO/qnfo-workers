#!/usr/bin/env python3
"""deploy-drift-guard-selftest.py - MODULE-SCOPE-DEPTH-1 acceptance gate (offline).

_repo_version() must return the VERSION a worker serves from /health: the declaration at MODULE scope. The scanner behind it has
to survive the constructs that break a naive brace counter: braces inside strings, comments, regex literals and template
literals, and the division-vs-regex ambiguity. Exit 0 = every case passed.
"""
import importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location("g", os.path.join(HERE, "deploy-drift-guard.py"))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

fails = []
def check(label, got, want):
    ok = got == want
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else "  -- got %r want %r" % (got, want)))
    if not ok:
        fails.append(label)

V = g._repo_version

check("plain module-scope", V('var VERSION = "1.0.0";\nexport default {};'), "1.0.0")

# radar-hub shape: hub's own at depth 0 FIRST; embedded IIFEs (col 0, un-indented) declare their own, the LAST being higher.
radar = '''import { X } from "cloudflare:workers";
var VERSION = "1.0.9";
var eventsMod = (function(){
var __n = 1;
var VERSION = "1.0.8";
function f() { return 1; }
return { f };
})();
var other = (function(){
var VERSION = "1.2.4";
})();
export default { async fetch() { return new Response(VERSION); } };
'''
check("radar-hub shape: depth 0 beats the last embedded IIFE (was 1.2.4)", V(radar), "1.0.9")

# fleet-exec shape: embedded module FIRST (col 0, inside an IIFE), module-scope SECOND.
fexec = '''const execMod = (() => {
const VERSION = "fleet-executor/0.3.2";
return { VERSION };
})();
const VERSION = "1.0.2";
'''
check("fleet-exec shape: module scope wins, not the embedded first", V(fexec), "1.0.2")

# personal-companion shape: folded module at the END, indented.
check("folded indented module at the end is ignored", V('var VERSION = "1.7.2";\nfunction vault() {\n  var VERSION = "0.1.21-folded";\n}\n'), "1.7.2")

# braces that must NOT change depth
check("braces inside strings", V('var s = "{{{";\nvar t = \'}}}\';\nvar VERSION = "2.0.0";'), "2.0.0")
check("braces inside line + block comments", V('// { { {\n/* } } } */\nvar VERSION = "2.1.0";'), "2.1.0")
check("braces + quotes inside a regex literal", V('var re = /[{"\'`]+\\/{/g;\nvar VERSION = "2.2.0";'), "2.2.0")
check("regex after return / typeof / paren", V('function f(){ return /{/.test("x"); }\nif (/}/.test(y)) { }\nvar VERSION = "2.3.0";'), "2.3.0")
check("division is not a regex", V('var a = 10 / 2 / 5;\nvar o = { k: a / 2 };\nvar VERSION = "2.4.0";'), "2.4.0")
check("template literal with ${ {obj} } and nested template", V('var t = `x ${ ({a:1}).a } y ${ `n ${ {b:2}.b }` } {{`;\nvar VERSION = "2.5.0";'), "2.5.0")
check("escaped quote / backtick in strings and templates", V('var a = "q\\"{";\nvar b = `\\`{`;\nvar VERSION = "2.6.0";'), "2.6.0")
check("VERSION text inside a regex literal is not a declaration", V('var re = /^var VERSION = "(\\d+)\\.(\\d+)";$/m;\nvar VERSION = "0.4.54";'), "0.4.54")
check("VERSION inside a function only (no module scope): falls back, never crashes", V('function f(){\n  var VERSION = "9.9.9";\n}\n'), "9.9.9")
check("QNFO_VERSION is not preferred over a plain module VERSION", V('const QNFO_VERSION = "fabric-1";\nconst VERSION = "3.0.0";'), "3.0.0")
check("no declaration at all", V('export default {};'), None)
check("class + arrow + object bodies", V('class A { m() { return () => { return {a:1}; }; } }\nvar VERSION = "4.0.0";'), "4.0.0")

# the real artifacts this was written for
def real(path):
    with open(os.path.join(ROOT, path), encoding="utf-8", errors="replace") as fh:
        return V(fh.read())
import re
# Real files are checked for shape, not a pinned number: a routine version bump must never fail this offline
# test (a hardcoded version broke deploy-drift when personal-companion went 1.7.2 to 1.7.3).
for path in ["radar-hub/worker.js", "fleet-exec/worker.js", "personal-companion/worker.js"]:
    if os.path.exists(os.path.join(ROOT, path)):
        got = real(path)
        check("real file " + path + " yields a semver-shaped VERSION", bool(got and re.match(r"^\d+\.\d+\.\d+", got)), True)

print("\n%d failure(s)" % len(fails))
sys.exit(1 if fails else 0)
