import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./widget-brand.css";
import "./embed.css";

type Message = {
  _id?: string;
  role: "customer" | "assistant" | "agent";
  text: string;
};
type PendingAction = { id: string; name: string; arguments: Record<string, unknown>; expiresAt: string };
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

const labels = {
  en: { assistant: "AI assistant", handoff: "A team member will reply here.", closed: "This conversation is closed.", sending: "Sending message…", waiting: "Waiting for a reply…", failed: "The assistant could not reply. Please try a new message.", uncertain: "Message status is uncertain. Retry uses the same message ID.", terminal: "No AI reply was sent. You can start a new message.", sendError: "Could not send message", connectionError: "Connection failed", lost: "Connection lost", startError: "Could not start chat", rateLimited: "Too many requests right now. Please wait before retrying.", budgetExhausted: "This business has reached its AI usage limit.", modelUnavailable: "The assistant's AI model is unavailable. Please contact the business team.", close: "Close chat", launch: "Chat with us", chat: "Business chat", privacy: "Messages are shared with this business.", clearLabel: "Clear this chat session", clear: "Clear chat", empty: "How can we help?", retry: "Retry message safely", input: "Your message", placeholder: "Write a message…", send: "Send" },
  tr: { assistant: "Yapay zekâ asistanı", handoff: "Bir ekip üyesi buradan yanıt verecek.", closed: "Bu görüşme kapandı.", sending: "Mesaj gönderiliyor…", waiting: "Yanıt bekleniyor…", failed: "Asistan yanıt veremedi. Yeni bir mesaj deneyin.", uncertain: "Mesajın durumu belirsiz. Yeniden deneme aynı mesaj kimliğini kullanır.", terminal: "Yapay zekâ yanıtı gönderilmedi. Yeni bir mesaj yazabilirsiniz.", sendError: "Mesaj gönderilemedi", connectionError: "Bağlantı kurulamadı", lost: "Bağlantı koptu", startError: "Sohbet başlatılamadı", rateLimited: "Şu anda çok fazla istek var. Yeniden denemeden önce bekleyin.", budgetExhausted: "Bu işletmenin yapay zekâ kullanım sınırına ulaşıldı.", modelUnavailable: "Asistanın yapay zekâ modeli kullanılamıyor. Lütfen işletme ekibiyle iletişime geçin.", close: "Sohbeti kapat", launch: "Bizimle sohbet edin", chat: "İşletme sohbeti", privacy: "Mesajlarınız bu işletmeyle paylaşılır.", clearLabel: "Bu sohbet oturumunu temizle", clear: "Sohbeti temizle", empty: "Nasıl yardımcı olabiliriz?", retry: "Mesajı güvenle yeniden dene", input: "Mesajınız", placeholder: "Mesaj yazın…", send: "Gönder" },
} as const;
const actionLabels = {
  en: { confirm: "Confirm action", decline: "Decline", pending: "Review before this action is performed", create_appointment: "Book appointment", reschedule_appointment: "Move appointment", cancel_appointment: "Cancel appointment", create_customer: "Save customer request" },
  tr: { confirm: "İşlemi onayla", decline: "Reddet", pending: "İşlem yapılmadan önce gözden geçirin", create_appointment: "Randevu oluştur", reschedule_appointment: "Randevuyu taşı", cancel_appointment: "Randevuyu iptal et", create_customer: "Müşteri talebini kaydet" },
} as const;
class WidgetHttpError extends Error {
  constructor(public statusCode: number, public retryAfterMs: number, message: string, public code?: string) { super(message); }
}
const retryDelay = (header: string | null) => {
  const seconds = header ? Number(header) : NaN;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : NaN;
  return Number.isFinite(delay) ? Math.min(60_000, Math.max(1000, delay)) : 0;
};

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
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = window.setTimeout(() => setRetryAt(0), retryAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [retryAt]);
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
      throw new WidgetHttpError(response.status, retryDelay(response.headers.get("Retry-After")),
        typeof data.error === "string" ? data.error : `Chat unavailable (${response.status})`,
        typeof data.errorCode === "string" ? data.errorCode : undefined);
    return data;
  };
  const refresh = async (state: Saved) => {
    if (!state.conversationId) return;
    if (refreshInFlight.current) return refreshInFlight.current;
    const work = (async () => {
      const data = await fetchJson(`/conversations/${state.conversationId}/messages`, state.token);
      setMessages(data.messages);
      const actions = await fetchJson("/actions/pending", state.token);
      setPendingActions(actions.actions ?? []);
      if (data.conversation.status === "handoff") setStatus(t.handoff);
      else if (data.conversation.status === "closed") setStatus(t.closed);
      else if (!state.pending) setStatus("");
    })();
    refreshInFlight.current = work;
    try { await work; } finally { if (refreshInFlight.current === work) refreshInFlight.current = null; }
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
      if (caught instanceof WidgetHttpError && caught.statusCode === 429) {
        setRetryAt(Date.now() + (caught.retryAfterMs || 3000));
        setStatus(t.rateLimited);
        setError(t.rateLimited);
        return;
      }
      const terminal =
        caught instanceof WidgetHttpError && [402, 502].includes(caught.statusCode);
      if (terminal)
        save({ ...state, pending: undefined });
      setError(caught instanceof WidgetHttpError && caught.statusCode === 402 ? t.budgetExhausted
        : caught instanceof WidgetHttpError && caught.code === "provider_model_unavailable" ? t.modelUnavailable
          : terminal ? t.failed : caught instanceof Error ? caught.message : t.sendError);
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
        if (!cancelled) setError(caught instanceof WidgetHttpError && caught.statusCode === 401
          ? language === "tr" ? "Sohbet oturumu sona erdi. Yeni sohbet başlatın." : "Chat session expired. Start a new chat."
          : caught instanceof WidgetHttpError && caught.statusCode === 429
            ? t.rateLimited : caught instanceof Error ? caught.message : t.connectionError);
      }
    };
    void connect();
    return () => {
      cancelled = true;
    };
  }, [open, saved?.token]);
  useEffect(() => {
    if (!open || !saved?.conversationId) return;
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    const poll = async () => {
      let delay = 3000;
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
        failures = 0;
        setError("");
      } catch (caught) {
        failures++;
        delay = Math.min(60_000, 3000 * 2 ** Math.min(failures, 4));
        if (caught instanceof WidgetHttpError && caught.statusCode === 429) {
          delay = Math.max(delay, caught.retryAfterMs);
          setError("");
          setStatus(t.rateLimited);
        } else setError(t.lost);
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), delay);
    };
    timer = window.setTimeout(() => void poll(), 3000);
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [open, saved?.token, saved?.conversationId]);
  async function start() {
    setOpen(true);
    if (saved) return;
    setBusy(true);
    try {
      const data = await fetchJson("/sessions", undefined, { publicKey, locale: language });
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
    setPendingActions([]);
    setStatus("");
    setError("");
    setRetryAt(0);
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
  async function decide(action: PendingAction, confirmed: boolean) {
    if (!saved || busy) return;
    setBusy(true);
    setError("");
    try {
      await fetchJson(`/actions/${action.id}/${confirmed ? "confirm" : "decline"}`, saved.token, {});
      await refresh(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.connectionError);
    } finally { setBusy(false); }
  }
  return (
    <>
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
          {pendingActions.map((action) => {
            const names = actionLabels[language];
            const title = names[action.name as keyof typeof names] ?? action.name;
            const details = action.name === "create_customer"
              ? `${String(action.arguments.name ?? "")} · ${String(action.arguments.contact ?? "")}`
              : `${String(action.arguments.startAt ?? action.arguments.appointmentId ?? "")} ${action.arguments.durationMinutes ? `· ${action.arguments.durationMinutes} min` : ""}`;
            return <section key={action.id} className="ost-state" aria-label={names.pending}>
              <strong>{title}</strong><p>{details}</p>
              <button type="button" disabled={busy} onClick={() => void decide(action, true)}>{names.confirm}</button>{" "}
              <button type="button" disabled={busy} onClick={() => void decide(action, false)}>{names.decline}</button>
            </section>;
          })}
          {error && (
            <p className="ost-error" role="alert">
              {error}
            </p>
          )}
          {!saved && !busy && (
            <button className="ost-retry" type="button" onClick={() => void start()}>
              {language === "tr" ? "Yeni sohbet başlat" : "Start new chat"}
            </button>
          )}
          {saved?.pending && error && (
            <button
              className="ost-retry"
              type="button"
              disabled={retryAt > Date.now()}
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
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  // Use the script host, which can differ from the API and the customer site.
  stylesheet.href = new URL("embed.css", script.src).href;
  const mount = () => createRoot(shadow.appendChild(document.createElement("div"))).render(
    <Widget publicKey={publicKey} apiBase={apiBase} language={language} />,
  );
  stylesheet.addEventListener("load", mount, { once: true });
  stylesheet.addEventListener("error", mount, { once: true });
  shadow.append(stylesheet);
}
