"""Activity remains visible when Codex closes its rollout file between writes."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from farm import Monitor, Session


class ActivityTests(unittest.TestCase):
    def test_closed_log_appears_and_updates_without_process_link(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            path = home / 'sessions' / 'rollout.jsonl'
            path.parent.mkdir()
            events = [
                {'type': 'session_meta', 'payload': {'id': 'root', 'cwd': '/project'}},
                {'type': 'event_msg', 'payload': {'type': 'user_message', 'message': 'Fix login'}},
                {'type': 'response_item', 'payload': {'type': 'function_call', 'name': 'shell', 'arguments': '{"cmd":"pytest"}'}},
            ]
            path.write_text(''.join(json.dumps(event) + '\n' for event in events))
            monitor = Monitor(home)
            with patch('farm.processes', return_value=[]):
                monitor.scan()
            cards = monitor.cards([])
            self.assertEqual(len(cards), 1)
            self.assertIn('PID unverified', cards[0][0])
            self.assertEqual(cards[0][2][0].task, 'shell: pytest')
            self.assertEqual(cards[0][2][0].goal, 'Fix login')
            with path.open('a') as stream:
                stream.write(json.dumps({'type': 'event_msg', 'payload': {'type': 'task_complete'}}) + '\n')
            with patch('farm.processes', return_value=[]):
                monitor.scan()
            self.assertEqual(monitor.cards([])[0][2][0].state, 'done')

    def test_linked_session_not_duplicated_but_present_in_history(self):
        monitor = Monitor(Path('/unused'))
        root = Session(Path('/root.jsonl'), touched=10000)
        root.consume({'type': 'session_meta', 'payload': {'id': 'root'}})
        monitor.sessions[root.path] = root
        proc = {'pid': 1, 'cwd': '/project', 'tty': '/dev/pts/1', 'logs': {'/root.jsonl'}}
        with patch('farm.time.time', return_value=10000):
            cards = monitor.cards([proc])
            self.assertEqual(len(cards), 1)
            self.assertTrue(cards[0][0].startswith('PID 1'))
            history = monitor.cards([proc], sessions_only=True)
            self.assertEqual(len(history), 1)
            self.assertTrue(history[0][0].startswith('LOG root'))

    def test_history_window_order_and_nested_agents(self):
        monitor = Monitor(Path('/unused'))
        for sid, parent, touched in [('older', '', 98000), ('newer', '', 99999), ('child', 'newer', 99999), ('ancient', '', 1)]:
            session = Session(Path('/' + sid + '.jsonl'), id=sid, parent=parent, touched=touched)
            session.worker.id = sid
            monitor.sessions[session.path] = session
        with patch('farm.time.time', return_value=100000):
            live = monitor.cards([])
            self.assertEqual(len(live), 1)
            self.assertEqual([w.id for w in live[0][2]], ['newer', 'child'])
            history = monitor.cards([], sessions_only=True)
            self.assertEqual(len(history), 2)
            self.assertIn('newer', history[0][0])
            self.assertIn('older', history[1][0])

    def test_response_messages_supply_task_and_goal(self):
        session = Session(Path('/unused'))
        for role, text in [('user', 'Build login'), ('assistant', 'Updating auth.py')]:
            session.consume({'type': 'response_item', 'payload': {'type': 'message', 'role': role, 'content': [{'type': 'input_text' if role == 'user' else 'output_text', 'text': text}]}})
        self.assertEqual(session.worker.task, 'Updating auth.py')
        self.assertEqual(session.worker.goal, 'Build login')
