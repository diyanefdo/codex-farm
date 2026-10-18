#!/usr/bin/env python3
"""Serve Codex Farm locally. No dependencies, remote services, or write controls."""
import argparse
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import time
from urllib.parse import parse_qs, urlsplit

from farm import Monitor, demo_cards

ASSETS = Path(__file__).parent / 'web'


class FarmState:
    def __init__(self, home):
        self.monitor = Monitor(home)
        self.lock = threading.Lock()
        self.cached = None
        self.last_scan = 0

    def snapshot(self, demo=False, history=False):
        with self.lock:
            if demo:
                cards = demo_cards(int(time.monotonic()))
                sessions = {}
                scanned = time.time()
            else:
                if self.cached is None or time.monotonic() - self.last_scan >= 2:
                    self.cached = self.monitor.scan()
                    self.last_scan = time.monotonic()
                cards = self.monitor.cards(self.cached, sessions_only=history)
                sessions = {s.worker.id: s for s in self.monitor.sessions.values() if s.worker.id}
                scanned = time.time()
            farms = []
            seen_sessions = set()
            for title, cwd, workers in cards:
                root = sessions.get(workers[0].id)
                is_log = title.startswith('LOG ')
                if demo:
                    farm_id = 'demo:' + workers[0].id
                elif root:
                    # A session keeps its office when its log descriptor closes.
                    # Several processes can also hold the same log open.
                    if root.id in seen_sessions:
                        continue
                    seen_sessions.add(root.id)
                    farm_id = 'session:' + root.id
                else:
                    farm_id = 'pid:' + workers[0].id
                serialized = [asdict(w) for w in workers]
                if not root and not is_log and not demo:
                    serialized[0]['task'] = 'Running locally. Open a recorded session to see task activity.'
                farms.append({
                    'id': farm_id, 'title': title, 'directory': cwd,
                    'name': Path(cwd).name or 'Homestead',
                    'source': 'demo' if demo else 'session' if is_log else 'process',
                    'linked': bool(root) and not is_log,
                    'observed_at': root.touched if root else None,
                    'workers': serialized,
                })
            return {'mode': 'demo' if demo else 'live', 'updated_at': scanned, 'farms': farms}


class FarmHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Do not log project names, prompts, or request details.

    def respond(self, code, content, content_type):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        port = self.server.server_port
        allowed = {f'127.0.0.1:{port}', f'localhost:{port}'}
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        if host not in allowed or (origin and origin != 'http://' + host) or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.respond(403, b'Local requests only', 'text/plain; charset=utf-8')
            return
        url = urlsplit(self.path)
        if url.path == '/api/status':
            query = parse_qs(url.query)
            try:
                payload = self.server.farm_state.snapshot(demo=query.get('demo') == ['1'], history=query.get('history') == ['1'])
                self.respond(200, json.dumps(payload).encode(), 'application/json; charset=utf-8')
            except OSError:
                self.respond(503, b'{"error":"Cannot read local Codex status. Check terminal permissions and --codex-home."}', 'application/json')
            return
        assets = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/layout.js': ('layout.js', 'text/javascript; charset=utf-8'), '/motion.js': ('motion.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8')}
        if url.path not in assets:
            self.respond(404, b'Not found', 'text/plain')
            return
        name, mime = assets[url.path]
        self.respond(200, (ASSETS / name).read_bytes(), mime)


def make_server(port, home):
    server = ThreadingHTTPServer(('127.0.0.1', port), FarmHandler)
    server.daemon_threads = True
    server.farm_state = FarmState(home)
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--codex-home', type=Path, default=Path(os.environ.get('CODEX_HOME', '~/.codex')).expanduser())
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('--port must be between 1 and 65535')
    try:
        server = make_server(args.port, args.codex_home)
    except OSError as exc:
        parser.exit(1, f'Could not start local server: {exc}\n')
    print(f'Codex Farm: http://127.0.0.1:{server.server_port}  (Ctrl+C to stop)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
