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
        description:
          "Retorna o lote e seus equipamentos, com as datas de triagem. Exige o escopo `traceability:read`. Só lotes da organização dona da chave são visíveis; qualquer outro id responde 404.",
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
        description:
          "Retorna o equipamento e todas as suas movimentações. Exige o escopo `traceability:read`. Equipamentos de outras organizações respondem 404.",
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
        description:
          "Cria um lote para a organização dona da chave, opcionalmente já com os equipamentos. Exige o escopo `batches:write`. A organização precisa estar ativa e com contrato válido, e a data de entrada não pode ser futura nem anterior a 90 dias.",
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
        description:
          "Lista o histórico de relatórios analíticos gerados para a organização da chave (por exemplo, os solicitados em POST /reports). Exige o escopo `traceability:read`.",
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
        description:
          "Publica a tarefa na fila e responde imediatamente com 202 e o identificador. Acompanhe por polling em GET /reports/{id} ou informe um `webhookUrl`. Exige o escopo `reports:request`. Tarefas com falha são repetidas até 3 vezes, com espera crescente.",
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
        description:
          "Retorna o status da tarefa (NA_FILA, PROCESSANDO, CONCLUIDO ou FALHOU). Exige o escopo `reports:request`. Só tarefas da própria chave são visíveis.",
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
        description:
          "Devolve o arquivo (CSV com separador `;` e UTF-8 com BOM, ou JSON). Responde 400 enquanto a tarefa não estiver CONCLUIDA. Exige o escopo `reports:request`.",
        params: idParamsSchema,
      },
    },
    downloadPublicReportHandler,
  );
}
