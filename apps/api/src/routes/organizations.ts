import { Router } from "express";
import { z } from "zod";
import {
  Membership,
  Organization,
  User,
  AccountToken,
} from "../models/index.js";
import { validate, email } from "../middleware/validate.js";
import { createAccountToken } from "./auth.js";
import { requireMembership, requireUser } from "../middleware/security.js";
import { parseUsdMicros } from "../services/money.js";
import { BudgetWindow } from "../models/index.js";
import { utcPeriods } from "../services/budget.js";
const router = Router();
router.use(requireUser);
const staffInput = z.strictObject({
  email,
  role: z.enum(["admin", "agent", "viewer"]),
});
router.get(
  "/:organizationId/members",
  requireMembership(["owner", "admin"]),
  async (_req, res) => {
    const memberships = await Membership.find({
      organizationId: res.locals.organizationId,
    }).lean();
    const users = await User.find({
      _id: { $in: memberships.map((item) => item.userId) },
    }).lean();
    res.json({
      members: memberships.map((item) => ({
        id: item._id,
        userId: item.userId,
        role: item.role,
        user: users.find((user) => user._id.equals(item.userId)) && {
          name: users.find((user) => user._id.equals(item.userId))?.name,
          email: users.find((user) => user._id.equals(item.userId))?.email,
        },
      })),
    });
  },
);
router.get(
  "/:organizationId/budgets",
  requireMembership(["owner", "admin"]),
  async (_req, res) => {
    const organization = await Organization.findById(
      res.locals.organizationId,
    ).lean();
    if (!organization) {
      res.status(404).json({ error: "Organization unavailable" });
      return;
    }
    const periods = utcPeriods();
    const windows = await BudgetWindow.find({
      organizationId: res.locals.organizationId,
      $or: [
        { kind: "day", periodStart: periods.day },
        { kind: "month", periodStart: periods.month },
      ],
    }).lean();
    res.json({
      dailyLimitMicros: organization.dailyBudgetMicros,
      monthlyLimitMicros: organization.monthlyBudgetMicros,
      windows,
    });
  },
);
router.patch(
  "/:organizationId/budgets",
  requireMembership(["owner"]),
  validate(z.strictObject({ dailyUsd: z.string(), monthlyUsd: z.string() })),
  async (req, res) => {
    let dailyBudgetMicros: number;
    let monthlyBudgetMicros: number;
    try {
      dailyBudgetMicros = parseUsdMicros(req.body.dailyUsd);
      monthlyBudgetMicros = parseUsdMicros(req.body.monthlyUsd);
    } catch {
      res.status(422).json({ error: "Invalid budget amount" });
      return;
    }
    if (monthlyBudgetMicros < dailyBudgetMicros) {
      res
        .status(422)
        .json({ error: "Monthly budget must be at least the daily budget" });
      return;
    }
    await Organization.updateOne(
      { _id: res.locals.organizationId },
      { $set: { dailyBudgetMicros, monthlyBudgetMicros } },
    );
    res.json({
      dailyLimitMicros: dailyBudgetMicros,
      monthlyLimitMicros: monthlyBudgetMicros,
    });
  },
);
router.post(
  "/:organizationId/invitations",
  requireMembership(["owner"]),
  validate(staffInput),
  async (req, res) => {
    const { email, role } = req.body as z.infer<typeof staffInput>;
    if (await User.exists({ email })) {
      res
        .status(409)
        .json({
          error:
            "Account already exists; multi-organization invites are not yet supported",
        });
      return;
    }
    await AccountToken.updateMany(
      {
        organizationId: res.locals.organizationId,
        email,
        purpose: "invite",
        usedAt: { $exists: false },
      },
      { $set: { usedAt: new Date() } },
    );
    await createAccountToken("invite", email, {
      organizationId: res.locals.organizationId,
      role,
    });
    res.status(201).json({ invitation: { email, role, expiresInHours: 72 } });
  },
);
router.get(
  "/:organizationId",
  requireMembership(["owner", "admin", "agent", "viewer"]),
  async (_req, res) => {
    const organization = await Organization.findOne({
      _id: res.locals.organizationId,
    }).lean();
    if (!organization) {
      res.status(404).json({ error: "Organization unavailable" });
      return;
    }
    res.json({
      organization: { id: organization._id, name: organization.name },
      role: res.locals.role,
    });
  },
);
export default router;
