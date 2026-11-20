import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../middlewares/auth.js";
import {
  evaluatePredictionHandler,
  listAnalyticsReportsHandler,
  listPredictionsHandler,
  triggerEfficiencyAnalysisHandler,
  triggerLifespanAnalysisHandler,
  triggerProfitabilityAnalysisHandler,
} from "./analytics.controller.js";
import {
  analyticsReportResponseSchema,
  evaluatePredictionBodySchema,
  evaluatePredictionParamsSchema,
  listReportsQuerySchema,
  predictionResponseSchema,
  runEfficiencyInputSchema,
  runLifespanInputSchema,
  runProfitabilityInputSchema,
  type EvaluatePredictionBody,
  type EvaluatePredictionParams,
  type ListReportsQuery,
  type RunEfficiencyInput,
  type RunLifespanInput,
  type RunProfitabilityInput,
} from "./analytics.schema.js";

export async function internalAnalyticsRoutes(server: FastifyInstance) {
  server.addHook("onRequest", requireRole("ADMIN", "GESTOR", "AUDITOR"));

  const analyticsTag = { tags: ["Analytics (Internal)"] };

  server.post<{ Body: RunEfficiencyInput }>(
    "/efficiency",
    {
      schema: {
        ...analyticsTag,
        summary: "Executa e persiste a análise de eficiência operacional",
        body: runEfficiencyInputSchema,
        response: { 201: analyticsReportResponseSchema },
      },
    },
    triggerEfficiencyAnalysisHandler,
  );

  server.get<{ Querystring: ListReportsQuery }>(
    "/reports",
    {
      schema: {
        ...analyticsTag,
        summary: "Lista o histórico de relatórios analíticos gerados",
        querystring: listReportsQuerySchema,
        response: { 200: z.array(analyticsReportResponseSchema) },
      },
    },
    listAnalyticsReportsHandler,
  );

  server.post<{ Body: RunProfitabilityInput }>(
    "/profitability",
    {
      schema: {
        ...analyticsTag,
        summary:
          "Executa e persiste a análise de rentabilidade por equipamento",
        body: runProfitabilityInputSchema,
        response: { 201: analyticsReportResponseSchema },
      },
    },
    triggerProfitabilityAnalysisHandler,
  );

  server.post<{ Body: RunLifespanInput }>(
    "/lifespan",
    {
      schema: {
        ...analyticsTag,
        summary: "Executa e persiste a previsão de vida útil remanescente",
        body: runLifespanInputSchema,
        response: { 201: analyticsReportResponseSchema },
      },
    },
    triggerLifespanAnalysisHandler,
  );

  server.get(
    "/predictions",
    {
      schema: {
        ...analyticsTag,
        summary: "Lista o histórico de previsões de vida útil por equipamento",
        response: { 200: z.array(predictionResponseSchema) },
      },
    },
    listPredictionsHandler,
  );

  server.patch<{
    Params: EvaluatePredictionParams;
    Body: EvaluatePredictionBody;
  }>(
    "/predictions/:id/evaluate",
    {
      schema: {
        ...analyticsTag,
        summary:
          "Registra a vida útil real observada para calcular erro e calibrar previsões futuras",
        params: evaluatePredictionParamsSchema,
        body: evaluatePredictionBodySchema,
        response: { 200: predictionResponseSchema },
      },
    },
    evaluatePredictionHandler,
  );
}
