import { describe, it, expect } from "vitest";
import {
  verifyQuotes,
  normalizeForQuoteMatching,
  countQuoteWords,
} from "../../src/services/analysis/verifyQuotes.js";

describe("verifyQuotes", () => {
  const articleSample = `
    The state legislature passed the landmark Clean Water and Infrastructure Act on Tuesday.
    Governor Harrison praised the bipartisan compromise, stating: “This reform protects downstream
    communities without crippling agricultural productivity.”
    However, fiscal watchdogs warned that long—term bonding costs could exceed twelve billion dollars
    over the next three decades.
  `;

  it("normalizes curly quotes, dashes, and whitespace variations cleanly", () => {
    const raw = "“This reform protects—downstream communities”";
    const norm = normalizeForQuoteMatching(raw);
    expect(norm).toBe('"this reform protects-downstream communities"');
  });

  it("counts quote words accurately", () => {
    expect(countQuoteWords("Three simple words")).toBe(3);
    expect(countQuoteWords("  Many   spaced    words   here  ")).toBe(4);
  });

  it("accepts verbatim quotes matching the article text", () => {
    const candidates = [
      {
        text: "The legislature passed the act on Tuesday.",
        sourceQuote: "The state legislature passed the landmark Clean Water and Infrastructure Act on Tuesday.",
      },
      {
        text: "Governor Harrison praised the compromise.",
        // Testing with straight quotes matching curly quotes in original text
        sourceQuote: '"This reform protects downstream communities without crippling agricultural productivity."',
      },
    ];

    const result = verifyQuotes(articleSample, candidates);
    expect(result.verified.length).toBe(2);
    expect(result.rejected.length).toBe(0);
    expect(result.verified[0].text).toBe("The legislature passed the act on Tuesday.");
  });

  it("rejects quotes that exceed 25 words", () => {
    const longQuote =
      "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six";

    const candidates = [
      {
        text: "Excessive quote length test",
        sourceQuote: longQuote,
      },
    ];

    const result = verifyQuotes(articleSample, candidates);
    expect(result.verified.length).toBe(0);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].reason).toContain("maximum is 25");
  });

  it("rejects fabricated or altered quotes not present in the article", () => {
    const candidates = [
      {
        text: "Fabricated quote test",
        sourceQuote: "The governor explicitly vetoed all funding for downstream water filters.",
      },
    ];

    const result = verifyQuotes(articleSample, candidates);
    expect(result.verified.length).toBe(0);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].reason).toContain("not a verbatim substring");
  });
});

