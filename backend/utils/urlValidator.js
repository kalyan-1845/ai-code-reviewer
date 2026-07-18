import dns from 'node:dns';
import net from 'node:net';
import { promisify } from 'node:util';

const dnsLookup = promisify(dns.lookup);

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

  if (!net.isIPv4(ip)) return false;

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;

  const first = parts[0];
  const second = parts[1];

  // 127.0.0.0/8 (Loopback)
  if (first === 127) return true;
  // 10.0.0.0/8 (Private)
  if (first === 10) return true;
  // 192.168.0.0/16 (Private)
  if (first === 192 && second === 168) return true;
  // 172.16.0.0/12 (Private range: 172.16.0.0 - 172.31.255.255)
  if (first === 172 && second >= 16 && second <= 31) return true;
  // 0.0.0.0/8 (Broadcast/Local)
  if (first === 0) return true;
  // 100.64.0.0/10 (Shared Address Space: 100.64.0.0 - 100.127.255.255)
  if (first === 100 && second >= 64 && second <= 127) return true;
  // 198.18.0.0/15 (Benchmark: 198.18.0.0 - 198.19.255.255)
  if (first === 198 && second >= 18 && second <= 19) return true;
  // 169.254.0.0/16 (Link Local)
  if (first === 169 && second === 254) return true;

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
