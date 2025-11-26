import { User } from "./models";
import { User as TelegramUser } from "grammy/out/platform.node";

export async function upsertUser(user?: TelegramUser) {
  if (!user) return;
  await User.findOneAndUpdate(
    { userId: String(user.id) },
    {
      userId: String(user.id),
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
