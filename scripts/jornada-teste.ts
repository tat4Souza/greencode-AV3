import "dotenv/config";
import { cnpj } from "cpf-cnpj-validator";

const BASE_URL =
  process.env["BASE_URL"] ?? `http://localhost:${process.env["PORT"] ?? 3000}`;
const ADMIN_EMAIL = process.env["ADMIN_EMAIL"] ?? "admin@greencode.com";
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "Admin@1234";

const RUN = Date.now().toString(36);
const PASSWORD = "Teste@1234";

type Res = { status: number; data: any };

function v1Path(path: string): string {
  if (!path.startsWith("/api/") || path.startsWith("/api/v1/")) return path;
  return /^\/api\/(auth|easteregg)(\/|$|\?)/.test(path)
    ? path.replace("/api/", "/api/v1/")
    : path.replace("/api/", "/api/v1/internal/");
}

const useColor = process.stdout.isTTY && !process.env["NO_COLOR"];
const paint = (code: number, text: string) =>
  useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
const green = (t: string) => paint(32, t);
const red = (t: string) => paint(31, t);
const dim = (t: string) => paint(90, t);
const bold = (t: string) => paint(1, t);

let passed = 0;
const failures: string[] = [];

async function call(
  method: string,
  path: string,
  opts: {
    token?: string;
    apiKey?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean>;
  } = {},
): Promise<Res> {
  const url = new URL(BASE_URL + v1Path(path));
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  if (opts.apiKey) headers["x-api-key"] = opts.apiKey;

  const response = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function section(title: string) {
  console.log(`\n${bold(title)}`);
}

function expectStatus(
  description: string,
  res: Res,
  expected: number | number[],
  route: string,
  extra?: (res: Res) => string | undefined,
): Res {
  route = route.replace(
    /^(\S+) (\/api\/\S*)/,
    (_m, verb: string, p: string) => `${verb} ${v1Path(p)}`,
  );
  const accepted = Array.isArray(expected) ? expected : [expected];
  let problem: string | undefined;

  if (!accepted.includes(res.status)) {
    problem = `esperado ${accepted.join("/")}, recebido ${res.status}`;
  } else if (extra) {
    problem = extra(res);
  }

  const detail =
    res.status >= 400 && res.data?.message
      ? dim(` — "${res.data.message}"`)
      : "";

  if (problem) {
    failures.push(`${description} (${route}): ${problem}`);
    console.log(
      `  ${red("[FALHOU]")} ${description} ${dim(`${route} → ${res.status}`)}${detail}`,
    );
    console.log(`           ${red(problem)}`);
  } else {
    passed++;
    console.log(
      `  ${green("[ OK ]")} ${description} ${dim(`${route} → ${res.status}`)}${detail}`,
    );
  }
  return res;
}

function critical(res: Res, description: string): void {
  if (res.status >= 400) {
    throw new Error(`Passo essencial falhou: ${description} (${res.status})`);
  }
}

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);

type Versioned = { id: string; version: number };

async function login(email: string, password: string): Promise<Res> {
  return call("POST", "/api/auth/login", { body: { email, password } });
}

const orgBody = (overrides: Record<string, unknown> = {}) => ({
  name: `Organização Teste ${RUN}`,
  cnpj: cnpj.generate(),
  email: `contato.${RUN}@empresa.com.br`,
  phoneNumber: "(12) 3333-4444",
  cep: "12220-000",
  publicPlace: "Avenida Cidade Jardim",
  number: "100",
  neighbourhood: "Centro",
  city: "São José dos Campos",
  uf: "SP",
  ...overrides,
});

const contractBody = (overrides: Record<string, unknown> = {}) => ({
  signedAt: daysFromNow(-30).toISOString(),
  expiresAt: daysFromNow(365).toISOString(),
  clauses: [
    { title: "Coleta", description: "Coleta quinzenal de equipamentos" },
    {
      title: "Certificação",
      description: "Emissão de certificado de destinação",
    },
  ],
  monthlyValue: 5000,
  autoRenewal: true,
  ...overrides,
});

const equipmentBody = (overrides: Record<string, unknown> = {}) => ({
  type: "NOTEBOOK",
  brand: "Dell",
  model: "Latitude 5420",
  manufacturingYear: 2021,
  physicalState: "BOM_ESTADO",
  weightKG: 1.8,
  ...overrides,
});

