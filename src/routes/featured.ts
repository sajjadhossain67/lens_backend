import { FastifyPluginAsync } from "fastify";
import { getDb } from "../db/client.js";
import { lenses } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { buildLensSnapshot } from "./lenses.js";

export const featuredRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/featured", async (_request, reply) => {
    const db = await getDb();

    const featuredRows = await db
      .select({ id: lenses.id })
      .from(lenses)
      .where(and(eq(lenses.isFeatured, true), eq(lenses.status, "ready")))
      .orderBy(desc(lenses.createdAt))
      .limit(10);

    const items = [];
    for (const row of featuredRows) {
      const snap = await buildLensSnapshot(row.id);
      if (snap) {
        items.push(snap);
      }
    }

    return reply.status(200).send({ items });
  });
};

