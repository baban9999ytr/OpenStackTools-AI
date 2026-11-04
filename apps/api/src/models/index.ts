import mongoose, { Schema } from "mongoose";

const options = { timestamps: true } as const;
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  options,
);
export const User = mongoose.model("User", userSchema);

const organizationSchema = new Schema(
  { name: { type: String, required: true, trim: true } },
  options,
);
export const Organization = mongoose.model("Organization", organizationSchema);

export const roles = ["owner", "admin", "agent", "viewer"] as const;
const membershipSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: roles, required: true },
  },
  options,
);
membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, organizationId: 1 });
export const Membership = mongoose.model("Membership", membershipSchema);

const assistantSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    instructions: { type: String, required: true },
    publicKey: { type: String, required: true, unique: true },
    allowedOrigins: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  options,
);
assistantSchema.index({ organizationId: 1, createdAt: -1 });
assistantSchema.index({ allowedOrigins: 1, active: 1 });
export const Assistant = mongoose.model("Assistant", assistantSchema);

const conversationSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: "Assistant",
      required: true,
    },
    visitorId: { type: String, required: true },
    channel: { type: String, enum: ["web"], default: "web" },
    status: {
      type: String,
      enum: ["bot", "handoff", "closed"],
      default: "bot",
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
  },
  options,
);
conversationSchema.index({ organizationId: 1, updatedAt: -1 });
conversationSchema.index({ organizationId: 1, assistantId: 1, visitorId: 1 });
export const Conversation = mongoose.model("Conversation", conversationSchema);

const messageSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    role: {
      type: String,
      enum: ["customer", "assistant", "agent"],
      required: true,
    },
    text: { type: String, required: true },
    clientMessageId: { type: String },
  },
  options,
);
messageSchema.index({ organizationId: 1, conversationId: 1, createdAt: 1 });
messageSchema.index(
  { organizationId: 1, conversationId: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: "string" } },
  },
);
export const Message = mongoose.model("Message", messageSchema);

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
  },
  options,
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = mongoose.model("Session", sessionSchema);

const widgetSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: "Assistant",
      required: true,
    },
    visitorId: { type: String, required: true },
    origin: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  options,
);
widgetSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const WidgetSession = mongoose.model(
  "WidgetSession",
  widgetSessionSchema,
);

const usageEventSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: "Assistant",
      required: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    model: { type: String, required: true },
    inputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
  },
  options,
);
usageEventSchema.index({ organizationId: 1, createdAt: -1 });
export const UsageEvent = mongoose.model("UsageEvent", usageEventSchema);

const rateCounterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});
rateCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateCounter = mongoose.model("RateCounter", rateCounterSchema);
