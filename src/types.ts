/**
 * Type definitions for the worktree manager
 */

/**
 * Represents a git worktree
 */
export interface Worktree {
  /** Absolute filesystem path to the worktree */
  path: string;
  /** Branch name, or "HEAD (detached)" for detached HEAD state */
  branch: string;
  /** Short SHA of the current commit (7 characters) */
  commit: string;
  /** Whether this is the main worktree (same path as repo root) */
  isMain: boolean;
  /** Whether this is a bare repository */
  isBare: boolean;
  /** Whether the worktree is locked */
  isLocked: boolean;
  /** Reason for lock, if locked with a reason */
  lockedReason?: string;
  /** Whether the worktree is prunable (stale) */
  prunable?: boolean;
  /** Friendly name derived from path basename */
  name: string;
}

/**
 * Options for creating a new worktree
 */
export interface CreateWorktreeOptions {
  /** Name of the branch to create or checkout */
  branch: string;
  /** Base branch to create new branch from (default: 'main') */
  baseBranch?: string;
  /** Custom path for the worktree (default: auto-generated) */
  path?: string;
}
