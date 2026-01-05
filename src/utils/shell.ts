/**
 * Shell escaping utilities to prevent command injection
 */

import path from 'path';

/**
 * Escape a string for use as a shell argument (POSIX shells)
 * Wraps the argument in single quotes and escapes any existing single quotes
 */
export function escapeShellArg(arg: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Escape a string for use in AppleScript
 * Handles single quotes, double quotes, and backslashes
 */
export function escapeAppleScript(str: string): string {
  // In AppleScript strings, escape backslashes and quotes
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

/**
 * Escape a string for use in Windows cmd.exe
 * Handles special characters that need escaping in batch scripts
 */
export function escapeWindowsArg(arg: string): string {
  // For cmd.exe, we need to handle special characters
  // Wrap in double quotes and escape internal double quotes
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * Validate that a path doesn't contain path traversal attempts
 * @returns true if the path is safe, false if it contains suspicious patterns
 */
export function isPathSafe(targetPath: string, basePath?: string): boolean {
  // Check for obvious path traversal patterns
  if (targetPath.includes('..')) {
    return false;
  }

  // Check for null bytes (can be used to bypass security checks)
  if (targetPath.includes('\0')) {
    return false;
  }

  // If a base path is provided, ensure target is within it
  if (basePath) {
    const resolved = path.resolve(targetPath);
    const resolvedBase = path.resolve(basePath);

    // Target should start with base path
    if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a git branch name
 * Based on git-check-ref-format rules
 */
export function isValidBranchName(branch: string): boolean {
  // Can't be empty
  if (!branch || branch.length === 0) {
    return false;
  }

  // Can't start or end with /
  if (branch.startsWith('/') || branch.endsWith('/')) {
    return false;
  }

  // Can't contain consecutive slashes
  if (branch.includes('//')) {
    return false;
  }

  // Can't contain special characters
  const forbidden = ['..', ' ', '~', '^', ':', '?', '*', '[', '\\', '\x7f'];
  for (const char of forbidden) {
    if (branch.includes(char)) {
      return false;
    }
  }

  // Can't start with a dash
  if (branch.startsWith('-')) {
    return false;
  }

  // Can't end with .lock
  if (branch.endsWith('.lock')) {
    return false;
  }

  // Can't contain @{
  if (branch.includes('@{')) {
    return false;
  }

  return true;
}
