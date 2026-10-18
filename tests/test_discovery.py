"""Discovery tests use synthetic logs and /proc entries, never the user's sessions."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from farm import Monitor, Session, processes, is_codex_name, diagnose


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

    def test_missing_cwd_does_not_hide_running_instance(self):
        self.proc_entry(10)
        broken = self.proc_entry(11)
        (broken / 'cwd').unlink()
        found = processes(self.home)
        self.assertEqual([p['pid'] for p in found], [10, 11])
        self.assertEqual(found[1]['cwd'], '(working directory unavailable)')

    def test_process_start_ticks_distinguish_reused_pid(self):
        entry = self.proc_entry(42)
        # A full /proc/PID/stat record, including a comm with spaces and parentheses.
        stat = ('42 (codex (worker)) S 1 42 42 34818 42 4194304 100 0 0 0 '
                '10 5 0 0 20 0 1 0 {start} 1048576 256 18446744073709551615 '
                '4194304 4198400 140737488347136 0 0 0 0 0 0 0 0 0 17 0 0 '
                '0 0 0 0 6291456 6295552 10485760 140737488347200 '
                '140737488347216 140737488347216 140737488351232 0')
        (entry / 'stat').write_text(stat.format(start=123456))
        original = processes(self.home)[0]
        self.assertEqual(original['start_ticks'], 123456)
        (entry / 'stat').write_text(stat.format(start=987654))
        replacement = processes(self.home)[0]
        self.assertEqual(replacement['start_ticks'], 987654)
        self.assertEqual(original['pid'], replacement['pid'])

    def test_missing_or_malformed_stat_does_not_hide_running_process(self):
        entry = self.proc_entry(42)
        for stat in (None, 'invalid stat', '42 (codex worker) S 1 0 0',
                     '42 (codex) S 1 42 42 0 0 0 0 0 0 0 0 0 0 0 20 0 1 0 invalid'):
            with self.subTest(stat=stat):
                if stat is not None:
                    (entry / 'stat').write_text(stat)
                found = processes(self.home)
                self.assertEqual(found, [{'pid': 42, 'cwd': '/work/project',
                                         'tty': '/dev/pts/2', 'logs': set()}])

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

    def test_platform_binary_names_and_unrelated_programs(self):
        for name in ('codex', 'codex.exe', 'codex-x86_64-unknown-linux-musl', 'codex-aarch64-unknown-linux-gnu', 'codex (deleted)'):
            with self.subTest(name=name):
                self.assertTrue(is_codex_name(name))
        for name in ('node', 'my-codex-app', 'codex-farm', 'codex-helper', 'codexium'):
            with self.subTest(name=name):
                self.assertFalse(is_codex_name(name))

    def test_node_script_discovered_but_prompt_mentions_ignored(self):
        wrapper = self.proc_entry(12, 'node')
        (wrapper / 'cmdline').write_bytes(b'node\0/usr/lib/node_modules/@openai/codex/bin/codex.js\0private prompt\0')
        unrelated = self.proc_entry(13, 'node')
        (unrelated / 'cmdline').write_bytes(b'node\0server.js\0codex.js\0')
        self.assertEqual([p['pid'] for p in processes(self.home)], [12])

    def test_native_child_replaces_node_launcher_and_keeps_logs(self):
        wrapper = self.proc_entry(12, 'node')
        (wrapper / 'cmdline').write_bytes(b'node\0/usr/bin/codex\0')
        (wrapper / 'fd/3').symlink_to('/logs/root.jsonl')
        child = self.proc_entry(14)
        (child / 'stat').write_text('14 (codex (worker)) S 12 0 0')
        found = processes(self.home)
        self.assertEqual([p['pid'] for p in found], [14])
        self.assertEqual(found[0]['logs'], {'/logs/root.jsonl'})

    def test_missing_exe_uses_comm_and_missing_stdin_is_allowed(self):
        entry = self.proc_entry(12)
        (entry / 'exe').unlink()
        (entry / 'comm').write_text('codex\n')
        (entry / 'fd/0').unlink()
        found = processes(self.home)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]['tty'], '(no terminal)')

    def test_diagnostics_report_no_processes_without_curses(self):
        def no_processes(diagnostics):
            diagnostics.update(scanned=5, unreadable=2)
            return []
        with patch('farm.processes', side_effect=no_processes), patch('builtins.print') as output:
            diagnose(self.home)
        report = '\n'.join(call.args[0] for call in output.call_args_list)
        self.assertIn('Codex instances found: 0', report)
        self.assertIn('same Linux user', report)

    def test_qgenie_native_instances_discovered_helpers_excluded(self):
        self.proc_entry(20, 'codex-qgenie-native')
        self.proc_entry(21, 'codex-code-node-host')
        self.proc_entry(22, 'codex-linux-san')
        self.proc_entry(23, 'codex-linux-sandbox')
        self.assertEqual([p['pid'] for p in processes(self.home)], [20])

    def test_qgenie_node_launcher_deduplicated_host_scripts_excluded(self):
        wrapper = self.proc_entry(20, 'codex-qgenie-node')
        (wrapper / 'cmdline').write_bytes(b'codex-qgenie-node\0/local/qgenie-cli/codex-cli/bin/codex.js\0')
        self.assertEqual([p['pid'] for p in processes(self.home)], [20])
        child = self.proc_entry(21, 'codex-qgenie-native')
        (child / 'stat').write_text('21 (codex-qgenie-na) S 20 0 0')
        host = self.proc_entry(22, 'codex-qgenie-node')
        (host / 'cmdline').write_bytes(b'codex-qgenie-node\0/local/qgenie-cli/host/server.js\0')
        self.assertEqual([p['pid'] for p in processes(self.home)], [21])
