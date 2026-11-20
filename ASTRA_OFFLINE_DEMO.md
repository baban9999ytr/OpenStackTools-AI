# ASTRA özel çevrimdışı demo

Demo adresi [127.0.0.1:5198](http://127.0.0.1:5198/). Demo, sunucunun çalıştığı bilgisayardaki tarayıcı için hazırlanmıştır. Başka bir cihazdan doğrudan bağlantı kurulamaz.

## Başlatma

Depo kökünden çalıştırın.

```bash
npm run build -w apps/web
env -u NODE_OPTIONS node --import tsx astra-offline-demo.mts
```

Başlatıcı, mevcut derlenmiş paneli ve widget'ı kullanır. MongoDB 8.0.12 çalıştırılabilir dosyasının yerelde önceden bulunması gerekir. Mevcut yerel test altyapısındaki MongoDB önbelleği kullanılabilir. Başlatıcı çalışma sırasında indirme yapmaz.

Terminalde yalnızca demo adresi ve geçici yönetici giriş dosyasının yolu görünür. Parolayı dosyadan yerel olarak okuyun. Dosya yalnızca işletim sistemi kullanıcısı tarafından okunabilir. Demo giriş bilgilerini başka hizmetlerde kullanmayın. Demo kapanınca oturum ve geçici veritabanı sona erer. Sonraki başlatma temiz veri ve yeni parola üretir.

## Kısa gösterim

Ana sayfadaki **Sohbet demosunu aç** bağlantısı, Türkçe widget'ı açar. Örnek istemler ana sayfada görünür.

1. Nilüfer'deki iki örnek kiralık 3+1 daireyi bulun. Karşılaştırmada 1.500 TL farkı görün.
2. İkinci ilanın aidatını ve depozitosunu sorun. Aidat 0 TL'dir ve depozito doğrulanmamıştır.
3. Eşya durumunu ve hafta sonu gösterimini birlikte sorun. Gösterim saatleri sentetik danışman takviminden hesaplanır.
4. Önerilen saati seçin. “Örnek Ziyaretçi” ve “ziyaretci@example.test” girin. “İletişime izin veriyorum.” yazın, özeti görün, onayı erteleyin ve sayfayı yenileyin. Açık onay verene kadar yeni bir randevu kaydedilmez.
5. **İşletme panelini aç** bağlantısından sentetik yönetici hesabıyla oturum açın. **Receptionist** bölümünde onaylanan randevuyu, **Conversations** bölümünde görüşmeyi ve hazır devir örneğini görebilirsiniz.

Demo, mevcut yerel emlak verilerini kullanır. İlanlar, müşteriler, hesaplar ve randevular kurgusaldır. İki örnek istem, kaydedilmiş Luna çıktılarını çevrimdışı oynatır. Diğer desteklenen işlemler uygulamanın mevcut kurallarıyla çalışır. Bu demo canlı model kalitesini veya canlı pilot hazırlığını ölçmez. Yerel HTTP iletişimi yalnızca loopback adresinde çalışır. Bir uzaktan erişim servisi veya canlı müşteri hesabı kullanılmaz.

## Tarayıcı kontrolü

Demo çalışırken, başlatıcının yazdığı dosya yolunu argüman olarak verin. Bu kontrol geçici veritabanında bir örnek randevu oluşturur. Gösterim öncesi temiz senaryo istiyorsanız kontrolün ardından demo sürecini kapatıp yeniden başlatın.

```bash
node astra-offline-demo-smoke.mjs /tmp/astra-demo-login-XXXXXXXX/owner.txt
```

Canlı ASTRA doğrulamasının güncel durumu [entegrasyon raporunda](ASTRA_LIVE_INTEGRATION_VERIFICATION.md) tutulur.

## Doğrulama

Chromium kontrolü ilan arama ve karşılaştırmayı, doğrulanmış aidatı, belirsiz depozitoyu, eşya ve hafta sonu yanıtını, yeniden yükleme sonrası onay ertelemesini, açık onayla randevu kaydını ve randevunun işletme panelindeki görünürlüğünü doğruladı. Tarayıcıdan dış adrese istek çıkmadı. Standalone başlatıcı TypeScript kontrolünden ve web üretim derlemesinden geçti. Sabit canlı adayın kaynak özeti değişmedi ve aynı özetle provider-free prova 10/10 geçti.
