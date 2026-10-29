import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const lenses = pgTable(
  "lenses",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    urlHash: text("url_hash").notNull(),
    status: text("status").notNull().$type<"processing" | "ready" | "failed">(),
    title: text("title"),
    siteName: text("site_name"),
    author: text("author"),
    publishedAt: text("published_at"),
    language: text("language"),
    excerpt: text("excerpt"),
    wordCount: integer("word_count"),
    readingMinutes: integer("reading_minutes"),
    summary: jsonb("summary").$type<string[]>(),
    model: text("model"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    isFeatured: boolean("is_featured").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("lenses_url_hash_idx").on(table.urlHash),
    index("lenses_created_at_idx").on(table.createdAt),
  ]
);

export const claims = pgTable(
  "claims",
  {
    id: text("id").primaryKey(),
    lensId: text("lens_id")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    sourceQuote: text("source_quote").notNull(),
  },
  (table) => [index("claims_lens_id_idx").on(table.lensId)]
);

export const perspectives = pgTable(
  "perspectives",
  {
    id: text("id").primaryKey(),
    lensId: text("lens_id")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    kind: text("kind")
      .notNull()
      .$type<"ideological" | "stakeholder" | "skeptic" | "local" | "historical">(),
    colorKey: integer("color_key").notNull(),
    stance: text("stance").notNull(),
    thought: text("thought").notNull(),
    claimIds: jsonb("claim_ids").notNull().$type<string[]>(),
    flagCount: integer("flag_count").default(0).notNull(),
    hidden: boolean("hidden").default(false).notNull(),
  },
  (table) => [
    index("perspectives_lens_id_idx").on(table.lensId),
    index("perspectives_hidden_idx").on(table.hidden),
  ]
);

export const threadMessages = pgTable(
  "thread_messages",
  {
    id: text("id").primaryKey(),
    perspectiveId: text("perspective_id")
      .notNull()
      .references(() => perspectives.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    role: text("role").notNull().$type<"user" | "assistant">(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("thread_messages_session_idx").on(table.perspectiveId, table.sessionId),
  ]
);

export const flags = pgTable(
  "flags",
  {
    id: text("id").primaryKey(),
    perspectiveId: text("perspective_id")
      .notNull()
      .references(() => perspectives.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    reason: text("reason")
      .notNull()
      .$type<"unfair" | "inaccurate" | "offensive" | "other">(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("flags_persp_ip_idx").on(table.perspectiveId, table.ipHash),
  ]
);

export type LensRecord = typeof lenses.$inferSelect;
export type ClaimRecord = typeof claims.$inferSelect;
export type PerspectiveRecord = typeof perspectives.$inferSelect;
export type ThreadMessageRecord = typeof threadMessages.$inferSelect;
export type FlagRecord = typeof flags.$inferSelect;

