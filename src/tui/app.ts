import blessed from 'blessed';
import { GitWorktree } from '../git/worktree.js';
import { truncate } from '../utils/helpers.js';
import type { Worktree, BranchInfo } from '../types.js';
import { spawn } from 'child_process';
import { escapeAppleScript, escapeWindowsArg } from '../utils/shell.js';
import { UI, PLATFORM, GIT, getInstallInstruction } from '../constants.js';
import { GitCommandError } from '../errors.js';
import { VERSION } from '../version.js';

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
  private isModalOpen = false;
  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private readonly AUTO_REFRESH_MS = 15000;

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
        bg: 'default'
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
        item: { fg: 'default' }
      },
      keys: false,
      vi: false,
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
      height: '40%',
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
      top: '40%',
      left: '50%',
      width: '50%',
      height: '60%-3',
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
  {blue-fg}e{/} Open Editor     {magenta-fg}a{/} Launch AI
  {magenta-fg}t{/} Open Terminal

{bold}General{/bold}
  {yellow-fg}q{/} Quit           {yellow-fg}?{/} Help`
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
      content: ` v${VERSION} | Press ? for help | q to quit`,
      tags: true
    });

    this.setupKeyBindings();
  }

  private setupKeyBindings(): void {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.stopAutoRefresh();
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

    // Open in Editor
    this.screen.key(['e'], () => this.openInEditor());

    // Open terminal
    this.screen.key(['t'], () => this.openTerminal());

    // Launch AI
    this.screen.key(['a'], () => this.launchAI());

    // Enter - show details
    this.screen.key(['enter'], () => this.showDetails());

    // Show help modal
    this.screen.key(['?'], () => this.showHelp());

    // Focus list by default
    this.worktreeList.focus();
  }

  private moveSelection(delta: number): void {
    if (this.isModalOpen) return;
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

    this.detailBox.setContent(`{bold}Repo:{/} {magenta-fg}${this.repoName}{/}
{bold}Branch:{/} {cyan-fg}${wt.branch}{/}${mainBadge}${lockedBadge}
{bold}Path:{/} ${wt.path}
{bold}Commit:{/} {yellow-fg}${wt.commit}{/}
{bold}Name:{/} ${wt.name}
{bold}Status:{/} ${wt.isBare ? 'Bare' : 'Active'}`);
  }

  private async refresh(): Promise<void> {
    this.setStatus(' Loading worktrees...', 'blue');
    try {
      this.worktrees = await this.git.list();
      this.updateList();
      this.updateDetails();
      this.setStatus(` v${VERSION} | ${this.worktrees.length} worktree${this.worktrees.length === 1 ? '' : 's'} | ? for help`);
    } catch (error) {
      const message = error instanceof GitCommandError
        ? error.getUserMessage()
        : (error instanceof Error ? error.message : String(error));
      this.setStatus(` Error: ${message}`, 'red');
    }
    this.screen.render();
  }

  private updateList(): void {
    const items = this.worktrees.map((wt) => {
      const prefix = wt.isMain ? '★ ' : '  ';
      const locked = wt.isLocked ? ' 🔒' : '';
      return `${prefix}${truncate(wt.branch, UI.BRANCH_TRUNCATE_LENGTH)}${locked}`;
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

  private showConfirm(message: string, label: string, borderColor: string): Promise<boolean> {
    return new Promise((resolve) => {
      const box = blessed.box({
        parent: this.screen,
        left: 'center',
        top: 'center',
        width: UI.MODAL_WIDTH,
        height: 5,
        border: { type: 'line' },
        style: {
          border: { fg: borderColor },
          bg: 'default'
        },
        label: ` ${label} `,
        content: `${message} (y/n)`,
        padding: { left: 1, top: 1 }
      });

      this.screen.render();

      const yesHandler = () => cleanup(true);
      const noHandler = () => cleanup(false);

      const cleanup = (result: boolean) => {
        this.screen.unkey('y', yesHandler);
        this.screen.unkey('Y', yesHandler);
        this.screen.unkey('n', noHandler);
        this.screen.unkey('N', noHandler);
        this.screen.unkey('escape', noHandler);
        box.destroy();
        this.screen.render();
        resolve(result);
      };

      this.screen.key(['y', 'Y'], yesHandler);
      this.screen.key(['n', 'N', 'escape'], noHandler);
    });
  }

  private showTextInputConfirm(message: string, label: string, borderColor: string, requiredInput: string): Promise<boolean> {
    return new Promise((resolve) => {
      const box = blessed.box({
        parent: this.screen,
        left: 'center',
        top: 'center',
        width: UI.MODAL_WIDTH,
        height: 8,
        border: { type: 'line' },
        style: {
          border: { fg: borderColor },
          bg: 'default'
        },
        label: ` ${label} `,
        padding: { left: 1, top: 0 }
      });

      blessed.text({
        parent: box,
        top: 0,
        left: 0,
        content: message,
        style: { fg: 'default' }
      });

      blessed.text({
        parent: box,
        top: 1,
        left: 0,
        content: `Type "${requiredInput}" to confirm (Esc to cancel):`,
        style: { fg: 'gray' }
      });

      const input = blessed.textbox({
        parent: box,
        top: 2,
        left: 0,
        width: UI.MODAL_WIDTH - 6,
        height: 3,
        border: { type: 'line' },
        style: {
          border: { fg: 'cyan' },
          focus: { border: { fg: 'green' } }
        },
        inputOnFocus: true
      });

      this.screen.render();
      input.focus();

      const cleanup = (result: boolean) => {
        box.destroy();
        this.screen.render();
        resolve(result);
      };

      input.key(['escape'], () => cleanup(false));
      input.key(['enter'], () => {
        const value = input.getValue().trim();
        cleanup(value === requiredInput);
      });
    });
  }

  private isProtectedBranch(branch: string): boolean {
    const normalizedBranch = branch.toLowerCase();
    return GIT.PROTECTED_BRANCHES.some(
      protected_branch => normalizedBranch === protected_branch.toLowerCase()
    );
  }

  private showHelp(): void {
    if (this.isModalOpen) return;
    this.isModalOpen = true;

    const helpContent = `{bold}{cyan-fg}Worktree Manager v${VERSION}{/}

