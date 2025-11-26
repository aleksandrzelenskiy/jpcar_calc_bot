import { History } from "./models";
import { CalculationInput, CalculationResult } from "./calculator";

export async function saveHistory(userId: string, input: CalculationInput, result: CalculationResult) {
  await History.create({
    userId,
    input,
    result: {
      totalRub: result.total,
      breakdown: result.breakdown,
    },
  });
}
