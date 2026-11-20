import * as ss from "simple-statistics";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  EquipmentType,
  PhysicalState,
} from "../../generated/prisma/enums.js";
import { notFound } from "../../lib/errors.js";
import {
  createPredictionRecord,
  findEquipmentsAndMovementsForLifespan,
  findEvaluatedPredictions,
  findPredictionById,
  saveAnalyticsReport,
  updatePredictionEvaluation,
} from "../analytics.repository.js";
import type { RunLifespanInput } from "../analytics.schema.js";

const HEALTH_SCORE: Record<PhysicalState, number> = {
  NOVO: 100,
  BOM_ESTADO: 85,
  USADO_LEVE: 70,
  USADO_MODERADO: 50,
  DANIFICADO_LEVE: 35,
  DANIFICADO_GRAVE: 15,
  INSERVIVEL: 0,
};

export interface EquipmentTypeLifespanProjection {
  predictionId: string;
  equipmentType: EquipmentType;
  sampleSize: number;
  activeEquipmentsCount: number;
  unusableEquipmentsCount: number;
  regression: {
    slopePerYear: number;
    intercept: number;
    r2: number;
    calibrationOffsetYears: number;
  };
  rawPredictedTotalLifespanYears: number;
  calibratedTotalLifespanYears: number;
  averageCurrentAgeYears: number;
  estimatedRemainingLifespanYears: number;
  projectedUnusableYear: number;
}

export interface LifespanAnalysisResult {
  modelVersion: string;
  referenceYear: number;
  projectionsByType: EquipmentTypeLifespanProjection[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeAgeInYears(manufacturingYear: number, atDate: Date): number {
  const exactYear = atDate.getUTCFullYear() + atDate.getUTCMonth() / 12;
  return Math.max(0.1, round2(exactYear - manufacturingYear));
}

export async function runLifespanPredictionAnalysis(
  filters: RunLifespanInput = {},
) {
  const equipments = await findEquipmentsAndMovementsForLifespan(filters);
  const evaluatedHistory = await findEvaluatedPredictions(
    filters.equipmentType,
  );

  const now = new Date();
  const currentYear = now.getUTCFullYear();

  type Observation = {
    equipmentId: string;
    ageYears: number;
    healthScore: number;
    isCurrentState: boolean;
    physicalState: PhysicalState;
  };

  const byType = new Map<EquipmentType, Observation[]>();

  for (const eq of equipments) {
    const list = byType.get(eq.type) ?? [];

    for (const mov of eq.movements) {
      if (mov.toPhysicalState) {
        list.push({
          equipmentId: eq.id,
          ageYears: computeAgeInYears(eq.manufacturingYear, mov.performedAt),
          healthScore: HEALTH_SCORE[mov.toPhysicalState],
          isCurrentState: false,
          physicalState: mov.toPhysicalState,
        });
      }
    }

    list.push({
      equipmentId: eq.id,
      ageYears: computeAgeInYears(eq.manufacturingYear, eq.createdAt),
      healthScore: HEALTH_SCORE[eq.physicalState],
      isCurrentState: true,
      physicalState: eq.physicalState,
    });

    byType.set(eq.type, list);
  }

  const projectionsByType: EquipmentTypeLifespanProjection[] = [];
  let hasCalibration = false;

  for (const [equipmentType, observations] of byType.entries()) {
    const points: [number, number][] = observations.map((o) => [
      o.ageYears,
      o.healthScore,
    ]);

    let slope = -10;
    let intercept = 100;
    let r2 = 0;

    if (points.length >= 2) {
      const reg = ss.linearRegression(points);
      const line = ss.linearRegressionLine(reg);
      slope = reg.m;
      intercept = reg.b;

      try {
        r2 = ss.rSquared(points, line);
        if (Number.isNaN(r2)) r2 = 0;
      } catch {
        r2 = 0;
      }
    }

    const unusableObs = observations.filter(
      (o) => o.physicalState === "INSERVIVEL",
    );
    let rawTotalLifespan: number;

    if (slope < -0.5 && intercept > 0) {
      rawTotalLifespan = Math.min(30, Math.max(1, -intercept / slope));
    } else if (unusableObs.length > 0) {
      rawTotalLifespan = ss.mean(unusableObs.map((o) => o.ageYears));
    } else {
      rawTotalLifespan = Math.max(
        5,
        ss.max(observations.map((o) => o.ageYears)) + 2,
      );
    }

    const typeEvaluated = evaluatedHistory.filter(
      (p) =>
        p.equipmentType === equipmentType && p.actualLifespanYears !== null,
    );

    let calibrationOffset = 0;
    if (typeEvaluated.length > 0) {
      hasCalibration = true;
      const biases = typeEvaluated.map(
        (p) => (p.actualLifespanYears as number) - p.predictedLifespanYears,
      );
      calibrationOffset = ss.mean(biases);
    }

    const calibratedTotalLifespan = Math.max(
      0.5,
      round2(rawTotalLifespan + calibrationOffset),
    );

    const activeCurrent = observations.filter(
      (o) => o.isCurrentState && o.physicalState !== "INSERVIVEL",
    );
    const avgCurrentAge =
      activeCurrent.length > 0
        ? round2(ss.mean(activeCurrent.map((o) => o.ageYears)))
        : 0;

    const remainingLifespan = Math.max(
      0,
      round2(calibratedTotalLifespan - avgCurrentAge),
    );

    const savedPrediction = await createPredictionRecord({
      equipmentType,
      predictedLifespanYears: calibratedTotalLifespan,
      slope: round2(slope),
      intercept: round2(intercept),
      r2: round2(r2),
      sampleSize: observations.length,
    });

    projectionsByType.push({
      predictionId: savedPrediction.id,
      equipmentType,
      sampleSize: observations.length,
      activeEquipmentsCount: activeCurrent.length,
      unusableEquipmentsCount: unusableObs.length,
      regression: {
        slopePerYear: round2(slope),
        intercept: round2(intercept),
        r2: round2(r2),
        calibrationOffsetYears: round2(calibrationOffset),
      },
      rawPredictedTotalLifespanYears: round2(rawTotalLifespan),
      calibratedTotalLifespanYears: calibratedTotalLifespan,
      averageCurrentAgeYears: avgCurrentAge,
      estimatedRemainingLifespanYears: remainingLifespan,
      projectedUnusableYear: Math.round(currentYear + remainingLifespan),
    });
  }

  projectionsByType.sort(
    (a, b) =>
      a.estimatedRemainingLifespanYears - b.estimatedRemainingLifespanYears,
  );

  const modelVersion = hasCalibration ? "v1-calibrated" : "v1";

  const analysisResult: LifespanAnalysisResult = {
    modelVersion,
    referenceYear: currentYear,
    projectionsByType,
  };

  return saveAnalyticsReport({
    type: "VIDA_UTIL",
    params: {
      orgId: filters.orgId ?? null,
      equipmentType: filters.equipmentType ?? null,
    } as Prisma.InputJsonValue,
    result: analysisResult as unknown as Prisma.InputJsonValue,
    modelVersion,
  });
}

export async function evaluatePredictionWithActual(
  predictionId: string,
  actualLifespanYears: number,
) {
  const prediction = await findPredictionById(predictionId);
  if (!prediction) throw notFound("Previsão");

  const errorYears = round2(
    Math.abs(actualLifespanYears - prediction.predictedLifespanYears),
  );

  return updatePredictionEvaluation(
    predictionId,
    round2(actualLifespanYears),
    errorYears,
  );
}
