const params = new URLSearchParams(location.search);
const key = params.get("assistant") || "";
const language = params.get("lang") === "tr" ? "tr" : "en";
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.lang = language;
document.documentElement.dataset.theme = theme;
const status = document.getElementById("preview-status");
if (!["localhost", "127.0.0.1"].includes(location.hostname)) {
  status.textContent = language === "tr" ? "Önizleme yalnızca yerel geliştirmede kullanılabilir." : "Preview is available only during local development.";
} else if (!/^ost_[A-Za-z0-9_-]{8,60}$/.test(key)) {
  status.textContent = language === "tr" ? "Geçerli bir asistan seçin." : "Choose a valid assistant from the dashboard.";
} else {
  const script = document.createElement("script");
  script.src = "/embed.js";
  script.dataset.ostAssistant = key;
  script.dataset.ostApi = location.origin;
  script.dataset.ostLang = language;
  script.dataset.ostTheme = theme;
  script.onload = () => { status.textContent = language === "tr" ? "Sohbet bileşeni hazır. Sağ alttaki düğmeyi açın." : "Widget ready. Open the chat button in the lower right."; };
  script.onerror = () => { status.textContent = language === "tr" ? "Sohbet bileşeni yüklenemedi." : "The widget could not load."; };
  document.body.append(script);
}
