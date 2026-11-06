import express, { type ErrorRequestHandler } from "express";
import { randomUUID } from "node:crypto";
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
import { logger, safeError } from "./config/logger.js";
import { auditStaffMutation } from "./middleware/audit.js";
import operationsRoutes from "./routes/operations.js";

export const createApp = (respond: AIResponder = openAIResponder) => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.trustProxy);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader("X-Request-ID", id);
        return id;
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, path: req.url?.split("?")[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
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
  app.use(generalLimit);
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api/auth", dashboardCors, requireDashboardOrigin, authRoutes);
  app.use(
    "/api/organizations",
    dashboardCors,
    requireDashboardOrigin,
    auditStaffMutation,
    organizationRoutes,
    operationsRoutes,
    assistantRoutes,
    conversationRoutes,
  );
  app.use("/api/widget", widgetCors, widgetRoutes(respond));
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  const onError: ErrorRequestHandler = (error, req, res, _next) => {
    req.log.error({ failure: safeError(error) }, "API request failed");
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
