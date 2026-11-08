import mongoose from "mongoose";
import { z } from "zod";
import { BusinessKnowledge, Listing, Organization } from "../models/index.js";

const short = (max: number) => z.string().trim().max(max);
const named = (max: number) => z.string().trim().min(1).max(max);
export const knowledgeInput = z.strictObject({
  profile: short(2000),
  services: z.array(z.strictObject({ name: named(100), description: short(500), price: short(100) })).max(30),
  faqs: z.array(z.strictObject({ question: named(200), answer: named(1000) })).max(50),
  policies: z.array(z.strictObject({ title: named(100), text: named(1000) })).max(20),
  contact: z.strictObject({ email: short(200), phone: short(80), address: short(300), website: short(300) }),
  facts: z.array(z.strictObject({ label: named(100), value: named(500) })).max(50),
});
export const listingInput = z.strictObject({
  title: named(150), description: named(2000), location: named(150),
  price: z.number().finite().min(0).max(1_000_000_000),
  currency: z.enum(["TRY", "USD", "EUR", "GBP"]),
  propertyType: z.enum(["apartment", "house", "land", "commercial"]),
  rooms: z.number().int().min(0).max(50).optional(),
  areaSqm: z.number().finite().min(1).max(1_000_000),
  availability: z.enum(["available", "reserved", "sold"]),
  publicUrl: z.url().refine((value) => value.startsWith("https://") && value.length <= 500).optional(),
});
export const listingFilters = z.strictObject({
  budgetMax: z.number().finite().min(0).max(1_000_000_000).optional(),
  currency: z.enum(["TRY", "USD", "EUR", "GBP"]).optional(),
  location: short(100).optional(),
  propertyType: listingInput.shape.propertyType.optional(),
  minRooms: z.number().int().min(0).max(50).optional(),
  minAreaSqm: z.number().finite().min(0).max(1_000_000).optional(),
  availability: z.enum(["available", "reserved", "sold"]).default("available"),
}).refine((value) => value.budgetMax === undefined || value.currency !== undefined, "Currency is required with a budget");

export const searchListings = async (organizationId: mongoose.Types.ObjectId, raw: unknown, freshOnly = true, allStatuses = false) => {
  const filters = listingFilters.parse(raw);
  const query: Record<string, unknown> = { organizationId, archivedAt: { $exists: false }, availability: filters.availability };
  if (allStatuses) query.availability = { $in: ["available", "reserved", "sold"] };
  if (freshOnly) query.updatedAt = { $gte: new Date(Date.now() - 30 * 86_400_000) };
  if (filters.budgetMax !== undefined) query.price = { $lte: filters.budgetMax };
  if (filters.currency) query.currency = filters.currency;
  if (filters.propertyType) query.propertyType = filters.propertyType;
  if (filters.minRooms !== undefined) query.rooms = { $gte: filters.minRooms };
  if (filters.minAreaSqm !== undefined) query.areaSqm = { $gte: filters.minAreaSqm };
  if (filters.location) query.location = { $regex: filters.location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  return Listing.find(query).select("title description location price currency propertyType rooms areaSqm availability publicUrl updatedAt")
    .sort({ updatedAt: -1 }).limit(freshOnly ? 10 : 100).lean();
};

export const retrieveKnowledge = async (organizationId: mongoose.Types.ObjectId, topic: string) => {
  const [knowledge, organization] = await Promise.all([
    BusinessKnowledge.findOne({ organizationId }).lean(),
    Organization.findById(organizationId).select("timeZone openingHours").lean(),
  ]);
  const needle = topic.trim().toLocaleLowerCase().slice(0, 100);
  const matches = (value: string) => !needle || value.toLocaleLowerCase().includes(needle);
  return {
    profile: matches(knowledge?.profile ?? "") ? knowledge?.profile ?? "" : "",
    services: (knowledge?.services ?? []).filter((item) => matches(`${item.name} ${item.description}`)).slice(0, 8),
    faqs: (knowledge?.faqs ?? []).filter((item) => matches(`${item.question} ${item.answer}`)).slice(0, 8),
    policies: (knowledge?.policies ?? []).filter((item) => matches(`${item.title} ${item.text}`)).slice(0, 5),
    facts: (knowledge?.facts ?? []).filter((item) => matches(`${item.label} ${item.value}`)).slice(0, 8),
    contact: !needle || ["contact", "email", "phone", "address", "website", "iletişim", "telefon", "adres"].some((word) => needle.includes(word)) ? knowledge?.contact ?? null : null,
    openingHours: !needle || ["hour", "open", "saat", "açık"].some((word) => needle.includes(word)) ? organization?.openingHours ?? [] : [],
    timeZone: organization?.timeZone ?? "UTC",
  };
};
