import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";

type WidgetMessage = { role: "customer" | "assistant" | "agent"; text: string };
const css = `:host{all:initial;font-family:ui-sans-serif,system-ui,sans-serif;color:#17304e}.ost-launch{position:fixed;right:24px;bottom:24px;z-index:2147483647;border:0;border-radius:999px;background:#315bd4;color:white;padding:16px 20px;font:700 15px ui-sans-serif,system-ui;box-shadow:0 10px 28px #142d5460;cursor:pointer}.ost-panel{position:fixed;right:24px;bottom:82px;z-index:2147483647;width:min(370px,calc(100vw - 32px));height:min(550px,calc(100vh - 110px));display:flex;flex-direction:column;background:white;border:1px solid #d8e2ef;border-radius:18px;box-shadow:0 18px 60px #142d5460;overflow:hidden}.ost-head{background:#142d54;color:white;padding:17px 20px;font-weight:700}.ost-head small{display:block;color:#bad1ee;font-weight:400;margin-top:3px}.ost-messages{flex:1;overflow:auto;padding:16px;background:#f7f9fc}.ost-message{max-width:85%;padding:9px 12px;margin:8px 0;border-radius:12px;background:#e8edf5;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.ost-message.customer{margin-left:auto;background:#dce8ff}.ost-form{display:flex;gap:8px;padding:12px;background:white;border-top:1px solid #e5ebf2}.ost-form input{flex:1;min-width:0;padding:10px;border:1px solid #cfd9e5;border-radius:8px;font:inherit}.ost-form button{border:0;border-radius:8px;background:#315bd4;color:white;padding:10px 13px;font:700 13px ui-sans-serif,system-ui;cursor:pointer}.ost-form button:disabled{opacity:.6}.ost-error{color:#a43120;padding:0 14px;font-size:13px}`;
function Widget({
  publicKey,
  apiBase,
}: {
  publicKey: string;
  apiBase: string;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [assistantName, setAssistantName] = useState("AI assistant");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !token || !conversationId) return;
    const refresh = async () => {
      try {
        const response = await fetch(
          `${apiBase}/api/widget/conversations/${conversationId}/messages`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) return;
        const data = await response.json();
        setMessages(
          data.messages.map((item: WidgetMessage) => ({
            role: item.role,
            text: item.text,
          })),
        );
      } catch {
        /* A later poll can recover after a temporary network failure. */
      }
    };
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [open, token, conversationId, apiBase]);
  async function start() {
    setOpen(true);
    if (token) return;
    try {
      const response = await fetch(`${apiBase}/api/widget/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not start chat");
      setToken(data.token);
      setAssistantName(data.assistant.name);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start chat");
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
    const form = event.currentTarget;
    const input = form.elements.namedItem("message") as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    setBusy(true);
    setError("");
    setMessages((previous) => [...previous, { role: "customer", text }]);
    try {
      const response = await fetch(`${apiBase}/api/widget/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          conversationId: conversationId || undefined,
          clientMessageId: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not send message");
      setConversationId(data.conversationId);
      if (data.reply)
        setMessages((previous) => [
          ...previous,
          { role: "assistant", text: data.reply.text },
        ]);
      if (data.status === "handoff")
        setMessages((previous) => [
          ...previous,
          { role: "agent", text: "A team member will reply here." },
        ]);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not send message",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <style>{css}</style>
      <button
        className="ost-launch"
        type="button"
        onClick={() => (open ? setOpen(false) : void start())}
        aria-expanded={open}
      >
        {open ? "Close chat" : "Chat with us"}
      </button>
      {open && (
        <section className="ost-panel" aria-label="Business chat">
          <header className="ost-head">
            {assistantName}
            <small>Messages are shared with this business.</small>
          </header>
          <div className="ost-messages" aria-live="polite">
            {messages.length === 0 && <p>How can we help?</p>}
            {messages.map((message, index) => (
              <div key={index} className={`ost-message ${message.role}`}>
                {message.text}
              </div>
            ))}
            {busy && <p role="status">Thinking…</p>}
          </div>
          {error && (
            <p className="ost-error" role="alert">
              {error}
            </p>
          )}
          <form className="ost-form" onSubmit={send}>
            <input
              name="message"
              aria-label="Your message"
              placeholder="Write a message…"
              maxLength={4000}
              required
              disabled={!token || busy}
            />
            <button disabled={!token || busy} type="submit">
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
