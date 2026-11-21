import { z } from "zod";

export const apiKeyScopeEnum = z.enum([
  "traceability:read",
  "batches:write",
  "reports:request",
]);

export type ApiKeyScope = z.infer<typeof apiKeyScopeEnum>;

export const createApiKeySchema = z.object({
  orgId: z.uuid(),
  name: z.string().min(2).max(100),
  scopes: z.array(apiKeyScopeEnum).min(1),
  rateLimitPerMin: z.number().int().min(1).max(1000).default(60),
  expiresAt: z.coerce.date().optional(),
});

export const apiKeyResponseSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  rateLimitPerMin: z.number().int(),
  active: z.boolean(),
  expiresAt: z.date().nullable(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
  org: z.object({ id: z.uuid(), name: z.string(), cnpj: z.string() }),
});

export const createApiKeyResponseSchema = apiKeyResponseSchema.extend({
  plainKey: z.string(),
});

export const listApiKeysQuerySchema = z.object({
  orgId: z.uuid().optional(),
  active: z.stringbool().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;
