import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { calculate, CalculationInput, AgeCategory, EngineCategory } from "../services/calculator";
import { getRates } from "../services/currencyService";
import { formatCurrencyRange, formatCurrencyRounded, formatRub, round } from "../utils/format";
import { saveHistory } from "../services/historyService";
import { getDeliveryConfig } from "../services/deliveryConfigService";
import { upsertUser } from "../services/userService";

type Step = "price" | "age" | "engineType" | "volume" | "power" | "done";

interface InputDraft extends Partial<CalculationInput> {
  price?: number;
  currency?: "JPY" | "USD" | "EUR" | "RUB";
  age?: AgeCategory;
  engineType?: EngineCategory;
  engineVolume?: number;
  horsepower?: number;
}

export interface SessionData {
  step: Step;
  input: InputDraft;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export function registerBot(bot: Bot<MyContext>) {
  bot.use(
    session({
      initial: (): SessionData => ({ step: "done", input: {} }),
    })
  );

  bot.command("start", async (ctx) => {
    await upsertUser(ctx.from);
    ctx.session.step = "price";
    ctx.session.input = {};
    await ctx.reply(
      "Привет, Даша! Я помогу рассчитать стоимость ввоза авто из Японии.\n" +
        "Параметры: цена + валюта, возраст, тип двигателя, объем и мощность.\n" +
        "Пока я научился считать только авто от 3 до 5 лет. 🙄\n" +
        "Но я учусь дальше. Поехали! 🚘"
    );
    await ctx.reply("Введите цену и валюту (например: 2000000 JPY, 15000 USD или 13000 EUR).");
  });

  bot.on("message:text", async (ctx) => {
    try {
      await upsertUser(ctx.from);
      switch (ctx.session.step) {
        case "price":
          return await handlePrice(ctx);
        case "age":
          return await handleAge(ctx);
        case "engineType":
          return await handleEngineType(ctx);
        case "volume":
          return await handleVolume(ctx);
        case "power":
          return await handlePower(ctx);
        default:
          await ctx.reply("Наберите /start чтобы начать расчет.");
      }
    } catch (error: any) {
      console.error(error);
      await ctx.reply("Произошла ошибка при обработке. Попробуйте еще раз или начните с /start.");
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    try {
      await upsertUser(ctx.from);
      const data = ctx.callbackQuery.data;
      if (data.startsWith("age:")) {
        await handleAgeSelection(ctx, data);
      } else if (data.startsWith("engine:")) {
        await handleEngineSelection(ctx, data);
      } else {
        await ctx.answerCallbackQuery();
      }
    } catch (error) {
      console.error(error);
      await ctx.answerCallbackQuery({ text: "Ошибка, попробуйте еще раз", show_alert: true });
    }
  });
}

async function handlePrice(ctx: MyContext) {
  const parsed = parsePrice(ctx.message?.text ?? "");
  if (!parsed) {
    return ctx.reply("Не могу распознать цену. Пример: 2000000 JPY или 15000 USD.");
  }
  ctx.session.input.price = parsed.amount;
  ctx.session.input.currency = parsed.currency;
  ctx.session.step = "age";
  const kb = new InlineKeyboard()
    .text("До 3 лет", "age:under3")
    .text("❗️3–5 лет", "age:3to5")
    .row()
    .text("Более 5 лет", "age:over5");
  return ctx.reply("Возраст авто?", { reply_markup: kb });
}

async function handleAge(ctx: MyContext) {
  const value = ctx.message?.text?.trim();
  const age = parseAge(value ?? "");
  if (!age) {
    return ctx.reply("Укажите возраст: 1 — до 3 лет, 2 — 3–5 лет, 3 — более 5 лет.");
  }
  ctx.session.input.age = age;
  ctx.session.step = "engineType";
  const kb = new InlineKeyboard().text("Бензин/Дизель", "engine:ICE").text("Электро/Гибрид", "engine:EV");
  return ctx.reply("Тип двигателя?", { reply_markup: kb });
}

async function handleEngineType(ctx: MyContext) {
  const value = ctx.message?.text?.trim();
  const engineType = parseEngineType(value ?? "");
  if (!engineType) {
    return ctx.reply("Укажите тип двигателя: 1 — Бензин/Дизель, 2 — Электро/Гибрид.");
  }
  ctx.session.input.engineType = engineType;
  ctx.session.step = "volume";
  return ctx.reply("Объем двигателя в см³ (целое число).");
}

async function handleVolume(ctx: MyContext) {
  const value = Number(ctx.message?.text?.replace(",", "."));
  if (!value || value <= 0) {
    return ctx.reply("Введите объем двигателя в см³, например: 1800.");
  }
  ctx.session.input.engineVolume = Math.round(value);
  ctx.session.step = "power";
  return ctx.reply("Мощность двигателя в л.с. (целое число).");
}

async function handlePower(ctx: MyContext) {
  const value = Number(ctx.message?.text?.replace(",", "."));
  if (!value || value <= 0) {
    return ctx.reply("Введите мощность двигателя в л.с., например: 150.");
  }
  ctx.session.input.horsepower = Math.round(value);
  ctx.session.step = "done";

  const input = ctx.session.input;
  if (!isInputComplete(input)) {
    ctx.session.step = "price";
    return ctx.reply("Не все данные получены. Начните заново командой /start.");
  }

  if (input.age !== "3to5") {
    return ctx.reply("Пока поддерживается расчет только для авто 3–5 лет. Попробуйте другое значение.");
  }

  await ctx.reply("Считаю по актуальному курсу ЦБ...");

  const rates = await getRates();
  const deliveryConfig = await getDeliveryConfig();
  const result = calculate(input, rates, deliveryConfig);
  const userId = ctx.from?.id ? String(ctx.from.id) : "anonymous";
  await saveHistory(userId, input, result);

  const dutyRubText = `${round(result.breakdown.dutyEur, 0)} € ≈ ${formatRub(result.breakdown.dutyRub)}`;
  const delivery = result.breakdown.deliveryDetails;
  const deliveryTotalAvg = (delivery.totalMin + delivery.totalMax) / 2;

  const response =
    `💰 Итоговая стоимость: ~${formatRub(result.total)}\n` +
    `— Цена авто: ${input.price} ${input.currency} ≈ ${formatRub(result.breakdown.priceRub)}\n` +
    `— Пошлина: ${dutyRubText}\n` +
    `— Таможенный сбор: ${formatRub(result.breakdown.feeRub)}\n` +
    `— Утилизационный сбор: ${formatRub(result.breakdown.recyclingRub)}\n` +
    `— Доставка и оформление: ~${formatCurrencyRounded(deliveryTotalAvg)} ₽\n` +
    `   Расходы по Японии: ~${formatCurrencyRounded(delivery.jpExpensesRub)} ₽\n` +
    `   Фрахт во Владивосток: ~${formatCurrencyRounded(delivery.freightRub)} ₽\n` +
    `   Расходы по оформлению в РФ: ${formatCurrencyRange(
      delivery.ruProcessingMinRub,
      delivery.ruProcessingMaxRub
    )} ₽\n` +
    `   Комиссия компании: ${formatCurrencyRange(delivery.companyFeeMinRub, delivery.companyFeeMaxRub)} ₽`;

  return ctx.reply(response);
}

function parsePrice(text: string):
  | {
      amount: number;
      currency: "JPY" | "USD" | "EUR" | "RUB";
    }
  | null {
  const match = text.trim().toUpperCase().match(/([\d\s.,]+)\s*(JPY|USD|EUR|RUB)/);
  if (!match) return null;
  const raw = match[1].replace(/\s+/g, "").replace(",", ".");
  const amount = Number(raw);
  const currency = match[2] as "JPY" | "USD" | "EUR" | "RUB";
  if (!amount || amount <= 0) return null;
  return { amount, currency };
}

async function handleAgeSelection(ctx: MyContext, data: string) {
  const age = data.replace("age:", "") as AgeCategory;
  if (!["under3", "3to5", "over5"].includes(age)) {
    await ctx.answerCallbackQuery({ text: "Некорректный выбор" });
    return;
  }
  ctx.session.input.age = age;
  ctx.session.step = "engineType";
  await ctx.answerCallbackQuery({ text: "Возраст выбран" });
  const kb = new InlineKeyboard().text("Бензин/Дизель", "engine:ICE").text("Электро/Гибрид", "engine:EV");
  await ctx.editMessageText("Тип двигателя?", { reply_markup: kb }).catch(async () => {
    await ctx.reply("Тип двигателя?", { reply_markup: kb });
  });
}

async function handleEngineSelection(ctx: MyContext, data: string) {
  const engineType = data.replace("engine:", "") as EngineCategory;
  if (!["ICE", "EV"].includes(engineType)) {
    await ctx.answerCallbackQuery({ text: "Некорректный выбор" });
    return;
  }
  ctx.session.input.engineType = engineType;
  ctx.session.step = "volume";
  await ctx.answerCallbackQuery({ text: "Тип двигателя выбран" });
  await ctx.editMessageText("Объем двигателя в см³ (целое число).").catch(async () => {
    await ctx.reply("Объем двигателя в см³ (целое число).");
  });
}

function parseAge(value: string): AgeCategory | null {
  if (["1", "ДО 3", "ДО3"].includes(normalize(value))) return "under3";
  if (["2", "3-5", "3–5", "3 5", "3 ДО 5", "3-5 ЛЕТ"].includes(normalize(value))) return "3to5";
  if (["3", "БОЛЕЕ 5", "СТАРШЕ 5", "5+"].includes(normalize(value))) return "over5";
  return null;
}

function parseEngineType(value: string): EngineCategory | null {
  const v = normalize(value);
  if (["1", "БЕНЗИН", "ДИЗЕЛЬ", "ГОРЮЧЕЕ"].includes(v)) return "ICE";
  if (["2", "ЭЛЕКТРО", "ГИБРИД", "ЭЛЕКТРО/ГИБРИД"].includes(v)) return "EV";
  return null;
}

function normalize(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

function isInputComplete(input: InputDraft): input is CalculationInput {
  return (
    typeof input.price === "number" &&
    !!input.currency &&
    !!input.age &&
    !!input.engineType &&
    typeof input.engineVolume === "number" &&
    typeof input.horsepower === "number"
  );
}
