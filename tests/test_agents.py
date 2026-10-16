"""Only confirmed delegations produce farmhands; logged agents supply live tasks."""
from pathlib import Path
import json
import time
import unittest

from farm import Monitor, Session


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.monitor = Monitor(Path('/unused'))
        self.root = self.session('root')

    def session(self, sid):
        s = Session(Path('/' + sid + '.jsonl'), touched=time.time())
        s.consume({'type': 'session_meta', 'payload': {'id': sid}})
        self.monitor.sessions[s.path] = s
        return s

    def spawn(self, session, agent_id='child', name='spawn_agent', output=None):
        session.consume({'type': 'response_item', 'payload': {'type': 'function_call', 'call_id': 'call-1', 'name': name, 'arguments': json.dumps({'agent_type': 'explorer', 'message': 'Inspect authentication'})}})
        session.consume({'type': 'response_item', 'payload': {'type': 'function_call_output', 'call_id': 'call-1', 'output': json.dumps({'agent_id': agent_id} if output is None else output)}})

    def test_confirmed_spawn_without_child_log_shows_delegated_task(self):
        self.spawn(self.root, name='functions.spawn_agent')
        workers = self.monitor.workers_for(self.root)
        self.assertEqual([w.id for w in workers], ['root', 'child'])
        self.assertEqual((workers[1].name, workers[1].task, workers[1].state), ('explorer', 'Inspect authentication', 'delegated'))

    def test_request_alone_or_failed_result_does_not_invent_agent(self):
        self.root.consume({'type': 'response_item', 'payload': {'type': 'function_call', 'call_id': 'c', 'name': 'spawn_agent', 'arguments': '{}'}})
        self.assertEqual(len(self.monitor.workers_for(self.root)), 1)
        self.spawn(self.root, output={'error': 'agent limit reached'})
        self.assertEqual(len(self.monitor.workers_for(self.root)), 1)

    def test_child_without_parent_metadata_uses_live_log_and_is_not_another_manager(self):
        self.spawn(self.root)
        child = self.session('child')
        child.consume({'type': 'event_msg', 'payload': {'type': 'agent_message', 'message': 'Reading auth.py'}})
        workers = self.monitor.workers_for(self.root)
        self.assertEqual(len(workers), 2)
        self.assertEqual(workers[1].task, 'Reading auth.py')
        self.assertEqual(workers[1].name, 'explorer')
        self.assertEqual(child.worker.name, 'Manager')  # Render labels do not mutate logs.
        self.assertEqual(len(self.monitor.cards([], sessions_only=True)), 1)

    def test_nested_delegations_group_under_original_manager(self):
        self.spawn(self.root)
        child = self.session('child')
        self.spawn(child, 'grandchild')
        workers = self.monitor.workers_for(self.root)
        self.assertEqual({w.id for w in workers}, {'root', 'child', 'grandchild'})
        self.assertEqual(len(self.monitor.cards([], sessions_only=True)), 1)

    def test_metadata_and_spawn_result_do_not_duplicate_worker(self):
        self.spawn(self.root)
        child = self.session('child')
        child.parent = 'root'
        self.assertEqual([w.id for w in self.monitor.workers_for(self.root)], ['root', 'child'])

    def test_collaboration_events_show_confirmed_agent(self):
        self.root.consume({'type': 'event_msg', 'payload': {'type': 'collab_agent_spawn_begin', 'call_id': 'c', 'prompt': 'Review tests'}})
        self.assertEqual(len(self.monitor.workers_for(self.root)), 1)
        self.root.consume({'type': 'event_msg', 'payload': {'type': 'collab_agent_spawn_end', 'call_id': 'c', 'new_agent_id': 'reviewer'}})
        workers = self.monitor.workers_for(self.root)
        self.assertEqual(workers[1].id, 'reviewer')
        self.assertEqual(workers[1].task, 'Review tests')

    def test_cyclic_links_terminate(self):
        self.spawn(self.root)
        child = self.session('child')
        self.spawn(child, 'root')
        self.assertEqual(len(self.monitor.workers_for(self.root)), 2)

    def test_qgenie_spawn_tool_groups_child_without_parent_metadata(self):
        for tool in ('spawn', 'functions.spawn'):
            for key in ('agent_id', 'thread_id', 'id'):
                with self.subTest(tool=tool, key=key):
                    self.setUp()
                    self.spawn(self.root, name=tool, output={key: 'child'})
                    self.session('child')
                    cards = self.monitor.cards([], sessions_only=True)
                    self.assertEqual(len(cards), 1)
                    self.assertEqual([w.id for w in cards[0][2]], ['root', 'child'])

    def test_qgenie_thread_id_alias_matches_child_session_id(self):
        self.spawn(self.root, name='spawn', output={'thread_id': 'child-thread'})
        child = self.session('child-session')
        child.consume({'type': 'session_meta', 'payload': {'id': 'child-session', 'thread_id': 'child-thread'}})
        self.assertEqual([w.id for w in self.monitor.workers_for(self.root)], ['root', 'child-session'])
        self.assertEqual(len(self.monitor.cards([], sessions_only=True)), 1)

    def test_spawn_prompt_is_shown_as_assignment(self):
        self.root.consume({'type': 'response_item', 'payload': {'type': 'function_call', 'call_id': 'c', 'name': 'spawn', 'arguments': '{"prompt":"Review auth"}'}})
        self.root.consume({'type': 'response_item', 'payload': {'type': 'function_call_output', 'call_id': 'c', 'output': '{"agent_id":"child"}'}})
        self.assertEqual(self.monitor.workers_for(self.root)[1].task, 'Review auth')
