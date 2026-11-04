import type { RequestHandler } from "express";
import { AuditEvent } from "../models/index.js";
import { logger } from "../config/logger.js";

export const auditStaffMutation: RequestHandler = (req, res, next) => {
  if (
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    !req.path.endsWith("/tenant")
  ) {
    res.once("finish", () => {
      if (
        !res.locals.organizationId ||
        !res.locals.userId ||
        res.statusCode >= 400
      )
        return;
      void AuditEvent.create({
        organizationId: res.locals.organizationId,
        actorId: res.locals.userId,
        action: req.method,
        target: req.path,
        result: res.statusCode,
      }).catch((error) =>
        logger.error({ err: error }, "Staff audit write failed"),
      );
    });
  }
  next();
};
