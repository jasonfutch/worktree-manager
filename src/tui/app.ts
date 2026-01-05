import blessed from 'blessed';
import { GitWorktree } from '../git/worktree.js';
import { openInVSCode, openInCursor, truncate } from '../utils/helpers.js';
import type { Worktree, AppState } from '../types.js';
import { spawn } from 'child_process';
import path from 'path';

export class WorktreeManagerTUI {
  private screen: blessed.Widgets.Screen;
  private mainBox: blessed.Widgets.BoxElement;
  private worktreeList: blessed.Widgets.ListElement;
  private detailBox: blessed.Widgets.BoxElement;
  private statusBar: blessed.Widgets.BoxElement;
  private helpBox: blessed.Widgets.BoxElement;
  private inputBox: blessed.Widgets.TextboxElement | null = null;
  
  private git: GitWorktree;
  private worktrees: Worktree[] = [];
  private selectedIndex = 0;
  private repoPath: string;
  private repoName: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = new GitWorktree(repoPath);
    this.repoName = this.git.getRepoName();

    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: `Worktree Manager - ${this.repoName}`,
      fullUnicode: true
    });

    // Create main layout
    this.mainBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-1',
      style: {
        bg: 'black'
      }
    });

    // Worktree list (left panel)
    this.worktreeList = blessed.list({
      parent: this.mainBox,
      label: ` 🌳 Worktrees - ${this.repoName} `,
      top: 0,
      left: 0,
      width: '50%',
      height: '100%-3',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white', bold: true },
        item: { fg: 'white' }
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: '│',
        style: { fg: 'cyan' }
      }
    });

    // Detail panel (right)
    this.detailBox = blessed.box({
      parent: this.mainBox,
      label: ' 📋 Details ',
      top: 0,
      left: '50%',
      width: '50%',
      height: '60%',
      border: { type: 'line' },
      style: {
        border: { fg: 'green' }
      },
      content: '',
      tags: true,
      padding: 1
    });

    // Help panel (bottom right)
    this.helpBox = blessed.box({
      parent: this.mainBox,
      label: ' ⌨️  Keybindings ',
      top: '60%',
      left: '50%',
      width: '50%',
      height: '40%-3',
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' }
      },
      tags: true,
      padding: 1,
      content: `{bold}Navigation{/bold}
  {cyan-fg}↑/k{/} Move up    {cyan-fg}↓/j{/} Move down
  {cyan-fg}Enter{/} Select    {cyan-fg}r{/} Refresh

{bold}Actions{/bold}
  {green-fg}n{/} New worktree    {red-fg}d{/} Delete worktree
  {blue-fg}c{/} Open VS Code    {blue-fg}u{/} Open Cursor
  {magenta-fg}t{/} Open Terminal   {magenta-fg}a{/} Launch Claude

{bold}General{/bold}
  {yellow-fg}q{/} Quit           {yellow-fg}?{/} Toggle help`
    });

    // Status bar
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        bg: 'blue',
        fg: 'white'
      },
      content: ' Ready | Press ? for help | q to quit',
      tags: true
    });

    this.setupKeyBindings();
  }

  private setupKeyBindings(): void {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.screen.destroy();
      process.exit(0);
    });

    // Navigation
    this.screen.key(['j', 'down'], () => this.moveSelection(1));
    this.screen.key(['k', 'up'], () => this.moveSelection(-1));

    // Refresh
    this.screen.key(['r'], () => this.refresh());

    // Create new worktree
    this.screen.key(['n'], () => this.promptCreateWorktree());

    // Delete worktree
    this.screen.key(['d'], () => this.promptDeleteWorktree());

    // Open in VS Code
    this.screen.key(['c'], () => this.openSelectedInEditor('code'));

    // Open in Cursor
    this.screen.key(['u'], () => this.openSelectedInEditor('cursor'));

    // Open terminal
    this.screen.key(['t'], () => this.openTerminal());

    // Launch Claude
    this.screen.key(['a'], () => this.launchClaude());

    // Enter - show details
    this.screen.key(['enter'], () => this.showDetails());

    // Focus list by default
    this.worktreeList.focus();
  }

  private moveSelection(delta: number): void {
    const newIndex = Math.max(0, Math.min(this.worktrees.length - 1, this.selectedIndex + delta));
    if (newIndex !== this.selectedIndex) {
      this.selectedIndex = newIndex;
      this.worktreeList.select(this.selectedIndex);
      this.updateDetails();
      this.screen.render();
    }
  }

  private updateDetails(): void {
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) {
      this.detailBox.setContent('No worktree selected');
      return;
    }

    const mainBadge = wt.isMain ? ' {green-fg}[MAIN]{/}' : '';
    const lockedBadge = wt.isLocked ? ' {red-fg}[LOCKED]{/}' : '';

    this.detailBox.setContent(`{bold}Branch:{/} {cyan-fg}${wt.branch}{/}${mainBadge}${lockedBadge}

{bold}Path:{/}
  ${wt.path}

{bold}Commit:{/} {yellow-fg}${wt.commit}{/}

{bold}Name:{/} ${wt.name}

{bold}Status:{/} ${wt.isBare ? 'Bare' : 'Active'}
`);
  }

  private async refresh(): Promise<void> {
    this.setStatus(' Refreshing...');
    try {
      this.worktrees = await this.git.list();
      this.updateList();
      this.updateDetails();
      this.setStatus(` Loaded ${this.worktrees.length} worktrees`);
    } catch (error) {
      this.setStatus(` Error: ${error}`, 'red');
    }
    this.screen.render();
  }

  private updateList(): void {
    const items = this.worktrees.map((wt, i) => {
      const prefix = wt.isMain ? '★ ' : '  ';
      const locked = wt.isLocked ? ' 🔒' : '';
      return `${prefix}${truncate(wt.branch, 30)}${locked}`;
    });
    
    this.worktreeList.setItems(items);
    if (this.selectedIndex >= items.length) {
      this.selectedIndex = Math.max(0, items.length - 1);
    }
    this.worktreeList.select(this.selectedIndex);
  }

  private setStatus(message: string, color = 'blue'): void {
    this.statusBar.style.bg = color;
    this.statusBar.setContent(message);
    this.screen.render();
  }

  private promptCreateWorktree(): void {
    const form = blessed.form({
      parent: this.screen,
      keys: true,
      left: 'center',
      top: 'center',
      width: 60,
      height: 12,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        bg: 'black'
      },
      label: ' Create New Worktree '
    });

    blessed.text({
      parent: form,
      top: 1,
      left: 2,
      content: 'Branch name:',
      style: { fg: 'white' }
    });

    const branchInput = blessed.textbox({
      parent: form,
      top: 2,
      left: 2,
      width: 54,
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        focus: { border: { fg: 'green' } }
      },
      inputOnFocus: true
    });

    blessed.text({
      parent: form,
      top: 6,
      left: 2,
      content: 'Enter to create | Escape to cancel',
      style: { fg: 'gray' }
    });

    branchInput.focus();

    branchInput.key(['escape'], () => {
      form.destroy();
      this.worktreeList.focus();
      this.screen.render();
    });

    branchInput.key(['enter'], async () => {
      const branch = branchInput.getValue().trim();
      form.destroy();
      this.worktreeList.focus();
      
      if (branch) {
        this.setStatus(` Creating worktree for branch: ${branch}...`);
        try {
          await this.git.create({ branch });
          await this.refresh();
          this.setStatus(` Created worktree: ${branch}`, 'green');
        } catch (error) {
          this.setStatus(` Error: ${error}`, 'red');
        }
      }
      this.screen.render();
    });

    this.screen.render();
  }

  private promptDeleteWorktree(): void {
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    if (wt.isMain) {
      this.setStatus(' Cannot delete main worktree', 'red');
      return;
    }

    const confirmBox = blessed.question({
      parent: this.screen,
      left: 'center',
      top: 'center',
      width: 50,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'red' },
        bg: 'black'
      },
      label: ' Confirm Delete '
    });

    confirmBox.ask(`Delete worktree "${wt.branch}"?`, async (err, confirmed) => {
      confirmBox.destroy();
      this.worktreeList.focus();
      
      if (confirmed) {
        this.setStatus(` Deleting worktree: ${wt.branch}...`);
        try {
          await this.git.remove(wt.path, true);
          await this.refresh();
          this.setStatus(` Deleted worktree: ${wt.branch}`, 'green');
        } catch (error) {
          this.setStatus(` Error: ${error}`, 'red');
        }
      }
      this.screen.render();
    });

    this.screen.render();
  }

  private async openSelectedInEditor(editor: 'code' | 'cursor'): Promise<void> {
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    this.setStatus(` Opening ${wt.branch} in ${editor === 'code' ? 'VS Code' : 'Cursor'}...`);
    
    try {
      if (editor === 'code') {
        await openInVSCode(wt.path);
      } else {
        await openInCursor(wt.path);
      }
      this.setStatus(` Opened ${wt.branch}`, 'green');
    } catch (error) {
      this.setStatus(` Error: ${error}`, 'red');
    }
  }

  private openTerminal(): void {
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    // Determine terminal app based on OS
    const isWsl = process.platform === 'linux' && process.env.WSL_DISTRO_NAME;
    const isMac = process.platform === 'darwin';

    if (isMac) {
      // Open in new Terminal.app tab
      spawn('open', ['-a', 'Terminal', wt.path], { detached: true, stdio: 'ignore' });
    } else if (isWsl) {
      spawn('wt.exe', ['-d', wt.path], { detached: true, stdio: 'ignore' });
    } else {
      // Linux - try common terminal emulators
      const terminals = ['gnome-terminal', 'konsole', 'xterm', 'terminator'];
      for (const term of terminals) {
        try {
          spawn(term, ['--working-directory', wt.path], { detached: true, stdio: 'ignore' });
          break;
        } catch {}
      }
    }

    this.setStatus(` Opened terminal in ${wt.branch}`, 'green');
  }

  private launchClaude(): void {
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    // Spawn Claude in the worktree directory
    // Using the approach similar to what vibe-tree does
    const isMac = process.platform === 'darwin';

    if (isMac) {
      // Use osascript to open a new Terminal window and run claude
      const script = `
        tell application "Terminal"
          do script "cd '${wt.path}' && claude"
          activate
        end tell
      `;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    } else {
      // Linux - open terminal with claude
      spawn('gnome-terminal', ['--working-directory', wt.path, '--', 'claude'], { 
        detached: true, 
        stdio: 'ignore' 
      });
    }

    this.setStatus(` Launched Claude in ${wt.branch}`, 'magenta');
  }

  private showDetails(): void {
    // Details are already shown in the detail panel
    this.updateDetails();
    this.screen.render();
  }

  async start(): Promise<void> {
    await this.refresh();
    this.worktreeList.focus();
    this.screen.render();
  }
}
