// personal-watch: watch.q08.org now only redirects. The player moved to its own public repo and GitHub Pages
// (owner 2026-11-13: not Cloudflare, not under q08): https://github.com/rwnq8/tv, served at https://rwnq8.github.io/tv/
var VERSION = "1.2.0";
var TARGET = "https://rwnq8.github.io/tv/";
export default {
  async fetch(req) {
    var u = new URL(req.url);
    if (u.pathname === "/health") return Response.json({ worker: "personal-watch", version: VERSION, redirect: TARGET });
    return Response.redirect(TARGET, 302);
  }
};
