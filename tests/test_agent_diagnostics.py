import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from farm import diagnose_agents


class AgentDiagnosticsTests(unittest.TestCase):
    def test_reports_relationship_schema_without_prompt_or_result_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / 'sessions').mkdir()
            records = [
                {'type': 'session_meta', 'payload': {'id': 'child-id', 'source': {'custom_spawn': {'parent_session_id': 'root-id'}}, 'instructions': 'PRIVATE_INSTRUCTIONS'}},
                {'type': 'event_msg', 'payload': {'type': 'agent_message', 'message': 'PRIVATE_MESSAGE'}},
                {'type': 'response_item', 'payload': {'type': 'function_call', 'name': 'delegate_task', 'arguments': '{"task":"PRIVATE_TASK"}'}},
                {'type': 'response_item', 'payload': {'type': 'function_call_output', 'output': '{"child_id":"PRIVATE_RESULT"}'}},
            ]
            (home / 'sessions' / 'rollout.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in records) + 'broken\n')
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                diagnose_agents(home)
            text = output.getvalue()
            self.assertIn('parent_session_id', text)
            self.assertIn('delegate_task', text)
            self.assertIn('child_id', text)
            self.assertIn('child-id', text)
            self.assertNotIn('PRIVATE_', text)
            self.assertNotIn('root-id', text)  # Unparsed metadata values are omitted.

    def test_missing_home_gives_actionable_message(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                diagnose_agents(Path(tmp) / 'missing')
            self.assertIn('Check --codex-home', output.getvalue())
