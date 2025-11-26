import { CurrencyRates, SupportedCurrency, convertToRub } from "./currencyService";
import { DeliveryConfigDoc } from "./models";

export type AgeCategory = "under3" | "3to5" | "over5";
export type EngineCategory = "ICE" | "EV";

export interface CalculationInput {
  price: number;
  currency: SupportedCurrency;
  age: AgeCategory;
  engineType: EngineCategory;
  engineVolume: number; // cm3
  horsepower: number;
}

export interface CalculationResult {
  total: number;
  breakdown: {
    priceRub: number;
    dutyRub: number;
    dutyEur: number;
    feeRub: number;
    recyclingRub: number;
    deliveryTotalRub: number;
    deliveryDetails: {
      totalMin: number;
      totalMax: number;
      jpExpensesRub: number;
      freightRub: number;
      ruProcessingMinRub: number;
      ruProcessingMaxRub: number;
      companyFeeMinRub: number;
      companyFeeMaxRub: number;
    };
  };
}

const BASE_UTILIZATION = 20_000;

export function calculate(
  input: CalculationInput,
  rates: CurrencyRates,
  deliveryConfig: DeliveryConfigDoc
): CalculationResult {
  if (input.age !== "3to5") {
    throw new Error("Расчет пока поддерживает только авто 3–5 лет.");
  }

  const priceRub = convertToRub(input.price, input.currency, rates);
  const dutyEur = calcDutyEur(input.engineVolume);
  const dutyRub = convertToRub(dutyEur, "EUR", rates);
  const feeRub = calcCustomsFee(priceRub);
  const recyclingRub = calculateUtilFee({
    ageYears: ageCategoryToYears(input.age),
    powerHp: input.horsepower,
    engineVolumeCc: input.engineVolume,
    personalUse: true,
  });
  const deliveryDetails = calcDelivery(deliveryConfig, rates);

  const deliveryTotalAvg = (deliveryDetails.totalMin + deliveryDetails.totalMax) / 2;
  const total = priceRub + dutyRub + feeRub + recyclingRub + deliveryTotalAvg;

  return {
    total,
    breakdown: {
      priceRub,
      dutyRub,
      dutyEur,
      feeRub,
      recyclingRub,
      deliveryTotalRub: deliveryTotalAvg,
      deliveryDetails,
    },
  };
}

function calcDutyEur(engineVolume: number): number {
  if (engineVolume <= 1000) return 1.5 * engineVolume;
  if (engineVolume <= 1500) return 1.7 * engineVolume;
  if (engineVolume <= 1800) return 2.5 * engineVolume;
  if (engineVolume <= 2300) return 2.7 * engineVolume;
  if (engineVolume <= 3000) return 3.0 * engineVolume;
  return 3.6 * engineVolume;
}

function calcCustomsFee(declaredValueRub: number): number {
  if (declaredValueRub <= 200_000) return 1_067;
  if (declaredValueRub <= 450_000) return 2_134;
  if (declaredValueRub <= 1_200_000) return 4_269;
  if (declaredValueRub <= 2_700_000) return 11_746;
  if (declaredValueRub <= 5_000_000) return 23_491;
  if (declaredValueRub <= 10_000_000) return 46_982;
  return 93_965;
}

function calcRecycling(horsepower: number, age: AgeCategory): number {
  // Deprecated: replaced by calculateUtilFee with detailed coefficients.
  return BASE_UTILIZATION * 0.26;
}

function calcDelivery(config: DeliveryConfigDoc, rates: CurrencyRates) {
  const jpExpensesRub = convertToRub(config.jpExpensesYen, "JPY", rates);
  const freightRub = convertToRub(config.freightUsd, "USD", rates);
  const ruProcessingMinRub = config.ruProcessingMinRub;
  const ruProcessingMaxRub = config.ruProcessingMaxRub;
  const companyFeeMinRub = config.companyFeeMinRub;
  const companyFeeMaxRub = config.companyFeeMaxRub;

  const totalMin = jpExpensesRub + freightRub + ruProcessingMinRub + companyFeeMinRub;
  const totalMax = jpExpensesRub + freightRub + ruProcessingMaxRub + companyFeeMaxRub;

  return {
    totalMin,
    totalMax,
    jpExpensesRub,
    freightRub,
    ruProcessingMinRub,
    ruProcessingMaxRub,
    companyFeeMinRub,
    companyFeeMaxRub,
  };
}

function calculateUtilFee(params: {
  ageYears: number;
  powerHp: number;
  engineVolumeCc: number;
  personalUse: boolean;
}): number {
  const { ageYears, powerHp, engineVolumeCc, personalUse } = params;
  const BASE = BASE_UTILIZATION;

  if (!personalUse) {
    // TODO: commercial cases not implemented; fallback to default coefficient.
  }

  if (powerHp <= 160) {
    if (ageYears <= 3) return 3_400; // BASE * 0.17
    return 5_200; // BASE * 0.26
  }

  if (engineVolumeCc <= 2000 && ageYears > 3) {
    const K = 62.2;
    return Math.round(BASE * K);
  }

  if (engineVolumeCc <= 2000 && ageYears <= 3) {
    const K = 37.5;
    return Math.round(BASE * K);
  }

  // TODO: handle other displacement/age combos precisely.
  const DEFAULT_K = 62.2;
  return Math.round(BASE * DEFAULT_K);
}

function ageCategoryToYears(age: AgeCategory): number {
  if (age === "under3") return 3;
  if (age === "3to5") return 4; // representative age inside 3–5 bracket
  return 6;
}
