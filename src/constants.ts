/**
 * Constants used throughout the worktree manager application
 */

/**
 * UI-related constants
 */
export const UI = {
  /** Maximum length for branch names in list display */
  BRANCH_TRUNCATE_LENGTH: 30,

  /** Height of the help modal in lines */
  HELP_MODAL_HEIGHT: 26,

  /** Height of the create worktree form in lines */
  CREATE_FORM_HEIGHT: 20,

  /** Width of modal dialogs */
  MODAL_WIDTH: 50,

  /** Width of the editor/AI selection dialog */
  SELECTOR_WIDTH: 40,

  /** Height of the editor selection dialog */
  EDITOR_SELECTOR_HEIGHT: 12,

  /** Height of the AI tool selection dialog */
  AI_SELECTOR_HEIGHT: 9,
} as const;

/**
 * Git-related constants
 */
export const GIT = {
  /** Length of short SHA commit hash */
  SHORT_SHA_LENGTH: 7,

  /** Default base branch name */
  DEFAULT_BASE_BRANCH: 'main',

  /** Directory name for worktrees relative to repo */
  WORKTREES_DIR: 'worktrees',

  /** Branches that should never be offered for deletion */
  PROTECTED_BRANCHES: [
    'main',
    'master',
    'production',
    'prod',
    'dev',
    'develop',
    'development',
    'qa',
    'stage',
    'staging',
    'release',
    'hotfix',
  ],
} as const;

/**
 * Regex patterns for parsing git output
 */
export const PATTERNS = {
  /** Match commit SHA from porcelain output */
  COMMIT_SHA: /^HEAD ([a-f0-9]+)$/,

  /** Match worktree path from porcelain output */
  WORKTREE_PATH: /^worktree (.+)$/,

  /** Match branch from porcelain output */
  BRANCH_REF: /^branch refs\/heads\/(.+)$/,
} as const;

/**
 * Platform detection
 */
export const PLATFORM = {
  IS_MAC: process.platform === 'darwin',
  IS_WIN: process.platform === 'win32',
  IS_LINUX: process.platform === 'linux',
  IS_WSL: process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME,
} as const;

/**
 * Editor types and their display names
 */
export const EDITORS = {
  code: { name: 'VS Code', terminal: false },
  cursor: { name: 'Cursor', terminal: false },
  zed: { name: 'Zed', terminal: false },
  webstorm: { name: 'WebStorm', terminal: false },
  subl: { name: 'Sublime Text', terminal: false },
  nvim: { name: 'Neovim', terminal: true },
} as const;

/**
 * AI tools and their display names
 */
export const AI_TOOLS = {
  claude: { name: 'Claude' },
  gemini: { name: 'Gemini' },
  codex: { name: 'Codex' },
} as const;

/**
 * Installation instructions by platform
 */
export const INSTALL_INSTRUCTIONS = {
  code: {
    darwin: "Open VS Code → Cmd+Shift+P → 'Shell Command: Install code'",
    win32: 'Add VS Code to PATH during installation',
    linux: 'Install via package manager or add to PATH',
  },
  cursor: {
    darwin: "Open Cursor → Cmd+Shift+P → 'Shell Command: Install cursor'",
    win32: 'Add Cursor to PATH during installation',
    linux: 'Add Cursor to PATH',
  },
  zed: {
    darwin: "Open Zed → Cmd+Shift+P → 'zed: Install CLI'",
    win32: 'Zed CLI installation varies by setup',
    linux: 'Zed CLI installation varies by setup',
  },
  webstorm: {
    darwin: 'Open WebStorm → Tools → Create Command-line Launcher',
    win32: 'Add WebStorm to PATH',
    linux: 'Add WebStorm to PATH',
  },
  subl: {
    darwin: 'See sublimetext.com/docs/command_line.html',
    win32: 'See sublimetext.com/docs/command_line.html',
    linux: 'See sublimetext.com/docs/command_line.html',
  },
  nvim: {
    darwin: 'Install via: brew install neovim',
    win32: 'Install via: choco install neovim or scoop install neovim',
    linux: 'Install via: apt install neovim or dnf install neovim',
  },
  claude: {
    darwin: 'Install Claude CLI: npm install -g @anthropic-ai/claude-code',
    win32: 'Install Claude CLI: npm install -g @anthropic-ai/claude-code',
    linux: 'Install Claude CLI: npm install -g @anthropic-ai/claude-code',
  },
  gemini: {
    darwin: 'Install Gemini CLI from Google',
    win32: 'Install Gemini CLI from Google',
    linux: 'Install Gemini CLI from Google',
  },
  codex: {
    darwin: 'Install Codex CLI from OpenAI',
    win32: 'Install Codex CLI from OpenAI',
    linux: 'Install Codex CLI from OpenAI',
  },
} as const;

/**
 * Get install instruction for a tool on the current platform
 */
export function getInstallInstruction(tool: string): string {
  const instructions = INSTALL_INSTRUCTIONS[tool as keyof typeof INSTALL_INSTRUCTIONS];
  if (!instructions) {
    return `Install ${tool}`;
  }

  const platform = process.platform as 'darwin' | 'win32' | 'linux';
  return instructions[platform] || instructions.darwin || `Install ${tool}`;
}
