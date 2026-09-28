#!/usr/bin/env python3
"""
Refresh the numbers on the portfolio.

It writes two things:

  index.html        The baked-in values and the date they were taken. These are
                    what a visitor with JavaScript disabled sees, and what the
                    page falls back to when a live fetch fails — which is why
                    the date is printed next to them.

  data/stats.json   A machine-readable record of the same figures and their
                    sources. Nothing on the page reads it; it exists so the
                    numbers can be checked or reused without re-fetching, and
                    so a failed source leaves a note of what it was.

The GitHub and PyPI figures do NOT depend on this script — the browser fetches
those live on every page load, because both APIs send Access-Control-Allow-Origin.
Running this only makes the *fallback* fresher, so a no-JS visitor or a failed
fetch still sees recent numbers.

The Uptodown figure is the exception: uptodown.com sends no CORS headers, so the
browser cannot read that page directly and there is no live path for it at all.
It moves only when this script runs.

Nothing runs this automatically. That is deliberate: a scheduled job would need
a repository layout that is not settled yet, because the canonical URL is still
unconfirmed (see _internal/build-notes.md, which is outside this folder and is
not published). Run it by hand before sending the CV somewhere, and commit the
result.

    python tools/update-stats.py

Stdlib only — no pip install needed.
"""

import json
import re
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
SNAPSHOT_FILE = ROOT / "data" / "stats.json"

TIMEOUT = 25
HEADERS = {"User-Agent": "odell-portfolio-stats/1.0 (+https://github.com/odell0111)"}

_repo_cache = {}


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        return response.read().decode("utf-8", "replace")


def github_repo(name):
    """Cached, because stars and forks are two fields of one response."""
    if name not in _repo_cache:
        _repo_cache[name] = json.loads(
            fetch(f"https://api.github.com/repos/odell0111/{name}")
        )
    return _repo_cache[name]


def release_downloads(name):
    releases = json.loads(
        fetch(f"https://api.github.com/repos/odell0111/{name}/releases")
    )
    return sum(asset.get("download_count", 0) for rel in releases for asset in rel.get("assets", []))


def pypi_version(package):
    return json.loads(fetch(f"https://pypi.org/pypi/{package}/json"))["info"]["version"]


def uptodown_downloads(url):
    """The count sits in <div class="dwstat"><span>361 </span><span>downloads.

    Anchored on that structure rather than "the first number near the word
    downloads", because the page has a dozen other download strings (button
    labels, related apps, "20-download" URLs) and a loose pattern picks the
    wrong one.
    """
    html = fetch(url)
    match = re.search(
        r'<div class="dwstat">\s*<span>([\d.,\s ]+)</span><span>(?:downloads|descargas)',
        html,
    )
    if not match:
        raise ValueError("no .dwstat block found — Uptodown probably changed their markup")
    return int(re.sub(r"\D", "", match.group(1)))


def pepy_monthly(package):
    """The monthly download figure, read from the pepy.tech badge.

    pepy has a JSON API, but it needs a key. The badge is public, and the
    browser can read it too (it sends Access-Control-Allow-Origin), so the
    page and this script quote the same source.

    The badge draws the label twice and the figure twice — a drop shadow and
    the figure itself — so the figure is found by its shape rather than by
    position. A popular package comes back abbreviated ("403M", "1G"); that
    is left exactly as pepy published it, because expanding it would invent a
    precision the source never had.
    """
    svg = fetch(f"https://static.pepy.tech/badge/{package}/month")
    for text in re.findall(r"<text[^>]*>([^<]*)</text>", svg):
        value = text.strip()
        if re.fullmatch(r"[\d.,]+[kMG]?", value):
            return value
    raise ValueError("no figure found in the pepy badge — markup may have changed")


