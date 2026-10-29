import { LLMProvider } from "./provider.js";
import { AnalysisResult, PerspectivesResult } from "./schemas.js";

export class MockLLMProvider implements LLMProvider {
  private modelName = "mock-claude-sonnet";

  getModelName(): string {
    return this.modelName;
  }

  async analyze(articleText: string): Promise<AnalysisResult> {
    // Extract actual sentences or phrases from articleText to ensure verbatim quotes
    const sentences = articleText
      .split(/[.?!]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.split(/\s+/).length <= 25);

    const safeQuotes = sentences.slice(0, 7);

    // If text has fewer sentences, take short chunks
    if (safeQuotes.length < 3) {
      const words = articleText.split(/\s+/);
      for (let i = 0; i < 4 && i * 15 < words.length; i++) {
        const chunk = words.slice(i * 15, i * 15 + 12).join(" ");
        if (chunk) safeQuotes.push(chunk);
      }
    }

    const claims = safeQuotes.map((quote, idx) => ({
      id: `claim_${idx + 1}`,
      text: `Key finding ${idx + 1} regarding reported developments and stakeholder impact.`,
      sourceQuote: quote,
    }));

    return {
      summary: [
        "The report details recent policy and economic developments surrounding the subject.",
        "Multiple stakeholders expressed differing views on the long-term feasibility and costs.",
        "Independent evaluators noted that while progress was made, key uncertainties remain.",
      ],
      claims: claims.length >= 3 ? claims : [
        {
          id: "claim_1",
          text: "The program commenced operations following unanimous committee approval.",
          sourceQuote: articleText.slice(0, 80).trim(),
        },
        {
          id: "claim_2",
          text: "Initial financial investments reached fifty million dollars.",
          sourceQuote: articleText.slice(85, 160).trim(),
        },
        {
          id: "claim_3",
          text: "Independent reviews will be delivered semiannually.",
          sourceQuote: articleText.slice(165, 240).trim(),
        },
      ],
    };
  }

  async generatePerspectives(
    _summary: string[],
    claims: Array<{ id: string; text: string; sourceQuote: string }>
  ): Promise<PerspectivesResult> {
    const claimIds = claims.map((c) => c.id);
    const c1 = claimIds[0] || "claim_1";
    const c2 = claimIds[1] || c1;
    const c3 = claimIds[2] || c1;

    return {
      perspectives: [
        {
          slug: "market-liberal",
          label: "Market-liberal",
          kind: "ideological",
          stance: "Prioritizes market mechanisms, deregulation, and private capital efficiency over state mandates.",
          thought:
            "Market competition drives faster innovation and lower costs than centralized programs. Private enterprise should lead execution.",
          claimIds: [c1],
        },
        {
          slug: "labor-advocate",
          label: "Labor Advocate",
          kind: "stakeholder",
          stance: "Focuses on worker protections, wage standards, and fair workplace conditions.",
          thought:
            "Transition policies must safeguard local jobs and ensure vulnerable employees are not bearing the economic burden of reform.",
          claimIds: [c1, c2],
        },
        {
          slug: "fiscal-skeptic",
          label: "Fiscal Skeptic",
          kind: "skeptic",
          stance: "Scrutinizes budgetary outlays, subsidy sustainability, and potential taxpayer exposure.",
          thought:
            "Public balance sheets cannot sustain unchecked subsidies without clear timelines and binding performance benchmarks.",
          claimIds: [c2, c3],
        },
        {
          slug: "civic-historian",
          label: "Historical Context",
          kind: "historical",
          stance: "Frames current initiatives against past regulatory cycles and historical precedents.",
          thought:
            "Previous attempts at similar centralized reforms met regulatory friction. Long-term durability requires broad consensus.",
          claimIds: [c3],
        },
        {
          slug: "regional-impact",
          label: "Local Community",
          kind: "local",
          stance: "Focuses on municipal infrastructure, local municipal tax bases, and resident services.",
          thought:
            "Decisions made at the national level often fail to account for distinct local realities and municipal resource constraints.",
          claimIds: [c1, c3],
        },
      ],
    };
  }

  async streamArgue(
    _systemPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    onToken: (token: string) => void
  ): Promise<string> {
    const lastUserMsg = history.filter((h) => h.role === "user").pop()?.content || "";
    const responseText = `I understand your point regarding "${lastUserMsg.slice(0, 30)}...". However, when looking closely at the verified claims, market and institutional incentives suggest that structural accountability remains paramount. While there are valid trade-offs, a disciplined approach protects long-term stability.`;

    const words = responseText.split(" ");
    const delay = process.env.NODE_ENV === "test" ? 0 : 15;
    for (const word of words) {
      onToken(word + " ");
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return responseText;
  }
}
