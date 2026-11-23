# AV3 | Técnicas de Programação

<p align="center">
  <img width="180" height="180" alt="♻️" src="https://github.com/user-attachments/assets/1f47d965-9605-42b7-b80f-b7eea9d559b6" />

  <h2 align="center">Greencode</h2>
</p>

<p align="center">
  | <a href="#novidades">O que mudou na AV3</a> |
  <a href="#papeis">Papéis</a> |
  <a href="#executar">Como testar</a> |
  <a href="#api-publica">API pública</a> |
  <a href="#estrutura">Estrutura</a> |
  <a href="#decisoes">Decisões de Arquitetura</a> |
  <a href="#regras">Regras de Negócio</a> |
  <a href="#banco">Banco de Dados</a> |
  <a href="#limitacoes">Limitações</a> |
</p>

O **Greencode** rastreia o fluxo completo de equipamentos obsoletos — da chegada dos lotes ao destino final (desmonte, reciclagem ou reuso) —, em um servidor monolítico com **API RESTful** (Node.js, TypeScript, Fastify e Prisma ORM, com **PostgreSQL**).

A **AV3** estende o sistema da AV2 com três blocos, sem alterar as regras de negócio já existentes:

1. **Camada analítica:** eficiência operacional, rentabilidade e previsão de vida útil, com histórico persistido;
2. **API pública para parceiros:** autenticação por chave de API com escopos, isolamento por organização e limite de requisições por chave;
3. **Processamento assíncrono:** relatórios pesados em fila (BullMQ + Redis), com status, download, retentativas e webhook, além de um recálculo noturno agendado (node-cron).

---

## 💻 Tecnologias utilizadas

