# Loomery: OpenCode Workbench

Loomery runs [OpenCode](https://opencode.ai) inside VS Code. It adds project-aware chat, parallel sessions, plan and change review, model and permission controls, commit-message generation, and usage reports.

**Supports OpenCode v2 and v1.** Loomery automatically detects the connected API and uses the same workbench for either version. OpenCode v2 is recommended.

OpenCode remains responsible for agents, providers, models, commands, skills, MCP servers, and their configuration. Loomery reads that configuration and provides a VS Code interface for it.

## Status

This is a personal dogfooding project, not a product. I build and use Loomery every day as my main way to run OpenCode inside VS Code, and it changes only as I hit problems or rough edges worth fixing.

- It is not published to the VS Code Marketplace, Open VSX, or any other registry, and there are no plans to publish it for now.
- There is no support promise, release cadence, or compatibility guarantee.
- Loomery is a fork of [Varro](https://github.com/koltyakov/varro) by Andrew Koltyakov. See [License](#license).

## Running locally

Build it from source, or package and install the VSIX into your own editor. There is no published build to install from a marketplace.

```sh
npm install
npm run build
```

Then pick one:

1. Open this repository in VS Code and press `F5` to launch an Extension Development Host with the extension loaded. `F5` starts the watchers first, so source edits rebuild and reload the host automatically.
2. Run `npm run dev` to watch the extension and webview and open the webview preview.
3. Run `npm run vscode:install` to package the current version and install the VSIX into the local VS Code-family editors found on `PATH`.

Install OpenCode on the host where Loomery runs. A native Windows VS Code window needs the Windows CLI; add it to `PATH` or set `loomery.server.command` to its executable path. A VS Code WSL window needs OpenCode installed inside that WSL distribution. Native OpenCode data is under `%USERPROFILE%\.local\share\opencode`; WSL uses the Linux data directory.

Already using v1? You can keep it, or install it with `npm install -g opencode-ai`. Set `loomery.server.command` to your v1 executable to select it explicitly. With this setting empty, Loomery searches for `opencode2` first, then `opencode`. Current v1 and v2 packages both install `opencode`, so the command name alone does not identify the version. Run `opencode --version` to check. See [choosing and updating OpenCode](docs/usage.md#choose-and-update-opencode) before switching versions.

> After switching from v1 to v2, you may need to run `Loomery: Restart Server` from the Command Palette. Installing v2 does not replace an already running v1 server. If restart fails or Loomery still shows v1, stop the old OpenCode process explicitly, especially on Windows, then restart with the v2 executable. Let active work finish first. See [restart recovery steps](docs/usage.md#if-restart-does-not-switch-to-v2) and confirm the connected version in Loomery's status bar.

Loomery supports VS Code and VSCodium. Support for other VS Code forks is limited; see [VS Code fork compatibility](docs/vscode-forks.md).

## Highlights

- Choose among the providers and models supported by OpenCode instead of tying the editor to one model vendor.
- Reuse OpenCode agents, commands, skills, MCP servers, and project instructions. The same configuration remains available in Loomery, the OpenCode TUI, and other OpenCode clients.
- Run multiple OpenCode sessions in the sidebar or editor tabs. Search, resume, fork, pin, share, export, archive, and recycle sessions.
- Follow streaming responses, reasoning, tool calls, questions, permissions, todos, plans, and file changes in one transcript. Routine completed work is grouped into expandable summaries.
- Include the current editor selection automatically. Attach files, folders, diagnostics, terminal output, images, PDFs, and references to other sessions.
- Queue follow-up prompts, steer an active run, or stop it and send a replacement.
- Set permissions per session to manual approval, automatic edit approval, rule or model-based approval, or full access.
- Select agents, providers, models, reasoning variants, and per-session MCP connections. Pin or hide models and inspect their known capabilities.
- Review changed files and optional inline diffs. Open completed plans or continue them in implementation sessions.
- Track context use, token counts, reported cost, and supported provider quotas. Generate cross-project usage reports with `/stats`.
- Generate a commit message from staged changes, or from unstaged changes when the index is empty. Loomery fills the Source Control input but does not stage or commit files.
- Use VS Code light, dark, and high-contrast themes. Chats work in the sidebar, a maximized sidebar, or side-by-side editor tabs.

## OpenCode feature coverage

`Workbench` means Loomery provides dedicated UI. `Integrated` means OpenCode performs the operation and Loomery exposes it. `Handoff` opens the relevant OpenCode or VS Code interface.

| Capability | Coverage | Support |
| --- | --- | --- |
| Sessions and history | Workbench | Create, search, resume, rename, pin, fork, share, export, recycle, and navigate root and child sessions. |
| Chat and tool calls | Workbench | Stream active output; keep failures, approvals, edits, and final responses visible; group routine work into expandable summaries. |
| Queue and steering | Workbench | Queue and reorder follow-ups, steer the active run, or stop it and send a replacement. |
| Files and multimodal input | Workbench | Attach files, folders, selections, terminal output, diagnostics, images, PDFs, and session references, subject to model support. |
| Permissions and questions | Workbench | Answer requests inline, choose a permission mode per session, and surface child-session approvals in the parent chat. |
| Providers and models | Workbench | Connect supported credentials, select models and reasoning variants, pin or hide models, and assign helper models. |
| MCP servers | Workbench | View OpenCode MCP servers and connect or disconnect them per session. |
| Plans and todos | Workbench | Track todos, open completed plans, continue into implementation, and run Ralph loops. |
| Agents and sub-agents | Integrated | Select or mention agents and follow delegated sessions. Agent definitions stay in OpenCode configuration. |
| Commands and skills | Integrated | Run built-in and custom slash commands, browse skills, and use compact, undo, redo, fork, and export actions. |
| Compaction and recovery | Integrated | Configure or run compaction, reconnect sessions, and recover from temporary transport failures. |
| LSP, formatters, and tools | Integrated | Show language-server status and tool activity. OpenCode owns definitions and execution. |
| Configuration and TUI | Handoff | Edit instruction files or continue a session in the OpenCode TUI. |

Coverage depends on the connected version. The supported v2 API has no session sharing or OpenCode LSP service. Loomery disables sharing on v2; VS Code Problems can still be attached as context. V2 session annotations are stored locally by Loomery. See [version differences and history import](docs/usage.md#version-differences-and-history).

## Sessions

Loomery filters sessions to the current workspace and groups them into `Recent`, `Archive`, and `Recycle Bin`. Filters identify `Running`, `Needs attention`, `Failed`, `Plan ready`, and `Completed` sessions. Rows can show queued prompts, changed files, added and removed lines, token use, duration, and current state.

Indicators at the top of the chat summarize activity in other sessions: a numbered spinner means running, blue means waiting for input or permission, red means failed, yellow means a plan is ready, and green means completed. Select an indicator to open the matching session or filter. Colors may vary with the active VS Code theme. See the [usage guide](docs/usage.md#sessions) for details.

OpenCode search covers loaded and older root sessions. Open any session in the sidebar, an editor tab, or the OpenCode TUI. Root sessions can be pinned, renamed, shared, or recycled. Child sessions remain linked to their parent. On wide layouts, the session list can remain beside the active chat.

When Loomery is hidden, VS Code notifications report plans, failures, permission requests, and questions from root sessions. The status bar links to sessions that need attention, then to completed background work.

### Desktop notifications

Enable OS banners with `loomery.notifications.native` and select sound events with the `loomery.notifications.sound` checkboxes. Both are off by default. Alerts cover permission requests, questions, completed replies, and plans ready for review. Alerts stay quiet while the originating VS Code window has focus; minimized or hidden windows allow alerts.

Notifications show `Project: <name>`, the chat title, and event details. Clicking opens the project's VS Code window. Bursts are grouped; automatically handled requests and old completions stay quiet.

Requires a local desktop host; remote SSH, WSL, and containers are unsupported. macOS uses `osascript` for banners and `afplay` for sound. Linux needs `notify-send` for banners and `paplay`, `aplay`, or `canberra-gtk-play` for sound. OS permissions and Focus/Do Not Disturb settings apply.

## Chat and context

Live document context includes the current editor selection by default; a file that is merely open without a selection is not attached. A chip in the composer shows this context and can disable it for the session. Use `Loomery: Add to Context` or `Cmd+Shift+K` / `Ctrl+Shift+K` to add files, folders, line ranges, or terminal output. You can also drag files and folders into the composer or paste images.

Type `@` to find workspace files and agents. Type `&` to reference a recent root session. The composer also shows active language servers, supports prompt history and undo or redo for attachments, and restores unsent text plus explicit file or folder attachments after a reload.

During a run, queue a follow-up, steer the current work, or stop it and send a replacement. Queued prompts can be reordered, paused, resumed, edited, retried, removed, or sent immediately as steering.

Commands stream their output. Failures, questions, approvals, file edits, and the final response remain visible. Completed routine work and thinking are grouped under summaries such as `Explored` and `Worked`. You can expand summaries, open long tool input or output in an editor, show thinking, or enable inline file previews.

Other chat workflows include rendered Mermaid previews, transcript turn navigation, changed-file links, Source Control handoff, reconnecting sessions after reload, and commands such as `/review`, `/compact`, `/export`, `/stats`, `/skills`, `/diagnostics`, `/fork`, and `/ralph`. Ralph runs support iteration, verification, repair, pause, and resume, and use `Full access`.

With OpenCode V2, `/pause` interrupts the current session run and pauses its queued messages in the current view. A `Paused` divider marks the transcript. Hover over it or focus its Resume button to continue; sending a new message or playing a queued message also continues the session. The divider then reads `Paused and resumed`. Pause markers survive reopening the session. This preserves the conversation but does not suspend an in-flight model response or tool operation for exact resumption.

Paused time is excluded from worked-duration summaries and usage statistics. Resuming starts a new work period, so returning hours later does not inflate the previous run's duration.

## Permissions

Permission requests provide `Reject`, `Once`, and `Always` actions. Each session has one of three modes:

- `Default` follows OpenCode and agent permission rules.
- `Auto` applies local rules and, when needed, a configured model. Requests it cannot decide remain available for manual approval.
- `Full access` allows the session to act without confirmation.

Child sessions inherit the nearest selected mode in their session tree. Manual child requests appear in the parent conversation while remaining owned by the child session.

Loomery initially selects `Auto` unless `loomery.chat.defaultPermissionMode` or a saved project/global selection says otherwise. `Default` follows the connected OpenCode version's global and agent rules. V2 uses ordered `permissions` rules with `action`, `resource`, and `effect`; supported v1-format rules remain accepted. See [v2 permissions](https://opencode.ai/v2/docs/permissions/) or [v1 permissions](https://opencode.ai/docs/permissions/) for syntax and defaults.

See the [Loomery permissions guide](docs/permissions.md) for mode behavior, manual approvals, and automatic review details.

## Models, providers, and MCP

The model picker reads providers and models from OpenCode. It displays known tool, reasoning, image, PDF, and context-window capabilities. You can pin or hide models and set local display names without changing OpenCode IDs.

The Models view connects supported API-key and OAuth credentials through OpenCode. It also provides reauthentication when a provider reports an expired or revoked credential. Terminal-based OpenCode setup remains available.

A tool-capable text-only model can delegate image analysis to an OpenCode sub-agent named `vision`. Assign that agent an image-capable model and include an exact `@vision` mention in the prompt. See [Add vision to a text-only model](docs/usage.md#add-vision-to-a-text-only-model).

For read-only investigation, define a primary agent named `ask` with explicit read and search permissions. See [Configure primary agents](docs/usage.md#configure-primary-agents).

MCP servers come from OpenCode configuration and can be connected or disconnected per session.

## Usage and limits

The composer shows context-window fill, and session rows show token use. The context popup separates input, output, reasoning, cache reads, cache writes, and sub-agent tokens. It also shows session cost when OpenCode reports it.

Run `/stats` or `Loomery: Usage Stats` for a Markdown report from retained OpenCode history across all projects. It covers token use and total assistant duration for today, 7 days, and 30 days, grouped by provider and model. `/stats all` adds all retained history.

Loomery shows quota windows, reset times, and available OpenAI/Codex or Z.ai usage-limit resets when supported provider endpoints supply them. Direct limit checks support OpenAI/Codex, GitHub Copilot, OpenRouter, xAI, Ollama Cloud, Z.ai, Kimi for Coding, and OpenCode Go. After a usage-limit error, you can stop retries or switch providers.

## Commit messages

Select the wand in the Source Control view title or next to the commit message input, or run `Loomery: Generate Commit Message`. While Loomery is generating, that control turns into a Cancel action; select it to stop. The view title action is always available; the input action relies on the proposed `contribSourceControlInputBoxMenu` API, so it appears only when Loomery is enabled for proposed APIs (add `quonaro.loomery` to `enable-proposed-api`); the Command Palette command works either way. Loomery uses staged changes if present; otherwise, it uses the unstaged working tree. It follows recent commit style when possible and writes the result to the selected repository's commit input for review.

Loomery never mixes staged and unstaged changes, stages files, or commits automatically. It asks before replacing an existing draft, detects source changes during generation, and omits its temporary helper session from chat history. On native Windows, untracked file paths are included but their contents are omitted because Loomery cannot guarantee an atomic no-follow read; tracked unstaged diffs are still included.

## Server and updates

Loomery selects and remembers a local port by default with `loomery.server.port: "auto"`. Existing verified servers survive extension updates and reloads without a migration restart. New managed servers require credentials. Set an integer port from 1 through 65535 for a fixed endpoint; explicit ports never silently fall back. For manual server management, set the port explicitly, disable the debug setting `loomery.server.autoStart` and start Loomery in attach-only mode, then run `opencode serve --port 4096`.

Attachment to a different OS user's listener, or one whose owner cannot be verified, requires confirmation before sessions or events are loaded, even with supplied credentials. This prevents accidental attachment; it does not secure an unauthenticated server against other clients. See [ownership and migration](docs/server-ownership.md).

The status bar shows the active OpenCode version and available updates. `loomery.server.autoUpdate` installs updates within the installed CLI family: `@opencode/cli` for v2 on Windows, macOS, and Linux, or `opencode-ai` for v1 on macOS and Linux. Updating v1 does not migrate it to v2. Native Windows v2 runs the resolved CLI's `update <latest-version>` command in the background and verifies the installed version; server restarts still wait for active work to finish and require Loomery ownership. Native Windows v1 shows an update prompt, waits for active work to finish, and stops a Loomery-managed server before opening the update command so Windows releases its lock on `opencode.exe`. Stop a separately managed server yourself before a prompted Windows update.

Loomery reloads global OpenCode configuration when OpenCode is idle. Changes to project configuration may require `Loomery: Restart Server`. This command waits for active work and only restarts a server managed by Loomery. Restart a manually launched server in its terminal.

## Requirements

- [VS Code](https://code.visualstudio.com/) or [VSCodium](https://vscodium.com/) 1.120 or newer
- [Node.js](https://nodejs.org/) 22.22.2+ on Node 22, or Node 24.15.0+
- [OpenCode v2 CLI](https://opencode.ai/v2/docs/) 2.0.5+ recommended, or [v1 CLI](https://opencode.ai/docs/) 1.16.0+, on `PATH` or configured through `loomery.server.command`
- A trusted, non-virtual workspace. Remote workspaces run Loomery and OpenCode on the remote extension host

## Documentation

- [Usage guide](docs/usage.md)
- [Docker Sandboxes with Remote SSH](docs/docker-sandboxes.md): suggested step-by-step setup for running Loomery and OpenCode inside a sandbox
- [Docker and remote servers](docs/docker-server.md): advanced setup with reduced functionality, not recommended for general use
- [Permissions guide](docs/permissions.md)
- [Configure primary agents](docs/usage.md#configure-primary-agents)
- [VS Code fork compatibility](docs/vscode-forks.md)
- [Development guide](docs/development.md)
- [Architecture overview](docs/architecture.md)

## License

MIT. Loomery is a fork of [Varro](https://github.com/koltyakov/varro) by Andrew Koltyakov.
