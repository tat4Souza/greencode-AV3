import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type {
  BatchStatus,
  EquipmentType,
  PhysicalState,
  Role,
  TrackingStatus,
} from "../src/generated/prisma/enums.js";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL não definida no .env");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const ADMIN_EMAIL = process.env["ADMIN_EMAIL"] ?? "admin@greencode.com";
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "Admin@1234";
const USER_PASSWORD = process.env["SEED_USER_PASSWORD"] ?? "Demo@1234";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);
const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Aleatoriedade determinística: rodar o seed duas vezes gera os mesmos dados
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const pick = <T>(arr: readonly T[]): T =>
  arr[Math.floor(rand() * arr.length)] as T;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type OperatorKey = "OPERADOR" | "OPERADOR2" | "OPERADOR3";
type UserMap = Record<string, { id: string }>;

const idOf = (users: UserMap, key: string): string => {
  const u = users[key];
  if (!u) throw new Error(`Usuário ${key} não encontrado no seed`);
  return u.id;
};

const TRIAGEM: TrackingStatus[] = ["EM_TRIAGEM"];
const DESMONTE: TrackingStatus[] = [
  "EM_TRIAGEM",
  "AGUARDANDO_DESMONTE",
  "EM_DESMONTE",
];
const PATH: Record<TrackingStatus, TrackingStatus[]> = {
  AGUARDANDO_TRIAGEM: [],
  EM_TRIAGEM: TRIAGEM,
  AGUARDANDO_DESMONTE: ["EM_TRIAGEM", "AGUARDANDO_DESMONTE"],
  EM_DESMONTE: DESMONTE,
  PECAS_REAPROVEITADAS: [...DESMONTE, "PECAS_REAPROVEITADAS"],
  MATERIAL_RECICLAVEL: [...DESMONTE, "MATERIAL_RECICLAVEL"],
  DESCARTE_SEGURO: ["EM_TRIAGEM", "DESCARTE_SEGURO"],
  BAIXA_DEFINITIVA: ["EM_TRIAGEM", "DESCARTE_SEGURO", "BAIXA_DEFINITIVA"],
};

type EquipmentSeed = {
  type: EquipmentType;
  brand: string;
  model: string;
  year: number;
  state: PhysicalState;
  weight: number;
  status: TrackingStatus;
  drop?: { from: PhysicalState; justification: string };
};

type MovementSeed = {
  origin: string;
  destination: string;
  fromStatus: TrackingStatus;
  toStatus: TrackingStatus;
  performedById: string;
  performedAt: Date;
  fromPhysicalState?: PhysicalState;
  toPhysicalState?: PhysicalState;
  justification?: string;
};

type TriageSeed = {
  operator: OperatorKey;
  startOffsetDays: number; // dias após a entrada do lote
  durationDays?: number; // sem valor = triagem ainda em andamento
};

type BatchSeed = {
  invoice: string;
  carrier: string;
  status: BatchStatus;
  enteredDaysAgo: number;
  obs?: string;
  deactivate?: boolean;
  triage?: TriageSeed;
  equipments: EquipmentSeed[];
};

// ---------------------------------------------------------------------------
// Valor estimado de recuperação (rentabilidade)
// ---------------------------------------------------------------------------
const BASE_VALUE: Record<EquipmentType, number> = {
  COMPUTADOR_MESA: 450,
  NOTEBOOK: 600,
  MONITOR: 200,
  IMPRESSORA: 150,
  SERVIDOR: 1500,
  ROTEADOR: 80,
  CABO_ESTRUTURADO: 60,
  FONTE_ALIMENTACAO: 70,
};

const STATE_FACTOR: Record<PhysicalState, number> = {
  NOVO: 1,
  BOM_ESTADO: 0.8,
  USADO_LEVE: 0.65,
  USADO_MODERADO: 0.5,
  DANIFICADO_LEVE: 0.3,
  DANIFICADO_GRAVE: 0.15,
  INSERVIVEL: 0.05,
};

const PREMIUM_BRANDS = new Set(["Dell", "HP", "HPE", "Lenovo", "Cisco", "IBM"]);

