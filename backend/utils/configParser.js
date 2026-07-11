import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Loads the repository configuration from .reposage.yml, .reposage.yaml, or reposage.json.
 * @param {string} repoPath - The root path of the cloned repository.
 * @returns {Object} The parsed configuration object, or an empty object if not found or invalid.
 */
export function loadRepoConfig(repoPath) {
  const configPaths = ['.reposage.yml', '.reposage.yaml', 'reposage.json'];
  let repoConfig = {};

  for (const configPath of configPaths) {
    const fullPath = path.join(repoPath, configPath);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (configPath.endsWith('.json')) {
          repoConfig = JSON.parse(content);
        } else {
          repoConfig = yaml.load(content) || {};
        }
        console.log(`Loaded config from ${configPath}`);
        break; // Only load the first one found
      } catch (err) {
        console.warn(`Failed to parse ${configPath}:`, err.message);
      }
    }
  }

  return repoConfig;
}
