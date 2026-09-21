# -*- coding: utf-8 -*-
"""Static server for the Score Keeper, with the Hub's cache policy.

`python -m http.server` sends no Cache-Control at all, so browsers fall back to
*heuristic* caching -- roughly 10% of the file's age -- and an index.html last
touched weeks ago can sit in a phone's browser for days. The same policy the Hub
uses is applied here:

  *.html          no-cache, must-revalidate   (always check for a new version)
  versioned asset immutable, 1 year           (?v=<hash> in the URL)
  /healthz        no-store
  other assets    5 minutes

index.html asks for its assets as `style.css?v=` and `app.js?v=`, and this server
fills in each hash from the file's actual bytes as the HTML goes out. Editing an
asset therefore changes its URL and the new one is fetched at once -- no cache
purge here or at Cloudflare, and no hash to remember to update by hand.

Run:  python server.py [port]        (default 8101)
"""
from __future__ import annotations

import hashlib
import io
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8101

# Only these are served. The repo holds a README and a git history that no
# visitor needs, so the server answers for an explicit list instead of the
# whole folder.
PUBLIC = {
    "/": "index.html",
    "/index.html": "index.html",
    "/style.css": "style.css",
    "/app.js": "app.js",
    "/favicon.ico": None,
}

TYPES = {".html": "text/html; charset=utf-8",
         ".css": "text/css; charset=utf-8",
         ".js": "text/javascript; charset=utf-8"}

ASSET_REF = re.compile(r'((?:src|href)=")([A-Za-z0-9_.\-/]+\.(?:js|css))\?v=[^"]*(")')


def content_hash(name):
    """Eight hex characters of the file's md5, or None if it is not there."""
    full = os.path.join(ROOT, name)
    if not os.path.isfile(full):
        return None
    digest = hashlib.md5()
    with open(full, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()[:8]


def stamp(html):
    """Rewrite every `asset?v=...` so the hash matches what is on disk right now."""
    def one(match):
        digest = content_hash(match.group(2))
        return match.group(1) + match.group(2) + ("?v=" + digest if digest else "") + match.group(3)
    return ASSET_REF.sub(one, html)


class Handler(SimpleHTTPRequestHandler):
    server_version = "ScoreKeeper/1.0"

    def do_GET(self):
        self.respond(body=True)

    def do_HEAD(self):
        self.respond(body=False)

    def respond(self, body):
        path = self.path.split("?", 1)[0].split("#", 1)[0]

        if path == "/healthz":
            payload = b'{"ok":true,"service":"score-keeper"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if body:
                self.wfile.write(payload)
            return

        if path not in PUBLIC:
            self.send_error(404, "Not found")
            return

        name = PUBLIC[path]
        if name is None:                       # /favicon.ico -- nothing to send
            self.send_response(204)
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            return

        full = os.path.join(ROOT, name)
        if not os.path.isfile(full):
            self.send_error(404, "Not found")
            return

        with open(full, "rb") as fh:
            data = fh.read()

        ext = os.path.splitext(name)[1]
        if ext == ".html":
            data = stamp(data.decode("utf-8")).encode("utf-8")
            cache = "no-cache, must-revalidate"
        elif "v=" in self.path:
            cache = "public, max-age=31536000, immutable"
        else:
            cache = "public, max-age=300"

        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.end_headers()
        if body:
            self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))


class ScoreKeeperServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    srv = ScoreKeeperServer(("0.0.0.0", PORT), Handler)
    sys.stderr.write("Score Keeper on http://127.0.0.1:%d\n" % PORT)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()
