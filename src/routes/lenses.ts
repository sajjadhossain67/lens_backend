import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { lenses, claims, perspectives } from "../db/schema.js";
import { eq, and, asc, gte, desc, sql } from "drizzle-orm";
import { normalizeUrl } from "../services/ingest/normalizeUrl.js";
import { sha256 } from "../lib/hash.js";
import { generateLensId } from "../lib/ids.js";
import { runAnalysisPipeline } from "../services/analysis/pipeline.js";
import { jobRegistry } from "../services/jobs.js";
import { SSEStream } from "../services/sse.js";
import { AppError, ErrorCode } from "../lib/errors.js";
import { config } from "../config.js";

export async function buildLensSnapshot(lensId: string) {
  const db = await getDb();

  const [lens] = await db.select().from(lenses).where(eq(lenses.id, lensId));
  if (!lens) {
    return null;
  }

  const lensClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.lensId, lensId))
    .orderBy(asc(claims.position));

  // Exclude hidden perspectives
  const lensPerspectives = await db
    .select()
    .from(perspectives)
    .where(and(eq(perspectives.lensId, lensId), eq(perspectives.hidden, false)))
    .orderBy(asc(perspectives.position));

  const article = lens.title
    ? {
        url: lens.url,
        canonicalUrl: lens.canonicalUrl,
        title: lens.title,
        siteName: lens.siteName || "",
        author: lens.author,
        publishedAt: lens.publishedAt,
        language: lens.language || "en",
        excerpt: lens.excerpt || "",
        wordCount: lens.wordCount || 0,
        readingMinutes: lens.readingMinutes || 1,
      }
    : null;

  const result: any = {
    id: lens.id,
    status: lens.status,
    article,
    summary: (lens.summary as string[]) || [],
    claims: lensClaims.map((c) => ({
      id: c.id,
      text: c.text,
      sourceQuote: c.sourceQuote,
    })),
    perspectives: lensPerspectives.map((p) => ({
      id: p.id,
      slug: p.slug,
      label: p.label,
      kind: p.kind,
      colorKey: p.colorKey,
      stance: p.stance,
      thought: p.thought,
      claimIds: (p.claimIds as string[]) || [],
      flagCount: p.flagCount,
    })),
    model: lens.model || config.LLM_MODEL,
    createdAt: lens.createdAt.toISOString(),
  };

  if (lens.status === "failed" && lens.failureCode) {
    result.failure = {
      code: lens.failureCode as ErrorCode,
      message: lens.failureMessage || "Analysis failed",
    };
  }

  return result;
}

const CreateLensBody = z.object({
  url: z.string().min(1, "URL is required"),
});

export const lensesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /lenses
  fastify.post(
    "/lenses",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const parsed = CreateLensBody.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", "Invalid request body: url is required", 400);
      }

      const normalized = normalizeUrl(parsed.data.url);
      const urlHash = sha256(normalized);
      const db = await getDb();

      // Check daily rate limit budget cap
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentLenses = await db
        .select({ count: sql<number>`count(*)` })
        .from(lenses)
        .where(gte(lenses.createdAt, oneDayAgo));

      const totalToday = Number(recentLenses[0]?.count || 0);
      if (totalToday >= config.MAX_NEW_LENSES_PER_DAY) {
        throw new AppError(
          "RATE_LIMITED",
          "Daily global processing quota has been reached. Please try again tomorrow.",
          429
        );
      }

      // Check cache (< 24h, status = ready, same url_hash)
      const [existing] = await db
        .select()
        .from(lenses)
        .where(
          and(
            eq(lenses.urlHash, urlHash),
            eq(lenses.status, "ready"),
            gte(lenses.createdAt, oneDayAgo)
          )
        )
        .orderBy(desc(lenses.createdAt))
        .limit(1);

      if (existing) {
        return reply.status(200).send({
          id: existing.id,
          status: "ready",
        });
      }

      // Create new lens record
      const lensId = generateLensId();

      await db.insert(lenses).values({
        id: lensId,
        url: normalized,
        canonicalUrl: normalized,
        urlHash,
        status: "processing",
        summary: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Start analysis in background
      setImmediate(() => {
        runAnalysisPipeline(lensId, normalized);
      });

      return reply.status(201).send({
        id: lensId,
        status: "processing",
      });
    }
  );

  // GET /lenses/:id
  fastify.get<{ Params: { id: string } }>("/lenses/:id", async (request, reply) => {
    const lensId = request.params.id;
    const snapshot = await buildLensSnapshot(lensId);

    if (!snapshot) {
      throw new AppError("NOT_FOUND", `Lens with ID "${lensId}" not found`, 404);
    }

    return reply.status(200).send(snapshot);
  });

  // GET /lenses/:id/events (SSE)
  fastify.get<{ Params: { id: string } }>("/lenses/:id/events", async (request, reply) => {
    const lensId = request.params.id;
    const db = await getDb();

    const [lens] = await db.select().from(lenses).where(eq(lenses.id, lensId));
    if (!lens) {
      throw new AppError("NOT_FOUND", `Lens with ID "${lensId}" not found`, 404);
    }

    const sse = new SSEStream(request, reply);

    // If lens is already ready: replay all events
    if (lens.status === "ready") {
      const snapshot = await buildLensSnapshot(lensId);
      if (snapshot && !sse.closed) {
        if (snapshot.article) {
          sse.writeEvent("article", snapshot.article);
        }
        sse.writeEvent("summary", {
          summary: snapshot.summary,
          claims: snapshot.claims,
        });

        for (const p of snapshot.perspectives) {
          sse.writeEvent("perspective", p);
        }

        sse.writeEvent("done", {
          lensId,
          perspectiveCount: snapshot.perspectives.length,
        });
      }
      return;
    }

    // If lens failed: replay error event and close
    if (lens.status === "failed") {
      sse.writeEvent("error", {
        code: (lens.failureCode as ErrorCode) || "INTERNAL",
        message: lens.failureMessage || "Analysis failed",
      });
      sse.close();
      return;
    }

    // Lens is processing: attach to job registry emitter
    const emitter = jobRegistry.getEmitter(lensId);

    const onEvent = ({ event, data }: { event: string; data: any }) => {
      if (sse.closed) return;
      sse.writeEvent(event, data);
      if (event === "done" || event === "error") {
        setTimeout(() => sse.close(), 1000);
      }
    };

    emitter.on("*", onEvent);

    request.raw.on("close", () => {
      emitter.off("*", onEvent);
    });
  });
};

