import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createApiKeyHandler,
  listApiKeysHandler,
  revokeApiKeyHandler,
} from "../controllers/adminApiKey.controller.js";
import { requireRole } from "../middlewares/auth.js";
import {
  apiKeyResponseSchema,
  createApiKeyResponseSchema,
  createApiKeySchema,
  listApiKeysQuerySchema,
  type CreateApiKeyInput,
  type ListApiKeysQuery,
} from "../schemas/apiKey.schema.js";
import {
  idParamsSchema,
  type IdParamsSchema,
} from "../schemas/common.schema.js";

export async function adminApiKeyRoutes(server: FastifyInstance) {
  server.addHook("onRequest", requireRole("ADMIN"));
  const tag = { tags: ["Admin - API Keys"] };

  server.post<{ Body: CreateApiKeyInput }>(
    "/",
    {
      schema: {
        ...tag,
        summary:
          "Gera uma nova chave de API única para uma organização parceira",
        body: createApiKeySchema,
        response: { 201: createApiKeyResponseSchema },
      },
    },
    createApiKeyHandler,
  );

  server.get<{ Querystring: ListApiKeysQuery }>(
    "/",
    {
      schema: {
        ...tag,
        summary: "Lista as chaves de API emitidas",
        querystring: listApiKeysQuerySchema,
        response: { 200: z.array(apiKeyResponseSchema) },
      },
    },
    listApiKeysHandler,
  );

  server.patch<{ Params: IdParamsSchema }>(
    "/:id/revoke",
    {
      schema: {
        ...tag,
        summary: "Revoga (desativa) uma chave de API existente",
        params: idParamsSchema,
        response: { 200: apiKeyResponseSchema },
      },
    },
    revokeApiKeyHandler,
  );
}