function estimateValue(
  e: Pick<EquipmentSeed, "type" | "brand" | "year" | "state">,
): number {
  const age = Math.max(0, CURRENT_YEAR - e.year);
  const ageFactor = Math.max(0.5, 1 - age * 0.02);
  const brandFactor = PREMIUM_BRANDS.has(e.brand) ? 1.15 : 1;
  const noise = 0.92 + rand() * 0.16; // variação de ±8%
  const value =
    BASE_VALUE[e.type] *
    STATE_FACTOR[e.state] *
    ageFactor *
    brandFactor *
    noise;
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Histórico gerado (eficiência por operador/mês e vida útil por tipo)
// ---------------------------------------------------------------------------
// nota 0..6 -> estado físico (6 = NOVO, 0 = INSERVIVEL)
const STATES_BY_SCORE: readonly PhysicalState[] = [
  "INSERVIVEL",
  "DANIFICADO_GRAVE",
  "DANIFICADO_LEVE",
  "USADO_MODERADO",
  "USADO_LEVE",
  "BOM_ESTADO",
  "NOVO",
];

// k = perda de "nota" por ano; vida útil teórica = 6 / k anos
const LIFESPAN_PROFILES: {
  type: EquipmentType;
  k: number;
  maxAge: number;
  items: { brand: string; model: string; weight: number }[];
}[] = [
  {
    type: "NOTEBOOK",
    k: 0.6,
    maxAge: 11,
    items: [
      { brand: "Dell", model: "Latitude 5420", weight: 1.65 },
      { brand: "Lenovo", model: "ThinkPad T480", weight: 1.9 },
      { brand: "Acer", model: "Aspire 5", weight: 2.1 },
    ],
  },
  {
    type: "COMPUTADOR_MESA",
    k: 0.5,
    maxAge: 13,
    items: [
      { brand: "HP", model: "ProDesk 400", weight: 6.8 },
      { brand: "Dell", model: "OptiPlex 3010", weight: 8.0 },
      { brand: "Positivo", model: "Master D3400", weight: 7.2 },
    ],
  },
  {
    type: "MONITOR",
    k: 0.45,
    maxAge: 14,
    items: [
      { brand: "LG", model: "24MK430H", weight: 3.2 },
      { brand: "Samsung", model: "S22F350", weight: 3.6 },
      { brand: "Dell", model: "P2419H", weight: 3.8 },
    ],
  },
  {
    type: "IMPRESSORA",
    k: 0.7,
    maxAge: 9,
    items: [
      { brand: "Epson", model: "L3150", weight: 4.1 },
      { brand: "HP", model: "LaserJet P1102", weight: 5.3 },
      { brand: "Brother", model: "HL-1202", weight: 4.6 },
    ],
  },
  {
    type: "SERVIDOR",
    k: 0.55,
    maxAge: 12,
    items: [
      { brand: "Dell", model: "PowerEdge R340", weight: 14.5 },
      { brand: "HPE", model: "ProLiant DL360", weight: 16.8 },
      { brand: "IBM", model: "System x3550", weight: 15.2 },
    ],
  },
];

// dias médios de triagem por operador (para a comparação de eficiência)
const BASE_TRIAGE_DAYS: Record<OperatorKey, number> = {
  OPERADOR: 2.5,
  OPERADOR2: 4,
  OPERADOR3: 6,
};
const OPERATORS: OperatorKey[] = ["OPERADOR", "OPERADOR2", "OPERADOR3"];

function statusFor(state: PhysicalState): TrackingStatus {
  if (state === "INSERVIVEL") return "BAIXA_DEFINITIVA";
  if (state === "DANIFICADO_GRAVE")
    return pick(["PECAS_REAPROVEITADAS", "DESCARTE_SEGURO"] as const);
  return pick(["PECAS_REAPROVEITADAS", "MATERIAL_RECICLAVEL"] as const);
}

// 12 lotes x 5 equipamentos = 60 equipamentos (12 de cada tipo)
function buildHistoricalBatches(): { orgSlot: number; batch: BatchSeed }[] {
  const result: { orgSlot: number; batch: BatchSeed }[] = [];

  for (let i = 0; i < 12; i++) {
    // o banco rejeita lotes com entrada anterior a 90 dias: ficamos em <= 74
    const enteredDaysAgo = 6 + i * 6 + Math.floor(rand() * 3);

    // período mais antigo foi o mais movimentado (triagem mais lenta)
    const seasonal =
      enteredDaysAgo >= 50 ? 1.6 : enteredDaysAgo >= 30 ? 1.2 : 1;

    const operator = OPERATORS[i % 3] as OperatorKey;
    const durationDays =
      Math.round(
        BASE_TRIAGE_DAYS[operator] * seasonal * (0.8 + rand() * 0.4) * 10,
      ) / 10;

    const equipments: EquipmentSeed[] = LIFESPAN_PROFILES.map((p) => {
      const age = 1 + Math.floor(rand() * p.maxAge);
      const score = 6 - age * p.k + (rand() - 0.5) * 1.2;
      const idx = Math.min(6, Math.max(0, Math.round(score)));
      const state = STATES_BY_SCORE[idx] as PhysicalState;
      const item = pick(p.items);

      const equipment: EquipmentSeed = {
        type: p.type,
        brand: item.brand,
        model: item.model,
        year: CURRENT_YEAR - age,
        state,
        weight: item.weight,
        status: statusFor(state),
      };
      if (state === "INSERVIVEL") {
        equipment.drop = {
          from: "DANIFICADO_GRAVE",
          justification: "Falha no componente principal, sem reparo viável",
        };
      }
      return equipment;
    });

    result.push({
      orgSlot: i % 4,
      batch: {
        invoice: `NF-HIST-${String(i + 1).padStart(3, "0")}`,
        carrier: i % 2 === 0 ? "TransVerde Logística" : "Rápido Express",
        status:
          i === 0
            ? "TRIAGEM_CONCLUIDA"
            : i === 1
              ? "ENCAMINHADO"
              : "FINALIZADO",
        enteredDaysAgo,
        obs: "Lote histórico gerado pelo seed",
        triage: { operator, startOffsetDays: 0.5 + rand() * 0.5, durationDays },
        equipments,
      },
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------
async function seedUsers(): Promise<UserMap> {
  const list: {
    key: string;
    role: Role;
    username: string;
    email: string;
    pass: string;
  }[] = [
    {
      key: "ADMIN",
      role: "ADMIN",
      username: "Administrador",
      email: ADMIN_EMAIL,
      pass: ADMIN_PASSWORD,
    },
    {
      key: "OPERADOR",
      role: "OPERADOR",
      username: "Olívia Operadora",
      email: "operador@greencode.com",
      pass: USER_PASSWORD,
    },
    {
      key: "OPERADOR2",
      role: "OPERADOR",
      username: "Otávio Operador",
      email: "operador2@greencode.com",
      pass: USER_PASSWORD,
    },
    {
      key: "OPERADOR3",
      role: "OPERADOR",
      username: "Paula Operadora",
      email: "operador3@greencode.com",
      pass: USER_PASSWORD,
    },
    {
      key: "GESTOR",
      role: "GESTOR",
      username: "Gabriel Gestor",
      email: "gestor@greencode.com",
      pass: USER_PASSWORD,
    },
    {
      key: "AUDITOR",
      role: "AUDITOR",
      username: "Alice Auditora",
      email: "auditor@greencode.com",
      pass: USER_PASSWORD,
    },
  ];

  const users: UserMap = {};

  for (const u of list) {
    const admin = users["ADMIN"];
    users[u.key] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        username: u.username,
        email: u.email,
        passwordHash: await bcrypt.hash(u.pass, 10),
        role: u.role,
        ...(admin && { createdById: admin.id }),
      },
      select: { id: true },
    });
  }

  return users;
}

async function seedSettings(adminId: string) {
  const existing = await prisma.systemSetting.findFirst();
  if (existing) return;
  await prisma.systemSetting.create({
    data: { taxRate: 10, depreciationRate: 15, updatedById: adminId },
  });
}

async function seedOrganization(
  adminId: string,
  org: {
    name: string;
    cnpj: string;
    email: string;
    city: string;
    uf: string;
    contract?: { signedDaysAgo: number; expiresInDays: number; value: number };
  },
) {
  const { contract, ...data } = org;

  const created = await prisma.organization.upsert({
    where: { cnpj: org.cnpj },
    update: {},
    create: {
      ...data,
      stateRegistration: "123456789",
      phoneNumber: "(11) 4002-8922",
      cep: "01310-100",
      publicPlace: "Avenida Paulista",
      number: "1000",
      neighbourhood: "Bela Vista",
      createdById: adminId,
    },
    select: { id: true },
  });

  if (contract) {
    await prisma.contract.upsert({
      where: { orgId: created.id },
      update: {},
      create: {
        orgId: created.id,
        signedAt: daysAgo(contract.signedDaysAgo),
        expiresAt:
          contract.expiresInDays >= 0
            ? daysAhead(contract.expiresInDays)
            : daysAgo(-contract.expiresInDays),
        clauses: [
          { title: "Coleta", description: "Coleta semanal de equipamentos" },
          {
            title: "Certificação",
            description: "Emissão de certificado de destinação",
          },
        ],
        monthlyValue: contract.value,
        autoRenewal: contract.expiresInDays >= 0,
        createdById: adminId,
      },
    });
  }

  return created.id;
}

async function seedBatch(
  orgId: string,
  b: BatchSeed,
  creatorId: string,
  users: UserMap,
) {
  const enteredAt = daysAgo(b.enteredDaysAgo);

  const triageOperatorId = b.triage ? idOf(users, b.triage.operator) : null;
  const performerId = triageOperatorId ?? creatorId;

  const triageStartedAt = b.triage
    ? new Date(enteredAt.getTime() + b.triage.startOffsetDays * DAY)
    : null;
  const triageCompletedAt =
    triageStartedAt && b.triage?.durationDays !== undefined
      ? new Date(triageStartedAt.getTime() + b.triage.durationDays * DAY)
      : null;

  const batch = await prisma.batch.create({
    data: {
      orgId,
      enteredAt,
      invoice: b.invoice,
      carrier: b.carrier,
      status: b.status,
      obs: b.obs,
      createdById: creatorId,
      triageStartedAt,
      triageCompletedAt,
      triageOperatorId,
    },
    select: { id: true },
  });

  const movementBase = triageStartedAt ?? enteredAt;

  for (const [index, e] of b.equipments.entries()) {
    const steps = PATH[e.status];
    let from: TrackingStatus = "AGUARDANDO_TRIAGEM";

    const movements: MovementSeed[] = steps.map((to, i) => {
      const movement: MovementSeed = {
        origin: from,
        destination: to,
        fromStatus: from,
        toStatus: to,
        performedById: performerId,
        performedAt: new Date(
          movementBase.getTime() + (i + 1) * 6 * 60 * 60 * 1000,
        ),
      };
      from = to;
      return movement;
    });

    if (e.drop) {
      movements.push({
        origin: e.status,
        destination: e.status,
        fromStatus: e.status,
        toStatus: e.status,
        performedById: performerId,
        performedAt: new Date(
          movementBase.getTime() + (movements.length + 1) * 6 * 60 * 60 * 1000,
        ),
        fromPhysicalState: e.drop.from,
        toPhysicalState: e.state,
        justification: e.drop.justification,
      });
    }

    await prisma.equipment.create({
      data: {
        batchId: batch.id,
        type: e.type,
        brand: e.brand,
        model: e.model,
        manufacturingYear: e.year,
        physicalState: e.state,
        weightKG: e.weight,
        status: e.status,
        batchPosition: index + 1,
        createdById: creatorId,
        // só tem valor estimado quem já passou pela triagem
        estimatedValue:
          e.status === "AGUARDANDO_TRIAGEM" ? null : estimateValue(e),
        version: movements.length,
        movements: { create: movements },
      },
    });
  }

  if (b.deactivate) {
    await prisma.batch.update({
      where: { id: batch.id },
      data: {
        active: false,
        version: { increment: 1 },
        updatedById: creatorId,
      },
    });
  }
}

async function main() {
  const users = await seedUsers();
  const adminId = idOf(users, "ADMIN");
  const operadorId = idOf(users, "OPERADOR");
  const gestorId = idOf(users, "GESTOR");

  await seedSettings(adminId);

  const orgValida = await seedOrganization(operadorId, {
    name: "EcoTech Soluções Ltda",
    cnpj: "11222333000181",
    email: "contato@ecotech.com.br",
    city: "São Paulo",
    uf: "SP",
    contract: { signedDaysAgo: 120, expiresInDays: 245, value: 8500 },
  });

  const orgVencida = await seedOrganization(operadorId, {
    name: "Reciclar Informática S.A.",
    cnpj: "11444777000161",
    email: "financeiro@reciclar.com.br",
    city: "Campinas",
    uf: "SP",
    contract: { signedDaysAgo: 400, expiresInDays: -30, value: 4200.5 },
  });

  const orgVerde = await seedOrganization(operadorId, {
    name: "Verde Hardware ME",
    cnpj: "45723174000110",
    email: "oi@verdehardware.com.br",
    city: "Curitiba",
    uf: "PR",
  });

  const orgInativa = await seedOrganization(operadorId, {
    name: "Antiga Data Center Ltda",
    cnpj: "06040988000107",
    email: "adm@antigadc.com.br",
    city: "Rio de Janeiro",
    uf: "RJ",
    contract: { signedDaysAgo: 200, expiresInDays: 165, value: 12000 },
  });

  // limpa os lotes das organizações do seed para poder rodar várias vezes
  await prisma.batch.deleteMany({
    where: { orgId: { in: [orgValida, orgVencida, orgVerde, orgInativa] } },
  });

  const lotes: { orgId: string; batch: BatchSeed }[] = [
    {
      orgId: orgValida,
      batch: {
        invoice: "NF-2026-0001",
        carrier: "TransVerde Logística",
        status: "RECEBIDO",
        enteredDaysAgo: 3,
        obs: "Lote recém-chegado, aguardando triagem",
        equipments: [
          {
            type: "NOTEBOOK",
            brand: "Dell",
            model: "Latitude 5420",
            year: 2021,
            state: "BOM_ESTADO",
            weight: 1.65,
            status: "AGUARDANDO_TRIAGEM",
          },
          {
            type: "MONITOR",
            brand: "LG",
            model: "24MK430H",
            year: 2020,
            state: "USADO_LEVE",
            weight: 3.2,
            status: "AGUARDANDO_TRIAGEM",
          },
          {
            type: "COMPUTADOR_MESA",
            brand: "HP",
            model: "ProDesk 400",
            year: 2019,
            state: "USADO_MODERADO",
            weight: 6.8,
            status: "AGUARDANDO_TRIAGEM",
          },
        ],
      },
    },
    {
      orgId: orgValida,
      batch: {
        invoice: "NF-2026-0002",
        carrier: "TransVerde Logística",
        status: "EM_TRIAGEM",
        enteredDaysAgo: 12,
        triage: { operator: "OPERADOR", startOffsetDays: 1 }, // em andamento
        equipments: [
          {
            type: "SERVIDOR",
            brand: "Dell",
            model: "PowerEdge R340",
            year: 2018,
            state: "USADO_MODERADO",
            weight: 14.5,
            status: "EM_TRIAGEM",
          },
          {
            type: "NOTEBOOK",
            brand: "Lenovo",
            model: "ThinkPad T480",
            year: 2018,
            state: "DANIFICADO_GRAVE",
            weight: 1.9,
            status: "EM_TRIAGEM",
            drop: {
              from: "BOM_ESTADO",
              justification:
                "Placa-mãe com oxidação severa por contato com líquido",
            },
          },
          {
            type: "IMPRESSORA",
            brand: "Epson",
            model: "L3150",
            year: 2019,
            state: "USADO_LEVE",
            weight: 4.1,
            status: "AGUARDANDO_DESMONTE",
          },
          {
            type: "ROTEADOR",
            brand: "TP-Link",
            model: "Archer C6",
            year: 2022,
            state: "BOM_ESTADO",
            weight: 0.4,
            status: "EM_TRIAGEM",
          },
        ],
      },
    },
    {
      orgId: orgValida,
      batch: {
        invoice: "NF-2026-0003",
        carrier: "Rápido Express",
        status: "TRIAGEM_CONCLUIDA",
        enteredDaysAgo: 25,
        triage: {
          operator: "OPERADOR2",
          startOffsetDays: 1,
          durationDays: 3.5,
        },
        equipments: [
          {
            type: "COMPUTADOR_MESA",
            brand: "Positivo",
            model: "Master D3400",
            year: 2017,
            state: "USADO_MODERADO",
            weight: 7.2,
            status: "AGUARDANDO_DESMONTE",
          },
          {
            type: "MONITOR",
            brand: "Samsung",
            model: "S22F350",
            year: 2016,
            state: "DANIFICADO_LEVE",
            weight: 3.6,
            status: "AGUARDANDO_DESMONTE",
          },
          {
            type: "FONTE_ALIMENTACAO",
            brand: "Corsair",
            model: "CV550",
            year: 2018,
            state: "INSERVIVEL",
            weight: 1.2,
            status: "DESCARTE_SEGURO",
            drop: {
              from: "USADO_LEVE",
              justification: "Capacitores estufados, risco de incêndio",
            },
          },
        ],
      },
    },
    {
      orgId: orgValida,
      batch: {
        invoice: "NF-2026-0004",
        carrier: "Rápido Express",
        status: "ENCAMINHADO",
        enteredDaysAgo: 45,
        obs: "Encaminhado para a recicladora parceira",
        triage: { operator: "OPERADOR3", startOffsetDays: 1, durationDays: 6 },
        equipments: [
          {
            type: "NOTEBOOK",
            brand: "Acer",
            model: "Aspire 5",
            year: 2017,
            state: "DANIFICADO_LEVE",
            weight: 2.1,
            status: "EM_DESMONTE",
          },
          {
            type: "SERVIDOR",
            brand: "HPE",
            model: "ProLiant DL360",
            year: 2015,
            state: "USADO_MODERADO",
            weight: 16.8,
            status: "PECAS_REAPROVEITADAS",
          },
          {
            type: "CABO_ESTRUTURADO",
            brand: "Furukawa",
            model: "Cat6 (rolo)",
            year: 2014,
            state: "USADO_LEVE",
            weight: 9.5,
            status: "MATERIAL_RECICLAVEL",
          },
        ],
      },
    },
    {
      orgId: orgVencida,
      batch: {
        invoice: "NF-2026-0101",
        carrier: "EcoLog Transportes",
        status: "FINALIZADO",
        enteredDaysAgo: 80,
        obs: "Lote concluído (contrato da organização já vencido)",
        triage: { operator: "OPERADOR", startOffsetDays: 1, durationDays: 2.5 },
        equipments: [
          {
            type: "IMPRESSORA",
            brand: "HP",
            model: "LaserJet P1102",
            year: 2013,
            state: "INSERVIVEL",
            weight: 5.3,
            status: "BAIXA_DEFINITIVA",
            drop: {
              from: "USADO_MODERADO",
              justification: "Unidade de imagem queimada, sem reparo",
            },
          },
          {
            type: "COMPUTADOR_MESA",
            brand: "Dell",
            model: "OptiPlex 3010",
            year: 2012,
            state: "DANIFICADO_GRAVE",
            weight: 8.0,
            status: "PECAS_REAPROVEITADAS",
          },
        ],
      },
    },
    {
      orgId: orgInativa,
      batch: {
        invoice: "NF-2026-0201",
        carrier: "EcoLog Transportes",
        status: "RECEBIDO",
        enteredDaysAgo: 60,
        obs: "Lote inativado junto com a organização",
        deactivate: true,
        equipments: [
          {
            type: "SERVIDOR",
            brand: "IBM",
            model: "System x3550",
            year: 2014,
            state: "USADO_MODERADO",
            weight: 15.2,
            status: "AGUARDANDO_TRIAGEM",
          },
          {
            type: "ROTEADOR",
            brand: "Cisco",
            model: "RV340",
            year: 2019,
            state: "BOM_ESTADO",
            weight: 1.1,
            status: "AGUARDANDO_TRIAGEM",
          },
        ],
      },
    },
  ];

  // histórico gerado: dá massa de dados às três análises
  const orgSlots = [orgValida, orgValida, orgVencida, orgVerde];
  for (const { orgSlot, batch } of buildHistoricalBatches()) {
    lotes.push({ orgId: orgSlots[orgSlot] as string, batch });
  }

  for (const { orgId, batch } of lotes) {
    await seedBatch(orgId, batch, gestorId, users);
  }

  await prisma.organization.update({
    where: { id: orgInativa },
    data: { active: false, version: { increment: 1 }, updatedById: adminId },
  });

  const [orgs, batches, equipments, movements, withValue, triaged] =
    await Promise.all([
      prisma.organization.count(),
      prisma.batch.count(),
      prisma.equipment.count(),
      prisma.movement.count(),
      prisma.equipment.count({ where: { estimatedValue: { not: null } } }),
      prisma.batch.count({ where: { triageCompletedAt: { not: null } } }),
    ]);

  console.log("Seed concluído:");
  console.log(
    `  usuários: ADMIN, 3 OPERADORES, GESTOR, AUDITOR (senha demo: ${USER_PASSWORD})`,
  );
  console.log(
    `  ${orgs} organizações, ${batches} lotes (${triaged} com triagem concluída), ${equipments} equipamentos (${withValue} com valor estimado), ${movements} movimentações`,
  );
  console.log(`  login admin: ${ADMIN_EMAIL}`);
}

main()
  .catch((e) => {
    console.error("Falha ao executar o seed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
