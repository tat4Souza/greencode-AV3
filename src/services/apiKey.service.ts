import crypto from "node:crypto";
import { badRequest, notFound } from "../lib/errors.js";
import {
  createApiKeyRecord,
  deactivateApiKeyById,
  findAllApiKeys,
  findApiKeyById,
  findApiKeyByPrefix,
  touchApiKeyLastUsed,
} from "../repositories/apiKey.repository.js";
import { findOrgById } from "../repositories/organization.repository.js";
import type {
  CreateApiKeyInput,
  ListApiKeysQuery,
} from "../schemas/apiKey.schema.js";

export function hashApiKey(plainKey: string): string {
  return crypto.createHash("sha256").update(plainKey).digest("hex");
}

export async function generateApiKey(
  input: CreateApiKeyInput,
  createdById: string,
) {
  const org = await findOrgById(input.orgId);
  if (!org) throw notFound("Organização");
  if (!org.active) {
    throw badRequest("Não é possível gerar chave para uma organização inativa");
  }

  if (input.expiresAt && input.expiresAt <= new Date()) {
    throw badRequest("A data de expiração deve ser futura");
  }

  const randomPrefix = crypto.randomBytes(4).toString("hex");
  const randomSecret = crypto.randomBytes(24).toString("hex");
  const prefix = `gc_live_${randomPrefix}`;
  const plainKey = `${prefix}_${randomSecret}`;
  const keyHash = hashApiKey(plainKey);
  const uniqueScopes = Array.from(new Set(input.scopes));

  const created = await createApiKeyRecord({
    orgId: input.orgId,
    name: input.name,
    prefix,
    keyHash,
    scopes: uniqueScopes,
    rateLimitPerMin: input.rateLimitPerMin,
    expiresAt: input.expiresAt,
    createdById,
  });

  return { ...created, plainKey };
}

export function listApiKeys(filters: ListApiKeysQuery) {
  return findAllApiKeys(filters);
}

export async function revokeApiKey(id: string) {
  const existing = await findApiKeyById(id);
  if (!existing) throw notFound("Chave de API");

  if (!existing.active) {
    throw badRequest("Esta chave de API já está revogada");
  }

  return deactivateApiKeyById(id);
}

export async function validateApiKey(plainKey: string) {
  const parts = plainKey.split("_");
  if (parts.length !== 4 || parts[0] !== "gc" || parts[1] !== "live") {
    return null;
  }

  const prefix = `${parts[0]}_${parts[1]}_${parts[2]}`;
  const record = await findApiKeyByPrefix(prefix);

  if (!record || !record.active || !record.org.active) {
    return null;
  }

  if (record.expiresAt && record.expiresAt <= new Date()) {
    return null;
  }

  const incomingHash = hashApiKey(plainKey);
  const a = Buffer.from(incomingHash, "hex");
  const b = Buffer.from(record.keyHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  void touchApiKeyLastUsed(record.id).catch(() => {});

  return record;
}
