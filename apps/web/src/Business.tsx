import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { usePreferences } from "./preferences";

type Knowledge = { profile: string; services: Array<{ name: string; description: string; price: string }>;
  faqs: Array<{ question: string; answer: string }>; policies: Array<{ title: string; text: string }>;
  contact: { email: string; phone: string; address: string; website: string }; facts: Array<{ label: string; value: string }> };
type ListingFacts = { maintenanceFee?: number; deposit?: number; furnished?: boolean };
type Listing = { _id: string; title: string; description: string; location: string; price: number; currency: string;
  propertyType: string; listingType?: string; rooms?: number; areaSqm: number; availability: string; publicUrl?: string; updatedAt: string; facts?: ListingFacts };
type Lead = { _id: string; name: string; contact: string; request: string; leadStatus: string; requirements?: string;
  budgetMin?: number; budgetMax?: number; preferredLocations?: string[]; propertyTypes?: string[]; minRooms?: number;
  minAreaSqm?: number; assignedTo?: string | null; notes?: string; followUpAt?: string | null; conversationId?: string };
type Summary = { conversationId: string; status: string; updatedAt: string; recent: Array<{ role: string; text: string }> };
const emptyKnowledge: Knowledge = { profile: "", services: [], faqs: [], policies: [], contact: { email: "", phone: "", address: "", website: "" }, facts: [] };
const emptyListing = { title: "", description: "", location: "", price: "", currency: "TRY", listingType: "", propertyType: "apartment", rooms: "", areaSqm: "", availability: "available", publicUrl: "", maintenanceFee: "", deposit: "", furnished: "" };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong";
const localInput = (iso?: string | null) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";

function Rows<K extends "services" | "faqs" | "policies" | "facts">({ label, kind, value, change, fields, blank, readonly }: {
  label: string; kind: K; value: Knowledge[K]; change: (next: Knowledge[K]) => void;
  fields: string[]; blank: Record<string, string>; readonly: boolean;
}) {
  const { t } = usePreferences();
  return <fieldset className="business-rows"><legend>{t(label)}</legend>
    {(value as Array<Record<string, string>>).map((row, index) => <div className="business-row" key={index}>
      {fields.map((field) => <label key={field}>{t(field[0].toUpperCase() + field.slice(1))}
        {field === "description" || field === "answer" || field === "text" || field === "value"
          ? <textarea maxLength={field === "answer" || field === "text" ? 1000 : 500} value={row[field] ?? ""} disabled={readonly}
            onChange={(event) => change((value as Array<Record<string, string>>).map((item, i) => i === index ? { ...item, [field]: event.target.value } : item) as Knowledge[K])} />
          : <input maxLength={field === "question" ? 200 : 100} value={row[field] ?? ""} disabled={readonly}
            onChange={(event) => change((value as Array<Record<string, string>>).map((item, i) => i === index ? { ...item, [field]: event.target.value } : item) as Knowledge[K])} />}</label>)}
      {!readonly && <button type="button" className="secondary" onClick={() => change(value.filter((_, i) => i !== index) as Knowledge[K])}>{t("Remove")}</button>}
    </div>)}
    {!readonly && <button type="button" className="secondary" onClick={() => change([...(value as Array<Record<string, string>>), blank] as Knowledge[K])}>{t("Add")}</button>}
  </fieldset>;
}

