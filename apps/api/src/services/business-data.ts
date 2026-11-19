import mongoose from "mongoose";
import { z } from "zod";
import { BusinessKnowledge, Listing, Organization } from "../models/index.js";

import { propertyFactsSchema } from "./property-facts.js";

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
  listingType: z.enum(["rent", "sale"]).optional(),
  propertyType: z.enum(["apartment", "house", "land", "commercial"]),
  rooms: z.number().int().min(0).max(50).optional(),
  areaSqm: z.number().finite().min(1).max(1_000_000),
  availability: z.enum(["available", "reserved", "sold"]),
  facts: propertyFactsSchema.optional(),
  publicUrl: z.url().refine((value) => value.startsWith("https://") && value.length <= 500).optional(),
});
export const listingFilters = z.strictObject({
  budgetMax: z.number().finite().min(0).max(1_000_000_000).optional(),
  currency: z.enum(["TRY", "USD", "EUR", "GBP"]).optional(),
  location: short(100).optional(),
  locations: z.array(short(100)).min(1).max(3).optional(),
  propertyType: listingInput.shape.propertyType.optional(),
  listingType: listingInput.shape.listingType,
  exactRooms: z.number().int().min(0).max(50).optional(),
  roomLayouts: z.array(z.number().int().min(0).max(50)).min(1).max(3).optional(),
  minRooms: z.number().int().min(0).max(50).optional(),
  minAreaSqm: z.number().finite().min(0).max(1_000_000).optional(),
  availability: z.enum(["available", "reserved", "sold"]).default("available"),
}).refine((value) => value.budgetMax === undefined || value.currency !== undefined, "Currency is required with a budget")
  .refine((value) => !value.roomLayouts || (value.exactRooms === undefined && value.minRooms === undefined),
    "Room alternatives cannot be combined with a single room constraint");

