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
import socket
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

  # log_request and log_error are overridden rather than log_message, which is
  # the single funnel the two of them share. That funnel sees two shapes with
  # nothing in common -- a request line as (requestline, code, size), and an
  # error as (code, message) -- and reading one as the other is what broke
  # here. A 404 for /favicon.ico put an HTTPStatus where the request line was
  # expected, and socketserver reported the AttributeError that followed as an
  # exception during request processing. The 404 was correct. The logger was
  # not, and the traceback pointed at the wrong one of the two.

  def log_request(self, code="-", size="-"):
    # One line per asset, and the page has eighteen of them, which buries the
    # one line worth reading. Successes stay quiet; anything else gets a line.
    # A 206 would land here too: nothing here advertises byte ranges, so a
    # partial response would mean something unexpected is asking for one.
    if isinstance(code, http.HTTPStatus):
      code = code.value
    if str(code) in ("200", "304"):
      return
    sys.stderr.write("  %s %s\n" % (code, self.requestline))

  def log_error(self, fmt, *args):
    # One line, never a traceback. Most often this is /favicon.ico, which
    # browsers ask for unprompted and which this repo has no copy of at its
    # root -- expected, and worth one line rather than a page.
    #
    # The formatting is guarded rather than trusted to match, because an
    # exception raised in here is reported as a failure of the request instead
    # of a failure of the logging. That is the exact confusion that made the
    # bug above take a stack trace to find, and it should not be possible to
    # recreate it from inside the error path.
    try:
      line = fmt % args
    except (TypeError, ValueError):
      line = " ".join(str(a) for a in (fmt,) + args)
    sys.stderr.write("  " + line + "\n")

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
  # Kept for TIME_WAIT, when a just-stopped server's port is still closing and
  # a restart would otherwise be refused. It is not what guards against a
  # second live server -- on Windows SO_REUSEADDR permits that bind, which is
  # exactly why main() asks the port a question instead.
  allow_reuse_address = True
  daemon_threads = True


def in_use(port):
  # A connect test, not a bind test. Binding proves nothing here: on Windows
  # SO_REUSEADDR lets a second server bind a port that is already being
  # listened on, so it starts, prints its banner, and then competes with the
  # first one for connections. A restart can therefore look like it worked
  # while the older process is still the one answering -- which is what
  # happened while this was being tested, where a fix appeared to fail because
  # the requests were reaching a server started before it. Connecting asks the
  # only question worth asking.
  with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
    probe.settimeout(0.4)
    return probe.connect_ex(("127.0.0.1", port)) == 0


def main():
  if not (ROOT / "index.html").exists():
    print("no index.html beside serve.py -- it has to sit in the site root")
    return 1

  if in_use(PORT):
    print(f"port {PORT} is already answering something.")
    print("  Most likely an older serve.py is still running, and it will keep")
    print("  serving the code it started with -- so an edit here appears to do")
    print("  nothing at all. Stop that one, or change PORT at the top of this")
    print("  file.")
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
