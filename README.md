# Codex Farm — Local Web App

This `web-app` branch adds a local browser dashboard on top of the `qgenie` branch. It preserves its process discovery, session activity, and agent-grouping logic. `main` and `qgenie` remain separate terminal versions.

## Start the web app

Requires Linux and Python 3.10+; no pip packages, npm build, or cloud accounts needed.

```bash
git fetch origin
git switch web-app
python3 web_server.py
```

Open **http://127.0.0.1:8765** in a browser on that PC. Keep the server running and start Codex in another terminal as the same Linux user. Press Ctrl+C to stop the server.

```bash
# Optional: choose the log folder or another local port.
python3 web_server.py --codex-home ~/.codex --port 8766
```

The app refreshes every two seconds. It has original pixel-art cottages, orchards, crops, a pond, an outdoor manager desk, and animated farmers. Each worker represents an actual recorded agent; no agents are created by the dashboard. Large teams show up to eleven characters in the scene and every member in the task list. Click a farm to inspect full tasks, original requests, and session IDs. Search, activity filters, and session history are available in the browser. Reduced-motion preferences disable sprite animation.

**Explore demo** displays explicitly labeled fictional data. Live mode never falls back to demo data. Recent unlinked LOG cards show recorded events from the last 15 minutes; **Session history** shows the last 24 hours. A recorded session state is not proof an agent is still running. Process cards remain separate when PID attribution cannot be proven. QGenie discovery and the `spawn` / `spawn_agent` grouping adapters are included.

The Python backend reads `/proc` and the configured local session logs. The browser calls its same-origin `/api/status` endpoint; a standalone hosted page cannot read your PC's processes. No remote fonts, analytics, assets, or services are required. The server binds only to `127.0.0.1`, rejects foreign hosts/origins, has no execution or write API, and does not send CORS permissions. Task text may contain private project information, so keep it local. To monitor a remote machine, use an SSH local tunnel rather than exposing the service publicly.

Validation: the Python suite includes API routing, demo isolation, origin rejection, no-file-traversal checks, and session/agent serialization. Browser visual QA is not part of the automated suite.

The original terminal version and its commands are documented below.


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
- `s`: toggle session-log history (last 24 hours)
- `j` / `k` or arrows: scroll
- `r`: refresh
- `q`: quit

Custom log location and refresh interval:

```bash
python3 farm.py --codex-home ~/.codex --refresh 2
```

`CODEX_HOME` is also respected. Logs and processes are never modified. Task text is shown locally and can contain private project information.

## Live discovery and current limits

The dashboard discovers native `codex` executables, platform-specific binary names, and Node/Bun Codex CLI launchers through Linux `/proc`. QGenie `codex-qgenie-native` binaries and `codex-qgenie-node` CLI launchers are also supported. Code host processes and Linux sandbox helpers are excluded. A Node launcher and its native child appear as one instance. Missing working-directory or stdin links do not hide a detected process. It links an instance to a session only when that process has the session JSONL file open. Independently, LOG cards at the top show unlinked root sessions modified within the last 15 minutes, including their task, tool call, original prompt, and nested agents. They are labeled PID unverified because a log alone does not identify its terminal. Press `s` or start with `python3 farm.py --sessions` to view logs from the last 24 hours, newest first, without process cards. These are recorded session states, not proof that a process is still running. If Codex closes the log between writes or `/proc` access is restricted, the process still appears with a pointer to the LOG cards. It deliberately does not infer a link from the working directory, since several terminals can share one project. Custom wrappers with other script names may still need a discovery adapter.

Recent JSONL files (modified within 24 hours at discovery) under `sessions` and `archived_sessions` are parsed incrementally. Known files continue to be monitored. Agent trees use `session_meta.source.subagent.thread_spawn.parent_thread_id`; confirmed `spawn_agent` or QGenie `spawn` tool results and `collab_agent_spawn_begin` / `collab_agent_spawn_end` events also establish agent relationships when metadata is missing. A worker with state `delegated` shows its confirmed assignment; live task and lifecycle updates require its own log. Failed or unconfirmed spawn requests do not create workers. Tool calls and agent messages supply task labels. Worker states reflect log events, not CPU usage; a silent agent may still display its last task. The demo contains fictional activity and is always labeled.

This initial version has no controls for sending prompts, cancelling agents, or attaching to terminals. Large historical logs are read once at startup; very large session stores may make the first refresh slow.

## Where are the team members?

A normal Codex turn can run entirely in the manager. Farmhands represent actual delegated agents; the dashboard does not create them. If your Codex build supports agents, ask it to delegate explicitly, for example: "Use two subagents: one to inspect the implementation and one to review the tests."

After Codex confirms delegation, use `python3 farm.py --sessions` to see the team under its LOG manager. Relationships come from parent-session metadata, confirmed JSON `spawn_agent` / `spawn` results containing `agent_id`, `thread_id`, or `id` (including namespaced tools such as `functions.spawn`), or collaboration spawn events containing `new_agent_id`. Metadata `thread_id` values are matched to session IDs when a fork uses different identifiers for them. The child log supplies further activity when available. Custom QGenie formats may require another adapter; process detection alone does not guarantee its fork emits compatible delegation events.

If a delegated agent appears as another manager, run `python3 farm.py --diagnose-agents`. This prints schemas from the eight most recently modified logs: metadata keys and value types, event and tool names, parsed session IDs, and counts of confirmed agents. It omits message text, tool argument values, and tool result values. Share that output to identify an unsupported fork-specific relationship format. Sessions cannot be grouped safely from a shared directory or similar task text alone.

## Troubleshooting discovery

Update your checkout and run the diagnostics while Codex is running:

```bash
git pull
python3 farm.py --diagnose
```

Diagnostics run without curses and report process counts, terminal availability, and log-file counts without printing command lines or prompt contents. If no instances are found, ensure both programs run as the same Linux user on the same host and in the same container or WSL distribution. The dashboard cannot discover processes on another machine or outside its PID namespace. Do not run the dashboard with sudo as a workaround.

If a manager shows only "Process online", process discovery succeeded. Look for LOG cards at the top or press `s` for session history. Check `--codex-home` (or `CODEX_HOME`) points at the log folder used by your Codex installation if no LOG cards appear. Exact process-to-session attribution still requires an open JSONL file, but displaying log activity does not. Custom Codex forks must write the supported session metadata and event formats.

## Check

The dependency-free unittest suite uses temporary logs and synthetic Linux process entries. It covers lifecycle events, tool argument parsing, corrupted and partial records, log truncation, discovery windows, process filtering, and nested agent grouping. It does not read your real Codex sessions or require an interactive terminal.

```bash
python3 -m unittest discover -s tests -v
```
