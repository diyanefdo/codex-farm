# Codex Farm

A small, read-only Linux terminal dashboard for Codex CLI sessions. Original ASCII farm scenery, warm terminal colors, a desk for each manager, and animated farmhands for agents and nested subagents. Inspired by cozy farming games; no game assets are used.

## Run

Requires Linux, Python 3.10+ with curses, and an interactive terminal. No pip dependencies.

```bash
cd /workspace/codex-farm
python3 farm.py --demo
python3 farm.py
```

On your own computer, copy this directory and run the same commands from it. Use a terminal at least 62 columns by 15 rows; 124+ columns displays two farms side by side. Your terminal palette controls the exact colors.

- `d`: switch between demo and live data
- `j` / `k` or arrows: scroll
- `r`: refresh
- `q`: quit

Custom log location and refresh interval:

```bash
python3 farm.py --codex-home ~/.codex --refresh 2
```

`CODEX_HOME` is also respected. Logs and processes are never modified. Task text is shown locally and can contain private project information.

## Live discovery and current limits

The dashboard discovers native `codex` executables, platform-specific binary names, and Node/Bun Codex CLI launchers through Linux `/proc`. QGenie `codex-qgenie-native` binaries and `codex-qgenie-node` CLI launchers are also supported. Code host processes and Linux sandbox helpers are excluded. A Node launcher and its native child appear as one instance. Missing working-directory or stdin links do not hide a detected process. It links an instance to a session only when that process has the session JSONL file open. If Codex closes the log between writes or `/proc` access is restricted, the process still appears with “Session log not linked”. It deliberately does not infer a link from the working directory, since several terminals can share one project. Custom wrappers with other script names may still need a discovery adapter.

Recent JSONL files (modified within 24 hours at discovery) under `sessions` and `archived_sessions` are parsed incrementally. Known files continue to be monitored. Agent trees use `session_meta.source.subagent.thread_spawn.parent_thread_id`; versions of Codex that omit this metadata cannot expose their agent hierarchy here. Tool calls and agent messages supply task labels. Worker states reflect log events, not CPU usage; a silent agent may still display its last task. The demo contains fictional activity and is always labeled.

This initial version has no controls for sending prompts, cancelling agents, or attaching to terminals. Large historical logs are read once at startup; very large session stores may make the first refresh slow.

## Troubleshooting discovery

Update your checkout and run the diagnostics while Codex is running:

```bash
git pull
python3 farm.py --diagnose
```

Diagnostics run without curses and report process counts, terminal availability, and log-file counts without printing command lines or prompt contents. If no instances are found, ensure both programs run as the same Linux user on the same host and in the same container or WSL distribution. The dashboard cannot discover processes on another machine or outside its PID namespace. Do not run the dashboard with sudo as a workaround.

If a manager appears with "Session log not linked", process discovery succeeded. Check `--codex-home` (or `CODEX_HOME`) points at your Codex log folder. Even with the correct folder, activity linking still requires an open JSONL file; this update does not remove that limitation.

## Check

The dependency-free unittest suite uses temporary logs and synthetic Linux process entries. It covers lifecycle events, tool argument parsing, corrupted and partial records, log truncation, discovery windows, process filtering, and nested agent grouping. It does not read your real Codex sessions or require an interactive terminal.

```bash
python3 -m unittest discover -s tests -v
```
