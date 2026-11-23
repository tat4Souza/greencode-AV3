import { z } from "zod";
import { JobStatus, ReportType } from "../generated/prisma/enums.js";
import { createBatchSchema } from "./batch.schema.js";

const EXAMPLE_ID = "3f6c1d2e-8a4b-4c5d-9e7f-1a2b3c4d5e6f";

export const errorResponseSchema = z
  .object({
    message: z
      .string()
      .meta({
        description: "Descrição do erro.",
        example: "Chave de API inválida, expirada ou revogada",
      }),
  })
  .meta({
    description:
      "Formato de erro. Códigos usados: 400 (dados inválidos), 401 (chave ausente, inválida, expirada ou revogada), 403 (a chave não tem o escopo exigido), 404 (recurso inexistente ou de outra organização) e 429 (limite de requisições excedido).",
  });

export const publicCreateBatchSchema = createBatchSchema
  .omit({ orgId: true })
  .extend({
    enteredAt: z.coerce
      .date()
      .optional()
      .meta({
        description:
          "Data de entrada do lote (ISO 8601). Não pode ser futura nem anterior a 90 dias. Sem valor, usa o momento do envio.",
        example: "2026-11-20T09:30:00.000Z",
      }),
    invoice: z
      .string()
      .min(1)
      .meta({ description: "Número da nota fiscal do lote.", example: "NF-2026-0456" }),
    carrier: z
      .string()
      .min(1)
      .meta({ description: "Transportadora responsável.", example: "TransVerde Logística" }),
    obs: z
      .string()
      .optional()
      .meta({ description: "Observações livres sobre o lote." }),
  })
  .meta({
    description:
      "Lote a ser submetido. A organização é a dona da chave de API e não deve ser informada.",
    example: {
      invoice: "NF-2026-0456",
      carrier: "TransVerde Logística",
      obs: "Lote recolhido na filial Campinas",
      equipments: [
        {
          type: "NOTEBOOK",
          brand: "Dell",
          model: "Latitude 5420",
          manufacturingYear: 2021,
          physicalState: "BOM_ESTADO",
          weightKG: 1.8,
        },
      ],
    },
  });

export const publicBatchTraceabilitySchema = z.object({
  id: z.uuid().meta({ description: "Identificador do lote.", example: EXAMPLE_ID }),
  invoice: z.string().meta({ description: "Nota fiscal do lote.", example: "NF-2026-0456" }),
  carrier: z.string().meta({ description: "Transportadora.", example: "TransVerde Logística" }),
  status: z
    .string()
    .meta({
      description:
        "Etapa do lote: RECEBIDO, EM_TRIAGEM, TRIAGEM_CONCLUIDA, ENCAMINHADO ou FINALIZADO.",
      example: "EM_TRIAGEM",
    }),
  enteredAt: z.date().meta({ description: "Data de entrada do lote." }),
  triageStartedAt: z
    .date()
    .nullable()
    .meta({ description: "Início da triagem (nulo se ainda não começou)." }),
  triageCompletedAt: z
    .date()
    .nullable()
    .meta({ description: "Conclusão da triagem (nulo se ainda não terminou)." }),
  equipments: z.array(
    z.object({
      id: z.uuid(),
      type: z.string().meta({ example: "NOTEBOOK" }),
      brand: z.string().meta({ example: "Dell" }),
      model: z.string().meta({ example: "Latitude 5420" }),
      physicalState: z.string().meta({ example: "BOM_ESTADO" }),
      status: z
        .string()
        .meta({
          description: "Etapa atual do equipamento no fluxo de rastreabilidade.",
          example: "EM_TRIAGEM",
        }),
      batchPosition: z.number().int().meta({ description: "Posição no lote." }),
    }),
  ),
});

export const publicEquipmentTraceabilitySchema = z.object({
  id: z.uuid().meta({ description: "Identificador do equipamento.", example: EXAMPLE_ID }),
  type: z.string().meta({ example: "NOTEBOOK" }),
  brand: z.string().meta({ example: "Dell" }),
  model: z.string().meta({ example: "Latitude 5420" }),
  manufacturingYear: z.number().int().meta({ example: 2021 }),
  physicalState: z.string().meta({ example: "BOM_ESTADO" }),
  status: z.string().meta({ example: "EM_TRIAGEM" }),
  batch: z.object({
    id: z.uuid(),
    invoice: z.string(),
    status: z.string(),
  }),
  movements: z
    .array(
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
    )
    .meta({ description: "Histórico de movimentações, da mais antiga para a mais recente." }),
});

export const requestAsyncReportSchema = z
  .object({
    type: z
      .enum(ReportType)
      .meta({
        description:
          "Análise desejada: EFICIENCIA (tempos de triagem), RENTABILIDADE (valor de recuperação) ou VIDA_UTIL (previsão de fim de vida).",
        example: "RENTABILIDADE",
      }),
    format: z
      .enum(["json", "csv"])
      .default("json")
      .meta({
        description: "Formato do arquivo gerado.",
        example: "csv",
      }),
    webhookUrl: z
      .url()
      .optional()
      .meta({
        description:
          "Opcional. URL que receberá um POST quando o relatório ficar pronto. Sem ela, acompanhe por polling em GET /reports/{id}.",
        example: "https://parceiro.example.com/webhooks/greencode",
      }),
  })
  .meta({
    example: {
      type: "RENTABILIDADE",
      format: "csv",
      webhookUrl: "https://parceiro.example.com/webhooks/greencode",
    },
  });

export const reportJobResponseSchema = z
  .object({
    id: z
      .uuid()
      .meta({
        description:
          "Identificador da tarefa. Use-o em GET /reports/{id} e GET /reports/{id}/download.",
        example: EXAMPLE_ID,
      }),
    type: z.enum(ReportType),
    status: z
      .enum(JobStatus)
      .meta({
        description:
          "NA_FILA (aguardando ou aguardando nova tentativa), PROCESSANDO, CONCLUIDO (arquivo disponível para download) ou FALHOU (esgotadas as tentativas).",
        example: "NA_FILA",
      }),
    params: z.unknown().nullable(),
    attempts: z
      .number()
      .int()
      .meta({ description: "Tentativas de processamento já realizadas.", example: 0 }),
    error: z
      .string()
      .nullable()
      .meta({ description: "Último erro registrado, se houve falha." }),
    createdAt: z.date(),
    finishedAt: z
      .date()
      .nullable()
      .meta({ description: "Momento em que a tarefa terminou (sucesso ou falha definitiva)." }),
  })
  .meta({
    example: {
      id: EXAMPLE_ID,
      type: "RENTABILIDADE",
      status: "NA_FILA",
      params: { format: "csv", webhookUrl: null },
      attempts: 0,
      error: null,
      createdAt: "2026-11-22T14:00:00.000Z",
      finishedAt: null,
    },
  });

export type PublicCreateBatchInput = z.infer<typeof publicCreateBatchSchema>;
export type RequestAsyncReportInput = z.infer<typeof requestAsyncReportSchema>;
