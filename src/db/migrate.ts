import { getDb, DatabaseInstance } from "./client.js";
import { logger } from "../lib/logger.js";
import { sql } from "drizzle-orm";

const STATEMENTS = [
  sql`CREATE TABLE IF NOT EXISTS lenses (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    url_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT,
    site_name TEXT,
    author TEXT,
    published_at TEXT,
    language TEXT,
    excerpt TEXT,
    word_count INTEGER,
    reading_minutes INTEGER,
    summary JSONB,
    model TEXT,
    failure_code TEXT,
    failure_message TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  sql`CREATE INDEX IF NOT EXISTS lenses_url_hash_idx ON lenses (url_hash)`,
  sql`CREATE INDEX IF NOT EXISTS lenses_created_at_idx ON lenses (created_at)`,

  sql`CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    source_quote TEXT NOT NULL
  )`,

  sql`CREATE INDEX IF NOT EXISTS claims_lens_id_idx ON claims (lens_id)`,

  sql`CREATE TABLE IF NOT EXISTS perspectives (
    id TEXT PRIMARY KEY,
    lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    slug TEXT NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    color_key INTEGER NOT NULL,
    stance TEXT NOT NULL,
    thought TEXT NOT NULL,
    claim_ids JSONB NOT NULL,
    flag_count INTEGER NOT NULL DEFAULT 0,
    hidden BOOLEAN NOT NULL DEFAULT FALSE
  )`,

  sql`CREATE INDEX IF NOT EXISTS perspectives_lens_id_idx ON perspectives (lens_id)`,
  sql`CREATE INDEX IF NOT EXISTS perspectives_hidden_idx ON perspectives (hidden)`,

  sql`CREATE TABLE IF NOT EXISTS thread_messages (
    id TEXT PRIMARY KEY,
    perspective_id TEXT NOT NULL REFERENCES perspectives(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  sql`CREATE INDEX IF NOT EXISTS thread_messages_session_idx ON thread_messages (perspective_id, session_id)`,

  sql`CREATE TABLE IF NOT EXISTS flags (
    id TEXT PRIMARY KEY,
    perspective_id TEXT NOT NULL REFERENCES perspectives(id) ON DELETE CASCADE,
    ip_hash TEXT NOT NULL,
    reason TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT flags_persp_ip_unique UNIQUE (perspective_id, ip_hash)
  )`,

  sql`CREATE UNIQUE INDEX IF NOT EXISTS flags_persp_ip_idx ON flags (perspective_id, ip_hash)`,
];

export async function migrateDb(dbParam?: DatabaseInstance): Promise<void> {
  const db = dbParam ?? (await getDb());

  logger.info("Running database schema migration...");

  for (const statement of STATEMENTS) {
    try {
      await db.execute(statement);
    } catch (err: any) {
      // Ignore if constraint or index already exists
      if (!err?.message?.includes("already exists")) {
        logger.warn({ err, statement }, "Migration statement warning");
      }
    }
  }

  logger.info("Database schema migration completed successfully.");
}

// If run directly as a script
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  migrateDb()
    .then(() => {
      console.log("Migration successful");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
