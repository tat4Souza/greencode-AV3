import { z } from "zod";
import {
  EquipmentType,
  PhysicalState,
  ReportType,
} from "../generated/prisma/enums.js";

export const runEfficiencyInputSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    orgId: z.uuid().optional(),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.startDate <= data.endDate,
    { message: "startDate deve ser anterior ou igual a endDate" },
  );

export const listReportsQuerySchema = z.object({
  type: z
    .enum(ReportType)
    .optional()
    .meta({
      description:
        "Filtra pelo tipo de análise: EFICIENCIA, RENTABILIDADE ou VIDA_UTIL.",
      example: "RENTABILIDADE",
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .meta({
      description: "Quantidade máxima de relatórios (1 a 100), do mais recente para o mais antigo.",
      example: 20,
    }),
});

export const analyticsReportResponseSchema = z.object({
  id: z.uuid(),
  type: z.enum(ReportType),
  params: z
    .unknown()
    .nullable()
    .meta({ description: "Parâmetros usados na geração (filtros e organização)." }),
  result: z
    .unknown()
    .meta({ description: "Resultado da análise (estatísticas, comparações e projeções)." }),
  modelVersion: z
    .string()
    .meta({ description: "Versão do modelo que gerou o resultado.", example: "v1" }),
  generatedAt: z.date().meta({ description: "Momento em que o relatório foi gerado." }),
});

export const runProfitabilityInputSchema = z.object({
  orgId: z.uuid().optional(),
  type: z.enum(EquipmentType).optional(),
  physicalState: z.enum(PhysicalState).optional(),
});

export const runLifespanInputSchema = z.object({
  orgId: z.uuid().optional(),
  equipmentType: z.enum(EquipmentType).optional(),
});

export const evaluatePredictionParamsSchema = z.object({
  id: z.uuid(),
});

export const evaluatePredictionBodySchema = z.object({
  actualLifespanYears: z.number().positive().max(50),
});

export const predictionResponseSchema = z.object({
  id: z.uuid(),
  equipmentType: z.enum(EquipmentType),
  predictedLifespanYears: z.number(),
  slope: z.number(),
  intercept: z.number(),
  r2: z.number(),
  sampleSize: z.number().int(),
  actualLifespanYears: z.number().nullable(),
  errorYears: z.number().nullable(),
  evaluatedAt: z.date().nullable(),
  createdAt: z.date(),
});

export type RunLifespanInput = z.infer<typeof runLifespanInputSchema>;
export type EvaluatePredictionParams = z.infer<
  typeof evaluatePredictionParamsSchema
>;
export type EvaluatePredictionBody = z.infer<
  typeof evaluatePredictionBodySchema
>;
export type RunProfitabilityInput = z.infer<typeof runProfitabilityInputSchema>;
export type RunEfficiencyInput = z.infer<typeof runEfficiencyInputSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
export type AnalyticsReportResponse = z.infer<
  typeof analyticsReportResponseSchema
>;
