function parsePositiveInt(value, name, defaultVal) {
  const num = parseInt(value, 10);
  if (Number.isFinite(num) && num > 0) return num;
  if (value !== undefined) {
    console.warn(`Warning: ${name} must be a positive integer, falling back to default (${defaultVal})`);
  }
  return defaultVal;
}

export const GIT_CLONE_TIMEOUT = parsePositiveInt(process.env.GIT_CLONE_TIMEOUT, 'GIT_CLONE_TIMEOUT', 120000);
export const MAX_CLONE_SIZE_MB = parsePositiveInt(process.env.MAX_CLONE_SIZE_MB, 'MAX_CLONE_SIZE_MB', 100);
