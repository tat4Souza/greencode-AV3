import { z } from "zod";
import { JobStatus, ReportType } from "../generated/prisma/enums.js";
import { createBatchSchema } from "./batch.schema.js";

export const errorResponseSchema = z.object({
  message: z.string(),
});

export const publicCreateBatchSchema = createBatchSchema.omit({ orgId: true });

export const publicBatchTraceabilitySchema = z.object({
  id: z.uuid(),
  invoice: z.string(),
  carrier: z.string(),
  status: z.string(),
  enteredAt: z.date(),
  triageStartedAt: z.date().nullable(),
  triageCompletedAt: z.date().nullable(),
  equipments: z.array(
    z.object({
      id: z.uuid(),
      type: z.string(),
      brand: z.string(),
      model: z.string(),
      physicalState: z.string(),
      status: z.string(),
      batchPosition: z.number().int(),
    }),
  ),
});

export const publicEquipmentTraceabilitySchema = z.object({
  id: z.uuid(),
  type: z.string(),
  brand: z.string(),
  model: z.string(),
  manufacturingYear: z.number().int(),
  physicalState: z.string(),
  status: z.string(),
  batch: z.object({
    id: z.uuid(),
    invoice: z.string(),
    status: z.string(),
  }),
  movements: z.array(
    z.object({
      id: z.uuid(),
      origin: z.string(),
      destination: z.string(),
      fromStatus: z.string().nullable(),
      toStatus: z.string(),
      fromPhysicalState: z.string().nullable(),
      toPhysicalState: z.string().nullable(),
      performedAt: z.date(),
    }),
  ),
});

export const requestAsyncReportSchema = z.object({
  type: z.enum(ReportType),
  format: z.enum(["json", "csv"]).default("json"),
  webhookUrl: z.url().optional(),
});

export const reportJobResponseSchema = z.object({
  id: z.uuid(),
  type: z.enum(ReportType),
  status: z.enum(JobStatus),
  params: z.unknown().nullable(),
  attempts: z.number().int(),
  error: z.string().nullable(),
  createdAt: z.date(),
  finishedAt: z.date().nullable(),
});

export type PublicCreateBatchInput = z.infer<typeof publicCreateBatchSchema>;
export type RequestAsyncReportInput = z.infer<typeof requestAsyncReportSchema>;
