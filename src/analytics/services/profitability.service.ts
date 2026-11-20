import * as ss from "simple-statistics";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  EquipmentType,
  PhysicalState,
} from "../../generated/prisma/enums.js";
import {
  findEquipmentsForProfitability,
  saveAnalyticsReport,
} from "../analytics.repository.js";
import type { RunProfitabilityInput } from "../analytics.schema.js";

export interface ValueStats {
  sampleSize: number;
  totalEstimatedValue: number;
  meanValue: number;
  medianValue: number;
  stdDevValue: number;
  minValue: number;
  maxValue: number;
  meanValuePerKg: number;
}

export interface ProfitabilityByType {
  type: EquipmentType;
  stats: ValueStats;
  byPhysicalState: {
    physicalState: PhysicalState;
    stats: ValueStats;
  }[];
}

export interface ProfitabilityByBrandModel {
  type: EquipmentType;
  brand: string;
  model: string;
  physicalState: PhysicalState;
  stats: ValueStats;
}

export interface ProfitabilityAnalysisResult {
  summary: {
    totalEquipmentsAnalyzed: number;
    overallStats: ValueStats;
    mostProfitableType: EquipmentType | null;
    mostProfitableBrandModel: string | null;
  };
  byEquipmentType: ProfitabilityByType[];
  byBrandModelAndState: ProfitabilityByBrandModel[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeValueStats(
  items: { value: number; weightKG: number }[],
): ValueStats {
  if (items.length === 0) {
    return {
      sampleSize: 0,
      totalEstimatedValue: 0,
      meanValue: 0,
      medianValue: 0,
      stdDevValue: 0,
      minValue: 0,
      maxValue: 0,
      meanValuePerKg: 0,
    };
  }

  const values = items.map((i) => i.value);
  const totalValue = ss.sum(values);
  const totalWeight = ss.sum(items.map((i) => i.weightKG));

  return {
    sampleSize: values.length,
    totalEstimatedValue: round2(totalValue),
    meanValue: round2(ss.mean(values)),
    medianValue: round2(ss.median(values)),
    stdDevValue: round2(ss.standardDeviation(values)),
    minValue: round2(ss.min(values)),
    maxValue: round2(ss.max(values)),
    meanValuePerKg: totalWeight > 0 ? round2(totalValue / totalWeight) : 0,
  };
}

export async function runProfitabilityAnalysis(
  filters: RunProfitabilityInput = {},
) {
  const rawEquipments = await findEquipmentsForProfitability(filters);

  const items = rawEquipments.map((eq) => ({
    type: eq.type,
    brand: eq.brand.trim(),
    model: eq.model.trim(),
    physicalState: eq.physicalState,
    value: Number(eq.estimatedValue ?? 0),
    weightKG: Number(eq.weightKG),
  }));

  if (items.length === 0) {
    const emptyResult: ProfitabilityAnalysisResult = {
      summary: {
        totalEquipmentsAnalyzed: 0,
        overallStats: computeValueStats([]),
        mostProfitableType: null,
        mostProfitableBrandModel: null,
      },
      byEquipmentType: [],
      byBrandModelAndState: [],
    };

    return saveAnalyticsReport({
      type: "RENTABILIDADE",
      params: serializeParams(filters),
      result: emptyResult as unknown as Prisma.InputJsonValue,
    });
  }

  const typeMap = new Map<EquipmentType, typeof items>();
  for (const item of items) {
    const list = typeMap.get(item.type) ?? [];
    list.push(item);
    typeMap.set(item.type, list);
  }

  const byEquipmentType: ProfitabilityByType[] = Array.from(typeMap.entries())
    .map(([type, typeItems]) => {
      const stateMap = new Map<PhysicalState, typeof items>();
      for (const ti of typeItems) {
        const sList = stateMap.get(ti.physicalState) ?? [];
        sList.push(ti);
        stateMap.set(ti.physicalState, sList);
      }

      const byPhysicalState = Array.from(stateMap.entries())
        .map(([physicalState, stateItems]) => ({
          physicalState,
          stats: computeValueStats(stateItems),
        }))
        .sort((a, b) => b.stats.meanValue - a.stats.meanValue);

      return {
        type,
        stats: computeValueStats(typeItems),
        byPhysicalState,
      };
    })
    .sort((a, b) => b.stats.meanValue - a.stats.meanValue);

  const comboMap = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.type}::${item.brand.toLowerCase()}::${item.model.toLowerCase()}::${item.physicalState}`;
    const list = comboMap.get(key) ?? [];
    list.push(item);
    comboMap.set(key, list);
  }

  const byBrandModelAndState: ProfitabilityByBrandModel[] = Array.from(
    comboMap.values(),
  )
    .map((group) => {
      const first = group[0]!;
      return {
        type: first.type,
        brand: first.brand,
        model: first.model,
        physicalState: first.physicalState,
        stats: computeValueStats(group),
      };
    })
    .sort((a, b) => b.stats.meanValue - a.stats.meanValue);

  const topType = byEquipmentType[0]?.type ?? null;
  const topCombo = byBrandModelAndState[0];

  const analysisResult: ProfitabilityAnalysisResult = {
    summary: {
      totalEquipmentsAnalyzed: items.length,
      overallStats: computeValueStats(items),
      mostProfitableType: topType,
      mostProfitableBrandModel: topCombo
        ? `${topCombo.type} - ${topCombo.brand} ${topCombo.model} (${topCombo.physicalState})`
        : null,
    },
    byEquipmentType,
    byBrandModelAndState,
  };

  return saveAnalyticsReport({
    type: "RENTABILIDADE",
    params: serializeParams(filters),
    result: analysisResult as unknown as Prisma.InputJsonValue,
  });
}

function serializeParams(
  filters: RunProfitabilityInput,
): Prisma.InputJsonValue {
  return {
    orgId: filters.orgId ?? null,
    type: filters.type ?? null,
    physicalState: filters.physicalState ?? null,
  };
}
