#!/usr/bin/env node

import { Command } from 'commander';
import { GitWorktree } from './git/worktree.js';
import { WorktreeManagerTUI } from './tui/app.js';
import { runStartupChecks } from './utils/checks.js';
import { openEditor, openTerminal, launchAI, validEditors, validAITools, type EditorType, type AIToolType } from './utils/launch.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { GIT } from './constants.js';

// Check dependencies before anything else
runStartupChecks();

// Helper to prompt user for input
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Helper to check if a branch is protected
function isProtectedBranch(branch: string): boolean {
  const normalizedBranch = branch.toLowerCase();
  return GIT.PROTECTED_BRANCHES.some(
    protectedBranch => normalizedBranch === protectedBranch.toLowerCase()
  );
}

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

    const branchName = wt.branch;
    console.log(chalk.yellow(`Removing worktree: ${branchName}...`));

    try {
      await git.remove(wt.path, options.force);
      console.log(chalk.green(`✓ Removed worktree: ${branchName}`));

      // Ask about branch deletion (only for non-protected branches)
      if (!isProtectedBranch(branchName)) {
        const answer = await promptUser(
          chalk.yellow(`\nAlso delete branch "${branchName}"? Type "yes" to confirm (or press Enter to skip): `)
        );

        if (answer === 'yes') {
          console.log(chalk.yellow(`Deleting branch: ${branchName}...`));
          try {
            await git.deleteBranch(branchName, true);
            console.log(chalk.green(`✓ Deleted branch: ${branchName}`));
          } catch (branchError) {
            console.error(chalk.yellow(`⚠ Branch deletion failed: ${branchError}`));
          }
        } else {
          console.log(chalk.gray(`Branch "${branchName}" kept.`));
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

// Helper to find worktree by branch or path
async function findWorktree(branchOrPath: string, repoPath: string) {
  const resolvedPath = path.resolve(repoPath || '.');
  const repoRoot = GitWorktree.getRepoRoot(resolvedPath);

  if (!repoRoot) {
    console.error(chalk.red('Not a git repository'));
    process.exit(1);
  }

  const git = new GitWorktree(repoRoot);
  const worktrees = await git.list();

  const wt = worktrees.find(w =>
    w.branch === branchOrPath ||
    w.path === branchOrPath ||
    w.path.endsWith(branchOrPath) ||
    w.name === branchOrPath
  );

  if (!wt) {
    console.error(chalk.red(`Worktree not found: ${branchOrPath}`));
    process.exit(1);
  }

  return wt;
}

// Subcommand: open worktree in editor
program
  .command('open <branch-or-path>')
  .description('Open a worktree in an editor')
  .argument('[repo-path]', 'Path to git repository', '.')
  .option('-e, --editor <editor>', `Editor to use (${validEditors.join(', ')})`, 'code')
  .action(async (branchOrPath: string, repoPath: string, options: { editor: string }) => {
    const editor = options.editor as EditorType;

    if (!validEditors.includes(editor)) {
      console.error(chalk.red(`Invalid editor: ${editor}`));
      console.error(chalk.gray(`Valid options: ${validEditors.join(', ')}`));
      process.exit(1);
    }

    const wt = await findWorktree(branchOrPath, repoPath);
    console.log(chalk.cyan(`Opening ${wt.branch} in ${editor}...`));
    openEditor(wt.path, editor);
  });

// Subcommand: open terminal in worktree
program
  .command('terminal <branch-or-path>')
  .alias('term')
  .description('Open a terminal in a worktree')
  .argument('[repo-path]', 'Path to git repository', '.')
  .action(async (branchOrPath: string, repoPath: string) => {
    const wt = await findWorktree(branchOrPath, repoPath);
    console.log(chalk.cyan(`Opening terminal in ${wt.branch}...`));
    openTerminal(wt.path);
  });

// Subcommand: launch AI tool in worktree
program
  .command('ai <branch-or-path>')
  .description('Launch an AI tool in a worktree')
  .argument('[repo-path]', 'Path to git repository', '.')
  .option('-t, --tool <tool>', `AI tool to use (${validAITools.join(', ')})`, 'claude')
  .action(async (branchOrPath: string, repoPath: string, options: { tool: string }) => {
    const tool = options.tool as AIToolType;

    if (!validAITools.includes(tool)) {
      console.error(chalk.red(`Invalid AI tool: ${tool}`));
      console.error(chalk.gray(`Valid options: ${validAITools.join(', ')}`));
      process.exit(1);
    }

    const wt = await findWorktree(branchOrPath, repoPath);
    console.log(chalk.cyan(`Launching ${tool} in ${wt.branch}...`));
    launchAI(wt.path, tool);
  });

// Subcommand: help with examples
program
  .command('help')
  .description('Show detailed help and examples')
  .action(() => {
    console.log(`
${chalk.cyan.bold('Worktree Manager')} - Terminal app for managing git worktrees

${chalk.yellow.bold('QUICK START')}
  ${chalk.gray('Launch TUI in current repo:')}
  $ ${chalk.green('wtm')}

  ${chalk.gray('Launch TUI for specific repo:')}
  $ ${chalk.green('wtm /path/to/repo')}

${chalk.yellow.bold('CLI COMMANDS')}

  ${chalk.cyan('wtm list')} ${chalk.gray('[path]')}
    List all worktrees
    $ wtm list
    $ wtm list /path/to/repo

  ${chalk.cyan('wtm create')} ${chalk.white('<branch>')} ${chalk.gray('[path] [-b base] [-p path]')}
    Create a new worktree
    $ wtm create feature/login
    $ wtm create feature/api -b develop
    $ wtm create bugfix/issue-42 -p /custom/path

  ${chalk.cyan('wtm remove')} ${chalk.white('<branch>')} ${chalk.gray('[path] [-f]')}
    Remove a worktree
    $ wtm remove feature/login
    $ wtm remove feature/old --force

  ${chalk.cyan('wtm open')} ${chalk.white('<branch>')} ${chalk.gray('[path] [-e editor]')}
    Open worktree in editor
    $ wtm open feature/login
    $ wtm open main -e cursor
    ${chalk.gray('Editors: code, cursor, zed, webstorm, subl, nvim')}

  ${chalk.cyan('wtm terminal')} ${chalk.white('<branch>')} ${chalk.gray('[path]')}
    Open terminal in worktree
    $ wtm terminal feature/login
    $ wtm term main

  ${chalk.cyan('wtm ai')} ${chalk.white('<branch>')} ${chalk.gray('[path] [-t tool]')}
    Launch AI tool in worktree
    $ wtm ai feature/login
    $ wtm ai main -t gemini
    ${chalk.gray('Tools: claude, gemini, codex')}

${chalk.yellow.bold('TUI KEYBINDINGS')}
  ${chalk.cyan('↑/k, ↓/j')}    Navigate worktrees
  ${chalk.cyan('Enter')}       Show details
  ${chalk.cyan('n')}           Create new worktree
  ${chalk.cyan('d')}           Delete worktree
  ${chalk.cyan('e')}           Open in editor
  ${chalk.cyan('t')}           Open terminal
  ${chalk.cyan('a')}           Launch AI tool
  ${chalk.cyan('r')}           Refresh list
  ${chalk.cyan('?')}           Show help
  ${chalk.cyan('q')}           Quit
`);
  });

program.parse();
