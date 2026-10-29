import fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { AppError, ErrorCode, ApiErrorEnvelope } from "./lib/errors.js";
import { healthRoutes } from "./routes/health.js";
import { lensesRoutes } from "./routes/lenses.js";
import { perspectivesRoutes } from "./routes/perspectives.js";
import { featuredRoutes } from "./routes/featured.js";
import { adminRoutes } from "./routes/admin.js";
import { nanoid } from "nanoid";

export async function buildApp() {
  const app = fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: "info" },
    trustProxy: config.TRUST_PROXY,
    genReqId: () => nanoid(12),
  });

  // Zod type provider compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Helmet
  await app.register(helmet, {
    contentSecurityPolicy: false, // API server
  });

  // CORS
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-side)
      if (!origin) return cb(null, true);
      const isLocalDevelopmentOrigin =
        config.NODE_ENV === "development" && origin.startsWith("http://localhost:");
      if (origin === config.FRONTEND_ORIGIN || isLocalDevelopmentOrigin) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-token", "x-request-id"],
    credentials: true,
  });

  // Rate Limiting (global default 120 req/min)
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: (req, context) => ({
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Limit exceeded (${context.max} requests per ${context.after}).`,
        requestId: req.id,
      },
    }),
  });

  // Swagger Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Lens API",
        description: "Multi-perspective news analysis API with verified quotes",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: "Local development server",
        },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  // Add x-request-id to all response headers
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // Custom Error Handler
  app.setErrorHandler((error: any, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      const response: ApiErrorEnvelope = {
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      };
      return reply.status(error.statusCode).send(response);
    }

    // Fastify rate limit error (status 429)
    if (error.statusCode === 429) {
      const response: ApiErrorEnvelope = {
        error: {
          code: "RATE_LIMITED",
          message: error.message || "Rate limit exceeded",
          requestId,
        },
      };
      return reply.status(429).send(response);
    }

    // Schema validation errors
    if (error.validation) {
      const response: ApiErrorEnvelope = {
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
          requestId,
        },
      };
      return reply.status(400).send(response);
    }

    // CORS error
    if (error.message === "Not allowed by CORS") {
      const response: ApiErrorEnvelope = {
        error: {
          code: "BLOCKED_URL",
          message: "Cross-Origin Request Blocked",
          requestId,
        },
      };
      return reply.status(403).send(response);
    }

    logger.error({ err: error, requestId }, "Unhandled application error");

    const fallbackResponse: ApiErrorEnvelope = {
      error: {
        code: "INTERNAL",
        message: "An internal server error occurred",
        requestId,
      },
    };
    return reply.status(500).send(fallbackResponse);
  });

  // 404 Handler
  app.setNotFoundHandler((request, reply) => {
    const response: ApiErrorEnvelope = {
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method}:${request.url} not found`,
        requestId: request.id,
      },
    };
    return reply.status(404).send(response);
  });

  // Health route at root
  await app.register(healthRoutes);

  // API v1 routes
  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(lensesRoutes);
      await v1.register(perspectivesRoutes);
      await v1.register(featuredRoutes);
      await v1.register(adminRoutes);
    },
    { prefix: "/api/v1" }
  );

  return app;
}
