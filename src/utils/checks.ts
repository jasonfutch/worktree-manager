import { execSync } from 'child_process';
import chalk from 'chalk';

const MIN_NODE_VERSION = 18;

/**
 * Check if Git is installed and accessible
 */
export function checkGitInstalled(): boolean {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Node.js version meets minimum requirement
 */
export function checkNodeVersion(): boolean {
  const currentVersion = parseInt(process.versions.node.split('.')[0], 10);
  return currentVersion >= MIN_NODE_VERSION;
}

/**
 * Get current Node.js version string
 */
function getNodeVersion(): string {
  return process.versions.node;
}

/**
 * Detect platform for install instructions
 */
function getPlatform(): 'mac' | 'win' | 'linux' {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'win';
  return 'linux';
}

/**
 * Run all startup checks and exit with helpful messages if any fail
 */
export function runStartupChecks(): void {
  const errors: string[] = [];
  const platform = getPlatform();

  // Check Git
  if (!checkGitInstalled()) {
    let installInstructions = '';

    if (platform === 'mac') {
      installInstructions = `
  ${chalk.cyan('macOS:')}
    brew install git
    ${chalk.gray('or install Xcode Command Line Tools:')} xcode-select --install`;
    } else if (platform === 'win') {
      installInstructions = `
  ${chalk.cyan('Windows:')}
    Download from: ${chalk.underline('https://git-scm.com/download/win')}
    ${chalk.gray('or use:')} winget install Git.Git`;
    } else {
      installInstructions = `
  ${chalk.cyan('Ubuntu/Debian:')} sudo apt install git
  ${chalk.cyan('Fedora:')}        sudo dnf install git
  ${chalk.cyan('Arch:')}          sudo pacman -S git`;
    }

    errors.push(`
${chalk.red.bold('Git is not installed or not in PATH.')}

${chalk.yellow('Install Git:')}${installInstructions}
`);
  }

  // Check Node version
  if (!checkNodeVersion()) {
    let updateInstructions = '';

    if (platform === 'mac') {
      updateInstructions = `
  ${chalk.cyan('macOS:')}
    brew upgrade node
    ${chalk.gray('or use nvm:')} nvm install 18`;
    } else if (platform === 'win') {
      updateInstructions = `
  ${chalk.cyan('Windows:')}
    Download from: ${chalk.underline('https://nodejs.org/')}
    ${chalk.gray('or use:')} winget upgrade OpenJS.NodeJS.LTS`;
    } else {
      updateInstructions = `
  ${chalk.cyan('Linux:')}
    Download from: ${chalk.underline('https://nodejs.org/')}
    ${chalk.gray('or use nvm:')} nvm install 18`;
    }

    errors.push(`
${chalk.red.bold(`Node.js ${MIN_NODE_VERSION}+ is required.`)} ${chalk.gray(`You have: ${getNodeVersion()}`)}

${chalk.yellow('Update Node.js:')}${updateInstructions}
`);
  }

  // If any errors, print them and exit
  if (errors.length > 0) {
    console.error(chalk.red.bold('\n  Dependency Check Failed\n'));
    console.error(chalk.gray('─'.repeat(50)));

    for (const error of errors) {
      console.error(error);
    }

    console.error(chalk.gray('─'.repeat(50)));
    process.exit(1);
  }
}
