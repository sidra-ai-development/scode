# SCODE

**Fast, persistent coding CLI for AI workflows — optimized for local models and execution-heavy coding tasks.**

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

## Why SCODE exists

SCODE started from the ZCode architecture.

We kept the parts that make ZCode useful as a coding runtime — the execution engine, session model, terminal UI, MCP support, file/edit/search tools, and provider architecture — then removed or reduced layers and flows that were unnecessary for SCODE's narrower goal: **fast, persistent execution with less coordination and context overhead.**

The result is a leaner execution runtime designed to stay close to the workspace and let the reasoning layer remain replaceable.

That matters especially for local models, where unnecessary context, orchestration, and repeated tool-round trips can cost far more than they do with large cloud models.

SCODE is not a wrapper around ZCode. It is an independent product derived from it, with its own runtime behavior, local-model path, persistent execution model, cross-platform packaging, and SIDRA integration.

Upstream attribution and third-party license material are preserved in [NOTICE.md](NOTICE.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Built for local models

SCODE is designed to work well with smaller and local coding models, not only large hosted models.

On Apple Silicon, SCODE supports an MLX local-model path. On macOS, Windows, and Linux, it can also discover local Ollama models automatically.

Start SCODE and use:

```text
/model
```

to select an available model.

SCODE keeps local inference optional:

- use a cloud model if you want the strongest reasoning layer
- use MLX on Apple Silicon for fast local inference
- use Ollama for a cross-platform local-model path
- keep a persistent SCODE runtime alive so repeated work does not need to rebuild the execution environment from scratch

A controlled SCODE benchmark also showed why fresh, bounded execution context matters for local models: the same warm Qwen3.5-4B local workflow completed in about **3.88s** on a fresh execution session versus about **35.95s** on an accumulated session, while input/context volume dropped by roughly **70%**.

That is a SCODE session-design benchmark, **not** a ZCode-vs-SCODE benchmark. The point is that SCODE is deliberately shaped to minimize execution and context overhead where it matters most.

## Persistent execution

SCODE can run as a normal CLI, but it can also act as a persistent execution cabinet behind another AI client.

Instead of repeatedly starting a new coding process, a client can attach to one workspace-scoped SCODE runtime and reuse the same execution session across many operations.

This lets one external request fan out into many internal operations such as:

```text
Read
Edit
Search
Code Index
Shell
MCP
Session state
```

For multi-step coding tasks, this reduces external tool round-trips and keeps execution state close to the project.

## Architecture

```text
AI / Model
    |
    v
  SCODE
Persistent Coding Runtime
    |
    +-- Read / Edit / Search
    +-- Shell / Commands
    +-- Code Index
    +-- Sessions / Resume
    +-- MCP tools
    +-- Local models
    |
    v
Your workspace
```

SCODE does **not** require SIDRA OS. It is an independent open-source project.

## SCODE + SIDRA OS

SCODE focuses on persistent coding execution.

[SIDRA OS](https://github.com/mohamedfrahat32-cmd/chat-to-agent) is the broader execution layer that can connect AI clients to the computer itself: files, terminal, browser, computer control, project memory, system tools, channels, and additional runtimes.

SCODE can connect to SIDRA OS through MCP, so the two can be used together:

```text
ChatGPT / Claude / Local Model
              |
              v
           SCODE
   Persistent Coding Runtime
       /        |         \
  Read/Edit   Shell     Code Index
                   \
                    \\ MCP
                     v
                  SIDRA OS
        Files / Browser / Computer
        Memory / Tools / Channels
        Workspace / System execution
```

That gives you two clean modes:

**SCODE alone** — a focused coding runtime.

**SCODE + SIDRA OS** — coding execution plus a broader computer execution layer.

The integration is optional. SCODE remains fully usable as a standalone CLI.

**SIDRA OS repository:**  
https://github.com/mohamedfrahat32-cmd/chat-to-agent

**SIDRA OS website:**  
https://sidra-ai.com/sidra-os

## Why SCODE

- Persistent workspace sessions
- Built-in read, edit, search, shell, and coding tools
- Low-overhead terminal UI
- Persistent code index
- MCP support
- Cloud-model support
- MLX support on Apple Silicon
- Ollama auto-detection on macOS, Windows, and Linux
- Session resume and continuation
- Cross-platform runtime behavior
- Optional integration with SIDRA OS

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

---

Built by [SIDRA Development](https://sidra-ai.com/).
