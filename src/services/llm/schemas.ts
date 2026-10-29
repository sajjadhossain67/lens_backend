import { z } from "zod";

export const CandidateClaimSchema = z.object({
  id: z.string().optional(),
  text: z.string().max(200),
  sourceQuote: z.string(),
});

export const AnalysisResultSchema = z.object({
  summary: z.array(z.string()).length(3),
  claims: z.array(CandidateClaimSchema).min(3).max(12),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const PerspectiveKindSchema = z.enum([
  "ideological",
  "stakeholder",
  "skeptic",
  "local",
  "historical",
]);

export const CandidatePerspectiveSchema = z.object({
  id: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(2).max(40),
  kind: PerspectiveKindSchema,
  stance: z.string().min(10).max(200),
  thought: z.string().min(10).max(400),
  claimIds: z.array(z.string()).min(1),
});

export const PerspectivesResultSchema = z.object({
  perspectives: z.array(CandidatePerspectiveSchema).min(3).max(6),
});

export type PerspectivesResult = z.infer<typeof PerspectivesResultSchema>;

