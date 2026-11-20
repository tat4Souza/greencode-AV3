import * as ss from "simple-statistics";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  findCompletedTriageBatches,
  saveAnalyticsReport,
} from "../analytics.repository.js";
import type { RunEfficiencyInput } from "../analytics.schema.js";

export interface StatisticalSummary {
  sampleSize: number;
  meanMinutes: number;
  medianMinutes: number;
  stdDevMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface OperatorEfficiency {
  operatorId: string;
  operatorName: string;
  batchesProcessed: number;
  equipmentsProcessed: number;
  totalTimeStats: StatisticalSummary;
  activeTriageStats: StatisticalSummary | null;
  efficiencyRatioVsGlobal: number;
}

export interface PeriodEfficiency {
  period: string;
  batchesProcessed: number;
  equipmentsProcessed: number;
  totalTimeStats: StatisticalSummary;
}

export interface BottleneckItem {
  category: "ETAPA_PROCESSO" | "OPERADOR" | "LOTE_OUTLIER";
  referenceId: string;
  label: string;
  metricMinutes: number;
  thresholdMinutes: number;
  description: string;
}

export interface EfficiencyAnalysisResult {
  summary: {
    totalBatchesAnalyzed: number;
    totalEquipmentsAnalyzed: number;
    entryToCompletion: StatisticalSummary;
    queueWaitTime: StatisticalSummary | null;
    activeTriageTime: StatisticalSummary | null;
  };
  byOperator: OperatorEfficiency[];
  byPeriod: PeriodEfficiency[];
  bottlenecks: BottleneckItem[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function diffInMinutes(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

function computeStats(values: number[]): StatisticalSummary {
  if (values.length === 0) {
    return {
      sampleSize: 0,
      meanMinutes: 0,
      medianMinutes: 0,
      stdDevMinutes: 0,
      minMinutes: 0,
      maxMinutes: 0,
    };
  }

  return {
    sampleSize: values.length,
    meanMinutes: round2(ss.mean(values)),
    medianMinutes: round2(ss.median(values)),
    stdDevMinutes: round2(ss.standardDeviation(values)),
    minMinutes: round2(ss.min(values)),
    maxMinutes: round2(ss.max(values)),
  };
}

function formatYearMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function runEfficiencyAnalysis(filters: RunEfficiencyInput = {}) {
  const batches = await findCompletedTriageBatches(filters);

  if (batches.length === 0) {
    const emptyResult: EfficiencyAnalysisResult = {
      summary: {
        totalBatchesAnalyzed: 0,
        totalEquipmentsAnalyzed: 0,
        entryToCompletion: computeStats([]),
        queueWaitTime: null,
        activeTriageTime: null,
      },
      byOperator: [],
      byPeriod: [],
      bottlenecks: [],
    };

    const report = await saveAnalyticsReport({
      type: "EFICIENCIA",
      params: serializeParams(filters),
      result: emptyResult as unknown as Prisma.InputJsonValue,
    });

    return report;
  }

  const totalDurations: number[] = [];
  const waitDurations: number[] = [];
  const activeDurations: number[] = [];

  type EnrichedBatch = {
    id: string;
    invoice: string;
    period: string;
    operatorId: string;
    operatorName: string;
    equipmentsCount: number;
    totalMinutes: number;
    activeMinutes: number | null;
  };

  const enriched: EnrichedBatch[] = [];

  for (const batch of batches) {
    const completedAt = batch.triageCompletedAt!;
    const totalMinutes = diffInMinutes(batch.enteredAt, completedAt);
    totalDurations.push(totalMinutes);

    let activeMinutes: number | null = null;
    if (batch.triageStartedAt) {
      const wait = diffInMinutes(batch.enteredAt, batch.triageStartedAt);
      const active = diffInMinutes(batch.triageStartedAt, completedAt);
      waitDurations.push(wait);
      activeDurations.push(active);
      activeMinutes = active;
    }

    enriched.push({
      id: batch.id,
      invoice: batch.invoice,
      period: formatYearMonth(completedAt),
      operatorId: batch.triageOperator?.id ?? "NAO_ATRIBUIDO",
      operatorName: batch.triageOperator?.username ?? "Operador não registrado",
      equipmentsCount: batch._count.equipments,
      totalMinutes,
      activeMinutes,
    });
  }

  const globalTotalStats = computeStats(totalDurations);
  const globalWaitStats =
    waitDurations.length > 0 ? computeStats(waitDurations) : null;
  const globalActiveStats =
    activeDurations.length > 0 ? computeStats(activeDurations) : null;

  const operatorMap = new Map<string, EnrichedBatch[]>();
  for (const item of enriched) {
    const list = operatorMap.get(item.operatorId) ?? [];
    list.push(item);
    operatorMap.set(item.operatorId, list);
  }

  const byOperator: OperatorEfficiency[] = Array.from(operatorMap.entries())
    .map(([operatorId, items]) => {
      const opTotals = items.map((i) => i.totalMinutes);
      const opActives = items
        .map((i) => i.activeMinutes)
        .filter((v): v is number => v !== null);
      const totalTimeStats = computeStats(opTotals);

      return {
        operatorId,
        operatorName: items[0]?.operatorName ?? "Operador não registrado",
        batchesProcessed: items.length,
        equipmentsProcessed: items.reduce(
          (acc, i) => acc + i.equipmentsCount,
          0,
        ),
        totalTimeStats,
        activeTriageStats:
          opActives.length > 0 ? computeStats(opActives) : null,
        efficiencyRatioVsGlobal:
          globalTotalStats.meanMinutes > 0
            ? round2(totalTimeStats.meanMinutes / globalTotalStats.meanMinutes)
            : 1,
      };
    })
    .sort(
      (a, b) => a.totalTimeStats.meanMinutes - b.totalTimeStats.meanMinutes,
    );

  const periodMap = new Map<string, EnrichedBatch[]>();
  for (const item of enriched) {
    const list = periodMap.get(item.period) ?? [];
    list.push(item);
    periodMap.set(item.period, list);
  }

  const byPeriod: PeriodEfficiency[] = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, items]) => ({
      period,
      batchesProcessed: items.length,
      equipmentsProcessed: items.reduce((acc, i) => acc + i.equipmentsCount, 0),
      totalTimeStats: computeStats(items.map((i) => i.totalMinutes)),
    }));

