// qnfo-pdf — cloud-native PDF renderer for QNFO scientific papers.
// Renders paper markdown (D1 living-paper) to a polished print PDF via
// Cloudflare Browser Run (headless Chromium) + MathJax SVG math.
import { renderFullHTML } from "./renderer.js";

const VERSION = "1.0.0";

function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pdfHeaders(slug) {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": 'inline; filename="' + slug + '.pdf"',
    "Cache-Control": "public, max-age=3600",
  };
}

function buildPdfOptions(shortTitle) {
  const headerTemplate =
    '<div style="font-size:8px;color:#777;width:100%;text-align:center;padding:0 1.5cm;border-bottom:0.5px solid #e0e0e0;padding-bottom:3px;white-space:nowrap;overflow:hidden;font-family:Georgia,serif;">' +
    escHtml(shortTitle) +
    "</div>";
  const footerTemplate =
    '<div style="font-size:8px;color:#777;width:100%;text-align:center;padding:0 1.5cm;font-family:Georgia,serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>';
  return {
    format: "a4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: headerTemplate,
    footerTemplate: footerTemplate,
    margin: { top: "1.7cm", bottom: "1.7cm", left: "1.9cm", right: "1.9cm" },
    preferCSSPageSize: false,
    tagged: true,
  };
}

async function renderPdf(env, html, shortTitle) {
  const pdfOptions = buildPdfOptions(shortTitle);
  const r = await env.BROWSER.quickAction("pdf", { html: html, pdfOptions: pdfOptions });
  return await toBytes(r);
}

async function toBytes(r) {
  if (r instanceof Response) {
    if (!r.ok) {
      const text = await r.text();
      throw new Error("Browser Run error (" + r.status + "): " + text.slice(0, 300));
    }
    return await r.arrayBuffer();
  }
  if (r instanceof ArrayBuffer) return r;
  if (r && r.pdf instanceof ArrayBuffer) return r.pdf;
  if (r && r.pdf) return r.pdf;
  if (r && r.buffer instanceof ArrayBuffer) return r.buffer;
  throw new Error("Unexpected Browser Run response type");
}

async function stash(env, slug, bytes) {
  try {
    if (!env.RELEASES) return null;
    const r2Key = "pdf/" + slug + ".pdf";
    await env.RELEASES.put(r2Key, bytes, { httpMetadata: { contentType: "application/pdf" } });
    return r2Key;
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/health") {
      return Response.json({
        ok: true,
        worker: "qnfo-pdf",
        version: VERSION,
        browser: !!env.BROWSER,
        living: !!env.LIVING,
        releases: !!env.RELEASES,
      });
    }

    if (path === "/" || path === "/index.html") {
      return new Response(
        "<html><body style='font-family:Georgia,serif;padding:2rem'><h1>qnfo-pdf</h1><p>Cloud-native PDF renderer for QNFO papers.</p><ul><li><code>GET /pdf/:slug</code> — render paper PDF</li><li><code>GET /html/:slug</code> — render paper HTML</li><li><code>POST /pdf</code> — render PDF from <code>body_md</code></li><li><code>POST /html</code> — render HTML from <code>body_md</code></li></ul><p>v" + VERSION + "</p></body></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // GET /pdf/:slug  and  GET /html/:slug
    const m = path.match(/^\/(pdf|html)\/([^/]+)$/);
    if (m) {
      const format = m[1];
      const slug = decodeURIComponent(m[2]);
      if (!env.LIVING) return Response.json({ ok: false, error: "LIVING binding missing" }, { status: 500 });
      try {
        const paper = await env.LIVING.prepare("SELECT slug, title, body_md FROM papers WHERE slug = ?").bind(slug).first();
        if (!paper || !paper.body_md) return new Response("Paper not found or has no body_md", { status: 404 });
        return await respond(env, format, slug, paper.title, paper.body_md);
      } catch (e) {
        return Response.json({ ok: false, error: String(e && e.message || e) }, { status: 500 });
      }
    }

    // POST /pdf  and  POST /html  (body_md in request body)
    if (path === "/pdf" || path === "/html") {
      const format = path.slice(1);
      try {
        const bodyText = await request.text();
        let md = bodyText, title = "paper", slug = "paper";
        try {
          const j = JSON.parse(bodyText);
          if (j && j.body_md) md = j.body_md;
          if (j && j.title) title = j.title;
          if (j && j.slug) slug = j.slug;
        } catch (_) { /* not JSON, treat whole body as markdown */ }
        return await respond(env, format, slug, title, md);
      } catch (e) {
        return Response.json({ ok: false, error: String(e && e.message || e) }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};

async function respond(env, format, slug, title, md) {
  const html = renderFullHTML(md, { title: title });
  if (format === "html") {
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const shortTitle = String(title || slug || "").slice(0, 90);
  const bytes = await renderPdf(env, html, shortTitle);
  const r2Key = await stash(env, slug, bytes);
  if (r2Key && env.LIVING) {
    try {
      await env.LIVING.prepare("UPDATE papers SET pdf_path = ? WHERE slug = ?").bind(r2Key, slug).run();
    } catch (_) { /* non-fatal */ }
  }
  return new Response(bytes, { headers: pdfHeaders(slug) });
}
