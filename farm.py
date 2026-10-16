#!/usr/bin/env python3
"""Codex Farm: a read-only, dependency-free Linux terminal dashboard."""
import argparse
import curses
from collections import Counter
import json
import os
import re
from pathlib import Path
import time
from dataclasses import dataclass, field, replace


@dataclass
class Worker:
    id: str
    name: str = 'Farmer'
    task: str = 'Waiting for activity'
    state: str = 'idle'
    parent: str = ''
    goal: str = ''


@dataclass
class Session:
    path: Path
    id: str = ''
    cwd: str = ''
    parent: str = ''
    worker: Worker = field(default_factory=lambda: Worker(''))
    offset: int = 0
    touched: float = 0
    thread_id: str = ''
    pending_spawns: dict = field(default_factory=dict)
    delegated: dict = field(default_factory=dict)

    def update(self):
        try:
            if self.path.stat().st_size < self.offset:
                self.offset = 0
            with self.path.open('rb') as stream:
                stream.seek(self.offset)
                while True:
                    line = stream.readline()
                    if not line or not line.endswith(b'\n'):
                        break
                    self.offset = stream.tell()
                    try:
                        self.consume(json.loads(line))
                    except (ValueError, TypeError, AttributeError):
                        pass
            self.touched = self.path.stat().st_mtime
        except OSError:
            pass

    def consume(self, event):
        p = event.get('payload') or {}
        kind = event.get('type')
        if kind == 'session_meta':
            self.id = p.get('id') or p.get('thread_id') or self.id
            self.thread_id = p.get('thread_id') or self.id
            self.cwd = p.get('cwd', self.cwd)
            source = p.get('source', {})
            if isinstance(source, dict):
                sub = source.get('subagent', {})
                if isinstance(sub, dict):
                    spawn = sub.get('thread_spawn', {})
                    if isinstance(spawn, dict):
                        self.parent = spawn.get('parent_thread_id', '')
            self.worker.id = self.id
            self.worker.parent = self.parent
            self.worker.name = p.get('agent_nickname') or ('Hand ' + self.id[:6] if self.parent else 'Manager')
        elif kind == 'event_msg':
            typ = p.get('type')
            if typ == 'collab_agent_spawn_begin':
                self.pending_spawns[p.get('call_id', '')] = {'message': p.get('prompt', '')}
            elif typ == 'collab_agent_spawn_end':
                self.record_spawn(p.get('call_id', ''), p.get('new_agent_id'), p)
            elif typ in ('task_started', 'turn_started'):
                self.worker.state = 'working'
            elif typ in ('task_complete', 'turn_complete'):
                self.worker.state = 'done'
            elif typ in ('turn_aborted', 'task_failed'):
                self.worker.state = 'paused'
            elif typ in ('agent_message', 'agent_reasoning', 'user_message'):
                msg = p.get('message') or p.get('text')
                if msg:
                    self.worker.task = str(msg)
                if typ == 'user_message':
                    self.worker.goal = str(msg or '')
                    self.worker.state = 'working'
        elif kind == 'response_item' and p.get('type') == 'message':
            content = p.get('content', [])
            text = ' '.join(str(part.get('text', '')) for part in content if isinstance(part, dict)) if isinstance(content, list) else ''
            if text and p.get('role') in ('user', 'assistant'):
                self.worker.task = text
                if p.get('role') == 'user':
                    self.worker.goal = text
                    self.worker.state = 'working'
        elif kind == 'response_item' and p.get('type') == 'function_call_output':
            call_id = p.get('call_id', '')
            if call_id in self.pending_spawns:
                try:
                    output = p.get('output', '{}')
                    result = json.loads(output) if isinstance(output, str) else output
                    if isinstance(result, dict):
                        self.record_spawn(call_id, result.get('agent_id') or result.get('thread_id') or result.get('id'), result)
                    else:
                        self.pending_spawns.pop(call_id, None)
                except (ValueError, TypeError):
                    self.pending_spawns.pop(call_id, None)
        elif kind == 'response_item' and p.get('type') == 'function_call':
            self.worker.state = 'working'
            name = p.get('name', 'tool')
            args = {}
            try:
                args = json.loads(p.get('arguments', '{}'))
                if not isinstance(args, dict):
                    args = {}
                detail = args.get('cmd') or args.get('command') or args.get('description') or ''
            except (ValueError, TypeError):
                detail = ''
            if name.rsplit('.', 1)[-1] in ('spawn_agent', 'spawn') and p.get('call_id'):
                self.pending_spawns[p['call_id']] = args
            self.worker.task = f'{name}: {detail}' if detail else name

    def record_spawn(self, call_id, agent_id, result):
        args = self.pending_spawns.pop(call_id, {})
        if not isinstance(agent_id, str) or not agent_id or result.get('error'):
            return
        task = args.get('message') or args.get('task') or args.get('prompt') or args.get('instructions') or result.get('prompt') or 'Delegated task; waiting for agent log'
        name = result.get('nickname') or args.get('name') or args.get('agent_type') or ('Hand ' + agent_id[:6])
        self.delegated[agent_id] = Worker(agent_id, str(name), str(task), 'delegated', self.id, str(task))


