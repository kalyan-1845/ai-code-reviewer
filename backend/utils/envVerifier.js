export function verifyPort(portVal) {
  const parsed = parseInt(portVal, 10);
  if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    return 5000;
  }
  return parsed;
}

export function verifyHost(hostVal) {
  if (typeof hostVal !== 'string' || hostVal.trim() === '') {
    return 'localhost';
  }
  return hostVal.trim();
}
