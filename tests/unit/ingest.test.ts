import { describe, it, expect } from "vitest";
import { normalizeUrl } from "../../src/services/ingest/normalizeUrl.js";
import { isPrivateOrReservedIp, validateUrlForSsrf } from "../../src/services/ingest/ssrfGuard.js";
import { AppError } from "../../src/lib/errors.js";

describe("normalizeUrl", () => {
  it("lowercases the hostname and removes URL fragments", () => {
    const raw = "HTTPS://EXAMPLE.COM:443/news/story#discussions";
    const normalized = normalizeUrl(raw);
    expect(normalized).toBe("https://example.com/news/story");
  });

  it("strips analytics and tracking parameters while preserving content parameters", () => {
    const raw =
      "https://example.com/article?utm_source=twitter&id=42&fbclid=XYZ123&gclid=ABC789&page=2&ref=newsletter";
    const normalized = normalizeUrl(raw);
    expect(normalized).toBe("https://example.com/article?id=42&page=2");
  });

  it("sorts query parameters alphabetically", () => {
    const raw = "https://example.com/article?z=last&a=first&m=middle";
    const normalized = normalizeUrl(raw);
    expect(normalized).toBe("https://example.com/article?a=first&m=middle&z=last");
  });

  it("rejects non-http and non-https schemes with INVALID_URL", () => {
    expect(() => normalizeUrl("ftp://files.example.com/doc")).toThrow(AppError);
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(AppError);
    expect(() => normalizeUrl("file:///etc/passwd")).toThrow(AppError);
  });
});

describe("ssrfGuard", () => {
  it("flags private, loopback, and link-local IPv4 addresses as reserved", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("0.0.0.0")).toBe(true);
  });

  it("flags loopback, unspecified, and unique local IPv6 addresses as reserved", () => {
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("::")).toBe(true);
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
  });

  it("permits public IPv4 and IPv6 addresses", () => {
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
    expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false);
  });

  it("rejects URLs containing embedded credentials", async () => {
    await expect(validateUrlForSsrf("https://user:pass@example.com/story")).rejects.toThrow(
      /Credentials in URL are not allowed/
    );
  });

  it("rejects URLs with non-standard ports", async () => {
    await expect(validateUrlForSsrf("http://example.com:8080/story")).rejects.toThrow(
      /Port 8080 is not allowed/
    );
  });

  it("rejects direct requests to loopback IP addresses", async () => {
    await expect(validateUrlForSsrf("http://127.0.0.1/admin")).rejects.toThrow(
      /private, loopback, or reserved/
    );
    await expect(validateUrlForSsrf("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      /private, loopback, or reserved/
    );
  });
});

