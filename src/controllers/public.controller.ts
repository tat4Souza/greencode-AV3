import fs from "node:fs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { findAnalyticsReports } from "../analytics/analytics.repository.js";
import type { ListReportsQuery } from "../analytics/analytics.schema.js";
import type { IdParamsSchema } from "../schemas/common.schema.js";
import type {
  PublicCreateBatchInput,
  RequestAsyncReportInput,
} from "../schemas/public.schema.js";
import {
  enqueuePublicReport,
  getPublicBatchTraceability,
  getPublicEquipmentTraceability,
  getPublicReportJobStatus,
  preparePublicReportDownload,
  submitPublicBatch,
} from "../services/public.service.js";

export async function getPublicBatchTraceabilityHandler(
  request: FastifyRequest<{ Params: IdParamsSchema }>,
  reply: FastifyReply,
) {
  const batch = await getPublicBatchTraceability(
    request.params.id,
    request.apiKey!.orgId,
  );
  return reply.send(batch);
}

export async function getPublicEquipmentTraceabilityHandler(
  request: FastifyRequest<{ Params: IdParamsSchema }>,
  reply: FastifyReply,
) {
  const equipment = await getPublicEquipmentTraceability(
    request.params.id,
    request.apiKey!.orgId,
  );
  return reply.send(equipment);
}

export async function submitPublicBatchHandler(
  request: FastifyRequest<{ Body: PublicCreateBatchInput }>,
  reply: FastifyReply,
) {
  const created = await submitPublicBatch(
    request.body,
    request.apiKey!.id,
    request.apiKey!.orgId,
  );
  return reply.code(201).send(created);
}

export async function listPublicAnalyticsReportsHandler(
  request: FastifyRequest<{ Querystring: ListReportsQuery }>,
  reply: FastifyReply,
) {
  const { type, limit } = request.query;
  const reports = await findAnalyticsReports(
    type,
    limit,
    request.apiKey!.orgId,
  );
  return reply.send(reports);
}

export async function requestPublicAsyncReportHandler(
  request: FastifyRequest<{ Body: RequestAsyncReportInput }>,
  reply: FastifyReply,
) {
  const jobRecord = await enqueuePublicReport(
    request.body,
    request.apiKey!.id,
    request.apiKey!.orgId,
  );
  return reply.code(202).send(jobRecord);
}

export async function getPublicReportJobStatusHandler(
  request: FastifyRequest<{ Params: IdParamsSchema }>,
  reply: FastifyReply,
) {
  const jobRecord = await getPublicReportJobStatus(
    request.params.id,
    request.apiKey!.id,
  );
  return reply.send(jobRecord);
}

export async function downloadPublicReportHandler(
  request: FastifyRequest<{ Params: IdParamsSchema }>,
  reply: FastifyReply,
) {
  const { filePath, fileName, contentType } = await preparePublicReportDownload(
    request.params.id,
    request.apiKey!.id,
  );

  reply.header("Content-Type", contentType);
  reply.header("Content-Disposition", `attachment; filename="${fileName}"`);

  return reply.send(fs.createReadStream(filePath));
}
