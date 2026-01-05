import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import type { Worktree, CreateWorktreeOptions } from '../types.js';

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
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
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
          isLocked: false
        };

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            worktree.path = line.substring(9);
            worktree.name = path.basename(worktree.path);
          } else if (line.startsWith('HEAD ')) {
            worktree.commit = line.substring(5, 12); // Short SHA
          } else if (line.startsWith('branch ')) {
            worktree.branch = line.substring(7).replace('refs/heads/', '');
          } else if (line === 'bare') {
            worktree.isBare = true;
          } else if (line === 'locked') {
            worktree.isLocked = true;
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
      throw new Error(`Failed to list worktrees: ${error}`);
    }
  }

  /**
   * Create a new worktree
   */
  async create(options: CreateWorktreeOptions): Promise<Worktree> {
    const { branch, baseBranch = 'main', path: customPath } = options;
    
    // Generate worktree path if not provided
    const worktreePath = customPath || path.join(
      path.dirname(this.repoPath),
      'worktrees',
      branch.replace(/\//g, '-')
    );

    // Ensure parent directory exists
    const parentDir = path.dirname(worktreePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    try {
      // Check if branch exists
      const branchExists = await this.branchExists(branch);
      
      if (branchExists) {
        // Checkout existing branch
        await execAsync(`git worktree add "${worktreePath}" "${branch}"`, {
          cwd: this.repoPath
        });
      } else {
        // Create new branch from base
        await execAsync(
          `git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`,
          { cwd: this.repoPath }
        );
      }

      // Get the created worktree info
      const worktrees = await this.list();
      const created = worktrees.find(wt => wt.path === worktreePath);
      
      if (!created) {
        throw new Error('Worktree created but not found in list');
      }

      return created;
    } catch (error) {
      throw new Error(`Failed to create worktree: ${error}`);
    }
  }

  /**
   * Remove a worktree
   */
  async remove(worktreePath: string, force = false): Promise<void> {
    try {
      const forceFlag = force ? '--force' : '';
      await execAsync(`git worktree remove ${forceFlag} "${worktreePath}"`, {
        cwd: this.repoPath
      });
    } catch (error) {
      throw new Error(`Failed to remove worktree: ${error}`);
    }
  }

  /**
   * Prune worktrees (clean up stale entries)
   */
  async prune(): Promise<void> {
    try {
      await execAsync('git worktree prune', { cwd: this.repoPath });
    } catch (error) {
      throw new Error(`Failed to prune worktrees: ${error}`);
    }
  }

  /**
   * Check if a branch exists
   */
  private async branchExists(branch: string): Promise<boolean> {
    try {
      await execAsync(`git rev-parse --verify "${branch}"`, {
        cwd: this.repoPath
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of all branches
   */
  async getBranches(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git branch -a --format="%(refname:short)"', {
        cwd: this.repoPath
      });
      return stdout.trim().split('\n').filter(b => b);
    } catch {
      return [];
    }
  }

  /**
   * Get current branch name
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
