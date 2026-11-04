import { Router } from "express";
import mongoose from "mongoose";
import { hash, compare } from "bcrypt";
import { z } from "zod";
import {
  AccountToken,
  Membership,
  Organization,
  Session,
  User,
} from "../models/index.js";
import { validate, email, password } from "../middleware/validate.js";
import { authLimit } from "../middleware/limits.js";
import {
  cookieName,
  cookieOptions,
  requireUser,
} from "../middleware/security.js";
import { newToken, tokenHash } from "../services/tokens.js";
import { sendAccountMail } from "../services/mail.js";
import { env } from "../config/env.js";
import type { Role } from "../middleware/security.js";

const router = Router();
const registerInput = z.strictObject({
  organizationName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(1).max(100),
  email,
  password,
});
const loginInput = z.strictObject({ email, password: z.string() });
const tokenInput = z.strictObject({ token: z.string().min(30).max(200) });
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
export const createAccountToken = async (
  purpose: "verify" | "reset" | "invite",
  emailAddress: string,
  details: {
    userId?: mongoose.Types.ObjectId;
    organizationId?: mongoose.Types.ObjectId;
    role?: Role;
  } = {},
) => {
  const token = newToken();
  await AccountToken.create({
    tokenHash: tokenHash(token),
    purpose,
    email: emailAddress,
    ...details,
    expiresAt: new Date(
      Date.now() + (purpose === "invite" ? 72 : 1) * 60 * 60 * 1000,
    ),
  });
  await sendAccountMail({ to: emailAddress, purpose, token });
};
const consume = async (
  purpose: "verify" | "reset" | "invite",
  token: string,
  session: mongoose.ClientSession,
) =>
  AccountToken.findOneAndUpdate(
    {
      tokenHash: tokenHash(token),
      purpose,
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { session, returnDocument: "after" },
  );
router.post(
  "/register",
  authLimit,
  validate(registerInput),
  async (req, res) => {
    const {
      organizationName,
      name,
      email: emailAddress,
      password: pass,
    } = req.body as z.infer<typeof registerInput>;
    const session = await mongoose.startSession();
    let userId: mongoose.Types.ObjectId | undefined;
    let organizationId: mongoose.Types.ObjectId | undefined;
    try {
      await session.withTransaction(async () => {
        const [user] = await User.create(
          [{ name, email: emailAddress, passwordHash: await hash(pass, 12) }],
          { session },
        );
        const [organization] = await Organization.create(
          [
            {
              name: organizationName,
              dailyBudgetMicros: env.defaultDailyBudgetMicros,
              monthlyBudgetMicros: env.defaultMonthlyBudgetMicros,
            },
          ],
          { session },
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
          { session },
        );
        userId = user._id;
        organizationId = organization._id;
      });
    } finally {
      await session.endSession();
    }
    if (!userId || !organizationId) throw new Error("Registration failed");
    await createAccountToken("verify", emailAddress, { userId });
    res
      .status(201)
      .json({
        verificationRequired: true,
        organization: { id: organizationId, name: organizationName },
      });
  },
);
router.post(
  "/verify-email",
  authLimit,
  validate(tokenInput),
  async (req, res) => {
    const session = await mongoose.startSession();
    let userId: mongoose.Types.ObjectId | undefined;
    try {
      await session.withTransaction(async () => {
        const record = await consume("verify", req.body.token, session);
        if (!record?.userId) return;
        const updated = await User.findOneAndUpdate(
          { _id: record.userId, email: record.email },
          { $set: { emailVerifiedAt: new Date() } },
          { session },
        );
        if (updated) userId = updated._id;
      });
    } finally {
      await session.endSession();
    }
    if (!userId) {
      res.status(400).json({ error: "Link expired or already used" });
      return;
    }
    await issueSession(res, userId);
    res.json({ ok: true });
  },
);
router.post(
  "/resend-verification",
  authLimit,
  validate(z.strictObject({ email })),
  async (req, res) => {
    const user = await User.findOne({
      email: req.body.email,
      emailVerifiedAt: { $exists: false },
    });
    if (user)
      await createAccountToken("verify", user.email, { userId: user._id });
    res.json({ ok: true });
  },
);
router.post("/login", authLimit, validate(loginInput), async (req, res) => {
  const { email: emailAddress, password: pass } = req.body as z.infer<
    typeof loginInput
  >;
  const user = await User.findOne({ email: emailAddress }).select(
    "+passwordHash",
  );
  if (!user || !(await compare(pass, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!user.emailVerifiedAt) {
    res.status(403).json({ error: "Verify your email before signing in" });
    return;
  }
  await issueSession(res, user._id);
  res.json({ user: { id: user.id, name: user.name, email: user.email } });
});
router.post(
  "/request-password-reset",
  authLimit,
  validate(z.strictObject({ email })),
  async (req, res) => {
    const user = await User.findOne({
      email: req.body.email,
      emailVerifiedAt: { $exists: true },
    });
    if (user)
      await createAccountToken("reset", user.email, { userId: user._id });
    res.json({ ok: true });
  },
);
router.post(
  "/reset-password",
  authLimit,
  validate(z.strictObject({ token: tokenInput.shape.token, password })),
  async (req, res) => {
    const session = await mongoose.startSession();
    let reset = false;
    try {
      await session.withTransaction(async () => {
        const record = await consume("reset", req.body.token, session);
        if (!record?.userId) return;
        const updated = await User.updateOne(
          { _id: record.userId, email: record.email },
          { $set: { passwordHash: await hash(req.body.password, 12) } },
          { session },
        );
        if (updated.modifiedCount !== 1) return;
        await Session.deleteMany({ userId: record.userId }, { session });
        reset = true;
      });
    } finally {
      await session.endSession();
    }
    if (!reset) {
      res.status(400).json({ error: "Link expired or already used" });
      return;
    }
    res.clearCookie(cookieName, cookieOptions);
    res.json({ ok: true });
  },
);
router.post(
  "/accept-invitation",
  authLimit,
  validate(
    z.strictObject({
      token: tokenInput.shape.token,
      name: z.string().trim().min(1).max(100),
      password,
    }),
  ),
  async (req, res) => {
    const session = await mongoose.startSession();
    let userId: mongoose.Types.ObjectId | undefined;
    try {
      await session.withTransaction(async () => {
        const record = await consume("invite", req.body.token, session);
        if (
          !record?.organizationId ||
          !record.role ||
          (await User.exists({ email: record.email }).session(session))
        )
          return;
        const [user] = await User.create(
          [
            {
              name: req.body.name,
              email: record.email,
              passwordHash: await hash(req.body.password, 12),
              emailVerifiedAt: new Date(),
            },
          ],
          { session },
        );
        if (!user) throw new Error("Invitation failed");
        await Membership.create(
          [
            {
              userId: user._id,
              organizationId: record.organizationId,
              role: record.role,
            },
          ],
          { session },
        );
        userId = user._id;
      });
    } finally {
      await session.endSession();
    }
    if (!userId) {
      res.status(400).json({ error: "Link expired or already used" });
      return;
    }
    await issueSession(res, userId);
    res.status(201).json({ ok: true });
  },
);
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
router.get("/sessions", requireUser, async (_req, res) => {
  const sessions = await Session.find({
    userId: res.locals.userId,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    sessions: sessions.map((item) => ({
      id: item._id,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      current: item._id.equals(res.locals.sessionId),
    })),
  });
});
router.delete("/sessions/:sessionId", requireUser, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.sessionId)) {
    res.status(400).json({ error: "Invalid session" });
    return;
  }
  await Session.deleteOne({
    _id: req.params.sessionId,
    userId: res.locals.userId,
  });
  if (req.params.sessionId === String(res.locals.sessionId))
    res.clearCookie(cookieName, cookieOptions);
  res.json({ ok: true });
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
