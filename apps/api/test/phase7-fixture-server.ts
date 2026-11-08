// Local HTTPS integration fixture. This is never the normal API entry point.
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { startWidgetWorker } from "../src/services/widget-queue.js";
import type { AIResponder } from "../src/services/ai.js";

if (process.env.PHASE7_SYNTHETIC_FIXTURE !== "1" ||
    process.env.DASHBOARD_ORIGIN !== "https://ai.localhost" ||
    !process.env.OPENAI_API_KEY?.startsWith("local-")) {
  throw new Error("Synthetic fixture requires the local HTTPS origin and inert provider key");
}

const respond: AIResponder = async (_instructions, history) => {
  const latest = history.at(-1)?.text ?? "";
  if (latest === "P7:timeout") throw new Error("Synthetic provider timeout");
  if (latest === "P7:plain") return { text: "Synthetic receptionist reply", inputTokens: 20, outputTokens: 8 };
  if (!latest.startsWith("P7:")) return { text: "Synthetic fixture accepts only P7 commands", inputTokens: 20, outputTokens: 8 };
  const call = JSON.parse(latest.slice(3)) as { name: string; arguments: unknown };
  return { text: "", action: call, inputTokens: 20, outputTokens: 8 };
};

await mongoose.connect(env.mongoUrl);
const stopWorker = startWidgetWorker(respond);
const server = createApp(respond).listen(env.port);
server.requestTimeout = 45_000;
server.headersTimeout = 10_000;
const shutdown = () => {
  stopWorker();
  server.close(async () => { await mongoose.disconnect(); process.exit(0); });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
