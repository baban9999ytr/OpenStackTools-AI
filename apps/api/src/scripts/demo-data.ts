export const DEMO_OWNER_EMAIL = "demo-owner@openstacktools.test";
export const DEMO_ORGANIZATION_NAME = "DEMO — Nilüfer Demo Emlak";
export const DEMO_SEED_ID = "nilufer-demo-emlak-v1";

const apartment = (title: string, neighborhood: string, price: number, rooms: number, areaSqm: number, listingType: "rent" | "sale", availability: "available" | "reserved" | "sold" = "available", stale = false) => ({
  title: `DEMO — ${title}`,
  description: `Tamamen kurgusal ${rooms}+1 ${listingType === "rent" ? "kiralık" : "satılık"} daire. Gerçek ilan veya teklif değildir.`,
  location: `Bursa, ${neighborhood}`,
  price, currency: "TRY" as const, listingType, propertyType: "apartment" as const,
  rooms, areaSqm, availability, stale,
});

export const demoListings = [
  apartment("Örnek Park Dairesi", "Nilüfer, Görükle", 27_500, 3, 115, "rent"),
  apartment("Örnek Bahçe Dairesi", "Nilüfer, 23 Nisan", 29_000, 3, 125, "rent"),
  apartment("Örnek Kent Dairesi", "Nilüfer, Özlüce", 32_000, 3, 130, "rent"),
  apartment("Örnek Stüdyo", "Nilüfer, Görükle", 18_000, 1, 55, "rent"),
  apartment("Örnek Aile Evi", "Nilüfer, Ataevler", 24_500, 2, 95, "rent"),
  apartment("Örnek Geniş Daire", "Nilüfer, Balat", 43_000, 4, 180, "rent"),
  apartment("Örnek Satılık Daire", "Nilüfer, FSM", 4_850_000, 2, 100, "sale"),
  apartment("Örnek Satılık Aile Dairesi", "Nilüfer, Küçük Sanayi", 6_900_000, 3, 145, "sale"),
  apartment("Örnek Osmangazi Dairesi", "Osmangazi, Çekirge", 28_000, 3, 118, "rent"),
  apartment("Örnek Mudanya Dairesi", "Mudanya, Güzelyalı", 35_000, 2, 110, "rent"),
  apartment("Örnek Rezerve Daire", "Nilüfer, İhsaniye", 26_000, 3, 120, "rent", "reserved"),
  apartment("Örnek Eski İlan", "Nilüfer, Ertuğrul", 25_000, 3, 112, "rent", "available", true),
  apartment("Örnek Satılmış Daire", "Nilüfer, Beşevler", 5_200_000, 3, 130, "sale", "sold"),
] as const;

export const demoConsultants = [
  { name: "DEMO — Deniz Yalın", email: "deniz.yalin@openstacktools.test", services: "Kiralık konut, yer gösterimi", start: 540, end: 1020 },
  { name: "DEMO — Ece Ardıç", email: "ece.ardic@openstacktools.test", services: "Satılık konut, danışmanlık", start: 600, end: 1080 },
  { name: "DEMO — Mert Çınar", email: "mert.cinar@openstacktools.test", services: "Portföy tanıtımı, müşteri görüşmesi", start: 540, end: 960 },
] as const;
