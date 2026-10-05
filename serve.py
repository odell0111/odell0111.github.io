#!/usr/bin/env python3
"""Preview the site on http://localhost:8042

Not a deployment target -- the site is static files and any host will do. It
exists because a page opened straight off the disk is given an opaque origin,
and Chrome refuses the network calls that matter here. figures.js cannot reach
the GitHub and PyPI APIs, so the live counts stay on their fallback figures and
never update; stats.js cannot post, so nothing is recorded. Served over HTTP
both work, and the preview matches what a visitor actually gets.

    python serve.py

No caching, so an edit plus a reload shows the edit.
"""

import functools
import http.server
import socketserver
import sys
import webbrowser
from pathlib import Path

PORT = 8042
ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
  # HTTP/1.1 rather than the handler's default 1.0. The page pulls in eight
  # stylesheets and six scripts before it finishes loading, and a 1.0 server
  # closes the connection after each one, so every file pays for its own TCP
  # handshake. Nothing here is slow enough for that to be visible, but a
  # preview that behaves like the real host is worth one line.
  protocol_version = "HTTP/1.1"

  def end_headers(self):
    # An edit plus a reload should show the edit.
    self.send_header("Cache-Control", "no-store")
    # No Accept-Ranges header here, and that is deliberate rather than an
    # omission. SimpleHTTPRequestHandler ignores a Range request and answers
    # 200 with the whole file, so advertising byte ranges would promise
    # something this server does not do. The only media in the repo are two
    # sound clips of 26 KB and 98 KB; there is nothing in either worth
    # seeking to.
    super().end_headers()

  def log_message(self, fmt, *args):
    # One line per asset, and the page has eighteen of them, which buries the
    # one line worth reading. 200s and 304s are expected and stay quiet;
    # everything else is printed. A 206 would be one of those - nothing here
    # advertises byte ranges, so a partial response would mean something
    # unexpected is asking for one.
    if args and str(args[1]) not in ("200", "304"):
      sys.stderr.write("  %s %s\n" % (args[1], args[0].split()[1]))

  def guess_type(self, path):
    # Nothing here uses either format yet - the images are PNG and SVG, and
    # the fonts come from Google Fonts rather than the repo. Kept because
    # Python 3.11 still does not know either type, and the failure is quiet:
    # the browser is handed octet-stream and downloads the file instead of
    # drawing it, which reads as a broken page rather than a mislabelled one.
    if path.endswith(".webp"):
      return "image/webp"
    if path.endswith(".woff2"):
      return "font/woff2"
    return super().guess_type(path)


class Server(socketserver.ThreadingTCPServer):
  allow_reuse_address = True
  daemon_threads = True


def main():
  if not (ROOT / "index.html").exists():
    print("no index.html beside serve.py -- it has to sit in the site root")
    return 1

  handler = functools.partial(Handler, directory=str(ROOT))
  with Server(("", PORT), handler) as httpd:
    print("odell.dev Portfolio")
    print(f"  http://localhost:{PORT}")
    print(f"  serving {ROOT}")
    print("  ctrl-c to stop")
    try:
      webbrowser.open(f"http://localhost:{PORT}")
      httpd.serve_forever()
    except KeyboardInterrupt:
      print("\nstopped")
  return 0


if __name__ == "__main__":
  sys.exit(main())
