import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { BusinessKnowledge, Customer, Listing, Membership, Message, Conversation } from "../models/index.js";
import { requireMembership, requireUser } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { knowledgeInput, listingFilters, listingInput, searchListings } from "../services/business-data.js";

const router = Router();
router.use(requireUser);
const read = requireMembership(["owner", "admin", "agent", "viewer"]);
const write = requireMembership(["owner", "admin", "agent"]);
const manage = requireMembership(["owner", "admin"]);
const validId = (value: unknown) => typeof value === "string" && mongoose.isValidObjectId(value);
const leadPatch = z.strictObject({
  requirements: z.string().trim().max(1000).optional(),
  budgetMin: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
  budgetMax: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
  preferredLocations: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  propertyTypes: z.array(z.enum(["apartment", "house", "land", "commercial"])).max(4).optional(),
  minRooms: z.number().int().min(0).max(50).nullable().optional(),
  minAreaSqm: z.number().finite().min(0).max(1_000_000).nullable().optional(),
  leadStatus: z.enum(["new", "qualified", "contacted", "won", "lost"]).optional(),
  assignedTo: z.string().refine(mongoose.isValidObjectId).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  followUpAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).refine((value) => value.budgetMin == null || value.budgetMax == null || value.budgetMin <= value.budgetMax,
  "Budget minimum exceeds maximum");

router.get("/:organizationId/knowledge", read, async (_req, res) => {
  res.json({ knowledge: await BusinessKnowledge.findOne({ organizationId: res.locals.organizationId }).lean() });
});
router.put("/:organizationId/knowledge", manage, validate(knowledgeInput), async (req, res) => {
  const knowledge = await BusinessKnowledge.findOneAndUpdate({ organizationId: res.locals.organizationId },
    { $set: req.body }, { upsert: true, returnDocument: "after", runValidators: true });
  res.json({ knowledge });
});
router.get("/:organizationId/listings", read, async (req, res) => {
  const parsed = listingFilters.safeParse({
    ...(req.query.budgetMax ? { budgetMax: Number(req.query.budgetMax) } : {}),
    ...(req.query.currency ? { currency: req.query.currency } : {}),
    ...(req.query.location ? { location: req.query.location } : {}),
    ...(req.query.propertyType ? { propertyType: req.query.propertyType } : {}),
    ...(req.query.listingType ? { listingType: req.query.listingType } : {}),
    ...(req.query.minRooms ? { minRooms: Number(req.query.minRooms) } : {}),
    ...(req.query.minAreaSqm ? { minAreaSqm: Number(req.query.minAreaSqm) } : {}),
    ...(req.query.availability ? { availability: req.query.availability } : {}),
  });
  if (!parsed.success) { res.status(422).json({ error: "Invalid listing filters" }); return; }
  res.json({ listings: await searchListings(res.locals.organizationId, parsed.data, false, req.query.all === "true") });
});
router.post("/:organizationId/listings", write, validate(listingInput), async (req, res) => {
  const listing = await Listing.create({ ...req.body, organizationId: res.locals.organizationId });
  res.status(201).json({ listing });
});
router.patch("/:organizationId/listings/:listingId", write, validate(listingInput.partial()), async (req, res) => {
  if (!validId(req.params.listingId)) { res.status(400).json({ error: "Invalid listing" }); return; }
  const listing = await Listing.findOneAndUpdate({ _id: req.params.listingId, organizationId: res.locals.organizationId, archivedAt: { $exists: false } },
    { $set: req.body }, { returnDocument: "after", runValidators: true });
  if (!listing) { res.status(404).json({ error: "Listing unavailable" }); return; }
  res.json({ listing });
});
router.post("/:organizationId/listings/:listingId/archive", write, async (req, res) => {
  if (!validId(req.params.listingId)) { res.status(400).json({ error: "Invalid listing" }); return; }
  const listing = await Listing.findOneAndUpdate({ _id: req.params.listingId, organizationId: res.locals.organizationId, archivedAt: { $exists: false } },
    { $set: { archivedAt: new Date() } }, { returnDocument: "after" });
  if (!listing) { res.status(404).json({ error: "Listing unavailable" }); return; }
  res.json({ listing });
});
router.patch("/:organizationId/leads/:customerId", write, validate(leadPatch), async (req, res) => {
  if (!validId(req.params.customerId)) { res.status(400).json({ error: "Invalid customer" }); return; }
  if (req.body.assignedTo) {
    const member = await Membership.exists({ organizationId: res.locals.organizationId, userId: req.body.assignedTo,
      role: { $in: ["owner", "admin", "agent"] } });
    if (!member) { res.status(422).json({ error: "Assignee is not staff" }); return; }
  }
  const customer = await Customer.findOne({ _id: req.params.customerId, organizationId: res.locals.organizationId, "consent.recorded": true });
  if (!customer) { res.status(404).json({ error: "Customer unavailable" }); return; }
  const patch = { ...req.body, ...(req.body.followUpAt ? { followUpAt: new Date(req.body.followUpAt) } : {}) };
  const effectiveMin = patch.budgetMin === undefined ? customer.budgetMin : patch.budgetMin;
  const effectiveMax = patch.budgetMax === undefined ? customer.budgetMax : patch.budgetMax;
  if (typeof effectiveMin === "number" && typeof effectiveMax === "number" && effectiveMin > effectiveMax) {
    res.status(422).json({ error: "Budget minimum exceeds maximum" }); return;
  }
  customer.set(patch);
  await customer.save();
  res.json({ customer });
});
router.get("/:organizationId/leads/follow-up", write, async (_req, res) => {
  res.json({ customers: await Customer.find({ organizationId: res.locals.organizationId, "consent.recorded": true,
    followUpAt: { $lte: new Date() }, leadStatus: { $nin: ["won", "lost"] },
  }).sort({ followUpAt: 1 }).limit(100).lean() });
});
router.get("/:organizationId/conversation-summaries", read, async (_req, res) => {
  const conversations = await Conversation.find({ organizationId: res.locals.organizationId }).sort({ updatedAt: -1 }).limit(30).lean();
  const summaries = await Promise.all(conversations.map(async (conversation) => {
    const messages = await Message.find({ organizationId: res.locals.organizationId, conversationId: conversation._id })
      .sort({ createdAt: -1 }).limit(3).select("role text createdAt").lean();
    return { conversationId: conversation._id, status: conversation.status, updatedAt: conversation.updatedAt,
      recent: messages.reverse().map((message) => ({ role: message.role, text: message.text.slice(0, 200), createdAt: message.createdAt })) };
  }));
  res.json({ summaries });
});
export default router;
