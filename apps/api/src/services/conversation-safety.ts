/** A narrow, auditable pre-tool guard for clearly operational harmful requests. */
export const prohibitedOperationalRequest = (text: string) => {
  const lower = text.toLocaleLowerCase("tr");
  const operational = /(?:nasıl|yöntem|plan|adım adım|yardım et|how to|steps to|help me|plan to)/i.test(lower);
  if (!operational) return false;
  return /(?:uyuşturucu|drug trafficking|sell drugs|kaçak insan|insan kaçakçılığı|human trafficking|dolandır|fraud|scam|silah yap|make a weapon|birini öldür|kill someone|hesap kır|hack (?:an? )?account)/i.test(lower);
};

export const safetyReply = (locale: "en" | "tr") => locale === "tr"
  ? "Bu konuda operasyonel yardım sağlayamam. İşletmeyle ilgili başka bir sorunuz varsa yardımcı olabilirim."
  : "I can't help carry out that request. I can still help with questions about this business.";
