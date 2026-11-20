import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Assistant, ChannelConnection, Organization } from "../models/index.js";
import { productModeOptions, effectiveMaxEffort, configuredMaxEffort, configuredModels, modelRegistry, modelSelectionSchema, newAssistantSelection, pricingSource, pricingVersion, resolveModel, type Effort } from "../services/model-config.js";
import { validate, origin } from "../middleware/validate.js";
import { requireMembership, requireUser } from "../middleware/security.js";
import { newPublicKey } from "../services/tokens.js";
const router = Router();
router.use(requireUser);
const input = z.strictObject({
  name: z.string().trim().min(2).max(80),
  instructions: z.string().trim().min(10).max(8000),
  conversationStrategy: z.enum(["reactive", "real_estate"]).optional(),
  responseLength: z.enum(["short", "balanced", "detailed"]).optional(),
  modelSelection: modelSelectionSchema.optional(),
  settingsVersion: z.number().int().min(0).optional(),
  defaultLanguage: z.enum(["auto", "tr", "en"]).optional(),
  tone: z.enum(["warm", "formal", "friendly", "concise", "concierge"]).optional(),
  greetingStyle: z.enum(["brief", "standard"]).optional(),
  emojiUsage: z.enum(["none", "minimal"]).optional(),
  bookingContactMethod: z.enum(["phone", "email", "either", "none"]).optional(),
  bookingManualHandoff: z.boolean().optional(),
  bookingNameRequired: z.boolean().optional(),
  defaultAppointmentDurationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]).optional(),
  allowedOrigins: z.array(origin).max(10),
  active: z.boolean().optional(),
});
router.get(
  "/:organizationId/assistants",
  requireMembership(["owner", "admin", "agent", "viewer"]),
  async (_req, res) => {
    const assistants = await Assistant.find({
      organizationId: res.locals.organizationId,
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ assistants });
  },
);
router.get("/:organizationId/model-options", requireMembership(["owner", "admin", "agent", "viewer"]),
  async (_req, res) => {
    const org = await Organization.findById(res.locals.organizationId).select("allowedModels maxReasoningEffort").lean();
    const orgAllowed = org?.allowedModels;
    const enabled = configuredModels().filter((id) => !orgAllowed?.length || orgAllowed.includes(id));
    res.json({ models: modelRegistry, enabled, pricingVersion, pricingSource,
      productModes: productModeOptions(enabled, effectiveMaxEffort(org?.maxReasoningEffort)),
      maxReasoningEffort: effectiveMaxEffort(org?.maxReasoningEffort),
      defaultSelection: newAssistantSelection(enabled) });
  });
router.post(
  "/:organizationId/assistants",
  requireMembership(["owner", "admin"]),
  validate(input),
  async (req, res) => {
    const org = await Organization.findById(res.locals.organizationId).select("allowedModels maxReasoningEffort").lean();
    const orgAllowed = org?.allowedModels;
    const allowed = orgAllowed?.length ? configuredModels().filter((id) => orgAllowed.includes(id)) : configuredModels();
    const selection = req.body.modelSelection ?? newAssistantSelection(allowed);
    try { resolveModel(selection, allowed, (org?.maxReasoningEffort ?? configuredMaxEffort()) as Effort); }
    catch { res.status(422).json({ error: "Unsupported model configuration" }); return; }
    const assistant = await Assistant.create({
      ...req.body,
      ...(req.body.conversationStrategy === "real_estate" ? {
        bookingNameRequired: req.body.bookingNameRequired ?? true,
        bookingContactMethod: req.body.bookingContactMethod ?? "either",
      } : {}),
      modelSelection: selection,
      allowedOrigins: [...new Set(req.body.allowedOrigins)],
      organizationId: res.locals.organizationId,
      publicKey: newPublicKey(),
    });
    res.status(201).json({ assistant });
  },
);
router.patch(
  "/:organizationId/assistants/:assistantId",
  requireMembership(["owner", "admin"]),
  validate(input.partial()),
  async (req, res) => {
    if (!isValidObjectId(req.params.assistantId)) {
      res.status(400).json({ error: "Invalid assistant" });
      return;
    }
    const patch = { ...req.body };
    const org = await Organization.findById(res.locals.organizationId).select("allowedModels maxReasoningEffort").lean();
    if (patch.modelSelection) {
      const orgAllowed = org?.allowedModels;
      try { resolveModel(patch.modelSelection, orgAllowed?.length ? configuredModels().filter((id) => orgAllowed.includes(id)) : configuredModels(),
        (org?.maxReasoningEffort ?? configuredMaxEffort()) as Effort); }
      catch { res.status(422).json({ error: "Unsupported model configuration" }); return; }
    }
    if (patch.allowedOrigins)
      patch.allowedOrigins = [...new Set(patch.allowedOrigins)];
    const version = patch.settingsVersion;
    delete patch.settingsVersion;
    const assistant = await Assistant.findOneAndUpdate(
      {
        _id: req.params.assistantId,
        organizationId: res.locals.organizationId,
        ...(version !== undefined ? version === 0 ? { $or: [{ settingsVersion: 0 }, { settingsVersion: { $exists: false } }] }
          : { settingsVersion: version } : {}),
      },
      { $set: patch, $inc: { settingsVersion: 1 } },
      { returnDocument: "after", runValidators: true },
    );
    if (!assistant) {
      res.status(version !== undefined && await Assistant.exists({ _id: req.params.assistantId,
        organizationId: res.locals.organizationId }) ? 409 : 404).json({ error: "Assistant unavailable or settings changed" });
      return;
    }
    if (patch.active === false) await ChannelConnection.updateMany({ organizationId: res.locals.organizationId,
      assistantId: assistant._id, credentialSource: "managed", active: true },
    { $set: { active: false, status: "needs_attention", lastErrorCategory: "assistant_unavailable" } });
    res.json({ assistant });
  },
);
export default router;
