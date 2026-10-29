import { Agent, request } from "undici";
import { config } from "../../config.js";
import { AppError } from "../../lib/errors.js";
import { validateUrlForSsrf } from "./ssrfGuard.js";
import { logger } from "../../lib/logger.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 8000;

export interface FetchedArticle {
  html: string;
  finalUrl: string;
}

function createCustomLookup(resolvedIp: string) {
  return (_hostname: string, opts: any, cb: any) => {
    const callback = typeof opts === "function" ? opts : cb;
    const isAll = typeof opts === "object" && opts?.all;
    const family = resolvedIp.includes(":") ? 6 : 4;
    if (isAll) {
      callback(null, [{ address: resolvedIp, family }]);
    } else {
      callback(null, resolvedIp, family);
    }
  };
}

function parseRobotsTxt(robotsText: string, path: string): boolean {
  const lines = robotsText.split("\n").map((l) => l.trim());
  let appliesToUs = false;
  const disallowedPrefixes: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [rawKey, ...valParts] = line.split(":");
    if (!rawKey || valParts.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const val = valParts.join(":").trim();

    if (key === "user-agent") {
      const ua = val.toLowerCase();
      appliesToUs = ua === "*" || ua === "lensbot" || ua.startsWith("lensbot/");
    } else if (appliesToUs && key === "disallow") {
      if (val) {
        disallowedPrefixes.push(val);
      }
    }
  }

  for (const prefix of disallowedPrefixes) {
    if (path.startsWith(prefix)) {
      return false; // Disallowed
    }
  }
  return true; // Allowed
}

async function checkRobotsTxt(targetUrl: URL): Promise<void> {
  if (!config.ROBOTS_CHECK) return;

  const robotsUrl = `${targetUrl.protocol}//${targetUrl.host}/robots.txt`;
  try {
    const { resolvedIp } = await validateUrlForSsrf(robotsUrl);
    const agent = new Agent({
      connect: {
        lookup: createCustomLookup(resolvedIp),
      },
    });

    const res = await request(robotsUrl, {
      dispatcher: agent,
      method: "GET",
      headers: {
        "User-Agent": `LensBot/1.0 (+${config.PUBLIC_SITE_URL}/about)`,
      },
      signal: AbortSignal.timeout(3000),
    });

    if (res.statusCode === 200) {
      const robotsBody = await res.body.text();
      const allowed = parseRobotsTxt(robotsBody, targetUrl.pathname || "/");
      if (!allowed) {
        throw new AppError(
          "FETCH_FAILED",
          "Article access is disallowed by site's robots.txt policy",
          403
        );
      }
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.debug({ err, url: robotsUrl }, "robots.txt check skipped/failed, proceeding");
  }
}

export async function fetchArticle(initialUrl: string): Promise<FetchedArticle> {
  let currentUrl = initialUrl;
  let redirectCount = 0;
  const startTime = Date.now();

  while (redirectCount <= MAX_REDIRECTS) {
    const remainingTime = TIMEOUT_MS - (Date.now() - startTime);
    if (remainingTime <= 0) {
      throw new AppError("FETCH_FAILED", "Request timed out while fetching article", 504);
    }

    const { url: validatedUrl, resolvedIp } = await validateUrlForSsrf(currentUrl);

    if (redirectCount === 0) {
      await checkRobotsTxt(validatedUrl);
    }

    const customAgent = new Agent({
      connect: {
        lookup: createCustomLookup(resolvedIp),
      },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remainingTime);

    let res;
    try {
      res = await request(validatedUrl.toString(), {
        dispatcher: customAgent,
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": `LensBot/1.0 (+${config.PUBLIC_SITE_URL}/about)`,
          Accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === "AbortError") {
        throw new AppError("FETCH_FAILED", "Request timed out fetching article", 504);
      }
      throw new AppError("FETCH_FAILED", `Failed to fetch URL: ${err?.message || "network error"}`, 502);
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle redirects
    if (
      res.statusCode >= 300 &&
      res.statusCode < 400 &&
      res.headers.location
    ) {
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new AppError("FETCH_FAILED", "Too many redirects", 502);
      }
      const redirectLocation = res.headers.location as string;
      const nextUrl = new URL(redirectLocation, validatedUrl).toString();
      logger.debug({ from: currentUrl, to: nextUrl }, "Following redirect");
      currentUrl = nextUrl;
      continue;
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      if (res.statusCode === 401 || res.statusCode === 403) {
        throw new AppError("PAYWALLED", "Article requires authentication or is paywalled", 403);
      }
      if (res.statusCode === 404) {
        throw new AppError("NOT_FOUND", "Article page not found", 404);
      }
      throw new AppError("FETCH_FAILED", `Upstream server returned HTTP ${res.statusCode}`, 502);
    }

    // Validate Content-Type
    const contentType = (res.headers["content-type"] as string) || "";
    const isHtml =
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml+xml");

    if (!isHtml) {
      throw new AppError(
        "NOT_ARTICLE",
        `Unsupported content type: "${contentType}". Expected text/html`,
        415
      );
    }

    // Read body with 2MB cap
    const chunks: Buffer[] = [];
    let bytesReceived = 0;

    for await (const chunk of res.body) {
      bytesReceived += chunk.length;
      if (bytesReceived > MAX_BODY_BYTES) {
        controller.abort();
        throw new AppError("TOO_LARGE", "Article page size exceeds maximum limit of 2MB", 413);
      }
      chunks.push(chunk);
    }

    const html = Buffer.concat(chunks).toString("utf-8");
    return {
      html,
      finalUrl: validatedUrl.toString(),
    };
  }

  throw new AppError("FETCH_FAILED", "Too many redirects", 502);
}
