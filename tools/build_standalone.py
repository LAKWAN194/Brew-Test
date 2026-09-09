#!/usr/bin/env python3
"""Bundle the site into one self-contained HTML file.

The repo version of the quiz fetches data/questions.json and loads images
from assets/img/, so it needs to be served over HTTP. This script inlines
the stylesheet, the script, the question bank and every image as data URIs,
producing dist/brew-test.html — a single file that runs offline straight
from disk, which is handy for sharing or for use on a café's own machine.

Usage:
    python tools/build_standalone.py
"""

from __future__ import annotations

import base64
import json
import mimetypes
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "brew-test.html"

IMAGE_DIR = ROOT / "assets" / "img" / "questions"
CSS = ROOT / "assets" / "css" / "styles.css"
JS = ROOT / "assets" / "js" / "app.js"
DATA = ROOT / "data" / "questions.json"
INDEX = ROOT / "index.html"

LINK_TAG = re.compile(r'[ \t]*<link rel="stylesheet"[^>]*>\n')
SCRIPT_TAG = re.compile(r'[ \t]*<script src="assets/js/app\.js"></script>\n')


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> int:
    data = json.loads(DATA.read_text(encoding="utf-8"))

    # Swap each image filename for the encoded image itself.
    inlined = 0
    for question in data["questions"]:
        name = question.get("image")
        if not name:
            continue
        source = IMAGE_DIR / name
        if not source.exists():
            print(f"warning: {question['id']} references missing image {name}", file=sys.stderr)
            question.pop("image")
            continue
        question["image"] = data_uri(source)
        inlined += 1

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    bundle = (
        "<style>\n"
        + CSS.read_text(encoding="utf-8")
        + "\n</style>\n",
        "<script>\nconst INLINE_QUESTIONS = "
        + payload
        + ";\n"
        + JS.read_text(encoding="utf-8")
        + "</script>\n",
    )

    html = INDEX.read_text(encoding="utf-8")
    html, css_hits = LINK_TAG.subn(bundle[0], html)
    html, js_hits = SCRIPT_TAG.subn(bundle[1], html)
    if css_hits != 1 or js_hits != 1:
        print(
            f"error: expected one stylesheet link and one script tag in index.html, "
            f"found {css_hits} and {js_hits}",
            file=sys.stderr,
        )
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(
        f"wrote {OUT.relative_to(ROOT).as_posix()} "
        f"({OUT.stat().st_size / 1024 / 1024:.1f} MB, "
        f"{len(data['questions'])} questions, {inlined} images inlined)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
