import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from farm import Session
from web_server import FarmHandler, FarmState


class FakeSocket:
    def __init__(self, request):
        self.input = io.BytesIO(request)
        self.output = bytearray()

    def makefile(self, *args, **kwargs):
        return self.input

    def sendall(self, data):
        self.output.extend(data)


class WebTests(unittest.TestCase):
    def request(self, path='/', host='127.0.0.1:8765', extra=''):
        state = FarmState(Path('/unused'))
        sock = FakeSocket(f'GET {path} HTTP/1.0\r\nHost: {host}\r\n{extra}\r\n'.encode())
        server = SimpleNamespace(server_port=8765, farm_state=state)
        FarmHandler(sock, ('127.0.0.1', 1000), server)
        head, body = bytes(sock.output).split(b'\r\n\r\n', 1)
        return head.decode(), body

    def test_demo_never_scans_real_processes_or_logs(self):
        with patch('web_server.Monitor.scan', side_effect=AssertionError('demo read local data')):
            head, body = self.request('/api/status?demo=1')
        data = json.loads(body)
        self.assertIn('200 OK', head)
        self.assertEqual(data['mode'], 'demo')
        self.assertEqual(len(data['farms']), 3)
        self.assertEqual(data['farms'][0]['source'], 'demo')
        self.assertGreater(len(data['farms'][0]['workers']), 1)

    def test_live_snapshot_shows_unlinked_logs_with_agents_and_goals(self):
        state = FarmState(Path('/unused'))
        root = Session(Path('/root.jsonl'), touched=100000)
        root.consume({'type': 'session_meta', 'payload': {'id': 'root', 'cwd': '/projects/orchard'}})
        root.consume({'type': 'event_msg', 'payload': {'type': 'user_message', 'message': '<script>private task</script>'}})
        child = Session(Path('/child.jsonl'), id='child', parent='root', touched=100000)
        state.monitor.sessions = {s.path: s for s in (root, child)}
        with patch.object(state.monitor, 'scan', return_value=[]) as scan, patch('farm.time.time', return_value=100000):
            data = state.snapshot(history=True)
            state.snapshot(history=True)
        scan.assert_called_once()
        farm = data['farms'][0]
        self.assertEqual(farm['source'], 'session')
        self.assertFalse(farm['linked'])
        self.assertEqual(len(farm['workers']), 2)
        self.assertEqual(farm['workers'][0]['goal'], '<script>private task</script>')
        self.assertEqual(farm['observed_at'], 100000)

    def test_untrusted_host_and_cross_origin_requests_rejected_before_scan(self):
        for host, extra in [('evil.example:8765', ''), ('127.0.0.1:8765', 'Origin: https://evil.example\r\n'), ('127.0.0.1:8765', 'Sec-Fetch-Site: cross-site\r\n')]:
            with self.subTest(host=host, extra=extra), patch('web_server.Monitor.scan', side_effect=AssertionError('read on forbidden request')):
                head, _ = self.request('/api/status', host, extra)
                self.assertIn('403 Forbidden', head)

    def test_static_routes_are_allowlisted_and_protected(self):
        head, body = self.request('/')
        self.assertIn('200 OK', head)
        self.assertIn('Content-Security-Policy:', head)
        self.assertIn('Cache-Control: no-store', head)
        self.assertNotIn('Access-Control-Allow-Origin', head)
        self.assertIn(b'Your work, in bloom', body)
        for route in ('/../farm.py', '/farm.py', '/api/execute', '/web_server.py'):
            with self.subTest(route=route):
                head, _ = self.request(route)
                self.assertIn('404 Not Found', head)

    def test_scan_failure_reports_service_error_not_fake_demo_data(self):
        with patch('web_server.Monitor.scan', side_effect=PermissionError('private path')):
            head, body = self.request('/api/status')
        self.assertIn('503 Service Unavailable', head)
        self.assertNotIn(b'private path', body)
        self.assertIn(b'error', body)
