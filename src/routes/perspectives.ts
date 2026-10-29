import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { handleArgueStream, getThreadMessages, flagPerspective } from "../services/argue.js";
import { SSEStream } from "../services/sse.js";
import { AppError } from "../lib/errors.js";

const ArgueBodySchema = z.object({
  sessionId: z.string().uuid("sessionId must be a valid UUID"),
  message: z.string().min(1).max(500, "Message cannot exceed 500 characters"),
});

const ThreadQuerySchema = z.object({
  sessionId: z.string().uuid("sessionId must be a valid UUID"),
});

const FlagBodySchema = z.object({
  reason: z.enum(["unfair", "inaccurate", "offensive", "other"]),
  note: z.string().max(300).optional(),
});

export const perspectivesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /perspectives/:id/argue
  fastify.post<{ Params: { id: string } }>(
    "/perspectives/:id/argue",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const perspectiveId = request.params.id;
      const parsed = ArgueBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(
          "VALIDATION_ERROR",
          parsed.error.errors.map((e) => e.message).join(", "),
          400
        );
      }

      const sse = new SSEStream(request, reply);
      await handleArgueStream(
        perspectiveId,
        parsed.data.sessionId,
        parsed.data.message,
        sse
      );
    }
  );

  // GET /perspectives/:id/thread?sessionId=
  fastify.get<{ Params: { id: string }; Querystring: { sessionId?: string } }>(
    "/perspectives/:id/thread",
    async (request, reply) => {
      const perspectiveId = request.params.id;
      const parsed = ThreadQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", "A valid UUID sessionId is required", 400);
      }

      const messages = await getThreadMessages(perspectiveId, parsed.data.sessionId);
      return reply.status(200).send({ messages });
    }
  );

  // POST /perspectives/:id/flag
  fastify.post<{ Params: { id: string } }>(
    "/perspectives/:id/flag",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const perspectiveId = request.params.id;
      const parsed = FlagBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(
          "VALIDATION_ERROR",
          parsed.error.errors.map((e) => e.message).join(", "),
          400
        );
      }

      // Fastify derives request.ip from the socket unless TRUST_PROXY explicitly
      // enables trusted forwarding. Never parse a spoofable header here.
      const ip = request.ip;
      await flagPerspective(
        perspectiveId,
        ip,
        parsed.data.reason,
        parsed.data.note
      );

      return reply.status(204).send();
    }
  );
};
