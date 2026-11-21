import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../lib/env.js";
import type { ReportType } from "../generated/prisma/enums.js";

const CSV_SEPARATOR = ";";
const UTF8_BOM = "\uFEFF";

function formatNumberPtBr(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2).replace(".", ",");
  }
  return String(value ?? "");
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumberPtBr(value);

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (
    str.includes(CSV_SEPARATOR) ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function buildSectionTable(
  sectionTitle: string,
  headers: string[],
  rows: unknown[][],
): string {
  const banner = `=== ${sectionTitle} ===`;
  const lines: string[] = [banner, headers.join(CSV_SEPARATOR)];

  if (rows.length === 0) {
    lines.push("Nenhum registro encontrado para este critério.");
  } else {
    for (const row of rows) {
      lines.push(row.map((cell) => escapeCsvCell(cell)).join(CSV_SEPARATOR));
    }
  }

  return lines.join("\r\n");
}

function convertResultToCsv(type: ReportType, result: unknown): string {
  const data = (result ?? {}) as Record<string, unknown>;

  if (type === "EFICIENCIA") {
    const summary = (data.summary as Record<string, unknown>) ?? {};
    const entryStats =
      (summary.entryToCompletion as Record<string, unknown>) ?? {};
    const byOperator = (data.byOperator as Record<string, unknown>[]) ?? [];
    const byPeriod = (data.byPeriod as Record<string, unknown>[]) ?? [];
    const bottlenecks = (data.bottlenecks as Record<string, unknown>[]) ?? [];

    const summaryBlock = buildSectionTable(
      "RESUMO GERAL DE EFICIÊNCIA OPERACIONAL",
      [
        "Lotes Analisados",
        "Equipamentos Analisados",
        "Tempo Médio Total (min)",
        "Mediana Total (min)",
        "Desvio Padrão (min)",
        "Menor Tempo (min)",
        "Maior Tempo (min)",
      ],
      [
        [
          summary.totalBatchesAnalyzed ?? 0,
          summary.totalEquipmentsAnalyzed ?? 0,
          entryStats.meanMinutes ?? 0,
          entryStats.medianMinutes ?? 0,
          entryStats.stdDevMinutes ?? 0,
          entryStats.minMinutes ?? 0,
          entryStats.maxMinutes ?? 0,
        ],
      ],
    );

    const operatorBlock = buildSectionTable(
      "DESEMPENHO POR OPERADOR",
      [
        "Operador",
        "Lotes Processados",
        "Equipamentos Processados",
        "Tempo Médio (min)",
        "Mediana (min)",
        "Desvio Padrão (min)",
        "Razão vs Média Global",
      ],
      byOperator.map((op) => {
        const stats = (op.totalTimeStats as Record<string, unknown>) ?? {};
        return [
          op.operatorName,
          op.batchesProcessed,
          op.equipmentsProcessed,
          stats.meanMinutes,
          stats.medianMinutes,
          stats.stdDevMinutes,
          op.efficiencyRatioVsGlobal,
        ];
      }),
    );

    const periodBlock = buildSectionTable(
      "DESEMPENHO POR PERÍODO (ANO-MÊS)",
      [
        "Período",
        "Lotes Processados",
        "Equipamentos Processados",
        "Tempo Médio (min)",
        "Mediana (min)",
        "Desvio Padrão (min)",
      ],
      byPeriod.map((p) => {
        const stats = (p.totalTimeStats as Record<string, unknown>) ?? {};
        return [
          p.period,
          p.batchesProcessed,
          p.equipmentsProcessed,
          stats.meanMinutes,
          stats.medianMinutes,
          stats.stdDevMinutes,
        ];
      }),
    );

    const bottleneckBlock = buildSectionTable(
      "GARGALOS IDENTIFICADOS",
      [
        "Categoria",
        "Identificador",
        "Tempo Observado (min)",
        "Limite Esperado (min)",
        "Diagnóstico",
      ],
      bottlenecks.map((b) => [
        b.category,
        b.label,
        b.metricMinutes,
        b.thresholdMinutes,
        b.description,
      ]),
    );

    return [summaryBlock, operatorBlock, periodBlock, bottleneckBlock].join(
      "\r\n\r\n",
    );
  }

  if (type === "RENTABILIDADE") {
    const byType = (data.byEquipmentType as Record<string, unknown>[]) ?? [];
    const byModel =
      (data.byBrandModelAndState as Record<string, unknown>[]) ?? [];

    const typeBlock = buildSectionTable(
      "RENTABILIDADE POR TIPO DE EQUIPAMENTO",
      [
        "Tipo de Equipamento",
        "Quantidade",
        "Valor Total Estimado (R$)",
        "Valor Médio (R$)",
        "Mediana (R$)",
        "Desvio Padrão (R$)",
        "Retorno Médio por Kg (R$/kg)",
      ],
      byType.map((t) => {
        const stats = (t.stats as Record<string, unknown>) ?? {};
        return [
          t.type,
          stats.sampleSize,
          stats.totalEstimatedValue,
          stats.meanValue,
          stats.medianValue,
          stats.stdDevValue,
          stats.meanValuePerKg,
        ];
      }),
    );

    const detailBlock = buildSectionTable(
      "DETALHAMENTO POR MARCA, MODELO E ESTADO FÍSICO",
      [
        "Tipo",
        "Marca",
        "Modelo",
        "Estado Físico",
        "Quantidade",
        "Valor Total (R$)",
        "Valor Médio (R$)",
        "Mediana (R$)",
        "Retorno por Kg (R$/kg)",
      ],
      byModel.map((item) => {
        const stats = (item.stats as Record<string, unknown>) ?? {};
        return [
          item.type,
          item.brand,
          item.model,
          item.physicalState,
          stats.sampleSize,
          stats.totalEstimatedValue,
          stats.meanValue,
          stats.medianValue,
          stats.meanValuePerKg,
        ];
      }),
    );

    return [typeBlock, detailBlock].join("\r\n\r\n");
  }

  const projections =
    (data.projectionsByType as Record<string, unknown>[]) ?? [];

  return buildSectionTable(
    `PREVISÃO DE VIDA ÚTIL REMANESCENTE (MODELO ${String(data.modelVersion ?? "v1").toUpperCase()})`,
    [
      "Tipo de Equipamento",
      "Amostra",
      "Equipamentos Ativos",
      "Equipamentos Inservíveis",
      "Vida Útil Total Prevista (anos)",
      "Idade Média Atual (anos)",
      "Vida Útil Remanescente (anos)",
      "Ano Projetado Fim de Vida",
      "Coef. Angular (perda/ano)",
      "R² (Ajuste)",
    ],
    projections.map((p) => {
      const reg = (p.regression as Record<string, unknown>) ?? {};
      return [
        p.equipmentType,
        p.sampleSize,
        p.activeEquipmentsCount,
        p.unusableEquipmentsCount,
        p.calibratedTotalLifespanYears,
        p.averageCurrentAgeYears,
        p.estimatedRemainingLifespanYears,
        p.projectedUnusableYear,
        reg.slopePerYear,
        reg.r2,
      ];
    }),
  );
}

export async function writeReportFile(params: {
  jobId: string;
  type: ReportType;
  format: "json" | "csv";
  reportPayload: unknown;
  resultOnly: unknown;
}): Promise<string> {
  await fs.mkdir(env.REPORTS_DIR, { recursive: true });

  const fileName = `${params.type.toLowerCase()}_${params.jobId}.${params.format}`;
  const fullPath = path.join(env.REPORTS_DIR, fileName);

  const content =
    params.format === "json"
      ? JSON.stringify(params.reportPayload, null, 2)
      : UTF8_BOM + convertResultToCsv(params.type, params.resultOnly);

  await fs.writeFile(fullPath, content, "utf-8");
  return fullPath;
}
