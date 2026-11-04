import { Router } from "express";
import mongoose from "mongoose";
import { hash } from "bcrypt";
import { z } from "zod";
import { Membership, Organization, User } from "../models/index.js";
import { validate, email, password } from "../middleware/validate.js";
import { requireMembership, requireUser } from "../middleware/security.js";
const router = Router();
router.use(requireUser);
const staffInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email,
  password,
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
router.post(
  "/:organizationId/members",
  requireMembership(["owner"]),
  validate(staffInput),
  async (req, res) => {
    const { name, email, password, role } = req.body as z.infer<
      typeof staffInput
    >;
    const session = await mongoose.startSession();
    let userId: mongoose.Types.ObjectId | undefined;
    try {
      await session.withTransaction(async () => {
        const [user] = await User.create(
          [{ name, email, passwordHash: await hash(password, 12) }],
          { session },
        );
        if (!user) throw new Error("Account creation failed");
        await Membership.create(
          [
            {
              organizationId: res.locals.organizationId,
              userId: user._id,
              role,
            },
          ],
          { session },
        );
        userId = user._id;
      });
    } finally {
      await session.endSession();
    }
    res.status(201).json({ member: { userId, name, email, role } });
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
