#!/usr/bin/env python3
"""Preview the site on http://localhost:8042

Not a deployment target -- the site is static files and any host will do. This
exists because opening index.html directly off the disk (file://) breaks two
things that only work over HTTP: the self-hosted woff2 fonts, which browsers
refuse to load cross-origin from a file path, and video seeking, which needs
byte-range responses. Previewing over file:// therefore shows the wrong type
and a stuttering lightbox, and it is easy to spend an afternoon fixing a
problem the real site does not have.

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
  # SimpleHTTPRequestHandler speaks HTTP/1.0 by default, which means a fresh
  # TCP connection per request. This page asks for forty-odd images, and
  # Chrome's six connections to a 1.0 server end up closing and reopening
  # fast enough that some requests come back as ERR_EMPTY_RESPONSE and the
  # image silently never arrives. Keep-alive fixes the preview; a real host
  # was never going to have this problem, which is exactly why it is worth
  # fixing here rather than debugging phantom missing photographs.
  protocol_version = "HTTP/1.1"

  def end_headers(self):
    self.send_header("Cache-Control", "no-store")
    # Byte-range support is what lets the lightbox scrub a clip instead of
    # downloading it whole first.
    self.send_header("Accept-Ranges", "bytes")
    super().end_headers()

  def log_message(self, fmt, *args):
    # Default logging prints a line per asset; a page with 30 images buries
    # the one line worth reading.
    if args and str(args[1]) not in ("200", "206", "304"):
      sys.stderr.write("  %s %s\n" % (args[1], args[0].split()[1]))

  def guess_type(self, path):
    # Python's table predates both formats and serves them as octet-stream,
    # which makes the browser download them instead of using them.
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
