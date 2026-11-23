import type {
  EquipmentType,
  PhysicalState,
} from "../generated/prisma/enums.js";

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

const PREMIUM_BRANDS = new Set(["dell", "hp", "hpe", "lenovo", "cisco", "ibm"]);
const PREMIUM_BRAND_FACTOR = 1.15;

const CORPORATE_MODEL =
  /(latitude|thinkpad|thinkcentre|elitebook|prodesk|optiplex|poweredge|proliant|system x|catalyst)/i;
const CORPORATE_MODEL_FACTOR = 1.1;

const AGE_LOSS_PER_YEAR = 0.02;
const AGE_FACTOR_FLOOR = 0.5;

export type ValuableEquipment = {
  type: EquipmentType;
  brand: string;
  model: string;
  manufacturingYear: number;
  physicalState: PhysicalState;
};

export function estimateRecoveryValue(
  equipment: ValuableEquipment,
  referenceYear: number = new Date().getFullYear(),
): number {
  const age = Math.max(0, referenceYear - equipment.manufacturingYear);
  const ageFactor = Math.max(AGE_FACTOR_FLOOR, 1 - age * AGE_LOSS_PER_YEAR);

  const brandFactor = PREMIUM_BRANDS.has(equipment.brand.trim().toLowerCase())
    ? PREMIUM_BRAND_FACTOR
    : 1;
  const modelFactor = CORPORATE_MODEL.test(equipment.model)
    ? CORPORATE_MODEL_FACTOR
    : 1;

  const value =
    BASE_VALUE[equipment.type] *
    STATE_FACTOR[equipment.physicalState] *
    ageFactor *
    brandFactor *
    modelFactor;

  return Math.round(value * 100) / 100;
}
