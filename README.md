# SCODE

**Fast, persistent coding CLI for AI workflows.**

SCODE is a free and open-source terminal runtime for coding work. It can read and edit files, run commands, keep sessions alive, connect MCP tools, and work with cloud or local models.

**macOS · Windows · Linux**

## Install

Requires Node.js 24+.

```bash
npm install -g https://sidra-ai.com/scode/scode-1.0.2.tgz
```

Then run:

```bash
scode
```

That's it.

## Quick use

Open the terminal UI:

```bash
scode
```

Run one prompt:

```bash
scode -p "inspect this project and explain the architecture"
```

Run in another workspace:

```bash
scode --cwd /path/to/project
```

Continue the latest session for the current directory:

```bash
scode --continue
```

Useful commands inside SCODE:

```text
/model
/effort
/help
/compact
/new
/resume
/rewind
```

## Why SCODE

SCODE keeps the execution runtime close to the code while keeping the reasoning layer replaceable.

- Persistent workspace sessions
- Built-in read, edit, search, shell, and coding tools
- Low-overhead terminal UI
- MCP support
- Cloud-model support
- Local-model support
- Ollama auto-detection on macOS, Windows, and Linux
- Apple Silicon local-model path
- Session resume and continuation
- Cross-platform runtime behavior

SCODE can run as a standalone CLI or as a persistent execution runtime behind another AI client.

## Architecture

```text
AI / Model
    |
    v
  SCODE
    |
    +-- Read / Edit / Search
    +-- Shell / Commands
    +-- Sessions / Resume
    +-- MCP tools
    +-- Local models
    |
    v
Your workspace
```

SCODE does **not** require SIDRA OS. It is an independent open-source project.

## Local models

If Ollama is already running, SCODE can discover installed Ollama models automatically.

Start SCODE and use:

```text
/model
```

Local models are optional. Supported cloud providers can be configured as well.

## Build from source

Requirements:

- Node.js 24.14.0
- pnpm 10.33.2

```bash
git clone https://github.com/mohamedfrahat32-cmd/scode.git
cd scode
pnpm install --frozen-lockfile
pnpm build
```

Run the development CLI:

```bash
pnpm dev -- --help
```

## Source layout

```text
apps/scode-cli/
  packages/
    cli/          command-line entry point
    core/         execution and session runtime
    tui/          terminal UI
    bootstrap/    runtime assembly
    adapters/     model, storage, MCP and platform adapters

packages/
  shared/         shared runtime primitives
  provider*/      provider support
  zcode-cua/      computer-use compatibility layer

scripts/          build and release support
third-party/      license and provenance material
```

Some internal package names still use the upstream `@zcode/*` namespace for compatibility with the architecture SCODE was derived from. The public product and CLI are **SCODE**.

## License

SCODE is licensed under **Apache-2.0**.

SCODE contains code derived from ZCode. Upstream and third-party notices are preserved in [NOTICE.md](NOTICE.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## SIDRA OS

SCODE focuses on coding execution.

If you want to give an AI chat a broader execution layer on your computer — files, terminal, browser, computer control, project memory, tools, other coding runtimes, and SCODE — see **SIDRA OS**.

**SIDRA OS repository:** https://github.com/mohamedfrahat32-cmd/chat-to-agent

**Website:** https://sidra-ai.com/sidra-os

---

Built by [SIDRA Development](https://sidra-ai.com/).
