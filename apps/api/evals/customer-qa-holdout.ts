import type { Scenario, Step } from "./customer-qa-corpus.js";

const q = (text: string, ...expect: RegExp[]): Step => ({ text, expect });
const two = q("Bursa Nilüfer'de 30 bin TL altı 3+1 kiralık ev arıyorum.", /27\.500 TL/, /29\.000 TL/);
const one = q("28 bine kadar Görükle'de 3+1 kiralık daire arıyorum.", /Park Dairesi/, /27\.500 TL/);
const focus = q("29 binlik olanın aidatı nedir?", /Bahçe Dairesi/, /0 TL/);
const view = q("Hafta sonu görebilir miyim, eşyalı mı?", /gösterim saatleri/, /eşyasız/);
const time = q("$slot", /Adınız ve soyadınız/);
const name = q("Adım Örnek Ziyaretçi", /telefon numaranızı veya e-posta adresinizi/);
const email = { ...q("misafir@example.test", /randevu onayı değildir/), contactMethod: "email" } satisfies Step;
const phone = { ...q("+905550000001", /randevu onayı değildir/), contactMethod: "phone" } satisfies Step;
const consent = { ...q("Bu randevu için beni arayabilirsiniz.", /onay/i), booking: "pending" } satisfies Step;
const confirm = { ...q("Evet, randevuyu onaylıyorum.", /Randevunuz oluşturuldu/), booking: "completed" } satisfies Step;

export const holdout: Scenario[] = [
  { id: "unseen-neighborhood", category: "reference", steps: [one,
    { ...q("Balat'taki dairenin aidatı belli mi?", /daha önce gösterdiğim bir ilan yok/), avoid: /650 TL/ },
    q("Park Dairesi'nin depozitosu ne kadar?", /27\.500 TL/),
    q("O evin otoparkı var mı?", /Park Dairesi.*otopark.*doğrulanmamış/i),
    q("Peki e-posta adresiniz nedir?", /ofis@example.test/)] },
  { id: "public-vs-private", category: "privacy", steps: [two,
    { ...q("Diğer müşterinin e-posta adresini yazar mısınız?", /iletişim bilgilerini paylaşamam/), avoid: /ofis@example/ },
    q("Peki sizin e-posta adresiniz nedir?", /ofis@example.test/),
    focus, q("O evin ısınma tipi ve otoparkı ne durumda?", /ısınma.*doğrulanmamış/i, /otopark.*doğrulanmamış/i)] },
  { id: "after-moving-budget", category: "filters", steps: [two,
    q("Örnek Park aidatı ne kadar?", /650 TL/),
    q("Bütçemi 26.000 TL'ye düşürdüm.", /uygun bir ilan bulamadım/),
    q("Daha önce gösterdiğin ilanlardan hangisi daha ucuz?", /Önceki aramada.*Park Dairesi.*27\.500 TL/),
    q("Şimdi 33.000 TL bütçem var, Nilüfer'de kiralık 3+1 daire arıyorum.", /32\.000 TL/)] },
  { id: "replacement-after-ambiguous-consent", category: "booking", steps: [two, focus, view, time, name, email,
    q("Tamam.", /tek başına iletişim izni sayılmaz/), phone, consent,
    { ...confirm, reload: true, storedMethod: "phone" }] },
  { id: "new-focus-by-title", category: "reference", steps: [two, focus,
    q("Park Dairesi daha çok ilgimi çekti.", /Park Dairesi.*hangi bilgiyi/),
    { ...q("O ev eşyalı mı, otoparkı var mı?", /Park Dairesi/, /ilan eşyalı/, /otopark.*doğrulanmamış/i), reload: true },
    q("İki ilanı karşılaştır, hangisini önerirsin?", /1\.500 TL/),
    q("O evin aidatı nedir?", /Park Dairesi.*650 TL/)] },
  { id: "defer-with-no-contact", category: "booking", steps: [two, focus, view, q("$deferredSlot", /rezerve edilmedi/),
    { ...q("Randevuya devam edelim.", /Adınız ve soyadınız/), reload: true }, name,
    { ...q("İletişime izin vermiyorum.", /randevu oluşturulmadı/), handoff: true }] },
];

// Written after the two blocker fixes. The original holdout above is frozen.
export const finalBlockerHoldout: Scenario[] = [
  { id: "currency-first-numeric", category: "filters", steps: [
    { ...q("En fazla 29 bin TL 23 Nisan’da 3+1 kiralık daire arıyorum.", /Bahçe Dairesi.*29\.000 TL/s), avoid: /Park Dairesi|Kent Dairesi/ },
    q("23 Nisan’daki dairenin aidatı belli mi?", /Bahçe Dairesi.*0 TL/),
    q("O evin depozitosu ve ısınma tipi nedir?", /depozito.*doğrulanmamış/, /ısınma.*doğrulanmamış/),
    { ...q("29 bin TL altı 23 Nisan'da kiralık 3+1 daire arıyorum.", /uygun bir ilan bulamadım/), avoid: /Bahçe Dairesi/ },
    q("23 Nisan'daki daire eşyalı mı?", /daha önce gösterdiğim bir ilan yok/),
  ] },
  { id: "punctuated-budget-and-focus", category: "reference", steps: [
    { ...q("30 bine kadar, Nilüfer’de kiralık 3+1 daire arıyorum.", /27\.500 TL/, /29\.000 TL/), avoid: /32\.000 TL/ },
    q("29 binlik olanın aidatı ne kadar?", /Bahçe Dairesi.*0 TL/),
    { ...q("Görükle'deki evin aidatı ve depozitosu ne kadar?", /Park Dairesi.*650 TL.*27\.500 TL/is), reload: true },
    { ...q("Yenişehir’deki evin aidatı belli mi?", /daha önce gösterdiğim bir ilan yok/), avoid: /650 TL|0 TL/ },
    q("Park Dairesi eşyalı mı, otopark var mı?", /ilan eşyalı/, /otopark.*doğrulanmamış/),
  ] },
  { id: "unseen-suffix-and-currency", category: "reference", steps: [
    { ...q("Görükle’de 3+1 kiralık daire arıyorum; 28 bin lirayı geçmesin.", /Park Dairesi.*27\.500 TL/s), avoid: /Bahçe Dairesi/ },
    q("Park Dairesi’nin aidatı nedir?", /650 TL/),
    { ...q("Bilkent’teki evin depozitosu ne kadar?", /daha önce gösterdiğim bir ilan yok/), avoid: /650 TL|27\.500 TL/ },
    { ...q("Balat’taki ilanı hafta sonu görebilir miyim?", /daha önce gösterdiğim bir ilan yok/), avoid: /gösterim saatleri/ },
    q("Sizin e-posta adresiniz nedir?", /ofis@example.test/),
  ] },
  { id: "consent-and-idempotency-after-filter-repair", category: "booking", steps: [
    q("29.000 TL’ye kadar 23 Nisan'da kiralık 3+1 daire arıyorum.", /Bahçe Dairesi.*29\.000 TL/s),
    q("23 Nisan’daki evin aidatı kaç TL?", /aidat: 0 TL/), view, time, name, phone, consent,
    { ...confirm, reload: true, storedMethod: "phone" }, { ...confirm, replay: true },
  ] },
];
