import fs from "node:fs";
import path from "node:path";
import type { Prisma } from "../generated/prisma/client.js";
import { badRequest, notFound } from "../lib/errors.js";
import { reportsQueue } from "../queues/reports.queue.js";
import { findApiKeyById } from "../repositories/apiKey.repository.js";
import {
  createReportJob,
  findPublicBatchTraceability,
  findPublicEquipmentTraceability,
  findReportJobByIdAndKey,
} from "../repositories/public.repository.js";
import type {
  PublicCreateBatchInput,
  RequestAsyncReportInput,
} from "../schemas/public.schema.js";
import { registerBatch } from "./batch.service.js";

export async function getPublicBatchTraceability(
  batchId: string,
  orgId: string,
) {
  const batch = await findPublicBatchTraceability(batchId, orgId);
  if (!batch) throw notFound("Lote");
  return batch;
}

export async function getPublicEquipmentTraceability(
  equipmentId: string,
  orgId: string,
) {
  const equipment = await findPublicEquipmentTraceability(equipmentId, orgId);
  if (!equipment) throw notFound("Equipamento");
  return equipment;
}

export async function submitPublicBatch(
  input: PublicCreateBatchInput,
  apiKeyId: string,
  orgId: string,
) {
  const keyRecord = await findApiKeyById(apiKeyId);
  if (!keyRecord) throw notFound("Chave de API");

  return registerBatch({ ...input, orgId }, keyRecord.createdById);
}

export async function enqueuePublicReport(
  input: RequestAsyncReportInput,
  apiKeyId: string,
  orgId: string,
) {
  const { type, format, webhookUrl } = input;

  const jobRecord = await createReportJob({
    apiKeyId,
    type,
    params: {
      orgId,
      format,
      webhookUrl: webhookUrl ?? null,
    } as Prisma.InputJsonValue,
  });

  await reportsQueue.add(
    `generate-${type.toLowerCase()}`,
    {
      reportJobId: jobRecord.id,
      type,
      format,
      params: { orgId },
      webhookUrl,
    },
    { jobId: jobRecord.id },
  );

  return jobRecord;
}

export async function getPublicReportJobStatus(
  jobId: string,
  apiKeyId: string,
) {
  const jobRecord = await findReportJobByIdAndKey(jobId, apiKeyId);
  if (!jobRecord) throw notFound("Tarefa de relatório");
  return jobRecord;
}

export async function preparePublicReportDownload(
  jobId: string,
  apiKeyId: string,
) {
  const jobRecord = await findReportJobByIdAndKey(jobId, apiKeyId);
  if (!jobRecord) throw notFound("Tarefa de relatório");

  if (jobRecord.status !== "CONCLUIDO" || !jobRecord.filePath) {
    throw badRequest(
      `Relatório ainda não disponível para download (status atual: ${jobRecord.status})`,
    );
  }

  if (!fs.existsSync(jobRecord.filePath)) {
    throw notFound("Arquivo do relatório");
  }

  const ext = path.extname(jobRecord.filePath).toLowerCase();
  const contentType =
    ext === ".csv"
      ? "text/csv; charset=utf-8"
      : "application/json; charset=utf-8";
  const fileName = path.basename(jobRecord.filePath);

  return {
    filePath: jobRecord.filePath,
    fileName,
    contentType,
  };
}
