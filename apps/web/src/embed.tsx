import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { widgetBrandCss } from "./widget-brand";

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
const css = `${widgetBrandCss}\n:host{font-family:var(--ost-font-sans);color:var(--ost-text)}*{box-sizing:border-box}.ost-launch{position:fixed;right:24px;bottom:24px;z-index:2147483647;border:0;border-radius:999px;background:var(--ost-accent);color:var(--ost-accent-text);padding:16px 20px;font:700 15px var(--ost-font-sans);box-shadow:0 10px 28px #09090b50;cursor:pointer}.ost-panel{position:fixed;right:24px;bottom:82px;z-index:2147483647;width:min(370px,calc(100vw - 32px));height:min(550px,calc(100vh - 110px));display:flex;flex-direction:column;background:var(--ost-surface);color:var(--ost-text);border:1px solid var(--ost-border);border-radius:12px;box-shadow:0 18px 60px #09090b50;overflow:hidden}.ost-head{background:var(--ost-surface-soft);border-bottom:1px solid var(--ost-border);padding:17px 20px;font-weight:700;display:flex;gap:12px;justify-content:space-between;align-items:center}.ost-head small{display:block;color:var(--ost-muted);font-weight:400;margin-top:3px}.ost-head button{background:transparent;color:var(--ost-text);border:1px solid var(--ost-border);border-radius:4px;padding:4px;font:inherit;cursor:pointer}.ost-messages{flex:1;overflow:auto;padding:16px;background:var(--ost-page)}.ost-message{max-width:85%;padding:9px 12px;margin:8px 0;border-radius:8px;background:var(--ost-surface-soft);white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.ost-message.customer{margin-left:auto;background:var(--ost-accent-subtle)}.ost-form{display:flex;gap:8px;padding:12px;background:var(--ost-surface);border-top:1px solid var(--ost-border)}.ost-form input{flex:1;min-width:0;padding:10px;border:1px solid var(--ost-border);border-radius:8px;background:var(--ost-surface);color:var(--ost-text);font:inherit}.ost-form button{border:0;border-radius:8px;background:var(--ost-accent);color:var(--ost-accent-text);padding:10px 13px;font:700 13px var(--ost-font-sans);cursor:pointer}.ost-form button:disabled{opacity:.6}.ost-error{color:var(--ost-danger);padding:0 14px;font-size:13px}.ost-state{padding:0 14px;font-size:13px}.ost-retry{margin:0 14px 8px;background:var(--ost-surface);color:var(--ost-accent);border:1px solid var(--ost-border);border-radius:4px;padding:6px;cursor:pointer}:focus-visible{outline:2px solid var(--ost-focus);outline-offset:2px}`;

const labels = {
  en: { assistant: "AI assistant", handoff: "A team member will reply here.", closed: "This conversation is closed.", sending: "Sending message…", waiting: "Waiting for a reply…", failed: "The assistant could not reply. Please try a new message.", uncertain: "Message status is uncertain. Retry uses the same message ID.", terminal: "No AI reply was sent. You can start a new message.", sendError: "Could not send message", connectionError: "Connection failed", lost: "Connection lost", startError: "Could not start chat", close: "Close chat", launch: "Chat with us", chat: "Business chat", privacy: "Messages are shared with this business.", clearLabel: "Clear this chat session", clear: "Clear chat", empty: "How can we help?", retry: "Retry message safely", input: "Your message", placeholder: "Write a message…", send: "Send" },
  tr: { assistant: "Yapay zekâ asistanı", handoff: "Bir ekip üyesi buradan yanıt verecek.", closed: "Bu görüşme kapandı.", sending: "Mesaj gönderiliyor…", waiting: "Yanıt bekleniyor…", failed: "Asistan yanıt veremedi. Yeni bir mesaj deneyin.", uncertain: "Mesajın durumu belirsiz. Yeniden deneme aynı mesaj kimliğini kullanır.", terminal: "Yapay zekâ yanıtı gönderilmedi. Yeni bir mesaj yazabilirsiniz.", sendError: "Mesaj gönderilemedi", connectionError: "Bağlantı kurulamadı", lost: "Bağlantı koptu", startError: "Sohbet başlatılamadı", close: "Sohbeti kapat", launch: "Bizimle sohbet edin", chat: "İşletme sohbeti", privacy: "Mesajlarınız bu işletmeyle paylaşılır.", clearLabel: "Bu sohbet oturumunu temizle", clear: "Sohbeti temizle", empty: "Nasıl yardımcı olabiliriz?", retry: "Mesajı güvenle yeniden dene", input: "Mesajınız", placeholder: "Mesaj yazın…", send: "Gönder" },
} as const;

export function Widget({
  publicKey,
  apiBase,
  language,
}: {
  publicKey: string;
  apiBase: string;
  language: "en" | "tr";
}) {
  const t = labels[language];
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
  const [assistantName, setAssistantName] = useState<string>(t.assistant);
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
      setStatus(t.handoff);
    else if (data.conversation.status === "closed")
      setStatus(t.closed);
    else if (!state.pending) setStatus("");
  };
  const sendPending = async (state: Saved) => {
    if (!state.pending) return;
    setBusy(true);
    setError("");
    setStatus(t.sending);
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
        setStatus(t.handoff);
      else setStatus(t.waiting);
      await refresh(next);
    } catch (caught) {
      const terminal =
        caught instanceof Error &&
        (caught.message.includes("budget exhausted") ||
          caught.message.includes("temporarily unavailable"));
      if (terminal)
        save({ ...state, pending: undefined });
      setError(
        caught instanceof Error ? caught.message : t.sendError,
      );
      setStatus(terminal ? t.terminal : t.uncertain);
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
            caught instanceof Error ? caught.message : t.connectionError,
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
                ? t.handoff
                : request.status === "failed"
                  ? t.failed
                  : "",
            );
          }
        }
        await refresh(current);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t.lost);
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
        caught instanceof Error ? caught.message : t.startError,
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
        {open ? t.close : t.launch}
      </button>
      {open && (
        <section
          id="ost-chat-panel"
          className="ost-panel"
          aria-label={t.chat}
        >
          <header className="ost-head">
            <span>
              {assistantName}
              <small>{t.privacy}</small>
            </span>
            <button
              type="button"
              onClick={clear}
              aria-label={t.clearLabel}
            >
              {t.clear}
            </button>
          </header>
          <div className="ost-messages" aria-live="polite">
            {messages.length === 0 && <p>{t.empty}</p>}
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
              {t.retry}
            </button>
          )}
          <form className="ost-form" onSubmit={send}>
            <input
              name="message"
              aria-label={t.input}
              placeholder={t.placeholder}
              maxLength={4000}
              required
              disabled={!saved || busy || Boolean(saved.pending)}
            />
            <button
              disabled={!saved || busy || Boolean(saved.pending)}
              type="submit"
            >
              {t.send}
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
  const language = (script.dataset.ostLang ?? document.documentElement.lang ?? navigator.language).toLowerCase().startsWith("tr") ? "tr" : "en";
  const explicitTheme = script.dataset.ostTheme;
  const theme = explicitTheme === "light" || explicitTheme === "dark" ? explicitTheme : document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.host.setAttribute("data-theme", theme);
  createRoot(shadow).render(
    <Widget publicKey={publicKey} apiBase={apiBase} language={language} />,
  );
}