export const searchListings = async (organizationId: mongoose.Types.ObjectId, raw: unknown, freshOnly = true, allStatuses = false) => {
  const filters = listingFilters.parse(raw);
  const query: Record<string, unknown> = { organizationId, archivedAt: { $exists: false }, availability: filters.availability };
  if (allStatuses) query.availability = { $in: ["available", "reserved", "sold"] };
  if (freshOnly) query.updatedAt = { $gte: new Date(Date.now() - 30 * 86_400_000) };
  if (filters.budgetMax !== undefined) query.price = { $lte: filters.budgetMax };
  if (filters.currency) query.currency = filters.currency;
  if (filters.propertyType) query.propertyType = filters.propertyType;
  if (filters.listingType) query.listingType = filters.listingType;
  if (filters.roomLayouts) query.rooms = { $in: filters.roomLayouts };
  if (filters.exactRooms !== undefined) query.rooms = filters.exactRooms;
  if (filters.minRooms !== undefined && filters.exactRooms === undefined) query.rooms = { $gte: filters.minRooms };
  if (filters.minAreaSqm !== undefined) query.areaSqm = { $gte: filters.minAreaSqm };
  if (filters.location) {
    const terms = filters.location.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (!terms.length || terms.length > 6) return [];
    const variants: Record<string, string> = { a: "[aâAÂ]", c: "[cçCÇ]", ç: "[cçCÇ]", g: "[gğGĞ]", ğ: "[gğGĞ]", i: "[iıİI]", ı: "[iıİI]", o: "[oöOÖ]", ö: "[oöOÖ]", s: "[sşSŞ]", ş: "[sşSŞ]", u: "[uüUÜ]", ü: "[uüUÜ]" };
    const pattern = (term: string) => [...term].map((character) => variants[character.toLocaleLowerCase("tr")] ?? character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
    if (terms.length) query.$and = terms.map((term) => ({ location: { $regex: pattern(term), $options: "i" } }));
  }
  if (filters.locations?.length) {
    const variants: Record<string, string> = { a: "[aâAÂ]", c: "[cçCÇ]", ç: "[cçCÇ]", g: "[gğGĞ]", ğ: "[gğGĞ]", i: "[iıİI]", ı: "[iıİI]", o: "[oöOÖ]", ö: "[oöOÖ]", s: "[sşSŞ]", ş: "[sşSŞ]", u: "[uüUÜ]", ü: "[uüUÜ]" };
    const pattern = (term: string) => [...term].map((character) => variants[character.toLocaleLowerCase("tr")] ?? character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
    const alternatives = filters.locations.map((location) => location.match(/[\p{L}\p{N}]+/gu) ?? []);
    if (alternatives.some((terms) => !terms.length || terms.length > 6)) return [];
    query.$or = alternatives.map((terms) => ({ $and: terms.map((term) => ({ location: { $regex: pattern(term), $options: "i" } })) }));
  }
  const found = await Listing.find(query).select("title description location price currency listingType propertyType rooms areaSqm availability publicUrl updatedAt facts")
    .sort({ updatedAt: -1, _id: 1 }).limit(freshOnly ? filters.locations ? 30 : 10 : 100).lean();
  if (!filters.locations?.length) return found;
  const folded = (value: string) => value.toLocaleLowerCase("tr").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
  const rank = (location: string) => {
    const index = filters.locations!.findIndex((term) => folded(location).includes(folded(term)));
    return index < 0 ? filters.locations!.length : index;
  };
  return found.sort((a, b) => rank(a.location) - rank(b.location)).slice(0, freshOnly ? 10 : 100);
};

const contactPatterns = {
  email: /e[\s-]?(?:mail|posta)|eposta/i,
  website: /web\s*(?:site|adres)|website|site url/i,
  phone: /telefon|\bphone\b|\btelephone\b/i,
  address: /(?:^|[^\p{L}-])adres(?:iniz|i|in)?(?=\s|[,.!?]|$)|\b(?:street|office|business|postal|physical) address\b|^address$/iu,
};
export const requestedContactFields = (topic: string) => {
  const nonAddress = topic.replace(/(?:e[ -]?(?:mail|posta)|web(?:site| sitesi)?)\s+(?:adres\p{L}*|address)/giu, "");
  return (Object.keys(contactPatterns) as Array<keyof typeof contactPatterns>).filter(
    (field) => contactPatterns[field].test(field === "address" ? nonAddress : topic));
};

export const retrieveKnowledge = async (organizationId: mongoose.Types.ObjectId, topic: string) => {
  const [knowledge, organization] = await Promise.all([
    BusinessKnowledge.findOne({ organizationId }).lean(),
    Organization.findById(organizationId).select("timeZone openingHours").lean(),
  ]);
  const needle = topic.trim().toLocaleLowerCase().slice(0, 100);
  const contactFields = requestedContactFields(needle);
  if (contactFields.length) {
    const contact = Object.fromEntries(contactFields.flatMap((field) => {
      const value = knowledge?.contact?.[field];
      return value ? [[field, value]] : [];
    }));
    return { contact, timeZone: organization?.timeZone ?? "UTC" };
  }
  const intent = /service|hizmet|offer|yardım/.test(needle) ? "services"
    : /contact|iletişim|telefon|email|address|adres/.test(needle) ? "contact"
      : /hour|saat|open|açık|çalışma/.test(needle) ? "hours"
        : /polic|policy|kural|ilke|koşul|gizlilik/.test(needle) ? "policies"
          : /faq|question|soru/.test(needle) ? "faqs"
            : /intro|company|business|profile|about|kim|hakkında|tanıt/.test(needle) ? "profile" : "literal";
  const matches = (value: string) => !needle || value.toLocaleLowerCase().includes(needle);
  return {
    profile: !needle || intent === "profile" || intent === "services" || matches(knowledge?.profile ?? "") ? knowledge?.profile ?? "" : "",
    services: (knowledge?.services ?? []).filter((item) => !needle || intent === "services" || matches(`${item.name} ${item.description}`)).slice(0, 8),
    faqs: (knowledge?.faqs ?? []).filter((item) => !needle || intent === "faqs" || matches(`${item.question} ${item.answer}`)).slice(0, 8),
    policies: (knowledge?.policies ?? []).filter((item) => !needle || intent === "policies" || matches(`${item.title} ${item.text}`)).slice(0, 5),
    facts: (knowledge?.facts ?? []).filter((item) => !needle || intent === "services" || matches(`${item.label} ${item.value}`)).slice(0, 8),
    contact: !needle || intent === "contact" ? knowledge?.contact ?? null : null,
    openingHours: !needle || intent === "hours" ? organization?.openingHours ?? [] : [],
    timeZone: organization?.timeZone ?? "UTC",
  };
};
