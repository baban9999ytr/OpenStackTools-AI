import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  type Assistant,
  type Conversation,
  type Message,
  type Organization,
} from "./api";

type Account = { id: string; name: string; email: string };
type Me = { user: Account; organizations: Organization[] };
const getError = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const link = new URLSearchParams(window.location.hash.slice(1));
  const [mode, setMode] = useState<
    "login" | "register" | "verify" | "reset" | "invite" | "forgot"
  >(
    link.has("verify")
      ? "verify"
      : link.has("reset")
        ? "reset"
        : link.has("invite")
          ? "invite"
          : "login",
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const endpoint =
        mode === "forgot"
          ? "request-password-reset"
          : mode === "verify"
            ? "verify-email"
            : mode === "reset"
              ? "reset-password"
              : mode === "invite"
                ? "accept-invitation"
                : mode;
      await api(`/auth/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({
          ...data,
          ...(mode === "verify" || mode === "reset" || mode === "invite"
            ? { token: link.get(mode) }
            : {}),
        }),
      });
      if (mode === "register" || mode === "forgot") {
        setNotice(
          mode === "register"
            ? "Check your email to verify your account."
            : "If that account exists, a reset link has been sent.",
        );
        setMode("login");
      } else {
        window.history.replaceState(null, "", window.location.pathname);
        onSuccess();
      }
    } catch (error) {
      setError(getError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="brand-panel">
        <span className="eyebrow">OpenStackTools AI</span>
        <h1>One place for your business conversations.</h1>
        <p>
          Create assistants, guide their responses, and step in when a person is
          needed.
        </p>
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="auth-panel">
        <div className="card auth-card">
          <h2>
            {mode === "login"
              ? "Welcome back"
              : mode === "register"
                ? "Create your workspace"
                : mode === "forgot"
                  ? "Reset your password"
                  : mode === "verify"
                    ? "Verify your email"
                    : mode === "invite"
                      ? "Accept invitation"
                      : "Choose a new password"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Sign in to your business dashboard."
              : mode === "register"
                ? "Start with an organization and an owner account."
                : "Complete this secure account step."}
          </p>
          <form onSubmit={submit}>
            {(mode === "register" || mode === "invite") && (
              <>
                {mode === "register" && (
                  <label>
                    Organization name
                    <input
                      name="organizationName"
                      minLength={2}
                      maxLength={100}
                      required
                      autoComplete="organization"
                    />
                  </label>
                )}
                <label>
                  Your name
                  <input
                    name="name"
                    required
                    maxLength={100}
                    autoComplete="name"
                  />
                </label>
              </>
            )}
            {(mode === "login" || mode === "register" || mode === "forgot") && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            )}
            {(mode === "login" ||
              mode === "register" ||
              mode === "reset" ||
              mode === "invite") && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "login" ? undefined : 12}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>
            )}
            {notice && <p role="status">{notice}</p>}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy} type="submit">
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "register"
                    ? "Create workspace"
                    : mode === "forgot"
                      ? "Send reset link"
                      : "Continue"}
            </button>
          </form>
          {(mode === "login" || mode === "register") && (
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login"
                ? "Create an account"
                : "Already have an account? Sign in"}
            </button>
          )}
          {mode === "login" && (
            <button className="text-button" onClick={() => setMode("forgot")}>
              Forgot password?
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function Dashboard({ me, reload }: { me: Me; reload: () => void }) {
  const [organizationId, setOrganizationId] = useState(
    me.organizations[0]?.id ?? "",
  );
  const organization = me.organizations.find(
    (item) => item.id === organizationId,
  );
  const [tab, setTab] = useState<"assistants" | "inbox" | "team" | "usage">(
    "assistants",
  );
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [editingAssistantId, setEditingAssistantId] = useState("");
  const editingAssistant = assistants.find(
    (item) => item._id === editingAssistantId,
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<
    Array<{
      userId: string;
      role: string;
      user?: { name: string; email: string };
    }>
  >([]);
  const [usage, setUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    estimatedCostMicros: number;
  } | null>(null);
  const [budget, setBudget] = useState<{
    dailyLimitMicros: number;
    monthlyLimitMicros: number;
    windows: Array<{
      kind: string;
      spentMicros: number;
      reservedMicros: number;
    }>;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManage =
    organization?.role === "owner" || organization?.role === "admin";
  const canReply = canManage || organization?.role === "agent";
  async function load() {
    if (!organizationId) return;
    try {
      const [a, c] = await Promise.all([
        api<{ assistants: Assistant[] }>(
          `/organizations/${organizationId}/assistants`,
        ),
        api<{ conversations: Conversation[] }>(
          `/organizations/${organizationId}/conversations`,
        ),
      ]);
      setAssistants(a.assistants);
      setConversations(c.conversations);
      setError("");
    } catch (error) {
      setError(getError(error));
    }
  }
  useEffect(() => {
    void load();
    setEditingAssistantId("");
    setSelected("");
    setMessages([]);
  }, [organizationId]);
  useEffect(() => {
    if (!selected || !organizationId) return;
    api<{ messages: Message[] }>(
      `/organizations/${organizationId}/conversations/${selected}/messages`,
    )
      .then((data) => setMessages(data.messages))
      .catch((error) => setError(getError(error)));
  }, [selected, organizationId]);
  useEffect(() => {
    if (!organizationId || !canManage) return;
    if (tab === "team")
      api<{ members: typeof members }>(
        `/organizations/${organizationId}/members`,
      )
        .then((data) => setMembers(data.members))
        .catch((error) => setError(getError(error)));
    if (tab === "usage") {
      api<{ totals: typeof usage }>(`/organizations/${organizationId}/usage`)
        .then((data) => setUsage(data.totals))
        .catch((error) => setError(getError(error)));
      api<typeof budget>(`/organizations/${organizationId}/budgets`)
        .then(setBudget)
        .catch((error) => setError(getError(error)));
    }
  }, [tab, organizationId, canManage]);
  async function createAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api(`/organizations/${organizationId}/assistants`, {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          instructions: data.get("instructions"),
          allowedOrigins: String(data.get("allowedOrigins") ?? "")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      form.reset();
      setNotice("Assistant created.");
      await load();
    } catch (error) {
      setError(getError(error));
    }
  }
  async function updateAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAssistant) return;
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      await api(
        `/organizations/${organizationId}/assistants/${editingAssistant._id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: data.get("name"),
            instructions: data.get("instructions"),
            allowedOrigins: String(data.get("allowedOrigins") ?? "")
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
            active: data.get("active") === "on",
          }),
        },
      );
      setNotice("Assistant updated.");
      setEditingAssistantId("");
      await load();
    } catch (error) {
      setError(getError(error));
    }
  }
  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      await api(`/organizations/${organizationId}/invitations`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      form.reset();
      setNotice("Invitation sent by email. It expires in 72 hours.");
    } catch (error) {
      setError(getError(error));
    }
  }
  async function setStatus(status: Conversation["status"]) {
    try {
      await api(
        `/organizations/${organizationId}/conversations/${selected}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      await load();
      setNotice(`Conversation set to ${status}.`);
    } catch (error) {
      setError(getError(error));
    }
  }
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api(
        `/organizations/${organizationId}/conversations/${selected}/reply`,
        { method: "POST", body: JSON.stringify({ text: data.get("text") }) },
      );
      form.reset();
      const response = await api<{ messages: Message[] }>(
        `/organizations/${organizationId}/conversations/${selected}/messages`,
      );
      setMessages(response.messages);
    } catch (error) {
      setError(getError(error));
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      reload();
    } catch (error) {
      setError(getError(error));
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">
          <span className="wordmark-icon">✳</span>
          <span>
            OpenStackTools <strong>AI</strong>
          </span>
        </div>
        <label className="org-picker">
          Organization
          <select
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            {me.organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Main navigation">
          {(["assistants", "inbox", "team", "usage"] as const)
            .filter((item) =>
              item === "team" || item === "usage" ? canManage : true,
            )
            .map((item) => (
              <button
                key={item}
                className={tab === item ? "nav-active" : ""}
                onClick={() => setTab(item)}
              >
                {item === "inbox"
                  ? "Conversations"
                  : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
        </nav>
        <div className="sidebar-footer">
          <span>
            {me.user.name}
            <small>{me.user.email}</small>
          </span>
          <button className="text-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">Business dashboard</span>
            <h1>
              {tab === "inbox"
                ? "Conversations"
                : tab[0].toUpperCase() + tab.slice(1)}
            </h1>
          </div>
          <button className="secondary" onClick={load}>
            Refresh
          </button>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {tab === "assistants" && (
          <div className="grid-two">
            <section className="card">
              <h2>Your assistants</h2>
              {assistants.length === 0 && (
                <p className="muted">
                  No assistants yet. Create one to start testing the website
                  widget.
                </p>
              )}
              {assistants.map((item) => (
                <article className="list-item" key={item._id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted">
                      {item.active ? "Active" : "Paused"} ·{" "}
                      {item.allowedOrigins.length} allowed origins
                    </p>
                    <code>{item.publicKey}</code>
                    {canManage && (
                      <button
                        className="text-button"
                        onClick={() => setEditingAssistantId(item._id)}
                      >
                        Edit settings
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </section>
            {canManage && (
              <section className="card">
                <h2>
                  {editingAssistant ? "Edit assistant" : "Create assistant"}
                </h2>
                <form
                  key={editingAssistant?._id ?? "new"}
                  onSubmit={
                    editingAssistant ? updateAssistant : createAssistant
                  }
                >
                  <label>
                    Name
                    <input
                      name="name"
                      minLength={2}
                      maxLength={80}
                      required
                      placeholder="Customer support"
                      defaultValue={editingAssistant?.name}
                    />
                  </label>
                  <label>
                    Instructions
                    <textarea
                      name="instructions"
                      minLength={10}
                      maxLength={8000}
                      rows={6}
                      required
                      placeholder="Describe the assistant's role, tone, and when to hand off."
                      defaultValue={editingAssistant?.instructions}
                    />
                  </label>
                  <label>
                    Allowed website origins{" "}
                    <small>One exact origin per line</small>
                    <textarea
                      name="allowedOrigins"
                      rows={3}
                      required
                      defaultValue={
                        editingAssistant
                          ? editingAssistant.allowedOrigins.join("\n")
                          : window.location.origin
                      }
                    />
                  </label>
                  {editingAssistant && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={editingAssistant.active}
                      />
                      Active
                    </label>
                  )}
                  <button type="submit">
                    {editingAssistant ? "Save changes" : "Create assistant"}
                  </button>
                  {editingAssistant && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setEditingAssistantId("")}
                    >
                      Cancel editing
                    </button>
                  )}
                </form>
                <p className="muted">
                  Use the public key with <code>/embed.js</code>. See the README
                  for the embed snippet.
                </p>
              </section>
            )}
          </div>
        )}
        {tab === "inbox" && (
          <div className="inbox-layout">
            <section className="card conversation-list">
              <h2>Recent conversations</h2>
              {conversations.length === 0 && (
                <p className="muted">No conversations yet.</p>
              )}
              {conversations.map((item) => (
                <button
                  key={item._id}
                  className={
                    selected === item._id ? "list-item selected" : "list-item"
                  }
                  onClick={() => setSelected(item._id)}
                >
                  <strong>
                    {assistants.find(
                      (assistant) => assistant._id === item.assistantId,
                    )?.name ?? "Assistant"}
                  </strong>
                  <span className="badge">{item.status}</span>
                  <small>{new Date(item.updatedAt).toLocaleString()}</small>
                </button>
              ))}
            </section>
            <section className="card message-panel">
              <h2>{selected ? "Conversation" : "Select a conversation"}</h2>
              {selected && (
                <>
                  <div className="message-list">
                    {messages.map((message) => (
                      <div
                        key={message._id}
                        className={`message ${message.role}`}
                      >
                        <small>{message.role}</small>
                        <p>{message.text}</p>
                      </div>
                    ))}
                  </div>
                  {canReply && (
                    <div className="handoff-actions">
                      <button
                        className="secondary"
                        onClick={() => setStatus("handoff")}
                      >
                        Take over
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setStatus("bot")}
                      >
                        Return to bot
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setStatus("closed")}
                      >
                        Close
                      </button>
                    </div>
                  )}
                  {canReply &&
                    conversations.find((item) => item._id === selected)
                      ?.status === "handoff" && (
                      <form className="reply-form" onSubmit={reply}>
                        <label>
                          Reply as staff
                          <textarea
                            name="text"
                            required
                            maxLength={4000}
                            rows={2}
                          />
                        </label>
                        <button type="submit">Send reply</button>
                      </form>
                    )}
                </>
              )}
            </section>
          </div>
        )}
        {tab === "team" && canManage && (
          <div className="grid-two">
            <section className="card">
              <h2>Staff</h2>
              {members.map((item) => (
                <div key={item.userId} className="list-item">
                  <strong>{item.user?.name ?? "Unknown"}</strong>
                  <span>{item.role}</span>
                  <small>{item.user?.email}</small>
                </div>
              ))}
            </section>
            {organization?.role === "owner" && (
              <section className="card">
                <h2>Invite staff</h2>
                <p className="muted">
                  Invite a new account. The recipient sets their own password.
                </p>
                <form onSubmit={createMember}>
                  <label>
                    Email
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Role
                    <select name="role">
                      <option value="agent">Agent</option>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <button type="submit">Send invitation</button>
                </form>
              </section>
            )}
          </div>
        )}
        {tab === "usage" && canManage && (
          <section className="card">
            <h2>AI usage and budgets</h2>
            <div className="stat-row">
              <div>
                <strong>{usage?.inputTokens ?? 0}</strong>
                <span>Input tokens</span>
              </div>
              <div>
                <strong>{usage?.outputTokens ?? 0}</strong>
                <span>Output tokens</span>
              </div>
              <div>
                <strong>
                  ${((usage?.estimatedCostMicros ?? 0) / 1_000_000).toFixed(4)}
                </strong>
                <span>Estimated all-time cost</span>
              </div>
            </div>
            {budget && (
              <p>
                Daily limit: ${(budget.dailyLimitMicros / 1_000_000).toFixed(2)}{" "}
                · Monthly limit: $
                {(budget.monthlyLimitMicros / 1_000_000).toFixed(2)}.{" "}
                {budget.windows
                  .map(
                    (window) =>
                      `${window.kind}: $${((window.spentMicros + window.reservedMicros) / 1_000_000).toFixed(4)} committed`,
                  )
                  .join(" · ")}
              </p>
            )}
            {organization?.role === "owner" && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  try {
                    await api(`/organizations/${organizationId}/budgets`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        dailyUsd: data.get("dailyUsd"),
                        monthlyUsd: data.get("monthlyUsd"),
                      }),
                    });
                    setBudget(
                      await api<typeof budget>(
                        `/organizations/${organizationId}/budgets`,
                      ),
                    );
                    setNotice("Budgets updated.");
                  } catch (error) {
                    setError(getError(error));
                  }
                }}
              >
                <label>
                  Daily USD
                  <input
                    name="dailyUsd"
                    required
                    defaultValue={(budget?.dailyLimitMicros ?? 0) / 1_000_000}
                  />
                </label>
                <label>
                  Monthly USD
                  <input
                    name="monthlyUsd"
                    required
                    defaultValue={(budget?.monthlyLimitMicros ?? 0) / 1_000_000}
                  />
                </label>
                <button type="submit">Update budgets</button>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      setMe(await api<Me>("/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  if (loading)
    return (
      <div className="loading-screen" role="status">
        Loading workspace…
      </div>
    );
  return me ? (
    <Dashboard me={me} reload={load} />
  ) : (
    <AuthScreen onSuccess={load} />
  );
}
