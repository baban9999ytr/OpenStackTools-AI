import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import mongoose from "mongoose";
import { Assistant } from "./models/index.js";
import authRoutes from "./routes/auth.js";
import organizationRoutes from "./routes/organizations.js";
import assistantRoutes from "./routes/assistants.js";
import conversationRoutes from "./routes/conversations.js";
import { widgetRoutes } from "./routes/widget.js";
import { generalLimit } from "./middleware/limits.js";
import { requireDashboardOrigin } from "./middleware/security.js";
import { openAIResponder, type AIResponder } from "./services/ai.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

export const createApp = (respond: AIResponder = openAIResponder) => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.trustProxy);
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(generalLimit);
  const dashboardCors = cors({
    origin: env.dashboardOrigin,
    credentials: true,
  });
  const widgetCors = cors({
    origin: async (origin, callback) => {
      if (!origin) {
        callback(null, false);
        return;
      }
      try {
        callback(
          null,
          Boolean(
            await Assistant.exists({ active: true, allowedOrigins: origin }),
          ),
        );
      } catch (error) {
        callback(error as Error);
      }
    },
  });
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());
  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/health/ready", (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "unavailable" });
  });
  app.use("/api/auth", dashboardCors, requireDashboardOrigin, authRoutes);
  app.use(
    "/api/organizations",
    dashboardCors,
    requireDashboardOrigin,
    organizationRoutes,
    assistantRoutes,
    conversationRoutes,
  );
  app.use("/api/widget", widgetCors, widgetRoutes(respond));
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  const onError: ErrorRequestHandler = (error, req, res, _next) => {
    req.log.error({ err: error }, "API request failed");
    if (res.headersSent) return;
    if (error?.code === 11000) {
      res.status(409).json({ error: "Resource already exists" });
      return;
    }
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "Request too large" });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Malformed JSON" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);
  return app;
};
