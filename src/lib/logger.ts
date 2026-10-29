import pino from "pino";

const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      }
    : undefined,
  redact: ["req.headers.authorization", "req.headers['x-admin-token']"],
});