![Static Badge](https://img.shields.io/badge/node-%235FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Static Badge](https://img.shields.io/badge/typescript-%233178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Static Badge](https://img.shields.io/badge/fastify-%23000000?style=for-the-badge&logo=fastify&logoColor=white)
![Static Badge](https://img.shields.io/badge/zod-%23408AFF?style=for-the-badge&logo=zod&logoColor=white)
![Static Badge](https://img.shields.io/badge/prisma-%232D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Static Badge](https://img.shields.io/badge/swagger-%2385EA2D?style=for-the-badge&logo=swagger&logoColor=black)
![Static Badge](https://img.shields.io/badge/docker-%232496ED?style=for-the-badge&logo=docker&logoColor=white)
![Static Badge](https://img.shields.io/badge/postgresql-%234169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Static Badge](https://img.shields.io/badge/redis-%23DC382D?style=for-the-badge&logo=redis&logoColor=white)

### Usos no projeto

- **Node.js + TypeScript**, **Fastify 5**, **Zod 4 + fastify-type-provider-zod**, **Prisma 7 + PostgreSQL 16**, **@fastify/jwt + bcryptjs**, **@fastify/swagger + swagger-ui** (herdados da AV2);
- **simple-statistics**: média, mediana, desvio-padrão, regressão linear e R² das análises;
- **BullMQ + Redis 7 (ioredis)**: fila de relatórios assíncronos, retentativas com backoff e trava do agendador;
- **node-cron**: recálculo diário das análises (02:00);
- **@fastify/rate-limit**: limite de requisições por chave de API.

### Compatibilidade do Sistema

Projetado e validado para execução nativa nos seguintes ambientes:

- **Windows**: Windows 10 ou superior.
- **Linux**: Ubuntu 24.04.3 LTS ou superior (e distribuições derivadas).

**Pré-requisitos:** Node.js 22 LTS (mínimo 20.19, exigência do Prisma 7), npm e Docker com Docker Compose. O **Redis não precisa ser instalado na máquina**: ele sobe em contêiner junto com o PostgreSQL.

A compatibilidade entre sistemas operacionais não depende de comandos específicos de shell: caminhos de arquivo são montados com `node:path` (a pasta dos relatórios é resolvida a partir do diretório do projeto) e os scripts do `package.json` usam apenas ferramentas multiplataforma (`tsx`, `rimraf`, `prisma`).

---

## 🆕 O que mudou na AV3 <a id="novidades"></a>

| Bloco                  | Entrega                                                                                                                      |
| :--------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| Versionamento da API   | Autenticação em `/api/v1/auth`; rotas autenticadas em `/api/v1/internal/*`; API de parceiros em `/api/v1/public/*`           |
| Análises               | Eficiência, rentabilidade e vida útil (`/api/v1/internal/analytics`), com histórico e exportação em JSON/CSV                 |
| Valor de recuperação   | `Equipment.estimatedValue`, calculado pela API a cada cadastro/atualização/mudança de estado físico (`src/lib/valuation.ts`) |
| Chaves de API          | Emissão, listagem e revogação (somente ADMIN); escopos; expiração; limite por minuto por chave                               |
| API pública            | Rastreabilidade de lotes e equipamentos, submissão de lotes, histórico de análises e relatórios assíncronos                  |
| Relatórios assíncronos | Fila BullMQ, processo _worker_ separado, 3 tentativas com backoff exponencial, download e webhook opcional                   |
| Agendamento            | Recálculo diário das análises às 02:00, com trava no Redis para evitar execução duplicada                                    |
| Documentação           | Swagger com descrições, exemplos e esquema de segurança `x-api-key`                                                          |
| Testes                 | `scripts/jornada-teste.ts` atualizado para `/api/v1` e ampliado com as seções de análises (11) e de API pública (12)         |

---

## 👥 Papéis e Permissões do Sistema <a id="papeis"></a>

O RBAC da AV2 continua valendo para as rotas internas (JWT). As rotas de parceiros usam **outro mecanismo**: chave de API com escopos (veja [API pública](#api-publica)). Uma conta ou chave que tente acessar algo fora do seu escopo recebe `403`.

| Papel                               | O que faz na plataforma                                                                          | Rotas internas permitidas (prefixo `/api/v1/internal`)               |
| :---------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| **ADMIN** (Administrador)           | Contas de acesso, parâmetros globais, **emissão e revogação de chaves de API** e todo o restante | Todas                                                                |
| **OPERADOR** (Operador de Cadastro) | Cadastra e gerencia organizações clientes e seus contratos                                       | `/organizations` e `/organizations/:id/contract`                     |
| **GESTOR** (Gestor de Almoxarifado) | Recebimento de lotes, triagem e movimentação de equipamentos; **executa análises**               | `/batches`, `/equipments`, `/equipments/:id/movements`, `/analytics` |
| **AUDITOR**                         | Relatórios (somente leitura); **executa e consulta análises**                                    | `/reports`, `/analytics`                                             |

Todo usuário autenticado pode usar `POST /api/v1/auth/logout` e `PATCH /api/v1/auth/password`. `POST /api/v1/auth/login` é a única rota interna pública (além de `/healthcheck` e `/docs`). As rotas `/api/v1/public/*` exigem chave de API e **não aceitam JWT**.

### 🔑 Usuários de demonstração (criados pelo seed)

| Papel    | E-mail                   | Senha        |
| :------- | :----------------------- | :----------- |
| ADMIN    | `admin@greencode.com`    | `Admin@1234` |
| OPERADOR | `operador@greencode.com` | `Demo@1234`  |
| GESTOR   | `gestor@greencode.com`   | `Demo@1234`  |
| AUDITOR  | `auditor@greencode.com`  | `Demo@1234`  |

O seed também cria os operadores `operador2@greencode.com` e `operador3@greencode.com` (mesma senha), usados para comparar a eficiência entre operadores. **O seed não cria chaves de API**: a chave só é exibida uma vez, no momento da emissão (veja o passo 5 de "Como testar").

> 💡 As credenciais podem ser trocadas pelas variáveis `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `SEED_USER_PASSWORD` no `.env`, antes de executar o seed.

<br>

---

## 🚀 Como testar <a id="executar"></a>

### 1. Criar o arquivo de ambiente

```bash
# Linux / macOS
cp .env.example .env

# Windows (PowerShell ou CMD)
copy .env.example .env
```

| Variável                         | Descrição                                             | Padrão                                                     |
| :------------------------------- | :---------------------------------------------------- | :--------------------------------------------------------- |
| `DATABASE_URL`                   | String de conexão do PostgreSQL                       | `postgresql://greenUser:green123@localhost:5432/greencode` |
| `REDIS_URL`                      | Conexão do Redis (fila e trava do agendador)          | `redis://localhost:6379`                                   |
| `REPORTS_DIR`                    | Pasta onde o worker grava os relatórios gerados       | `storage/reports` (dentro do projeto)                      |
| `JWT_SECRET`                     | Segredo de assinatura dos tokens (mín. 16 caracteres) | — (obrigatório)                                            |
| `JWT_EXPIRES_IN`                 | Validade do token                                     | `30m`                                                      |
| `PORT` / `HOST`                  | Porta e interface de escuta                           | `3000` / `0.0.0.0`                                         |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciais do administrador criado no seed           | `admin@greencode.com` / `Admin@1234`                       |
| `SEED_USER_PASSWORD`             | Senha dos demais usuários do seed                     | `Demo@1234`                                                |

> As variáveis são validadas com Zod na inicialização: se alguma estiver ausente ou inválida, o servidor encerra informando o problema.

### 2. Passo a passo

#### I.) Sobe o PostgreSQL **e o Redis**

```bash
docker compose up -d
```

#### II.) Instala tudo (o build e as migrations precisam das devDependencies)

```bash
npm ci
```

#### III.) Aplica as migrations

```bash
npm run db:deploy
```

#### IV.) Popula os dados de demonstração

```bash
npm run db:seed
```

#### V.) Compila: limpa dist, gera o client do Prisma e roda o tsc

```bash
npm run build
```

#### VI.) Sobe a API (terminal 1)

```bash
npm start
```

#### VII.) Sobe o worker de relatórios (terminal 2)

```bash
npm run worker:start
```

> ⚠️ **O worker é um processo separado da API.** Sem ele, os relatórios assíncronos ficam eternamente em `NA_FILA` (e a seção 12 do script de teste falha). Os dois processos precisam enxergar a mesma pasta `REPORTS_DIR`.

#### VIII.) Executa o script de teste da jornada (terminal 3)

O script usa o `tsx`, uma devDependency. Se você removeu as devDependencies (`npm prune --omit=dev`) para simular produção, execute `npm ci` novamente antes de rodá-lo:

```bash
npm run test
```

> 💡 Para desenvolvimento, use `npm run dev` (API) e `npm run worker:dev` (worker), ambos com recarga automática.

### 3. Verificar

| O que conferir           | Como                                                                                                                          |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| Servidor no ar           | `GET http://localhost:3000/healthcheck`                                                                                       |
| Documentação interativa  | Abrir `http://localhost:3000/docs`                                                                                            |
| Autenticação interna     | Em `POST /api/v1/auth/login`, copiar o `accessToken` e clicar em **Authorize** (esquema Bearer)                               |
| Autenticação de parceiro | Emitir uma chave (passo 5 abaixo), clicar em **Authorize** e informar a chave no esquema `apiKeyAuth` (cabeçalho `x-api-key`) |
| Escopo por papel         | Logar com o OPERADOR e tentar `POST /api/v1/internal/analytics/efficiency` (deve retornar `403`)                              |
| Graceful shutdown        | `Ctrl+C` em cada processo: a API e o worker encerram conexões e desconectam o Prisma                                          |

### 4. Gerando análises (rotas internas)

Faça login como ADMIN, GESTOR ou AUDITOR e, no Swagger (tag **Analytics**), execute com o corpo `{}`:

- `POST /api/v1/internal/analytics/efficiency`
- `POST /api/v1/internal/analytics/profitability`
- `POST /api/v1/internal/analytics/lifespan`
- `GET /api/v1/internal/analytics/reports` (histórico, com filtro por tipo)
- `PATCH /api/v1/internal/analytics/predictions/{id}/evaluate` com `{"actualLifespanYears": 8}` (registra a vida útil real e calcula o erro da previsão)

### 5. Emitindo uma chave de API (somente ADMIN)

```
POST /api/v1/internal/api-keys
{
  "orgId": "<id de uma organização do seed>",
  "name": "Integração ERP",
  "scopes": ["traceability:read", "reports:request"],
  "rateLimitPerMin": 60
}
```

A resposta traz o campo `plainKey` (formato `gc_live_<prefixo>_<segredo>`). **Ele aparece uma única vez**: o banco guarda apenas o hash.

### 6. Scripts disponíveis

- `npm run dev` / `npm run worker:dev`: API e worker em modo desenvolvimento (`tsx watch`);
- `npm run build`: limpa `dist`, gera o client do Prisma e compila o TypeScript;
- `npm start` / `npm run worker:start`: executam a versão compilada (`dist/app.js` e `dist/worker.js`);
- `npm run db:generate`, `db:migrate`, `db:deploy`, `db:seed`: Prisma Client, migrations (dev e produção) e seed;
- `npm run test`: executa o script de teste da jornada completa (requer API, worker, PostgreSQL e Redis no ar).

### 7. Massa de dados do seed

Além dos cenários da AV2 (organizações com contrato válido, vencido, ausente e inativa; lotes em todos os status; equipamentos em todos os estados; movimentações coerentes), o seed da AV3 gera um **histórico para alimentar as análises**:

- **12 lotes históricos com 5 equipamentos cada** (60 equipamentos, 12 de cada um dos 5 tipos usados), todos com triagem concluída, distribuídos entre os 3 operadores, com **velocidades diferentes por operador** (para a comparação de eficiência) e **taxas de desgaste diferentes por tipo** (para a regressão de vida útil);
- **`estimatedValue` preenchido** em todos os equipamentos, usando o mesmo modelo de `src/lib/valuation.ts`;
- **Aleatoriedade determinística** (gerador com semente fixa): rodar o seed duas vezes produz os mesmos dados;
- Datas dentro da janela de 90 dias imposta pelo trigger do banco, que vale também para o seed.

### 8. O que é verificado no script de teste?

O script `scripts/jornada-teste.ts` percorre a jornada completa pela API, do login do administrador à remoção dos dados criados. Cada passo imprime `[ OK ]` ou `[FALHOU]`, a rota, o status HTTP e a mensagem de erro; ao final exibe o total de passos aprovados e, havendo falha, a lista do que falhou (código de saída diferente de zero). Ele cria os próprios dados (CNPJs válidos e identificador único por execução) e remove as organizações criadas ao terminar.

São **15 seções**. As seções I a X e XIII a XV são as da AV2 (autenticação, contas, parâmetros globais, RBAC, organizações e contratos, lotes, triagem, ciclo de vida do lote, relatórios, soft delete, hard delete e sessão), apenas apontando para as rotas `/api/v1`. As seções novas são:

#### XI). Análises internas: eficiência, rentabilidade e vida útil

- Análises exigem autenticação (`401`) e o OPERADOR não as executa (`403`);
- O auditor executa as três análises e cada resultado é gravado com o tipo e a estrutura esperados (comparação por operador, agrupamento por tipo de equipamento, projeções por tipo);
- O histórico lista os relatórios gerados e respeita o filtro por tipo;
- O gestor registra a vida útil real de uma previsão e o erro é calculado.

#### XII). API pública: chaves, escopos, isolamento, limite e relatórios assíncronos

- Cadastra dois parceiros (P1 e P2) e o ADMIN emite chaves: completa, somente leitura, de P2 e uma com limite de 3 req/min;
- Rejeita escopo inexistente (`400`), emissão por quem não é ADMIN (`403`) e organização inexistente (`404`);
- A listagem de chaves **nunca expõe o segredo nem o hash**;
- Rota pública sem chave, com chave inválida ou com JWT interno: `401`;
- Chave sem o escopo exigido: `403` (submissão de lote e solicitação de relatório);
- O parceiro submete um lote pela API pública (vinculado à organização dona da chave) e o equipamento entra na rentabilidade com valor estimado;
- Rastreabilidade de lote e de equipamento com chave de leitura; **P2 não enxerga dados de P1** (`404`);
- Relatório assíncrono: solicitação (`202`), _polling_ até `CONCLUIDO`, download do CSV e isolamento da tarefa entre parceiros;
- O histórico de análises da API pública traz **somente** relatórios da própria organização;
- Limite por chave: 3 requisições aceitas e a 4ª recebe `429`;
- Revogação: a chave revogada passa a responder `401` imediatamente e revogar de novo é rejeitado;
- Remove os parceiros, levando junto lotes e chaves (cascata).

<br>

---

## 🔌 API pública para parceiros <a id="api-publica"></a>

Base: `/api/v1/public`. Todas as rotas exigem o cabeçalho `x-api-key`.

| Rota                               | Escopo exigido      | Descrição                                                                                |
| :--------------------------------- | :------------------ | :--------------------------------------------------------------------------------------- |
| `GET /batches/:id/traceability`    | `traceability:read` | Situação e equipamentos de um lote do parceiro                                           |
| `GET /equipments/:id/traceability` | `traceability:read` | Dados e histórico de movimentações de um equipamento do parceiro                         |
| `GET /analytics/reports`           | `traceability:read` | Histórico de análises **da própria organização** (relatórios globais nunca são expostos) |
| `POST /batches`                    | `batches:write`     | Submete um lote com equipamentos; a organização é a dona da chave                        |
| `POST /reports`                    | `reports:request`   | Solicita um relatório assíncrono (`202` + id da tarefa)                                  |
| `GET /reports/:id`                 | `reports:request`   | Status da tarefa (`NA_FILA`, `PROCESSANDO`, `CONCLUIDO`, `FALHOU`), tentativas e erro    |
| `GET /reports/:id/download`        | `reports:request`   | Baixa o arquivo gerado (`400` enquanto a tarefa não estiver concluída)                   |

**Códigos de erro:** `400` dados inválidos; `401` chave ausente, inválida, expirada ou revogada; `403` escopo insuficiente; `404` recurso inexistente **ou de outra organização**; `429` limite de requisições excedido.

Exemplo (PowerShell: use `curl.exe`; no Linux, `curl`):

```bash
curl -X POST http://localhost:3000/api/v1/public/reports \
  -H "x-api-key: gc_live_xxxxxxxx_yyyyyyyy..." \
  -H "Content-Type: application/json" \
  -d '{"type":"RENTABILIDADE","format":"csv"}'
```

Os arquivos CSV usam `;` como separador e BOM UTF-8, para abrirem corretamente no Excel em português.

<br>

---

## 🗂️ Estrutura Adotada <a id="estrutura"></a>

```
prisma/
├── schema.prisma          # Modelos e relacionamentos
├── migrations/            # Migrations versionadas (constraints e triggers incluídos)
└── seed.ts                # Massa de dados (inclui o histórico para as análises)
scripts/
└── jornada-teste.ts       # Teste da jornada completa pela API
src/
├── app.ts                 # Servidor, plugins, rotas versionadas, agendador e graceful shutdown
├── worker.ts              # Processo separado que consome a fila de relatórios
├── routes/                # Rotas (internas e públicas), schemas e papéis/escopos exigidos
├── controllers/           # Camada HTTP
├── services/              # Regras de negócio (inclui chaves de API e API pública)
├── repositories/          # Acesso ao banco (Prisma) dos módulos de negócio
├── schemas/               # Schemas Zod (body, params, query e resposta)
├── middlewares/           # auth (JWT), requireRole e apiKeyAuth/requireScope
├── queues/                # Fila BullMQ e conexão com o Redis
├── analytics/             # MÓDULO ANALÍTICO (autocontido)
│   ├── analytics.routes.ts
│   ├── analytics.controller.ts
│   ├── analytics.schema.ts
│   ├── analytics.repository.ts
│   ├── reportExporter.ts  # JSON/CSV
│   ├── scheduler.ts       # node-cron + trava no Redis
│   └── services/          # efficiency, profitability e lifespan
└── lib/                   # env, errors, prisma, validators e valuation (valor de recuperação)
```

Fluxo de uma requisição interna: `Rota (Zod + papel) → Controller → Service → Repository → PostgreSQL`.
Fluxo de um relatório assíncrono: `POST /reports → ReportJob (banco) + job (Redis) → Worker → analytics/services → arquivo em REPORTS_DIR → status CONCLUIDO (+ webhook)`.

<br>

---

## 🧠 Decisões de Arquitetura e Trade-offs (AV3) <a id="decisoes"></a>

### 1. Módulo analítico em pasta própria (`src/analytics`)

Na AV2, o código é organizado **por tipo de arquivo** (todas as rotas juntas, todos os controllers juntos, etc.). Para a AV3, a camada analítica foi colocada **em uma pasta própria, com seu próprio conjunto de rotas, controller, schemas, repositório e serviços**, em vez de espalhar seus arquivos pelas pastas globais.

**Por quê:**

- **Coesão e baixo acoplamento.** A análise só _lê_ dados de lotes, equipamentos e movimentações e _escreve_ apenas nas suas tabelas (`AnalyticsReport` e `Prediction`). Nenhuma regra de negócio da AV1/AV2 depende dela; apagar a pasta não quebra o restante do sistema.
- **Três pontos de entrada, um só código.** O mesmo serviço é chamado pela rota interna, pelo _worker_ (relatório assíncrono) e pelo agendador (cron). Manter tudo junto evita que cada entrada acabe com uma cópia da lógica.
- **Caminho de extração.** Se a carga analítica crescer, o módulo pode virar um serviço separado (ou rodar só no worker) sem desmontar camadas do monólito.
- **Evolução independente.** Novas análises entram como um novo arquivo em `services/` e uma rota, sem tocar nas camadas globais.

**Trade-offs assumidos:**

- A organização fica **mista**: o restante do projeto é por camada, o módulo analítico é por domínio. Aceitei a inconsistência por ser o único módulo com ciclo de vida próprio (fila, cron, exportação).
- O repositório analítico consulta diretamente tabelas de outros domínios (lotes, equipamentos e movimentações) com consultas sob medida, em vez de reutilizar os repositórios existentes. Isso duplica um pouco de acesso a dados, mas evita carregar relações desnecessárias e mantém o módulo desacoplado.
- A API pública (`routes/public.routes.ts`) permanece nas pastas globais, pois é uma preocupação diferente (autenticação por chave) e apenas _consome_ os schemas e o repositório do módulo analítico.

### 2. Por que simple-statistics

As três análises usam apenas estatística descritiva e regressão linear simples (média, mediana, desvio-padrão, `linearRegression`, `rSquared`). A biblioteca foi escolhida porque:

- é **pequena, sem dependências, tipada e com funções puras**, o que torna os cálculos previsíveis e fáceis de conferir;
- implementa **exatamente** o que o problema pede, sem trazer um framework de _machine learning_ (TensorFlow.js e similares seriam _overkill_ para esse volume de dados e dificultariam explicar o resultado);
- evita **reimplementar à mão** fórmulas sujeitas a erro (desvio-padrão amostral, mínimos quadrados, R²).

**Alternativas consideradas:** (a) funções estatísticas do PostgreSQL (`regr_slope`, `percentile_cont`), que funcionariam, mas prenderiam a lógica ao banco e dificultariam testá-la e versioná-la junto do código; (b) escrever as fórmulas manualmente, descartado pelo risco de erro. **Limitação:** o modelo é linear e simples; com poucos pontos por tipo, o R² serve mais como indicador de confiança do que como garantia.

### 3. Modelagem das tabelas novas

| Tabela                | Papel                                                         | Decisão de modelagem                                                                                                                                                                                                            |
| :-------------------- | :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `relatorio_analitico` | Histórico de análises executadas (`AnalyticsReport`)          | `parametros` e `resultado` em **JSON**: cada análise tem um formato de saída diferente, e o histórico não exige uma migration a cada métrica nova. Índice em `(tipo, gerado_em)`. Guarda `versao_modelo`.                       |
| `previsao_vida_util`  | Uma linha por previsão por tipo de equipamento (`Prediction`) | **Relacional**, porque é consultada, avaliada e usada na calibração: coeficientes, R², amostra, vida útil prevista, vida útil real, erro e data da avaliação.                                                                   |
| `chave_api`           | Credenciais de parceiros (`ApiKey`)                           | Guarda **apenas o hash SHA-256** da chave e um **prefixo único** para localizá-la; escopos em lista, limite por minuto, ativa/revogada, expiração e último uso. Remover a organização remove suas chaves (`ON DELETE CASCADE`). |
| `tarefa_relatorio`    | Estado de cada relatório assíncrono (`ReportJob`)             | Status (`NA_FILA`, `PROCESSANDO`, `CONCLUIDO`, `FALHOU`), tentativas, último erro e caminho do arquivo. O vínculo com a chave é opcional e **não** é em cascata: a tarefa não some junto com a chave.                           |

**Por que `AnalyticsReport` em JSON e `Prediction` relacional?** O primeiro é um _registro histórico_ que só é lido por inteiro; o segundo precisa ser filtrado por tipo, ordenado e usado em cálculos. Cada estrutura segue o seu uso.

**Por que o hash e não a chave?** Se o banco vazar, as chaves não podem ser reaproveitadas. Como a chave é longa e aleatória (192 bits de segredo), um SHA-256 simples basta; _bcrypt_ (usado nas senhas) seria desnecessariamente lento para uma verificação feita a cada requisição.

**Por que `estimatedValue` calculado na API?** A rentabilidade depende desse valor. Se ele só existisse nos dados do seed, qualquer equipamento cadastrado pela API ficaria fora da análise. `src/lib/valuation.ts` aplica um modelo determinístico: `valor = base(tipo) × fator(estado físico) × fator(idade, com piso de 50%) × fator(marca premium) × fator(linha corporativa)`.

### 4. Fila, retentativas e webhook

- **Por que assíncrono:** gerar uma análise varre lotes, equipamentos e movimentações; fazer isso dentro da requisição prenderia o cliente e a API. A rota responde `202` com o identificador da tarefa e o parceiro acompanha por _polling_ ou webhook.
- **Por que BullMQ + Redis:** fila persistente, com retentativas e _backoff_ prontos; evita escrever (e testar) um mecanismo próprio.
- **Política de retry:** **3 tentativas** no total, com **_backoff_ exponencial de base 2 s** (espera de 2 s e depois de 4 s). Enquanto há tentativas restantes a tarefa volta a `NA_FILA`; esgotadas, vai para `FALHOU`, com o último erro e a data de término. Jobs falhos são **mantidos** na fila para diagnóstico e os 100 últimos concluídos são guardados.
- **Por que 3 e 2 s:** falhas transitórias (conexão com o banco ou Redis) costumam se resolver em segundos; mais tentativas só atrasariam o aviso de uma falha permanente. Como erros de validação não são transitórios, o parceiro vê o motivo no campo `error`.
- **Worker separado da API:** o processamento pesado não compete com o atendimento das requisições, e o worker pode ser escalado (ou parado) de forma independente. A concorrência por processo é 2.
- **Webhook:** ao concluir, o worker envia um `POST` com `event`, `jobId`, `type`, `status` e `finishedAt`. É _best effort_: uma falha é apenas registrada em log e **não** reprocessa a tarefa (o relatório já foi gerado e continua disponível por _polling_).

### 5. Agendamento com trava distribuída

O `node-cron` recalcula as três análises todo dia às **02:00** (horário de menor uso). Se houver mais de uma instância da API, todas disparariam o cron; por isso cada execução tenta adquirir uma **trava no Redis** (`SET NX EX 300`) e as demais instâncias ignoram a rodada.

### 6. Chaves de API, escopos e isolamento por organização

- Formato `gc_live_<prefixo>_<segredo>`: o prefixo permite achar a chave sem varrer a tabela e aparece nas listagens; o segredo nunca é recuperável.
- Escopos mínimos (`traceability:read`, `batches:write`, `reports:request`): o parceiro recebe só o que a integração precisa.
- **Isolamento:** toda consulta pública é filtrada pela organização da chave, e recurso de outra organização responde `404` (e não `403`), para não confirmar que ele existe. O histórico de análises da API pública só devolve relatórios cujo parâmetro `orgId` é o da chave; **relatórios globais não são expostos a parceiros**.
- JWT interno e chave de API são mecanismos separados: um não substitui o outro.

### 7. Limite de requisições por chave

`@fastify/rate-limit` com janela de 1 minuto, **contador por chave** (e não por IP, já que vários parceiros podem sair do mesmo IP) e limite configurável por chave (1 a 1000, padrão 60). Ao exceder, a API responde `429` informando o limite e o tempo de espera.

### 8. Versionamento `/api/v1`

Separar `/internal` de `/public` deixa claro **quem consome** cada rota e permite evoluir a API pública (contrato com terceiros) sem quebrar parceiros: mudanças incompatíveis entram em `/api/v2`.

### 9. Escalabilidade

Pontos que já escalam e pontos que exigiriam trabalho:

| Ponto                     | Hoje                                                            | Para várias instâncias                                                                                                         |
| :------------------------ | :-------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| API sem estado (JWT)      | Escala horizontalmente                                          | —                                                                                                                              |
| Workers                   | Podem ser replicados; o BullMQ distribui os jobs                | —                                                                                                                              |
| Cron                      | Protegido por trava no Redis                                    | —                                                                                                                              |
| **Limite de requisições** | **Contador em memória, por instância**                          | Com N instâncias o limite efetivo vira até N × o configurado. Solução: usar o armazenamento em Redis do `@fastify/rate-limit`  |
| **Arquivos de relatório** | **Disco local (`REPORTS_DIR`); a API lê o que o worker gravou** | API e worker precisam estar na mesma máquina/volume. Solução: armazenamento compartilhado (volume de rede ou _object storage_) |
| Análises                  | Calculadas em memória a cada execução                           | Para volumes muito maiores, agregar no banco ou de forma incremental                                                           |

<br>

---

## 📋 Regras de Negócio da AV3 <a id="regras"></a>

### Eficiência operacional

Considera os lotes com **triagem concluída**. Para cada lote mede, em minutos, o **tempo total** (entrada → conclusão), a **espera em fila** (entrada → início da triagem) e o **tempo ativo** (início → conclusão). Entrega média, mediana, desvio-padrão, mínimo e máximo, agrupados globalmente, **por operador** (com `efficiencyRatioVsGlobal`, razão entre a média do operador e a global) e **por mês**. Filtros opcionais: `startDate`, `endDate` e `orgId`. Gargalos identificados:

- **Etapa:** compara o tempo médio de espera com o tempo médio de execução e aponta o maior;
- **Operador:** média do operador acima de **média global + 1 desvio-padrão**;
- **Lote _outlier_:** tempo total acima de **média global + 1,5 desvio-padrão**.

### Rentabilidade

Considera o `estimatedValue` dos equipamentos e agrupa por **tipo**, por **estado físico dentro do tipo** e por **marca/modelo/estado**, com média, mediana, desvio-padrão, extremos e **valor médio por kg**. O resumo informa o tipo e a combinação marca/modelo mais rentáveis. Aceita o filtro `orgId`.

### Previsão de vida útil

1. Cada estado físico recebe uma **nota de saúde** (`NOVO` = 100, `BOM_ESTADO` = 85, … , `INSERVIVEL` = 0).
2. Para cada tipo de equipamento, monta pontos **(idade, nota)** a partir de todas as movimentações com mudança de estado físico e do estado atual.
3. Ajusta uma **regressão linear** (`simple-statistics`) e calcula o **R²**.
4. A vida útil total é o ponto em que a reta chega a nota 0 (`-intercepto / inclinação`), limitada entre 1 e 30 anos. Se a reta não for descendente o suficiente, usa a idade média dos equipamentos já inservíveis; se também não houver, usa a maior idade observada + 2 anos (mínimo de 5).
5. A **vida útil restante** é a total menos a idade média dos equipamentos ainda em uso, e o resultado informa o ano projetado de inservibilidade.
6. **Calibração:** com `PATCH /analytics/predictions/{id}/evaluate` o gestor informa a vida útil real; o erro absoluto é gravado e a diferença média entre real e previsto (por tipo) é somada às previsões futuras. A versão do modelo passa de `v1` para `v1-calibrated`.

### Valor de recuperação

Definido na seção de decisões (item 3) e recalculado quando muda o tipo, a marca, o modelo, o ano de fabricação ou o estado físico do equipamento.

<br>

---

## 🗄️ Banco de Dados <a id="banco"></a>

Além dos modelos da AV2 (`User`, `Organization`, `Contract`, `Batch`, `Equipment`, `Movement`, `SystemSetting`), a AV3 adiciona `AnalyticsReport`, `Prediction`, `ApiKey` e `ReportJob`, e a coluna `estimatedValue` em `Equipment`. As migrations estão em `prisma/migrations`.

```
Organization 1 ── N ApiKey 1 ── N ReportJob
Organization 1 ── N Batch 1 ── N Equipment 1 ── N Movement
AnalyticsReport   (independente: histórico em JSON)
Prediction        (independente: uma linha por previsão e tipo)
```

Os nomes de tabelas e colunas seguem em português (`chave_api`, `tarefa_relatorio`, `relatorio_analitico`, `previsao_vida_util`), como na AV2. Os triggers e _constraints_ da AV2 continuam valendo; em particular, **a data de entrada de um lote não pode ser anterior a 90 dias**, o que limita o histórico que o seed e os testes conseguem criar.

<br>

---

## ⚠️ Limitações conhecidas <a id="limitacoes"></a>

Itens identificados na revisão do código e **não corrigidos** nesta entrega, em ordem de importância:

### 1. Calibração da vida útil compara com a previsão já calibrada

A previsão gravada em `Prediction.predictedLifespanYears` é o valor **já calibrado** (bruto + ajuste). Ao avaliar essa previsão, o erro é medido contra um valor que **já contém a correção da rodada anterior**, e a rodada seguinte calcula o ajuste como a **média** desses erros, que misturam bases diferentes (a primeira avaliação é sobre um valor bruto; as seguintes, sobre valores corrigidos). Na prática, parte do mesmo erro é contada duas vezes e o ajuste oscila em vez de convergir para a vida útil real. **A partir da segunda rodada de calibração, as previsões devem ser lidas como estimativas aproximadas.**

_Exemplo:_ o modelo bruto prevê 8 anos e a vida útil real é 10. A rodada 1 mede erro de +2. A rodada 2 soma +2 e prevê 10, acertando; ao ser avaliada, mede erro de 0. A rodada 3 passa a usar a média (+2 e 0) = +1 e volta a prever 9, piorando uma previsão que já estava correta.

**Correção proposta:** gravar também a previsão **bruta** em `Prediction` (nova coluna) e calcular o viés sempre sobre ela, ou usar uma média móvel exponencial do viés.

### 2. `webhookUrl` aceita qualquer destino (risco de SSRF)

O parceiro informa a URL e **o servidor** faz a requisição. O schema valida apenas que é uma URL, de modo que um parceiro mal-intencionado poderia apontar para `http://localhost:6379`, para a rede interna ou para endereços de metadados de nuvem, fazendo o worker enviar requisições a recursos que só ele alcança (_Server-Side Request Forgery_). Além disso, a chamada não tem _timeout_ e segue redirecionamentos.

**Mitigações propostas:** aceitar somente `https`; resolver o DNS e **bloquear endereços privados, _loopback_ e _link-local_**; não seguir redirecionamentos (`redirect: "manual"`); definir _timeout_ curto; opcionalmente cadastrar o domínio permitido na chave de API e assinar o corpo do webhook (HMAC) para o parceiro validar a origem.

### 3. Escalabilidade com várias instâncias

Limite de requisições em memória e arquivos de relatório em disco local (detalhes na tabela do item 9 das decisões).

### 4. Outros pontos

- Equipamentos criados pela API **antes** da introdução do cálculo de `estimatedValue` continuam com o valor nulo e ficam fora da rentabilidade até serem atualizados.
- A trava do agendador expira em 5 minutos e não é liberada ao fim da execução; se a análise noturna demorar mais que isso, outra instância poderia iniciá-la.
- O webhook não é reenviado em caso de falha (_best effort_).
- A pasta `storage/` (relatórios gerados) fica fora do versionamento (já está no `.gitignore`).

<br>

---

## 🔐 Segurança e Credenciais Fixas

- Senhas de usuários: **bcrypt**. Chaves de API: **SHA-256** (veja o item 3 das decisões); o texto puro da chave só existe na resposta da emissão.
- Os arquivos **`.env.example` e `docker-compose.yml` possuem credenciais fixas** (PostgreSQL, `JWT_SECRET` de exemplo, Redis sem senha) e os usuários do seed têm senhas conhecidas. Isso foi feito **exclusivamente para facilitar a avaliação e a execução local**. Em um ambiente real, as credenciais devem ser trocadas, o `.env` não deve ser versionado (já está no `.gitignore`), o Redis deve exigir senha e não ficar exposto, e os segredos devem vir de um cofre ou de variáveis protegidas.

<br>

---

## 📝 Considerações Finais

| Decisão                                            | Alternativa considerada                 | Por que a escolha atual                                                         |
| :------------------------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------ |
| Módulo `analytics` autocontido                     | Espalhar pelas camadas globais          | Baixo acoplamento, um só código para rota, worker e cron, extração futura fácil |
| simple-statistics                                  | SQL estatístico / fórmulas manuais / ML | Simples, tipada, suficiente e fácil de explicar                                 |
| `AnalyticsReport` em JSON, `Prediction` relacional | Tudo relacional ou tudo JSON            | Cada estrutura segue o seu uso (histórico lido inteiro × dado consultado)       |
| Hash SHA-256 da chave de API                       | Guardar a chave / usar bcrypt           | Segredo irrecuperável e verificação rápida a cada requisição                    |
| BullMQ + worker separado                           | Processar na requisição / fila própria  | Resposta imediata, retentativas prontas, escala independente                    |
| 3 tentativas, backoff exponencial de 2 s           | Mais tentativas / intervalo fixo        | Cobre falhas transitórias sem demorar a sinalizar falhas permanentes            |
| Limite por chave                                   | Limite por IP                           | Parceiros diferentes podem compartilhar IP                                      |
| `/api/v1/internal` × `/api/v1/public`              | Rotas sem versão                        | Contrato externo estável e evolução sem quebrar parceiros                       |

**Evolução natural:** corrigir as limitações acima (calibração, SSRF, _rate limit_ e arquivos compartilhados), acrescentar testes automatizados unitários para os cálculos estatísticos e expor as análises em um painel.

<br>

---

<sub>Taís Souza · 2º DSM · Fatec SJC · 2026-2</sub>
