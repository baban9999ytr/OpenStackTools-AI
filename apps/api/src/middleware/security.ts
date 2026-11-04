import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import {
  Membership,
  Session,
  WidgetSession,
  type roles,
} from "../models/index.js";
import { tokenHash } from "../services/tokens.js";
import { env } from "../config/env.js";

export const cookieName = "ost_session";
export const cookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "lax" as const,
  path: "/",
};
export const requireDashboardOrigin: RequestHandler = (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    if (req.get("origin") && req.get("origin") !== env.dashboardOrigin) {
      res.status(403).json({ error: "Origin rejected" });
      return;
    }
    next();
    return;
  }
  if (
    req.get("origin") !== env.dashboardOrigin ||
    req.get("x-requested-with") !== "XMLHttpRequest"
  ) {
    res.status(403).json({ error: "Origin rejected" });
    return;
  }
  next();
};
export const requireUser: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[cookieName];
  if (typeof token !== "string") {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const session = await Session.findOne({
    tokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  res.locals.userId = session.userId;
  res.locals.sessionId = session._id;
  next();
};
export type Role = (typeof roles)[number];
export const requireMembership =
  (allowed: Role[]): RequestHandler =>
  async (req, res, next) => {
    const organizationId = req.params.organizationId;
    if (
      typeof organizationId !== "string" ||
      !isValidObjectId(organizationId)
    ) {
      res.status(400).json({ error: "Invalid organization" });
      return;
    }
    const member = await Membership.findOne({
      organizationId,
      userId: res.locals.userId,
    }).lean();
    if (!member || !allowed.includes(member.role as Role)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    res.locals.organizationId = member.organizationId;
    res.locals.role = member.role;
    next();
  };
export const requireWidgetSession: RequestHandler = async (req, res, next) => {
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token || req.get("origin") === undefined) {
    res.status(401).json({ error: "Widget session required" });
    return;
  }
  const session = await WidgetSession.findOne({
    tokenHash: tokenHash(token),
    origin: req.get("origin"),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) {
    res.status(401).json({ error: "Widget session expired" });
    return;
  }
  res.locals.widgetSession = session;
  next();
};
