import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit, {
  type errorResponseBuilderContext,
} from "@fastify/rate-limit";
import { z } from "zod";
import {
  analyticsReportResponseSchema,
  listReportsQuerySchema,
  type ListReportsQuery,
} from "../analytics/analytics.schema.js";
import {
  downloadPublicReportHandler,
  getPublicBatchTraceabilityHandler,
  getPublicEquipmentTraceabilityHandler,
  getPublicReportJobStatusHandler,
  listPublicAnalyticsReportsHandler,
  requestPublicAsyncReportHandler,
  submitPublicBatchHandler,
} from "../controllers/public.controller.js";
import { apiKeyAuth, requireScope } from "../middlewares/apiKeyAuth.js";
import { batchResponseSchema } from "../schemas/batch.schema.js";
import {
  idParamsSchema,
  type IdParamsSchema,
} from "../schemas/common.schema.js";
import {
  errorResponseSchema,
  publicBatchTraceabilitySchema,
  publicCreateBatchSchema,
  publicEquipmentTraceabilitySchema,
  reportJobResponseSchema,
  requestAsyncReportSchema,
  type PublicCreateBatchInput,
  type RequestAsyncReportInput,
} from "../schemas/public.schema.js";

export async function publicApiRoutes(server: FastifyInstance) {
  server.addHook("onRequest", apiKeyAuth);

  await server.register(rateLimit, {
    global: true,
    timeWindow: "1 minute",
    keyGenerator: (request: FastifyRequest) => request.apiKey?.id ?? request.ip,
    max: (request: FastifyRequest) => request.apiKey?.rateLimitPerMin ?? 60,
    errorResponseBuilder: (
      _request: FastifyRequest,
      context: errorResponseBuilderContext,
    ) => ({
      statusCode: 429,
      message: `Limite de requisições excedido (${context.max} req/min). Tente novamente em ${Math.ceil(context.ttl / 1000)}s.`,
    }),
  });

  const publicTag = {
    tags: ["Public Partner API (v1)"],
    security: [{ apiKeyAuth: [] }],
  };

  server.get<{ Params: IdParamsSchema }>(
    "/batches/:id/traceability",
    {
      preHandler: [requireScope("traceability:read")],
      schema: {
        ...publicTag,
        summary: "Consulta rastreabilidade de um lote do parceiro",
        params: idParamsSchema,
        response: {
          200: publicBatchTraceabilitySchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    getPublicBatchTraceabilityHandler,
  );

  server.get<{ Params: IdParamsSchema }>(
    "/equipments/:id/traceability",
    {
      preHandler: [requireScope("traceability:read")],
      schema: {
        ...publicTag,
        summary: "Consulta histórico de rastreabilidade de um equipamento",
        params: idParamsSchema,
        response: {
          200: publicEquipmentTraceabilitySchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    getPublicEquipmentTraceabilityHandler,
  );

  server.post<{ Body: PublicCreateBatchInput }>(
    "/batches",
    {
      preHandler: [requireScope("batches:write")],
      schema: {
        ...publicTag,
        summary: "Submete um novo lote de equipamentos para logística reversa",
        body: publicCreateBatchSchema,
        response: {
          201: batchResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    submitPublicBatchHandler,
  );

  server.get<{ Querystring: ListReportsQuery }>(
    "/analytics/reports",
    {
      preHandler: [requireScope("traceability:read")],
      schema: {
        ...publicTag,
        summary: "Consulta os relatórios analíticos consolidados",
        querystring: listReportsQuerySchema,
        response: {
          200: z.array(analyticsReportResponseSchema),
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    listPublicAnalyticsReportsHandler,
  );

  server.post<{ Body: RequestAsyncReportInput }>(
    "/reports",
    {
      preHandler: [requireScope("reports:request")],
      schema: {
        ...publicTag,
        summary:
          "Solicita a geração assíncrona de um relatório analítico (CSV ou JSON)",
        body: requestAsyncReportSchema,
        response: {
          202: reportJobResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    requestPublicAsyncReportHandler,
  );

  server.get<{ Params: IdParamsSchema }>(
    "/reports/:id",
    {
      preHandler: [requireScope("reports:request")],
      schema: {
        ...publicTag,
        summary:
          "Consulta o status de processamento de um relatório solicitado",
        params: idParamsSchema,
        response: {
          200: reportJobResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    getPublicReportJobStatusHandler,
  );

  server.get<{ Params: IdParamsSchema }>(
    "/reports/:id/download",
    {
      preHandler: [requireScope("reports:request")],
      schema: {
        ...publicTag,
        summary: "Faz o download do arquivo de relatório quando concluído",
        params: idParamsSchema,
      },
    },
    downloadPublicReportHandler,
  );
}