  const bottlenecks: BottleneckItem[] = [];

  if (globalWaitStats && globalActiveStats) {
    if (globalWaitStats.meanMinutes > globalActiveStats.meanMinutes) {
      bottlenecks.push({
        category: "ETAPA_PROCESSO",
        referenceId: "FILA_ENTRADA_TRIAGEM",
        label: "Tempo de espera entre recebimento e início da triagem",
        metricMinutes: globalWaitStats.meanMinutes,
        thresholdMinutes: globalActiveStats.meanMinutes,
        description: `O tempo médio em fila (${globalWaitStats.meanMinutes} min) supera o tempo ativo de triagem (${globalActiveStats.meanMinutes} min).`,
      });
    } else if (globalActiveStats.meanMinutes > globalWaitStats.meanMinutes) {
      bottlenecks.push({
        category: "ETAPA_PROCESSO",
        referenceId: "EXECUCAO_TRIAGEM",
        label: "Execução operacional da triagem",
        metricMinutes: globalActiveStats.meanMinutes,
        thresholdMinutes: globalWaitStats.meanMinutes,
        description: `A execução da triagem (${globalActiveStats.meanMinutes} min) concentra a maior parcela do ciclo em relação à espera (${globalWaitStats.meanMinutes} min).`,
      });
    }
  }

  const operatorThreshold = round2(
    globalTotalStats.meanMinutes + globalTotalStats.stdDevMinutes,
  );
  if (globalTotalStats.stdDevMinutes > 0) {
    for (const op of byOperator) {
      if (op.totalTimeStats.meanMinutes > operatorThreshold) {
        bottlenecks.push({
          category: "OPERADOR",
          referenceId: op.operatorId,
          label: `Operador ${op.operatorName}`,
          metricMinutes: op.totalTimeStats.meanMinutes,
          thresholdMinutes: operatorThreshold,
          description: `Tempo médio (${op.totalTimeStats.meanMinutes} min) acima do limite esperado (${operatorThreshold} min = média + 1 DP).`,
        });
      }
    }
  }

  const outlierThreshold = round2(
    globalTotalStats.meanMinutes + 1.5 * globalTotalStats.stdDevMinutes,
  );
  if (globalTotalStats.stdDevMinutes > 0) {
    for (const item of enriched) {
      if (item.totalMinutes > outlierThreshold) {
        bottlenecks.push({
          category: "LOTE_OUTLIER",
          referenceId: item.id,
          label: `Lote NF ${item.invoice}`,
          metricMinutes: round2(item.totalMinutes),
          thresholdMinutes: outlierThreshold,
          description: `Processamento levou ${round2(item.totalMinutes)} min, excedendo o limiar de anomalia (${outlierThreshold} min).`,
        });
      }
    }
  }

  const analysisResult: EfficiencyAnalysisResult = {
    summary: {
      totalBatchesAnalyzed: batches.length,
      totalEquipmentsAnalyzed: enriched.reduce(
        (acc, i) => acc + i.equipmentsCount,
        0,
      ),
      entryToCompletion: globalTotalStats,
      queueWaitTime: globalWaitStats,
      activeTriageTime: globalActiveStats,
    },
    byOperator,
    byPeriod,
    bottlenecks,
  };

  return saveAnalyticsReport({
    type: "EFICIENCIA",
    params: serializeParams(filters),
    result: analysisResult as unknown as Prisma.InputJsonValue,
  });
}

function serializeParams(filters: RunEfficiencyInput): Prisma.InputJsonValue {
  return {
    startDate: filters.startDate?.toISOString() ?? null,
    endDate: filters.endDate?.toISOString() ?? null,
    orgId: filters.orgId ?? null,
  };
}
