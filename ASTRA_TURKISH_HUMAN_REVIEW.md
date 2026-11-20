# ASTRA Türkçe insan değerlendirmesi

**Durum: İnceleme bekleniyor.** Bu formu bağımsız bir Türkçe konuşmacısı doldurmalıdır. Operatör veya uygulama testi onayı yerine geçmez.

Aday kaynak SHA-256 `62484deb41b3462a5fdbca843d86cc3d38658cee07c7b089511854013fd741c7`. İki canlı çağrı sentetik verilerle tamamlandı. Uygulama 10/10 kontrolü geçti. Luna’nın ham planlarından biri kabul edildi, diğeri reddedildi.

## 1. İkinci ilanın aidatı ve depozitosu

**Müşteri:** “İkinci evin depozitosunu ve aidatını ayrı ayrı söyler misin?”

**Ham model kararı:** İkinci ilanı (`position: 2`) ve `deposit`, `maintenanceFee` alanlarını doğru belirledi. Ayrıca önceki müşterinin “İki ilanı karşılaştır, hangisini önerirsin?” mesajından bir karşılaştırma niyeti ekledi. Sunucu güncel mesajda bu ek niyeti destekleyen kanıt bulamadığı için planın tamamını reddetti.

**Müşteriye gösterilen yanıt:** “Synthetic Garden Flat — aidat: 0 TL. depozito bilgisi kayıtlarda yok ve doğrulanmamış.”

- [ ] GEÇTİ  [ ] KALDI — Sistem önceki isteğin yanlışlıkla tekrarlandığı durumu güvenli biçimde ele aldı mı?
- [ ] GEÇTİ  [ ] KALDI — Yanıt ikinci ilanı seçiyor, 0 TL’yi bilinen bir aidat olarak belirtiyor ve depozitoyu ayrı olarak doğrulanmamış bırakıyor mu?
- [ ] GEÇTİ  [ ] KALDI — Yanıtın Türkçesi müşteri için açık ve yeterince doğal mı?

## 2. Eşya durumu ve hafta sonu gösterimi

**Müşteri:** “Eşyalı mı, hafta sonu görebilir miyim?”

**Ham model kararı:** `property_fact` ve `viewing` niyetlerini ve her ikisi için odaktaki ilanı belirledi. Görüşme saatini eksik olarak işaretledi. Sunucu planı kabul etti ve takvim verisini doğruladı.

**Müşteriye gösterilen yanıt:** “Synthetic Garden Flat — Kayıtlara göre ilan eşyasız. Synthetic Garden Flat için gösterim saatleri: 21 Kasım Cumartesi saat 14.00 veya 21 Kasım Cumartesi saat 14.30 veya 21 Kasım Cumartesi saat 15.00. Hangisi size uyar?”

- [ ] GEÇTİ  [ ] KALDI — Yanıt iki soruyu da karşılıyor ve doğru ilanı koruyor mu?
- [ ] GEÇTİ  [ ] KALDI — Saatler birer teklif olarak anlaşılıyor mu?
- [ ] GEÇTİ  [ ] KALDI — İlan adının tekrarı ve zaman ifadesi müşteriye yeterince doğal geliyor mu?

## Rezervasyon ve insan devri

Canlı testte erteleme ve sayfa yenileme sonrasında açık onay gelene kadar rezervasyon oluşmadı. Aynı onayın tekrarı ikinci rezervasyon yaratmadı. Canlı testin asistan ayarları isim ve iletişim toplamayı zorunlu kılmıyordu. Bu koşullar ayrı sentetik HTTPS provasında doğrulandı. İsim, tek iletişim yöntemi ve randevuya özel iletişim izni istendi. Son randevu onayı ayrı kaldı. İzni reddeden müşterinin randevusu oluşmadı ve konuşma ekibe devredildi. Operatör panelden yanıt verdi ve konuşmayı bota geri verdi.

- [ ] GEÇTİ  [ ] KALDI — Ziyaretçi iletişim izninin amacını, reddetme seçeneğini ve randevu onayından farkını anlayabiliyor mu?
- [ ] GEÇTİ  [ ] KALDI — Bekleyen teklif, erteleme ve tamamlanan randevu arasındaki fark açık mı?
- [ ] GEÇTİ  [ ] KALDI — İnsan devri mesajı müşterinin sonraki adımını anlamasını sağlıyor mu?

Bu iki canlı örnek genel Luna doğruluğunu ölçmez. Tam ham planlar ve müşteri metinleri yetkili okuyucular için [özel canlı test kaydında](/tmp/astra-luna-TP4J7t/luna.json) saklanır.

**İnceleyen / tarih / karar** ____________________

**Düzeltme veya açıklama gerektiren kayıtlar** ____________________
