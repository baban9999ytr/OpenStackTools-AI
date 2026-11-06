import pino from "pino";
export const safeError = (error: unknown) => {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const candidate = error as { name?: unknown; code?: unknown; status?: unknown };
  return {
    name: typeof candidate.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(candidate.name) ? candidate.name : "Error",
    ...(typeof candidate.code === "string" && /^[A-Za-z0-9_]{1,32}$/.test(candidate.code) || typeof candidate.code === "number"
      ? { code: candidate.code }
      : {}),
    ...(typeof candidate.status === "number" && candidate.status >= 100 && candidate.status <= 599 ? { status: candidate.status } : {}),
  };
};
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.cookie", "req.headers.authorization", "authorization", "cookie", "password", "token"],
});
