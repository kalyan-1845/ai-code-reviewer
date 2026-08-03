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
    if (normalized.startsWith('::ffff:')) {
      const v4Mapped = normalized.replace('::ffff:', '');
      if (net.isIPv4(v4Mapped)) {
        return isPrivateIPv4(v4Mapped);
      }
    }
    if (normalized.startsWith('::') && normalized.endsWith('.ip6.arpa')) return true;
    return false;
  }

  if (!net.isIPv4(ip)) return false;

  return isPrivateIPv4(ip);
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;

  const first = parts[0];
  const second = parts[1];

  // 0.0.0.0/8 (Local/Broadcast)
  if (first === 0) return true;
  // 10.0.0.0/8 (Private)
  if (first === 10) return true;
  // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
  if (first === 100 && second >= 64 && second <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (first === 127) return true;
  // 169.254.0.0/16 (Link Local)
  if (first === 169 && second === 254) return true;
  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (first === 172 && second >= 16 && second <= 31) return true;
  // 192.0.2.0/24 (Documentation/Test)
  if (first === 192 && second === 0 && parts[2] === 2) return true;
  // 192.168.0.0/16 (Private)
  if (first === 192 && second === 168) return true;
  // 198.18.0.0/15 (Benchmark: 198.18.0.0 - 198.19.255.255)
  if (first === 198 && second >= 18 && second <= 19) return true;
  // 198.51.100.0/24 (Documentation)
  if (first === 198 && second === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 (Documentation)
  if (first === 203 && second === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 (Multicast)
  if (first >= 224 && first <= 239) return true;
  // 240.0.0.0/4 (Reserved/Future use)
  if (first >= 240) return true;

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

const MAX_REDIRECT_HOPS = 5;

async function _checkRedirect(urlString, hops = 0) {
  if (hops > MAX_REDIRECT_HOPS) {
    return { valid: false, reason: `Too many redirects (limit ${MAX_REDIRECT_HOPS})` };
  }
  try {
    const resp = await fetch(urlString, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (location) {
        return isSafeUrl(new URL(location, urlString).href, hops + 1);
      }
    }
  } catch {
    /* no redirect to check */
  }
  return { valid: true };
}

export async function isSafeUrl(url, hops = 0) {
  const basic = validateUrlBasic(url);
  if (!basic.valid) return basic;
  const { parsed } = basic;
  try {
    const res = await dnsLookup(parsed.hostname, { all: true, verbatim: true });
    const addresses = Array.isArray(res) ? res : [res];
    for (const entry of addresses) {
      const ip = typeof entry === 'string' ? entry : entry.address;
      if (isPrivateIP(ip)) {
        return { valid: false, reason: `URL resolves to a private or restricted IP (${ip})` };
      }
    }
  } catch {
    return { valid: false, reason: `Failed to resolve hostname: ${parsed.hostname}` };
  }
  const redirectCheck = await _checkRedirect(url);
  if (!redirectCheck.valid) return redirectCheck;
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