def is_codex_name(name):
    # Native npm, standalone installer, and distribution binary names.
    name = name.removesuffix(' (deleted)')
    if name in ('codex-qgenie-native', 'codex-qgenie-native.exe'):
        return True
    if name in ('codex-linux-san', 'codex-linux-sandbox'):
        return False
    return bool(re.fullmatch(r'codex(?:\.exe|-(?:x86_64|aarch64|arm64|linux)(?:[-.][A-Za-z0-9_]+)*)?', name))


def processes(proc=Path('/proc'), diagnostics=None):
    """Discover native binaries and Node CLI launchers without exposing prompts."""
    result, parents, wrappers = {}, {}, set()
    stats = diagnostics if diagnostics is not None else {}
    stats.update(scanned=0, unreadable=0)
    for entry in proc.glob('[0-9]*'):
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        stats['scanned'] += 1
        try:
            # stat's comm field may contain spaces or parentheses.
            fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            parents[pid] = int(fields[1])
        except (OSError, ValueError, IndexError):
            pass
        try:
            exe = (entry / 'exe').readlink().name
        except OSError:
            stats['unreadable'] += 1
            try:
                exe = (entry / 'comm').read_text().strip()
            except OSError:
                continue
        native = is_codex_name(exe)
        wrapper = False
        if not native and exe in ('node', 'nodejs', 'bun', 'bun.exe', 'codex-qgenie-node', 'codex-qgenie-node.exe'):
            try:
                argv = (entry / 'cmdline').read_bytes().decode(errors='replace').split('\0')
                # Match only the script position, never prompt arguments.
                script = next((arg for arg in argv[1:] if arg and not arg.startswith('-')), '')
                wrapper = Path(script).name in ('codex', 'codex.js', 'codex.mjs', 'codex.cjs')
            except OSError:
                pass
        if not (native or wrapper):
            continue
        if wrapper:
            wrappers.add(pid)
        try:
            cwd = str((entry / 'cwd').readlink())
        except OSError:
            cwd = '(working directory unavailable)'
        try:
            tty = str((entry / 'fd/0').readlink())
        except OSError:
            tty = '(no terminal)'
        logs = set()
        try:
            for fd in (entry / 'fd').iterdir():
                try:
                    target = str(fd.readlink())
                    if target.endswith('.jsonl'):
                        logs.add(target)
                except OSError:
                    pass
        except OSError:
            pass
        result[pid] = {'pid': pid, 'cwd': cwd, 'tty': tty, 'logs': logs}
    # npm's Node launcher and its native child represent one instance.
    for pid in list(result):
        if pid in wrappers:
            continue
        ancestor, seen = parents.get(pid), {pid}
        while ancestor and ancestor not in seen:
            seen.add(ancestor)
            if ancestor in wrappers and ancestor in result:
                result[pid]['logs'].update(result[ancestor]['logs'])
                del result[ancestor]
            ancestor = parents.get(ancestor)
    return [result[pid] for pid in sorted(result)]


def diagnose(home):
    stats = {}
    found = processes(diagnostics=stats)
    print('Codex Farm discovery diagnostics (no prompt text)')
    print(f'Linux /proc available: {Path("/proc/self").exists()}')
    print(f'Processes scanned: {stats["scanned"]}; executable links unreadable: {stats["unreadable"]}')
    print(f'Codex instances found: {len(found)}')
    for process in found:
        print(f'  PID {process["pid"]} | {clean(process["tty"])} | open JSONL logs: {len(process["logs"])}')
    print(f'Codex home exists: {home.is_dir()}')
    for folder in ('sessions', 'archived_sessions'):
        root = home / folder
        try:
            count = sum(1 for _ in root.rglob('*.jsonl')) if root.exists() else 0
            print(f'  {folder}: {count} JSONL files')
        except OSError:
            print(f'  {folder}: unreadable')
    if not found:
        print('Run alongside Codex as the same Linux user, in the same container/WSL environment.')
    elif not any(p['logs'] for p in found):
        print('Processes found, but no open session logs. Task linking may be unavailable.')


