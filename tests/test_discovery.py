"""Discovery tests use synthetic logs and /proc entries, never the user's sessions."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from farm import Monitor, Session, processes


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)

    def log(self, name, session_id, age=0):
        path = self.home / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({'type': 'session_meta', 'payload': {'id': session_id}}) + '\n')
        os.utime(path, (200000 - age, 200000 - age))
        return path

    def test_recent_and_archived_logs_discovered_old_logs_excluded(self):
        recent = self.log('sessions/2026/rollout.jsonl', 'recent')
        archived = self.log('archived_sessions/rollout.jsonl', 'archived')
        self.log('sessions/old.jsonl', 'old', age=86401)
        monitor = Monitor(self.home)
        with patch('farm.time.time', return_value=200000), patch('farm.processes', return_value=[]) as discover:
            self.assertEqual(monitor.scan(), [])
        discover.assert_called_once_with()
        self.assertEqual(set(monitor.sessions), {recent, archived})
        self.assertEqual({s.id for s in monitor.sessions.values()}, {'recent', 'archived'})

    def test_known_log_kept_after_discovery_window(self):
        path = self.log('sessions/rollout.jsonl', 'root')
        monitor = Monitor(self.home)
        with patch('farm.processes', return_value=[]):
            with patch('farm.time.time', return_value=200000):
                monitor.scan()
            with path.open('a') as stream:
                stream.write(json.dumps({'type': 'event_msg', 'payload': {'type': 'task_complete'}}) + '\n')
            with patch('farm.time.time', return_value=10**12):
                monitor.scan()
        self.assertEqual(monitor.sessions[path].worker.state, 'done')

    def test_missing_home_is_empty(self):
        with patch('farm.processes', return_value=[]):
            monitor = Monitor(self.home / 'missing')
            self.assertEqual(monitor.scan(), [])
            self.assertEqual(monitor.sessions, {})

    def proc_entry(self, pid, executable='codex'):
        entry = self.home / str(pid)
        (entry / 'fd').mkdir(parents=True)
        (entry / 'exe').symlink_to('/usr/bin/' + executable)
        (entry / 'cwd').symlink_to('/work/project')
        (entry / 'fd/0').symlink_to('/dev/pts/2')
        return entry

    def test_native_processes_sorted_wrappers_excluded_logs_filtered(self):
        entry = self.proc_entry(42)
        (entry / 'fd/3').symlink_to('/logs/session.jsonl')
        (entry / 'fd/4').symlink_to('/tmp/unrelated.txt')
        self.proc_entry(7, 'codex.exe')
        self.proc_entry(9, 'node')
        found = processes(self.home)
        self.assertEqual([p['pid'] for p in found], [7, 42])
        self.assertEqual(found[1], {'pid': 42, 'cwd': '/work/project', 'tty': '/dev/pts/2', 'logs': {'/logs/session.jsonl'}})

    def test_disappearing_or_unreadable_process_does_not_hide_others(self):
        self.proc_entry(10)
        broken = self.proc_entry(11)
        (broken / 'cwd').unlink()
        self.assertEqual([p['pid'] for p in processes(self.home)], [10])

    def test_unrelated_agents_excluded_and_latest_open_root_chosen(self):
        monitor = Monitor(self.home)
        def session(sid, parent='', touched=0):
            s = Session(self.home / (sid + '.jsonl'), touched=touched)
            s.consume({'type': 'session_meta', 'payload': {'id': sid}})
            s.parent = parent
            return s
        old = session('old', touched=1)
        root = session('root', touched=2)
        child = session('child', 'root')
        unrelated = session('other', 'missing')
        monitor.sessions = {s.path: s for s in (old, root, child, unrelated)}
        proc = {'pid': 1, 'cwd': '/work', 'tty': '/dev/pts/1', 'logs': {str(old.path), str(root.path)}}
        title, cwd, workers = monitor.cards([proc])[0]
        self.assertEqual([w.id for w in workers], ['root', 'child'])
        self.assertEqual(title, 'PID 1  pts/1')
        self.assertEqual(cwd, '/work')
