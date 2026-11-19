import { parseUsdMicros } from "../services/money.js";
import "dotenv/config";
const must = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongoUrl: must("MONGODB_URL"),
  dashboardOrigin: must("DASHBOARD_ORIGIN"),
  sessionSecret: must("SESSION_SECRET"),
  openaiApiKey: must("OPENAI_API_KEY"),
  openaiModel: must("OPENAI_MODEL"),
  experimentalReceptionistIntents: process.env.AI_EXPERIMENTAL_RECEPTIONIST_INTENTS === "true",
  reasoningEffort: process.env.OPENAI_REASONING_EFFORT?.trim() || undefined,
  maxCompletionTokens: Number(process.env.OPENAI_MAX_COMPLETION_TOKENS ?? 800),
  automaticMaxRequestMicros: process.env.AI_AUTOMATIC_MAX_REQUEST_USD
    ? parseUsdMicros(process.env.AI_AUTOMATIC_MAX_REQUEST_USD) : undefined,
  defaultDailyBudgetMicros: parseUsdMicros(must("DEFAULT_DAILY_BUDGET_USD")),
  defaultMonthlyBudgetMicros: parseUsdMicros(
    must("DEFAULT_MONTHLY_BUDGET_USD"),
  ),
  inputPriceMicrosPerMillion: parseUsdMicros(
    must("OPENAI_INPUT_USD_PER_MILLION_TOKENS"),
  ),
  outputPriceMicrosPerMillion: parseUsdMicros(
    must("OPENAI_OUTPUT_USD_PER_MILLION_TOKENS"),
  ),
  cachedInputPriceMicrosPerMillion: parseUsdMicros(
    process.env.OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS?.trim() ||
      must("OPENAI_INPUT_USD_PER_MILLION_TOKENS"),
  ),
  cacheWritePriceMicrosPerMillion: parseUsdMicros(
    process.env.OPENAI_CACHE_WRITE_USD_PER_MILLION_TOKENS?.trim() ||
      must("OPENAI_INPUT_USD_PER_MILLION_TOKENS"),
  ),
  cookieSecure:
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production",
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  smtpHost: must("SMTP_HOST"),
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  smtpRequireTls: process.env.SMTP_REQUIRE_TLS === "true" || process.env.NODE_ENV === "production",
  smtpFrom: must("SMTP_FROM"),
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  telegramSelfServiceEnabled: process.env.TELEGRAM_SELF_SERVICE_ENABLED === "true",
  telegramPublicApiOrigin: process.env.TELEGRAM_PUBLIC_API_ORIGIN?.trim() || undefined,
  channelCredentialActiveKeyId: process.env.CHANNEL_CREDENTIAL_ACTIVE_KEY_ID?.trim() || undefined,
};
if (env.sessionSecret.length < 32)
  throw new Error("SESSION_SECRET must be at least 32 characters");
if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535)
  throw new Error("Invalid PORT");
if (!Number.isInteger(env.trustProxy) || env.trustProxy < 0)
  throw new Error("Invalid TRUST_PROXY");
if (new URL(env.dashboardOrigin).origin !== env.dashboardOrigin)
  throw new Error("DASHBOARD_ORIGIN must be an origin");
if (env.nodeEnv === "production" && new URL(env.dashboardOrigin).protocol !== "https:")
  throw new Error("Production DASHBOARD_ORIGIN must use HTTPS");
if (!Number.isInteger(env.smtpPort) || env.smtpPort < 1 || env.smtpPort > 65535)
  throw new Error("Invalid SMTP_PORT");
if (!Number.isInteger(env.maxCompletionTokens) || env.maxCompletionTokens < 1 || env.maxCompletionTokens > 800)
  throw new Error("OPENAI_MAX_COMPLETION_TOKENS must be between 1 and 800");
if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(env.openaiModel))
  throw new Error("Invalid OPENAI_MODEL identifier");
if (env.reasoningEffort && !["none", "low", "medium", "high", "xhigh", "max"].includes(env.reasoningEffort))
  throw new Error("Invalid OPENAI_REASONING_EFFORT");
if (env.openaiModel === "gpt-6-luna" && env.reasoningEffort !== "none")
  throw new Error("GPT-6 Luna tool calling requires OPENAI_REASONING_EFFORT=none");
if (["gpt-6.1-terra", "gpt-6.1-sol", "gpt-6-astra"].includes(env.openaiModel))
  throw new Error("This model requires a Responses API adapter for tool calling; Chat Completions is unsupported");

if (env.defaultMonthlyBudgetMicros < env.defaultDailyBudgetMicros)
  throw new Error("Monthly budget must be at least the daily budget");
if (!env.inputPriceMicrosPerMillion || !env.outputPriceMicrosPerMillion)
  throw new Error("AI prices must be positive");
if (!env.cachedInputPriceMicrosPerMillion || !env.cacheWritePriceMicrosPerMillion)
  throw new Error("AI cache prices must be positive");

if (env.telegramSelfServiceEnabled) {
  if (!env.telegramPublicApiOrigin || new URL(env.telegramPublicApiOrigin).origin !== env.telegramPublicApiOrigin ||
    new URL(env.telegramPublicApiOrigin).protocol !== "https:")
    throw new Error("TELEGRAM_PUBLIC_API_ORIGIN must be an HTTPS origin");
  const telegramPort = new URL(env.telegramPublicApiOrigin).port;
  if (telegramPort && !["443", "88", "8443"].includes(telegramPort))
    throw new Error("TELEGRAM_PUBLIC_API_ORIGIN uses an unsupported webhook port");
  if (!env.channelCredentialActiveKeyId || !/^[A-Z0-9_]{1,24}$/.test(env.channelCredentialActiveKeyId) ||
    !process.env[`CHANNEL_CREDENTIAL_KEY_${env.channelCredentialActiveKeyId}`])
    throw new Error("A dedicated active channel credential key is required");
  const encoded = process.env[`CHANNEL_CREDENTIAL_KEY_${env.channelCredentialActiveKeyId}`]!;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || Buffer.from(encoded, "base64").length !== 32 ||
    Buffer.from(encoded, "base64").toString("base64") !== encoded)
    throw new Error("Active channel credential key must be 32 random bytes encoded as Base64");
}
