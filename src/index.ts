#!/usr/bin/env node

import { Command } from 'commander';
import { GitWorktree } from './git/worktree.js';
import { WorktreeManagerTUI } from './tui/app.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

const program = new Command();

program
  .name('worktree-manager')
  .description('Terminal app for managing git worktrees with AI assistance')
  .version('1.0.0')
  .argument('[path]', 'Path to git repository', '.')
  .action(async (repoPath: string) => {
    const resolvedPath = path.resolve(repoPath);

    // Validate path exists
    if (!fs.existsSync(resolvedPath)) {
      console.error(chalk.red(`Error: Path does not exist: ${resolvedPath}`));
      process.exit(1);
    }

    // Validate it's a git repo
    if (!GitWorktree.isGitRepo(resolvedPath)) {
      console.error(chalk.red(`Error: Not a git repository: ${resolvedPath}`));
      process.exit(1);
    }

    // Get the repo root (in case user passed a subdirectory)
    const repoRoot = GitWorktree.getRepoRoot(resolvedPath);
    if (!repoRoot) {
      console.error(chalk.red(`Error: Could not determine git repository root`));
      process.exit(1);
    }

    // Launch TUI
    const tui = new WorktreeManagerTUI(repoRoot);
    await tui.start();
  });

// Subcommand: list worktrees (non-interactive)
program
  .command('list')
  .description('List all worktrees (non-interactive)')
  .argument('[path]', 'Path to git repository', '.')
  .action(async (repoPath: string) => {
    const resolvedPath = path.resolve(repoPath);
    const repoRoot = GitWorktree.getRepoRoot(resolvedPath);
    
    if (!repoRoot) {
      console.error(chalk.red('Not a git repository'));
      process.exit(1);
    }

    const git = new GitWorktree(repoRoot);
    const worktrees = await git.list();

    console.log(chalk.cyan.bold('\n  Git Worktrees\n'));
    
    for (const wt of worktrees) {
      const mainBadge = wt.isMain ? chalk.green(' [main]') : '';
      const lockBadge = wt.isLocked ? chalk.red(' [locked]') : '';
      
      console.log(`  ${chalk.yellow('●')} ${chalk.bold(wt.branch)}${mainBadge}${lockBadge}`);
      console.log(`    ${chalk.gray('Path:')} ${wt.path}`);
      console.log(`    ${chalk.gray('Commit:')} ${wt.commit}\n`);
    }
  });

// Subcommand: create worktree
program
  .command('create <branch>')
  .description('Create a new worktree')
  .argument('[path]', 'Path to git repository', '.')
  .option('-b, --base <branch>', 'Base branch to create from', 'main')
  .option('-p, --path <path>', 'Custom path for the worktree')
  .action(async (branch: string, repoPath: string, options: { base: string; path?: string }) => {
    const resolvedPath = path.resolve(repoPath || '.');
    const repoRoot = GitWorktree.getRepoRoot(resolvedPath);
    
    if (!repoRoot) {
      console.error(chalk.red('Not a git repository'));
      process.exit(1);
    }

    const git = new GitWorktree(repoRoot);
    
    console.log(chalk.cyan(`Creating worktree for branch: ${branch}...`));
    
    try {
      const wt = await git.create({
        branch,
        baseBranch: options.base,
        path: options.path
      });
      
      console.log(chalk.green(`✓ Created worktree: ${wt.path}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

// Subcommand: remove worktree
program
  .command('remove <branch-or-path>')
  .description('Remove a worktree')
  .argument('[repo-path]', 'Path to git repository', '.')
  .option('-f, --force', 'Force removal even with local changes')
  .action(async (branchOrPath: string, repoPath: string, options: { force?: boolean }) => {
    const resolvedPath = path.resolve(repoPath || '.');
    const repoRoot = GitWorktree.getRepoRoot(resolvedPath);
    
    if (!repoRoot) {
      console.error(chalk.red('Not a git repository'));
      process.exit(1);
    }

    const git = new GitWorktree(repoRoot);
    const worktrees = await git.list();
    
    // Find worktree by branch name or path
    const wt = worktrees.find(w => 
      w.branch === branchOrPath || 
      w.path === branchOrPath ||
      w.path.endsWith(branchOrPath)
    );
    
    if (!wt) {
      console.error(chalk.red(`Worktree not found: ${branchOrPath}`));
      process.exit(1);
    }

    if (wt.isMain) {
      console.error(chalk.red('Cannot remove main worktree'));
      process.exit(1);
    }

    console.log(chalk.yellow(`Removing worktree: ${wt.branch}...`));
    
    try {
      await git.remove(wt.path, options.force);
      console.log(chalk.green(`✓ Removed worktree: ${wt.branch}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

program.parse();
