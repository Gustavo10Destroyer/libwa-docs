#!/usr/bin/env python3
"""Internal link/anchor/asset audit for the built VitePress site."""
import os
import posixpath
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlparse

DIST = ".vitepress/dist"
BASE = "/libwa-docs/"


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids.add(d["id"])
        if tag == "a" and d.get("name"):
            self.ids.add(d["name"])
        for attr in ("href", "src"):
            if d.get(attr):
                self.refs.append((attr, d[attr]))


pages = {}
for root, _dirs, files in os.walk(DIST):
    for name in files:
        if not name.endswith(".html"):
            continue
        path = os.path.join(root, name)
        rel = os.path.relpath(path, DIST).replace(os.sep, "/")
        parser = Parser()
        with open(path, encoding="utf-8") as handle:
            parser.feed(handle.read())
        pages[rel] = parser


def route_of(html_rel):
    rel = html_rel
    if rel == "index.html":
        return ""
    if rel.endswith("/index.html"):
        return rel[: -len("index.html")]
    if rel.endswith(".html"):
        return rel[: -len(".html")]
    return rel


routes = {route_of(rel): rel for rel in pages}


def resolve(target):
    if target in ("", ".", "./"):
        return "index.html"
    if os.path.isfile(os.path.join(DIST, target)):
        return target  # static asset (no anchor semantics)
    if target in routes:
        return routes[target]
    if target in pages:
        return target
    for candidate in (target + ".html", target + "/index.html"):
        if candidate in pages:
            return candidate
    if target.endswith("/") and target[:-1] in routes:
        return routes[target[:-1]]
    return None


errors = []
external = set()
checked = 0


def check(current_rel, attr, raw):
    global checked
    url = raw.strip()
    if not url or url.startswith(("javascript:", "data:", "mailto:", "tel:", "{{", "{")):
        return
    parsed = urlparse(url)
    if parsed.scheme in ("http", "https") or url.startswith("//"):
        external.add(parsed.netloc or url)
        return
    if parsed.scheme:
        return
    checked += 1
    path, frag = parsed.path, parsed.fragment
    if not path:
        target_rel = current_rel
    else:
        if path.startswith(BASE):
            target = unquote(path[len(BASE):])
        elif path.startswith("/"):
            errors.append(f"{current_rel}: {attr}={raw} (path outside {BASE})")
            return
        else:
            base_dir = posixpath.dirname(route_of(current_rel))
            target = unquote(posixpath.normpath(posixpath.join(base_dir, path)))
        target_rel = resolve(target)
        if target_rel is None:
            if "." in posixpath.basename(target):
                errors.append(f"{current_rel}: {attr}={raw} (missing file)")
            else:
                errors.append(f"{current_rel}: {attr}={raw} (missing page)")
            return
        if target_rel not in pages:
            return  # asset resolved, anchors don't apply
    if frag:
        frag = unquote(frag)
        if frag not in pages[target_rel].ids:
            errors.append(f"{current_rel}: {attr}={raw} (missing #{frag} in {target_rel})")


for rel, parser in sorted(pages.items()):
    for attr, value in parser.refs:
        check(rel, attr, value)

print(f"pages: {len(pages)}  internal refs checked: {checked}  external domains: {len(external)}")
for domain in sorted(external):
    print(f"  external: {domain}")
if errors:
    print(f"\nBROKEN ({len(errors)}):")
    for error in errors:
        print(f"  {error}")
    sys.exit(1)
print("OK: all internal links, anchors and assets resolve")
