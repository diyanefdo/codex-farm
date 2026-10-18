"""Live offices require current processes; recorded sessions stay in history."""
from pathlib import Path
import unittest
from unittest.mock import patch

from farm import Session
from web_server import FarmState


class LiveSessionTests(unittest.TestCase):
    now = 200000

    def setUp(self):
        self.state = FarmState(Path('/synthetic-codex-home'))
        clock = patch('web_server.time.time', return_value=self.now)
        clock.start()
        self.addCleanup(clock.stop)

    def session(self, sid, age=0, cwd='/projects/orchard', parent='', thread_id=''):
        session = Session(Path('/synthetic-logs') / (sid + '.jsonl'), touched=self.now - age)
        metadata = {'id': sid, 'cwd': cwd}
        if thread_id:
            metadata['thread_id'] = thread_id
        if parent:
            metadata['source'] = {'subagent': {'thread_spawn': {'parent_thread_id': parent}}}
        session.consume({'type': 'session_meta', 'payload': metadata})
        session.consume({'type': 'event_msg', 'payload': {
            'type': 'user_message', 'message': 'Task for ' + sid,
        }})
        self.state.monitor.sessions[session.path] = session
        return session

    def process(self, pid, *sessions, start_ticks=1000, cwd='/projects/orchard'):
        process = {
            'pid': pid, 'tty': '/dev/pts/' + str(pid), 'cwd': cwd,
            'logs': {str(session.path) for session in sessions},
        }
        if start_ticks is not None:
            process['start_ticks'] = start_ticks
        return process

    def snapshot(self, processes, history=False):
        # Each call represents a completed new process scan, without waiting.
        self.state.last_scan = 0
        with patch.object(self.state.monitor, 'scan', return_value=processes):
            return self.state.snapshot(history=history)['farms']

    def test_four_current_processes_do_not_include_recent_or_old_log_offices(self):
        for index in range(12):
            self.session('recent-' + str(index), age=index * 30)
        for index in range(5):
            self.session('older-' + str(index), age=3600 + index)

        farms = self.snapshot([self.process(pid) for pid in range(10, 14)])

        self.assertEqual(len(farms), 4)
        self.assertEqual({farm['workers'][0]['id'] for farm in farms}, {'10', '11', '12', '13'})
        self.assertTrue(all(farm['source'] == 'process' and not farm['linked'] for farm in farms))

    def test_no_current_processes_means_empty_live_but_history_remains_available(self):
        self.session('recent', age=10)
        self.session('earlier-today', age=23 * 3600)
        self.session('too-old', age=25 * 3600)

        self.assertEqual(self.snapshot([]), [])
        history = self.snapshot([], history=True)

        self.assertEqual({farm['id'] for farm in history}, {'session:recent', 'session:earlier-today'})
        self.assertTrue(all(farm['source'] == 'session' and not farm['linked'] for farm in history))

    def test_confirmed_task_and_team_survive_log_descriptor_closing(self):
        root = self.session('root')
        self.session('child', parent='root')
        linked = self.snapshot([self.process(10, root)])[0]

        closed = self.snapshot([self.process(10)])[0]

        self.assertEqual(closed['id'], linked['id'])
        self.assertEqual(closed['workers'], linked['workers'])
        self.assertEqual({worker['id'] for worker in closed['workers']}, {'root', 'child'})
        self.assertTrue(closed['linked'])
        self.assertEqual(closed['source'], 'process')

    def test_exited_process_office_disappears_even_when_its_log_is_recent(self):
        root = self.session('root')
        self.assertEqual(len(self.snapshot([self.process(10, root)])), 1)

        self.assertEqual(self.snapshot([]), [])
        self.assertEqual([farm['id'] for farm in self.snapshot([], history=True)], ['session:root'])

    def test_reused_pid_does_not_inherit_previous_process_task(self):
        root = self.session('root')
        self.snapshot([self.process(10, root, start_ticks=1000)])

        farms = self.snapshot([self.process(10, start_ticks=2000)])

        self.assertEqual(len(farms), 1)
        self.assertFalse(farms[0]['linked'])
        self.assertEqual(farms[0]['workers'][0]['id'], '10')
        self.assertNotEqual(farms[0]['workers'][0]['task'], root.worker.task)

    def test_missing_process_start_time_prevents_remembering_a_closed_descriptor(self):
        root = self.session('root')
        self.assertTrue(self.snapshot([self.process(10, root, start_ticks=None)])[0]['linked'])

        farms = self.snapshot([self.process(10, start_ticks=None)])

        self.assertEqual(len(farms), 1)
        self.assertFalse(farms[0]['linked'])
        self.assertEqual(farms[0]['workers'][0]['id'], '10')

    def test_new_exact_session_descriptor_overrides_previous_confirmed_session(self):
        first = self.session('first')
        second = self.session('second', age=100)
        self.assertEqual(self.snapshot([self.process(10, first)])[0]['id'], 'session:first')

        switched = self.snapshot([self.process(10, second)])[0]
        closed = self.snapshot([self.process(10)])[0]

        self.assertEqual(switched['id'], 'session:second')
        self.assertEqual(closed['id'], 'session:second')
        self.assertEqual(closed['workers'][0]['task'], second.worker.task)

    def test_shared_working_directory_alone_does_not_attribute_recorded_tasks(self):
        self.session('first', cwd='/shared/project')
        self.session('second', cwd='/shared/project')

        farms = self.snapshot([self.process(10, cwd='/shared/project')])

        self.assertEqual(len(farms), 1)
        self.assertFalse(farms[0]['linked'])
        self.assertEqual(farms[0]['workers'][0]['id'], '10')
        self.assertEqual(farms[0]['directory'], '/shared/project')

    def test_child_process_joins_parent_office_using_thread_id_alias(self):
        root = self.session('root-session', thread_id='root-thread')
        child = self.session('child-session', parent='root-thread', thread_id='child-thread')

        farms = self.snapshot([self.process(10, root), self.process(11, child)])

        self.assertEqual([farm['id'] for farm in farms], ['session:root-session'])
        self.assertEqual({worker['id'] for worker in farms[0]['workers']}, {'root-session', 'child-session'})
        self.assertTrue(farms[0]['linked'])


if __name__ == '__main__':
    unittest.main()
