import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import * as schema from "./schema.js";
import postgres from "postgres";
import { drizzle as drizzlePostgres, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, PgliteDatabase } from "drizzle-orm/pglite";

export type DatabaseInstance = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

let dbInstance: DatabaseInstance | null = null;
let pgClient: postgres.Sql | null = null;
let pgliteClient: PGlite | null = null;

export async function getDb(): Promise<DatabaseInstance> {
  if (dbInstance) {
    return dbInstance;
  }

  const dbUrl = config.DATABASE_URL;

  if (dbUrl.startsWith("memory://") || process.env.NODE_ENV === "test") {
    logger.info("Initializing in-memory PostgreSQL (PGlite) instance");
    pgliteClient = new PGlite();
    dbInstance = drizzlePglite(pgliteClient, { schema });
    return dbInstance;
  }

  try {
    logger.info({ url: dbUrl.replace(/:[^:@]+@/, ":***@") }, "Connecting to PostgreSQL database");
    pgClient = postgres(dbUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 5,
    });
    // Test connectivity
    await pgClient`SELECT 1`;
    dbInstance = drizzlePostgres(pgClient, { schema });
    return dbInstance;
  } catch (err) {
    logger.warn({ err }, "Failed to connect to PostgreSQL; falling back to embedded PGlite for robustness");
    pgliteClient = new PGlite();
    dbInstance = drizzlePglite(pgliteClient, { schema });
    return dbInstance;
  }
}

export async function closeDb(): Promise<void> {
  if (pgClient) {
    await pgClient.end({ timeout: 2 });
    pgClient = null;
  }
  if (pgliteClient) {
    await pgliteClient.close();
    pgliteClient = null;
  }
  dbInstance = null;
}

