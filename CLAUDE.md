# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Development - run with hot reload
npm run dev

# Build TypeScript to dist/
npm run build

# Run the built CLI
npm start
# or directly:
node dist/index.js

# Clean build artifacts
npm run clean

# Link globally for local testing
npm link
```

## Architecture

This is a terminal-based git worktree manager built with TypeScript. The CLI can be invoked as `wtm` or `worktree-manager`.

### Module Structure

- **`src/index.ts`** - CLI entry point using Commander.js. Handles argument parsing and dispatches to TUI or subcommands (list, create, remove).

- **`src/git/worktree.ts`** - `GitWorktree` class wrapping git worktree operations. All git commands are executed via `child_process.exec`. Key methods: `list()`, `create()`, `remove()`, `prune()`.

- **`src/tui/app.ts`** - `WorktreeManagerTUI` class built with the blessed library. Implements a two-panel layout (worktree list + details) with keybinding-driven navigation.

- **`src/utils/helpers.ts`** - Utility functions for opening editors (VS Code, Cursor), launching Claude, and string formatting.

- **`src/types.ts`** - TypeScript interfaces for `Worktree`, `Project`, `Session`, `AppState`, and `CreateWorktreeOptions`.

### Key Patterns

- Uses ES modules (`"type": "module"` in package.json) with `.js` extensions in imports even for TypeScript files
- Git operations parse `git worktree list --porcelain` output
- TUI uses blessed's screen/box/list widgets with vim-style keybindings (j/k navigation)
- IDE integration spawns `code` or `cursor` CLI commands
- Claude integration opens a new terminal window and runs `claude` command in the worktree directory
