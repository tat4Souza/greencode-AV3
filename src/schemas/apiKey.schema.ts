import { z } from "zod";

const EXAMPLE_ORG_ID = "3f6c1d2e-8a4b-4c5d-9e7f-1a2b3c4d5e6f";

export const apiKeyScopeEnum = z.enum([
  "traceability:read",
  "batches:write",
  "reports:request",
]);

export type ApiKeyScope = z.infer<typeof apiKeyScopeEnum>;

export const createApiKeySchema = z
  .object({
    orgId: z
      .uuid()
      .meta({
        description:
          "Organização parceira que receberá a chave. A chave só enxerga os dados dessa organização.",
        example: EXAMPLE_ORG_ID,
      }),
    name: z
      .string()
      .min(2)
      .max(100)
      .meta({
        description: "Nome para identificar a integração (2 a 100 caracteres).",
        example: "Integração ERP EcoTech",
      }),
    scopes: z
      .array(apiKeyScopeEnum)
      .min(1)
      .meta({
        description:
          "Permissões da chave. `traceability:read`: consulta de rastreabilidade e dos relatórios da organização. `batches:write`: submissão de lotes. `reports:request`: solicitação e download de relatórios assíncronos.",
        example: ["traceability:read", "reports:request"],
      }),
    rateLimitPerMin: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(60)
      .meta({
        description: "Limite de requisições por minuto (1 a 1000).",
        example: 60,
      }),
    expiresAt: z.coerce
      .date()
      .optional()
      .meta({
        description:
          "Data de expiração (ISO 8601, no futuro). Sem valor, a chave não expira.",
        example: "2027-12-31T23:59:59.000Z",
      }),
  })
  .meta({
    example: {
      orgId: EXAMPLE_ORG_ID,
      name: "Integração ERP EcoTech",
      scopes: ["traceability:read", "reports:request"],
      rateLimitPerMin: 60,
      expiresAt: "2027-12-31T23:59:59.000Z",
    },
  });

export const apiKeyResponseSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  name: z.string(),
  prefix: z
    .string()
    .meta({
      description: "Prefixo público da chave, usado para identificá-la.",
      example: "gc_live_a1b2c3d4",
    }),
  scopes: z.array(z.string()),
  rateLimitPerMin: z.number().int(),
  active: z.boolean(),
  expiresAt: z.date().nullable(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
  org: z.object({ id: z.uuid(), name: z.string(), cnpj: z.string() }),
});

export const createApiKeyResponseSchema = apiKeyResponseSchema.extend({
  plainKey: z
    .string()
    .meta({
      description:
        "Chave completa. É exibida somente nesta resposta e não pode ser recuperada depois: guarde-a em local seguro.",
      example:
        "gc_live_a1b2c3d4_0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a6978",
    }),
});

export const listApiKeysQuerySchema = z.object({
  orgId: z
    .uuid()
    .optional()
    .meta({
      description: "Filtra as chaves de uma organização.",
      example: EXAMPLE_ORG_ID,
    }),
  active: z
    .stringbool()
    .optional()
    .meta({
      description: "`true` lista só as chaves ativas; `false`, só as revogadas.",
      example: "true",
    }),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;
