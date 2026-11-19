import { randomBytes } from "node:crypto";
import { hash } from "bcrypt";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Appointment, AppointmentSlot, Assistant, BusinessKnowledge, Conversation, Customer, DemoSeed, Listing, Membership, Message, Organization, StaffAvailability, User } from "../models/index.js";
import { demoConsultants, demoListings, DEMO_ORGANIZATION_NAME, DEMO_OWNER_EMAIL, DEMO_SEED_ID } from "./demo-data.js";

const localHosts = new Set(["localhost", "127.0.0.1", "mongo"]);
const databaseHost = new URL(env.mongoUrl).hostname;
if (env.nodeEnv === "production" || !localHosts.has(databaseHost) || process.env.DEMO_SEED_CONFIRM !== "local-demo-only")
  throw new Error("Demo seed requires a local MongoDB host, non-production mode and DEMO_SEED_CONFIRM=local-demo-only");
const ownerPassword = process.env.DEMO_OWNER_PASSWORD ?? "qwe123";
if (ownerPassword.length < 12 || ownerPassword.length > 128)
  throw new Error("Set DEMO_OWNER_PASSWORD to a private 12–128 character development-only password");

await mongoose.connect(env.mongoUrl);
try {
  const requestedEmailExists = Boolean(await User.exists({ email: "test@gmail.com" }));
  process.stdout.write(`Requested Gmail identity: ${requestedEmailExists ? "already registered" : "not registered"}; never provisioned or modified.\n`);
  const marker = await DemoSeed.findById(DEMO_SEED_ID).lean();
  if (marker) {
    const [organization, owner, ownership, listingCount, staffCount, appointmentCount] = await Promise.all([
      Organization.findById(marker.organizationId).lean(), User.findById(marker.ownerId).lean(),
      Membership.exists({ organizationId: marker.organizationId, userId: marker.ownerId, role: "owner" }),
      Listing.countDocuments({ organizationId: marker.organizationId }),
      StaffAvailability.countDocuments({ organizationId: marker.organizationId }),
      Appointment.countDocuments({ organizationId: marker.organizationId }),
    ]);
    if (!organization || organization.name !== DEMO_ORGANIZATION_NAME || owner?.email !== DEMO_OWNER_EMAIL || !ownership || listingCount !== demoListings.length || staffCount !== demoConsultants.length || appointmentCount !== 2)
      throw new Error("Demo marker exists but records differ; refusing to modify them");
    process.stdout.write(`Demo already present: ${listingCount} listings, ${staffCount} consultants. No records changed.\n`);
  } else {
    const emailAddresses = [DEMO_OWNER_EMAIL, ...demoConsultants.map((item) => item.email)];
    const occupied = await User.exists({ email: { $in: emailAddresses } });
    if (occupied || await Organization.exists({ name: DEMO_ORGANIZATION_NAME }))
      throw new Error("Demo identity or organization name already exists without a seed marker; refusing to take ownership");
    // test@gmail.com is deliberately never created, modified or used for login.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [organization] = await Organization.create([{
          name: DEMO_ORGANIZATION_NAME, timeZone: "Europe/Istanbul",
          dailyBudgetMicros: env.defaultDailyBudgetMicros, monthlyBudgetMicros: env.defaultMonthlyBudgetMicros,
          retentionDays: 30,
          openingHours: [1, 2, 3, 4, 5].map((day) => ({ day, startMinute: 540, endMinute: 1080 })),
        }], { session });
        if (!organization) throw new Error("Demo organization creation failed");
        const [owner] = await User.create([{ email: DEMO_OWNER_EMAIL, name: "DEMO — Yerel Yönetici", passwordHash: await hash(ownerPassword, 12), emailVerifiedAt: new Date() }], { session });
        if (!owner) throw new Error("Demo owner creation failed");
        await Membership.create([{ organizationId: organization._id, userId: owner._id, role: "owner" }], { session });
        const staffIds: mongoose.Types.ObjectId[] = [];
        for (const consultant of demoConsultants) {
          const [person] = await User.create([{ email: consultant.email, name: consultant.name, passwordHash: await hash(randomBytes(48).toString("hex"), 12) }], { session });
          if (!person) throw new Error("Demo consultant creation failed");
          staffIds.push(person._id);
          await Membership.create([{ organizationId: organization._id, userId: person._id, role: "agent" }], { session });
          await StaffAvailability.create([{ organizationId: organization._id, staffId: person._id,
            services: consultant.services.split(", ").map((service) => `DEMO — ${service}`),
            appointmentDurationsMinutes: [30, 60],
            windows: [1, 2, 3, 4, 5].map((day) => ({ day, startMinute: consultant.start, endMinute: consultant.end })) }], { session });
        }
        const [assistant] = await Assistant.create([{ organizationId: organization._id,
          name: "DEMO — Nilüfer Emlak Asistanı", responseLength: "short",
          instructions: "You are the fictional Nilüfer Demo Emlak receptionist. Answer in the visitor's language. Use only verified demo business data and current listings. Ask for consent before saving contact details. Never invent available times or claim a booking before confirmation. Clearly say this is a demo when relevant.",
          publicKey: `ost_demo_${randomBytes(16).toString("hex")}`, allowedOrigins: [env.dashboardOrigin], active: true,
        }], { session });
        if (!assistant) throw new Error("Demo assistant creation failed");
        await BusinessKnowledge.create([{ organizationId: organization._id,
          profile: "DEMO — Nilüfer Demo Emlak, Bursa Nilüfer çevresinde kurgusal kiralık ve satılık konut portföyü sunan örnek bir emlak işletmesidir. Gerçek ilan, temsilci veya hizmet değildir.",
          services: [
            { name: "DEMO — Kiralık konut danışmanlığı", description: "Kayıtlı örnek ilanları arama ve kurgusal danışmanla görüşme planlama.", price: "Ücret için danışmana sorun; doğrulanmış ücret kaydı yok." },
            { name: "DEMO — Satılık konut danışmanlığı", description: "Kurgusal portföy hakkında bilgi ve görüşme talebi.", price: "Ücret belirtilmemiş." },
          ],
          faqs: [
            { question: "DEMO — Evleri görebilir miyim?", answer: "Uygun bir danışmanla görüşme saati talep edebilirsiniz; ilanlar kurgusaldır." },
            { question: "DEMO — Kapora alıyor musunuz?", answer: "Bu demo para veya kapora kabul etmez." },
            { question: "DEMO — Gerçek müşteri bilgilerim saklanır mı?", answer: "Bu ortam yalnızca sentetik test verileri içindir. Gerçek kişisel bilgi girmeyin." },
          ],
          policies: [
            { title: "DEMO — İletişim ve devir", text: "Gerektiğinde görüşme ekip üyesine devredilir; yanıt süresi taahhüt edilmez." },
            { title: "DEMO — Randevu onayı", text: "Randevu oluşturma, taşıma ve iptal için açık onay gerekir." },
          ],
          contact: { email: "demo@openstacktools.test", phone: "000-000-0000", address: "DEMO — Nilüfer, Bursa (gerçek adres değildir)", website: "" },
          facts: demoConsultants.map((person) => ({ label: person.name, value: `${person.services}; Europe/Istanbul çalışma saatleri ve canlı müsaitlik sunucudan kontrol edilir.` })),
        }], { session });
        const listings = await Listing.insertMany(demoListings.map(({ stale: _stale, ...item }) => ({ ...item, organizationId: organization._id })), { session });
        for (let index = 0; index < demoListings.length; index++) {
          const listing = listings[index];
          if (demoListings[index]?.stale && listing)
            await Listing.updateOne({ _id: listing._id }, { $set: { updatedAt: new Date(Date.now() - 45 * 86_400_000) } }, { session, timestamps: false });
        }
        const visitorId = `demo-visitor-${randomBytes(8).toString("hex")}`;
        const [conversation] = await Conversation.create([{ organizationId: organization._id, assistantId: assistant._id, visitorId, status: "handoff" }], { session });
        if (!conversation) throw new Error("Demo conversation creation failed");
        await Message.insertMany([
          { organizationId: organization._id, conversationId: conversation._id, role: "customer", text: "DEMO — Nilüfer'de 30.000 TL altında kiralık 3+1 daire arıyorum." },
          { organizationId: organization._id, conversationId: conversation._id, role: "assistant", text: "DEMO — Güncel örnek ilanları kontrol edebilirim. Hangi mahalleleri tercih edersiniz?" },
          { organizationId: organization._id, conversationId: conversation._id, role: "customer", text: "DEMO — Bir emlak danışmanıyla görüşmek isterim." },
        ], { session });
        await Customer.create([{ organizationId: organization._id, conversationId: conversation._id, visitorId,
          name: "DEMO — Örnek Ziyaretçi", contact: "visitor@openstacktools.test", request: "DEMO — Kiralık 3+1 talebi",
          consent: { recorded: true, source: "synthetic_demo_fixture", at: new Date() },
          requirements: "DEMO — Nilüfer çevresi, kiralık 3+1", budgetMax: 30_000, preferredLocations: ["Nilüfer"],
          propertyTypes: ["apartment"], minRooms: 3, leadStatus: "new",
          identityKey: `${conversation._id.toString()}:${visitorId}`,
        }], { session });
        const [secondConversation] = await Conversation.create([{ organizationId: organization._id, assistantId: assistant._id,
          visitorId: `demo-visitor-${randomBytes(8).toString("hex")}`, status: "bot" }], { session });
        if (!secondConversation) throw new Error("Second demo conversation creation failed");
        await Message.insertMany([
          { organizationId: organization._id, conversationId: secondConversation._id, role: "customer", text: "DEMO — Is there a 2+1 sale apartment near FSM?" },
          { organizationId: organization._id, conversationId: secondConversation._id, role: "assistant", text: "DEMO — I can check current fictional listings and connect you with a consultant." },
        ], { session });
        // Future weekday local 10:00/11:00 UTC+3. Türkiye does not observe DST.
        const future = new Date(); future.setUTCHours(0, 0, 0, 0);
        future.setUTCDate(future.getUTCDate() + 1);
        while ([0, 6].includes(future.getUTCDay())) future.setUTCDate(future.getUTCDate() + 1);
        for (const [index, hour] of [7, 8].entries()) {
          const staffId = staffIds[index]; if (!staffId) continue;
          const startAt = new Date(future.getTime() + hour * 3_600_000);
          const endAt = new Date(startAt.getTime() + 30 * 60_000);
          const [appointment] = await Appointment.create([{ organizationId: organization._id, staffId, startAt, endAt,
            status: "booked", createdBy: "staff" }], { session });
          if (!appointment) throw new Error("Demo appointment creation failed");
          await AppointmentSlot.insertMany([0, 15].map((minutes) => ({ organizationId: organization._id, staffId,
            appointmentId: appointment._id, startAt: new Date(startAt.getTime() + minutes * 60_000) })), { session });
        }
        await DemoSeed.create([{ _id: DEMO_SEED_ID, organizationId: organization._id, ownerId: owner._id, version: 1 }], { session });
      });
    } finally { await session.endSession(); }
    process.stdout.write(`Local demo created: ${demoListings.length} listings, ${demoConsultants.length} consultants, 2 occupied appointment fixtures. Requested Gmail address was not provisioned.\n`);
  }
} finally { await mongoose.disconnect(); }