def schema_shape(value, depth=0):
    """Describe keys and types, never scalar values such as prompts or tokens."""
    if depth >= 5:
        return type(value).__name__
    if isinstance(value, dict):
        return {str(k): schema_shape(v, depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        return [schema_shape(value[0], depth + 1)] if value else []
    return type(value).__name__


def diagnose_agents(home):
    paths = []
    for folder in ('sessions', 'archived_sessions'):
        try:
            paths.extend((p.stat().st_mtime, p) for p in (home / folder).rglob('*.jsonl'))
        except OSError:
            continue
    print('Agent schema diagnostics: latest 8 logs; no prompt, argument, or result text.')
    for _, path in sorted(paths, key=lambda item: item[0], reverse=True)[:8]:
        session = Session(path)
        events, tools, results = Counter(), Counter(), Counter()
        metadata = {}
        try:
            with path.open('rb') as stream:
                for line in stream:
                    try:
                        event = json.loads(line)
                        if not isinstance(event, dict):
                            continue
                        payload = event.get('payload') or {}
                        if not isinstance(payload, dict):
                            continue
                        session.consume(event)
                        if event.get('type') == 'session_meta':
                            metadata = schema_shape(payload)
                        elif event.get('type') == 'event_msg':
                            events[str(payload.get('type', 'unknown'))] += 1
                        elif event.get('type') == 'response_item':
                            if payload.get('type') == 'function_call':
                                tools[str(payload.get('name', 'unknown'))] += 1
                            elif payload.get('type') == 'function_call_output':
                                output = payload.get('output')
                                try:
                                    output = json.loads(output) if isinstance(output, str) else output
                                except ValueError:
                                    pass
                                results[json.dumps(schema_shape(output), sort_keys=True)] += 1
                    except (ValueError, TypeError, AttributeError):
                        continue
        except OSError:
            continue
        # IDs are used for matching; all message, argument and result values are omitted.
        print(f'Session {session.id or "(missing ID)"}; parsed parent: {session.parent or "none"}; confirmed agents: {len(session.delegated)}')
        print('  metadata structure: ' + json.dumps(metadata, sort_keys=True))
        print('  event types: ' + json.dumps(events, sort_keys=True))
        print('  tool names: ' + json.dumps(tools, sort_keys=True))
        print('  result structures: ' + json.dumps(results, sort_keys=True))
    if not paths:
        print('No JSONL logs found. Check --codex-home.')


class Monitor:
    def __init__(self, home):
        self.home = home
        self.sessions = {}

    def scan(self):
        # Only load today's/recent logs initially; known logs stay tracked.
        cutoff = time.time() - 86400
        for folder in ('sessions', 'archived_sessions'):
            root = self.home / folder
            if not root.exists():
                continue
            for path in root.rglob('*.jsonl'):
                try:
                    if path.stat().st_mtime >= cutoff:
                        self.sessions.setdefault(path, Session(path))
                except OSError:
                    pass
        for session in self.sessions.values():
            session.update()
        return processes()

    def identities(self):
        aliases = {s.id: s.id for s in self.sessions.values() if s.id}
        aliases.update({s.thread_id: s.id for s in self.sessions.values() if s.id and s.thread_id})
        return aliases

    def parent_links(self):
        aliases = self.identities()
        links = {s.id: aliases.get(s.parent, s.parent) for s in self.sessions.values() if s.id and s.parent}
        for session in self.sessions.values():
            for agent_id in session.delegated:
                agent_id = aliases.get(agent_id, agent_id)
                if session.id and agent_id != session.id:
                    links.setdefault(agent_id, session.id)
        return links

    def workers_for(self, root):
        by_id = {s.id: s for s in self.sessions.values() if s.id}
        links = self.parent_links()
        aliases = self.identities()
        delegated = {aliases.get(aid, aid): worker for s in self.sessions.values() for aid, worker in s.delegated.items()}
        descendants = {root.id}
        while True:
            new = {aid for aid, parent in links.items() if parent in descendants} - descendants
            if not new:
                break
            descendants |= new
        workers = [root.worker]
        for aid in sorted(descendants - {root.id}):
            if aid in by_id:
                worker = by_id[aid].worker
                if worker.name == 'Manager':
                    worker = replace(worker, name=delegated[aid].name if aid in delegated else 'Hand ' + aid[:6])
                workers.append(worker)
            elif aid in delegated:
                workers.append(delegated[aid])
        return workers

    def cards(self, procs, sessions_only=False):
        process_cards, linked = [], set()
        parents = self.parent_links()
        for p in procs:
            exact = [s for s in self.sessions.values() if str(s.path) in p['logs'] and s.id not in parents]
            # CWD alone is ambiguous: never attribute another terminal's work.
            root = max(exact, key=lambda s: s.touched) if exact else None
            if root:
                linked.add(root.id)
                workers = self.workers_for(root)
            else:
                workers = [Worker(str(p['pid']), 'Manager', 'Process online; task activity is in LOG cards / [s] session view', 'online')]
            process_cards.append((f"PID {p['pid']}  {p['tty'].replace('/dev/', '')}", p['cwd'], workers))
        # A log is useful even when the writer has closed its file descriptor.
        # Keep these separate from process cards: modification time cannot prove PID identity.
        cutoff = time.time() - (86400 if sessions_only else 900)
        roots = [s for s in self.sessions.values() if s.id and s.id not in parents and s.touched >= cutoff
                 and (sessions_only or s.id not in linked)]
        roots.sort(key=lambda s: s.touched, reverse=True)
        log_cards = []
        for root in roots:
            age = max(0, int(time.time() - root.touched))
            label = 'session history' if sessions_only else 'PID unverified'
            log_cards.append((f'LOG {root.id[:8]} / {age}s ago / {label}', root.cwd or '(directory not recorded)', self.workers_for(root)))
        return log_cards if sessions_only else log_cards + process_cards


def demo_cards(tick):
    tasks = ['Reading the codebase', 'Implementing session discovery', 'Running the test suite', 'Reviewing the changes']
    return [
        ('PID 2048  pts/1', '~/projects/orchard', [Worker('a', 'Manager', 'Building the authentication flow', 'working'), Worker('b', 'Robin', tasks[(tick // 6) % 4], 'working'), Worker('c', 'Juniper', 'Adding login form validation', 'working'), Worker('d', 'Moss', 'Tests passed. Ready for review.', 'done')]),
        ('PID 3096  pts/3', '~/projects/market', [Worker('e', 'Manager', 'Planning the inventory dashboard', 'working'), Worker('f', 'Clover', 'Waiting for the next task', 'idle')]),
        ('PID 4120  pts/5', '~/projects/homestead', [Worker('g', 'Manager', 'Documentation updated', 'done')]),
    ]


def clean(text):
    return ' '.join(str(text).split())


def draw(stdscr, args):
    curses.curs_set(0)
    stdscr.timeout(250)
    if curses.has_colors():
        curses.start_color()
        curses.use_default_colors()
        for i, color in enumerate((curses.COLOR_GREEN, curses.COLOR_YELLOW, curses.COLOR_CYAN, curses.COLOR_WHITE, curses.COLOR_MAGENTA), 1):
            curses.init_pair(i, color, -1)
    def put(y, x, text, color=4, bold=False):
        h, w = stdscr.getmaxyx()
        if 0 <= y < h and 0 <= x < w - 1:
            try:
                stdscr.addnstr(y, x, text, w - x - 1, (curses.color_pair(color) if curses.has_colors() else 0) | (curses.A_BOLD if bold else 0))
            except curses.error:
                pass
    monitor = Monitor(args.codex_home)
    tick, scroll, last = 0, 0, 0
    cards, error = [], ''
    demo = args.demo
    sessions_only = args.sessions
    while True:
        now = time.monotonic()
        if now - last >= args.refresh:
            try:
                cards = monitor.cards(monitor.scan(), sessions_only=sessions_only) if not demo else demo_cards(tick)
                error = ''
            except OSError as exc:
                error = str(exc)
            last = now
        if demo:
            cards = demo_cards(tick)
        stdscr.erase()
        h, w = stdscr.getmaxyx()
        put(0, 2, r'  /\     CODEX FARM', 2, True)
        put(1, 2, r' /__\    A little homestead for your agents', 1)
        put(2, 2, ' |[]|    ' + ('DEMO WORLD' if demo else 'SESSION LOGS' if sessions_only else 'LIVE / LOCAL') + f'   {len(cards)} farms   {sum(len(c[2])-1 for c in cards)} farmhands', 3)
        put(3, 2, '~' * max(0, w - 5), 1)
        if w < 62 or h < 15:
            put(6, 2, 'Grow your terminal to at least 62 x 15.', 2)
        elif not cards:
            put(6, 4, 'No recent activity found. Press s for session history.', 2, True)
            put(8, 4, 'Start Codex here, or press d for demo. Diagnose: --diagnose')
            put(10, 4, f'Logs: {args.codex_home}')
        else:
            cols = 2 if w >= 124 else 1
            width = (w - 5) // cols
            # Build a virtual canvas so tall farms and large agent trees scroll.
            blocks = []
            y = 5
            for start in range(0, len(cards), cols):
                row = cards[start:start + cols]
                height = max(9 + len(c[2]) * 4 for c in row)
                for col, (title, cwd, workers) in enumerate(row):
                    x = 2 + col * (width + 1)
                    lines = [(0, '+' + '-' * (width - 2) + '+', 1), (1, '|  ' + title, 2), (2, '|  ' + clean(cwd)[:width - 7], 4), (3, '|     .----.       MANAGER\'S DESK', 2), (4, '|     |____|       session activity' if title.startswith('LOG ') else '|     |____|       terminal instance', 2), (5, '|     /|  |\\', 2)]
                    for index, worker in enumerate(workers):
                        yy = 7 + index * 4
                        active = worker.state == 'working'
                        sprite = 'o' if not active or tick % 2 == 0 else 'O'
                        color = 1 if active else 3 if worker.state == 'done' else 2
                        lines.extend([(yy, f'|   {sprite}    {worker.name}  [{worker.state}]', color), (yy+1, '|  /|\\   ' + clean(worker.task)[:width - 12], 4), (yy+2, '|  / \\   ' + (('Goal: ' + clean(worker.goal))[:width - 12] if worker.goal else '* tending the code' if active else '. resting by the fence'), 1)])
                    lines.append((height-1, '+' + '-' * (width - 2) + '+', 1))
                    for dy in range(1, height-1):
                        blocks.append((y+dy, x+width-1, '|', 1))
                    for dy, text, color in lines:
                        blocks.append((y+dy, x, text[:width], color))
                y += height + 1
            scroll = min(scroll, max(0, y - h + 3))
            for yy, xx, text, color in blocks:
                screen_y = yy - scroll
                if 5 <= screen_y < h-2:
                    put(screen_y, xx, text, color)
        put(h-2, 2, error or ('Demo uses fictional activity.' if demo else 'LOG cards show recorded activity; PID unverified means no terminal link. [s] history'), 3)
        put(h-1, 2, '[q] quit  [d] demo/live  [s] sessions  [j/k or arrows] scroll  [r] refresh', 2)
        stdscr.refresh()
        key = stdscr.getch()
        if key in (ord('q'), 27):
            break
        if key == ord('d'):
            demo, scroll, last = not demo, 0, 0
        elif key == ord('s'):
            sessions_only, scroll, last = not sessions_only, 0, 0
        elif key in (ord('j'), curses.KEY_DOWN):
            scroll += 3
        elif key in (ord('k'), curses.KEY_UP):
            scroll = max(0, scroll - 3)
        elif key == ord('r'):
            last = 0
        tick += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--diagnose-agents', action='store_true', help='Report recent agent event schemas without message text')
    parser.add_argument('--diagnose', action='store_true', help='Print discovery diagnostics without opening the UI')
    parser.add_argument('--sessions', action='store_true', help='Show session-log activity from the last 24 hours, without PID linking')
    parser.add_argument('--demo', action='store_true', help='Show a fictional animated farm')
    parser.add_argument('--codex-home', type=Path, default=Path(os.environ.get('CODEX_HOME', '~/.codex')).expanduser())
    parser.add_argument('--refresh', type=float, default=2, help='Discovery interval in seconds (default: 2)')
    args = parser.parse_args()
    if args.diagnose_agents:
        diagnose_agents(args.codex_home)
        return
    if args.diagnose:
        diagnose(args.codex_home)
        return
    if args.refresh < .25:
        parser.error('--refresh must be at least 0.25')
    try:
        curses.wrapper(draw, args)
    except KeyboardInterrupt:
        pass
    except curses.error as exc:
        parser.exit(1, f'Terminal unavailable: {exc}. Run this in an interactive Linux terminal.\n')


if __name__ == '__main__':
    main()
