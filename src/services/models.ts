import mongoose, { Document, Model } from "mongoose";

export interface RateCacheDoc extends Document {
  date: string; // YYYY-MM-DD
  rates: Record<string, number>;
  createdAt: Date;
}

const rateCacheSchema = new mongoose.Schema<RateCacheDoc>(
  {
    date: { type: String, unique: true, required: true },
    rates: { type: Map, of: Number, required: true },
  },
  { timestamps: true }
);

export const RateCache: Model<RateCacheDoc> =
  mongoose.models.RateCache || mongoose.model<RateCacheDoc>("RateCache", rateCacheSchema);

export interface DeliveryConfigDoc extends Document {
  jpExpensesYen: number;
  freightUsd: number;
  ruProcessingMinRub: number;
  ruProcessingMaxRub: number;
  companyFeeMinRub: number;
  companyFeeMaxRub: number;
  updatedAt: Date;
}

const deliveryConfigSchema = new mongoose.Schema<DeliveryConfigDoc>(
  {
    jpExpensesYen: { type: Number, required: true, default: 241000 },
    freightUsd: { type: Number, required: true, default: 300 },
    ruProcessingMinRub: { type: Number, required: true, default: 60000 },
    ruProcessingMaxRub: { type: Number, required: true, default: 100000 },
    companyFeeMinRub: { type: Number, required: true, default: 50000 },
    companyFeeMaxRub: { type: Number, required: true, default: 100000 },
  },
  { timestamps: { createdAt: false, updatedAt: true }, collection: "delivery_configs" }
);

export const DeliveryConfig: Model<DeliveryConfigDoc> =
  mongoose.models.DeliveryConfig || mongoose.model<DeliveryConfigDoc>("DeliveryConfig", deliveryConfigSchema);

export interface UserDoc extends Document {
  userId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<UserDoc>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String },
    username: { type: String },
  },
  { timestamps: true, collection: "users" }
);

export const User: Model<UserDoc> =
  mongoose.models.User || mongoose.model<UserDoc>("User", userSchema);

export interface HistoryDoc extends Document {
  userId: string;
  createdAt: Date;
  input: {
    price: number;
    currency: string;
    age: string;
    engineType: string;
    engineVolume: number;
    horsepower: number;
  };
  result: {
    totalRub: number;
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
  };
}

const historySchema = new mongoose.Schema<HistoryDoc>(
  {
    userId: { type: String, index: true, required: true },
    input: {
      price: Number,
      currency: String,
      age: String,
      engineType: String,
      engineVolume: Number,
      horsepower: Number,
    },
    result: {
      totalRub: Number,
      breakdown: {
        priceRub: Number,
        dutyRub: Number,
        dutyEur: Number,
        feeRub: Number,
        recyclingRub: Number,
        deliveryTotalRub: Number,
        deliveryDetails: {
          totalMin: Number,
          totalMax: Number,
          jpExpensesRub: Number,
          freightRub: Number,
          ruProcessingMinRub: Number,
          ruProcessingMaxRub: Number,
          companyFeeMinRub: Number,
          companyFeeMaxRub: Number,
        },
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const History: Model<HistoryDoc> =
  mongoose.models.History || mongoose.model<HistoryDoc>("History", historySchema);
