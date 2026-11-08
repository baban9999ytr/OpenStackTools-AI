import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "en" | "tr";
export type Theme = "light" | "dark";
const translations: Record<string, string> = {
  "One place for your business conversations.":
    "İşletme görüşmeleriniz tek yerde.",
  "Create assistants, guide their responses, and step in when a person is needed.":
    "Asistanlar oluşturun, yanıtlarını yönlendirin ve gerektiğinde görüşmeye katılın.",
  "Welcome back": "Tekrar hoş geldiniz",
  "Create your workspace": "Çalışma alanınızı oluşturun",
  "Reset your password": "Parolanızı sıfırlayın",
  "Verify your email": "E-postanızı doğrulayın",
  "Accept invitation": "Daveti kabul edin",
  "Choose a new password": "Yeni parola belirleyin",
  "Sign in to your business dashboard.": "İşletme panelinize giriş yapın.",
  "Start with an organization and an owner account.":
    "Bir kuruluş ve yönetici hesabıyla başlayın.",
  "Complete this secure account step.": "Bu güvenli hesap adımını tamamlayın.",
  "Organization name": "Kuruluş adı",
  "Your name": "Adınız",
  Email: "E-posta",
  Password: "Parola",
  "Please wait…": "Lütfen bekleyin…",
  "Sign in": "Giriş yap",
  "Create workspace": "Çalışma alanı oluştur",
  "Send reset link": "Sıfırlama bağlantısı gönder",
  Continue: "Devam et",
  "Create an account": "Hesap oluştur",
  "Already have an account? Sign in": "Zaten hesabınız var mı? Giriş yapın",
  "Forgot password?": "Parolanızı mı unuttunuz?",
  "Check your email to verify your account.":
    "Hesabınızı doğrulamak için e-postanızı kontrol edin.",
  "If that account exists, a reset link has been sent.":
    "Bu hesap varsa sıfırlama bağlantısı gönderildi.",
  Organization: "Kuruluş",
  Assistants: "Asistanlar",
  Conversations: "Görüşmeler",
  Receptionist: "Resepsiyon",
  Business: "İşletme",
  "Business knowledge": "İşletme bilgileri",
  "Only publish information customers may see in the widget.": "Yalnızca müşterilerin sohbet bileşeninde görebileceği bilgileri yayınlayın.",
  "Business profile": "İşletme profili",
  Phone: "Telefon", Address: "Adres", Website: "Web sitesi",
  "Services and prices": "Hizmetler ve fiyatlar",
  "Frequently asked questions": "Sık sorulan sorular",
  Policies: "Politikalar", "Custom facts": "Özel bilgiler",
  Description: "Açıklama", Price: "Fiyat", Question: "Soru", Answer: "Yanıt", Text: "Metin", Value: "Değer", Label: "Etiket",
  "Save knowledge": "Bilgileri kaydet", "Business knowledge saved.": "İşletme bilgileri kaydedildi.", Add: "Ekle",
  "Property listings": "Emlak ilanları", "Search location": "Konuma göre ara", Search: "Ara",
  "No matching listings.": "Eşleşen ilan yok.", Updated: "Güncellendi", Edit: "Düzenle", Archive: "Arşivle",
  "Edit listing": "İlanı düzenle", "Add listing": "İlan ekle", Title: "Başlık", Location: "Konum",
  Currency: "Para birimi", "Property type": "Mülk türü", Rooms: "Oda sayısı", "Area (m²)": "Alan (m²)",
  Availability: "Durum", "Public URL": "Herkese açık bağlantı", "Save listing": "İlanı kaydet",
  "Listing saved.": "İlan kaydedildi.", "Listing archived.": "İlan arşivlendi.", "Archive this listing?": "Bu ilan arşivlensin mi?",
  apartment: "Daire", house: "Ev", land: "Arsa", commercial: "Ticari",
  available: "Uygun", reserved: "Rezerve", sold: "Satıldı",
  "Customer opportunities": "Müşteri fırsatları", "No consented leads yet.": "Henüz onaylı müşteri adayı yok.",
  "Lead status": "Müşteri adayı durumu", Requirements: "Gereksinimler", "Minimum budget": "Asgari bütçe", "Maximum budget": "Azami bütçe",
  "Preferred locations": "Tercih edilen konumlar", "Property preferences": "Mülk tercihleri", "Minimum rooms": "Asgari oda sayısı",
  "Minimum area (m²)": "Asgari alan (m²)", "Follow up at": "Takip zamanı", "Staff notes": "Ekip notları", "Save lead": "Müşteri adayını kaydet",
  "Assigned staff": "Atanan ekip üyesi",
  "Lead saved.": "Müşteri adayı kaydedildi.", "Follow-up queue": "Takip listesi", "No follow-ups due.": "Bekleyen takip yok.",
  "Conversation summaries": "Görüşme özetleri", "Recent message excerpts, not AI-generated summaries.": "Yapay zekâ özeti değil, son mesajlardan kısa alıntılar.",
  new: "Yeni", qualified: "Nitelikli", contacted: "İletişime geçildi", won: "Kazanıldı", lost: "Kaybedildi",
  Team: "Ekip",
  Usage: "Kullanım",
  Sessions: "Oturumlar",
  "Business dashboard": "İşletme paneli",
  Refresh: "Yenile",
  "Sign out": "Çıkış yap",
  Menu: "Menü",
  Theme: "Tema",
  Language: "Dil",
  Light: "Açık",
  Dark: "Koyu",
  "Your assistants": "Asistanlarınız",
  "No conversations yet.": "Henüz görüşme yok.",
  "No assistants yet. Create one to start testing the website widget.":
    "Henüz asistan yok. Web sitesi bileşenini denemek için bir asistan oluşturun.",
  Active: "Etkin",
  Paused: "Duraklatıldı",
  "allowed origins": "izinli kaynak",
  "Edit settings": "Ayarları düzenle",
  "Edit assistant": "Asistanı düzenle",
  "Create assistant": "Asistan oluştur",
  Name: "Ad",
  Instructions: "Talimatlar",
  "Allowed website origins": "İzinli web sitesi kaynakları",
  "One exact origin per line": "Her satıra bir tam kaynak",
  "Save changes": "Değişiklikleri kaydet",
  "Cancel editing": "Düzenlemeyi iptal et",
  "Use the public key with": "Açık anahtarı şununla kullanın:",
  "See the README for the embed snippet.":
    "Yerleştirme kodu için README'ye bakın.",
  "Recent conversations": "Son görüşmeler",
  Conversation: "Görüşme",
  "Select a conversation": "Bir görüşme seçin",
  "Take over": "Devral",
  "Return to bot": "Bota geri ver",
  Close: "Kapat",
  "Reply as staff": "Ekip üyesi olarak yanıtla",
  "Send reply": "Yanıt gönder",
  Staff: "Ekip üyeleri",
  "Invite staff": "Ekip üyesi davet et",
  "Invite a new account. The recipient sets their own password.":
    "Yeni bir hesap davet edin. Alıcı kendi parolasını belirler.",
  Role: "Rol",
  Agent: "Temsilci",
  Viewer: "Görüntüleyici",
  Admin: "Yönetici",
  Owner: "Sahip",
  "Send invitation": "Daveti gönder",
  "AI usage and budgets": "Yapay zekâ kullanımı ve bütçeler",
  "Input tokens": "Girdi tokenları",
  "Output tokens": "Çıktı tokenları",
  "Cached input tokens": "Önbellekten okunan girdi tokenları",
  "Cache write tokens": "Önbelleğe yazılan tokenlar",
  "Reasoning tokens": "Akıl yürütme tokenları",
  "Estimated all-time cost": "Tahmini toplam maliyet",
  "Daily limit": "Günlük sınır",
  "Monthly limit": "Aylık sınır",
  committed: "ayrılmış",
  "Daily USD": "Günlük USD",
  "Monthly USD": "Aylık USD",
  "Update budgets": "Bütçeleri güncelle",
  "Your sessions": "Oturumlarınız",
  "Revoke sessions you no longer use. Revoking this session signs you out.":
    "Kullanmadığınız oturumları sonlandırın. Bu oturumu sonlandırırsanız çıkış yapılır.",
  "This device": "Bu cihaz",
  "Other session": "Diğer oturum",
  Started: "Başlangıç",
  Expires: "Bitiş",
  Revoke: "Sonlandır",
  "Loading workspace…": "Çalışma alanı yükleniyor…",
  "Something went wrong": "Bir hata oluştu",
  "Customer support": "Müşteri desteği",
  "Describe the assistant's role, tone, and when to hand off.":
    "Asistanın görevini, üslubunu ve ne zaman devredeceğini açıklayın.",
  Assistant: "Asistan",
  Unknown: "Bilinmiyor",
  bot: "Bot",
  handoff: "Devredildi",
  closed: "Kapatıldı",
  customer: "Müşteri",
  assistant: "Asistan",
  agent: "Temsilci",
  admin: "Yönetici",
  viewer: "Görüntüleyici",
  owner: "Sahip",
  day: "gün",
  month: "ay",
  "Assistant created.": "Asistan oluşturuldu.",
  "Assistant updated.": "Asistan güncellendi.",
  "Invitation sent by email. It expires in 72 hours.":
    "Davet e-postayla gönderildi. 72 saat sonra süresi dolar.",
  "Budgets updated.": "Bütçeler güncellendi.",
  "Session expired": "Oturumun süresi doldu",
  "Invalid credentials": "Geçersiz giriş bilgileri",
  "Verify your email before signing in":
    "Giriş yapmadan önce e-postanızı doğrulayın",
  "Access denied": "Erişim reddedildi",
  "Rate limit exceeded": "İstek sınırı aşıldı",
  Appointments: "Randevular",
  "No appointments yet.": "Henüz randevu yok.",
  "Find appointment times": "Randevu saatlerini bul",
  "Business hours": "Çalışma saatleri",
  "Staff availability": "Personel müsaitliği",
  "Customer requests": "Müşteri talepleri",
  "Action history": "İşlem geçmişi",
  "No customer requests yet.": "Henüz müşteri talebi yok.",
  "No actions yet.": "Henüz işlem yok.",
  "No available times shown.": "Gösterilecek müsait saat yok.",
  "Available time": "Müsait saat",
  "Select a time": "Bir saat seçin",
  "I confirm this booking": "Bu randevuyu onaylıyorum",
  "Book appointment": "Randevu oluştur",
  "Cancel appointment": "Randevuyu iptal et",
  "Confirm cancellation?": "İptali onaylıyor musunuz?",
  "Appointment confirmed.": "Randevu onaylandı.",
  "Appointment cancelled.": "Randevu iptal edildi.",
  "Business hours saved.": "Çalışma saatleri kaydedildi.",
  "Staff availability saved.": "Personel müsaitliği kaydedildi.",
  "Check availability": "Müsaitliği kontrol et",
  "Save business hours": "Çalışma saatlerini kaydet",
  "Save availability": "Müsaitliği kaydet",
  "Time zone": "Saat dilimi",
  "Duration (minutes)": "Süre (dakika)",
  Date: "Tarih",
  Day: "Gün",
  Opens: "Açılış",
  Closes: "Kapanış",
  Remove: "Kaldır",
  "Add hours": "Saat ekle",
  Sunday: "Pazar", Monday: "Pazartesi", Tuesday: "Salı", Wednesday: "Çarşamba", Thursday: "Perşembe", Friday: "Cuma", Saturday: "Cumartesi",
  booked: "Onaylandı", cancelled: "İptal edildi", pending: "Onay bekliyor", completed: "Tamamlandı", failed: "Başarısız",
  check_availability: "Müsaitlik kontrolü", create_appointment: "Randevu oluşturma", reschedule_appointment: "Randevu değiştirme", cancel_appointment: "Randevu iptali", create_customer: "Müşteri kaydı", handoff_to_human: "İnsana devretme",
};

type Preferences = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
  t: (value: string) => string;
};
const Context = createContext<Preferences | null>(null);
const storage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    storage("ost-locale") === "tr"
      ? "tr"
      : storage("ost-locale") === "en"
        ? "en"
        : navigator.language.toLowerCase().startsWith("tr")
          ? "tr"
          : "en",
  );
  const [theme, setTheme] = useState<Theme>(() =>
    storage("ost-theme") === "dark"
      ? "dark"
      : storage("ost-theme") === "light"
        ? "light"
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem("ost-locale", locale);
    } catch {
      /* storage optional */
    }
  }, [locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("ost-theme", theme);
    } catch {
      /* storage optional */
    }
  }, [theme]);
  const value = useMemo(
    () => ({
      locale,
      setLocale,
      theme,
      setTheme,
      t: (text: string) =>
        locale === "tr" ? (translations[text] ?? text) : text,
    }),
    [locale, theme],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePreferences() {
  const context = useContext(Context);
  if (!context) throw new Error("PreferencesProvider missing");
  return context;
}