export function Business({ organizationId, role }: { organizationId: string; role: string }) {
  const { t, locale } = usePreferences();
  const canManage = role === "owner" || role === "admin";
  const canWrite = canManage || role === "agent";
  const base = `/organizations/${organizationId}`;
  const [knowledge, setKnowledge] = useState<Knowledge>(emptyKnowledge);
  const [listings, setListings] = useState<Listing[]>([]);
  const [listing, setListing] = useState(emptyListing);
  const [editing, setEditing] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [followUps, setFollowUps] = useState<Lead[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [k, l, s] = await Promise.all([
        api<{ knowledge: Knowledge | null }>(`${base}/knowledge`),
        api<{ listings: Listing[] }>(`${base}/listings?all=true${filter ? `&location=${encodeURIComponent(filter)}` : ""}`),
        api<{ summaries: Summary[] }>(`${base}/conversation-summaries`),
      ]);
      setKnowledge(k.knowledge ? { profile: k.knowledge.profile,
        services: k.knowledge.services.map(({ name, description, price }) => ({ name, description, price })),
        faqs: k.knowledge.faqs.map(({ question, answer }) => ({ question, answer })),
        policies: k.knowledge.policies.map(({ title, text }) => ({ title, text })),
        facts: k.knowledge.facts.map(({ label, value }) => ({ label, value })),
        contact: { email: k.knowledge.contact.email ?? "", phone: k.knowledge.contact.phone ?? "", address: k.knowledge.contact.address ?? "", website: k.knowledge.contact.website ?? "" } } : emptyKnowledge);
      setListings(l.listings); setSummaries(s.summaries);
      if (canWrite) {
        const [c, f, config] = await Promise.all([api<{ customers: Lead[] }>(`${base}/receptionist/customers`), api<{ customers: Lead[] }>(`${base}/leads/follow-up`),
          api<{ staff: Array<{ id: string; name: string }> }>(`${base}/receptionist/config`)]);
        setLeads(c.customers); setFollowUps(f.customers); setStaff(config.staff);
      }
      setError("");
    } catch (caught) { setError(t(errorText(caught))); }
  }
  useEffect(() => { void load(); }, [organizationId]);
  async function saveKnowledge(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`${base}/knowledge`, { method: "PUT", body: JSON.stringify(knowledge) }); setNotice(t("Business knowledge saved.")); await load(); }
    catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  async function saveListing(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { maintenanceFee, deposit, furnished, rooms, publicUrl, price, areaSqm, ...draft } = listing;
      const facts: ListingFacts = {
        ...(maintenanceFee !== "" ? { maintenanceFee: Number(maintenanceFee) } : {}),
        ...(deposit !== "" ? { deposit: Number(deposit) } : {}),
        ...(furnished !== "" ? { furnished: furnished === "true" } : {}),
      };
      const body = { ...draft, facts, price: price === "" ? undefined : Number(price), areaSqm: areaSqm === "" ? undefined : Number(areaSqm),
        rooms: rooms === "" ? (editing ? null : undefined) : Number(rooms),
        publicUrl: publicUrl || (editing ? null : undefined) };
      await api(`${base}/listings${editing ? `/${editing}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      setNotice(t("Listing saved.")); setListing(emptyListing); setEditing(""); await load();
    } catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  async function archive(id: string) {
    if (!window.confirm(t("Archive this listing?"))) return;
    setBusy(true);
    try { await api(`${base}/listings/${id}/archive`, { method: "POST", body: "{}" }); setNotice(t("Listing archived.")); await load(); }
    catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  async function updateLead(id: string, patch: Partial<Lead>) {
    setBusy(true); setError("");
    try { await api(`${base}/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); setNotice(t("Lead saved.")); await load(); }
    catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  return <div className="business-grid">
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
    <section className="card"><h2>{t("Business knowledge")}</h2><p className="muted">{t("Only publish information customers may see in the widget.")}</p>
      <form onSubmit={saveKnowledge}>
        <label>{t("Business profile")}<textarea maxLength={2000} disabled={!canManage} value={knowledge.profile} onChange={(event) => setKnowledge({ ...knowledge, profile: event.target.value })} /></label>
        <div className="business-pair">{(["email", "phone", "address", "website"] as const).map((field) => <label key={field}>{t(field[0].toUpperCase() + field.slice(1))}
          <input maxLength={field === "address" || field === "website" ? 300 : 200} disabled={!canManage} value={knowledge.contact[field]} onChange={(event) => setKnowledge({ ...knowledge, contact: { ...knowledge.contact, [field]: event.target.value } })} /></label>)}</div>
        <Rows label="Services and prices" kind="services" value={knowledge.services} change={(value) => setKnowledge({ ...knowledge, services: value })} fields={["name", "description", "price"]} blank={{ name: "", description: "", price: "" }} readonly={!canManage} />
        <Rows label="Frequently asked questions" kind="faqs" value={knowledge.faqs} change={(value) => setKnowledge({ ...knowledge, faqs: value })} fields={["question", "answer"]} blank={{ question: "", answer: "" }} readonly={!canManage} />
        <Rows label="Policies" kind="policies" value={knowledge.policies} change={(value) => setKnowledge({ ...knowledge, policies: value })} fields={["title", "text"]} blank={{ title: "", text: "" }} readonly={!canManage} />
        <Rows label="Custom facts" kind="facts" value={knowledge.facts} change={(value) => setKnowledge({ ...knowledge, facts: value })} fields={["label", "value"]} blank={{ label: "", value: "" }} readonly={!canManage} />
        {canManage && <button disabled={busy}>{t("Save knowledge")}</button>}
      </form>
    </section>
    <section className="card"><h2>{t("Property listings")}</h2>
      <p className="muted">{t("Only current, available listings appear in recommendations.")}</p>
      <form onSubmit={(event) => { event.preventDefault(); void load(); }}><label>{t("Search location")}<input value={filter} maxLength={100} onChange={(event) => setFilter(event.target.value)} /></label><button className="secondary">{t("Search")}</button></form>
      {listings.length === 0 && <p className="muted">{t("No matching listings.")}</p>}
      {listings.map((item) => <div className="list-item" key={item._id}><strong>{item.title}</strong><span>{item.location} · {item.price} {item.currency} · {item.listingType ? t(item.listingType) : t("Unspecified listing type")} · {t(item.availability)}</span>
        <small>{t("Updated")}: {new Date(item.updatedAt).toLocaleDateString(locale)}</small>
        {canWrite && <div className="handoff-actions"><button type="button" className="secondary" onClick={() => { setEditing(item._id); setListing({ title: item.title, description: item.description, location: item.location,
          price: String(item.price), currency: item.currency, listingType: item.listingType ?? "", propertyType: item.propertyType, rooms: String(item.rooms ?? ""),
          areaSqm: String(item.areaSqm), availability: item.availability, publicUrl: item.publicUrl ?? "",
          maintenanceFee: String(item.facts?.maintenanceFee ?? ""), deposit: String(item.facts?.deposit ?? ""),
          furnished: String(item.facts?.furnished ?? "") }); }}>{t("Edit")}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void archive(item._id)}>{t("Archive")}</button></div>}
      </div>)}
      {canWrite && <form onSubmit={saveListing}><h3>{t(editing ? "Edit listing" : "Add listing")}</h3>
        <label>{t("Title")}<input required maxLength={150} value={listing.title} onChange={(event) => setListing({ ...listing, title: event.target.value })} /></label>
        <label>{t("Description")}<textarea required maxLength={2000} value={listing.description} onChange={(event) => setListing({ ...listing, description: event.target.value })} /></label>
        <div className="business-pair"><label>{t("Location")}<input required maxLength={150} value={listing.location} onChange={(event) => setListing({ ...listing, location: event.target.value })} /></label>
          <label>{t("Price")}<input required type="number" min="0" max="1000000000" step="any" value={listing.price} onChange={(event) => setListing({ ...listing, price: event.target.value })} /></label>
          <label>{t("Currency")}<select value={listing.currency} onChange={(event) => setListing({ ...listing, currency: event.target.value, maintenanceFee: "", deposit: "" })}>{["TRY", "USD", "EUR", "GBP"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>{t("Listing type")}<select required value={listing.listingType} onChange={(event) => setListing({ ...listing, listingType: event.target.value })}><option value="">{t("Select listing type")}</option><option value="rent">{t("rent")}</option><option value="sale">{t("sale")}</option></select></label>
          <label>{t("Property type")}<select value={listing.propertyType} onChange={(event) => setListing({ ...listing, propertyType: event.target.value })}>{["apartment", "house", "land", "commercial"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
          <label>{t("Rooms")}<input type="number" min="0" max="50" value={listing.rooms} onChange={(event) => setListing({ ...listing, rooms: event.target.value })} /><small>{t("For 3+1, enter 3.")}</small></label>
          <label>{t("Area (m²)")}<input required type="number" min="1" max="1000000" step="any" value={listing.areaSqm} onChange={(event) => setListing({ ...listing, areaSqm: event.target.value })} /></label>
          <label>{t("Availability")}<select value={listing.availability} onChange={(event) => setListing({ ...listing, availability: event.target.value })}>{["available", "reserved", "sold"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
          <label>{t("Public URL")}<input type="url" maxLength={500} value={listing.publicUrl} onChange={(event) => setListing({ ...listing, publicUrl: event.target.value })} /></label></div>
        <fieldset className="business-rows">
          <legend>{t("Verified listing facts")}</legend>
          <p className="muted">{t("Enter only verified values. Leave unknown amounts blank and use the listing currency.")}</p>
          <div className="business-pair">
            <label>{t("Maintenance fee")} ({listing.currency})<input type="number" min="0" max="1000000000" step="any" value={listing.maintenanceFee}
              onChange={(event) => setListing({ ...listing, maintenanceFee: event.target.value })} /></label>
            <label>{t("Deposit")} ({listing.currency})<input type="number" min="0" max="1000000000" step="any" value={listing.deposit}
              onChange={(event) => setListing({ ...listing, deposit: event.target.value })} /></label>
            <label>{t("Furnishing status")}<select value={listing.furnished} onChange={(event) => setListing({ ...listing, furnished: event.target.value })}>
              <option value="">{t("Unknown")}</option><option value="true">{t("Furnished")}</option><option value="false">{t("Unfurnished")}</option>
            </select></label>
          </div>
        </fieldset>
        <button disabled={busy}>{t("Save listing")}</button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(""); setListing(emptyListing); }}>{t("Cancel editing")}</button>}
      </form>}
    </section>
    {canWrite && <section className="card"><h2>{t("Customer opportunities")}</h2>{leads.length === 0 && <p className="muted">{t("No consented leads yet.")}</p>}
      {leads.map((lead) => <LeadEditor key={lead._id} lead={lead} staff={staff} busy={busy} save={updateLead} />)}
    </section>}
    {canWrite && <section className="card"><h2>{t("Follow-up queue")}</h2>{followUps.length === 0 && <p className="muted">{t("No follow-ups due.")}</p>}
      {followUps.map((lead) => <div className="list-item" key={lead._id}><strong>{lead.name}</strong><span>{lead.contact}</span><small>{lead.followUpAt ? new Date(lead.followUpAt).toLocaleString(locale) : ""}</small></div>)}
    </section>}
    <section className="card"><h2>{t("Conversation summaries")}</h2><p className="muted">{t("Recent message excerpts, not AI-generated summaries.")}</p>
      {summaries.length === 0 && <p className="muted">{t("No conversations yet.")}</p>}
      {summaries.map((item) => <div className="list-item" key={item.conversationId}><strong>{t(item.status)}</strong>
        {item.recent.map((message, index) => <p key={index}>{t(message.role)}: {message.text}</p>)}</div>)}
    </section>
  </div>;
}

function LeadEditor({ lead, staff, busy, save }: { lead: Lead; staff: Array<{ id: string; name: string }>; busy: boolean; save: (id: string, patch: Partial<Lead>) => Promise<void> }) {
  const { t } = usePreferences();
  const [draft, setDraft] = useState(lead);
  return <form className="list-item" onSubmit={(event) => { event.preventDefault(); void save(lead._id, {
    requirements: draft.requirements ?? "", budgetMin: draft.budgetMin, budgetMax: draft.budgetMax,
    preferredLocations: draft.preferredLocations ?? [], propertyTypes: draft.propertyTypes ?? [], minRooms: draft.minRooms,
    minAreaSqm: draft.minAreaSqm, leadStatus: draft.leadStatus, assignedTo: draft.assignedTo || null,
    notes: draft.notes ?? "", followUpAt: draft.followUpAt || null,
  }); }}><strong>{lead.name}</strong><span>{lead.contact}</span><p>{lead.request}</p>
    <label>{t("Lead status")}<select value={draft.leadStatus} onChange={(event) => setDraft({ ...draft, leadStatus: event.target.value })}>{["new", "qualified", "contacted", "won", "lost"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
    <label>{t("Requirements")}<textarea maxLength={1000} value={draft.requirements ?? ""} onChange={(event) => setDraft({ ...draft, requirements: event.target.value })} /></label>
    <div className="business-pair"><label>{t("Minimum budget")}<input type="number" min="0" value={draft.budgetMin ?? ""} onChange={(event) => setDraft({ ...draft, budgetMin: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <label>{t("Maximum budget")}<input type="number" min="0" value={draft.budgetMax ?? ""} onChange={(event) => setDraft({ ...draft, budgetMax: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <label>{t("Preferred locations")}<input value={(draft.preferredLocations ?? []).join(", ")} onChange={(event) => setDraft({ ...draft, preferredLocations: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
      <label>{t("Property preferences")}<select value={draft.propertyTypes?.[0] ?? ""} onChange={(event) => setDraft({ ...draft, propertyTypes: event.target.value ? [event.target.value] : [] })}><option value="">—</option>{["apartment", "house", "land", "commercial"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label>{t("Minimum rooms")}<input type="number" min="0" value={draft.minRooms ?? ""} onChange={(event) => setDraft({ ...draft, minRooms: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <label>{t("Minimum area (m²)")}<input type="number" min="0" value={draft.minAreaSqm ?? ""} onChange={(event) => setDraft({ ...draft, minAreaSqm: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <label>{t("Follow up at")}<input type="datetime-local" value={localInput(draft.followUpAt)} onChange={(event) => setDraft({ ...draft, followUpAt: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></label></div>
    <label>{t("Assigned staff")}<select value={draft.assignedTo ?? ""} onChange={(event) => setDraft({ ...draft, assignedTo: event.target.value })}><option value="">—</option>
      {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <label>{t("Staff notes")}<textarea maxLength={2000} value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    <button disabled={busy}>{t("Save lead")}</button>
  </form>;
}