{bold}Navigation{/}
  {cyan-fg}↑/k{/}      Move selection up
  {cyan-fg}↓/j{/}      Move selection down
  {cyan-fg}Enter{/}    Show worktree details
  {cyan-fg}r{/}        Refresh worktree list

{bold}Worktree Actions{/}
  {green-fg}n{/}        Create new worktree
  {red-fg}d{/}        Delete selected worktree

{bold}Open in Editor{/}
  {blue-fg}e{/}        Select editor (VS Code, Cursor, Zed, etc.)

{bold}Terminal & AI{/}
  {magenta-fg}t{/}        Open terminal in worktree
  {magenta-fg}a{/}        Launch AI (Claude, Gemini, Codex)

{bold}General{/}
  {yellow-fg}?{/}        Show this help
  {yellow-fg}q{/}        Quit application

{gray-fg}Press any key to close this help...{/}`;

    const box = blessed.box({
      parent: this.screen,
      left: 'center',
      top: 'center',
      width: UI.MODAL_WIDTH,
      height: UI.HELP_MODAL_HEIGHT,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        bg: 'default'
      },
      label: ' Help ',
      content: helpContent,
      tags: true,
      padding: { left: 1, top: 1 }
    });

    this.screen.render();

    const closeHelp = () => {
      this.screen.unkey('escape', closeHelp);
      this.screen.unkey('enter', closeHelp);
      this.screen.unkey('space', closeHelp);
      this.screen.removeListener('keypress', closeHelp);
      box.destroy();
      this.isModalOpen = false;
      this.screen.render();
    };

    // Listen for specific keys to close (not '?' or 'q' to avoid conflicts)
    this.screen.key(['escape', 'enter', 'space'], closeHelp);
    this.screen.once('keypress', closeHelp);
  }

  private async promptCreateWorktree(): Promise<void> {
    if (this.isModalOpen) return;
    this.isModalOpen = true;

    // First, show mode selector
    const modeList = blessed.list({
      parent: this.screen,
      left: 'center',
      top: 'center',
      width: 50,
      height: 8,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        selected: { bg: 'blue', fg: 'white' },
        bg: 'default'
      },
      label: ' Create Worktree ',
      keys: true,
      vi: true,
      items: [
        '  Create new branch',
        '  Use existing branch'
      ]
    });

    modeList.focus();
    this.setStatus(' Select worktree creation mode', 'blue');
    this.screen.render();

    const cleanupModeSelector = () => {
      modeList.destroy();
      this.screen.render();
    };

    modeList.key(['escape'], () => {
      cleanupModeSelector();
      this.isModalOpen = false;
      this.worktreeList.focus();
      this.setStatus(' Cancelled', 'blue');
    });

    modeList.key(['enter'], async () => {
      const selectedIdx = (modeList as blessed.Widgets.ListElement & { selected: number }).selected;
      cleanupModeSelector();

      if (selectedIdx === 0) {
        await this.promptCreateNewBranch();
      } else {
        await this.promptUseExistingBranch();
      }
    });
  }

  private async promptCreateNewBranch(): Promise<void> {
    this.setStatus(' Loading branches...', 'blue');

    // Fetch available branches for base branch selection
    const branches = await this.git.getBranches();

    if (branches.length === 0) {
      this.setStatus(' Warning: Could not load branches. Using default "main"', 'yellow');
    }

    const form = blessed.form({
      parent: this.screen,
      keys: false,
      left: 'center',
      top: 'center',
      width: 60,
      height: UI.CREATE_FORM_HEIGHT,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        bg: 'default'
      },
      label: ' Create New Branch '
    });

    blessed.text({
      parent: form,
      top: 1,
      left: 2,
      content: 'New branch name:',
      style: { fg: 'default' }
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
      content: 'Base branch:',
      style: { fg: 'default' }
    });

    const baseBranchList = blessed.list({
      parent: form,
      top: 7,
      left: 2,
      width: 54,
      height: 8,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
        focus: { border: { fg: 'green' } }
      },
      keys: true,
      vi: true,
      items: branches.length > 0 ? branches : ['main']
    });

    // Pre-select 'main' if it exists
    const mainIndex = branches.indexOf('main');
    if (mainIndex >= 0) {
      baseBranchList.select(mainIndex);
    }

    blessed.text({
      parent: form,
      top: 16,
      left: 2,
      content: 'Tab to switch | ↑↓ to select branch | Enter to create | Esc to cancel',
      style: { fg: 'gray' }
    });

    branchInput.focus();
    this.setStatus(' Enter new branch name', 'blue');

    const submitForm = async () => {
      this.isModalOpen = false;
      const branch = branchInput.getValue().replace(/\t/g, '').trim();
      const selectedIdx = (baseBranchList as blessed.Widgets.ListElement & { selected: number }).selected;
      const branchItems = branches.length > 0 ? branches : ['main'];
      const baseBranch = branchItems[selectedIdx] || 'main';
      form.destroy();
      this.worktreeList.focus();

      if (branch) {
        this.setStatus(` Creating worktree: ${branch} from ${baseBranch}...`, 'blue');
        try {
          await this.git.create({ branch, baseBranch, useExisting: false });
          await this.refresh();
          this.setStatus(` Created worktree: ${branch}`, 'green');
        } catch (error) {
          const message = error instanceof GitCommandError
            ? error.getUserMessage()
            : (error instanceof Error ? error.message : String(error));
          this.setStatus(` Error: ${message}`, 'red');
        }
      } else {
        this.setStatus(' Cancelled - no branch name provided', 'yellow');
      }
      this.screen.render();
    };

    const cancelForm = () => {
      this.isModalOpen = false;
      form.destroy();
      this.worktreeList.focus();
      this.setStatus(' Cancelled', 'blue');
      this.screen.render();
    };

    branchInput.key(['escape'], cancelForm);
    branchInput.key(['enter'], submitForm);
    branchInput.key(['tab'], () => {
      branchInput.setValue(branchInput.getValue().replace(/\t/g, ''));
      branchInput.cancel();
      baseBranchList.focus();
    });

    baseBranchList.key(['escape'], cancelForm);
    baseBranchList.key(['enter'], submitForm);
    baseBranchList.key(['tab'], () => {
      branchInput.focus();
    });

    this.screen.render();
  }

  private async promptUseExistingBranch(): Promise<void> {
    this.setStatus(' Fetching branches...', 'blue');
    this.screen.render();

    // Fetch all branches including remotes
    const allBranches = await this.git.getAllBranches();

    if (allBranches.length === 0) {
      this.isModalOpen = false;
      this.worktreeList.focus();
      this.setStatus(' No available branches found (all may already have worktrees)', 'yellow');
      this.screen.render();
      return;
    }

    const form = blessed.box({
      parent: this.screen,
      left: 'center',
      top: 'center',
      width: 60,
      height: 20,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        bg: 'default'
      },
      label: ' Select Existing Branch '
    });

    blessed.text({
      parent: form,
      top: 1,
      left: 2,
      content: 'Available branches:',
      style: { fg: 'default' }
    });

    // Format branch items for display
    const branchItems = allBranches.map(b => {
      const prefix = b.isRemote ? '{yellow-fg}⬇{/} ' : '  ';
      const label = b.isRemote ? `${b.fullName}` : b.name;
      return `${prefix}${label}`;
    });

    const branchList = blessed.list({
      parent: form,
      top: 3,
      left: 2,
      width: 54,
      height: 12,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
        focus: { border: { fg: 'green' } }
      },
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      items: branchItems,
      scrollbar: {
        ch: '│',
        style: { fg: 'cyan' }
      }
    });

    blessed.text({
      parent: form,
      top: 16,
      left: 2,
      content: '↑↓/jk Navigate | Enter Select | Esc Cancel | {yellow-fg}⬇{/} = remote',
      tags: true,
      style: { fg: 'gray' }
    });

    branchList.focus();
    this.setStatus(' Select a branch to create worktree from', 'blue');
    this.screen.render();

    const cancelForm = () => {
      this.isModalOpen = false;
      form.destroy();
      this.worktreeList.focus();
      this.setStatus(' Cancelled', 'blue');
      this.screen.render();
    };

    branchList.key(['escape'], cancelForm);

    branchList.key(['enter'], async () => {
      const selectedIdx = (branchList as blessed.Widgets.ListElement & { selected: number }).selected;
      const selectedBranch = allBranches[selectedIdx];

      this.isModalOpen = false;
      form.destroy();
      this.worktreeList.focus();

      if (selectedBranch) {
        const displayName = selectedBranch.isRemote ? selectedBranch.fullName : selectedBranch.name;
        const creatingMsg = selectedBranch.isRemote
          ? ` Creating worktree from ${displayName} (will create local tracking branch)...`
          : ` Creating worktree for ${displayName}...`;

        this.setStatus(creatingMsg, 'blue');
        this.screen.render();

        try {
          await this.git.create({
            branch: selectedBranch.fullName,
            useExisting: true
          });
          await this.refresh();
          const successMsg = selectedBranch.isRemote
            ? ` Created worktree: ${selectedBranch.name} (tracking ${selectedBranch.fullName})`
            : ` Created worktree: ${selectedBranch.name}`;
          this.setStatus(successMsg, 'green');
        } catch (error) {
          const message = error instanceof GitCommandError
            ? error.getUserMessage()
            : (error instanceof Error ? error.message : String(error));
          this.setStatus(` Error: ${message}`, 'red');
        }
      }
      this.screen.render();
    });
  }

  private async promptDeleteWorktree(): Promise<void> {
    if (this.isModalOpen) return;
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    if (wt.isMain) {
      this.setStatus(' Cannot delete main worktree', 'red');
      return;
    }

    this.isModalOpen = true;

    const confirmed = await this.showConfirm(
      `Delete worktree "${wt.branch}"?`,
      'Confirm Delete',
      'red'
    );

    if (!confirmed) {
      this.isModalOpen = false;
      this.worktreeList.focus();
      this.setStatus(' Delete cancelled', 'blue');
      return;
    }

    const branchName = wt.branch;
    this.setStatus(` Deleting worktree: ${branchName}...`, 'blue');

    // Show loading indicator in center of screen
    const loadingBox = blessed.box({
      parent: this.screen,
      left: 'center',
      top: 'center',
      width: 40,
      height: 5,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'default'
      },
      label: ' Please Wait ',
      content: `\n  Deleting worktree...\n  This may take a moment.`,
      tags: true
    });
    this.screen.render();

    try {
      await this.git.remove(wt.path, true);
      loadingBox.destroy();
      await this.refresh();
      this.setStatus(` Deleted worktree: ${branchName}`, 'green');

      // Ask about branch deletion (only for non-protected branches)
      if (!this.isProtectedBranch(branchName)) {
        const deleteBranch = await this.showTextInputConfirm(
          `Also delete branch "${branchName}"?`,
          'Delete Branch',
          'yellow',
          'yes'
        );

        if (deleteBranch) {
          this.setStatus(` Deleting branch: ${branchName}...`, 'blue');
          try {
            await this.git.deleteBranch(branchName, true);
            this.setStatus(` Deleted worktree and branch: ${branchName}`, 'green');
          } catch (branchError) {
            const message = branchError instanceof GitCommandError
              ? branchError.getUserMessage()
              : (branchError instanceof Error ? branchError.message : String(branchError));
            this.setStatus(` Worktree deleted, but branch deletion failed: ${message}`, 'yellow');
          }
        } else {
          this.setStatus(` Deleted worktree: ${branchName} (branch kept)`, 'green');
        }
      }
    } catch (error) {
      loadingBox.destroy();
      const message = error instanceof GitCommandError
        ? error.getUserMessage()
        : (error instanceof Error ? error.message : String(error));
      this.setStatus(` Error: ${message}`, 'red');
    }

    this.isModalOpen = false;
    this.worktreeList.focus();
  }

  private openInEditor(): void {
    if (this.isModalOpen) return;
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    this.isModalOpen = true;

    const editors = [
      { name: 'VS Code', command: 'code' },
      { name: 'Cursor', command: 'cursor' },
      { name: 'Zed', command: 'zed' },
      { name: 'WebStorm', command: 'webstorm' },
      { name: 'Sublime Text', command: 'subl' },
      { name: 'Neovim', command: 'nvim', terminal: true }
    ];

    const list = blessed.list({
      parent: this.screen,
      left: 'center',
      top: 'center',
      width: UI.SELECTOR_WIDTH,
      height: UI.EDITOR_SELECTOR_HEIGHT,
      border: { type: 'line' },
      style: {
        border: { fg: 'blue' },
        selected: { bg: 'blue', fg: 'white' },
        bg: 'default'
      },
      label: ' Select Editor ',
      keys: true,
      vi: true,
      items: editors.map(e => `  ${e.name} (${e.command})`)
    });

    list.focus();
    this.screen.render();

    const cleanup = () => {
      list.destroy();
      this.isModalOpen = false;
      this.worktreeList.focus();
      this.screen.render();
    };

    list.key(['escape'], cleanup);

    list.key(['enter'], () => {
      const selectedIdx = (list as blessed.Widgets.ListElement & { selected: number }).selected;
      const editor = editors[selectedIdx];
      cleanup();
      this.openEditorTool(editor.command, editor.name, editor.terminal);
    });
  }

  private openEditorTool(command: string, name: string, terminal = false): void {
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    this.setStatus(` Opening ${wt.branch} in ${name}...`, 'blue');

    const handleError = (err: Error) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        const hint = getInstallInstruction(command);
        this.setStatus(` ${name} not found. ${hint}`, 'red');
      } else {
        this.setStatus(` Error: ${err.message}`, 'red');
      }
    };

    try {
      let proc;
      if (terminal) {
        // Terminal-based editors need to open in a new terminal
        if (PLATFORM.IS_MAC) {
          const escapedPath = escapeAppleScript(wt.path);
          const script = `
            tell application "Terminal"
              do script "cd '${escapedPath}' && ${command} ."
              activate
            end tell
          `;
          proc = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
        } else if (PLATFORM.IS_WIN) {
          const escapedPath = escapeWindowsArg(wt.path);
          proc = spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d ${escapedPath} && ${command} .`], {
            detached: true,
            stdio: 'ignore',
            shell: true
          });
        } else {
          // Linux - pass path safely via argument array
          proc = spawn('gnome-terminal', ['--working-directory', wt.path, '--', command, '.'], {
            detached: true,
            stdio: 'ignore'
          });
        }
      } else {
        // GUI editors can open directly - pass path via array (safe)
        proc = spawn(command, [wt.path], { detached: true, stdio: 'ignore' });
      }
      proc.on('error', handleError);
      proc.unref();
      this.setStatus(` Opened ${wt.branch} in ${name}`, 'green');
    } catch (error) {
      this.setStatus(` Error: ${error instanceof Error ? error.message : error}`, 'red');
    }
  }

  private openTerminal(): void {
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    this.setStatus(` Opening terminal in ${wt.branch}...`, 'blue');

    try {
      if (PLATFORM.IS_MAC) {
        // Open in new Terminal.app tab - path passed as argument (safe)
        spawn('open', ['-a', 'Terminal', wt.path], { detached: true, stdio: 'ignore' });
      } else if (PLATFORM.IS_WIN) {
        // Windows - escape path for cmd.exe
        const escapedPath = escapeWindowsArg(wt.path);
        spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d ${escapedPath}`], {
          detached: true,
          stdio: 'ignore',
          shell: true
        });
      } else if (PLATFORM.IS_WSL) {
        // WSL - pass path directly to wt.exe
        spawn('wt.exe', ['-d', wt.path], { detached: true, stdio: 'ignore' });
      } else {
        // Linux - try common terminal emulators, pass path via argument array (safe)
        const terminals = ['gnome-terminal', 'konsole', 'xterm', 'terminator'];
        let launched = false;
        for (const term of terminals) {
          try {
            const proc = spawn(term, ['--working-directory', wt.path], {
              detached: true,
              stdio: 'ignore'
            });
            proc.on('error', () => { /* silent */ });
            proc.unref();
            launched = true;
            break;
          } catch {
            // Try next terminal
          }
        }
        if (!launched) {
          this.setStatus(' No terminal emulator found. Install gnome-terminal, konsole, xterm, or terminator', 'red');
          return;
        }
      }
      this.setStatus(` Opened terminal in ${wt.branch}`, 'green');
    } catch (error) {
      this.setStatus(` Error: ${error instanceof Error ? error.message : error}`, 'red');
    }
  }

  private launchAI(): void {
    if (this.isModalOpen) return;
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    this.isModalOpen = true;

    const aiTools = [
      { name: 'Claude', command: 'claude' },
      { name: 'Gemini', command: 'gemini' },
      { name: 'Codex', command: 'codex' }
    ];

    const list = blessed.list({
      parent: this.screen,
      left: 'center',
      top: 'center',
      width: UI.SELECTOR_WIDTH,
      height: UI.AI_SELECTOR_HEIGHT,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        selected: { bg: 'blue', fg: 'white' },
        bg: 'default'
      },
      label: ' Select AI Tool ',
      keys: true,
      vi: true,
      items: aiTools.map(t => `  ${t.name} (${t.command})`)
    });

    list.focus();
    this.screen.render();

    const cleanup = () => {
      list.destroy();
      this.isModalOpen = false;
      this.worktreeList.focus();
      this.screen.render();
    };

    list.key(['escape'], cleanup);

    list.key(['enter'], () => {
      const selectedIdx = (list as blessed.Widgets.ListElement & { selected: number }).selected;
      const tool = aiTools[selectedIdx];
      cleanup();
      this.launchAITool(tool.command, tool.name);
    });
  }

  private launchAITool(command: string, name: string): void {
    const wt = this.worktrees[this.selectedIndex];
    if (!wt) return;

    this.setStatus(` Launching ${name} in ${wt.branch}...`, 'blue');

    try {
      let proc;
      if (PLATFORM.IS_MAC) {
        const escapedPath = escapeAppleScript(wt.path);
        const script = `
          tell application "Terminal"
            do script "cd '${escapedPath}' && ${command}"
            activate
          end tell
        `;
        proc = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
      } else if (PLATFORM.IS_WIN) {
        const escapedPath = escapeWindowsArg(wt.path);
        proc = spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d ${escapedPath} && ${command}`], {
          detached: true,
          stdio: 'ignore',
          shell: true
        });
      } else {
        // Linux - pass arguments via array (safe)
        proc = spawn('gnome-terminal', ['--working-directory', wt.path, '--', command], {
          detached: true,
          stdio: 'ignore'
        });
      }

      proc.on('error', (err: Error) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          const hint = getInstallInstruction(command);
          this.setStatus(` ${name} not found. ${hint}`, 'red');
        }
      });
      proc.unref();
      this.setStatus(` Launched ${name} in ${wt.branch}`, 'magenta');
    } catch (error) {
      this.setStatus(` Error: ${error instanceof Error ? error.message : error}`, 'red');
    }
  }

  private showDetails(): void {
    // Details are already shown in the detail panel
    this.updateDetails();
    this.screen.render();
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.autoRefreshInterval = setInterval(async () => {
      // Only auto-refresh when no modal is open
      if (!this.isModalOpen) {
        await this.refresh();
      }
    }, this.AUTO_REFRESH_MS);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  async start(): Promise<void> {
    await this.refresh();
    this.startAutoRefresh();
    this.worktreeList.focus();
    this.screen.render();
  }
}
