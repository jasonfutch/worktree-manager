# Worktree Manager

A terminal app for managing git worktrees with AI assistance - similar to [vibe-tree](https://github.com/sahithvibudhi/vibe-tree).

## Features

- **TUI Interface** - Full terminal UI built with blessed
- **Git Worktree Management** - Create, list, and remove worktrees
- **IDE Integration** - Open worktrees in VS Code or Cursor
- **Claude Integration** - Launch Claude Code in any worktree
- **Parallel Development** - Work on multiple features simultaneously

## Installation

```bash
# Clone and install
git clone <your-repo>
cd worktree-manager
npm install
npm run build

# Link globally (optional)
npm link
```

## Usage

### Interactive TUI Mode

```bash
# Launch TUI in current directory
wtm

# Launch TUI for a specific repo
wtm /path/to/repo
```

### Keybindings

| Key | Action |
|-----|--------|
| `↑/k` | Move up |
| `↓/j` | Move down |
| `Enter` | Select/Details |
| `n` | Create new worktree |
| `d` | Delete worktree |
| `c` | Open in VS Code |
| `u` | Open in Cursor |
| `t` | Open terminal |
| `a` | Launch Claude |
| `r` | Refresh |
| `q` | Quit |

### CLI Commands

```bash
# List all worktrees
wtm list
wtm list /path/to/repo

# Create a new worktree
wtm create feature/my-feature
wtm create feature/my-feature -b main
wtm create feature/my-feature -p /custom/path

# Remove a worktree
wtm remove feature/my-feature
wtm remove feature/my-feature --force
```

## Architecture

```
worktree-manager/
├── src/
│   ├── index.ts        # CLI entry point
│   ├── types.ts        # TypeScript types
│   ├── git/
│   │   └── worktree.ts # Git worktree operations
│   ├── tui/
│   │   └── app.ts      # Blessed TUI application
│   └── utils/
│       └── helpers.ts  # Utility functions
├── dist/               # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

1. **Worktrees** - Uses `git worktree` to create isolated working directories for each branch
2. **Parallel Development** - Each worktree is independent, allowing you to run different Claude Code instances
3. **IDE Integration** - Opens editors in the worktree directory so Claude has the right context
4. **Terminal Sessions** - Opens new terminal windows/tabs in the worktree directory

## Comparison with vibe-tree

| Feature | vibe-tree | worktree-manager |
|---------|-----------|------------------|
| Electron Desktop App | ✅ | ❌ |
| Web Interface | ✅ | ❌ |
| Terminal TUI | ❌ | ✅ |
| Persistent PTY | ✅ | ❌ (opens new terminals) |
| Claude Integration | ✅ | ✅ |
| IDE Integration | ✅ | ✅ |
| Docker Deploy | ✅ | ❌ |

This is a simpler, terminal-focused alternative. For the full vibe-tree experience with Electron and web support, use the original project.

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Clean
npm run clean
```

## Requirements

- Node.js >= 18
- Git
- Optional: VS Code, Cursor, Claude CLI

## License

MIT
