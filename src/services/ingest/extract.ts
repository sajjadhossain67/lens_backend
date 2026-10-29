import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { AppError } from "../../lib/errors.js";

export interface ArticleMetadata {
  url: string;
  canonicalUrl: string;
  title: string;
  siteName: string;
  author: string | null;
  publishedAt: string | null;
  language: string;
  excerpt: string;
  wordCount: number;
  readingMinutes: number;
}

export interface ExtractedArticle {
  metadata: ArticleMetadata;
  fullText: string;
  llmText: string;
}

function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function extractJsonLd(doc: Document): any[] {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const items: any[] = [];
  scripts.forEach((script) => {
    try {
      const content = script.textContent?.trim();
      if (content) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          items.push(...parsed);
        } else {
          items.push(parsed);
        }
      }
    } catch {
      // Ignore JSON parse errors in untrusted JSON-LD
    }
  });
  return items;
}

export function extractArticle(html: string, submittedUrl: string, finalUrl: string): ExtractedArticle {
  const dom = new JSDOM(html, {
    url: finalUrl,
    runScripts: "outside-only",
    resources: "usable",
  });
  const doc = dom.window.document;

  // Check JSON-LD for paywall markers
  const jsonLdItems = extractJsonLd(doc);
  for (const item of jsonLdItems) {
    if (
      item?.isAccessibleForFree === false ||
      item?.isAccessibleForFree === "False" ||
      item?.hasPart?.isAccessibleForFree === false
    ) {
      throw new AppError("PAYWALLED", "Article is marked as paywalled (isAccessibleForFree: false)", 403);
    }
  }

  // Canonical URL check
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  const canonicalHref = canonicalEl?.getAttribute("href");
  let canonicalUrl = finalUrl;
  if (canonicalHref) {
    try {
      canonicalUrl = new URL(canonicalHref, finalUrl).toString();
    } catch {
      // Keep finalUrl
    }
  }

  // Site name
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
  let siteName = ogSiteName || "";
  if (!siteName) {
    try {
      siteName = new URL(finalUrl).hostname.replace(/^www\./, "");
    } catch {
      siteName = "Unknown";
    }
  }

  // Published date
  let publishedAt: string | null = null;
  const publishedMeta =
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="publication_date"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="date"]')?.getAttribute("content") ||
    doc.querySelector('time[datetime]')?.getAttribute("datetime");

  if (publishedMeta) {
    const d = new Date(publishedMeta);
    if (!isNaN(d.getTime())) {
      publishedAt = d.toISOString();
    }
  }

  if (!publishedAt) {
    for (const item of jsonLdItems) {
      const date = item?.datePublished || item?.dateCreated;
      if (date) {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          publishedAt = d.toISOString();
          break;
        }
      }
    }
  }

  // Author
  let author: string | null =
    doc.querySelector('meta[name="author"]')?.getAttribute("content") ||
    doc.querySelector('meta[property="article:author"]')?.getAttribute("content") ||
    null;

  // Language
  const htmlLang = doc.documentElement.getAttribute("lang");
  let language = htmlLang ? htmlLang.split("-")[0].toLowerCase() : "en";
  if (!language || language.length > 5) {
    language = "en";
  }

  // Run Mozilla Readability
  // Clone doc because Readability modifies the DOM in place
  const reader = new Readability(doc);
  const parsedArticle = reader.parse();

  if (!parsedArticle || !parsedArticle.textContent) {
    throw new AppError("NOT_ARTICLE", "Could not extract article content from the page", 422);
  }

  const rawText = parsedArticle.textContent.trim();
  const wordCount = countWords(rawText);

  // Paywall check: text < 600 chars
  if (rawText.length < 600) {
    throw new AppError(
      "PAYWALLED",
      "Insufficient article content extracted (less than 600 characters). The content may be paywalled or gated.",
      403
    );
  }

  // Listing / Homepage check: text < 300 words and page looks like listing/homepage
  const isLikelyListing =
    doc.querySelectorAll("article").length > 5 ||
    doc.querySelectorAll("h2, h3").length > 15 ||
    finalUrl.endsWith("/") ||
    new URL(finalUrl).pathname === "";

  if (wordCount < 300 && isLikelyListing) {
    throw new AppError(
      "NOT_ARTICLE",
      "The submitted URL appears to be a homepage, category, or listing page rather than a single article",
      422
    );
  }

  // Title
  const title =
    parsedArticle.title ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    doc.querySelector("title")?.textContent ||
    "Untitled Article";

  if (!author && parsedArticle.byline) {
    author = parsedArticle.byline.trim();
  }

  // Excerpt: <= 300 chars
  let excerpt = parsedArticle.excerpt?.trim() || "";
  if (!excerpt) {
    excerpt = rawText.slice(0, 300).trim();
  }
  if (excerpt.length > 300) {
    excerpt = excerpt.slice(0, 297) + "...";
  }

  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));

  // Truncate LLM text to 12,000 words
  const words = rawText.split(/\s+/);
  const truncatedWords = words.slice(0, 12000);
  const llmText = truncatedWords.join(" ");

  return {
    metadata: {
      url: submittedUrl,
      canonicalUrl,
      title: title.trim(),
      siteName: siteName.trim(),
      author: author ? author.slice(0, 120) : null,
      publishedAt,
      language,
      excerpt,
      wordCount,
      readingMinutes,
    },
    fullText: rawText,
    llmText,
  };
}

