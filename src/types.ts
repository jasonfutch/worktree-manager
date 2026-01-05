export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  isBare: boolean;
  isLocked: boolean;
  name: string; // Derived friendly name
}

export interface Project {
  name: string;
  rootPath: string;
  worktrees: Worktree[];
  selectedWorktree: number;
}

export interface Session {
  id: string;
  worktreePath: string;
  branch: string;
  pid?: number;
  active: boolean;
  output: string[];
}

export interface AppState {
  projects: Project[];
  selectedProject: number;
  sessions: Map<string, Session>;
  mode: 'projects' | 'worktrees' | 'terminal' | 'create';
  statusMessage: string;
}

export interface CreateWorktreeOptions {
  branch: string;
  baseBranch?: string;
  path?: string;
}
