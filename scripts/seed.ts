import { getDb } from "../src/db/client.js";
import { lenses, claims, perspectives } from "../src/db/schema.js";
import { migrateDb } from "../src/db/migrate.js";
import { FEATURED_LENSES } from "../tests/fixtures/lenses.js";
import { sha256 } from "../src/lib/hash.js";
import { logger } from "../src/lib/logger.js";
import { eq } from "drizzle-orm";

async function seed() {
  logger.info("Starting seed script...");
  await migrateDb();
  const db = await getDb();

  for (const item of FEATURED_LENSES) {
    logger.info({ id: item.id, title: item.title }, "Seeding featured lens...");

    // Delete existing if re-seeding
    await db.delete(lenses).where(eq(lenses.id, item.id));

    // Insert lens
    await db.insert(lenses).values({
      id: item.id,
      url: item.url,
      canonicalUrl: item.canonicalUrl,
      urlHash: sha256(item.canonicalUrl),
      status: "ready",
      title: item.title,
      siteName: item.siteName,
      author: item.author,
      publishedAt: item.publishedAt,
      language: item.language,
      excerpt: item.excerpt,
      wordCount: item.wordCount,
      readingMinutes: item.readingMinutes,
      summary: item.summary,
      model: item.model,
      isFeatured: true,
      createdAt: new Date(item.publishedAt),
      updatedAt: new Date(),
    });

    // Insert claims
    await db.insert(claims).values(
      item.claims.map((c) => ({
        id: c.id,
        lensId: item.id,
        position: c.position,
        text: c.text,
        sourceQuote: c.sourceQuote,
      }))
    );

    // Insert perspectives
    await db.insert(perspectives).values(
      item.perspectives.map((p) => ({
        id: p.id,
        lensId: item.id,
        position: p.position,
        slug: p.slug,
        label: p.label,
        kind: p.kind,
        colorKey: p.colorKey,
        stance: p.stance,
        thought: p.thought,
        claimIds: p.claimIds,
        flagCount: 0,
        hidden: false,
      }))
    );
  }

  logger.info("Seeding completed successfully with 3 featured lenses.");
  process.exit(0);
}

seed().catch((err) => {
  logger.error({ err }, "Seed script failed");
  process.exit(1);
});

