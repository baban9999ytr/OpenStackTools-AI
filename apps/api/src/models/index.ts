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
    emailVerifiedAt: { type: Date },
  },
  options,
);
export const User = mongoose.model("User", userSchema);

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    timeZone: { type: String, default: "UTC" },
    openingHours: {
      type: [{ day: Number, startMinute: Number, endMinute: Number }],
      default: [],
    },
    dailyBudgetMicros: { type: Number, required: true, min: 0 },
    monthlyBudgetMicros: { type: Number, required: true, min: 0 },
    allowedModels: { type: [String], default: undefined },
    maxReasoningEffort: { type: String },
    retentionDays: {
      type: Number,
      required: true,
      default: 30,
      min: 1,
      max: 365,
    },
  },
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
    conversationStrategy: { type: String, enum: ["reactive", "real_estate"], default: "reactive" },
    responseLength: { type: String, enum: ["short", "balanced", "detailed"], default: "short" },
    modelSelection: { type: Schema.Types.Mixed },
    settingsVersion: { type: Number, default: 0 },
    defaultLanguage: { type: String, enum: ["auto", "tr", "en"], default: "auto" },
    tone: { type: String, enum: ["warm", "formal", "friendly", "concise", "concierge"], default: "warm" },
    greetingStyle: { type: String, enum: ["brief", "standard"], default: "brief" },
    emojiUsage: { type: String, enum: ["none", "minimal"], default: "none" },
    bookingContactMethod: { type: String, enum: ["phone", "email", "either", "none"] },
    bookingManualHandoff: { type: Boolean, default: true },
    bookingNameRequired: { type: Boolean, default: false },
    defaultAppointmentDurationMinutes: { type: Number, enum: [15, 30, 45, 60, 90, 120], default: 30 },
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
    channel: { type: String, enum: ["web", "telegram", "whatsapp", "instagram"], default: "web" },
    channelConnectionId: { type: Schema.Types.ObjectId, ref: "ChannelConnection" },
    status: {
      type: String,
      enum: ["bot", "handoff", "closed"],
      default: "bot",
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    workflow: {
      business: { type: Schema.Types.Mixed },
      offeredSlots: { type: [{ startAt: String, staffId: String, durationMinutes: Number }], default: undefined },
      propertyFocusId: { type: Schema.Types.ObjectId, ref: "Listing" },
      displayedListingIds: { type: [Schema.Types.ObjectId], default: undefined },
      selectedListingId: { type: Schema.Types.ObjectId, ref: "Listing" },
      preferredDate: { type: String },
      preferredMinute: { type: Number },
      proposedStartAt: { type: Date },
      staffId: { type: Schema.Types.ObjectId, ref: "User" },
      durationMinutes: { type: Number },
      visitorName: { type: String },
      visitorNameSourceRequestId: { type: Schema.Types.ObjectId, ref: "WidgetRequest" },
      pendingQuestion: { type: String, enum: ["none", "preferred_time", "customer_name", "slot_acceptance"], default: "none" },
    },
    processingRequestId: { type: Schema.Types.ObjectId, ref: "WidgetRequest" },
    bookingLocale: { type: String, enum: ["en", "tr"] },
    bookingIntake: { type: Schema.Types.Mixed, select: false },
    processingLeaseUntil: { type: Date },
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
    source: { type: String, enum: ["retrieval"] },
    clientMessageId: { type: String },
    requestId: { type: Schema.Types.ObjectId, ref: "WidgetRequest" },
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
messageSchema.index(
  { requestId: 1, role: 1 },
  {
    unique: true,
    partialFilterExpression: { requestId: { $type: "objectId" } },
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

const accountTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    purpose: {
      type: String,
      enum: ["verify", "reset", "invite"],
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization" },
    email: { type: String, required: true },
    role: { type: String, enum: roles },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  options,
);
accountTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accountTokenSchema.index({ organizationId: 1, purpose: 1, email: 1 });
export const AccountToken = mongoose.model("AccountToken", accountTokenSchema);

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
    currentConversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
    locale: { type: String, enum: ["en", "tr"], default: "en" },
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

const channelConnectionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  assistantId: { type: Schema.Types.ObjectId, ref: "Assistant", required: true },
  channel: { type: String, enum: ["telegram", "whatsapp", "instagram"], required: true },
  externalAccountId: { type: String, required: true },
  credentialEnv: { type: String, required: true },
  webhookSecretEnv: { type: String, required: true },
  credentialSource: { type: String, enum: ["operator", "managed"], default: "operator" },
  providerUsername: { type: String },
  providerName: { type: String },
  status: { type: String, enum: ["setup_required", "connecting", "connected", "needs_attention", "disabled", "disconnecting", "disconnected"], default: "setup_required" },
  webhookState: { type: String, enum: ["unknown", "installing", "verified", "failed", "removed"], default: "unknown" },
  verifiedAt: { type: Date },
  webhookCheckedAt: { type: Date },
  lastSuccessfulCheckAt: { type: Date },
  lastErrorCategory: { type: String },
  operationId: { type: String },
  operationLeaseUntil: { type: Date },
  active: { type: Boolean, default: false },
}, options);
channelConnectionSchema.index({ channel: 1, externalAccountId: 1 }, { unique: true });
channelConnectionSchema.index({ credentialEnv: 1 }, { unique: true });
channelConnectionSchema.index({ webhookSecretEnv: 1 }, { unique: true });
channelConnectionSchema.index({ organizationId: 1, channel: 1 });
export const ChannelConnection = mongoose.model("ChannelConnection", channelConnectionSchema);

const channelCredentialSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  connectionId: { type: Schema.Types.ObjectId, ref: "ChannelConnection", required: true, unique: true },
  keyId: { type: String, required: true },
  tokenCiphertext: { type: String, required: true },
  tokenNonce: { type: String, required: true },
  tokenTag: { type: String, required: true },
  webhookCiphertext: { type: String, required: true },
  webhookNonce: { type: String, required: true },
  webhookTag: { type: String, required: true },
}, options);
channelCredentialSchema.index({ organizationId: 1, connectionId: 1 });
export const ChannelCredential = mongoose.model("ChannelCredential", channelCredentialSchema);

const channelIdentitySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  assistantId: { type: Schema.Types.ObjectId, required: true },
  channelConnectionId: { type: Schema.Types.ObjectId, ref: "ChannelConnection", required: true },
  channel: { type: String, enum: ["telegram", "whatsapp", "instagram"], required: true },
  externalConversationId: { type: String, required: true },
  senderId: { type: String, required: true },
  visitorId: { type: String, required: true },
  currentConversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
  locale: { type: String, enum: ["en", "tr"], default: "en" },
}, options);
channelIdentitySchema.index({ channelConnectionId: 1, externalConversationId: 1, senderId: 1 }, { unique: true });
channelIdentitySchema.index({ organizationId: 1, visitorId: 1 });
export const ChannelIdentity = mongoose.model("ChannelIdentity", channelIdentitySchema);

const channelInboundSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  channelConnectionId: { type: Schema.Types.ObjectId, required: true },
  externalMessageId: { type: String, required: true },
  externalConversationId: { type: String, required: true },
  senderId: { type: String, required: true },
  kind: { type: String, enum: ["message", "callback"], required: true },
  text: { type: String },
  interactionToken: { type: String },
  callbackQueryId: { type: String },
  requestId: { type: Schema.Types.ObjectId, ref: "WidgetRequest" },
  status: { type: String, enum: ["received", "queued", "handled"], default: "received" },
}, options);
channelInboundSchema.index({ channelConnectionId: 1, externalMessageId: 1 }, { unique: true });
channelInboundSchema.index({ status: 1, createdAt: 1 });
channelInboundSchema.index({ organizationId: 1, createdAt: 1 });
export const ChannelInbound = mongoose.model("ChannelInbound", channelInboundSchema);

const interactionTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  assistantId: { type: Schema.Types.ObjectId, required: true },
  conversationId: { type: Schema.Types.ObjectId, required: true },
  visitorId: { type: String, required: true },
  channelConnectionId: { type: Schema.Types.ObjectId },
  actionId: { type: Schema.Types.ObjectId, ref: "AgentAction", required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date },
}, options);
interactionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
interactionTokenSchema.index({ actionId: 1 });
export const InteractionToken = mongoose.model("InteractionToken", interactionTokenSchema);

const actionConfirmationAuditSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  actionId: { type: Schema.Types.ObjectId, required: true },
  conversationId: { type: Schema.Types.ObjectId, required: true },
  method: { type: String, enum: ["website_button", "channel_button", "text"], required: true },
  channel: { type: String, enum: ["web", "telegram", "whatsapp", "instagram"], required: true },
  dedupeKey: { type: String, required: true },
  outcome: { type: String, enum: ["confirmed", "declined", "rejected"], required: true },
}, options);
actionConfirmationAuditSchema.index({ organizationId: 1, dedupeKey: 1 }, { unique: true });
actionConfirmationAuditSchema.index({ organizationId: 1, actionId: 1, createdAt: -1 });
export const ActionConfirmationAudit = mongoose.model("ActionConfirmationAudit", actionConfirmationAuditSchema);

