import dotenv from "dotenv";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing in environment");
}

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing in environment");
}

export const env = {
  botToken: BOT_TOKEN,
  mongoUri: MONGODB_URI,
};
