export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
export type Role = "owner" | "admin" | "agent" | "viewer";
export type Organization = { id: string; name: string; role: Role };
export type Assistant = {
  _id: string;
  name: string;
  instructions: string;
  publicKey: string;
  allowedOrigins: string[];
  active: boolean;
};
export type Conversation = {
  _id: string;
  assistantId: string;
  status: "bot" | "handoff" | "closed";
  updatedAt: string;
};
export type Message = {
  _id: string;
  role: "customer" | "assistant" | "agent";
  text: string;
  createdAt: string;
};
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}