const channelDeliverySchema = new Schema({
  channelConnectionId: { type: Schema.Types.ObjectId, required: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  conversationId: { type: Schema.Types.ObjectId, required: true },
  requestId: { type: Schema.Types.ObjectId, ref: "WidgetRequest" },
  dedupeKey: { type: String, required: true },
  externalConversationId: { type: String, required: true },
  text: { type: String, required: true },
  interactionToken: { type: String },
  status: { type: String, enum: ["queued", "sending", "sent", "failed", "uncertain"], default: "queued" },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: { type: Date },
  providerMessageId: { type: String },
  failureCode: { type: String },
}, options);
channelDeliverySchema.index({ channelConnectionId: 1, dedupeKey: 1 }, { unique: true });
channelDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
export const ChannelDelivery = mongoose.model("ChannelDelivery", channelDeliverySchema);

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
    requestedTier: { type: String },
    actualTier: { type: String },
    pricingVersion: { type: String },
    inputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
    cachedInputTokens: { type: Number, default: 0, min: 0 },
    cacheWriteTokens: { type: Number, default: 0, min: 0 },
    reasoningTokens: { type: Number, default: 0, min: 0 },
    usageBreakdownKnown: { type: Boolean, default: false },
    estimatedCostMicros: { type: Number, required: true, min: 0 },
    billingStatus: {
      type: String,
      enum: ["measured", "uncertain"],
      required: true,
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "WidgetRequest",
      required: true,
    },
  },
  options,
);
usageEventSchema.index({ organizationId: 1, createdAt: -1 });
usageEventSchema.index({ requestId: 1, billingStatus: 1 });
export const UsageEvent = mongoose.model("UsageEvent", usageEventSchema);

const budgetWindowSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  kind: { type: String, enum: ["day", "month"], required: true },
  periodStart: { type: Date, required: true },
  spentMicros: { type: Number, required: true, default: 0, min: 0 },
  reservedMicros: { type: Number, required: true, default: 0, min: 0 },
  limitMicros: { type: Number, required: true, min: 0 },
});
budgetWindowSchema.index(
  { organizationId: 1, kind: 1, periodStart: 1 },
  { unique: true },
);
export const BudgetWindow = mongoose.model("BudgetWindow", budgetWindowSchema);

const widgetRequestSchema = new Schema(
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
    visitorId: { type: String, required: true },
    channel: { type: String, enum: ["web", "telegram", "whatsapp", "instagram"], default: "web" },
    channelConnectionId: { type: Schema.Types.ObjectId, ref: "ChannelConnection" },
    locale: { type: String, enum: ["en", "tr"], default: "en" },
    clientMessageId: { type: String, required: true },
    privateInputDigest: { type: String, select: false },
    text: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "handoff", "failed"],
      required: true,
      default: "queued",
    },
    attempts: { type: Number, required: true, default: 0 },
    leaseUntil: { type: Date },
    reservedMicros: { type: Number, required: true, default: 0 },
    reservedDay: { type: Date },
    reservedMonth: { type: Date },
    aiModel: { type: String },
    aiRoutingPolicy: { type: String },
    aiPricingVersion: { type: String },
    responseMessageId: { type: Schema.Types.ObjectId, ref: "Message" },
    actionId: { type: Schema.Types.ObjectId, ref: "AgentAction" },
    deliveryPreparedAt: { type: Date },
    errorCode: { type: String },
  },
  options,
);
widgetRequestSchema.index(
  { organizationId: 1, assistantId: 1, visitorId: 1, clientMessageId: 1 },
  { unique: true },
);
widgetRequestSchema.index({ status: 1, createdAt: 1 });
widgetRequestSchema.index({ conversationId: 1, status: 1, createdAt: 1 });
widgetRequestSchema.index({ organizationId: 1, actionId: 1 }, { partialFilterExpression: { actionId: { $type: "objectId" } } });
export const WidgetRequest = mongoose.model(
  "WidgetRequest",
  widgetRequestSchema,
);

const rateCounterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});
rateCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateCounter = mongoose.model("RateCounter", rateCounterSchema);

const auditEventSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  target: { type: String, required: true },
  result: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});
auditEventSchema.index({ organizationId: 1, createdAt: -1 });
export const AuditEvent = mongoose.model("AuditEvent", auditEventSchema);

const staffAvailabilitySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  staffId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  services: { type: [String], default: [] },
  appointmentDurationsMinutes: { type: [Number], default: [15, 30, 45, 60, 90, 120] },
  windows: { type: [{ day: Number, startMinute: Number, endMinute: Number }], default: [] },
}, options);
staffAvailabilitySchema.index({ organizationId: 1, staffId: 1 }, { unique: true });
export const StaffAvailability = mongoose.model("StaffAvailability", staffAvailabilitySchema);

const customerSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
  visitorId: { type: String },
  name: { type: String, required: true },
  contact: { type: String, required: true },
  request: { type: String, required: true },
  consent: { recorded: Boolean, source: String, at: Date },
  bookingContactMethod: { type: String, enum: ["phone", "email"] },
  bookingConsentAt: { type: Date },
  requirements: { type: String, default: "" },
  budgetMin: { type: Number, min: 0 }, budgetMax: { type: Number, min: 0 },
  preferredLocations: { type: [String], default: [] },
  propertyTypes: { type: [String], default: [] },
  minRooms: { type: Number, min: 0 }, minAreaSqm: { type: Number, min: 0 },
  leadStatus: { type: String, enum: ["new", "qualified", "contacted", "won", "lost"], default: "new" },
  assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
  notes: { type: String, default: "" },
  followUpAt: { type: Date },
  identityKey: { type: String },
}, options);
customerSchema.index({ organizationId: 1, updatedAt: -1 });
customerSchema.index({ organizationId: 1, conversationId: 1 });
customerSchema.index({ organizationId: 1, leadStatus: 1, followUpAt: 1 });
customerSchema.index({ organizationId: 1, identityKey: 1 }, { unique: true,
  partialFilterExpression: { identityKey: { $type: "string" } },
});
export const Customer = mongoose.model("Customer", customerSchema);

const businessKnowledgeSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true },
  profile: { type: String, default: "" },
  services: { type: [{ name: String, description: String, price: String }], default: [] },
  faqs: { type: [{ question: String, answer: String }], default: [] },
  policies: { type: [{ title: String, text: String }], default: [] },
  contact: { email: String, phone: String, address: String, website: String },
  facts: { type: [{ label: String, value: String }], default: [] },
}, options);
export const BusinessKnowledge = mongoose.model("BusinessKnowledge", businessKnowledgeSchema);

const listingSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  title: { type: String, required: true }, description: { type: String, required: true },
  location: { type: String, required: true }, price: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ["TRY", "USD", "EUR", "GBP"], required: true },
  listingType: { type: String, enum: ["rent", "sale"] },
  propertyType: { type: String, enum: ["apartment", "house", "land", "commercial"], required: true },
  rooms: { type: Number, min: 0, max: 50 }, areaSqm: { type: Number, required: true, min: 1 },
  availability: { type: String, enum: ["available", "reserved", "sold"], default: "available" },
  facts: {
    maintenanceFee: { type: Number, min: 0, max: 1_000_000_000 },
    deposit: { type: Number, min: 0, max: 1_000_000_000 },
    furnished: { type: Boolean },
  },
  publicUrl: { type: String }, archivedAt: { type: Date },
}, options);
listingSchema.index({ organizationId: 1, archivedAt: 1, availability: 1, price: 1 });
listingSchema.index({ organizationId: 1, updatedAt: -1 });
export const Listing = mongoose.model("Listing", listingSchema);

const appointmentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  staffId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "Listing" },
  customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
  visitorId: { type: String },
  visitorName: { type: String },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { type: String, enum: ["booked", "cancelled"], default: "booked" },
  createdBy: { type: String, enum: ["widget", "staff"], required: true },
}, options);
appointmentSchema.index({ organizationId: 1, startAt: 1 });
appointmentSchema.index({ organizationId: 1, staffId: 1, startAt: 1 });
appointmentSchema.index({ organizationId: 1, visitorId: 1 });
export const Appointment = mongoose.model("Appointment", appointmentSchema);

const appointmentSlotSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  staffId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true },
  startAt: { type: Date, required: true },
});
appointmentSlotSchema.index({ organizationId: 1, staffId: 1, startAt: 1 }, { unique: true });
appointmentSlotSchema.index({ organizationId: 1, appointmentId: 1 });
export const AppointmentSlot = mongoose.model("AppointmentSlot", appointmentSlotSchema);

const agentActionSchema = new Schema({
  bookingIntakeRequired: { type: Boolean },
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  assistantId: { type: Schema.Types.ObjectId, ref: "Assistant" },
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
  visitorId: { type: String },
  locale: { type: String, enum: ["en", "tr"], default: "en" },
  actorId: { type: Schema.Types.ObjectId, ref: "User" },
  name: { type: String, required: true },
  arguments: { type: Schema.Types.Mixed, required: true },
  result: { type: Schema.Types.Mixed },
  status: { type: String, enum: ["pending", "completed", "failed"], required: true },
  idempotencyKey: { type: String, required: true },
  expiresAt: { type: Date },
  confirmedAt: { type: Date },
}, options);
agentActionSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
agentActionSchema.index({ organizationId: 1, createdAt: -1 });
agentActionSchema.index({ organizationId: 1, conversationId: 1, status: 1 });
export const AgentAction = mongoose.model("AgentAction", agentActionSchema);

const demoSeedSchema = new Schema({
  _id: { type: String, required: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  ownerId: { type: Schema.Types.ObjectId, required: true },
  version: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});
export const DemoSeed = mongoose.model("DemoSeed", demoSeedSchema);
