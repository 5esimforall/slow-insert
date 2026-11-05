"""Development mounts matching the two separately installed plugins."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import os
ROOT = Path(__file__).resolve().parents[1]
FOUNDATION = ROOT.parent / 'truesight/module'
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = unquote(urlsplit(path).path)
        root = FOUNDATION if path.startswith('/truesight/') else ROOT
        relative = path[len('/truesight/'):] if root == FOUNDATION else path.lstrip('/')
        target = (root / relative).resolve()
        return str(target if target.is_relative_to(root) else root / '__not_found__')
ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PORT', '4178'))), Handler).serve_forever()
