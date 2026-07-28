export function verifyPort(portVal) {
  let cleanVal = portVal;
  if (typeof portVal === 'string') {
    cleanVal = portVal.trim();
  }
  if (cleanVal === undefined || cleanVal === '' || cleanVal === null) {
    return 5000;
  }
  if (typeof cleanVal !== 'string' && typeof cleanVal !== 'number') {
    throw new Error(`Invalid port: ${portVal} must be a string or number`);
  }
  if (typeof cleanVal === 'string' && !/^\d+$/.test(cleanVal)) {
    throw new Error(`Invalid port: "${portVal}" contains non-numeric characters`);
  }
  const parsed = Number(cleanVal);
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
