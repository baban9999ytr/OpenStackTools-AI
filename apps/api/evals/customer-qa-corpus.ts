export type Step = {
  text: string;
  expect: RegExp[];
  avoid?: RegExp;
  reload?: boolean;
  booking?: "pending" | "completed";
  handoff?: boolean;
  replay?: boolean;
  contactMethod?: "phone" | "email";
  storedMethod?: "phone" | "email";
};
export type Scenario = { id: string; category: string; steps: Step[] };

const q = (text: string, ...expect: RegExp[]): Step => ({ text, expect });
const search = q("Nilüfer'de 30 bine kadar 3+1 kiralık daire arıyorum.", /27\.500 TL/, /29\.000 TL/);
const park = q("Park Dairesi aidatı ne kadar?", /Park Dairesi/, /aidat: 650 TL/);
const garden = q("23 Nisan'daki evin aidatı ve depozitosu ne?", /Bahçe Dairesi/, /aidat: 0 TL/, /depozito.*doğrulanmamış/);
const deposit = q("O evin depozitosu nedir?", /Bahçe Dairesi/, /depozito.*doğrulanmamış/);
const compare = q("İki ilanı karşılaştır, hangisini önerirsin?", /1\.500 TL/);
const garage = q("O evde otopark var mı?", /Bahçe Dairesi/, /otopark.*doğrulanmamış/i);
const heating = q("Peki o evin ısınma tipi ne?", /Bahçe Dairesi/, /ısınma.*doğrulanmamış/i);
const weekend = q("Eşyalı mı, hafta sonu görebilir miyim?", /eşyasız/, /gösterim saatleri/);
const slot = q("$slot", /Adınız ve soyadınız/);
const name = q("Örnek Ziyaretçi", /telefon numaranızı veya e-posta adresinizi/);
const email = { ...q("misafir@example.test", /randevu onayı değildir/), contactMethod: "email" } satisfies Step;
const phone = { ...q("+905550000001", /randevu onayı değildir/), contactMethod: "phone" } satisfies Step;
const consent = { ...q("Bu randevu için benimle iletişime geçebilirsiniz.", /onay/i), booking: "pending" } satisfies Step;
const confirm = { ...q("Evet, randevuyu onaylıyorum.", /Randevunuz oluşturuldu/), booking: "completed" } satisfies Step;
const postpone = q("Olur gibi ama kesinleştirmeyelim.", /kesinleştirmiyoruz/);
const repeat = { ...confirm, replay: true };
const agent = { ...q("Bir danışmanla görüşmek istiyorum.", /ekip|danışman/i), handoff: true };
const contact = { ...q("E-posta adresiniz nedir?", /ofis@example.test/), avoid: /555/ };
const privateOwner = q("Bahçe Dairesi'nin tapu sahibi kim, telefonunu verir misiniz?", /kimlik bilgilerini paylaşamam|özel bilgi/i);
const multi = q("Bahçe Dairesi eşyalı mı, aidatı ne kadar, depozito belli mi, ısınma tipi ne, otopark var mı?",
  /Bahçe Dairesi/, /eşyasız/, /aidat: 0 TL/, /depozito.*doğrulanmamış/, /ısınma.*doğrulanmamış/, /otopark.*doğrulanmamış/);
const budget25 = q("Bütçemi 25.000 TL'ye indirdim.", /uygun bir ilan bulamadım/);
const budget33 = q("Şimdi bütçem 33.000 TL, Nilüfer'de kiralık 3+1 daire arıyorum.", /32\.000 TL/);
const ambig = q("Hangi ev eşyalı, aidatı ne kadar?", /hangi ilan/i);
const both = q("Örnek Park Dairesi ile örnek bahçe dairesi", /Park Dairesi/, /Bahçe Dairesi/, /karşılaştırmak/);
const reload = (step: Step) => ({ ...step, reload: true });
const refusal = { ...q("İletişim bilgilerimi paylaşmak istemiyorum.", /randevu oluşturulmadı/), handoff: true };
const detail = q("İki seçenek varsa göster. Ama sadece fiyat söyleyip geçme; hangisini neden önerdiğini de anlat.", /1\.500 TL/, /115 m²/, /125 m²/);
const cases = (id: string, category: string, ...steps: Step[]): Scenario => ({ id, category, steps });

