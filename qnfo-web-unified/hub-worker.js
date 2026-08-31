export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.replace(/^www\./, '');
    const resp = await env.ASSETS.fetch(request);
    const text = await resp.text();
    const conf = {
      'design.qnfo.org': { title: 'QNFO \u2014 Design Language', tag: 'Design' },
      'quantum.qnfo.org': { title: 'QNFO \u2014 Quantum Research', tag: 'Quantum research' },
      'measure.qnfo.org': { title: 'QNFO \u2014 Measurement', tag: 'Measurement' },
      'hensel.qnfo.org': { title: 'QNFO \u2014 Hensel', tag: 'Hensel' },
      'unity.qnfo.org': { title: 'QNFO \u2014 Unity', tag: 'Unity' },
      'q08.org': { title: 'QNFO', tag: 'Research foundation' },
      'hub.qnfo.org': { title: 'QNFO \u2014 Hub', tag: 'Research hub' },
      'qnfo-hub.pages.dev': { title: 'QNFO \u2014 Hub', tag: 'Research hub' }
    };
    const c = conf[host] || { title: 'QNFO', tag: 'Research foundation' };
    const out = text.split('{TITLE}').join(c.title).split('{TAG}').join(c.tag);
    return new Response(out, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  }
};
