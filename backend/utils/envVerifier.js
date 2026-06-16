export function verifyPort(portVal) {
  if (portVal === undefined || portVal === '' || portVal === null) {
    return 5000;
  }
  if (typeof portVal !== 'string' && typeof portVal !== 'number') {
    throw new Error(`Invalid port: ${portVal} must be a string or number`);
  }
  if (typeof portVal === 'string' && !/^\d+$/.test(portVal)) {
    throw new Error(`Invalid port: "${portVal}" contains non-numeric characters`);
  }
  const parsed = Number(portVal);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${portVal} must be an integer between 0 and 65535`);
  }
  return parsed;
}

export function verifyHost(hostVal) {
  if (typeof hostVal !== 'string' || hostVal.trim() === '') {
    return 'localhost';
  }
  return hostVal.trim();
}