async function main() {
  console.log(bold("\n=== Greencode | Jornada completa da API ==="));
  console.log(dim(`Servidor: ${BASE_URL}  |  Execução: ${RUN}`));

  section("1. Disponibilidade e autenticação");
  expectStatus(
    "Servidor responde ao healthcheck",
    await call("GET", "/healthcheck"),
    200,
    "GET /healthcheck",
  );

  expectStatus(
    "Rota protegida sem token é negada",
    await call("GET", "/api/users"),
    401,
    "GET /api/users",
  );

  expectStatus(
    "Token inválido é negado",
    await call("GET", "/api/users", { token: "token.invalido.aqui" }),
    401,
    "GET /api/users",
  );

  expectStatus(
    "Login com senha incorreta é negado",
    await login(ADMIN_EMAIL, "senha-errada"),
    401,
    "POST /api/auth/login",
  );

  expectStatus(
    "Login com usuário inexistente é negado",
    await login("fantasma@greencode.com", PASSWORD),
    401,
    "POST /api/auth/login",
  );

  expectStatus(
    "Login sem e-mail é rejeitado pela validação",
    await call("POST", "/api/auth/login", { body: { password: PASSWORD } }),
    400,
    "POST /api/auth/login",
  );

  const adminLogin = expectStatus(
    "Administrador realiza login",
    await login(ADMIN_EMAIL, ADMIN_PASSWORD),
    200,
    "POST /api/auth/login",
    (r) => (r.data?.accessToken ? undefined : "accessToken ausente"),
  );
  critical(adminLogin, "login do administrador (o seed foi executado?)");
  const admin: string = adminLogin.data.accessToken;

  section("2. Administrador: contas de acesso");
  const emails = {
    OPERADOR: `operador.${RUN}@teste.com`,
    GESTOR: `gestor.${RUN}@teste.com`,
    AUDITOR: `auditor.${RUN}@teste.com`,
  };
  const created: Record<string, Versioned> = {};

  for (const role of ["OPERADOR", "GESTOR", "AUDITOR"] as const) {
    const r = expectStatus(
      `Cria usuário ${role}`,
      await call("POST", "/api/users", {
        token: admin,
        body: {
          email: emails[role],
          username: `${role.toLowerCase()}_${RUN}`,
          role,
          password: PASSWORD,
        },
      }),
      201,
      "POST /api/users",
    );
    critical(r, `criação do usuário ${role}`);
    created[role] = r.data;
  }

  expectStatus(
    "E-mail duplicado é rejeitado",
    await call("POST", "/api/users", {
      token: admin,
      body: {
        email: emails.OPERADOR,
        username: "duplicado",
        role: "OPERADOR",
        password: PASSWORD,
      },
    }),
    409,
    "POST /api/users",
  );

  expectStatus(
    "Papel inválido é rejeitado",
    await call("POST", "/api/users", {
      token: admin,
      body: {
        email: `invalido.${RUN}@teste.com`,
        username: "invalido",
        role: "PAPEL_QUE_NAO_EXISTE",
        password: PASSWORD,
      },
    }),
    400,
    "POST /api/users",
  );

  const gestorUser = created["GESTOR"]!;
  const userUpdate = expectStatus(
    "Atualiza usuário informando a versão atual",
    await call("PUT", `/api/users/${gestorUser.id}`, {
      token: admin,
      body: {
        username: `gestor_atualizado_${RUN}`,
        version: gestorUser.version,
      },
    }),
    200,
    "PUT /api/users/:id",
  );

  expectStatus(
    "Atualização com versão antiga gera conflito (locking otimista)",
    await call("PUT", `/api/users/${gestorUser.id}`, {
      token: admin,
      body: { username: "outra_edicao", version: gestorUser.version },
    }),
    409,
    "PUT /api/users/:id",
  );
  gestorUser.version = userUpdate.data?.version ?? gestorUser.version + 1;

  section("3. Administrador: parâmetros globais");

  const settings = expectStatus(
    "Consulta as configurações globais",
    await call("GET", "/api/settings", { token: admin }),
    200,
    "GET /api/settings",
  );
  const original = settings.data;

  expectStatus(
    "Alíquota acima de 100% é rejeitada",
    await call("PATCH", "/api/settings", {
      token: admin,
      body: {
        taxRate: 150,
        depreciationRate: original.depreciationRate,
        version: original.version,
      },
    }),
    400,
    "PATCH /api/settings",
  );

  expectStatus(
    "Alíquota negativa é rejeitada",
    await call("PATCH", "/api/settings", {
      token: admin,
      body: {
        taxRate: -5,
        depreciationRate: original.depreciationRate,
        version: original.version,
      },
    }),
    400,
    "PATCH /api/settings",
  );

  const changed = expectStatus(
    "Atualiza a alíquota de impostos",
    await call("PATCH", "/api/settings", {
      token: admin,
      body: {
        taxRate: 12,
        depreciationRate: original.depreciationRate,
        version: original.version,
      },
    }),
    200,
    "PATCH /api/settings",
  );

  if (changed.data?.version !== original.version) {
    expectStatus(
      "Atualização com versão antiga gera conflito",
      await call("PATCH", "/api/settings", {
        token: admin,
        body: {
          taxRate: 13,
          depreciationRate: original.depreciationRate,
          version: original.version,
        },
      }),
      409,
      "PATCH /api/settings",
    );
  }

  expectStatus(
    "Restaura a alíquota original",
    await call("PATCH", "/api/settings", {
      token: admin,
      body: {
        taxRate: original.taxRate,
        depreciationRate: original.depreciationRate,
        version: changed.data?.version ?? original.version,
      },
    }),
    200,
    "PATCH /api/settings",
  );

  section("4. Login dos demais perfis");
  const tokens: Record<string, string> = {};
  for (const role of ["OPERADOR", "GESTOR", "AUDITOR"] as const) {
    const r = expectStatus(
      `${role} realiza login`,
      await login(emails[role], PASSWORD),
      200,
      "POST /api/auth/login",
    );
    critical(r, `login do ${role}`);
    tokens[role] = r.data.accessToken;
  }
  const operador = tokens["OPERADOR"]!;
  const gestor = tokens["GESTOR"]!;
  const auditor = tokens["AUDITOR"]!;

  section("5. Controle de acesso por papel (RBAC)");
  expectStatus(
    "OPERADOR não acessa a gestão de usuários",
    await call("GET", "/api/users", { token: operador }),
    403,
    "GET /api/users",
  );
  expectStatus(
    "OPERADOR não cadastra lotes",
    await call("POST", "/api/batches", {
      token: operador,
      body: { orgId: crypto.randomUUID(), invoice: "1", carrier: "X" },
    }),
    403,
    "POST /api/batches",
  );
  expectStatus(
    "GESTOR não acessa organizações",
    await call("GET", "/api/organizations", { token: gestor }),
    403,
    "GET /api/organizations",
  );
  expectStatus(
    "GESTOR não acessa as configurações globais",
    await call("GET", "/api/settings", { token: gestor }),
    403,
    "GET /api/settings",
  );
  expectStatus(
    "AUDITOR não acessa lotes (escopo exclusivo de relatórios)",
    await call("GET", "/api/batches", { token: auditor }),
    403,
    "GET /api/batches",
  );
  expectStatus(
    "AUDITOR não cadastra organizações",
    await call("POST", "/api/organizations", {
      token: auditor,
      body: orgBody(),
    }),
    403,
    "POST /api/organizations",
  );

  section("6. Operador: organizações e contratos");
  expectStatus(
    "CNPJ com dígitos repetidos é rejeitado",
    await call("POST", "/api/organizations", {
      token: operador,
      body: orgBody({ cnpj: "11111111111111" }),
    }),
    400,
    "POST /api/organizations",
  );

  expectStatus(
    "CNPJ com tamanho incorreto é rejeitado",
    await call("POST", "/api/organizations", {
      token: operador,
      body: orgBody({ cnpj: "123" }),
    }),
    400,
    "POST /api/organizations",
  );

  expectStatus(
    "Contrato com vencimento no passado é rejeitado",
    await call("POST", "/api/organizations", {
      token: operador,
      body: orgBody({
        contract: contractBody({ expiresAt: daysFromNow(-10).toISOString() }),
      }),
    }),
    400,
    "POST /api/organizations",
  );

  const orgAResponse = expectStatus(
    "Cadastra organização A com contrato válido",
    await call("POST", "/api/organizations", {
      token: operador,
      body: orgBody({
        name: `Organização A ${RUN}`,
        contract: contractBody(),
      }),
    }),
    201,
    "POST /api/organizations",
    (r) => (r.data?.contract ? undefined : "contrato não retornado"),
  );
  critical(orgAResponse, "cadastro da organização A");
  const orgA: Versioned & { cnpj: string } = orgAResponse.data;

  expectStatus(
    "CNPJ duplicado é rejeitado",
    await call("POST", "/api/organizations", {
      token: operador,
      body: orgBody({ cnpj: orgA.cnpj }),
    }),
    409,
    "POST /api/organizations",
  );

  const orgBResponse = expectStatus(
    "Cadastra organização B sem contrato (pode ficar ativa)",
    await call("POST", "/api/organizations", {
      token: operador,
      body: orgBody({ name: `Organização B ${RUN}` }),
    }),
    201,
    "POST /api/organizations",
    (r) =>
      r.data?.active === true && r.data?.contract === null
        ? undefined
        : "esperada organização ativa e sem contrato",
  );
  critical(orgBResponse, "cadastro da organização B");
  const orgB: Versioned = orgBResponse.data;

  expectStatus(
    "Lista organizações com contrato válido",
    await call("GET", "/api/organizations", {
      token: operador,
      query: { contract: "VALID" },
    }),
    200,
    "GET /api/organizations?contract=VALID",
    (r) =>
      Array.isArray(r.data) && r.data.some((o: any) => o.id === orgA.id)
        ? undefined
        : "organização A não encontrada na listagem",
  );

  const orgUpdate = expectStatus(
    "Atualiza telefone da organização A informando a versão",
    await call("PUT", `/api/organizations/${orgA.id}`, {
      token: operador,
      body: { phoneNumber: "(12) 99999-0000", version: orgA.version },
    }),
    200,
    "PUT /api/organizations/:id",
  );

  expectStatus(
    "Atualização com versão antiga gera conflito",
    await call("PUT", `/api/organizations/${orgA.id}`, {
      token: operador,
      body: { phoneNumber: "(12) 98888-0000", version: orgA.version },
    }),
    409,
    "PUT /api/organizations/:id",
  );
  orgA.version = orgUpdate.data?.version ?? orgA.version + 1;

  section("7. Gestor: recebimento de lotes");

  expectStatus(
    "Lote para organização inexistente é rejeitado",
    await call("POST", "/api/batches", {
      token: gestor,
      body: {
        orgId: crypto.randomUUID(),
        invoice: "NF-1",
        carrier: "TransTeste",
      },
    }),
    404,
    "POST /api/batches",
  );

  expectStatus(
    "Lote para organização SEM contrato é rejeitado",
    await call("POST", "/api/batches", {
      token: gestor,
      body: { orgId: orgB.id, invoice: "NF-2", carrier: "TransTeste" },
    }),
    400,
    "POST /api/batches",
  );

  expectStatus(
    "Data de entrada futura é rejeitada",
    await call("POST", "/api/batches", {
      token: gestor,
      body: {
        orgId: orgA.id,
        invoice: "NF-3",
        carrier: "TransTeste",
        enteredAt: daysFromNow(30).toISOString(),
      },
    }),
    400,
    "POST /api/batches",
  );

  expectStatus(
    "Data de entrada anterior a 90 dias é rejeitada",
    await call("POST", "/api/batches", {
      token: gestor,
      body: {
        orgId: orgA.id,
        invoice: "NF-4",
        carrier: "TransTeste",
        enteredAt: daysFromNow(-120).toISOString(),
      },
    }),
    400,
    "POST /api/batches",
  );

  expectStatus(
    "Lote sem transportadora é rejeitado pela validação",
    await call("POST", "/api/batches", {
      token: gestor,
      body: { orgId: orgA.id, invoice: "NF-5" },
    }),
    400,
    "POST /api/batches",
  );

  expectStatus(
    "Equipamento com tipo inválido é rejeitado",
    await call("POST", "/api/batches", {
      token: gestor,
      body: {
        orgId: orgA.id,
        invoice: "NF-6",
        carrier: "TransTeste",
        equipments: [equipmentBody({ type: "CELULAR" })],
      },
    }),
    400,
    "POST /api/batches",
  );

  expectStatus(
    "Equipamento com ano de fabricação futuro é rejeitado",
    await call("POST", "/api/batches", {
      token: gestor,
      body: {
        orgId: orgA.id,
        invoice: "NF-7",
        carrier: "TransTeste",
        equipments: [equipmentBody({ manufacturingYear: 2999 })],
      },
    }),
    400,
    "POST /api/batches",
  );

  const batchResponse = expectStatus(
    "Cadastra lote com 2 equipamentos (lote + equipamentos em uma transação)",
    await call("POST", "/api/batches", {
      token: gestor,
      body: {
        orgId: orgA.id,
        invoice: `NF-${RUN}`,
        carrier: "TransVerde Logística",
        enteredAt: daysFromNow(-5).toISOString(),
        equipments: [
          equipmentBody({
            type: "NOTEBOOK",
            physicalState: "BOM_ESTADO",
            weightKG: 1.8,
          }),
          equipmentBody({
            type: "MONITOR",
            brand: "LG",
            model: "24MK430H",
            physicalState: "USADO_LEVE",
            weightKG: 3.2,
          }),
        ],
      },
    }),
    201,
    "POST /api/batches",
    (r) =>
      r.data?.equipments?.length === 2 &&
      r.data?.status === "RECEBIDO" &&
      r.data?.equipments?.every((e: any) => e.status === "AGUARDANDO_TRIAGEM")
        ? undefined
        : "esperado lote RECEBIDO com 2 equipamentos AGUARDANDO_TRIAGEM",
  );
  critical(batchResponse, "cadastro do lote");
  const batch: Versioned = batchResponse.data;
  const eq1: Versioned = batchResponse.data.equipments[0];
  const eq2: Versioned = batchResponse.data.equipments[1];

  const eq3Response = expectStatus(
    "Adiciona equipamento avulso já em triagem (status inicial livre)",
    await call("POST", `/api/batches/${batch.id}/equipments`, {
      token: gestor,
      body: equipmentBody({
        type: "IMPRESSORA",
        brand: "Epson",
        model: "L3150",
        physicalState: "USADO_MODERADO",
        weightKG: 4.1,
        status: "EM_TRIAGEM",
      }),
    }),
    201,
    "POST /api/batches/:id/equipments",
  );
  critical(eq3Response, "cadastro do equipamento avulso");
  const eq3: Versioned = eq3Response.data;

  expectStatus(
    "Consulta o lote (com peso total calculado)",
    await call("GET", `/api/batches/${batch.id}`, { token: gestor }),
    200,
    "GET /api/batches/:id",
    (r) =>
      typeof r.data?.totalWeightKG === "number" &&
      r.data?.equipments?.length === 3
        ? undefined
        : "esperado totalWeightKG numérico e 3 equipamentos",
  );

  section("8. Gestor: triagem e movimentação de equipamentos");

  const moveEquipment = async (
    description: string,
    eq: Versioned,
    body: Record<string, unknown>,
    expected: number | number[] = 200,
  ) => {
    const r = await call("PATCH", `/api/equipments/${eq.id}/status`, {
      token: gestor,
      body: { ...body, version: eq.version },
    });
    expectStatus(description, r, expected, "PATCH /api/equipments/:id/status");
    if (r.status === 200 && typeof r.data?.version === "number") {
      eq.version = r.data.version;
    }
    return r;
  };

  await moveEquipment(
    "Desmonte sem triagem completa é rejeitado",
    eq1,
    { status: "AGUARDANDO_DESMONTE" },
    400,
  );

  const staleEq2 = eq2.version;
  await moveEquipment("Equipamento 1 entra em triagem", eq1, {
    status: "EM_TRIAGEM",
  });
  await moveEquipment("Equipamento 2 entra em triagem", eq2, {
    status: "EM_TRIAGEM",
  });

  expectStatus(
    "Movimentação com versão antiga gera conflito",
    await call("PATCH", `/api/equipments/${eq2.id}/status`, {
      token: gestor,
      body: { status: "AGUARDANDO_DESMONTE", version: staleEq2 },
    }),
    409,
    "PATCH /api/equipments/:id/status",
  );

  await moveEquipment(
    "Queda de estado físico de 2+ categorias sem justificativa é rejeitada",
    eq1,
    { physicalState: "INSERVIVEL" },
    400,
  );

  await moveEquipment(
    "Queda de estado físico COM justificativa é aceita",
    eq1,
    {
      physicalState: "INSERVIVEL",
      justification: "Placa-mãe oxidada por contato com líquido",
    },
  );

  expectStatus(
    "Histórico registra as movimentações automaticamente",
    await call("GET", `/api/equipments/${eq1.id}/movements`, { token: gestor }),
    200,
    "GET /api/equipments/:id/movements",
    (r) =>
      Array.isArray(r.data) && r.data.length >= 2
        ? undefined
        : "esperadas ao menos 2 movimentações (status e estado físico)",
  );

  section("9. Gestor: ciclo de vida do lote");

  const moveBatch = async (
    description: string,
    status: string,
    expected: number = 200,
  ) => {
    const r = await call("PATCH", `/api/batches/${batch.id}/status`, {
      token: gestor,
      body: { status, version: batch.version },
    });
    expectStatus(description, r, expected, "PATCH /api/batches/:id/status");
    if (r.status === 200 && typeof r.data?.version === "number") {
      batch.version = r.data.version;
    }
    return r;
  };

  await moveBatch(
    "Pular etapas do lote (RECEBIDO → TRIAGEM_CONCLUIDA) é rejeitado",
    "TRIAGEM_CONCLUIDA",
    400,
  );
  await moveBatch("Lote avança para EM_TRIAGEM", "EM_TRIAGEM");
  await moveBatch(
    "Concluir triagem com equipamentos ainda em triagem é rejeitado",
    "TRIAGEM_CONCLUIDA",
    400,
  );

  await moveEquipment("Equipamento 1 segue para AGUARDANDO_DESMONTE", eq1, {
    status: "AGUARDANDO_DESMONTE",
  });
  await moveEquipment("Equipamento 2 segue para AGUARDANDO_DESMONTE", eq2, {
    status: "AGUARDANDO_DESMONTE",
  });
  await moveEquipment("Equipamento 3 é descartado com segurança", eq3, {
    status: "DESCARTE_SEGURO",
  });

  await moveBatch("Triagem do lote é concluída", "TRIAGEM_CONCLUIDA");
  await moveBatch(
    "Encaminhar com equipamentos aguardando desmonte é rejeitado",
    "ENCAMINHADO",
    400,
  );

  await moveEquipment("Equipamento 1 entra em desmonte", eq1, {
    status: "EM_DESMONTE",
  });
  await moveEquipment("Equipamento 2 entra em desmonte", eq2, {
    status: "EM_DESMONTE",
  });
  await moveBatch("Lote é encaminhado", "ENCAMINHADO");

  await moveBatch(
    "Finalizar com equipamentos ainda em desmonte é rejeitado",
    "FINALIZADO",
    400,
  );
  await moveEquipment("Equipamento 1 vira peças reaproveitadas", eq1, {
    status: "PECAS_REAPROVEITADAS",
  });
  await moveEquipment("Equipamento 2 vira material reciclável", eq2, {
    status: "MATERIAL_RECICLAVEL",
  });
  await moveBatch("Lote é finalizado", "FINALIZADO");

  await moveEquipment(
    "Lote finalizado não aceita novas movimentações",
    eq1,
    { status: "BAIXA_DEFINITIVA" },
    400,
  );

  section("10. Auditor: relatórios");

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = daysFromNow(-30).toISOString().slice(0, 10);

  expectStatus(
    "Relatório por organização no período",
    await call("GET", `/api/reports/organizations/${orgA.id}`, {
      token: auditor,
      query: { start: monthAgo, end: today },
    }),
    200,
    "GET /api/reports/organizations/:id",
    (r) =>
      r.data?.totalBatches >= 1 && r.data?.totalEquipments >= 3
        ? undefined
        : "esperado ao menos 1 lote e 3 equipamentos no período",
  );

  expectStatus(
    "Relatório de equipamentos por status",
    await call("GET", "/api/reports/equipments-by-status", {
      token: auditor,
      query: { status: "PECAS_REAPROVEITADAS" },
    }),
    200,
    "GET /api/reports/equipments-by-status",
    (r) =>
      r.data?.total >= 1
        ? undefined
        : "esperado ao menos 1 equipamento no status",
  );

  expectStatus(
    "Relatório financeiro",
    await call("GET", "/api/reports/financial", { token: auditor }),
    200,
    "GET /api/reports/financial",
    (r) =>
      typeof r.data?.grossMonthlyRevenue === "number" &&
      typeof r.data?.netMonthlyRevenue === "number"
        ? undefined
        : "valores financeiros ausentes",
  );

  expectStatus(
    "Relatório sem o parâmetro obrigatório é rejeitado",
    await call("GET", "/api/reports/equipments-by-status", { token: auditor }),
    400,
    "GET /api/reports/equipments-by-status",
  );

  expectStatus(
    "GESTOR não acessa relatórios",
    await call("GET", "/api/reports/financial", { token: gestor }),
    403,
    "GET /api/reports/financial",
  );

  section("11. Análises internas: eficiência, rentabilidade e vida útil (AV3)");

  const ANALYTICS = "/api/v1/internal/analytics";

  expectStatus(
    "Análises exigem autenticação",
    await call("POST", `${ANALYTICS}/efficiency`, { body: {} }),
    401,
    `POST ${ANALYTICS}/efficiency`,
  );

  expectStatus(
    "OPERADOR não executa análises",
    await call("POST", `${ANALYTICS}/efficiency`, {
      token: operador,
      body: {},
    }),
    403,
    `POST ${ANALYTICS}/efficiency`,
  );

  const analysisRuns: {
    path: string;
    type: string;
    check: (r: Res) => string | undefined;
  }[] = [
    {
      path: "efficiency",
      type: "EFICIENCIA",
      check: (r) =>
        Array.isArray(r.data?.result?.byOperator)
          ? undefined
          : "resultado sem a comparação por operador",
    },
    {
      path: "profitability",
      type: "RENTABILIDADE",
      check: (r) =>
        Array.isArray(r.data?.result?.byEquipmentType)
          ? undefined
          : "resultado sem o agrupamento por tipo de equipamento",
    },
    {
      path: "lifespan",
      type: "VIDA_UTIL",
      check: (r) =>
        Array.isArray(r.data?.result?.projectionsByType)
          ? undefined
          : "resultado sem as projeções por tipo de equipamento",
    },
  ];

  let lifespanRun: Res | undefined;
  for (const run of analysisRuns) {
    const r = expectStatus(
      `Auditor executa a análise ${run.type} e o resultado é gravado`,
      await call("POST", `${ANALYTICS}/${run.path}`, {
        token: auditor,
        body: {},
      }),
      201,
      `POST ${ANALYTICS}/${run.path}`,
      (res) =>
        res.data?.type !== run.type
          ? `tipo esperado ${run.type}, recebido ${res.data?.type}`
          : run.check(res),
    );
    if (run.path === "lifespan") lifespanRun = r;
  }

  expectStatus(
    "Histórico lista os relatórios gerados e respeita o filtro de tipo",
    await call("GET", `${ANALYTICS}/reports`, {
      token: auditor,
      query: { type: "EFICIENCIA", limit: 5 },
    }),
    200,
    `GET ${ANALYTICS}/reports?type=EFICIENCIA`,
    (r) =>
      Array.isArray(r.data) &&
      r.data.length > 0 &&
      r.data.every((item: any) => item.type === "EFICIENCIA")
        ? undefined
        : "histórico vazio ou com tipo diferente do filtro",
  );

  const predictionId: string | undefined =
    lifespanRun?.data?.result?.projectionsByType?.[0]?.predictionId;
  if (predictionId) {
    expectStatus(
      "Gestor registra a vida útil real e o erro da previsão é calculado",
      await call("PATCH", `${ANALYTICS}/predictions/${predictionId}/evaluate`, {
        token: gestor,
        body: { actualLifespanYears: 8 },
      }),
      200,
      `PATCH ${ANALYTICS}/predictions/:id/evaluate`,
      (r) =>
        typeof r.data?.errorYears === "number"
          ? undefined
          : "errorYears não foi calculado",
    );
  }

  section(
    "12. API pública: chaves, escopos, isolamento, limite e relatórios assíncronos (AV3)",
  );

  const API_KEYS = "/api/v1/internal/api-keys";
  const PUBLIC = "/api/v1/public";

  const newPartner = async (label: string) => {
    const r = expectStatus(
      `Cadastra o parceiro ${label} com contrato válido`,
      await call("POST", "/api/organizations", {
        token: operador,
        body: orgBody({
          name: `Parceiro ${label} ${RUN}`,
          contract: contractBody(),
        }),
      }),
      201,
      "POST /api/organizations",
    );
    critical(r, `cadastro do parceiro ${label}`);
    return r.data as { id: string };
  };
  const partner1 = await newPartner("P1");
  const partner2 = await newPartner("P2");

  const issueKey = async (
    description: string,
    orgId: string,
    scopes: string[],
    rateLimitPerMin = 60,
  ) => {
    const r = expectStatus(
      description,
      await call("POST", API_KEYS, {
        token: admin,
        body: { orgId, name: `Chave de teste ${RUN}`, scopes, rateLimitPerMin },
      }),
      201,
      `POST ${API_KEYS}`,
      (res) =>
        typeof res.data?.plainKey === "string" &&
        res.data.plainKey.startsWith("gc_live_")
          ? undefined
          : "plainKey ausente ou com formato inesperado",
    );
    critical(r, description);
    return { id: r.data.id as string, plainKey: r.data.plainKey as string };
  };

  const keyFull = await issueKey(
    "Admin emite chave completa (leitura, escrita e relatórios) para P1",
    partner1.id,
    ["traceability:read", "batches:write", "reports:request"],
    200,
  );
  const keyRead = await issueKey(
    "Admin emite chave somente de leitura para P1",
    partner1.id,
    ["traceability:read"],
  );
  const keyP2 = await issueKey(
    "Admin emite chave para o parceiro P2",
    partner2.id,
    ["traceability:read", "reports:request"],
  );
  const keyLimited = await issueKey(
    "Admin emite chave com limite de 3 requisições por minuto",
    partner1.id,
    ["traceability:read"],
    3,
  );

  expectStatus(
    "Escopo inexistente é rejeitado na emissão da chave",
    await call("POST", API_KEYS, {
      token: admin,
      body: { orgId: partner1.id, name: "Inválida", scopes: ["admin:all"] },
    }),
    400,
    `POST ${API_KEYS}`,
  );

  expectStatus(
    "Só o ADMIN emite chaves de API",
    await call("POST", API_KEYS, {
      token: gestor,
      body: {
        orgId: partner1.id,
        name: "Sem permissão",
        scopes: ["traceability:read"],
      },
    }),
    403,
    `POST ${API_KEYS}`,
  );

  expectStatus(
    "Chave para organização inexistente é rejeitada",
    await call("POST", API_KEYS, {
      token: admin,
      body: {
        orgId: crypto.randomUUID(),
        name: "Sem organização",
        scopes: ["traceability:read"],
      },
    }),
    404,
    `POST ${API_KEYS}`,
  );

  expectStatus(
    "A listagem de chaves nunca expõe o segredo nem o hash",
    await call("GET", API_KEYS, {
      token: admin,
      query: { orgId: partner1.id },
    }),
    200,
    `GET ${API_KEYS}?orgId=`,
    (r) => {
      const raw = JSON.stringify(r.data);
      if (raw.includes(keyFull.plainKey))
        return "a listagem expôs a chave completa";
      if (raw.includes("keyHash")) return "a listagem expôs o hash da chave";
      return Array.isArray(r.data) && r.data.length >= 3
        ? undefined
        : "esperadas ao menos 3 chaves do parceiro P1";
    },
  );

  expectStatus(
    "Rota pública sem chave de API é rejeitada",
    await call("GET", `${PUBLIC}/analytics/reports`),
    401,
    `GET ${PUBLIC}/analytics/reports`,
  );

  expectStatus(
    "Chave de API inválida é rejeitada",
    await call("GET", `${PUBLIC}/analytics/reports`, {
      apiKey: "gc_live_deadbeef_00000000000000000000000000000000",
    }),
    401,
    `GET ${PUBLIC}/analytics/reports`,
  );

  expectStatus(
    "Token JWT interno não substitui a chave de API",
    await call("GET", `${PUBLIC}/analytics/reports`, { token: admin }),
    401,
    `GET ${PUBLIC}/analytics/reports`,
  );

  expectStatus(
    "Chave sem o escopo batches:write não submete lotes",
    await call("POST", `${PUBLIC}/batches`, {
      apiKey: keyRead.plainKey,
      body: { invoice: "NF-SEM-ESCOPO", carrier: "TransTeste" },
    }),
    403,
    `POST ${PUBLIC}/batches`,
  );

  expectStatus(
    "Chave sem o escopo reports:request não solicita relatórios",
    await call("POST", `${PUBLIC}/reports`, {
      apiKey: keyRead.plainKey,
      body: { type: "EFICIENCIA" },
    }),
    403,
    `POST ${PUBLIC}/reports`,
  );

  const submitted = expectStatus(
    "Parceiro submete um lote com equipamento pela API pública",
    await call("POST", `${PUBLIC}/batches`, {
      apiKey: keyFull.plainKey,
      body: {
        invoice: `NF-PUB-${RUN}`,
        carrier: "TransTeste",
        equipments: [equipmentBody()],
      },
    }),
    201,
    `POST ${PUBLIC}/batches`,
    (r) =>
      r.data?.org?.id === partner1.id &&
      Array.isArray(r.data?.equipments) &&
      r.data.equipments.length === 1
        ? undefined
        : "o lote não foi vinculado à organização dona da chave",
  );
  critical(submitted, "submissão do lote pela API pública");
  const publicBatchId: string = submitted.data.id;
  const publicEquipmentId: string = submitted.data.equipments[0].id;

  expectStatus(
    "Lote público sem nota fiscal é rejeitado",
    await call("POST", `${PUBLIC}/batches`, {
      apiKey: keyFull.plainKey,
      body: { carrier: "TransTeste" },
    }),
    400,
    `POST ${PUBLIC}/batches`,
  );

  expectStatus(
    "O valor de recuperação é calculado pela API (equipamento entra na rentabilidade)",
    await call("POST", `${ANALYTICS}/profitability`, {
      token: auditor,
      body: { orgId: partner1.id },
    }),
    201,
    `POST ${ANALYTICS}/profitability`,
    (r) =>
      (r.data?.result?.summary?.totalEquipmentsAnalyzed ?? 0) >= 1
        ? undefined
        : "nenhum equipamento analisado: estimatedValue não foi preenchido",
  );

  expectStatus(
    "Rastreabilidade do lote com chave de leitura",
    await call("GET", `${PUBLIC}/batches/${publicBatchId}/traceability`, {
      apiKey: keyRead.plainKey,
    }),
    200,
    `GET ${PUBLIC}/batches/:id/traceability`,
    (r) =>
      Array.isArray(r.data?.equipments) && r.data.equipments.length === 1
        ? undefined
        : "equipamentos do lote não retornados",
  );

  expectStatus(
    "Rastreabilidade do equipamento com chave de leitura",
    await call(
      "GET",
      `${PUBLIC}/equipments/${publicEquipmentId}/traceability`,
      {
        apiKey: keyRead.plainKey,
      },
    ),
    200,
    `GET ${PUBLIC}/equipments/:id/traceability`,
  );

  expectStatus(
    "Parceiro P2 não enxerga o lote do parceiro P1",
    await call("GET", `${PUBLIC}/batches/${publicBatchId}/traceability`, {
      apiKey: keyP2.plainKey,
    }),
    404,
    `GET ${PUBLIC}/batches/:id/traceability`,
  );

  expectStatus(
    "Parceiro P2 não enxerga o equipamento do parceiro P1",
    await call(
      "GET",
      `${PUBLIC}/equipments/${publicEquipmentId}/traceability`,
      {
        apiKey: keyP2.plainKey,
      },
    ),
    404,
    `GET ${PUBLIC}/equipments/:id/traceability`,
  );

  const reportRequest = expectStatus(
    "Parceiro solicita relatório assíncrono de rentabilidade em CSV",
    await call("POST", `${PUBLIC}/reports`, {
      apiKey: keyFull.plainKey,
      body: { type: "RENTABILIDADE", format: "csv" },
    }),
    202,
    `POST ${PUBLIC}/reports`,
    (r) =>
      typeof r.data?.id === "string" ? undefined : "id da tarefa não retornado",
  );
  critical(reportRequest, "solicitação do relatório assíncrono");
  const jobId: string = reportRequest.data.id;

  let jobStatus = "NA_FILA";
  for (
    let i = 0;
    i < 30 && jobStatus !== "CONCLUIDO" && jobStatus !== "FALHOU";
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const poll = await call("GET", `${PUBLIC}/reports/${jobId}`, {
      apiKey: keyFull.plainKey,
    });
    jobStatus = poll.data?.status ?? jobStatus;
  }

  expectStatus(
    "Worker processa a tarefa (exige Redis e o worker em execução: npm run worker:dev)",
    await call("GET", `${PUBLIC}/reports/${jobId}`, {
      apiKey: keyFull.plainKey,
    }),
    200,
    `GET ${PUBLIC}/reports/:id`,
    (r) =>
      r.data?.status === "CONCLUIDO"
        ? undefined
        : `status final ${r.data?.status} após 30 s; confira se o worker está rodando`,
  );

  expectStatus(
    "Parceiro baixa o relatório CSV gerado",
    await call("GET", `${PUBLIC}/reports/${jobId}/download`, {
      apiKey: keyFull.plainKey,
    }),
    200,
    `GET ${PUBLIC}/reports/:id/download`,
    (r) =>
      typeof r.data === "string" && r.data.includes(";")
        ? undefined
        : "o download não devolveu um CSV com separador ';'",
  );

  expectStatus(
    "Parceiro P2 não enxerga a tarefa do parceiro P1",
    await call("GET", `${PUBLIC}/reports/${jobId}`, {
      apiKey: keyP2.plainKey,
    }),
    404,
    `GET ${PUBLIC}/reports/:id`,
  );

  expectStatus(
    "Parceiro P1 vê somente relatórios da própria organização",
    await call("GET", `${PUBLIC}/analytics/reports`, {
      apiKey: keyRead.plainKey,
    }),
    200,
    `GET ${PUBLIC}/analytics/reports`,
    (r) => {
      if (!Array.isArray(r.data)) return "resposta não é uma lista";
      if (r.data.some((item: any) => item.params?.orgId !== partner1.id)) {
        return "a listagem trouxe relatório global ou de outra organização";
      }
      return jobStatus !== "CONCLUIDO" || r.data.length > 0
        ? undefined
        : "o relatório solicitado não apareceu no histórico";
    },
  );

  expectStatus(
    "Parceiro P2 não recebe relatórios do parceiro P1",
    await call("GET", `${PUBLIC}/analytics/reports`, {
      apiKey: keyP2.plainKey,
    }),
    200,
    `GET ${PUBLIC}/analytics/reports`,
    (r) =>
      Array.isArray(r.data) &&
      r.data.every((item: any) => item.params?.orgId === partner2.id)
        ? undefined
        : "a listagem trouxe relatório global ou de outra organização",
  );

  const limitedUrl = `${PUBLIC}/batches/${publicBatchId}/traceability`;
  for (let i = 1; i <= 3; i++) {
    expectStatus(
      `Chave com limite de 3 req/min: requisição ${i} é aceita`,
      await call("GET", limitedUrl, { apiKey: keyLimited.plainKey }),
      200,
      `GET ${PUBLIC}/batches/:id/traceability`,
    );
  }
  expectStatus(
    "Chave com limite de 3 req/min: a 4ª requisição recebe 429",
    await call("GET", limitedUrl, { apiKey: keyLimited.plainKey }),
    429,
    `GET ${PUBLIC}/batches/:id/traceability`,
  );

  expectStatus(
    "Admin revoga a chave de leitura",
    await call("PATCH", `${API_KEYS}/${keyRead.id}/revoke`, { token: admin }),
    [200, 204],
    `PATCH ${API_KEYS}/:id/revoke`,
  );

  expectStatus(
    "Chave revogada deixa de funcionar imediatamente",
    await call("GET", limitedUrl, { apiKey: keyRead.plainKey }),
    401,
    `GET ${PUBLIC}/batches/:id/traceability`,
  );

  expectStatus(
    "Revogar uma chave já revogada é rejeitado",
    await call("PATCH", `${API_KEYS}/${keyRead.id}/revoke`, { token: admin }),
    400,
    `PATCH ${API_KEYS}/:id/revoke`,
  );

  for (const [label, partner] of [
    ["P1", partner1],
    ["P2", partner2],
  ] as const) {
    expectStatus(
      `Remove o parceiro ${label} (leva junto lotes e chaves de API)`,
      await call("DELETE", `/api/organizations/${partner.id}`, {
        token: operador,
      }),
      204,
      "DELETE /api/organizations/:id",
    );
  }

  section("13. Soft delete (inativar/reativar) e cascata");

  expectStatus(
    "Usuário com registros vinculados não pode ser removido (orienta inativar)",
    await call("DELETE", `/api/users/${created["OPERADOR"]!.id}`, {
      token: admin,
    }),
    409,
    "DELETE /api/users/:id",
  );

  const contractResponse = expectStatus(
    "Operador cadastra contrato para a organização B",
    await call("POST", `/api/organizations/${orgB.id}/contract`, {
      token: operador,
      body: contractBody({ monthlyValue: 3000 }),
    }),
    201,
    "POST /api/organizations/:id/contract",
  );
  critical(contractResponse, "contrato da organização B");

  expectStatus(
    "Operador renova o contrato (valor mensal) com a versão atual",
    await call("PUT", `/api/organizations/${orgB.id}/contract`, {
      token: operador,
      body: { monthlyValue: 3500, version: contractResponse.data.version },
    }),
    200,
    "PUT /api/organizations/:id/contract",
  );

  const batch2Response = expectStatus(
    "Agora o lote da organização B é aceito (tem contrato)",
    await call("POST", "/api/batches", {
      token: gestor,
      body: {
        orgId: orgB.id,
        invoice: `NF-B-${RUN}`,
        carrier: "EcoLog",
        equipments: [
          equipmentBody({
            type: "SERVIDOR",
            brand: "HPE",
            model: "DL360",
            weightKG: 15,
          }),
        ],
      },
    }),
    201,
    "POST /api/batches",
  );
  critical(batch2Response, "lote da organização B");
  const batch2: Versioned = batch2Response.data;
  const eqB: Versioned = batch2Response.data.equipments[0];

  const refreshBatch2 = async () => {
    const r = await call("GET", `/api/batches/${batch2.id}`, { token: gestor });
    batch2.version = r.data.version;
    return r;
  };
  const refreshOrgB = async () => {
    const r = await call("GET", `/api/organizations/${orgB.id}`, {
      token: operador,
    });
    orgB.version = r.data.version;
    return r;
  };

  expectStatus(
    "Gestor inativa o lote (soft delete)",
    await call("PATCH", `/api/batches/${batch2.id}/deactivate`, {
      token: gestor,
      body: { version: batch2.version },
    }),
    [200, 204],
    "PATCH /api/batches/:id/deactivate",
  );

  expectStatus(
    "Lote inativo continua consultável, marcado como inativo",
    await refreshBatch2(),
    200,
    "GET /api/batches/:id",
    (r) => (r.data?.active === false ? undefined : "esperado active=false"),
  );

  expectStatus(
    "Equipamentos de lote inativo deixam de aparecer",
    await call("GET", `/api/equipments/${eqB.id}`, { token: gestor }),
    404,
    "GET /api/equipments/:id",
  );

  expectStatus(
    "Lote inativo não pode ser editado",
    await call("PUT", `/api/batches/${batch2.id}`, {
      token: gestor,
      body: { carrier: "Outra", version: batch2.version },
    }),
    400,
    "PUT /api/batches/:id",
  );

  expectStatus(
    "Gestor reativa o lote",
    await call("PATCH", `/api/batches/${batch2.id}/reactivate`, {
      token: gestor,
      body: { version: batch2.version },
    }),
    [200, 204],
    "PATCH /api/batches/:id/reactivate",
  );

  expectStatus(
    "Equipamentos voltam a aparecer após reativar o lote",
    await call("GET", `/api/equipments/${eqB.id}`, { token: gestor }),
    200,
    "GET /api/equipments/:id",
  );

  await refreshOrgB();
  expectStatus(
    "Operador inativa a organização B (cascata para os lotes)",
    await call("PATCH", `/api/organizations/${orgB.id}/deactivate`, {
      token: operador,
      body: { version: orgB.version },
    }),
    [200, 204],
    "PATCH /api/organizations/:id/deactivate",
  );

  expectStatus(
    "O lote da organização inativa foi inativado junto",
    await refreshBatch2(),
    200,
    "GET /api/batches/:id",
    (r) => (r.data?.active === false ? undefined : "esperado active=false"),
  );

  expectStatus(
    "Organização inativa não recebe novos lotes",
    await call("POST", "/api/batches", {
      token: gestor,
      body: { orgId: orgB.id, invoice: `NF-X-${RUN}`, carrier: "EcoLog" },
    }),
    400,
    "POST /api/batches",
  );

  await refreshOrgB();
  expectStatus(
    "Operador reativa a organização B",
    await call("PATCH", `/api/organizations/${orgB.id}/reactivate`, {
      token: operador,
      body: { version: orgB.version },
    }),
    [200, 204],
    "PATCH /api/organizations/:id/reactivate",
  );

  expectStatus(
    "Reativar a organização reativa os lotes dela",
    await refreshBatch2(),
    200,
    "GET /api/batches/:id",
    (r) => (r.data?.active === true ? undefined : "esperado active=true"),
  );

  section("14. Hard delete (remoção definitiva) e cascata");

  expectStatus(
    "Gestor remove um equipamento",
    await call("DELETE", `/api/equipments/${eqB.id}`, { token: gestor }),
    204,
    "DELETE /api/equipments/:id",
  );

  expectStatus(
    "Equipamento removido não existe mais",
    await call("GET", `/api/equipments/${eqB.id}`, { token: gestor }),
    404,
    "GET /api/equipments/:id",
  );

  expectStatus(
    "Gestor remove o lote",
    await call("DELETE", `/api/batches/${batch2.id}`, { token: gestor }),
    204,
    "DELETE /api/batches/:id",
  );

  expectStatus(
    "Operador remove o contrato da organização B",
    await call("DELETE", `/api/organizations/${orgB.id}/contract`, {
      token: operador,
    }),
    204,
    "DELETE /api/organizations/:id/contract",
  );

  expectStatus(
    "Operador remove a organização B",
    await call("DELETE", `/api/organizations/${orgB.id}`, { token: operador }),
    204,
    "DELETE /api/organizations/:id",
  );

  expectStatus(
    "Remover a organização A leva junto contrato, lotes e equipamentos",
    await call("DELETE", `/api/organizations/${orgA.id}`, { token: operador }),
    204,
    "DELETE /api/organizations/:id",
  );

  expectStatus(
    "O lote da organização removida não existe mais",
    await call("GET", `/api/batches/${batch.id}`, { token: gestor }),
    404,
    "GET /api/batches/:id",
  );

  expectStatus(
    "Os equipamentos da organização removida não existem mais",
    await call("GET", `/api/equipments/${eq1.id}`, { token: gestor }),
    404,
    "GET /api/equipments/:id",
  );

  section("15. Sessão, senha e ciclo de vida de usuários");

  expectStatus(
    "Troca de senha com a senha atual incorreta é rejeitada",
    await call("PATCH", "/api/auth/password", {
      token: auditor,
      body: { currentPassword: "errada", newPassword: "NovaSenha@123" },
    }),
    400,
    "PATCH /api/auth/password",
  );

  expectStatus(
    "Auditor troca a própria senha",
    await call("PATCH", "/api/auth/password", {
      token: auditor,
      body: { currentPassword: PASSWORD, newPassword: "NovaSenha@123" },
    }),
    [200, 204],
    "PATCH /api/auth/password",
  );

  expectStatus(
    "Token antigo deixa de valer após a troca de senha (tokenVersion)",
    await call("GET", "/api/reports/financial", { token: auditor }),
    401,
    "GET /api/reports/financial",
  );

  expectStatus(
    "Login com a nova senha funciona",
    await login(emails.AUDITOR, "NovaSenha@123"),
    200,
    "POST /api/auth/login",
  );

  expectStatus(
    "Gestor realiza logout",
    await call("POST", "/api/auth/logout", { token: gestor }),
    [200, 204],
    "POST /api/auth/logout",
  );

  expectStatus(
    "Token do gestor deixa de valer após o logout",
    await call("GET", "/api/batches", { token: gestor }),
    401,
    "GET /api/batches",
  );

  expectStatus(
    "Usuário sem registros vinculados pode ser removido (hard delete)",
    await call("DELETE", `/api/users/${created["AUDITOR"]!.id}`, {
      token: admin,
    }),
    204,
    "DELETE /api/users/:id",
  );

  const operadorState = await call(
    "GET",
    `/api/users/${created["OPERADOR"]!.id}`,
    {
      token: admin,
    },
  );
  expectStatus(
    "Administrador inativa o operador (soft delete)",
    await call("PATCH", `/api/users/${created["OPERADOR"]!.id}/deactivate`, {
      token: admin,
      body: { version: operadorState.data.version },
    }),
    [200, 204],
    "PATCH /api/users/:id/deactivate",
  );

  expectStatus(
    "Usuário inativo não consegue fazer login",
    await login(emails.OPERADOR, PASSWORD),
    401,
    "POST /api/auth/login",
  );

  expectStatus(
    "Token de usuário inativo deixa de valer",
    await call("GET", "/api/organizations", { token: operador }),
    401,
    "GET /api/organizations",
  );

  const admins = await call("GET", "/api/users", {
    token: admin,
    query: { role: "ADMIN", active: true },
  });
  const self = Array.isArray(admins.data)
    ? admins.data.find((u: any) => u.email === ADMIN_EMAIL)
    : undefined;
  if (self) {
    expectStatus(
      "Administrador não pode inativar a si mesmo",
      await call("PATCH", `/api/users/${self.id}/deactivate`, {
        token: admin,
        body: { version: self.version },
      }),
      403,
      "PATCH /api/users/:id/deactivate",
    );
  }
}

main()
  .catch((error) => {
    const refused =
      error?.cause?.code === "ECONNREFUSED" ||
      error?.message === "fetch failed";
    console.error(
      red(
        refused
          ? `\nNão foi possível conectar em ${BASE_URL}. O servidor está no ar? (npm run dev ou npm start)`
          : `\nExecução interrompida: ${error?.message ?? error}`,
      ),
    );
    failures.push(error?.message ?? String(error));
  })
  .finally(() => {
    const total = passed + failures.length;
    console.log(`\n${bold("=== Resultado ===")}`);
    console.log(`${green(`${passed} passos OK`)} de ${total}`);
    if (failures.length > 0) {
      console.log(red(`${failures.length} falha(s):`));
      for (const failure of failures) console.log(red(`  - ${failure}`));
      process.exitCode = 1;
    } else {
      console.log(green("Jornada concluída com sucesso."));
    }
  });
