import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { migrateDb } from "./db/migrate.js";
import { cleanStaleLenses } from "./services/analysis/pipeline.js";
import { closeDb } from "./db/client.js";

async function startServer() {
  try {
    logger.info("Initializing Lens database and migrations...");
    await migrateDb();

    logger.info("Cleaning up stale processing lenses...");
    await cleanStaleLenses();

    const app = await buildApp();

    const address = await app.listen({
      port: config.PORT,
      host: "0.0.0.0",
    });

    logger.info(`Lens API server running at ${address}`);
    logger.info(`Swagger OpenAPI docs available at ${address}/docs`);

    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        try {
          await app.close();
          await closeDb();
          logger.info("Server and database connections closed.");
          process.exit(0);
        } catch (err) {
          logger.error({ err }, "Error during graceful shutdown");
          process.exit(1);
        }
      });
    }
  } catch (err) {
    logger.error({ err }, "Fatal server startup error");
    process.exit(1);
  }
}

startServer();

