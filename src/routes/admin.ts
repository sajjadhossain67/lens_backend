import { FastifyPluginAsync } from "fastify";
import { getDb } from "../db/client.js";
import { lenses, flags, perspectives } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { config } from "../config.js";
import { constantTimeCompare } from "../lib/hash.js";
import { AppError } from "../lib/errors.js";

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Hook for admin authentication
  fastify.addHook("preHandler", async (request, _reply) => {
    const adminToken = request.headers["x-admin-token"];
    if (typeof adminToken !== "string" || !constantTimeCompare(adminToken, config.ADMIN_TOKEN)) {
      throw new AppError("NOT_FOUND", "Resource not found or unauthorized", 404);
    }
  });

  // DELETE /admin/lenses/:id
  fastify.delete<{ Params: { id: string } }>("/admin/lenses/:id", async (request, reply) => {
    const lensId = request.params.id;
    const db = await getDb();

    const [existing] = await db
      .select({ id: lenses.id })
      .from(lenses)
      .where(eq(lenses.id, lensId));

    if (!existing) {
      throw new AppError("NOT_FOUND", `Lens with ID "${lensId}" not found`, 404);
    }

    await db.delete(lenses).where(eq(lenses.id, lensId));

    return reply.status(204).send();
  });

  // GET /admin/flags
  fastify.get("/admin/flags", async (_request, reply) => {
    const db = await getDb();

    const flagRows = await db
      .select({
        id: flags.id,
        perspectiveId: flags.perspectiveId,
        ipHash: flags.ipHash,
        reason: flags.reason,
        note: flags.note,
        createdAt: flags.createdAt,
        perspectiveLabel: perspectives.label,
        perspectiveHidden: perspectives.hidden,
        perspectiveFlagCount: perspectives.flagCount,
        lensId: perspectives.lensId,
      })
      .from(flags)
      .leftJoin(perspectives, eq(flags.perspectiveId, perspectives.id))
      .orderBy(desc(flags.createdAt))
      .limit(100);

    return reply.status(200).send({
      items: flagRows.map((f) => ({
        id: f.id,
        perspectiveId: f.perspectiveId,
        ipHash: f.ipHash,
        reason: f.reason,
        note: f.note,
        createdAt: f.createdAt.toISOString(),
        perspective: {
          label: f.perspectiveLabel,
          hidden: f.perspectiveHidden,
          flagCount: f.perspectiveFlagCount,
          lensId: f.lensId,
        },
      })),
    });
  });
};
