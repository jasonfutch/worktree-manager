import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Open a path in VS Code
 */
export async function openInVSCode(path: string): Promise<void> {
  try {
    await execAsync(`code "${path}"`);
  } catch {
    throw new Error('VS Code not found. Install it or add to PATH.');
  }
}

/**
 * Open a path in Cursor
 */
export async function openInCursor(path: string): Promise<void> {
  try {
    await execAsync(`cursor "${path}"`);
  } catch {
    throw new Error('Cursor not found. Install it or add to PATH.');
  }
}

/**
 * Launch Claude Code in a directory
 */
export async function launchClaude(path: string): Promise<void> {
  try {
    await execAsync(`cd "${path}" && claude`);
  } catch {
    throw new Error('Claude CLI not found. Install it first.');
  }
}

/**
 * Get a truncated string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format a relative path
 */
export function formatPath(fullPath: string, basePath: string): string {
  if (fullPath.startsWith(basePath)) {
    return fullPath.slice(basePath.length + 1) || '.';
  }
  return fullPath;
}

/**
 * Generate a session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
