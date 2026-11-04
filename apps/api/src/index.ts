import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { startWidgetWorker } from "./services/widget-queue.js";
import { openAIResponder } from "./services/ai.js";
try {
  await mongoose.connect(env.mongoUrl);
  const stopWorker = startWidgetWorker(openAIResponder);
  const server = createApp().listen(env.port, () =>
    logger.info({ port: env.port }, "API listening"),
  );
  const shutdown = () => {
    stopWorker();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  logger.fatal({ err: error }, "Startup failed");
  process.exitCode = 1;
}
