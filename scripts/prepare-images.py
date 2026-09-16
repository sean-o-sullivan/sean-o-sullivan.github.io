"""Generate progressive still-image assets for tracked public pages. Run from anywhere."""
import base64
import hashlib
import html
import io
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'images/optimized'
OUT.mkdir(exist_ok=True)
ATTR = re.compile(r'([\w:-]+)\s*=\s*([\"\'])(.*?)\2', re.S)
cache = {}

def prepare(tag, page):
    attrs = {m[1]: html.unescape(m[3]) for m in ATTR.finditer(tag)}
    source = attrs.get('data-original-src', attrs.get('src', ''))
    url = urlsplit(source)
    if not source or url.scheme or url.netloc or 'srcset' in attrs:
        return tag
    path = (ROOT / unquote(url.path).lstrip('/') if url.path.startswith('/')
            else page.parent / unquote(url.path)).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file() or path.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp', '.gif'}:
        return tag
    if path not in cache:
        with Image.open(path) as original:
            if getattr(original, 'is_animated', False):
                cache[path] = None
            else:
                im = ImageOps.exif_transpose(original).convert('RGBA' if 'A' in original.getbands() else 'RGB')
                key = hashlib.sha256(path.read_bytes() + b'progressive-v1').hexdigest()[:20]
                preview = im.copy()
                preview.thumbnail((64, 64))
                buf = io.BytesIO()
                preview.save(buf, 'WEBP', quality=25)
                variants = []
                for width in sorted({min(w, im.width) for w in (400, 800, 1600)}):
                    dest = OUT / f'{key}-{width}.webp'
                    if not dest.exists():
                        resized = im.resize((width, max(1, round(im.height * width / im.width))), Image.Resampling.LANCZOS)
                        resized.save(dest, 'WEBP', quality=85, method=6)
                    variants.append({'width': width, 'src': '/' + str(dest.relative_to(ROOT))})
                # Preserve exact intrinsic dimensions, even when the tiny bitmap rounds a pixel.
                bitmap = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
                svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{im.width}" height="{im.height}" viewBox="0 0 {im.width} {im.height}"><image width="100%" height="100%" preserveAspectRatio="none" href="{bitmap}"/></svg>'
                cache[path] = (im.size, 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode(), variants)
    result = cache[path]
    if not result:
        return tag
    size, preview, variants = result
    changes = {'src': preview, 'data-original-src': source,
               'data-image-ratio': f'{size[0]} / {size[1]}',
               'data-image-variants': json.dumps(variants, separators=(',', ':')),
               'loading': 'eager', 'decoding': 'async'}
    if 'width' not in attrs and 'height' not in attrs:
        changes.update(width=str(size[0]), height=str(size[1]))
    for name, value in changes.items():
        replacement = f'{name}="{html.escape(value, quote=True)}"'
        pattern = re.compile(r'(?<![\w-])' + re.escape(name) + r'\s*=\s*([\"\']).*?\1', re.S)
        if pattern.search(tag):
            tag = pattern.sub(lambda _: replacement, tag)
        else:
            tag = tag[:-1].rstrip().rstrip('/') + ' ' + replacement + '>'
    return tag

pages = subprocess.check_output(['git', 'ls-files', '*.html'], cwd=ROOT, text=True).splitlines()
changed = 0
for filename in pages:
    page = ROOT / filename
    content = page.read_text()
    if '</head>' not in content:
        continue
    updated = re.sub(r'<img\b[^>]*>', lambda m: prepare(m[0], page), content, flags=re.I)
    if 'data-image-variants=' in updated and '/static/js/progressive-images.js' not in updated:
        updated = updated.replace('</head>', '  <script defer src="/static/js/progressive-images.js?v=1"></script>\n</head>')
    if updated != content:
        page.write_text(updated)
        changed += 1
print(f'{changed} pages updated; {sum(v is not None for v in cache.values())} still images prepared. Animated images unchanged.')
