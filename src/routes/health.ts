import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const handler = async () => {
    return { status: "ok", version: "1.0.0" };
  };

  // Available at root /health and under /api/v1/health
  fastify.get("/health", handler);
};

