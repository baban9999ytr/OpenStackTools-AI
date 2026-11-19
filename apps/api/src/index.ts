import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger, safeError } from "./config/logger.js";
import { startWidgetWorker } from "./services/widget-queue.js";
import { openAIResponder } from "./services/ai.js";
import { startRetentionWorker } from "./services/retention.js";
import { startTelegramDeliveryWorker } from "./services/channels/telegram-service.js";
try {
  await mongoose.connect(env.mongoUrl);
  const stopWorker = startWidgetWorker(openAIResponder);
  const stopRetention = startRetentionWorker();
  const stopTelegram = startTelegramDeliveryWorker();
  const server = createApp().listen(env.port, () =>
    logger.info({ port: env.port }, "API listening"),
  );
  server.requestTimeout = 45_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.timeout = 65_000;
  const shutdown = () => {
    stopWorker();
    stopRetention();
    stopTelegram();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  logger.fatal({ failure: safeError(error) }, "Startup failed");
  process.exitCode = 1;
}
