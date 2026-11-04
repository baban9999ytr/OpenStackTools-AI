import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";

type Message = {
  _id?: string;
  role: "customer" | "assistant" | "agent";
  text: string;
};
type Pending = {
  text: string;
  clientMessageId: string;
  conversationId?: string;
  requestId?: string;
};
type Saved = {
  token: string;
  expiresAt: string;
  conversationId?: string;
  pending?: Pending;
};
const css = `:host{all:initial;font-family:ui-sans-serif,system-ui,sans-serif;color:#17304e}.ost-launch{position:fixed;right:24px;bottom:24px;z-index:2147483647;border:0;border-radius:999px;background:#315bd4;color:white;padding:16px 20px;font:700 15px ui-sans-serif,system-ui;box-shadow:0 10px 28px #142d5460;cursor:pointer}.ost-panel{position:fixed;right:24px;bottom:82px;z-index:2147483647;width:min(370px,calc(100vw - 32px));height:min(550px,calc(100vh - 110px));display:flex;flex-direction:column;background:white;border:1px solid #d8e2ef;border-radius:18px;box-shadow:0 18px 60px #142d5460;overflow:hidden}.ost-head{background:#142d54;color:white;padding:17px 20px;font-weight:700;display:flex;justify-content:space-between;align-items:center}.ost-head small{display:block;color:#bad1ee;font-weight:400;margin-top:3px}.ost-head button{background:transparent;color:white;border:1px solid #bad1ee;border-radius:5px;padding:4px;font:inherit;cursor:pointer}.ost-messages{flex:1;overflow:auto;padding:16px;background:#f7f9fc}.ost-message{max-width:85%;padding:9px 12px;margin:8px 0;border-radius:12px;background:#e8edf5;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.ost-message.customer{margin-left:auto;background:#dce8ff}.ost-form{display:flex;gap:8px;padding:12px;background:white;border-top:1px solid #e5ebf2}.ost-form input{flex:1;min-width:0;padding:10px;border:1px solid #cfd9e5;border-radius:8px;font:inherit}.ost-form button{border:0;border-radius:8px;background:#315bd4;color:white;padding:10px 13px;font:700 13px ui-sans-serif,system-ui;cursor:pointer}.ost-form button:disabled{opacity:.6}.ost-error{color:#a43120;padding:0 14px;font-size:13px}.ost-state{padding:0 14px;font-size:13px}.ost-retry{margin:0 14px 8px}`;

