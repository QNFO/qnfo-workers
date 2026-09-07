// jnl-zenodo v0.1.1 — publishes AI referee reports as linked Zenodo review records
// and creates new-version revision drafts for self-owned (QNFO) papers.
// Deployed: https://jnl-zenodo.q08.workers.dev
// Stack: KV jnl-state (0cf89b469bcb47058e343611d9117897), service binding REFEREE -> jnl-referee
// Secrets: ZENODO_TOKEN (Zenodo PAT), JNL_OPS_TOKEN (x-ops-token header)
// Auth: POST endpoints require x-ops-token; read endpoints public.
const REFEREE = null; // via service binding env.REFEREE
const ZENODO_API = "https://zenodo.org/api";
const OWNER_QNFO = 1328013;
const UA = "jnl-zenodo/0.1 (QNFO AI-Reviewed Journal overlay; contact qnfo.org)";

function json(data, status = 200) { return new Response(JSON.stringify(data, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } }); }
async function zfetch(url, opts = {}, token) {
  const res = await fetch(url, { ...opts, headers: { "user-agent": UA, accept: "application/json", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) }, signal: AbortSignal.timeout(90000) });
  const txt = await res.text();
  let body = null; try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = { raw: txt.slice(0, 200) }; }
  return { status: res.status, body };
}
function stripHtml(s) { return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/health") {
        return json({ ok: true, service: "jnl-zenodo", version: "0.1.1", zenodo_token_set: !!env.ZENODO_TOKEN });
      }
      if (request.method !== "POST") return json({ ok: false, error: "method not allowed; POST only" }, 405);
      if (request.headers.get("x-ops-token") !== env.JNL_OPS_TOKEN) return json({ ok: false, error: "unauthorized" }, 401);
      const body = await request.json().catch(() => ({}));

      if (path === "/publish-review") {
        const recid = Number(body.recid);
        if (!recid) return json({ ok: false, error: "recid required" }, 400);
        const kvKey = `zenodo:review:${recid}`;
        const existing = await env.STATE.get(kvKey);
        if (existing) return json({ ok: true, already_published: JSON.parse(existing) });

        // 1. referee report via service binding
        const rr = await (async () => { const res = await env.REFEREE.fetch(`https://jnl-referee/reviews?recid=${recid}`, { headers: { "user-agent": UA, accept: "application/json" } }); const txt = await res.text(); let b = null; try { b = txt ? JSON.parse(txt) : null; } catch (e) {} return { status: res.status, body: b }; })();
        if (rr.status !== 200 || !rr.body?.rows?.length) return json({ ok: false, error: `referee report not found (${rr.status})` }, 404);
        const review = rr.body.rows[0];
        // 2. paper metadata
        const pr = await zfetch(`${ZENODO_API}/records/${recid}`);
        if (pr.status !== 200) return json({ ok: false, error: `zenodo record fetch failed (${pr.status})` }, 404);
        const paper = pr.body;
        const title = paper.metadata?.title || `Zenodo record ${recid}`;
        const paperDoi = paper.doi || paper.metadata?.doi;

        // 3. create deposit draft
        const dr = await zfetch(`${ZENODO_API}/deposit/depositions`, { method: "POST", body: "{}" }, env.ZENODO_TOKEN);
        if (dr.status !== 201) return json({ ok: false, error: `draft create failed (${dr.status})`, detail: dr.body }, 502);
        const draft = dr.body;
        const draftId = draft.id;
        const bucket = draft.links?.bucket;

        // 4. metadata
        const desc = `AI-generated referee report for "${stripHtml(title)}" (Zenodo ${paperDoi}). Produced automatically by the QNFO AI-Reviewed Journal overlay on the Zenodo 'aiscience' community. Advisory machine review; not endorsement. Full report in file. Models: ${review.model || "workers-ai"}. Decision: ${review.decision || "n/a"} (avg ${review.avg_score ?? "n/a"}/10).`;
        const meta = {
          metadata: {
            title: `AI Referee Report — ${stripHtml(title).slice(0, 240)}`,
            upload_type: "publication",
            publication_type: "report",
            description: desc,
            creators: [{ name: "QNFO AI Referee", affiliation: "QNFO" }],
            access_right: "open",
            license: "cc-by-4.0",
            communities: [{ identifier: "aiscience" }],
            related_identifiers: paperDoi ? [{ identifier: paperDoi, relation: "reviews", scheme: "doi" }] : []
          }
        };
        const mr = await zfetch(`${ZENODO_API}/deposit/depositions/${draftId}`, { method: "PUT", body: JSON.stringify(meta) }, env.ZENODO_TOKEN);
        if (mr.status !== 200) return json({ ok: false, error: `metadata update failed (${mr.status})`, detail: mr.body }, 502);

        // 5. upload report file (application/octet-stream; text/markdown is rejected 415)
        const fname = `ai-referee-report-${recid}.md`;
        let ur = { status: 0 };
        try {
          const fres = await fetch(`${bucket}/${encodeURIComponent(fname)}`, { method: "PUT", headers: { authorization: `Bearer ${env.ZENODO_TOKEN}`, "content-type": "application/octet-stream", "user-agent": UA }, body: review.report_md || desc, signal: AbortSignal.timeout(90000) });
          ur = { status: fres.status };
        } catch (e) { ur = { status: 0, error: String(e.message) }; }
        if (ur.status < 200 || ur.status >= 300) return json({ ok: false, error: `file upload failed (${ur.status})`, detail: ur }, 502);

        // 6. publish
        const pub = await zfetch(`${ZENODO_API}/deposit/depositions/${draftId}/actions/publish`, { method: "POST", body: "{}" }, env.ZENODO_TOKEN);
        if (pub.status < 200 || pub.status >= 300) return json({ ok: false, error: `publish failed (${pub.status})`, detail: pub.body }, 502);
        const rec = pub.body;
        const out = { zenodo_recid: rec.id, conceptrecid: rec.conceptrecid, doi: rec.doi || rec.metadata?.doi, decision: review.decision, avg_score: review.avg_score, paper_recid: recid, paper_doi: paperDoi, published_at: new Date().toISOString() };
        await env.STATE.put(kvKey, JSON.stringify(out));
        return json({ ok: true, published: out });
      }

      if (path === "/revise-draft") {
        const recid = Number(body.recid);
        if (!recid) return json({ ok: false, error: "recid required" }, 400);
        const pr = await zfetch(`${ZENODO_API}/records/${recid}`);
        if (pr.status !== 200) return json({ ok: false, error: `zenodo record fetch failed (${pr.status})` }, 404);
        const paper = pr.body;
        const owners = (paper.owners || []).map((o) => Number(typeof o === "object" ? o.id : o)); if (!owners.length && paper.owner != null) owners.push(Number(paper.owner));
        if (!owners.includes(OWNER_QNFO)) return json({ ok: false, error: "not self-published (owner not QNFO); revisions only for own records", owner: owners }, 403);
        const concept = paper.conceptrecid;
        if (!concept) return json({ ok: false, error: "no conceptrecid" }, 400);

        // new version draft via LEGACY endpoint (the /records/{concept}/versions route 404s on Zenodo)
        const vr = await zfetch(`${ZENODO_API}/deposit/depositions/${recid}/actions/newversion`, { method: "POST", body: "{}" }, env.ZENODO_TOKEN);
        if (vr.status < 200 || vr.status >= 300) return json({ ok: false, error: `new version failed (${vr.status})`, detail: vr.body }, 502);
        const draft = vr.body;
        const draftId = draft.id;
        const bucket = draft.links?.bucket;
        const mdFile = (paper.files || []).find((f) => /\.(md|txt|markdown)$/i.test(f.key));
        let copied = [];
        if (mdFile) {
          const fr = await fetch(mdFile.links.self, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
          if (fr.ok) {
            const content = await fr.text();
            await fetch(`${bucket}/${encodeURIComponent(mdFile.key)}`, { method: "PUT", headers: { authorization: `Bearer ${env.ZENODO_TOKEN}`, "content-type": "application/octet-stream", "user-agent": UA }, body: content, signal: AbortSignal.timeout(90000) });
            copied.push(mdFile.key);
          }
        }
        const out = { draft_id: draftId, conceptrecid: concept, source_recid: recid, copied_files: copied, status: "draft-not-published" };
        await env.STATE.put(`zenodo:draft:${recid}`, JSON.stringify(out));
        return json({ ok: true, draft: out });
      }

      return json({ ok: false, error: `unknown path ${path}` }, 404);
    } catch (err) {
      return json({ ok: false, error: String(err && err.stack || err.message || err) }, 500);
    }
  }
};