# stat id -> (label, what produced it, how to fetch it)
SOURCES = [
    ("am-apk",   "Account Manager — Android APK downloads",
     "github:account-manager/releases", lambda: release_downloads("account-manager")),
    ("up-dl",    "Account Manager — Windows downloads (Uptodown)",
     "uptodown:account-manager.en", lambda: uptodown_downloads("https://account-manager.en.uptodown.com/windows")),
    ("cgs-dl",   "Custom GUI SFX — release downloads",
     "github:custom-gui-sfx/releases", lambda: release_downloads("custom-gui-sfx")),
    ("ts-stars", "turnstile_solver — stars",
     "github:turnstile_solver", lambda: github_repo("turnstile_solver")["stargazers_count"]),
    ("ts-forks", "turnstile_solver — forks",
     "github:turnstile_solver", lambda: github_repo("turnstile_solver")["forks_count"]),
    ("iit-ver",  "image-in-terminal — PyPI version",
     "pypi:image-in-terminal", lambda: pypi_version("image-in-terminal")),
    ("iit-dl",   "image-in-terminal — downloads a month",
     "pepy:image-in-terminal/month", lambda: pepy_monthly("image-in-terminal")),
]


def read_baked(html, stat_id):
    match = re.search(
        r'data-stat="%s" data-value="([^"]*)"' % re.escape(stat_id), html
    )
    return match.group(1) if match else None


def patch_baked(html, stat_id, value):
    """Replace both the data-value attribute and the visible text.

    The span holds nothing but the number, so the inner text is a safe target.
    """
    pattern = re.compile(
        r'(data-stat="%s" data-value=")[^"]*(">)[^<]*(</span>)' % re.escape(stat_id)
    )
    replacement = r"\g<1>%s\g<2>%s\g<3>" % (value, value)
    new_html, count = pattern.subn(replacement, html)
    if count != 1:
        raise ValueError(f"expected exactly one [{stat_id}] span, found {count}")
    return new_html


def patch_snapshot_date(html, iso):
    new_html, a = re.subn(
        r'(data-snapshot=")[^"]*(")', lambda m: m.group(1) + iso + m.group(2), html
    )
    new_html, b = re.subn(
        r'(<time class="stats-date" datetime=")[^"]*(">)[^<]*(</time>)',
        lambda m: m.group(1) + iso + m.group(2) + iso + m.group(3),
        new_html,
    )
    if a != 1 or b != 2:
        raise ValueError(
            f"expected 1 data-snapshot and 2 stats-date elements, found {a} and {b}"
        )
    return new_html


def main():
    if not INDEX.exists():
        sys.exit(f"index.html not found at {INDEX}")
    html = INDEX.read_text(encoding="utf-8")
    today = date.today().isoformat()

    values = {}
    failed = []

    print(f"\n  Refreshing portfolio figures — {today}\n")
    print(f"  {'stat':<10} {'was':>8}  {'now':>8}  source")
    print(f"  {'-'*10} {'-'*8}  {'-'*8}  {'-'*38}")

    for stat_id, label, source, getter in SOURCES:
        was = read_baked(html, stat_id)
        try:
            now = getter()
            values[stat_id] = {"label": label, "value": now, "source": source}
            flag = "" if str(now) == str(was) else "  <- changed"
            print(f"  {stat_id:<10} {str(was):>8}  {str(now):>8}  {source}{flag}")
        except (urllib.error.URLError, ValueError, KeyError, json.JSONDecodeError, OSError) as exc:
            failed.append((stat_id, label, exc))
            values[stat_id] = {"label": label, "value": was, "source": source,
                               "error": str(exc)}
            print(f"  {stat_id:<10} {str(was):>8}  {'--':>8}  {source}  FAILED: {exc}")

    # The machine-readable record. Nothing reads this at runtime — it is here
    # so the figures, their sources and the moment they were taken survive
    # outside index.html.
    SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_FILE.write_text(
        json.dumps(
            {
                "generated": today,
                "note": "Generated by tools/update-stats.py. Not read by the page.",
                "stats": values,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    # Bake the same numbers into the HTML as the no-JS / fetch-failed fallback.
    for stat_id, entry in values.items():
        html = patch_baked(html, stat_id, entry["value"])
    html = patch_snapshot_date(html, today)
    INDEX.write_text(html, encoding="utf-8")

    print(f"\n  Wrote {SNAPSHOT_FILE.relative_to(ROOT)}")
    print(f"  Patched {INDEX.name}")

    if failed:
        print(f"\n  {len(failed)} source(s) failed and kept their previous value:")
        for stat_id, label, exc in failed:
            print(f"    - {label}: {exc}")
        print()
        sys.exit(1)

    print("\n  All sources refreshed.\n")


if __name__ == "__main__":
    main()
