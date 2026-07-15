import dns from 'node:dns';
import net from 'node:net';
import { promisify } from 'node:util';

const dnsLookup = promisify(dns.lookup);

const PRIVATE_IP_RANGES = [
  { prefix: '127.', mask: 8 },
  { prefix: '10.', mask: 8 },
  { prefix: '192.168.', mask: 16 },
  { prefix: '172.16.', mask: 12 },
  { prefix: '0.', mask: 8 },
  { prefix: '100.64.', mask: 10 },
  { prefix: '198.18.', mask: 15 },
];

const LINK_LOCAL_RANGES = [
  { prefix: '169.254.', mask: 16 },
];

const METADATA_IPS = new Set([
  '169.254.169.254',
  'fd00:ec2::254',
  '100.100.100.200',
  '100.100.100.204',
]);

function isPrivateIP(ip) {
  if (METADATA_IPS.has(ip)) return true;
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return false;
  }
  for (const range of PRIVATE_IP_RANGES) {
    if (ip.startsWith(range.prefix)) return true;
  }
  for (const range of LINK_LOCAL_RANGES) {
    if (ip.startsWith(range.prefix)) return true;
  }
  return false;
}

function validateUrlBasic(url) {
  if (!url || typeof url !== 'string') return { valid: false, reason: 'URL must be a non-empty string' };
  if (/[\s\x00-\x1f]/.test(url)) return { valid: false, reason: 'URL contains invalid characters' };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'URL is malformed' };
  }
  if (parsed.protocol !== 'https:') return { valid: false, reason: 'Only HTTPS URLs are allowed' };
  if (parsed.username || parsed.password) return { valid: false, reason: 'URL must not contain embedded credentials' };
  return { valid: true, parsed };
}

export async function isSafeUrl(url) {
  const basic = validateUrlBasic(url);
  if (!basic.valid) return basic;
  const { parsed } = basic;
  try {
    const { address } = await dnsLookup(parsed.hostname, { verbatim: true });
    if (isPrivateIP(address)) {
      return { valid: false, reason: `URL resolves to a private or restricted IP (${address})` };
    }
  } catch {
    return { valid: false, reason: `Failed to resolve hostname: ${parsed.hostname}` };
  }
  return { valid: true };
}

export function isValidRepoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (/[\s\x00-\x1f]/.test(url)) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.hostname !== 'github.com') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;
  if (parsed.pathname.includes('//')) return false;
  const path = parsed.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length !== 2) return false;
  const SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;
  if (!SEGMENT_RE.test(segments[0]) || !SEGMENT_RE.test(segments[1])) return false;
  if (segments[0].startsWith('-') || segments[1].startsWith('-')) return false;
  if (segments[0].includes('--') || segments[1].includes('--')) return false;
  return true;
}

export function parseRepoUrl(url) {
  if (!isValidRepoUrl(url)) return null;
  const cleanUrl = url.replace(/\/+$/, '').replace(/\.git$/, '');
  const parts = cleanUrl.split('/');
  return {
    owner: parts[parts.length - 2],
    repo: parts[parts.length - 1]
  };
}
