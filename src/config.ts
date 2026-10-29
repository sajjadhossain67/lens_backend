import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default("postgres://lens:lens@localhost:5432/lens"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  PUBLIC_SITE_URL: z.string().default("http://localhost:3000"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().default("claude-sonnet-5-5"),
  LLM_PROVIDER: z.enum(["anthropic", "mock"]).default("mock"),
  ADMIN_TOKEN: z.string().min(1).default("change-me"),
  IP_HASH_SALT: z.string().min(1).default("change-me"),
  BLOCKED_DOMAINS: z.string().default(""),
  ROBOTS_CHECK: z.enum(["true", "false"]).transform((v) => v === "true").default("true"),
  MAX_NEW_LENSES_PER_DAY: z.coerce.number().default(500),
  TRUST_PROXY: z.enum(["true", "false"]).transform((v) => v === "true").default("false"),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;

  if (env.ADMIN_TOKEN === "change-me" || env.ADMIN_TOKEN.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ADMIN_TOKEN"],
      message: "Production ADMIN_TOKEN must be at least 32 characters and not use the default",
    });
  }
  if (env.IP_HASH_SALT === "change-me" || env.IP_HASH_SALT.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["IP_HASH_SALT"],
      message: "Production IP_HASH_SALT must be at least 32 characters and not use the default",
    });
  }
  if (env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ANTHROPIC_API_KEY"],
      message: "ANTHROPIC_API_KEY is required for the Anthropic provider",
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.format());
  throw new Error("Invalid environment configuration");
}

export const config = parsed.data;
export type Config = typeof config;

