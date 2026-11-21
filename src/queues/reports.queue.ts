import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../lib/env.js";
import type { ReportType } from "../generated/prisma/enums.js";

export const REPORTS_QUEUE_NAME = "reports";

export function createRedisConnection() {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

export const redisConnection = createRedisConnection();

export interface ReportJobPayload {
  reportJobId: string;
  type: ReportType;
  format: "json" | "csv";
  params?: Record<string, unknown>;
  webhookUrl?: string;
}

export const reportsQueue = new Queue<ReportJobPayload>(REPORTS_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: false,
  },
});
