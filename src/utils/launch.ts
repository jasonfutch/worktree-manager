import { spawn } from 'child_process';
import chalk from 'chalk';
import { escapeAppleScript, escapeWindowsArg } from './shell.js';
import { PLATFORM, getInstallInstruction, EDITORS, AI_TOOLS } from '../constants.js';
import { ToolNotFoundError } from '../errors.js';

export type EditorType = keyof typeof EDITORS;
export type AIToolType = keyof typeof AI_TOOLS;

const editorNames: Record<EditorType, string> = {
  code: 'VS Code',
  cursor: 'Cursor',
  zed: 'Zed',
  webstorm: 'WebStorm',
  subl: 'Sublime Text',
  nvim: 'Neovim'
};

const aiToolNames: Record<AIToolType, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  codex: 'Codex'
};

/**
 * Open a path in an editor
 */
export function openEditor(
  targetPath: string,
  editor: EditorType,
  onError?: (message: string) => void,
  onSuccess?: (message: string) => void
): void {
  const name = editorNames[editor];
  const editorConfig = EDITORS[editor];
  const isTerminalEditor = editorConfig?.terminal ?? false;

  const handleError = (err: Error) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const hint = getInstallInstruction(editor);
      const message = `${name} not found. ${hint}`;
      if (onError) onError(message);
      else console.error(chalk.red(message));
    } else {
      const message = `Error: ${err.message}`;
      if (onError) onError(message);
      else console.error(chalk.red(message));
    }
  };

  try {
    let proc;
    if (isTerminalEditor) {
      if (PLATFORM.IS_MAC) {
        // Escape the path for AppleScript context
        const escapedPath = escapeAppleScript(targetPath);
        const script = `
          tell application "Terminal"
            do script "cd '${escapedPath}' && ${editor} ."
            activate
          end tell
        `;
        proc = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
      } else if (PLATFORM.IS_WIN) {
        // Escape the path for Windows cmd context
        const escapedPath = escapeWindowsArg(targetPath);
        proc = spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d ${escapedPath} && ${editor} .`], {
          detached: true,
          stdio: 'ignore',
          shell: true
        });
      } else {
        // Linux - pass path directly to gnome-terminal which handles it safely
        proc = spawn('gnome-terminal', ['--working-directory', targetPath, '--', editor, '.'], {
          detached: true,
          stdio: 'ignore'
        });
      }
    } else {
      // GUI editors can open directly - spawn with array args (safe)
      proc = spawn(editor, [targetPath], { detached: true, stdio: 'ignore' });
    }
    proc.on('error', handleError);
    proc.unref();

    const successMsg = `Opened in ${name}`;
    if (onSuccess) onSuccess(successMsg);
    else console.log(chalk.green(`✓ ${successMsg}`));
  } catch (error) {
    const message = `Error: ${error instanceof Error ? error.message : error}`;
    if (onError) onError(message);
    else console.error(chalk.red(message));
  }
}

/**
 * Open a terminal at a path
 */
export function openTerminal(
  targetPath: string,
  onError?: (message: string) => void,
  onSuccess?: (message: string) => void
): void {
  try {
    if (PLATFORM.IS_MAC) {
      // macOS Terminal.app - use open command with path as argument (safe)
      spawn('open', ['-a', 'Terminal', targetPath], { detached: true, stdio: 'ignore' });
    } else if (PLATFORM.IS_WIN) {
      // Windows - escape path for cmd.exe
      const escapedPath = escapeWindowsArg(targetPath);
      spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d ${escapedPath}`], {
        detached: true,
        stdio: 'ignore',
        shell: true
      });
    } else if (PLATFORM.IS_WSL) {
      // WSL - pass path directly to wt.exe
      spawn('wt.exe', ['-d', targetPath], { detached: true, stdio: 'ignore' });
    } else {
      // Linux - try common terminal emulators
      const terminals = ['gnome-terminal', 'konsole', 'xterm', 'terminator'];
      let launched = false;
      for (const term of terminals) {
        try {
          const proc = spawn(term, ['--working-directory', targetPath], {
            detached: true,
            stdio: 'ignore'
          });
          proc.on('error', () => {
            // Silently fail and try next terminal
          });
          proc.unref();
          launched = true;
          break;
        } catch {
          // Try next terminal
        }
      }
      if (!launched) {
        throw new ToolNotFoundError('Terminal emulator', 'Install gnome-terminal, konsole, xterm, or terminator');
      }
    }

    const successMsg = 'Opened terminal';
    if (onSuccess) onSuccess(successMsg);
    else console.log(chalk.green(`✓ ${successMsg}`));
  } catch (error) {
    if (error instanceof ToolNotFoundError) {
      if (onError) onError(error.message);
      else console.error(chalk.red(error.message));
    } else {
      const message = `Error: ${error instanceof Error ? error.message : error}`;
      if (onError) onError(message);
      else console.error(chalk.red(message));
    }
  }
}

/**
 * Launch an AI tool at a path
 */
export function launchAI(
  targetPath: string,
  tool: AIToolType,
  onError?: (message: string) => void,
  onSuccess?: (message: string) => void
): void {
  const name = aiToolNames[tool];

  try {
    let proc;
    if (PLATFORM.IS_MAC) {
      // Escape the path for AppleScript context
      const escapedPath = escapeAppleScript(targetPath);
      const script = `
        tell application "Terminal"
          do script "cd '${escapedPath}' && ${tool}"
          activate
        end tell
      `;
      proc = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    } else if (PLATFORM.IS_WIN) {
      // Escape the path for Windows cmd context
      const escapedPath = escapeWindowsArg(targetPath);
      proc = spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d ${escapedPath} && ${tool}`], {
        detached: true,
        stdio: 'ignore',
        shell: true
      });
    } else {
      // Linux - pass arguments safely via array
      proc = spawn('gnome-terminal', ['--working-directory', targetPath, '--', tool], {
        detached: true,
        stdio: 'ignore'
      });
    }

    proc.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        const hint = getInstallInstruction(tool);
        const message = `${name} not found. ${hint}`;
        if (onError) onError(message);
        else console.error(chalk.red(message));
      }
    });
    proc.unref();

    const successMsg = `Launched ${name}`;
    if (onSuccess) onSuccess(successMsg);
    else console.log(chalk.green(`✓ ${successMsg}`));
  } catch (error) {
    const message = `Error: ${error instanceof Error ? error.message : error}`;
    if (onError) onError(message);
    else console.error(chalk.red(message));
  }
}

export const validEditors: EditorType[] = ['code', 'cursor', 'zed', 'webstorm', 'subl', 'nvim'];
export const validAITools: AIToolType[] = ['claude', 'gemini', 'codex'];
