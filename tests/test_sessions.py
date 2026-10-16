import json
from pathlib import Path
import tempfile
import unittest
from farm import Session


class ParsingTests(unittest.TestCase):
    def session(self):
        return Session(Path('/unused'))

    def test_lifecycle_events(self):
        for event, state in [('task_started', 'working'), ('turn_started', 'working'),
                             ('task_complete', 'done'), ('turn_complete', 'done'),
                             ('turn_aborted', 'paused'), ('task_failed', 'paused')]:
            with self.subTest(event=event):
                s = self.session()
                s.consume({'type': 'event_msg', 'payload': {'type': event}})
                self.assertEqual(s.worker.state, state)

    def test_user_prompt_restarts_completed_worker(self):
        s = self.session()
        s.worker.state = 'done'
        s.consume({'type': 'event_msg', 'payload': {'type': 'user_message', 'message': 'Fix login'}})
        self.assertEqual((s.worker.task, s.worker.state), ('Fix login', 'working'))

    def test_reasoning_text_fallback_and_unknown_event(self):
        s = self.session()
        s.consume({'type': 'event_msg', 'payload': {'type': 'agent_reasoning', 'text': 'Reviewing code'}})
        s.consume({'type': 'future_event', 'payload': {}})
        self.assertEqual(s.worker.task, 'Reviewing code')

    def test_tool_command_variants(self):
        for key in ('cmd', 'command', 'description'):
            with self.subTest(key=key):
                s = self.session()
                s.consume({'type': 'response_item', 'payload': {'type': 'function_call', 'name': 'shell', 'arguments': json.dumps({key: 'pytest'})}})
                self.assertEqual((s.worker.task, s.worker.state), ('shell: pytest', 'working'))

    def test_invalid_tool_arguments_still_show_tool_name(self):
        for arguments in ('{broken', '[]', 'null', '"text"', '123'):
            with self.subTest(arguments=arguments):
                s = self.session()
                s.consume({'type': 'response_item', 'payload': {'type': 'function_call', 'name': 'shell', 'arguments': arguments}})
                self.assertEqual(s.worker.task, 'shell')

    def test_metadata_handles_string_source_and_nickname(self):
        s = self.session()
        s.consume({'type': 'session_meta', 'payload': {'id': 'root', 'cwd': '/project', 'source': 'cli', 'agent_nickname': 'Robin'}})
        self.assertEqual((s.worker.id, s.worker.name, s.cwd, s.parent), ('root', 'Robin', '/project', ''))

    def test_corrupt_records_do_not_block_later_activity(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'rollout.jsonl'
            path.write_bytes(b'not json\nnull\n[]\n\xff\n' + json.dumps({'type': 'event_msg', 'payload': {'type': 'task_complete'}}).encode() + b'\n')
            s = Session(path)
            s.update()
            self.assertEqual(s.worker.state, 'done')
            self.assertEqual(s.offset, path.stat().st_size)

    def test_truncated_log_restarts_at_beginning(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'rollout.jsonl'
            path.write_text(json.dumps({'type': 'event_msg', 'payload': {'type': 'user_message', 'message': 'x' * 200}}) + '\n')
            s = Session(path)
            s.update()
            path.write_text(json.dumps({'type': 'event_msg', 'payload': {'type': 'task_complete'}}) + '\n')
            s.update()
            self.assertEqual(s.worker.state, 'done')
            path.unlink()
            s.update()  # A deleted file must not crash a refresh.
