/**
 * Custom error classes for better error handling and debugging
 */

/**
 * Base error class for all worktree manager errors
 */
export class WorktreeManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorktreeManagerError';
    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a git command fails
 */
export class GitCommandError extends WorktreeManagerError {
  public readonly command: string;
  public readonly stderr: string;
  public readonly exitCode: number | undefined;

  constructor(
    message: string,
    command: string,
    stderr: string = '',
    exitCode?: number
  ) {
    super(message);
    this.name = 'GitCommandError';
    this.command = command;
    this.stderr = stderr;
    this.exitCode = exitCode;
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    // Parse common git errors into friendly messages
    if (this.stderr.includes('not a git repository')) {
      return 'This directory is not a git repository';
    }
    if (this.stderr.includes('already exists')) {
      return 'A worktree or branch with this name already exists';
    }
    if (this.stderr.includes('is not a valid branch name')) {
      return 'Invalid branch name. Branch names cannot contain spaces or special characters';
    }
    if (this.stderr.includes('invalid reference')) {
      return 'The specified branch or commit does not exist';
    }
    if (this.stderr.includes('contains modified or untracked files')) {
      return 'Worktree has uncommitted changes. Use force to delete anyway';
    }

    // Return original message if no specific parsing applies
    return this.message;
  }
}

/**
 * Error thrown when a worktree is not found
 */
export class WorktreeNotFoundError extends WorktreeManagerError {
  public readonly worktreePath: string;

  constructor(worktreePath: string) {
    super(`Worktree not found: ${worktreePath}`);
    this.name = 'WorktreeNotFoundError';
    this.worktreePath = worktreePath;
  }
}

/**
 * Error thrown when a branch name is invalid
 */
export class InvalidBranchError extends WorktreeManagerError {
  public readonly branch: string;
  public readonly reason: string;

  constructor(branch: string, reason: string = 'Invalid branch name') {
    super(`Invalid branch name "${branch}": ${reason}`);
    this.name = 'InvalidBranchError';
    this.branch = branch;
    this.reason = reason;
  }
}

/**
 * Error thrown when a path is invalid or contains traversal attempts
 */
export class InvalidPathError extends WorktreeManagerError {
  public readonly invalidPath: string;
  public readonly reason: string;

  constructor(invalidPath: string, reason: string = 'Invalid path') {
    super(`Invalid path "${invalidPath}": ${reason}`);
    this.name = 'InvalidPathError';
    this.invalidPath = invalidPath;
    this.reason = reason;
  }
}

/**
 * Error thrown when an external tool (editor, terminal, AI) is not found
 */
export class ToolNotFoundError extends WorktreeManagerError {
  public readonly toolName: string;
  public readonly installHint: string;

  constructor(toolName: string, installHint: string = '') {
    super(`${toolName} not found${installHint ? `. ${installHint}` : ''}`);
    this.name = 'ToolNotFoundError';
    this.toolName = toolName;
    this.installHint = installHint;
  }
}

/**
 * Parse an error from git command execution into a GitCommandError
 */
export function parseGitError(
  error: unknown,
  command: string
): GitCommandError {
  if (error instanceof GitCommandError) {
    return error;
  }

  const err = error as { message?: string; stderr?: string; code?: number };
  const message = err.message || String(error);
  const stderr = err.stderr || '';
  const exitCode = typeof err.code === 'number' ? err.code : undefined;

  return new GitCommandError(message, command, stderr, exitCode);
}
