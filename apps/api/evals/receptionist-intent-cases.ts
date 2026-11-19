import type { z } from "zod";
import type { intentPlanSchema } from "../src/services/receptionist-intent.js";

type Plan = z.infer<typeof intentPlanSchema>;
type Item = Plan["intents"][number];
export const item = (kind: Item["kind"], mode: Item["mode"], evidence: string, fields: Partial<Item> = {}): Item => ({
  kind, mode, evidence, reference: { kind: "none", position: null }, attributes: [], locations: [], rooms: [],
  furnishing: null, uncertainty: [], ...fields,
});
export const position = (index: number) => ({ reference: { kind: "position" as const, position: index } });
export const ambiguous = { reference: { kind: "ambiguous" as const, position: null }, uncertainty: ["which_listing" as const] };
export const unseen = [
  { history: ["Telefonda ikinci daireyi konuşmuştuk.", "İki seçeneği de gösterebilirim."], latest: "Eşyalı mı?", plan: [item("property_fact", "question", "Eşyalı mı", { attributes: ["furnished"], reference: { kind: "focused", position: null } })] },
  { history: ["İlanda mobilya durumu yazmıyor."], latest: "Eşyalı istiyorum, balkonu da olsun.", plan: [item("preference", "preference", "Eşyalı istiyorum", { furnishing: true }), item("preference", "preference", "balkonu da olsun", { attributes: ["balcony"] })] },
  { history: ["İlk iki ilanı görüntülediniz."], latest: "İkinci evin depozitosunu ve aidatını ayrı ayrı söyler misin?", plan: [item("property_fact", "question", "İkinci evin depozitosunu ve aidatını", { ...position(2), attributes: ["maintenanceFee", "deposit"] })] },
  { history: ["Şimdilik Özlüce diyelim."], latest: "Balat ya da Kültür de olur, 1+1 veya 2+1 bakabiliriz.", plan: [item("preference", "preference", "Balat ya da Kültür", { locations: ["Balat", "Kültür"] }), item("preference", "preference", "1+1 veya 2+1", { rooms: [1, 2] })] },
  { history: ["Bir danışman yarın uygun olabilir."], latest: "Olmadı hafta içi bakarız, bir de telefon numaranız nedir?", plan: [item("viewing", "request", "hafta içi bakarız", { uncertainty: ["missing_time"] }), item("contact", "question", "telefon numaranız nedir")] },
  { history: ["Gösterim için bir gün seçelim."], latest: "Olur gibi ama kesinleştirmeyelim.", plan: [item("confirmation_deferral", "request", "kesinleştirmeyelim")] },
  { history: ["İlkini ve ikincisini açtım."], latest: "Yandaki olanın masrafı ne?", plan: [item("property_fact", "question", "Yandaki olanın masrafı ne", ambiguous)] },
  { history: ["Görükle'de kiralık arıyordunuz."], latest: "Beni insan bir danışmana bağlar mısınız, karar veremedim.", plan: [item("handoff", "request", "insan bir danışmana bağlar mısınız")] },
] as const;
