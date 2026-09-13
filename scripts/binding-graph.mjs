#!/usr/bin/env node
// scripts/binding-graph.mjs — QNFO fleet service-binding DEPENDENCY GRAPH tool.
//
// WHY: the fleet is a service-binding dependency graph, not a flat worker list.
// Retiring/merging a worker FAILS with Cloudflare error 10142 unless every inbound
// [[services]] binding is unwound first. This tool makes that graph visible and automates
// the unwind (as done manually for qnfo-research-supervisor).
//
// USAGE:
//   node scripts/binding-graph.mjs [root]                 # print full binding graph + dead bindings
//   node scripts/binding-graph.mjs [root] --target NAME   # list inbound bindings to NAME
//   node scripts/binding-graph.mjs [root] --unwind NAME   # REMOVE inbound bindings to NAME + print redeploys
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const root = (argv[0] && !argv[0].startsWith('--')) ? argv[0] : process.cwd();
const opIdx = argv.findIndex(a => a.startsWith('--'));
const op = opIdx >= 0 ? argv[opIdx] : '--graph';
const name = opIdx >= 0 ? argv[opIdx + 1] : undefined;

function readServices(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.binding && cur.service) out.push(cur); cur = null; };
  for (const line of lines) {
    if (/^\s*\[\[services\]\]/.test(line)) { flush(); cur = { binding: null, service: null }; continue; }
    if (/^\s*\[/.test(line)) { flush(); continue; }
    if (cur) {
      const b = line.match(/binding\s*=\s*"([^"]+)"/); if (b) cur.binding = b[1];
      const s = line.match(/service\s*=\s*"([^"]+)"/); if (s) cur.service = s[1];
    }
  }
  flush();
  return out;
}

function removeServiceBlocks(file, target) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\[\[services\]\]/.test(lines[i])) {
      let j = i + 1; let svc = null;
      while (j < lines.length && !/^\s*\[/.test(lines[j])) { const s = lines[j].match(/service\s*=\s*"([^"]+)"/); if (s) svc = s[1]; j++; }
      if (svc === target) { i = j; continue; }
    }
    out.push(lines[i]); i++;
  }
  fs.writeFileSync(file, out.join('\n').replace(/\n{3,}/g, '\n\n'));
  return true;
}

const dirs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const graph = {}; const inbound = {};
for (const d of dirs) {
  const f = path.join(root, d, 'wrangler.toml');
  if (!fs.existsSync(f)) continue;
  const svcs = readServices(f);
  if (!svcs.length) continue;
  graph[d] = svcs;
  for (const s of svcs) (inbound[s.service] = inbound[s.service] || []).push({ from: d, binding: s.binding });
}

if (op === '--target' || op === '--unwind') {
  const refs = inbound[name] || [];
  console.log('inbound bindings to ' + name + ': ' + refs.length);
  for (const r of refs) console.log('  ' + r.from + '  ->  ' + r.binding);
  if (op === '--unwind' && refs.length) {
    for (const r of refs) {
      removeServiceBlocks(path.join(root, r.from, 'wrangler.toml'), name);
      console.log('UNWOUND ' + r.binding + ' from ' + r.from + '/wrangler.toml  -> redeploy: (cd ' + r.from + ' && wrangler deploy)');
    }
  }
} else {
  const edges = Object.values(graph).reduce((n, a) => n + a.length, 0);
  console.log('service-binding graph: ' + Object.keys(graph).length + ' referrers, ' + edges + ' edges');
  for (const [d, svcs] of Object.entries(graph)) console.log('  ' + d + ' -> ' + svcs.map(s => s.service).join(', '));
  const present = new Set(dirs);
  const dead = Object.entries(inbound).filter(([svc]) => !present.has(svc));
  console.log('\nINBOUND BINDINGS TO NON-PRESENT (dead) WORKERS: ' + dead.length);
  for (const [svc, refs] of dead) console.log('  ' + svc + ' <- ' + refs.map(r => r.from + '(' + r.binding + ')').join(', '));
}
