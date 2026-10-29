import { getDb } from "../../db/client.js";
import { lenses, claims, perspectives } from "../../db/schema.js";
import { eq, and, sql, lt } from "drizzle-orm";
import { fetchArticle } from "../ingest/fetchArticle.js";
import { extractArticle, ArticleMetadata } from "../ingest/extract.js";
import { getLLMProvider } from "../llm/index.js";
import { verifyQuotes, VerifiedClaim } from "./verifyQuotes.js";
import { jobRegistry } from "../jobs.js";
import { AppError, ErrorCode } from "../../lib/errors.js";
import { generateClaimId, generatePerspectiveId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";

export async function cleanStaleLenses(): Promise<void> {
  try {
    const db = await getDb();
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

    const stale = await db
      .select({ id: lenses.id })
      .from(lenses)
      .where(and(eq(lenses.status, "processing"), lt(lenses.createdAt, threeMinutesAgo)));

    if (stale.length > 0) {
      await db
        .update(lenses)
        .set({
          status: "failed",
          failureCode: "INTERNAL",
          failureMessage: "Processing timed out or server restarted",
          updatedAt: new Date(),
        })
        .where(and(eq(lenses.status, "processing"), lt(lenses.createdAt, threeMinutesAgo)));

      logger.info({ count: stale.length }, "Cleaned up stale processing lenses");
    }
  } catch (err) {
    logger.error({ err }, "Failed to clean stale lenses on startup");
  }
}

export async function runAnalysisPipeline(lensId: string, normalizedUrl: string): Promise<void> {
  const db = await getDb();
  const llm = getLLMProvider();

  try {
    // 1. Fetch article
    jobRegistry.emit(lensId, "status", {
      step: "fetching",
      message: "Fetching article content...",
    });

    const { html, finalUrl } = await fetchArticle(normalizedUrl);

    // 2. Extract article
    jobRegistry.emit(lensId, "status", {
      step: "extracting",
      message: "Extracting readable story text and metadata...",
    });

    const { metadata, fullText, llmText } = extractArticle(html, normalizedUrl, finalUrl);

    // Update DB with article metadata (fullText is NEVER stored in DB)
    await db
      .update(lenses)
      .set({
        canonicalUrl: metadata.canonicalUrl,
        title: metadata.title,
        siteName: metadata.siteName,
        author: metadata.author,
        publishedAt: metadata.publishedAt,
        language: metadata.language,
        excerpt: metadata.excerpt,
        wordCount: metadata.wordCount,
        readingMinutes: metadata.readingMinutes,
        updatedAt: new Date(),
      })
      .where(eq(lenses.id, lensId));

    jobRegistry.emit(lensId, "article", metadata);

    // 3. LLM Call 1 - Analysis (Summary + Candidate Claims)
    jobRegistry.emit(lensId, "status", {
      step: "analyzing",
      message: "Generating neutral summary and extracting candidate claims...",
    });

    let analysisAttempt = 0;
    let verifiedClaims: VerifiedClaim[] = [];
    let summary: string[] = [];
    let retryFeedback = "";

    while (analysisAttempt < 2) {
      analysisAttempt++;
      const analysisResult = await llm.analyze(llmText, retryFeedback);
      summary = analysisResult.summary;

      // 4. Verify quotes
      jobRegistry.emit(lensId, "status", {
        step: "verifying",
        message: "Verifying claim quotes against verbatim source text...",
      });

      const verification = verifyQuotes(fullText, analysisResult.claims);
      verifiedClaims = verification.verified;

      if (verifiedClaims.length >= 3) {
        break; // Passed
      }

      // Prepare feedback for retry
      const failedList = verification.rejected
        .map((r) => `Quote: "${r.claim.sourceQuote}" -> ${r.reason}`)
        .join("; ");
      retryFeedback = `Only ${verifiedClaims.length} quotes were verified verbatim. The following failed: ${failedList}`;
      logger.warn({ lensId, attempt: analysisAttempt, failedList }, "Quote verification failed threshold, retrying LLM call 1");
    }

    if (verifiedClaims.length < 3) {
      throw new AppError(
        "LLM_FAILED",
        "Could not verify enough verbatim quotes from the article to ensure factual accuracy",
        502
      );
    }

    // Persist verified claims & summary
    await db
      .update(lenses)
      .set({
        summary,
        model: llm.getModelName(),
        updatedAt: new Date(),
      })
      .where(eq(lenses.id, lensId));

    const claimRecordsToInsert = verifiedClaims.map((c, idx) => ({
      id: generateClaimId(),
      lensId,
      position: idx + 1,
      text: c.text,
      sourceQuote: c.sourceQuote,
    }));

    await db.insert(claims).values(claimRecordsToInsert);

    const clientClaims = claimRecordsToInsert.map((c) => ({
      id: c.id,
      text: c.text,
      sourceQuote: c.sourceQuote,
    }));

    jobRegistry.emit(lensId, "summary", {
      summary,
      claims: clientClaims,
    });

    // 5. LLM Call 2 - Perspectives
    jobRegistry.emit(lensId, "status", {
      step: "analyzing",
      message: "Synthesizing multi-viewpoint perspectives...",
    });

    let perspectivesAttempt = 0;
    let validPerspectives: Array<{
      slug: string;
      label: string;
      kind: "ideological" | "stakeholder" | "skeptic" | "local" | "historical";
      stance: string;
      thought: string;
      claimIds: string[];
    }> = [];
    let pFeedback = "";

    const verifiedClaimIdSet = new Set(clientClaims.map((c) => c.id));

    while (perspectivesAttempt < 2) {
      perspectivesAttempt++;
      const pResult = await llm.generatePerspectives(summary, clientClaims, pFeedback);

      // Filter perspectives:
      // Drop claimIds not in verified set; drop perspective if 0 claims remain
      validPerspectives = pResult.perspectives
        .map((p) => ({
          ...p,
          claimIds: p.claimIds.filter((cid) => verifiedClaimIdSet.has(cid)),
        }))
        .filter((p) => p.claimIds.length > 0);

      // Check constraints: >= 3 perspectives, >= 2 distinct kinds
      const distinctKinds = new Set(validPerspectives.map((p) => p.kind));
      if (validPerspectives.length >= 3 && distinctKinds.size >= 2) {
        break;
      }

      pFeedback = `Generated perspectives did not meet constraints (need >= 3 valid perspectives with >= 2 distinct kinds). Got ${validPerspectives.length} perspectives and ${distinctKinds.size} distinct kinds.`;
      logger.warn({ lensId, attempt: perspectivesAttempt, feedback: pFeedback }, "Perspectives threshold retry");
    }

    if (validPerspectives.length < 3) {
      throw new AppError(
        "LLM_FAILED",
        "Could not generate sufficient distinct perspectives for this article",
        502
      );
    }

    // Persist perspectives with colorKey (0..5, no duplicates)
    const perspectiveRecordsToInsert = validPerspectives.slice(0, 6).map((p, idx) => ({
      id: generatePerspectiveId(),
      lensId,
      position: idx + 1,
      slug: p.slug,
      label: p.label,
      kind: p.kind,
      colorKey: (idx % 6) as 0 | 1 | 2 | 3 | 4 | 5,
      stance: p.stance,
      thought: p.thought,
      claimIds: p.claimIds,
      flagCount: 0,
      hidden: false,
    }));

    await db.insert(perspectives).values(perspectiveRecordsToInsert);

    // Emit each perspective staggered by ~300ms for client animation
    for (const p of perspectiveRecordsToInsert) {
      jobRegistry.emit(lensId, "perspective", {
        id: p.id,
        slug: p.slug,
        label: p.label,
        kind: p.kind,
        colorKey: p.colorKey,
        stance: p.stance,
        thought: p.thought,
        claimIds: p.claimIds,
        flagCount: 0,
      });
      const staggerDelay = process.env.NODE_ENV === "test" ? 0 : 300;
      if (staggerDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, staggerDelay));
      }
    }

    // Finalize
    await db
      .update(lenses)
      .set({
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(lenses.id, lensId));

    jobRegistry.emit(lensId, "done", {
      lensId,
      perspectiveCount: perspectiveRecordsToInsert.length,
    });
  } catch (err: any) {
    const code: ErrorCode = err instanceof AppError ? err.code : "INTERNAL";
    const message = err?.message || "An unexpected error occurred during analysis";

    logger.error({ lensId, code, message, err }, "Analysis pipeline failed");

    await db
      .update(lenses)
      .set({
        status: "failed",
        failureCode: code,
        failureMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(lenses.id, lensId))
      .catch((dbErr) => logger.error({ dbErr }, "Failed to update lens failure status in DB"));

    jobRegistry.emit(lensId, "error", { code, message });
  } finally {
    // Keep emitter around for late SSE subscribers for 30 seconds, then cleanup
    setTimeout(() => {
      jobRegistry.cleanup(lensId);
    }, 30000);
  }
}
