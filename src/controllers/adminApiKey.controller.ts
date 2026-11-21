import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateApiKeyInput,
  ListApiKeysQuery,
} from "../schemas/apiKey.schema.js";
import type { IdParamsSchema } from "../schemas/common.schema.js";
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
} from "../services/apiKey.service.js";

export async function createApiKeyHandler(
  request: FastifyRequest<{ Body: CreateApiKeyInput }>,
  reply: FastifyReply,
) {
  const created = await generateApiKey(request.body, request.user.id);
  return reply.code(201).send(created);
}

export async function listApiKeysHandler(
  request: FastifyRequest<{ Querystring: ListApiKeysQuery }>,
  reply: FastifyReply,
) {
  const keys = await listApiKeys(request.query);
  return reply.send(keys);
}

export async function revokeApiKeyHandler(
  request: FastifyRequest<{ Params: IdParamsSchema }>,
  reply: FastifyReply,
) {
  const revoked = await revokeApiKey(request.params.id);
  return reply.send(revoked);
}
