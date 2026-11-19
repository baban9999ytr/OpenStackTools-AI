import { useEffect, useState, type FormEvent } from "react";
import { api, type Assistant } from "./api";
import { usePreferences } from "./preferences";

type Connection = { id: string; channel: string; assistantId: string; providerName: string | null;
  providerUsername: string | null; credentialSource: "operator" | "managed"; status: string;
  webhookState: string; active: boolean; verifiedAt: string | null; lastSuccessfulCheckAt: string | null;
  lastErrorCategory: string | null };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed";

export function Channels({ organizationId, role, assistants, onSelectAssistants }: {
  organizationId: string; role: string; assistants: Assistant[]; onSelectAssistants: () => void;
}) {
  const { t, locale } = usePreferences();
  const canManage = role === "owner" || role === "admin";
  const base = `/organizations/${organizationId}/channels`;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [available, setAvailable] = useState(false);
  const [assistantId, setAssistantId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [repairToken, setRepairToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [disconnecting, setDisconnecting] = useState("");
  const [password, setPassword] = useState("");
  async function load() {
    const result = await api<{ telegramSelfServiceAvailable: boolean; connections: Connection[] }>(base);
    setConnections(result.connections); setAvailable(result.telegramSelfServiceAvailable);
  }
  useEffect(() => { void load().catch((caught) => setError(t(errorText(caught))));
    setAssistantId(""); setBotToken(""); setRepairToken(""); setPassword(""); setDisconnecting("");
  }, [organizationId]);
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await api<{ connection: Connection }>(`${base}/telegram`, {
        method: "POST", body: JSON.stringify({ assistantId, botToken }),
      });
      setBotToken(""); await load();
      setNotice(t(response.connection.status === "connected" ? "Telegram bot connected." : "Bot saved; webhook needs attention."));
    } catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  async function action(connection: Connection, operation: "verify" | "repair" | "disable" | "assistant", nextAssistantId?: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await api<{ connection: Connection }>(`${base}/telegram/${connection.id}/${operation}`, {
        method: operation === "assistant" ? "PATCH" : "POST",
        body: JSON.stringify(operation === "repair" ? (repairToken ? { botToken: repairToken } : {})
          : operation === "assistant" ? { assistantId: nextAssistantId } : {}),
      });
      setRepairToken(""); await load();
      setNotice(t(response.connection.status === "connected" ? "Connection verified." : "Connection status updated."));
    } catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  async function disconnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!disconnecting) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await api<{ connection: Connection }>(`${base}/telegram/${disconnecting}`, {
        method: "DELETE", body: JSON.stringify({ password }),
      });
      setPassword(""); setDisconnecting(""); await load();
      setNotice(t(response.connection.status === "disconnected" ? "Telegram bot disconnected." : "Disconnect needs attention; inbound messages are disabled."));
    } catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  const telegram = connections.filter((item) => item.channel === "telegram" && item.status !== "disconnected");
  const activeAssistants = assistants.filter((item) => item.active);
  return <div className="channels-grid">
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    <section className="card channel-card"><h2>{t("Website")}</h2>
      <p className="muted">{t("Website widget is available for assistants with allowed origins.")}</p>
      <strong>{activeAssistants.length} {t("active assistants")}</strong>
      <div className="handoff-actions"><button type="button" className="secondary" onClick={onSelectAssistants}>{t("Manage assistants")}</button></div>
    </section>
    <section className="card channel-card"><h2>Telegram</h2>
      <p className="muted">{t("Connect a Telegram bot to an existing assistant. Customers must start the chat first.")}</p>
      {!available && <p role="status">{t("Setup required: the platform operator must configure HTTPS and credential encryption.")}</p>}
      {telegram.length === 0 && <p>{t("Not connected")}</p>}
      {telegram.map((connection) => <div key={connection.id} className="list-item">
        <strong>{connection.providerName ?? t("Telegram bot")}{connection.providerUsername ? ` · @${connection.providerUsername}` : ""}</strong>
        <span>{t("Status")}: {t(connection.status)} · {t("Webhook")}: {t(connection.webhookState)}</span>
        <span>{t("Assistant")}: {assistants.find((item) => item._id === connection.assistantId)?.name ?? t("Assistant unavailable")}</span>
        {connection.lastSuccessfulCheckAt && <small>{t("Last checked")}: {new Date(connection.lastSuccessfulCheckAt).toLocaleString(locale)}</small>}
        {connection.lastErrorCategory && <small role="status">{t("Needs attention")}: {t(connection.lastErrorCategory)}</small>}
        {connection.providerUsername && <a href={`https://t.me/${connection.providerUsername}`} target="_blank" rel="noopener noreferrer">{t("Open bot in Telegram")}</a>}
        {connection.credentialSource === "operator" ? <p className="muted">{t("Operator-managed connection. Dashboard changes are unavailable.")}</p>
          : canManage && <div className="channel-controls">
            <div className="handoff-actions">
              <button type="button" className="secondary" disabled={busy} onClick={() => void action(connection, "verify")}>{t("Check connection")}</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void action(connection, "disable")}>{t("Disable")}</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setDisconnecting(connection.id)}>{t("Disconnect")}</button>
            </div>
            {available && <><label>{t("Replacement bot token (optional)")}
              <input type="password" autoComplete="off" value={repairToken} onChange={(event) => setRepairToken(event.target.value)} maxLength={200} /></label>
              <button type="button" disabled={busy} onClick={() => void action(connection, "repair")}>{t("Reconnect or repair")}</button></>}
            <label>{t("Connected assistant")}
              <select value={connection.assistantId} disabled={busy} onChange={(event) => void action(connection, "assistant", event.target.value)}>
                {activeAssistants.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
              </select></label>
          </div>}
        {disconnecting === connection.id && <form onSubmit={disconnect}>
          <p>{t("Disconnect removes the Telegram webhook and stored bot credential. Existing conversations remain under retention policy.")}</p>
          <label>{t("Confirm with your password")}<input type="password" autoComplete="current-password" required value={password}
            onChange={(event) => setPassword(event.target.value)} /></label>
          <div className="handoff-actions"><button disabled={busy}>{t("Confirm disconnect")}</button>
            <button type="button" className="secondary" onClick={() => { setDisconnecting(""); setPassword(""); }}>{t("Cancel")}</button></div>
        </form>}
      </div>)}
      {canManage && available && <form onSubmit={connect} className="channel-wizard">
        <h3>{t("Connect Telegram bot")}</h3>
        <ol><li>{t("Choose an active assistant below.")}</li>
          <li>{t("Open BotFather, send /newbot, choose a name and a unique username ending in bot.")} <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">BotFather ↗</a></li>
          <li>{t("Copy the bot token and paste it below. Never enter your Telegram password or login code here.")}</li></ol>
        <label>{t("Assistant")}<select required value={assistantId} onChange={(event) => setAssistantId(event.target.value)}>
          <option value="">{t("Select assistant")}</option>{activeAssistants.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
        </select></label>
        <label>{t("BotFather token")}<input required type="password" autoComplete="off" maxLength={200} minLength={20}
          value={botToken} onChange={(event) => setBotToken(event.target.value)} /></label>
        <button disabled={busy || !assistantId || !botToken}>{busy ? t("Please wait…") : t("Verify and connect")}</button>
        <p className="muted">{t("The server verifies the bot and installs its webhook. Connected appears only after provider verification.")}</p>
      </form>}
    </section>
    {(["WhatsApp", "Instagram"] as const).map((name) => <section className="card channel-card" key={name}>
      <h2>{name}</h2><strong>{t("Coming soon")}</strong>
      <p className="muted">{t("This channel cannot be connected yet. Official business authorization is planned.")}</p>
    </section>)}
  </div>;
}
