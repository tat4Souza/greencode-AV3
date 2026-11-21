import { Worker, type Job } from "bullmq";
import { prisma } from "./lib/prisma.js";
import {
  createRedisConnection,
  REPORTS_QUEUE_NAME,
  type ReportJobPayload,
} from "./queues/reports.queue.js";
import { runEfficiencyAnalysis } from "./analytics/services/efficiency.service.js";
import { runProfitabilityAnalysis } from "./analytics/services/profitability.service.js";
import { runLifespanPredictionAnalysis } from "./analytics/services/lifespan.service.js";
import { writeReportFile } from "./analytics/reportExporter.js";

async function processReportJob(job: Job<ReportJobPayload>) {
  const { reportJobId, type, format, params, webhookUrl } = job.data;
  const attemptNumber = job.attemptsMade + 1;

  await prisma.reportJob.update({
    where: { id: reportJobId },
    data: {
      status: "PROCESSANDO",
      attempts: attemptNumber,
      error: null,
    },
  });

  let report;
  if (type === "EFICIENCIA") {
    report = await runEfficiencyAnalysis(params ?? {});
  } else if (type === "RENTABILIDADE") {
    report = await runProfitabilityAnalysis(params ?? {});
  } else {
    report = await runLifespanPredictionAnalysis(params ?? {});
  }

  const filePath = await writeReportFile({
    jobId: reportJobId,
    type,
    format,
    reportPayload: report,
    resultOnly: report.result,
  });

  const finishedJob = await prisma.reportJob.update({
    where: { id: reportJobId },
    data: {
      status: "CONCLUIDO",
      filePath,
      finishedAt: new Date(),
    },
  });

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "report.completed",
          jobId: finishedJob.id,
          type: finishedJob.type,
          status: finishedJob.status,
          finishedAt: finishedJob.finishedAt,
        }),
      });
    } catch (err) {
      console.warn(`[Worker] Falha ao notificar webhook ${webhookUrl}:`, err);
    }
  }

  return { filePath };
}

const workerConnection = createRedisConnection();

const worker = new Worker<ReportJobPayload>(
  REPORTS_QUEUE_NAME,
  processReportJob,
  {
    connection: workerConnection,
    concurrency: 2,
  },
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} (${job.data.type}) concluído.`);
});

worker.on("failed", async (job, err) => {
  console.error(`[Worker] Job ${job?.id} falhou:`, err.message);
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 3;
  const isFinalFailure = job.attemptsMade >= maxAttempts;

  await prisma.reportJob.update({
    where: { id: job.data.reportJobId },
    data: {
      status: isFinalFailure ? "FALHOU" : "NA_FILA",
      attempts: job.attemptsMade,
      error: err.message,
      ...(isFinalFailure ? { finishedAt: new Date() } : {}),
    },
  });
});

async function shutdown() {
  console.log("[Worker] Encerrando worker...");
  await worker.close();
  await workerConnection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

console.log("[Worker] Escutando fila de relatórios...");
