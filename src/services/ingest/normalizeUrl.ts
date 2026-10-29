import { AppError } from "../../lib/errors.js";

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "ref", "mc_cid", "mc_eid"]);

export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new AppError("INVALID_URL", "URL must be a non-empty string", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new AppError("INVALID_URL", "Invalid URL format", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("INVALID_URL", "Only HTTP and HTTPS URLs are supported", 400);
  }

  // Lowercase host
  parsed.hostname = parsed.hostname.toLowerCase();

  // Strip fragment
  parsed.hash = "";

  // Strip tracking parameters
  const keysToRemove: string[] = [];
  for (const [key] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (
      TRACKING_PARAMS.has(lowerKey) ||
      TRACKING_PARAM_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))
    ) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    parsed.searchParams.delete(key);
  }

  // Sort remaining query params
  parsed.searchParams.sort();

  // Normalize path trailing slash (preserve single root slash)
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

