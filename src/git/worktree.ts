import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import type { Worktree, CreateWorktreeOptions } from '../types.js';
import {
  GitCommandError,
  WorktreeNotFoundError,
  InvalidBranchError,
  InvalidPathError,
  parseGitError,
} from '../errors.js';
import { isPathSafe, isValidBranchName, escapeShellArg } from '../utils/shell.js';
import { GIT } from '../constants.js';

const execAsync = promisify(exec);

export class GitWorktree {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Check if path is a valid git repository
   */
  static isGitRepo(dirPath: string): boolean {
    try {
      execSync('git rev-parse --git-dir', { cwd: dirPath, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the root of the git repository
   */
  static getRepoRoot(dirPath: string): string | null {
    try {
      const result = execSync('git rev-parse --show-toplevel', {
        cwd: dirPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return result.trim();
    } catch {
      return null;
    }
  }

  /**
   * List all worktrees for this repository
   */
  async list(): Promise<Worktree[]> {
    const command = 'git worktree list --porcelain';
    try {
      const { stdout } = await execAsync(command, {
        cwd: this.repoPath
      });

      const worktrees: Worktree[] = [];
      const entries = stdout.trim().split('\n\n');

      for (const entry of entries) {
        if (!entry.trim()) continue;

        const lines = entry.split('\n');
        const worktree: Partial<Worktree> = {
          isMain: false,
          isBare: false,
          isLocked: false,
          prunable: false,
        };

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            worktree.path = line.substring(9);
            worktree.name = path.basename(worktree.path);
          } else if (line.startsWith('HEAD ')) {
            // Extract SHA safely - handle variable length commits
            const sha = line.substring(5);
            worktree.commit = sha.substring(0, GIT.SHORT_SHA_LENGTH);
          } else if (line.startsWith('branch ')) {
            // Parse branch reference more robustly
            const ref = line.substring(7);
            worktree.branch = ref.replace(/^refs\/heads\//, '');
          } else if (line === 'bare') {
            worktree.isBare = true;
          } else if (line === 'locked') {
            worktree.isLocked = true;
          } else if (line.startsWith('locked ')) {
            worktree.isLocked = true;
            worktree.lockedReason = line.substring(7);
          } else if (line === 'prunable') {
            worktree.prunable = true;
          } else if (line === 'detached') {
            worktree.branch = 'HEAD (detached)';
          }
        }

        // Check if this is the main worktree
        if (worktree.path === this.repoPath) {
          worktree.isMain = true;
        }

        if (worktree.path && worktree.commit) {
          worktrees.push(worktree as Worktree);
        }
      }

      return worktrees;
    } catch (error) {
      throw parseGitError(error, command);
    }
  }

  /**
   * Create a new worktree
   */
  async create(options: CreateWorktreeOptions): Promise<Worktree> {
    const { branch, baseBranch = GIT.DEFAULT_BASE_BRANCH, path: customPath } = options;

    // Validate branch name
    if (!isValidBranchName(branch)) {
      throw new InvalidBranchError(branch, 'Branch names cannot contain spaces, .., or special characters');
    }

    // Generate worktree path if not provided
    const worktreePath = customPath || path.join(
      path.dirname(this.repoPath),
      GIT.WORKTREES_DIR,
      branch.replace(/\//g, '-')
    );

    // Validate path doesn't contain traversal attempts
    const repoParent = path.dirname(this.repoPath);
    if (!isPathSafe(worktreePath, repoParent)) {
      throw new InvalidPathError(worktreePath, 'Path contains invalid characters or traversal attempts');
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(worktreePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    try {
      // Check if branch exists
      const branchExists = await this.branchExists(branch);

      // Use escaped arguments for safety
      const escapedPath = escapeShellArg(worktreePath);
      const escapedBranch = escapeShellArg(branch);
      const escapedBase = escapeShellArg(baseBranch);

      let command: string;
      if (branchExists) {
        // Checkout existing branch
        command = `git worktree add ${escapedPath} ${escapedBranch}`;
      } else {
        // Create new branch from base
        command = `git worktree add -b ${escapedBranch} ${escapedPath} ${escapedBase}`;
      }

      await execAsync(command, { cwd: this.repoPath });

      // Get the created worktree info
      const worktrees = await this.list();
      const created = worktrees.find(wt => wt.path === worktreePath);

      if (!created) {
        throw new WorktreeNotFoundError(worktreePath);
      }

      return created;
    } catch (error) {
      if (error instanceof WorktreeNotFoundError) {
        throw error;
      }
      throw parseGitError(error, `git worktree add ${branch}`);
    }
  }

  /**
   * Remove a worktree
   */
  async remove(worktreePath: string, force = false): Promise<void> {
    // Validate path
    if (!isPathSafe(worktreePath)) {
      throw new InvalidPathError(worktreePath, 'Path contains invalid characters');
    }

    const escapedPath = escapeShellArg(worktreePath);
    const forceFlag = force ? '--force' : '';
    const command = `git worktree remove ${forceFlag} ${escapedPath}`;

    try {
      await execAsync(command, { cwd: this.repoPath });
    } catch (error) {
      const gitError = parseGitError(error, command);
      // Check if it's a not-found error
      if (gitError.stderr.includes('is not a working tree')) {
        throw new WorktreeNotFoundError(worktreePath);
      }
      throw gitError;
    }
  }

  /**
   * Prune worktrees (clean up stale entries)
   */
  async prune(): Promise<void> {
    const command = 'git worktree prune';
    try {
      await execAsync(command, { cwd: this.repoPath });
    } catch (error) {
      throw parseGitError(error, command);
    }
  }

  /**
   * Delete a branch
   * @param branch - Branch name to delete
   * @param force - If true, use -D (force delete) instead of -d
   */
  async deleteBranch(branch: string, force = false): Promise<void> {
    if (!isValidBranchName(branch)) {
      throw new InvalidBranchError(branch, 'Invalid branch name');
    }

    const escapedBranch = escapeShellArg(branch);
    const flag = force ? '-D' : '-d';
    const command = `git branch ${flag} ${escapedBranch}`;

    try {
      await execAsync(command, { cwd: this.repoPath });
    } catch (error) {
      throw parseGitError(error, command);
    }
  }

  /**
   * Check if a branch exists
   * @returns true if branch exists, false otherwise
   * @note This method returns false on any error (including invalid branch names)
   */
  private async branchExists(branch: string): Promise<boolean> {
    try {
      const escapedBranch = escapeShellArg(branch);
      await execAsync(`git rev-parse --verify ${escapedBranch}`, {
        cwd: this.repoPath
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of all local branches
   * @returns Array of branch names, empty array on error
   * @note This method returns empty array on any error
   */
  async getBranches(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git branch -a --format="%(refname:short)"', {
        cwd: this.repoPath
      });
      return stdout.trim().split('\n').filter(b => b && !b.startsWith('origin/'));
    } catch {
      // Return empty array on error - caller should handle empty results
      return [];
    }
  }

  /**
   * Get current branch name
   * @returns Current branch name, or 'unknown' on error
   * @note This method returns 'unknown' on any error
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync('git branch --show-current', {
        cwd: this.repoPath
      });
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get repo name
   */
  getRepoName(): string {
    return path.basename(this.repoPath);
  }
}
