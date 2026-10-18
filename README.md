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

The app refreshes every two seconds. The farm environment fills the entire browser window, with compact floating controls, search, and a task inspector overlay. One shared pixel-art homestead contains manager offices connected by a village lane. Each office has its own colorful theme, a manager desk, and an individual desk for every recorded agent or subagent. A compact text preview beneath each person shows current or last-recorded work, with labels for active, completed, paused, and assigned tasks. Click a desk to read the full task when the preview is shortened. Offices use a compact desk grid and grow as teams expand; every team member gets a desk, including large teams. The number of office columns adapts to the window, and automatic overview fits all offices within one screen. Newly observed agents take the next desk, and offices retain their order as status updates arrive. Click an office heading to inspect the team or click a desk for that person’s task, original request, and session ID. All desks can be reached with the keyboard. Use + or − to zoom in for detail; Fit restores the automatic all-offices overview and resets any previous scrolling. The overview refits when teams change or the window is resized. Clicking any desk opens full-size task details even when many offices make the map text small. Search, activity filters, and session history are available. Working managers and agents visibly type, sway, stretch, and briefly pace at their desks in staggered animation cycles. Idle, completed, paused, and unconfirmed/delegated characters stay still. Animation follows recorded status events rather than CPU usage. Use **Motion on/off** to pause it; system reduced-motion preferences disable it automatically. The initial camera fits the full shared map in both dimensions. For large teams or small windows, zoom in or open a desk’s full-size task details for readable text. An open break lounge, lunch area, and coffee corner blend directly into the shared environment, with furniture and subtle labels rather than enclosing walls or floor panels. They contain sofas, dining tables, an espresso machine, cups, plants, books, and seated decorative coworkers. These people are scenery and are excluded from manager/agent counts; named tracked workers retain their desk and task preview. Coffee steam respects the motion setting. Automatic Fit includes all three common areas. The dashboard displays recorded delegations and does not create agents itself.

**Live farm** shows only currently discovered Codex processes, grouped by confirmed manager session. Historical logs do not create extra live offices. When a process exits, its office disappears on a subsequent refresh. **Session history** explicitly shows recorded root sessions from the last 24 hours, including closed sessions. A recorded worker state is not proof that the worker is still running.

The server retains confirmed process-to-session links while the same PID and Linux process start time remain present, so task details survive a log file being closed between writes. Fresh log matches replace the previous link; process exits and PID reuse invalidate it. A newly started dashboard may show a running manager without task details until an open log is observed. Such an office is labeled unlinked; use Session history for recorded tasks. A shared directory or recently modified log alone never proves a live association. Spawned processes with known parent sessions are grouped into their manager’s office.

**Explore demo** displays explicitly labeled fictional data; Live farm never falls back to it. QGenie discovery and the `spawn` / `spawn_agent` grouping adapters are included.

The Python backend reads `/proc` and the configured local session logs. The browser calls its same-origin `/api/status` endpoint; a standalone hosted page cannot read your PC's processes. No remote fonts, analytics, assets, or services are required. The server binds only to `127.0.0.1`, rejects foreign hosts/origins, has no execution or write API, and does not send CORS permissions. Task text may contain private project information, so keep it local. To monitor a remote machine, use an SSH local tunnel rather than exposing the service publicly.

## Updating and accessing over SSH

Stop the old Python server with Ctrl+C, then update and restart it on Linux:

```bash
git switch web-app
git pull
python3 web_server.py
```

For a Windows browser connected to the Linux machine over SSH, keep this PowerShell command running (substitute your normal SSH login):

```powershell
ssh -N -L 8765:127.0.0.1:8765 your-user@linux-host
```

Then open http://127.0.0.1:8765 in the Windows browser. The Python server continues to read the Linux machine’s processes and logs. No server bind-address change is needed.

If the Windows port is busy, choose a different local port while keeping the Linux destination unchanged:

```powershell
ssh -N -L 9876:127.0.0.1:8765 your-user@linux-host
```

Open http://127.0.0.1:9876 for that tunnel. Loopback browser addresses (`127.0.0.1`, `localhost`, or `[::1]`) can use any valid local forwarded port. If you see "Local requests only", update and restart the Linux server, and use the localhost address in Windows rather than a Linux hostname or external proxy URL. Opening the page from a link is supported; foreign-origin requests to the status API remain blocked.

## If the farm cannot load

The banner distinguishes network/SSH connection failures, HTTP status errors, invalid JSON, and scene-rendering errors. The first live log scan has a 30-second timeout; subsequent requests use eight seconds. Failed scene updates are retried even when the next status payload is unchanged.

Open `/api/status` on the same browser address (for example, http://127.0.0.1:8765/api/status) to check the raw response. `?demo=1` checks the API without reading real sessions. A working demo response with a failing live response points to the local status reader or log scan rather than the tunnel. Unexpected reader errors return a sanitized HTTP 500 JSON response with the exception class; prompts and private paths are not included.

## Web checks

```bash
python3 -m unittest discover -s tests -v
node tests/test_layout.cjs
node tests/test_motion.cjs
node tests/test_commons.cjs
node tests/test_shared_ui.cjs
```

The Python suite checks API routing, stable session identity across process/log transitions, demo isolation, origin rejection, file traversal, and session/agent serialization. The JavaScript layout tests cover office separation, individual desks for large teams, and additions/removals. The UI integration checks run the actual browser scripts with a small DOM/canvas substitute to verify desk selection, polling, focus retention, zoom, and the actual draw commands changing only for working characters. Motion tests check typing/stretching/pacing poses and reduced-motion behavior. They do not check browser rendering. Node is needed only to run JavaScript checks, not to run the app. Browser visual QA is not part of the automated suite.

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
