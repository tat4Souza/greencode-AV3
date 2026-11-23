import type { Prisma } from "../generated/prisma/client.js";
import type { EquipmentType, ReportType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import type {
  RunEfficiencyInput,
  RunLifespanInput,
  RunProfitabilityInput,
} from "./analytics.schema.js";

export function findCompletedTriageBatches(filters: RunEfficiencyInput) {
  const { startDate, endDate, orgId } = filters;

  return prisma.batch.findMany({
    where: {
      active: true,
      triageCompletedAt: {
        not: null,
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      },
      ...(orgId ? { orgId } : {}),
    },
    select: {
      id: true,
      invoice: true,
      enteredAt: true,
      triageStartedAt: true,
      triageCompletedAt: true,
      triageOperator: {
        select: {
          id: true,
          username: true,
        },
      },
      _count: {
        select: { equipments: true },
      },
    },
    orderBy: { triageCompletedAt: "asc" },
  });
}

export function saveAnalyticsReport(data: {
  type: ReportType;
  params?: Prisma.InputJsonValue;
  result: Prisma.InputJsonValue;
  modelVersion?: string;
}) {
  return prisma.analyticsReport.create({
    data: {
      type: data.type,
      params: data.params,
      result: data.result,
      modelVersion: data.modelVersion ?? "v1",
    },
  });
}

export function findAnalyticsReports(
  type?: ReportType,
  limit = 20,
  orgId?: string,
) {
  return prisma.analyticsReport.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(orgId ? { params: { path: ["orgId"], equals: orgId } } : {}),
    },
    orderBy: { generatedAt: "desc" },
    take: limit,
  });
}

export function findEquipmentsForProfitability(filters: RunProfitabilityInput) {
  const { orgId, type, physicalState } = filters;

  return prisma.equipment.findMany({
    where: {
      estimatedValue: { not: null },
      batch: {
        active: true,
        ...(orgId ? { orgId } : {}),
      },
      ...(type ? { type } : {}),
      ...(physicalState ? { physicalState } : {}),
    },
    select: {
      id: true,
      type: true,
      brand: true,
      model: true,
      physicalState: true,
      weightKG: true,
      estimatedValue: true,
    },
  });
}

export function findEquipmentsAndMovementsForLifespan(
  filters: RunLifespanInput,
) {
  const { orgId, equipmentType } = filters;

  return prisma.equipment.findMany({
    where: {
      batch: {
        active: true,
        ...(orgId ? { orgId } : {}),
      },
      ...(equipmentType ? { type: equipmentType } : {}),
    },
    select: {
      id: true,
      type: true,
      brand: true,
      model: true,
      manufacturingYear: true,
      physicalState: true,
      createdAt: true,
      movements: {
        where: { toPhysicalState: { not: null } },
        select: {
          toPhysicalState: true,
          performedAt: true,
        },
        orderBy: { performedAt: "asc" },
      },
    },
  });
}

export function findEvaluatedPredictions(equipmentType?: EquipmentType) {
  return prisma.prediction.findMany({
    where: {
      actualLifespanYears: { not: null },
      ...(equipmentType ? { equipmentType } : {}),
    },
    orderBy: { evaluatedAt: "desc" },
    take: 50,
  });
}

export function createPredictionRecord(data: {
  equipmentType: EquipmentType;
  predictedLifespanYears: number;
  slope: number;
  intercept: number;
  r2: number;
  sampleSize: number;
}) {
  return prisma.prediction.create({ data });
}

export function findPredictionById(id: string) {
  return prisma.prediction.findUnique({ where: { id } });
}

export function updatePredictionEvaluation(
  id: string,
  actualLifespanYears: number,
  errorYears: number,
) {
  return prisma.prediction.update({
    where: { id },
    data: {
      actualLifespanYears,
      errorYears,
      evaluatedAt: new Date(),
    },
  });
}

export function findPredictionsHistory(
  equipmentType?: EquipmentType,
  limit = 20,
) {
  return prisma.prediction.findMany({
    where: equipmentType ? { equipmentType } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