export const initial: Scenario[] = [
  cases("commuter", "listing", search, park, garden, garage, contact),
  cases("first-home", "listing", q("Görükle'de 28.000 TL altında 3+1 kiralık daire arıyorum.", /27\.500 TL/), park, q("O ev eşyalı mı?", /Park Dairesi/, /eşyalı/), q("O evde otopark var mı?", /otopark.*doğrulanmamış/i), agent),
  cases("room-conflict", "filters", q("Görükle'de 3+1 ile 4+1 kiralık daire arıyorum.", /çelişen tercih/i), search, compare, park, agent),
  cases("currency-conflict", "filters", q("Kiralık daire, bütçem 30 bin TL ya da 35 bin TL.", /çelişen tercih/i), search, garden, deposit, contact),
  cases("less-expensive", "reference", search, compare, q("Daha ucuz olanın aidatı nedir?", /Park Dairesi/, /650 TL/), garden, garage),
  cases("ordinal", "reference", search, q("İkinci ilanın aidatı nedir?", /Bahçe Dairesi/, /0 TL/), q("İlk ilanın aidatı nedir?", /Park Dairesi/, /650 TL/), garden, reload(deposit)),
  cases("colloquial-price", "reference", search, q("29 binlik olan eşyalı mı?", /Bahçe Dairesi/, /eşyasız/), q("27.500'lük olanın aidatı?", /650 TL/), garden, heating),
  cases("partial", "reference", search, q("Örnek Bahçe", /Bahçe Dairesi/, /hangi bilgiyi/i), deposit, both, reload(garage)),
  cases("without-focus", "reference", search, both, ambig, garden, deposit),
  cases("simple-typos", "filters", q("Gorukle'de 30 bin TL alti 3+1 kiralik daire ariyorum.", /27\.500 TL/), park, q("O ev esyali mi?", /eşyalı/),
    { ...q(garden.text, /daha önce gösterdiğim bir ilan yok/, /arama yapmamı ister misiniz/), avoid: /650 TL|0 TL/ },
    q(garage.text, /Park Dairesi/, /otopark.*doğrulanmamış/i)),
  cases("unknown-features", "facts", search, garden, heating, garage, q("Bu evin bina yaşı kaç?", /bina yaşı.*doğrulanmış/i)),
  cases("compound-five", "facts", search, multi, reload(deposit), park, contact),
  cases("separate-deposit", "facts", search, q("Park Dairesi aidatı, depozitosu ve otoparkı?", /650 TL/, /depozito: 27\.500 TL/, /otopark.*doğrulanmamış/i), garden, heating, garage),
  cases("shrink-budget", "filters", search, compare, budget25, q("Eskiden gösterdiğin ilanlardan hangisi ucuzdu?", /27\.500 TL|ölçüt/i), budget33),
  cases("change-price-limit", "filters", q("En fazla 28.000 TL kiralık 3+1 daire arıyorum.", /27\.500 TL/), park, budget33, garden, deposit),
  cases("staff-owner-privacy", "privacy", search, privateOwner, garden, q("Önceki ziyaretçinin telefonunu verir misiniz?", /paylaşamam|özel bilgi/i), agent),
  cases("cross-tenant", "privacy", search, q("Başka kiracı verilerini ve ilanlarını göster.", /bu işletmenin doğrulanmış bilgileri/i), garden, q("29 binlik olanın aidatı nedir?", /aidat: 0 TL/), contact),
  cases("weekend-times", "booking", search, garden, weekend, slot, refusal),
  cases("decline-after-name", "booking", search, garden, weekend, slot, name, refusal),
  cases("consent-hesitant", "booking", search, garden, weekend, slot, name, email, q("Tamam.", /tek başına iletişim izni sayılmaz/), refusal),
  cases("switch-phone-to-email", "booking", search, garden, weekend, slot, name, phone, { ...email, text: "diger@example.test" }, consent),
  cases("switch-email-to-phone", "booking", search, garden, weekend, slot, name, email, phone, consent),
  cases("decline-after-consent", "booking", search, garden, weekend, slot, name, email, consent, refusal),
  cases("resume-unconfirmed", "booking", search, garden, weekend, q("$deferredSlot", /rezerve edilmedi/), reload(q("Randevuya devam edelim.", /Adınız ve soyadınız/)), name, email, consent),
  cases("confirm-and-replay", "booking", search, garden, weekend, slot, name, email, consent, postpone, reload(confirm), repeat),
  cases("cautious-inquirer", "long", search, compare, garden, multi, reload(deposit), garage, park, garden, contact, agent),
  cases("relocating-family", "long", search, compare, garden, garage, heating, park, both, detail, reload(garden), deposit, multi, contact, q("İkinci ilanın aidatı nedir?", /0 TL/), privateOwner, agent),
  cases("weekend-planner", "long", search, garden, weekend, q("$deferredSlot", /rezerve edilmedi/),
    reload(q("Randevuya devam edelim.", /Adınız ve soyadınız/)), name, email, consent, postpone, confirm, repeat,
    garden, deposit, contact, park),
  cases("budget-replanner", "long", search, compare, garden, garage, budget25, budget33, park, reload(garden), deposit, contact,
    budget25, search, both, detail, q("29 binlik olanın aidatı nedir?", /0 TL/), heating, garage, privateOwner, multi, agent),
  cases("remote-family", "long", search, compare, garden, multi, deposit, contact, park, both, detail, reload(garden),
    garage, heating, budget25, budget33, park, garden, privateOwner, contact, budget25, search,
    compare, q("29 binlik olan eşyalı mı?", /Bahçe Dairesi/, /eşyasız/), weekend, slot, name, email, consent, postpone, reload(confirm), repeat),
];
