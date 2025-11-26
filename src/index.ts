import { Bot } from "grammy";
import { connectDB } from "./config/db";
import { env } from "./config/env";
import { registerBot, MyContext, SessionData } from "./commands";

async function bootstrap() {
  await connectDB();
  const bot = new Bot<MyContext>(env.botToken);
  registerBot(bot);

  await bot.api.setMyCommands([{ command: "start", description: "Начать расчет стоимости" }]);

  bot.catch((err) => {
    console.error("Bot error", err);
  });

  console.log("Bot is up. Press Ctrl+C to stop.");
  await bot.start();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
