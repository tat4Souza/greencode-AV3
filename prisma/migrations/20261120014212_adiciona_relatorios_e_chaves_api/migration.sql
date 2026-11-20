-- CreateEnum
CREATE TYPE "tipo_relatorio" AS ENUM ('EFICIENCIA', 'RENTABILIDADE', 'VIDA_UTIL');

-- CreateEnum
CREATE TYPE "status_tarefa" AS ENUM ('NA_FILA', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU');

-- AlterTable
ALTER TABLE "configuracoes_sistema" ALTER COLUMN "param_cod" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "equipamento" ADD COLUMN     "equi_valor_recuperacao" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "lote" ADD COLUMN     "lote_operador_triagem" UUID,
ADD COLUMN     "lote_triagem_conclusao" TIMESTAMP(3),
ADD COLUMN     "lote_triagem_inicio" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "relatorio_analitico" (
    "rel_cod" UUID NOT NULL,
    "rel_tipo" "tipo_relatorio" NOT NULL,
    "rel_parametros" JSONB,
    "rel_resultado" JSONB NOT NULL,
    "rel_versao_modelo" TEXT NOT NULL DEFAULT 'v1',
    "rel_gerado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relatorio_analitico_pkey" PRIMARY KEY ("rel_cod")
);

-- CreateTable
CREATE TABLE "previsao_vida_util" (
    "prev_cod" UUID NOT NULL,
    "prev_tipo_equipamento" "tipo_equipamento" NOT NULL,
    "prev_vida_util_anos" DOUBLE PRECISION NOT NULL,
    "prev_coef_angular" DOUBLE PRECISION NOT NULL,
    "prev_coef_linear" DOUBLE PRECISION NOT NULL,
    "prev_r2" DOUBLE PRECISION NOT NULL,
    "prev_amostra" INTEGER NOT NULL,
    "prev_vida_util_real" DOUBLE PRECISION,
    "prev_erro_anos" DOUBLE PRECISION,
    "prev_avaliada_em" TIMESTAMP(3),
    "prev_criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "previsao_vida_util_pkey" PRIMARY KEY ("prev_cod")
);

-- CreateTable
CREATE TABLE "chave_api" (
    "chave_cod" UUID NOT NULL,
    "chave_org_cod" UUID NOT NULL,
    "chave_nome" TEXT NOT NULL,
    "chave_prefixo" TEXT NOT NULL,
    "chave_hash" TEXT NOT NULL,
    "chave_permissoes" TEXT[],
    "chave_limite_por_minuto" INTEGER NOT NULL DEFAULT 60,
    "chave_ativa" BOOLEAN NOT NULL DEFAULT true,
    "chave_expira_em" TIMESTAMP(3),
    "chave_ultimo_uso" TIMESTAMP(3),
    "chave_criado_por" UUID NOT NULL,
    "chave_criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chave_api_pkey" PRIMARY KEY ("chave_cod")
);

-- CreateTable
CREATE TABLE "tarefa_relatorio" (
    "tar_cod" UUID NOT NULL,
    "tar_chave_cod" UUID,
    "tar_tipo" "tipo_relatorio" NOT NULL,
    "tar_status" "status_tarefa" NOT NULL DEFAULT 'NA_FILA',
    "tar_parametros" JSONB,
    "tar_arquivo" TEXT,
    "tar_erro" TEXT,
    "tar_tentativas" INTEGER NOT NULL DEFAULT 0,
    "tar_criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tar_finalizado_em" TIMESTAMP(3),

    CONSTRAINT "tarefa_relatorio_pkey" PRIMARY KEY ("tar_cod")
);

-- CreateIndex
CREATE INDEX "relatorio_analitico_rel_tipo_rel_gerado_em_idx" ON "relatorio_analitico"("rel_tipo", "rel_gerado_em");

-- CreateIndex
CREATE INDEX "previsao_vida_util_prev_tipo_equipamento_prev_criado_em_idx" ON "previsao_vida_util"("prev_tipo_equipamento", "prev_criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "chave_api_chave_prefixo_key" ON "chave_api"("chave_prefixo");

-- CreateIndex
CREATE INDEX "chave_api_chave_org_cod_idx" ON "chave_api"("chave_org_cod");

-- CreateIndex
CREATE INDEX "tarefa_relatorio_tar_chave_cod_idx" ON "tarefa_relatorio"("tar_chave_cod");

-- CreateIndex
CREATE INDEX "equipamento_equi_tipo_equi_estado_fisico_idx" ON "equipamento"("equi_tipo", "equi_estado_fisico");

-- CreateIndex
CREATE INDEX "lote_lote_triagem_conclusao_idx" ON "lote"("lote_triagem_conclusao");

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_lote_operador_triagem_fkey" FOREIGN KEY ("lote_operador_triagem") REFERENCES "usuario"("us_cod") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chave_api" ADD CONSTRAINT "chave_api_chave_org_cod_fkey" FOREIGN KEY ("chave_org_cod") REFERENCES "organizacao"("org_cod") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chave_api" ADD CONSTRAINT "chave_api_chave_criado_por_fkey" FOREIGN KEY ("chave_criado_por") REFERENCES "usuario"("us_cod") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_relatorio" ADD CONSTRAINT "tarefa_relatorio_tar_chave_cod_fkey" FOREIGN KEY ("tar_chave_cod") REFERENCES "chave_api"("chave_cod") ON DELETE SET NULL ON UPDATE CASCADE;
