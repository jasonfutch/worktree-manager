/**
 * Helper utilities for the worktree manager
 */

/**
 * Get a truncated string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format a relative path from a base path
 */
export function formatPath(fullPath: string, basePath: string): string {
  if (fullPath.startsWith(basePath)) {
    return fullPath.slice(basePath.length + 1) || '.';
  }
  return fullPath;
}
