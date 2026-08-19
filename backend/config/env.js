export function parsePositiveInt(value, name, defaultVal) {
  if (value === undefined || value === null || value === '') return defaultVal;
  const num = Number(value);
  if (Number.isInteger(num) && num > 0) return num;
  console.warn(`Warning: ${name} must be a positive integer, falling back to default (${defaultVal})`);
  return defaultVal;
}

export const GIT_CLONE_TIMEOUT = parsePositiveInt(process.env.GIT_CLONE_TIMEOUT, 'GIT_CLONE_TIMEOUT', 120000);
export const MAX_CLONE_SIZE_MB = parsePositiveInt(process.env.MAX_CLONE_SIZE_MB, 'MAX_CLONE_SIZE_MB', 100);
