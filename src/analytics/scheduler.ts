import cron from "node-cron";
import { redisConnection } from "../queues/reports.queue.js";
import { runEfficiencyAnalysis } from "./services/efficiency.service.js";
import { runProfitabilityAnalysis } from "./services/profitability.service.js";
import { runLifespanPredictionAnalysis } from "./services/lifespan.service.js";

const LOCK_KEY = "greencode:cron:nightly-analytics-lock";
const LOCK_TTL_SECONDS = 300;

export async function runAllScheduledAnalytics() {
  const acquired = await redisConnection.set(
    LOCK_KEY,
    String(process.pid),
    "EX",
    LOCK_TTL_SECONDS,
    "NX",
  );

  if (!acquired) {
    console.log(
      "[Cron] Execução já em andamento em outra instância. Ignorando.",
    );
    return;
  }

  console.log("[Cron] Iniciando recálculo agendado das análises...");
  try {
    await runEfficiencyAnalysis({});
    await runProfitabilityAnalysis({});
    await runLifespanPredictionAnalysis({});
    console.log("[Cron] Análises agendadas concluídas com sucesso.");
  } catch (err) {
    console.error("[Cron] Erro ao executar análises agendadas:", err);
  }
}

export function startAnalyticsScheduler() {
  const task = cron.schedule("0 2 * * *", () => {
    void runAllScheduledAnalytics();
  });

  console.log("[Cron] Agendador analítico registrado (02:00 diariamente).");
  return task;
}
