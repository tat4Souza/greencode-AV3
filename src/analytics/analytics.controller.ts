import type { FastifyReply, FastifyRequest } from "fastify";
import {
  findAnalyticsReports,
  findPredictionsHistory,
} from "./analytics.repository.js";
import { runProfitabilityAnalysis } from "./services/profitability.service.js";
import type {
  EvaluatePredictionBody,
  EvaluatePredictionParams,
  RunLifespanInput,
  RunProfitabilityInput,
} from "./analytics.schema.js";
import type {
  ListReportsQuery,
  RunEfficiencyInput,
} from "./analytics.schema.js";
import { runEfficiencyAnalysis } from "./services/efficiency.service.js";
import {
  evaluatePredictionWithActual,
  runLifespanPredictionAnalysis,
} from "./services/lifespan.service.js";
import type { EquipmentType } from "../generated/prisma/enums.js";

export async function triggerEfficiencyAnalysisHandler(
  request: FastifyRequest<{ Body: RunEfficiencyInput }>,
  reply: FastifyReply,
) {
  const report = await runEfficiencyAnalysis(request.body ?? {});
  return reply.code(201).send(report);
}

export async function listAnalyticsReportsHandler(
  request: FastifyRequest<{ Querystring: ListReportsQuery }>,
  reply: FastifyReply,
) {
  const { type, limit } = request.query;
  const reports = await findAnalyticsReports(type, limit);
  return reply.send(reports);
}

export async function triggerProfitabilityAnalysisHandler(
  request: FastifyRequest<{ Body: RunProfitabilityInput }>,
  reply: FastifyReply,
) {
  const report = await runProfitabilityAnalysis(request.body ?? {});
  return reply.code(201).send(report);
}

export async function triggerLifespanAnalysisHandler(
  request: FastifyRequest<{ Body: RunLifespanInput }>,
  reply: FastifyReply,
) {
  const report = await runLifespanPredictionAnalysis(request.body ?? {});
  return reply.code(201).send(report);
}

export async function listPredictionsHandler(
  request: FastifyRequest<{ Querystring: { equipmentType?: EquipmentType } }>,
  reply: FastifyReply,
) {
  const predictions = await findPredictionsHistory(request.query.equipmentType);
  return reply.send(predictions);
}

export async function evaluatePredictionHandler(
  request: FastifyRequest<{
    Params: EvaluatePredictionParams;
    Body: EvaluatePredictionBody;
  }>,
  reply: FastifyReply,
) {
  const updated = await evaluatePredictionWithActual(
    request.params.id,
    request.body.actualLifespanYears,
  );
  return reply.send(updated);
}
