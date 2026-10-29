import { getDb } from "../db/client.js";
import { perspectives, lenses, claims, threadMessages, flags } from "../db/schema.js";
import { eq, and, asc, sql } from "drizzle-orm";
import { getLLMProvider } from "./llm/index.js";
import { getArgueSystemPrompt } from "./llm/prompts.js";
import { AppError } from "../lib/errors.js";
import { generateMessageId, generateFlagId } from "../lib/ids.js";
import { hashIp } from "../lib/hash.js";
import { config } from "../config.js";
import { SSEStream } from "./sse.js";
import { logger } from "../lib/logger.js";

const MAX_USER_TURNS = 6;

export async function handleArgueStream(
  perspectiveId: string,
  sessionId: string,
  userMessageText: string,
  sse: SSEStream
): Promise<void> {
  const db = await getDb();
  const llm = getLLMProvider();

  // 1. Fetch perspective
  const [persp] = await db
    .select()
    .from(perspectives)
    .where(eq(perspectives.id, perspectiveId));

  if (!persp) {
    sse.writeEvent("error", { code: "NOT_FOUND", message: "Perspective not found" });
    sse.close();
    return;
  }

  // 2. Fetch lens & claims
  const [lens] = await db.select().from(lenses).where(eq(lenses.id, persp.lensId));
  if (!lens) {
    sse.writeEvent("error", { code: "NOT_FOUND", message: "Lens not found" });
    sse.close();
    return;
  }

  const lensClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.lensId, persp.lensId))
    .orderBy(asc(claims.position));

  // 3. Count user turns in thread
  const existingMessages = await db
    .select()
    .from(threadMessages)
    .where(
      and(
        eq(threadMessages.perspectiveId, perspectiveId),
        eq(threadMessages.sessionId, sessionId)
      )
    )
    .orderBy(asc(threadMessages.createdAt));

  const userTurnCount = existingMessages.filter((m) => m.role === "user").length;
  if (userTurnCount >= MAX_USER_TURNS) {
    sse.writeEvent("error", {
      code: "RATE_LIMITED",
      message: "Thread limit reached",
    });
    sse.close();
    return;
  }

  // 4. Save user message
  const userMsgId = generateMessageId();
  await db.insert(threadMessages).values({
    id: userMsgId,
    perspectiveId,
    sessionId,
    role: "user",
    content: userMessageText.trim(),
  });

  // 5. Construct prompt & history
  const systemPrompt = getArgueSystemPrompt(
    persp.label,
    lens.title || "the article",
    persp.stance,
    lensClaims.map((c) => ({ id: c.id, text: c.text }))
  );

  const history = [
    ...existingMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessageText.trim() },
  ];

  try {
    const assistantMsgId = generateMessageId();

    const replyContent = await llm.streamArgue(
      systemPrompt,
      history,
      (token: string) => {
        sse.writeEvent("token", { text: token });
      }
    );

    // Save assistant message to DB
    await db.insert(threadMessages).values({
      id: assistantMsgId,
      perspectiveId,
      sessionId,
      role: "assistant",
      content: replyContent,
    });

    sse.writeEvent("done", { messageId: assistantMsgId });
  } catch (err: any) {
    logger.error({ err, perspectiveId, sessionId }, "Argue streaming error");
    sse.writeEvent("error", {
      code: "LLM_FAILED",
      message: "Failed to stream perspective argument response",
    });
  } finally {
    sse.close();
  }
}

export async function getThreadMessages(
  perspectiveId: string,
  sessionId: string
): Promise<Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }>> {
  const db = await getDb();

  const msgs = await db
    .select()
    .from(threadMessages)
    .where(
      and(
        eq(threadMessages.perspectiveId, perspectiveId),
        eq(threadMessages.sessionId, sessionId)
      )
    )
    .orderBy(asc(threadMessages.createdAt));

  return msgs.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function flagPerspective(
  perspectiveId: string,
  ip: string,
  reason: "unfair" | "inaccurate" | "offensive" | "other",
  note?: string
): Promise<void> {
  const db = await getDb();

  // Check perspective exists
  const [persp] = await db
    .select()
    .from(perspectives)
    .where(eq(perspectives.id, perspectiveId));

  if (!persp) {
    throw new AppError("NOT_FOUND", "Perspective not found", 404);
  }

  const ipHash = hashIp(ip, config.IP_HASH_SALT);

  // Check if this IP already flagged this perspective
  const [existingFlag] = await db
    .select()
    .from(flags)
    .where(and(eq(flags.perspectiveId, perspectiveId), eq(flags.ipHash, ipHash)));

  if (existingFlag) {
    // One flag per IP per perspective; silently succeed (idempotent 204)
    return;
  }

  // Insert flag
  await db.insert(flags).values({
    id: generateFlagId(),
    perspectiveId,
    ipHash,
    reason,
    note: note ? note.slice(0, 300) : null,
  });

  // Increment flag count
  const newFlagCount = persp.flagCount + 1;
  const shouldHide = newFlagCount >= 5;

  await db
    .update(perspectives)
    .set({
      flagCount: newFlagCount,
      hidden: shouldHide ? true : persp.hidden,
    })
    .where(eq(perspectives.id, perspectiveId));

  if (shouldHide) {
    logger.warn({ perspectiveId, newFlagCount }, "Perspective auto-hidden due to >= 5 flags");
  }
}

