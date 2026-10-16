#!/usr/bin/env python3
"""Codex Farm: a read-only, dependency-free Linux terminal dashboard."""
import argparse
import curses
import json
import os
from pathlib import Path
import time
from dataclasses import dataclass, field


@dataclass
class Worker:
    id: str
    name: str = 'Farmer'
    task: str = 'Waiting for activity'
    state: str = 'idle'
    parent: str = ''


@dataclass
class Session:
    path: Path
    id: str = ''
    cwd: str = ''
    parent: str = ''
    worker: Worker = field(default_factory=lambda: Worker(''))
    offset: int = 0
    touched: float = 0

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
            self.id = p.get('id', self.id)
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
            if typ in ('task_started', 'turn_started'):
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
                    self.worker.state = 'working'
        elif kind == 'response_item' and p.get('type') == 'function_call':
            self.worker.state = 'working'
            name = p.get('name', 'tool')
            try:
                args = json.loads(p.get('arguments', '{}'))
                detail = args.get('cmd') or args.get('command') or args.get('description') or ''
            except (ValueError, TypeError):
                detail = ''
            self.worker.task = f'{name}: {detail}' if detail else name


def processes(proc=Path('/proc')):
    """Find native Codex executables; skip node launchers to avoid duplicates."""
    result = []
    for entry in proc.glob('[0-9]*'):
        try:
            exe = (entry / 'exe').readlink().name
            if exe not in ('codex', 'codex.exe'):
                continue
            cwd = str((entry / 'cwd').readlink())
            tty = str((entry / 'fd/0').readlink())
            logs = set()
            for fd in (entry / 'fd').iterdir():
                try:
                    target = str(fd.readlink())
                    if target.endswith('.jsonl'):
                        logs.add(target)
                except OSError:
                    pass
            result.append({'pid': int(entry.name), 'cwd': cwd, 'tty': tty, 'logs': logs})
        except OSError:
            continue
    return sorted(result, key=lambda p: p['pid'])


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

    def cards(self, procs):
        cards = []
        by_id = {s.id: s for s in self.sessions.values() if s.id}
        for p in procs:
            exact = [s for s in self.sessions.values() if str(s.path) in p['logs'] and not s.parent]
            # CWD alone is ambiguous: never attribute another terminal's work.
            root = max(exact, key=lambda s: s.touched) if exact else None
            workers = []
            if root:
                workers.append(root.worker)
                descendants = {root.id}
                while True:
                    new = {s.id for s in by_id.values() if s.parent in descendants} - descendants
                    if not new:
                        break
                    descendants |= new
                workers.extend(by_id[i].worker for i in sorted(descendants - {root.id}))
            else:
                workers = [Worker(str(p['pid']), 'Manager', 'Session log not linked; process is running', 'online')]
            cards.append((f"PID {p['pid']}  {p['tty'].replace('/dev/', '')}", p['cwd'], workers))
        return cards


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
    while True:
        now = time.monotonic()
        if now - last >= args.refresh:
            try:
                cards = monitor.cards(monitor.scan()) if not demo else demo_cards(tick)
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
        put(2, 2, ' |[]|    ' + ('DEMO WORLD' if demo else 'LIVE / LOCAL') + f'   {len(cards)} managers   {sum(len(c[2])-1 for c in cards)} farmhands', 3)
        put(3, 2, '~' * max(0, w - 5), 1)
        if w < 62 or h < 15:
            put(6, 2, 'Grow your terminal to at least 62 x 15.', 2)
        elif not cards:
            put(6, 4, 'The farm is quiet. No Codex processes found.', 2, True)
            put(8, 4, 'Start Codex in another terminal, or press d to explore the demo.')
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
                    lines = [(0, '+' + '-' * (width - 2) + '+', 1), (1, '|  ' + title, 2), (2, '|  ' + clean(cwd)[:width - 7], 4), (3, '|     .----.       MANAGER\'S DESK', 2), (4, '|     |____|       harvest in progress', 2), (5, '|     /|  |\\', 2)]
                    for index, worker in enumerate(workers):
                        yy = 7 + index * 4
                        active = worker.state == 'working'
                        sprite = 'o' if not active or tick % 2 == 0 else 'O'
                        color = 1 if active else 3 if worker.state == 'done' else 2
                        lines.extend([(yy, f'|   {sprite}    {worker.name}  [{worker.state}]', color), (yy+1, '|  /|\\   ' + clean(worker.task)[:width - 12], 4), (yy+2, '|  / \\   ' + ('* tending the code' if active else '. resting by the fence'), 1)])
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
        put(h-2, 2, error or ('Demo uses fictional activity.' if demo else 'Read-only. Agent links require session metadata; process links require open log files.'), 3)
        put(h-1, 2, '[q] quit   [d] demo/live   [j/k or arrows] scroll   [r] refresh', 2)
        stdscr.refresh()
        key = stdscr.getch()
        if key in (ord('q'), 27):
            break
        if key == ord('d'):
            demo, scroll, last = not demo, 0, 0
        elif key in (ord('j'), curses.KEY_DOWN):
            scroll += 3
        elif key in (ord('k'), curses.KEY_UP):
            scroll = max(0, scroll - 3)
        elif key == ord('r'):
            last = 0
        tick += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--demo', action='store_true', help='Show a fictional animated farm')
    parser.add_argument('--codex-home', type=Path, default=Path(os.environ.get('CODEX_HOME', '~/.codex')).expanduser())
    parser.add_argument('--refresh', type=float, default=2, help='Discovery interval in seconds (default: 2)')
    args = parser.parse_args()
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
