import mongoose from "mongoose";
import { Organization } from "../models/index.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

await mongoose.connect(env.mongoUrl);
try {
  const daily = await Organization.updateMany(
    { dailyBudgetMicros: { $exists: false } },
    { $set: { dailyBudgetMicros: env.defaultDailyBudgetMicros } },
  );
  const monthly = await Organization.updateMany(
    { monthlyBudgetMicros: { $exists: false } },
    { $set: { monthlyBudgetMicros: env.defaultMonthlyBudgetMicros } },
  );
  logger.info(
    {
      dailyUpdated: daily.modifiedCount,
      monthlyUpdated: monthly.modifiedCount,
    },
    "Pilot budget migration completed",
  );
} finally {
  await mongoose.disconnect();
}
