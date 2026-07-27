import util from 'util';
import { execFile } from 'child_process';

const execFileAsync = util.promisify(execFile);

/**
 * Validates branch names to prevent shell injection.
 * Allows only alphanumeric characters, hyphens, slashes, and underscores.
 * @param {string} branch - The branch name to validate.
 * @returns {boolean} - True if valid, false otherwise.
 */
export function isValidBranchName(branch) {
  const branchRegex = /^[a-zA-Z0-9-_/]+$/;
  return branchRegex.test(branch) && !branch.includes('..');
}

/**
 * Executes a git diff to get the delta between two branches.
 * @param {string} repoAbsolutePath - The absolute path to the git repository.
 * @param {string} baseBranch - The base branch name.
 * @param {string} headBranch - The head branch name.
 * @returns {Promise<string>} - The raw diff string.
 */
export async function getPullRequestDiff(repoAbsolutePath, baseBranch, headBranch) {
  if (!isValidBranchName(baseBranch)) {
    throw new Error(`Invalid base branch name: ${baseBranch}`);
  }
  if (!isValidBranchName(headBranch)) {
    throw new Error(`Invalid head branch name: ${headBranch}`);
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--unified=3', `origin/${baseBranch}`, `origin/${headBranch}`],
      { cwd: repoAbsolutePath }
    );
    return stdout;
  } catch (error) {
    throw new Error(`Failed to execute git diff: ${error.message}`);
  }
}
