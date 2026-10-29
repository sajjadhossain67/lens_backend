export interface CandidateClaim {
  id?: string;
  text: string;
  sourceQuote: string;
}

export interface VerifiedClaim {
  id: string;
  text: string;
  sourceQuote: string;
}

export interface VerificationResult {
  verified: VerifiedClaim[];
  rejected: Array<{ claim: CandidateClaim; reason: string }>;
}

export function normalizeForQuoteMatching(text: string): string {
  if (!text) return "";

  return (
    text
      // 1. Unicode NFKC
      .normalize("NFKC")
      // 2. Unify curly & straight single quotes
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
      // 3. Unify curly & straight double quotes
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
      // 4. Unify dash and hyphen variations
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
      // 5. Collapse all whitespace into single spaces
      .replace(/\s+/g, " ")
      .trim()
      // 6. Lowercase
      .toLowerCase()
  );
}

export function countQuoteWords(quote: string): number {
  return quote.trim().split(/\s+/).filter(Boolean).length;
}

export function verifyQuotes(
  articleText: string,
  candidateClaims: CandidateClaim[]
): VerificationResult {
  const normalizedArticle = normalizeForQuoteMatching(articleText);
  const verified: VerifiedClaim[] = [];
  const rejected: Array<{ claim: CandidateClaim; reason: string }> = [];

  let idx = 1;
  for (const claim of candidateClaims) {
    const rawQuote = claim.sourceQuote?.trim() || "";
    if (!rawQuote) {
      rejected.push({ claim, reason: "Quote is empty" });
      continue;
    }

    const wordCount = countQuoteWords(rawQuote);
    if (wordCount > 25) {
      rejected.push({
        claim,
        reason: `Quote is too long (${wordCount} words, maximum is 25)`,
      });
      continue;
    }

    const normalizedQuote = normalizeForQuoteMatching(rawQuote);
    if (!normalizedQuote) {
      rejected.push({ claim, reason: "Quote is empty after normalization" });
      continue;
    }

    if (normalizedArticle.includes(normalizedQuote)) {
      verified.push({
        id: claim.id || `claim_${idx++}`,
        text: claim.text.slice(0, 200).trim(),
        sourceQuote: rawQuote,
      });
    } else {
      rejected.push({
        claim,
        reason: "Quote is not a verbatim substring of the article text",
      });
    }
  }

  return { verified, rejected };
}