export function Widget({
  publicKey,
  apiBase,
}: {
  publicKey: string;
  apiBase: string;
}) {
  const storageKey = `ost-widget:${apiBase}:${publicKey}`;
  const readSaved = (): Saved | null => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const saved = JSON.parse(raw) as Saved;
      if (
        typeof saved.token !== "string" ||
        Date.parse(saved.expiresAt) <= Date.now()
      ) {
        sessionStorage.removeItem(storageKey);
        return null;
      }
      return saved;
    } catch {
      return null;
    }
  };
  const [saved, setSaved] = useState<Saved | null>(readSaved);
  const [open, setOpen] = useState(false);
  const [assistantName, setAssistantName] = useState("AI assistant");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = (next: Saved | null) => {
    if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
    else sessionStorage.removeItem(storageKey);
    setSaved(next);
  };
  const fetchJson = async (path: string, token?: string, body?: object) => {
    const response = await fetch(`${apiBase}/api/widget${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      save(null);
      setMessages([]);
    }
    if (!response.ok)
      throw new Error(data.error ?? `Chat unavailable (${response.status})`);
    return data;
  };
  const refresh = async (state: Saved) => {
    if (!state.conversationId) return;
    const data = await fetchJson(
      `/conversations/${state.conversationId}/messages`,
      state.token,
    );
    setMessages(data.messages);
    if (data.conversation.status === "handoff")
      setStatus("A team member will reply here.");
    else if (data.conversation.status === "closed")
      setStatus("This conversation is closed.");
    else if (!state.pending) setStatus("");
  };
  const sendPending = async (state: Saved) => {
    if (!state.pending) return;
    setBusy(true);
    setError("");
    setStatus("Sending message…");
    try {
      const data = await fetchJson("/messages", state.token, state.pending);
      const next: Saved = {
        ...state,
        conversationId: data.conversationId,
        pending:
          data.status === "completed" || data.status === "handoff"
            ? undefined
            : { ...state.pending, requestId: data.requestId },
      };
      save(next);
      if (data.status === "completed") setStatus("");
      else if (data.status === "handoff")
        setStatus("A team member will reply here.");
      else setStatus("Waiting for a reply…");
      await refresh(next);
    } catch (caught) {
      if (
        caught instanceof Error &&
        (caught.message.includes("budget exhausted") ||
          caught.message.includes("temporarily unavailable"))
      )
        save({ ...state, pending: undefined });
      setError(
        caught instanceof Error ? caught.message : "Could not send message",
      );
      setStatus("Message status is uncertain. Retry uses the same message ID.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!open || !saved) return;
    let cancelled = false;
    const connect = async () => {
      try {
        const data = await fetchJson("/sessions/current", saved.token);
        if (cancelled) return;
        setAssistantName(data.assistant.name);
        const current = {
          ...saved,
          conversationId: saved.conversationId ?? data.conversationId,
        };
        save(current);
        await refresh(current);
        if (current.pending && !current.pending.requestId)
          await sendPending(current);
      } catch (caught) {
        if (!cancelled)
          setError(
            caught instanceof Error ? caught.message : "Connection failed",
          );
      }
    };
    void connect();
    return () => {
      cancelled = true;
    };
  }, [open, saved?.token]);
  useEffect(() => {
    if (!open || !saved?.conversationId) return;
    const timer = window.setInterval(async () => {
      try {
        const current = readSaved();
        if (!current) return;
        if (current.pending?.requestId) {
          const request = await fetchJson(
            `/requests/${current.pending.requestId}`,
            current.token,
          );
          if (
            request.status === "completed" ||
            request.status === "handoff" ||
            request.status === "failed"
          ) {
            const next = { ...current, pending: undefined };
            save(next);
            setStatus(
              request.status === "handoff"
                ? "A team member will reply here."
                : request.status === "failed"
                  ? "The assistant could not reply. Please try a new message."
                  : "",
            );
          }
        }
        await refresh(current);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Connection lost");
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [open, saved?.token, saved?.conversationId, saved?.pending?.requestId]);
  async function start() {
    setOpen(true);
    if (saved) return;
    setBusy(true);
    try {
      const data = await fetchJson("/sessions", undefined, { publicKey });
      save({ token: data.token, expiresAt: data.expiresAt });
      setAssistantName(data.assistant.name);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not start chat",
      );
    } finally {
      setBusy(false);
    }
  }
  function clear() {
    save(null);
    setMessages([]);
    setStatus("");
    setError("");
    setOpen(false);
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saved || busy || saved.pending) return;
    const input = event.currentTarget.elements.namedItem(
      "message",
    ) as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const next = {
      ...saved,
      pending: {
        text,
        clientMessageId: crypto.randomUUID(),
        conversationId: saved.conversationId,
      },
    };
    save(next);
    setMessages((previous) => [...previous, { role: "customer", text }]);
    await sendPending(next);
  }
  return (
    <>
      <style>{css}</style>
      <button
        className="ost-launch"
        type="button"
        onClick={() => (open ? setOpen(false) : void start())}
        aria-expanded={open}
        aria-controls="ost-chat-panel"
      >
        {open ? "Close chat" : "Chat with us"}
      </button>
      {open && (
        <section
          id="ost-chat-panel"
          className="ost-panel"
          aria-label="Business chat"
        >
          <header className="ost-head">
            <span>
              {assistantName}
              <small>Messages are shared with this business.</small>
            </span>
            <button
              type="button"
              onClick={clear}
              aria-label="Clear this chat session"
            >
              Clear chat
            </button>
          </header>
          <div className="ost-messages" aria-live="polite">
            {messages.length === 0 && <p>How can we help?</p>}
            {messages.map((message, index) => (
              <div
                key={message._id ?? index}
                className={`ost-message ${message.role}`}
              >
                {message.text}
              </div>
            ))}
          </div>
          {status && (
            <p className="ost-state" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="ost-error" role="alert">
              {error}
            </p>
          )}
          {saved?.pending && error && (
            <button
              className="ost-retry"
              type="button"
              onClick={() => void sendPending(saved)}
            >
              Retry message safely
            </button>
          )}
          <form className="ost-form" onSubmit={send}>
            <input
              name="message"
              aria-label="Your message"
              placeholder="Write a message…"
              maxLength={4000}
              required
              disabled={!saved || busy || Boolean(saved.pending)}
            />
            <button
              disabled={!saved || busy || Boolean(saved.pending)}
              type="submit"
            >
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}
const script = document.currentScript as HTMLScriptElement | null;
const publicKey = script?.dataset.ostAssistant;
const apiBase = script?.dataset.ostApi?.replace(/\/$/, "");
if (publicKey && apiBase) {
  const host = document.createElement("div");
  host.id = `openstacktools-widget-${publicKey}`;
  document.body.append(host);
  createRoot(host.attachShadow({ mode: "open" })).render(
    <Widget publicKey={publicKey} apiBase={apiBase} />,
  );
}
