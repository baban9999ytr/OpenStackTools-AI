import { Router } from "express";
import mongoose from "mongoose";
import { hash, compare } from "bcrypt";
import { z } from "zod";
import { Membership, Organization, Session, User } from "../models/index.js";
import { validate, email, password } from "../middleware/validate.js";
import { authLimit } from "../middleware/limits.js";
import {
  cookieName,
  cookieOptions,
  requireUser,
} from "../middleware/security.js";
import { newToken, tokenHash } from "../services/tokens.js";
import { env } from "../config/env.js";

const router = Router();
const registerInput = z.strictObject({
  organizationName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(1).max(100),
  email,
  password,
});
const loginInput = z.strictObject({ email, password: z.string() });
const sessionMaxAge = 7 * 24 * 60 * 60 * 1000;
const issueSession = async (
  res: import("express").Response,
  userId: mongoose.Types.ObjectId,
) => {
  const token = newToken();
  await Session.create({
    tokenHash: tokenHash(token),
    userId,
    expiresAt: new Date(Date.now() + sessionMaxAge),
  });
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionMaxAge });
};
router.post(
  "/register",
  authLimit,
  validate(registerInput),
  async (req, res) => {
    const { organizationName, name, email, password } = req.body as z.infer<
      typeof registerInput
    >;
    const dbSession = await mongoose.startSession();
    let userId: mongoose.Types.ObjectId | undefined;
    let organizationId: mongoose.Types.ObjectId | undefined;
    try {
      await dbSession.withTransaction(async () => {
        const [user] = await User.create(
          [{ name, email, passwordHash: await hash(password, 12) }],
          { session: dbSession },
        );
        const [organization] = await Organization.create(
          [
            {
              name: organizationName,
              dailyBudgetMicros: env.defaultDailyBudgetMicros,
              monthlyBudgetMicros: env.defaultMonthlyBudgetMicros,
            },
          ],
          { session: dbSession },
        );
        if (!user || !organization) throw new Error("Registration failed");
        await Membership.create(
          [
            {
              organizationId: organization._id,
              userId: user._id,
              role: "owner",
            },
          ],
          { session: dbSession },
        );
        userId = user._id;
        organizationId = organization._id;
      });
    } finally {
      await dbSession.endSession();
    }
    if (!userId || !organizationId) throw new Error("Registration failed");
    await issueSession(res, userId);
    res.status(201).json({
      user: { id: userId, name, email },
      organization: {
        id: organizationId,
        name: organizationName,
        role: "owner",
      },
    });
  },
);
router.post("/login", authLimit, validate(loginInput), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginInput>;
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !(await compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  await issueSession(res, user._id);
  res.json({ user: { id: user.id, name: user.name, email: user.email } });
});
router.get("/me", requireUser, async (_req, res) => {
  const user = await User.findById(res.locals.userId).lean();
  if (!user) {
    res.status(401).json({ error: "Account unavailable" });
    return;
  }
  const memberships = await Membership.find({ userId: user._id }).lean();
  const organizations = await Organization.find({
    _id: { $in: memberships.map((member) => member.organizationId) },
  }).lean();
  res.json({
    user: { id: user._id, name: user.name, email: user.email },
    organizations: organizations.map((organization) => ({
      id: organization._id,
      name: organization.name,
      role: memberships.find((member) =>
        member.organizationId.equals(organization._id),
      )?.role,
    })),
  });
});
router.post("/logout", requireUser, async (_req, res) => {
  await Session.deleteOne({
    _id: res.locals.sessionId,
    userId: res.locals.userId,
  });
  res.clearCookie(cookieName, cookieOptions);
  res.json({ ok: true });
});
export default router;
