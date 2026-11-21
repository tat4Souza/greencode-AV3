import type { Prisma, ReportType } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export function findPublicBatchTraceability(batchId: string, orgId: string) {
  return prisma.batch.findFirst({
    where: { id: batchId, orgId, active: true },
    select: {
      id: true,
      invoice: true,
      carrier: true,
      status: true,
      enteredAt: true,
      triageStartedAt: true,
      triageCompletedAt: true,
      equipments: {
        select: {
          id: true,
          type: true,
          brand: true,
          model: true,
          physicalState: true,
          status: true,
          batchPosition: true,
        },
        orderBy: { batchPosition: "asc" },
      },
    },
  });
}

export function findPublicEquipmentTraceability(
  equipmentId: string,
  orgId: string,
) {
  return prisma.equipment.findFirst({
    where: {
      id: equipmentId,
      batch: { orgId, active: true },
    },
    select: {
      id: true,
      type: true,
      brand: true,
      model: true,
      manufacturingYear: true,
      physicalState: true,
      status: true,
      batch: {
        select: { id: true, invoice: true, status: true },
      },
      movements: {
        select: {
          id: true,
          origin: true,
          destination: true,
          fromStatus: true,
          toStatus: true,
          fromPhysicalState: true,
          toPhysicalState: true,
          performedAt: true,
        },
        orderBy: { performedAt: "asc" },
      },
    },
  });
}

export function createReportJob(data: {
  apiKeyId: string;
  type: ReportType;
  params: Prisma.InputJsonValue;
}) {
  return prisma.reportJob.create({
    data: {
      apiKeyId: data.apiKeyId,
      type: data.type,
      status: "NA_FILA",
      params: data.params,
    },
  });
}

export function findReportJobByIdAndKey(jobId: string, apiKeyId: string) {
  return prisma.reportJob.findFirst({
    where: { id: jobId, apiKeyId },
  });
}
