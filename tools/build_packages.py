from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib, json, shutil

root = Path(r'D:\杂项\自制\游戏\YZRPG_tinygame')
dist = root / 'dist'
pc_old = dist / 'YZRPG_TinyGame-win64.zip'
apk_old = dist / 'YZRPG_TinyGame-android.apk'
pc_new = root / '_pc_new.zip'
apk_new = root / '_apk_new.apk'

js_files = sorted(p for p in (root / 'js').glob('*.js') if p.name != 'names-app.js')
css_files = sorted(p for p in (root / 'css').glob('*.css') if p.name != 'names.css')
audio_files = sorted(p for p in (root / 'audio').glob('*.ogg'))
arena_files = sorted(p for p in (root / 'img' / 'arena').glob('*.png'))
chess_art_files = sorted(p for p in (root / 'img' / 'chess' / 'art').rglob('*.png'))
memory_files = sorted(p for p in (root / 'img' / 'memory').rglob('*') if p.is_file() and p.suffix.lower() in ('.jpg', '.png', '.webp'))
vendor_files = sorted(p for p in (root / 'vendor').rglob('*') if p.is_file())
special_ball_files = sorted((root / 'img' / 'ball').glob('special-*.png'))

def write_entry(zf, arc, data):
    zi = ZipInfo(arc)
    zi.date_time = (2026, 11, 22, 9, 0, 0)
    zi.compress_type = ZIP_DEFLATED
    zi.external_attr = 0o644 << 16
    zf.writestr(zi, data)

def build(old, out, prefix):
    sources = [(root / 'index.html', 'index.html')]
    sources += [(p, 'css/' + p.name) for p in css_files]
    sources += [(p, 'js/' + p.name) for p in js_files]
    sources += [(p, 'audio/' + p.name) for p in audio_files]
    sources += [(p, 'img/arena/' + p.name) for p in arena_files]
    sources += [(p, 'img/memory/' + p.relative_to(root / 'img' / 'memory').as_posix()) for p in memory_files]
    sources += [(p, 'img/ball/' + p.name) for p in special_ball_files]
    sources += [(p, 'img/chess/art/' + p.relative_to(root / 'img' / 'chess' / 'art').as_posix()) for p in chess_art_files]
    sources += [(p, 'vendor/' + p.relative_to(root / 'vendor').as_posix()) for p in vendor_files]
    with ZipFile(old) as src, ZipFile(out, 'w', allowZip64=True) as dst:
        written = set()
        for info in src.infolist():
            n = info.filename
            if prefix == 'assets/www/' and n.startswith('META-INF/'):
                continue
            if n.startswith(prefix):
                rest = n[len(prefix):]
                if rest.startswith(('js/', 'css/', 'audio/', 'vendor/', 'img/arena/', 'img/memory/', 'img/chess/art/')) or rest == 'index.html':
                    continue
            dst.writestr(info, src.read(n))
            written.add(n)
        for p, rel in sources:
            arc = prefix + rel
            if arc in written:
                continue
            write_entry(dst, arc, p.read_bytes())
            written.add(arc)
    return len(sources), out

pc_sources, _ = build(pc_old, pc_new, 'YZRPG_TinyGame-win64/www/')
apk_sources, _ = build(apk_old, apk_new, 'assets/www/')
shutil.copyfile(pc_new, pc_old)
print('pc sources', pc_sources, 'size', pc_old.stat().st_size)
