import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import net from "node:net";
import { AppError } from "../../lib/errors.js";
import { config } from "../../config.js";

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const allowTestLoopback =
    config.NODE_ENV === "test" && process.env.ALLOW_TEST_LOOPBACK === "true";
  if (allowTestLoopback && (ip === "127.0.0.1" || ip === "::1")) {
    return false;
  }
  const family = net.isIP(ip);
  if (family === 4) {
    const num = ipv4ToInt(ip);

    // 0.0.0.0/8 (Current network / unspecified)
    if ((num & 0xff000000) >>> 0 === 0x00000000) return true;
    // 10.0.0.0/8 (Private)
    if ((num & 0xff000000) >>> 0 === 0x0a000000) return true;
    // 100.64.0.0/10 (CGNAT / Shared Address Space)
    if ((num & 0xffc00000) >>> 0 === 0x64400000) return true;
    // 127.0.0.0/8 (Loopback)
    if ((num & 0xff000000) >>> 0 === 0x7f000000) return true;
    // 169.254.0.0/16 (Link Local, includes 169.254.169.254 metadata)
    if ((num & 0xffff0000) >>> 0 === 0xa9fe0000) return true;
    // 172.16.0.0/12 (Private)
    if ((num & 0xfff00000) >>> 0 === 0xac100000) return true;
    // 192.168.0.0/16 (Private)
    if ((num & 0xffff0000) >>> 0 === 0xc0a80000) return true;
    // 224.0.0.0/4 (Multicast)
    if ((num & 0xf0000000) >>> 0 === 0xe0000000) return true;
    // 240.0.0.0/4 (Reserved / Future Use)
    if ((num & 0xf0000000) >>> 0 === 0xf0000000) return true;

    return false;
  }

  if (family === 6) {
    const lower = ip.toLowerCase();

    // Loopback
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
    // Unspecified
    if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;

    // IPv4-mapped IPv6 (::ffff:192.0.2.128)
    if (lower.startsWith("::ffff:") || lower.startsWith("0:0:0:0:0:ffff:")) {
      const parts = lower.split(":");
      const last = parts[parts.length - 1];
      if (net.isIPv4(last)) {
        return isPrivateOrReservedIp(last);
      }
    }

    // Unique Local Addresses (fc00::/7)
    if (/^[fF][cCdD]/.test(lower)) return true;

    // Link-local unicast (fe80::/10)
    if (/^[fF][eE][89aAbB]/.test(lower)) return true;

    // Multicast (ff00::/8)
    if (/^[fF][fF]/.test(lower)) return true;

    return false;
  }

  return true; // Unknown family, treat as unsafe
}

export interface ValidatedUrlTarget {
  url: URL;
  resolvedIp: string;
}

export async function validateUrlForSsrf(rawUrl: string): Promise<ValidatedUrlTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError("INVALID_URL", "Invalid URL format", 400);
  }

  // Only http: and https:
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("INVALID_URL", "Protocol must be http or https", 400);
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    throw new AppError("INVALID_URL", "Credentials in URL are not allowed", 400);
  }

  // Ports: only 80 and 443
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : parsed.protocol === "https:"
      ? 443
      : 80;

  const allowTestLoopback =
    config.NODE_ENV === "test" && process.env.ALLOW_TEST_LOOPBACK === "true";
  if (!allowTestLoopback && port !== 80 && port !== 443) {
    throw new AppError("INVALID_URL", `Port ${port} is not allowed. Only ports 80 and 443 are supported`, 400);
  }

  const host = parsed.hostname;

  // Check blocked domains
  const blockedList = config.BLOCKED_DOMAINS
    ? config.BLOCKED_DOMAINS.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)
    : [];

  const lowerHost = host.toLowerCase();
  for (const blocked of blockedList) {
    if (lowerHost === blocked || lowerHost.endsWith(`.${blocked}`)) {
      throw new AppError("BLOCKED_URL", `Domain ${host} is blocked`, 403);
    }
  }

  // If host is a direct IP address literal
  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new AppError("BLOCKED_URL", "Target IP address is private, loopback, or reserved", 403);
    }
    return { url: parsed, resolvedIp: host };
  }

  // Resolve DNS with dns.lookup (all addresses)
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dnsPromises.lookup(host, { all: true });
  } catch (err) {
    throw new AppError("FETCH_FAILED", `Failed to resolve host "${host}"`, 502);
  }

  if (!addresses || addresses.length === 0) {
    throw new AppError("FETCH_FAILED", `Could not resolve IP for host "${host}"`, 502);
  }

  // Reject if ANY address is private or reserved
  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr.address)) {
      throw new AppError(
        "BLOCKED_URL",
        `Host "${host}" resolved to private or reserved IP address`,
        403
      );
    }
  }

  // Pin the first resolved IP
  const pinnedIp = addresses[0].address;
  return { url: parsed, resolvedIp: pinnedIp };
}
