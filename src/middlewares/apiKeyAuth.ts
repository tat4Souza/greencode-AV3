import type { FastifyReply, FastifyRequest } from "fastify";
import { validateApiKey } from "../services/apiKey.service.js";
import type { ApiKeyScope } from "../schemas/apiKey.schema.js";

export interface AuthenticatedApiKey {
  id: string;
  orgId: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMin: number;
}

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: AuthenticatedApiKey;
  }
}

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const headerKey = request.headers["x-api-key"];

  if (typeof headerKey !== "string" || !headerKey.trim()) {
    return reply.code(401).send({
      message: "Cabeçalho x-api-key ausente ou inválido",
    });
  }

  const record = await validateApiKey(headerKey.trim());
  if (!record) {
    return reply.code(401).send({
      message: "Chave de API inválida, expirada ou revogada",
    });
  }

  request.apiKey = {
    id: record.id,
    orgId: record.orgId,
    name: record.name,
    prefix: record.prefix,
    scopes: record.scopes,
    rateLimitPerMin: record.rateLimitPerMin,
  };
}

export function requireScope(...requiredScopes: ApiKeyScope[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.apiKey) {
      return reply.code(401).send({
        message: "Autenticação por API Key obrigatória",
      });
    }

    const hasAll = requiredScopes.every((scope) =>
      request.apiKey!.scopes.includes(scope),
    );

    if (!hasAll) {
      return reply.code(403).send({
        message: `Permissão insuficiente. Escopos exigidos: ${requiredScopes.join(", ")}`,
      });
    }
  };
}
