import { prisma } from "../lib/prisma.js";
import type { ListApiKeysQuery } from "../schemas/apiKey.schema.js";

export const apiKeySelect = {
  id: true,
  orgId: true,
  name: true,
  prefix: true,
  scopes: true,
  rateLimitPerMin: true,
  active: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
  org: { select: { id: true, name: true, cnpj: true } },
};

export function createApiKeyRecord(data: {
  orgId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  rateLimitPerMin: number;
  expiresAt?: Date;
  createdById: string;
}) {
  return prisma.apiKey.create({
    data,
    select: apiKeySelect,
  });
}

export function findAllApiKeys(filters: ListApiKeysQuery) {
  return prisma.apiKey.findMany({
    where: {
      ...(filters.orgId ? { orgId: filters.orgId } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
    },
    select: apiKeySelect,
    orderBy: { createdAt: "desc" },
  });
}

export function findApiKeyById(id: string) {
  return prisma.apiKey.findUnique({ where: { id } });
}

export function findApiKeyByPrefix(prefix: string) {
  return prisma.apiKey.findUnique({
    where: { prefix },
    include: {
      org: { select: { id: true, name: true, active: true } },
    },
  });
}

export function deactivateApiKeyById(id: string) {
  return prisma.apiKey.update({
    where: { id },
    data: { active: false },
    select: apiKeySelect,
  });
}

export function touchApiKeyLastUsed(id: string) {
  return prisma.apiKey.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}
