import json
from pathlib import Path
import tempfile
import unittest
from farm import Session, Monitor


class SessionTests(unittest.TestCase):
    def test_incremental_log_and_partial_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'session.jsonl'
            meta = {'type': 'session_meta', 'payload': {'id': 'child', 'cwd': '/project', 'source': {'subagent': {'thread_spawn': {'parent_thread_id': 'root'}}}}}
            path.write_text(json.dumps(meta) + '\n' + '{"type":')
            session = Session(path)
            session.update()
            self.assertEqual(session.parent, 'root')
            offset = session.offset
            session.update()
            self.assertEqual(session.offset, offset)
            with path.open('a') as f:
                f.write('"event_msg","payload":{"type":"agent_message","message":"Writing tests"}}\n')
            session.update()
            self.assertEqual(session.worker.task, 'Writing tests')
            session.consume({'type': 'event_msg', 'payload': {'type': 'task_complete'}})
            self.assertEqual(session.worker.state, 'done')

    def test_nested_agents_and_no_cwd_guessing(self):
        monitor = Monitor(Path('/missing'))
        root = Session(Path('/root.jsonl'), id='root', cwd='/project')
        child = Session(Path('/child.jsonl'), id='child', parent='root')
        grandchild = Session(Path('/grandchild.jsonl'), id='grandchild', parent='child')
        monitor.sessions = {s.path: s for s in (root, child, grandchild)}
        proc = {'pid': 1, 'cwd': '/project', 'tty': '/dev/pts/1', 'logs': set()}
        self.assertEqual(len(monitor.cards([proc])[0][2]), 1)
        proc['logs'] = {'/root.jsonl'}
        self.assertEqual(len(monitor.cards([proc])[0][2]), 3)


if __name__ == '__main__':
    unittest.main()
