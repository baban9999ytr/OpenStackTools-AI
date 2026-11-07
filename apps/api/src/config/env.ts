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
  maxCompletionTokens: Number(process.env.OPENAI_MAX_COMPLETION_TOKENS ?? 800),
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

if (env.defaultMonthlyBudgetMicros < env.defaultDailyBudgetMicros)
  throw new Error("Monthly budget must be at least the daily budget");
if (!env.inputPriceMicrosPerMillion || !env.outputPriceMicrosPerMillion)
  throw new Error("AI prices must be positive");
