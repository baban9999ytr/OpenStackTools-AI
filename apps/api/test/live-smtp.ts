// Explicit opt-in. Use only a dedicated mailbox you control. SMTP acceptance
// is not proof that a message reached the inbox.
if (process.env.SMTP_LIVE_TEST !== "1" || process.env.SMTP_TEST_RECIPIENT_CONFIRMED !== "1")
  throw new Error("Set SMTP_LIVE_TEST=1 and SMTP_TEST_RECIPIENT_CONFIRMED=1 for a dedicated mailbox");
const recipient = process.env.SMTP_TEST_RECIPIENT;
if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
  throw new Error("Configure SMTP_TEST_RECIPIENT to a dedicated test mailbox");
if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
  throw new Error("Configure SMTP_HOST and SMTP_FROM before testing");
process.env.MONGODB_URL ??= "mongodb://127.0.0.1:27017/unused-live-test";
process.env.SESSION_SECRET ??= "live-test-only-session-placeholder-32-characters";
process.env.DASHBOARD_ORIGIN ??= "https://staging.example.invalid";
process.env.OPENAI_API_KEY ??= "unused-live-smtp-test-key";
process.env.OPENAI_MODEL ??= "unused-live-smtp-test-model";
process.env.DEFAULT_DAILY_BUDGET_USD ??= "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD ??= "1";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS ??= "1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS ??= "1";
const { sendAccountMail } = await import("../src/services/mail.js");
await sendAccountMail({ to: recipient, purpose: "verify", token: "live-smtp-delivery-check-no-account-token" });
console.log("SMTP server accepted a test message. Confirm inbox delivery manually.");
