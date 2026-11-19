export type TelegramBot = { id: string; name: string; username: string };
export class TelegramProviderError extends Error {
  constructor(public category: "invalid_token" | "revoked" | "rate_limited" | "provider_unavailable" | "timeout" | "invalid_response",
    public retryAfterSeconds?: number, public definitiveRetryable = false) { super(category); }
}
export interface TelegramManagementProvider {
  getMe(token: string): Promise<TelegramBot>;
  setWebhook(token: string, url: string, secret: string): Promise<void>;
  getWebhookInfo(token: string): Promise<{ url: string; pendingUpdateCount?: number }>;
  deleteWebhook(token: string): Promise<void>;
}
const callOnce = async (token: string, method: string, body: Record<string, unknown>) => {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new TelegramProviderError(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "provider_unavailable");
  }
  const data = await response.json().catch(() => null) as {
    ok?: boolean; result?: unknown; error_code?: number; parameters?: { retry_after?: number } } | null;
  if (!response.ok || !data?.ok) {
    const code = data?.error_code ?? response.status;
    throw new TelegramProviderError(code === 401 || code === 404 ? "invalid_token" : code === 403 ? "revoked"
      : code === 429 ? "rate_limited" : code >= 500 ? "provider_unavailable" : "invalid_response",
    data?.parameters?.retry_after, code === 429 || code >= 500);
  }
  return data.result;
};
const call = async (token: string, method: string, body: Record<string, unknown> = {}) => {
  try { return await callOnce(token, method, body); }
  catch (error) {
    if (!(error instanceof TelegramProviderError) || !error.definitiveRetryable) throw error;
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, Math.max(250, (error.retryAfterSeconds ?? 0) * 1000))));
    return callOnce(token, method, body);
  }
};
export const telegramManagementProvider: TelegramManagementProvider = {
  async getMe(token) {
    const result = await call(token, "getMe") as { id?: number; first_name?: string; username?: string } | null;
    if (!result || !Number.isSafeInteger(result.id) || typeof result.username !== "string" ||
      !/^[A-Za-z0-9_]{5,32}$/.test(result.username)) throw new TelegramProviderError("invalid_response");
    return { id: String(result.id), name: String(result.first_name ?? result.username).slice(0, 80), username: result.username };
  },
  async setWebhook(token, url, secret) {
    if (await call(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"] }) !== true)
      throw new TelegramProviderError("invalid_response");
  },
  async getWebhookInfo(token) {
    const result = await call(token, "getWebhookInfo") as { url?: string; pending_update_count?: number } | null;
    if (!result || typeof result.url !== "string") throw new TelegramProviderError("invalid_response");
    return { url: result.url, pendingUpdateCount: result.pending_update_count };
  },
  async deleteWebhook(token) {
    if (await call(token, "deleteWebhook", { drop_pending_updates: false }) !== true)
      throw new TelegramProviderError("invalid_response");
  },
};
