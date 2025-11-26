import { DeliveryConfig, DeliveryConfigDoc } from "./models";

const defaults = {
  jpExpensesYen: 241000,
  freightUsd: 300,
  ruProcessingMinRub: 60000,
  ruProcessingMaxRub: 100000,
  companyFeeMinRub: 50000,
  companyFeeMaxRub: 100000,
};

export async function getDeliveryConfig(): Promise<DeliveryConfigDoc> {
  let config = await DeliveryConfig.findOne();
  if (!config) {
    config = await DeliveryConfig.create(defaults);
  }
  return config;
}
